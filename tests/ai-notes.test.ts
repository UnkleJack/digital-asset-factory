// Notes for the AI: every note in one list, the AI's read-through into repeat problems (with a stand-in AI,
// no real provider), owner edits that the read-through keeps, and the lessons going into every prompt.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { learningBrief } from '../src/engine/generation/learning.ts';
import { allNotes, addReviewNote, addLesson, updateLesson, listLessons, digestNotes, maybeDigest, notesStatus, DIGEST_EVERY } from '../src/engine/generation/notes.ts';
import { reworkList } from '../src/engine/approval/rework.ts';
import { tempDir } from './helpers.ts';

let app: App;
beforeEach(() => { app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false }); });
afterEach(async () => { await app.close(); });

let seq = 0;
function product(id: string, title: string): string {
  const now = new Date().toISOString();
  const dsn = app.db.value<string>('SELECT id FROM design_systems LIMIT 1');
  app.db.run("INSERT INTO products (id, slug, title, product_type, status, created_at, updated_at) VALUES (?, ?, ?, 'habit-tracker', 'active', ?, ?)", id, `slug-${id}`, title, now, now);
  app.db.run("INSERT INTO product_specs (id, product_id, product_type, params, design_system_id, paper, seed, created_at) VALUES (?, ?, 'habit-tracker', '{}', ?, '{}', 1, ?)", `spc_${id}`, id, dsn, now);
  app.db.run("INSERT INTO product_versions (id, product_id, version_no, spec_id, origin, change_note, revision_notes, stage, status, qa_status, created_at, updated_at) VALUES (?, ?, 1, ?, 'initial', '', '', 'ready', 'rejected', 'passed', ?, ?)", `ver_${id}`, id, `spc_${id}`, now, now);
  app.db.run('UPDATE products SET current_version_id = ? WHERE id = ?', `ver_${id}`, id);
  return `ver_${id}`;
}
function decision(versionId: string, decision: string, notes: string, marketplace: string | null = null, at = new Date(Date.now() + seq * 1000).toISOString()): void {
  seq += 1;
  app.db.run('INSERT INTO approval_decisions (id, version_id, decision, marketplace, notes, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)', `apd_${seq}`, versionId, decision, marketplace, notes, 'user', at);
}

type TextProviderLike = typeof app.providers.text;
function standInAi(answer: (prompt: string) => unknown): { system: string; prompt: string }[] {
  const seen: { system: string; prompt: string }[] = [];
  const standIn = {
    ...app.providers.text,
    id: 'standin',
    isConfigured: async () => true,
    model: () => 'stand-in-model',
    generateStructured: async (req: { schema: { parse: (x: unknown) => unknown }; system: string; prompt: string }) => {
      seen.push({ system: req.system, prompt: req.prompt });
      return { data: req.schema.parse(answer(req.prompt)), usage: { inputTokens: 10, outputTokens: 10, images: null }, model: 'stand-in-model', servedByFallback: false };
    },
  } as unknown as TextProviderLike;
  (app as unknown as { providers: { text: TextProviderLike } }).providers = { ...app.providers, text: standIn };
  return seen;
}

test('every kind of note lands in one list, newest first, with multi-marketplace approvals counted once', () => {
  const a = product('a', 'Pumpkin tracker');
  const b = product('b', 'Snow planner');
  decision(a, 'rejected', 'too much text on page 2');
  decision(b, 'approved', 'love the fonts', 'etsy');
  decision(b, 'approved', 'love the fonts', 'gumroad');
  decision(b, 'regenerate_requested', '');
  app.db.run("INSERT INTO audit_events (id, at, actor, action, entity_type, entity_id, details) VALUES ('aud_x', ?, 'user', 'approval.warnings_accepted', 'version', ?, ?)",
    new Date(Date.now() + 60_000).toISOString(), b, JSON.stringify({ warnings: [{ check: 'image_quality', message: 'Art is 210 dpi' }], notes: 'fine for a tracker' }));
  addReviewNote(app, a, 'the header font clashes with the body');
  const all = allNotes(app);
  assert.equal(all.total, 4, 'empty notes are skipped and the two approval rows count once');
  assert.deepEqual(all.rows.map((n) => n.kind).sort(), ['approved', 'note', 'rejected', 'warnings_accepted']);
  assert.deepEqual(allNotes(app, { kind: 'warnings_accepted' }).rows[0].warnings, ['Art is 210 dpi']);
  assert.equal(allNotes(app, { kind: 'note' }).rows[0].notes, 'the header font clashes with the body');
  assert.throws(() => addReviewNote(app, a, ' '), /few words/);
  assert.equal(reworkList(app).yours.find((i) => i.versionId === a)!.myNotes.length, 1, 'Rework shows the added note');
});

