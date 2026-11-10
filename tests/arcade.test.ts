import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { buildServer } from '../src/server/app.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { CHARACTERS, arcadeState, canStart } from '../src/engine/arcade/service.ts';
import { getDraft, INTERRUPTED } from '../src/engine/arcade/drafts.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { addPerformance } from '../src/engine/analytics/service.ts';
import { tempDir } from './helpers.ts';

// Spec milestone 1 acceptance: Start opens Title only when N > 0, zero credits lock Start,
// all three characters are selectable, and test credits are never presented as live data.

const PORT = 4397;
const H = { host: `127.0.0.1:${PORT}`, 'x-daf-client': '1', 'content-type': 'application/json' };
let app: App;
let worker: Worker;
let server: FastifyInstance;

before(async () => {
  app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  worker = createWorker(app, {});
  server = await buildServer({ app, worker, scheduler: null, port: PORT, startedAt: new Date() });
});
after(async () => {
  await server.close();
  await worker.stop();
  await app.close();
});

const get = () => server.inject({ method: 'GET', url: '/api/arcade', headers: { host: H.host } });
const setCredits = (n: number) => server.inject({ method: 'PATCH', url: '/api/settings/arcade', headers: H, payload: JSON.stringify({ testCredits: n }) });

test('three characters: IDE, AI Chatbot, DAF, with no invented stats', () => {
  assert.deepEqual(CHARACTERS.map((c) => c.type), ['IDE', 'AI_CHATBOT', 'DAF']);
  // Persona names picked by the owner on 2026-11-03.
  assert.deepEqual(CHARACTERS.map((c) => c.displayName), ['GAGE', 'B.M.O.', 'SPARKS']);
  assert.ok(CHARACTERS.every((c) => c.bio.length > 0 && c.role.length > 0));
  for (const c of CHARACTERS) {
    assert.ok(c.scope.length > 10, `${c.type} explains what its worlds hold`);
    assert.deepEqual(Object.values(c.stats), [null, null, null, null], 'stats stay blank until the XP rules are approved');
  }
});

test('credits are labelled test data and Start follows N > 0', async () => {
  const s = await arcadeState(app);
  assert.equal(s.credits.source, 'test');
  assert.equal(s.credits.live, false);
  assert.ok(s.credits.value > 0, 'default test credits let the cabinet start');
  assert.equal(canStart(s), true);
  assert.equal(canStart({ ...s, credits: { ...s.credits, value: 0, state: 'zero' } }), false);
});

test('GET /api/arcade: zero credits lock Start, credits come back unlock it', async () => {
  let r = await get();
  assert.equal(r.statusCode, 200);
  let body = r.json();
  assert.equal(body.startAllowed, true);
  assert.equal(body.characters.length, 3);
  assert.deepEqual(body.hiScores, [], 'no made-up high scores');

  assert.equal((await setCredits(0)).statusCode, 200);
  body = (await get()).json();
  assert.equal(body.credits.value, 0);
  assert.equal(body.credits.state, 'zero');
  assert.equal(body.startAllowed, false);

  assert.equal((await setCredits(2)).statusCode, 200);
  body = (await get()).json();
  assert.equal(body.startAllowed, true);
  assert.equal(body.credits.state, 'normal');

  assert.equal((await setCredits(-1)).statusCode, 422, 'negative credits are refused');
});

