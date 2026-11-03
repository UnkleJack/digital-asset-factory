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
  // Persona names picked by the owner on 2026-11-03.
  assert.deepEqual(CHARACTERS.map((c) => c.displayName), ['GAGE', 'B.M.O.', 'SPARKS']);
  assert.ok(CHARACTERS.every((c) => c.bio.length > 0 && c.role.length > 0));
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