test('reading the notes needs an AI key; with one, the repeat problems replace the old AI list but keep yours', async () => {
  const a = product('a', 'Pumpkin tracker');
  decision(a, 'rejected', 'too crowded');
  await assert.rejects(digestNotes(app, 'manual'), /needs an AI provider key/);

  const mine = addLesson(app, 'Always leave a wide margin for binding');
  const seen = standInAi(() => ({ lessons: [{ text: 'Keep pages uncluttered: fewer items per page', times: 3 }] }));
  const r = await digestNotes(app, 'manual');
  assert.equal(r.notesRead, 1);
  assert.match(seen[0].prompt, /REJECTED "Pumpkin tracker"/);
  assert.match(seen[0].prompt, /Always leave a wide margin/, 'the AI is told about your own lessons so it does not repeat them');
  assert.doesNotMatch(seen[0].system, /Standing rules from the owner/, 'the read-through does not get the lessons injected twice');
  assert.deepEqual(listLessons(app).map((l) => l.text).sort(), ['Always leave a wide margin for binding', 'Keep pages uncluttered: fewer items per page']);

  // Pin one AI lesson, edit nothing else; the next read-through replaces only unpinned AI lessons.
  const ai = listLessons(app).find((l) => l.source === 'ai')!;
  updateLesson(app, ai.id, { pinned: true });
  standInAi(() => ({ lessons: [{ text: 'Use friendlier wording in checklists', times: 2 }] }));
  await digestNotes(app, 'manual');
  assert.deepEqual(listLessons(app).map((l) => l.text).sort(), ['Always leave a wide margin for binding', 'Keep pages uncluttered: fewer items per page', 'Use friendlier wording in checklists']);
  // Editing an AI lesson makes it yours.
  const edited = updateLesson(app, listLessons(app).find((l) => l.text.startsWith('Use friendlier'))!.id, { text: 'Use warm, friendly wording in checklists' });
  assert.equal(edited.source, 'user');
  assert.equal(mine.source, 'user');
});

test('the lessons go into every AI prompt, ahead of the recent notes', () => {
  const a = product('a', 'Pumpkin tracker');
  decision(a, 'rejected', 'too crowded');
  assert.doesNotMatch(learningBrief(app), /Standing rules/);
  addLesson(app, 'Keep pages uncluttered');
  const brief = learningBrief(app);
  assert.match(brief, /Standing rules from the owner's review notes\n.*\n- Keep pages uncluttered/);
  assert.ok(brief.indexOf('Standing rules') < brief.indexOf('REJECTED "Pumpkin tracker"'));
});

test(`the AI reads the notes by itself once ${DIGEST_EVERY} new ones have piled up`, async () => {
  const v = product('a', 'Pumpkin tracker');
  let calls = 0;
  standInAi(() => { calls++; return { lessons: [{ text: 'Keep pages uncluttered', times: 4 }] }; });
  for (let i = 0; i < DIGEST_EVERY - 1; i++) addReviewNote(app, v, `note number ${i}`);
  await maybeDigest(app);
  assert.equal(calls, 0, 'not yet');
  assert.equal((await notesStatus(app)).newSinceLastRead, DIGEST_EVERY - 1);
  addReviewNote(app, v, 'one more');
  await maybeDigest(app);
  assert.equal(calls, 1);
  const st = await notesStatus(app);
  assert.equal(st.newSinceLastRead, 0);
  assert.equal(st.lastRead?.by, 'auto');
  await maybeDigest(app);
  assert.equal(calls, 1, 'no new notes, no new read');
});