// Custom portraits: the owner's own image replaces the pixel art; removing it brings the pixel art back.
const PNG_96 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAADcUlEQVR4nO1cwXLFIAhMOv3/X04PmUlT05ddYEEP7PFVATeIq7HZj+PYGp/xNTuA1dEEATRBAE0QQBME0AQBNEEATRBAEwTwPdf9vu9Ms4lyf6/3TZLyCcUB1xH0Ly+k90jfICoIGoYX9Ki1ht2lOrgPRu4o1fivlyTTNdEXONITVEZNjVMxQVegUxbmDO9KoTiXnbvfoJK4Q5NB06kZIIxHQFAwGvi0g2ajqkKlSkx23FPA5yUyxhBBjgie1MC+ji7Pvu5h+gmy+o4rYJ+FaAUIEsR0l4sUq0E+1H/6RkqgiZ08RZrKkUcHrcDOZlQ9Z2PH4mDOIHLMlcooNSSnkl6HnY1OJV8wNoKYyTVFVZs4Mk20rDNplW7k7RzHIdyCXTDUID59Igepn2CyKQxSmUE+ZfTe5WpJGj/zaN9lxzhsDYLx8ekwyLz3kQwNfF6eNnlT4heH/MYKUjOY5VXPhBNFMn1IdiTnB3FfpJ26V88SdjbXUh2BgCD5wgHBcKTiERMUH5uWnRPx8ZMWohkEHWTPhewANDqIkSfQiPU8DEpnibbOLdJkfKe0Y36MePEBECQpH/zm9o7hrw7LZGDvLkIZJKzfTyPXjwWV+AWJU0wi1eAIs2VR31EEmEYQPz2LpfOAziCAJgigCQJoggCmEcSX3oy9Lo/OIIBEgiQaT3Uw6EaIIOFW4GWzOvcoChAkEWnkhnP/i+GvDstkYO8ucmsQ+ejeN6sqLz5oDszgizrmTZ77nom7AYNoBsmHvVoAmKAVDmWeKKvfghpU+RLmROWLpjqhqOKoWFiztyC0b5+ZlpG+QnkpziD+ZgH/0mJozD8DCViCyH0Db+oEpGlo4PPytMmbUl6gOujLSwPdzDNXlQIrbDexkpYPSWKSrq3hZV3iZPLoguSBJ53q24o0L3lgMy1Mm1vT83CuYktxlLr199wG5Z9DRPXwkZiCsUbiySBeE6emUgE7my+DrC59QkZoMLL2938cou7xEwOT7+dcc2wdHO78eRDMeV8E7pLk8xJKgnhRiOZwzs151QLaX15AppT7ugVoksegPA+assm4I+MJ9feDkOXsTcCWTFO2o/6GGfJSMAviGjrPGnY3pUxc8G1TTH2D6C9xAkwg6I97jqyZwmoR7bss+o4iQBME0AQBNEEATRBAEwTQBAE0QQA/UJ8waelu2L4AAAAASUVORK5CYII=', 'base64');

test('custom portrait: set, serve, replace the pixel art, reject non-images, remove', async () => {
  const url = '/api/arcade/characters/ide/portrait';
  const before = (await server.inject({ method: 'GET', url: '/api/arcade', headers: H })).json();
  assert.ok(before.characters.every((c: { portraitUrl: string | null }) => c.portraitUrl === null), 'no portraits at first');

  const put = await server.inject({ method: 'PUT', url, headers: H, payload: { dataBase64: PNG_96.toString('base64') } });
  assert.equal(put.statusCode, 200, put.body);
  const after = (await server.inject({ method: 'GET', url: '/api/arcade', headers: H })).json();
  const ide = after.characters.find((c: { id: string }) => c.id === 'ide');
  assert.match(ide.portraitUrl, /^\/api\/arcade\/characters\/ide\/portrait\?v=\d+$/);
  assert.equal(after.characters.find((c: { id: string }) => c.id === 'daf').portraitUrl, null, 'only the chosen character changes');

  const got = await server.inject({ method: 'GET', url, headers: H });
  assert.equal(got.statusCode, 200);
  assert.equal(got.headers['content-type'], 'image/png');
  assert.ok(got.rawPayload.equals(PNG_96));

  // A text file with an image name is refused: the bytes decide, not the name.
  const bad = await server.inject({ method: 'PUT', url, headers: H, payload: { dataBase64: Buffer.from('this is not an image, only some text pretending').toString('base64') } });
  assert.equal(bad.statusCode, 422);
  assert.equal((await server.inject({ method: 'GET', url, headers: H })).statusCode, 200, 'a refused upload leaves the old portrait');

  const unknown = await server.inject({ method: 'PUT', url: '/api/arcade/characters/nobody/portrait', headers: H, payload: { dataBase64: PNG_96.toString('base64') } });
  assert.equal(unknown.statusCode, 404);

  assert.equal((await server.inject({ method: 'DELETE', url, headers: H })).statusCode, 200);
  assert.equal((await server.inject({ method: 'GET', url, headers: H })).statusCode, 404);
  const gone = (await server.inject({ method: 'GET', url: '/api/arcade', headers: H })).json();
  assert.equal(gone.characters.find((c: { id: string }) => c.id === 'ide').portraitUrl, null);
});

