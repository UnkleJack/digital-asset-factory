import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { learningBrief } from '../src/engine/generation/learning.ts';
import { tempDir } from './helpers.ts';

function addProduct(app: ReturnType<typeof bootstrap>, id: string, type: string, title: string): void {
  const now = new Date().toISOString();
  const dsn = app.db.value<string>('SELECT id FROM design_systems LIMIT 1');
  app.db.run("INSERT INTO products (id, slug, title, product_type, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)", id, `slug-${id}`, title, type, now, now);
  app.db.run('INSERT INTO product_specs (id, product_id, product_type, params, design_system_id, paper, seed, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)', `spc_${id}`, id, type, '{}', dsn, '{}', now);
  app.db.run("INSERT INTO product_versions (id, product_id, version_no, spec_id, origin, change_note, revision_notes, stage, status, qa_status, created_at, updated_at) VALUES (?, ?, 1, ?, 'initial', '', '', 'ready', 'ready', 'passed', ?, ?)", `ver_${id}`, id, `spc_${id}`, now, now);
}

let decisionSeq = 0;
function decide(app: ReturnType<typeof bootstrap>, id: string, decision: string, notes: string, invalidated = false): void {
  decisionSeq += 1;
  app.db.run(
    'INSERT INTO approval_decisions (id, version_id, decision, notes, decided_by, decided_at, invalidated_at, invalidated_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    `apd_${decisionSeq}_${id}`, `ver_${id}`, decision, notes, 'user', new Date().toISOString(), invalidated ? new Date().toISOString() : null, invalidated ? 'Version rejected' : null,
  );
}

test('learningBrief is empty when no decisions carry notes', () => {
  const app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  assert.equal(learningBrief(app), '');
  app.db.close();
});

test('learningBrief formats approve/reject/revision reasons as operator preferences', () => {
  const app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  addProduct(app, 'prd_a', 'habit-tracker', 'Habit Tracker');
  addProduct(app, 'prd_b', 'guided-journal', 'Guided Journal');
  decide(app, 'prd_a', 'rejected', 'too much text on each page, feels crowded');
  decide(app, 'prd_b', 'approved', 'nice short prompts, keep this style');
  const brief = learningBrief(app);
  assert.match(brief, /REJECTED "Habit Tracker" \(habit-tracker\): too much text on each page/);
  assert.match(brief, /APPROVED "Guided Journal" \(guided-journal\): nice short prompts/);
  assert.match(brief, /avoid what was rejected or criticized/);
  app.db.close();
});

test('learningBrief ignores invalidated approvals and dedupes per version', () => {
  const app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  addProduct(app, 'prd_c', 'word-search', 'Word Search');
  decide(app, 'prd_c', 'approved', 'liked it', true);
  decide(app, 'prd_c', 'approved', 'liked it', true); // duplicate row for a second marketplace
  decide(app, 'prd_c', 'rejected', 'actually the grid was too dense');
  const brief = learningBrief(app);
  assert.doesNotMatch(brief, /liked it/);
  assert.match(brief, /REJECTED "Word Search"/);
  assert.equal([...brief.matchAll(/Word Search/g)].length, 1);
  app.db.close();
});

test('structuredCall appends the learning brief to the system prompt', async () => {
  const app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  addProduct(app, 'prd_d', 'todo-checklist', 'Moving Checklist');
  decide(app, 'prd_d', 'revision_requested', 'use a friendlier tone in the checklist items');
  const seen: string[] = [];
  const original = app.providers.text;
  (app as unknown as { providers: { text: typeof original } }).providers = {
    ...original,
    text: {
      ...original,
      isConfigured: async () => true,
      model: () => 'test-model',
      generateStructured: async (req: { system: string }) => {
        seen.push(req.system);
        throw new Error('stop here');
      },
    } as typeof original,
  };
  await assert.rejects(
    (async () => {
      const { structuredCall } = await import('../src/engine/generation/service.ts');
      return structuredCall(app, { purpose: 'test', schema: (await import('zod')).z.object({}), system: 'base system', prompt: 'p', trace: {} });
    })(),
  );
  assert.equal(seen.length >= 1, true);
  assert.match(seen[0], /base system/);
  assert.match(seen[0], /REVISION ASKED "Moving Checklist"/);
  app.db.close();
});
