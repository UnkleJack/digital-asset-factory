// Reason boxes (Reject, Return for revision, Regenerate, Rework notes, lessons) refuse keyboard-mash and
// non-answers. The AI judges first; the built-in check takes over when no AI is set up or the call fails.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { buildServer } from '../src/server/app.ts';
import { checkReason, looksLikeWords } from '../src/engine/approval/reasonCheck.ts';
import { tempDir } from './helpers.ts';

let app: App;
beforeEach(() => { app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false }); });
afterEach(async () => { await app.close(); });

type TextProviderLike = typeof app.providers.text;
function standInAi(answer: (prompt: string) => unknown): string[] {
  const prompts: string[] = [];
  const standIn = {
    ...app.providers.text,
    id: 'standin',
    isConfigured: async () => true,
    model: () => 'stand-in-model',
    generateStructured: async (req: { schema: { parse: (x: unknown) => unknown }; prompt: string }) => {
      prompts.push(req.prompt);
      const a = answer(req.prompt);
      if (a instanceof Error) throw a;
      return { data: req.schema.parse(a), usage: { inputTokens: 10, outputTokens: 10, images: null }, model: 'stand-in-model', servedByFallback: false };
    },
  } as unknown as TextProviderLike;
  (app as unknown as { providers: { text: TextProviderLike } }).providers = { ...app.providers, text: standIn };
  return prompts;
}

test('built-in check: keyboard-mash fails, short real reasons pass', () => {
  for (const junk of ['sdfbsdhrstjn', 'asdf', 'asdfasdf qwerty', 'jjjjjjj', 'dfgjkbhl xcvbn', 'hjkl hjkl hjkl', '!!!!', '123456', 'blah blah blah', 'zzzz zzz']) {
    assert.equal(looksLikeWords(junk), false, `should fail: ${junk}`);
  }
  for (const real of ['too blurry', 'text too small', 'wrong month on page 3', 'colors clash', 'ugly', 'the header font clashes with the body', 'Margins are crooked, redo the grid', 'cramped layout', 'la fuente es muy pequeña']) {
    assert.equal(looksLikeWords(real), true, `should pass: ${real}`);
  }
});

test('with an AI: unintelligible or unusable notes are refused with its tip; good ones pass', async () => {
  const prompts = standInAi((p) => p.includes('looks fine to me whatever')
    ? { intelligible: true, usable: false, tip: 'Say what is wrong, e.g. "the grid lines are too faint".' }
    : { intelligible: true, usable: true, tip: '' });
  const bad = await checkReason(app, 'looks fine to me whatever', 'rejected', { title: 'Pumpkin tracker' });
  assert.equal(bad.ok, false);
  assert.equal(bad.checkedBy, 'ai');
  assert.match(bad.message, /doesn't say what's wrong.*grid lines/);
  const good = await checkReason(app, 'too blurry', 'rejected');
  assert.deepEqual(good, { ok: true, message: '', checkedBy: 'ai' });
  assert.match(prompts[0], /Pumpkin tracker/);
});

test('AI unreachable: falls back to the built-in check', async () => {
  standInAi(() => new Error('network down'));
  assert.equal((await checkReason(app, 'sdfbsdhrstjn', 'rejected')).ok, false);
  const ok = await checkReason(app, 'too blurry', 'rejected');
  assert.equal(ok.ok, true);
  assert.equal(ok.checkedBy, 'built-in');
});

test('no AI configured: the built-in check decides', async () => {
  const r = await checkReason(app, 'sdfbsdhrstjn', 'revision_requested');
  assert.equal(r.checkedBy, 'built-in');
  assert.equal(r.ok, false);
  assert.match(r.message, /actual reason/);
});

test('routes: a gibberish reason is refused and nothing is saved', async () => {
  const server: FastifyInstance = await buildServer({ app, worker: null as never, scheduler: null, port: 4398, startedAt: new Date() });
  try {
    const H = { host: '127.0.0.1:4398', 'x-daf-client': '1', 'content-type': 'application/json' };
    const r1 = await server.inject({ method: 'POST', url: '/api/ai-lessons', headers: H, payload: JSON.stringify({ text: 'sdfbsdhrstjn' }) });
    assert.equal(r1.statusCode, 422);
    assert.match(r1.body, /actual reason/);
    assert.equal(app.db.value('SELECT count(*) FROM note_lessons'), 0);
    const r2 = await server.inject({ method: 'POST', url: '/api/ai-lessons', headers: H, payload: JSON.stringify({ text: 'Keep pages uncluttered' }) });
    assert.equal(r2.statusCode, 200);
    // A decision with a junk reason is refused before the item is even looked up.
    const r3 = await server.inject({ method: 'POST', url: '/api/batch-items/nope/decision', headers: H, payload: JSON.stringify({ decision: 'rejected', notes: 'asdfgh jkl' }) });
    assert.equal(r3.statusCode, 422);
    const r4 = await server.inject({ method: 'POST', url: '/api/rework/nope/note', headers: H, payload: JSON.stringify({ notes: 'qwerty qwerty' }) });
    assert.equal(r4.statusCode, 422);
  } finally {
    await server.close();
  }
});