// AI suggestions and AI-written worlds (milestone 2b and 2c). The AI is a stand-in here; no real provider has been tried.
type TextProviderLike = typeof app.providers.text;
async function withStandInAi<T>(answer: (purpose: string, prompt: string) => unknown, run: (seen: { system: string; prompt: string }[]) => Promise<T>): Promise<T> {
  const original = app.providers.text;
  const seen: { system: string; prompt: string }[] = [];
  const standIn = {
    ...original,
    id: 'standin',
    isConfigured: async () => true,
    model: () => 'stand-in-model',
    generateStructured: async (req: { schema: { parse: (x: unknown) => unknown }; system: string; prompt: string }) => {
      seen.push({ system: req.system, prompt: req.prompt });
      return { data: req.schema.parse(answer('', req.prompt)), usage: { inputTokens: 10, outputTokens: 10, images: null }, model: 'stand-in-model', servedByFallback: false };
    },
  } as unknown as TextProviderLike;
  (app as unknown as { providers: { text: TextProviderLike } }).providers = { ...app.providers, text: standIn };
  try {
    return await run(seen);
  } finally {
    (app as unknown as { providers: { text: TextProviderLike } }).providers = { ...app.providers, text: original };
  }
}
const worldCount = async () => ((await server.inject({ method: 'GET', url: '/api/arcade/builder', headers: H })).json() as { worlds: unknown[] }).worlds.length;
const GEN = { goal: 'Launch a mandala coloring shop', milestones: 2, tasksPerMilestone: 2, difficulty: 'balanced' };
const post = (url: string, payload: unknown) => server.inject({ method: 'POST', url, headers: H, payload: payload as Record<string, unknown> });
const getJson = async (url: string) => (await server.inject({ method: 'GET', url, headers: H })).json();
/** Slow AI work runs as a draft in the background; wait until the stand-in has answered. */
async function waitDraft(id: string) {
  for (let i = 0; i < 400; i++) {
    const d = await getJson(`/api/arcade/builder/drafts/${id}`);
    if (d.status !== 'writing') return d;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`draft ${id} never finished`);
}

test('AI generation with no AI provider says so at once, never falls back to the built-in library, and starts no draft', async () => {
  const before = await worldCount();
  for (const [url, payload] of [
    ['/api/arcade/builder/generate', GEN],
    ['/api/arcade/builder/suggest/worlds', {}],
    ['/api/arcade/builder/tidy', { notes: 'some notes' }],
  ] as const) {
    const r = await post(url, payload);
    assert.equal(r.statusCode, 409, r.body);
    assert.match(r.body, /never made from the built-in library/);
  }
  assert.equal(await worldCount(), before, 'nothing was created');
  assert.deepEqual((await getJson('/api/arcade/builder/drafts')).drafts, [], 'no draft waits for an AI that is not there');
});

