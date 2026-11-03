import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { buildServer } from '../src/server/app.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { CHARACTERS, arcadeState, canStart } from '../src/engine/arcade/service.ts';
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
  for (const c of CHARACTERS) {
    assert.ok(c.scope.length > 10, `${c.type} explains what its worlds hold`);
    assert.deepEqual(Object.values(c.stats), [null, null, null, null], 'stats stay blank until the XP rules are approved');
  }
});

test('credits are labelled test data and Start follows N > 0', () => {
  const s = arcadeState(app);
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
