import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { buildServer } from '../src/server/app.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { MISSIONS, parseGuide } from '../src/engine/arcade/missions.ts';
import { tempDir } from './helpers.ts';

// HAPPY DAFFY missions: one per walkthrough chapter, instructions read from the guide, done marks kept.

const PORT = 4397;
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

async function call(method: string, url: string) {
  const r = await server.inject({ method: method as 'GET', url, headers: { host: HOST, 'x-daf-client': '1' } });
  return { status: r.statusCode, body: r.json() as any };
}

test('missions: every guide chapter has a mission and every mission finds its chapter', async () => {
  const r = await call('GET', '/api/arcade/missions');
  assert.equal(r.status, 200);
  assert.equal(r.body.guideFound, true);
  assert.equal(r.body.missions.length, MISSIONS.length);
  for (const m of r.body.missions) assert.equal(m.hasInstructions, true, `no guide chapter for mission "${m.title}"`);
  // Owner, 2026-11-09: student product types come first, locked until they're built.
  assert.equal(r.body.missions[0].id, 'student-types');
  assert.equal(r.body.missions[0].locked, true);
  assert.equal(r.body.missions.filter((m: any) => m.locked).length, 1);
  // The list sends titles only, never the chapter text.
  assert.equal('text' in r.body.missions[0], false);
  assert.deepEqual(r.body.missions.map((m: any) => m.number), MISSIONS.map((_, i) => i + 1));
});

test('missions: instructions are the chapter text without pictures, links or the next chapter', async () => {
  const r = await call('GET', '/api/arcade/missions/dashboard/instructions');
  assert.equal(r.status, 200);
  assert.equal(r.body.title, 'Dashboard');
  assert.match(r.body.text, /The eight number tiles/);
  assert.doesNotMatch(r.body.text, /!\[/);
  assert.doesNotMatch(r.body.text, /\]\(/);
  assert.doesNotMatch(r.body.text, /Production calendar\n/);
  const arcade = await call('GET', '/api/arcade/missions/happy-daffy/instructions');
  assert.match(arcade.body.text, /THE WORLD BUILDER/);
  assert.doesNotMatch(arcade.body.text, /Things this guide found/);
  assert.equal((await call('GET', '/api/arcade/missions/nope/instructions')).status, 404);
});

test('missions: mark done and undo', async () => {
  assert.equal((await call('PUT', '/api/arcade/missions/library/done')).status, 200);
  assert.equal((await call('PUT', '/api/arcade/missions/library/done')).status, 200);
  let lib = (await call('GET', '/api/arcade/missions')).body.missions.find((m: any) => m.id === 'library');
  assert.equal(lib.done, true);
  assert.ok(lib.completedAt);
  assert.equal((await call('DELETE', '/api/arcade/missions/library/done')).status, 200);
  lib = (await call('GET', '/api/arcade/missions')).body.missions.find((m: any) => m.id === 'library');
  assert.equal(lib.done, false);
  assert.equal((await call('PUT', '/api/arcade/missions/nope/done')).status, 404);
  // A locked mission can't be marked done, and its popup shows the lock note.
  assert.equal((await call('PUT', '/api/arcade/missions/student-types/done')).status, 422);
  const note = await call('GET', '/api/arcade/missions/student-types/instructions');
  assert.match(note.body.text, /NOT BUILT YET/);
  assert.match(note.body.text, /B1/);
  // It's earned: it lists the missions to clear first, and drops each one as it's cleared.
  const needsOf = async () => (await call('GET', '/api/arcade/missions')).body.missions[0].needs as string[];
  assert.deepEqual(await needsOf(), ['Product library', 'Templates']);
  await call('PUT', '/api/arcade/missions/templates/done');
  assert.deepEqual(await needsOf(), ['Product library']);
  await call('DELETE', '/api/arcade/missions/templates/done');
});

test('parseGuide: numbered chapters end at the next heading; Part 2 keeps its sections', () => {
  const c = parseGuide('# Part 1: Back\n\n## 1. One\nA\n![pic](x.png)\nSee [two](#2-two).\n\n---\n\n## 2. Two\nB\n\n# Part 2: HAPPY DAFFY\n## SECTION\nC\n## MORE\nD\n');
  assert.equal(c.get('One'), 'A\nSee two.');
  assert.equal(c.get('Two'), 'B');
  assert.equal(c.get('HAPPY DAFFY'), '## SECTION\nC\n## MORE\nD');
});