test('AI generation: a draft that survives leaving the page, follows the settings, and becomes a world only when saved', async () => {
  const task = (title: string, characterId = 'ide') => ({ title, description: 'd', characterId, taskType: 'mandala-coloring', difficulty: 'MEDIUM', estimatedEffort: 3 });
  // The stand-in over-delivers on purpose: 3 milestones with 3 tasks each, tasks given to other characters.
  const wide = { name: 'Mandala shop', description: 'Sell coloring packs.', milestones: [1, 2, 3].map((n) => ({ name: `Stage ${n}`, tasks: [task(`T${n}a`), task(`T${n}b`, 'ai-chatbot'), task(`T${n}c`)] })) };
  await withStandInAi(() => wide, async (seen) => {
    const before = await worldCount();
    const r = await post('/api/arcade/builder/generate', { ...GEN, characterId: 'daf', productTypes: ['mandala-coloring'] });
    assert.equal(r.statusCode, 200, r.body);
    const { draft } = r.json();
    assert.equal(draft.kind, 'world');
    assert.equal(draft.status, 'writing', 'the request returns before the AI answers');

    // The page can be left now: the answer lands on the draft, not on the page.
    const done = await waitDraft(draft.id);
    assert.equal(done.status, 'ready', done.error ?? '');
    assert.equal(done.model, 'stand-in-model');
    const proposal = done.result;
    assert.equal(proposal.milestones.length, 2, 'trimmed to the milestone count asked for');
    assert.ok(proposal.milestones.every((m: { tasks: unknown[] }) => m.tasks.length === 2), 'trimmed to the task count asked for');
    assert.ok(proposal.milestones.flatMap((m: { tasks: { characterId: string }[] }) => m.tasks).every((t: { characterId: string }) => t.characterId === 'daf'), 'every task goes to the chosen character');
    assert.match(seen[0]!.prompt, /Launch a mandala coloring shop/);
    assert.match(seen[0]!.prompt, /- mandala-coloring:/);
    assert.doesNotMatch(seen[0]!.prompt, /- word-search:/, 'only the chosen product types are offered');
    assert.equal(await worldCount(), before, 'a draft alone saves nothing');
    assert.ok((await getJson('/api/arcade/builder/drafts?kind=world')).drafts.some((d: { id: string }) => d.id === draft.id), 'the draft is listed for when the owner comes back');

    const saved = await post('/api/arcade/builder/worlds/from-proposal', { ...proposal, draftId: draft.id });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(await worldCount(), before + 1);
    const visible = (await getJson('/api/arcade/worlds?character=daf')).worlds;
    assert.ok(visible.some((w: { name: string }) => w.name === 'Mandala shop'), 'the character sees the new world');
    assert.equal((await server.inject({ method: 'GET', url: `/api/arcade/builder/drafts/${draft.id}`, headers: H })).statusCode, 404, 'a saved draft leaves the drafts list');
  });

  // One bad task saves nothing at all.
  const before = await worldCount();
  const bad = await server.inject({
    method: 'POST', url: '/api/arcade/builder/worlds/from-proposal', headers: H,
    payload: { name: 'Half made', milestones: [{ name: 'One', tasks: [task('ok'), { ...task('bad'), taskType: 'not-a-type' }] }] },
  });
  assert.equal(bad.statusCode, 422, bad.body);
  assert.equal(await worldCount(), before, 'the whole proposal was rolled back');
});

