import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { buildServer } from '../src/server/app.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { tempDir } from './helpers.ts';

// Spec milestone 2 acceptance: a character only sees worlds with actual open tasks, cannot enter
// an ineligible world, worlds sort with the least remaining work first, and counts and progress
// update when task states change.

const PORT = 4396;
const HOST = `127.0.0.1:${PORT}`;
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

async function call(method: string, url: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'x-daf-client': '1' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await server.inject({ method: method as 'GET', url, headers, payload: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.statusCode, body: r.json() as any };
}
async function world(name: string, milestones: string[]) {
  const r = await call('POST', '/api/arcade/builder/worlds', { name, milestones });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const b = await call('GET', `/api/arcade/builder/worlds/${r.body.id}`);
  return { id: r.body.id as string, milestones: b.body.milestones.map((m: { id: string }) => m.id) as string[] };
}
async function task(worldId: string, milestoneId: string, characterId: string, effort: number, title = 'Task', taskType = 'mandala-coloring') {
  const r = await call('POST', `/api/arcade/builder/worlds/${worldId}/tasks`, { milestoneId, characterId, title, taskType, difficulty: 'MEDIUM', estimatedEffort: effort });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.id as string;
}
const worldsOf = async (c: string) => (await call('GET', `/api/arcade/worlds?character=${c}`)).body.worlds as any[];

test('worlds: visibility, entry, ordering and live progress', async () => {
  const empty = await world('Empty lot', ['Groundwork']);
  const big = await world('Mandala empire', ['First pack', 'Second pack']);
  const small = await world('Planner shop', ['Launch']);

  const t1 = await task(big.id, big.milestones[0]!, 'daf', 5, 'Mandala set A');
  const t2 = await task(big.id, big.milestones[0]!, 'daf', 3, 'Mandala set B');
  await task(big.id, big.milestones[1]!, 'daf', 8, 'Mandala set C');
  const t4 = await task(small.id, small.milestones[0]!, 'daf', 4, 'Weekly planner', 'weekly-planner');
  await task(small.id, small.milestones[0]!, 'ide', 2, 'Build a planner tool', 'custom');

  // A world with no tasks is never shown, to anyone.
  let daf = await worldsOf('daf');
  assert.deepEqual(daf.map((w) => w.name), ['Planner shop', 'Mandala empire'], 'least remaining work first: 6 (both characters) < 8');
  assert.ok(!daf.some((w) => w.id === empty.id));
  assert.equal(daf[1].tasksLeft, 3);
  assert.equal(daf[1].nextMilestone.name, 'First pack');
  assert.equal(daf[1].remainingEffort, 8);
  assert.equal(daf[1].progress, 0);

  // Character scope: IDE sees only the world where IDE has a task; AI Chatbot sees nothing.
  assert.deepEqual((await worldsOf('ide')).map((w) => w.name), ['Planner shop']);
  assert.deepEqual(await worldsOf('ai-chatbot'), []);

  // Entering: allowed with open tasks, refused without.
  const detail = await call('GET', `/api/arcade/worlds/${big.id}?character=daf`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.tasks.map((t: any) => t.title), ['Mandala set A', 'Mandala set B', 'Mandala set C']);
  assert.equal((await call('GET', `/api/arcade/worlds/${big.id}?character=ide`)).status, 403, 'IDE has no task there');
  assert.equal((await call('GET', `/api/arcade/worlds/${empty.id}?character=daf`)).status, 403);

  // Progress moves as work is done; finishing a milestone moves on to the next one.
  assert.equal((await call('PATCH', `/api/arcade/builder/tasks/${t1}`, { remainingEffort: 1 })).status, 200);
  daf = await worldsOf('daf');
  assert.deepEqual(daf.map((w) => w.name), ['Mandala empire', 'Planner shop'], 're-sorted: 4 left (1 + 3) < 6');
  const empire = daf.find((w) => w.id === big.id)!;
  assert.equal(empire.remainingEffort, 4);
  assert.equal(empire.progress, 0.5);

  await call('PATCH', `/api/arcade/builder/tasks/${t1}`, { status: 'COMPLETE' });
  await call('PATCH', `/api/arcade/builder/tasks/${t2}`, { status: 'COMPLETE' });
  const after1 = (await worldsOf('daf')).find((w) => w.id === big.id)!;
  assert.equal(after1.nextMilestone.name, 'Second pack');
  assert.equal(after1.tasksLeft, 1);
  assert.equal(after1.remainingEffort, 8);
  const ms = (await call('GET', `/api/arcade/builder/worlds/${big.id}`)).body.milestones;
  assert.equal(ms[0].status, 'completed');

  // Reopening a finished task reopens its milestone and restores its effort.
  await call('PATCH', `/api/arcade/builder/tasks/${t2}`, { status: 'OPEN' });
  const reopened = (await worldsOf('daf')).find((w) => w.id === big.id)!;
  assert.equal(reopened.nextMilestone.name, 'First pack');
  assert.equal(reopened.remainingEffort, 3);

  // When the character's last task in a world is done, the world leaves its list.
  await call('PATCH', `/api/arcade/builder/tasks/${t4}`, { status: 'COMPLETE' });
  assert.ok(!(await worldsOf('daf')).some((w) => w.id === small.id));
  assert.deepEqual((await worldsOf('ide')).map((w) => w.name), ['Planner shop'], 'IDE still has its task there');

  // Archived worlds disappear for everyone.
  await call('PATCH', `/api/arcade/builder/worlds/${small.id}`, { status: 'archived' });
  assert.deepEqual(await worldsOf('ide'), []);
});

test('builder validation: task type, character, milestone and effort', async () => {
  const w = await world('Rules', ['One']);
  const other = await world('Other', ['Elsewhere']);
  const base = { milestoneId: w.milestones[0], characterId: 'daf', title: 'X', taskType: 'mandala-coloring', difficulty: 'LOW', estimatedEffort: 1 };
  assert.equal((await call('POST', `/api/arcade/builder/worlds/${w.id}/tasks`, { ...base, taskType: 'spaceship' })).status, 422);
  assert.equal((await call('POST', `/api/arcade/builder/worlds/${w.id}/tasks`, { ...base, characterId: 'wizard' })).status, 422);
  assert.equal((await call('POST', `/api/arcade/builder/worlds/${w.id}/tasks`, { ...base, milestoneId: other.milestones[0] })).status, 422);
  assert.equal((await call('POST', `/api/arcade/builder/worlds/${w.id}/tasks`, { ...base, estimatedEffort: 0 })).status, 422);
  assert.equal((await call('POST', `/api/arcade/builder/worlds/${w.id}/tasks`, { ...base, taskType: 'custom' })).status, 200, 'custom tasks are allowed');
  assert.equal((await call('POST', '/api/arcade/builder/worlds', { name: '   ' })).status, 422);
  assert.equal((await call('GET', '/api/arcade/worlds?character=wizard')).status, 422);
  const added = await call('POST', `/api/arcade/builder/worlds/${w.id}/milestones`, { name: 'Two' });
  assert.equal(added.status, 200);
  const ms = (await call('GET', `/api/arcade/builder/worlds/${w.id}`)).body.milestones;
  assert.deepEqual(ms.map((m: any) => [m.name, m.sequence]), [['One', 1], ['Two', 2]]);
});