test('AI generation: an effort budget and the owner\'s finished-task sizes reach the AI; counts become upper limits', async () => {
  const task = (title: string, effort: number) => ({ title, description: 'd', characterId: 'daf', taskType: 'mandala-coloring', difficulty: 'LOW', estimatedEffort: effort });
  const answer = { name: 'Budget world', description: 'Fits a budget.', milestones: [{ name: 'Only stage', tasks: [task('Small one', 4), task('Small two', 6)] }] };
  // One finished task the owner sized at 7 points.
  const w = (await post('/api/arcade/builder/worlds', { name: 'History base', milestones: ['First'] })).json();
  const b = await getJson(`/api/arcade/builder/worlds/${w.id}`);
  const ms = b.milestones[0].id;
  const t = (await post(`/api/arcade/builder/worlds/${w.id}/tasks`, { milestoneId: ms, characterId: 'daf', title: 'Done before', taskType: 'mandala-coloring', difficulty: 'LOW', estimatedEffort: 7 })).json();
  const patched = await server.inject({ method: 'PATCH', url: `/api/arcade/builder/tasks/${t.id}`, headers: H, payload: { status: 'COMPLETE' } });
  assert.equal(patched.statusCode, 200, patched.body);

  await withStandInAi(() => answer, async (seen) => {
    const r = await post('/api/arcade/builder/generate', { ...GEN, milestones: 3, tasksPerMilestone: 4, effortBudget: 10 });
    assert.equal(r.statusCode, 200, r.body);
    const done = await waitDraft(r.json().draft.id);
    assert.equal(done.status, 'ready', done.error ?? '');
    assert.match(seen[0]!.prompt, /budget of about 10 effort points/);
    assert.match(seen[0]!.prompt, /at most 3 milestones/);
    assert.doesNotMatch(seen[0]!.prompt, /Make exactly/, 'with a budget the counts are limits, not exact');
    assert.match(seen[0]!.prompt, /mandala-coloring, LOW: 1 finished, average 7 points/);
    assert.deepEqual(done.result.sizing, { budget: 10, historyTasks: 1 });
    assert.equal(done.result.milestones.length, 1, 'fewer milestones than the limit is fine');

    const off = await post('/api/arcade/builder/generate', { ...GEN, useHistory: false });
    const d2 = await waitDraft(off.json().draft.id);
    assert.doesNotMatch(seen[1]!.prompt, /already finished/, 'history can be switched off');
    assert.match(seen[1]!.prompt, /Make exactly 2 milestones/);
    assert.deepEqual(d2.result.sizing, { budget: null, historyTasks: 0 });
  });
  for (const bad of [0, 501, 2.5]) {
    const r = await post('/api/arcade/builder/generate', { ...GEN, effortBudget: bad });
    assert.equal(r.statusCode, 422, `budget ${bad}: ${r.body}`);
  }
});

test('AI suggestions: world ideas and task ideas, nothing saved', async () => {
  const idea = { name: 'Planner shop', description: 'Printable planners.', milestones: ['Design', 'Launch', 'Promote'] };
  const taskIdea = { title: 'Weekly planner', description: 'd', characterId: 'daf', taskType: 'weekly-planner', difficulty: 'LOW', estimatedEffort: 2 };
  const made = (await server.inject({ method: 'POST', url: '/api/arcade/builder/worlds', headers: H, payload: { name: 'Suggest base', milestones: ['First'] } })).json();
  const before = await worldCount();
  await withStandInAi((_p, prompt) => (/Suggest 5 different worlds/.test(prompt) ? { suggestions: [idea] } : { suggestions: [taskIdea] }), async (seen) => {
    const w = await server.inject({ method: 'POST', url: '/api/arcade/builder/suggest/worlds', headers: H, payload: { hint: 'planners' } });
    assert.equal(w.statusCode, 200, w.body);
    assert.deepEqual(w.json().suggestions, [idea]);
    assert.match(seen[0]!.prompt, /leaning toward: planners/);
    assert.match(seen[0]!.prompt, /Suggest base/, 'existing world names are passed so ideas do not repeat');

    const t = await server.inject({ method: 'POST', url: '/api/arcade/builder/suggest/tasks', headers: H, payload: { worldId: made.id } });
    assert.equal(t.statusCode, 200, t.body);
    assert.equal(t.json().suggestions[0].title, 'Weekly planner');

    const missing = await server.inject({ method: 'POST', url: '/api/arcade/builder/suggest/tasks', headers: H, payload: { worldId: 'wld_nope' } });
    assert.equal(missing.statusCode, 404);
  });
  assert.equal(await worldCount(), before, 'suggestions are not saved');
});

// ---------- Drafts (owner request, 2026-11-05: leaving the page must not lose the AI's work) ----------

test('drafts: a failed AI call is kept with its reason, discard removes it, and a draft is never a world', async () => {
  await withStandInAi(() => { throw new Error('stand-in AI is down'); }, async () => {
    const before = await worldCount();
    const r = await post('/api/arcade/builder/generate', GEN);
    assert.equal(r.statusCode, 200, r.body);
    const done = await waitDraft(r.json().draft.id);
    assert.equal(done.status, 'failed');
    assert.match(done.error, /stand-in AI is down/);
    assert.equal(await worldCount(), before, 'a failed draft creates nothing');

    const url = `/api/arcade/builder/drafts/${done.id}`;
    assert.equal((await server.inject({ method: 'DELETE', url, headers: H })).statusCode, 200);
    assert.equal((await server.inject({ method: 'GET', url, headers: H })).statusCode, 404);
    assert.equal((await server.inject({ method: 'DELETE', url, headers: H })).statusCode, 404);
  });
});

test('drafts: one still writing when the app stopped is marked failed, not left waiting forever', async () => {
  const dir = tempDir();
  const first = bootstrap({ dataDir: dir, secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  const now = new Date().toISOString();
  first.db.insert('world_drafts', { id: 'wdr_cut_off', kind: 'world', status: 'writing', request: '{}', created_at: now, updated_at: now });
  await first.close();
  const second = bootstrap({ dataDir: dir, secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  try {
    const d = getDraft(second, 'wdr_cut_off');
    assert.equal(d.status, 'failed');
    assert.equal(d.error, INTERRUPTED);
  } finally {
    await second.close();
  }
});

// ---------- TIDY MY NOTES ----------

test('tidy my notes: the same ideas in a fixed structure, questions kept apart, nothing invented, stored as a draft', async () => {
  const tidy = {
    title: 'Teacher planners', goal: 'Sell planners to teachers.', scope: ['Weekly planner'],
    milestones: [{ name: 'First pack', tasks: [{ title: 'Weekly planner', characterId: 'daf', taskType: 'weekly-planner' }] }],
    constraints: ['No dated pages'], doneWhen: ['Listed on Etsy'], questions: ['Which grade levels?'],
  };
  const notes = 'ok so teachers... planners, maybe weekly? NO dated pages!! put it on etsy';
  await withStandInAi(() => tidy, async (seen) => {
    const r = await post('/api/arcade/builder/tidy', { notes });
    assert.equal(r.statusCode, 200, r.body);
    const done = await waitDraft(r.json().draft.id);
    assert.equal(done.kind, 'notes');
    assert.equal(done.status, 'ready', done.error ?? '');
    assert.deepEqual(done.request, { notes }, 'the original notes are kept as written');
    assert.deepEqual(done.result.questions, ['Which grade levels?'], 'unclear things come back as questions');
    assert.equal(done.result.milestones[0].tasks[0].taskType, 'weekly-planner');
    const call = seen.at(-1)!;
    assert.match(call.prompt, /NO dated pages!!/, 'the notes go to the AI unchanged');
    assert.match(call.system, /Do not add numbers, dates, prices/);
    assert.match(call.system, /do not guess or decide/);
    const listed = await getJson('/api/arcade/builder/drafts?kind=notes');
    assert.ok(listed.drafts.some((d: { id: string }) => d.id === done.id));
    assert.ok(!(await getJson('/api/arcade/builder/drafts?kind=world')).drafts.some((d: { id: string }) => d.id === done.id), 'notes drafts are not world drafts');
  });
  assert.equal((await post('/api/arcade/builder/tidy', { notes: '   ' })).statusCode, 422);
});

// ---------- Suggestions that know what the factory already has ----------

test('AI suggestions can build on what exists or look for unexplored ground, from real facts only', async () => {
  const { product } = createProduct(app, { productType: 'word-search', title: 'Spooky word search' });
  const idea = { name: 'Next idea', description: 'd', milestones: ['One', 'Two', 'Three'] };
  await withStandInAi(() => ({ suggestions: [idea] }), async (seen) => {
    const b = await post('/api/arcade/builder/suggest/worlds', { mode: 'build-on' });
    assert.equal(b.statusCode, 200, b.body);
    const buildOn = seen.at(-1)!.prompt;
    assert.match(buildOn, /build on what the owner already has/);
    assert.match(buildOn, /Mandala shop/, 'existing worlds are described');
    assert.match(buildOn, /No sales are recorded/, 'with no sales recorded, the AI is told not to claim any');

    const u = await post('/api/arcade/builder/suggest/worlds', { mode: 'unexplored' });
    assert.equal(u.statusCode, 200, u.body);
    const unexplored = seen.at(-1)!.prompt;
    const never = unexplored.split('Product types never used')[1]!.split('\n\n')[0]!;
    assert.doesNotMatch(never, /- word-search /, 'a type with a product is not unexplored');
    assert.doesNotMatch(never, /- mandala-coloring /, 'a type with world tasks is not unexplored');
    assert.match(never, /- invoice-template /, 'a type never touched is unexplored');

    addPerformance(app, { productId: product.id, metric: 'orders', value: 4, periodStart: '2026-10-01', periodEnd: '2026-10-31', sourceKind: 'manual_entry' });
    await post('/api/arcade/builder/suggest/worlds', { mode: 'unexplored' });
    assert.match(seen.at(-1)!.prompt, /word-search: 4 orders \(manual_entry\)/, 'recorded sales are passed with their source');
  });
  assert.equal((await post('/api/arcade/builder/suggest/worlds', { mode: 'sideways' })).statusCode, 422);
});

// ---------- Stats ticker on the hub ----------

test('stats ticker: every stat listed once, the owner picks and orders them, unknown ids ignored, NO DATA instead of invented numbers, sources kept apart', async () => {
  const cat = await getJson('/api/arcade/ticker/catalog');
  const ids = cat.stats.map((s: { id: string }) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'no stat is listed twice');
  assert.equal(cat.chosen.length, 8, 'every default stat exists');
  assert.ok(cat.chosen.every((id: string) => ids.includes(id)));
  assert.ok(cat.stats.every((s: { help: string }) => s.help.length > 10), 'each stat says what it means');

  const pick = ['arcade.worlds', 'not.a.stat', 'sales.refunds.manual_entry', 'sales.refunds.marketplace_api', 'sales.refunds.estimate', 'listings.published.etsy', 'arcade.openTasks', 'arcade.credits'];
  assert.equal((await server.inject({ method: 'PATCH', url: '/api/settings/arcade', headers: H, payload: JSON.stringify({ tickerStats: pick }) })).statusCode, 200);

  const { product } = createProduct(app, { productType: 'habit-tracker', title: 'Ticker test tracker' });
  addPerformance(app, { productId: product.id, metric: 'refunds', value: 2, periodStart: '2026-10-01', periodEnd: '2026-10-31', sourceKind: 'manual_entry' });
  addPerformance(app, { productId: product.id, metric: 'refunds', value: 5, periodStart: '2026-10-01', periodEnd: '2026-10-31', sourceKind: 'estimate' });

  const items = (await getJson('/api/arcade/ticker?character=daf')).items as { id: string; value: number | null; note?: string; test?: boolean }[];
  assert.deepEqual(items.map((i) => i.id), pick.filter((id) => id !== 'not.a.stat'), 'chosen order kept, unknown id dropped');
  const v = (id: string) => items.find((i) => i.id === id)!;
  assert.ok((v('arcade.worlds').value ?? 0) >= 1);
  assert.equal(v('sales.refunds.manual_entry').value, 2);
  assert.equal(v('sales.refunds.estimate').value, 5, 'estimates are their own stat');
  assert.equal(v('sales.refunds.estimate').note, 'estimate');
  assert.equal(v('sales.refunds.marketplace_api').value, null, 'nothing from the shop is NO DATA, not 0');
  assert.equal(v('listings.published.etsy').value, null, 'no recorded Etsy listings is NO DATA, not 0');
  assert.ok((v('arcade.openTasks').value ?? 0) >= 1, 'SPARKS has open tasks in the saved world');
  assert.equal(v('arcade.credits').test, true, 'test credits are marked as test');

  const noPlayer = (await getJson('/api/arcade/ticker')).items as { id: string; value: number | null; note?: string }[];
  assert.equal(noPlayer.find((i) => i.id === 'arcade.openTasks')!.value, null);
  assert.equal(noPlayer.find((i) => i.id === 'arcade.openTasks')!.note, 'pick a character');
});
