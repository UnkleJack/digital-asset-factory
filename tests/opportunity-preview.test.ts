import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { buildServer } from '../src/server/app.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { tempDir } from './helpers.ts';

// Sample-page previews on Research & opportunities: made offline on request, kept, labelled as samples.

const PORT = 4395;
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
  await app.close();
});

const call = (method: string, url: string, body?: unknown) => {
  const h: Record<string, string> = { ...H };
  if (body === undefined) delete h['content-type'];
  return server.inject({ method: method as 'GET', url, headers: h, payload: body === undefined ? undefined : JSON.stringify(body) });
};
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function newIdea(title: string, productType: string): Promise<string> {
  const r = await call('POST', '/api/opportunities', { title, productType, description: 'test idea' });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().id;
}

test('an idea has no preview until asked; making one draws a stored PNG offline with no AI call', async () => {
  const id = await newIdea('Kids Weekly Planner with Sticker Spaces', 'weekly-planner');
  const before = (await call('GET', `/api/opportunities/${id}`)).json().opportunity;
  assert.equal(before.preview, null, 'nothing is drawn automatically');
  assert.equal(before.previewBlocker, null);
  assert.equal((await call('GET', `/api/opportunities/${id}/preview.png`)).statusCode, 404);

  const made = await call('POST', `/api/opportunities/${id}/preview`, {});
  assert.equal(made.statusCode, 200, made.body);
  const info = made.json();
  assert.equal(info.kind, 'offline_sample');
  assert.equal(info.stale, false);
  assert.equal(info.pages.length, 2, 'the cover and the first inside page');
  assert.equal(info.url, info.pages[1], 'the inside page is the at-a-glance picture');
  assert.match(info.pages[0], new RegExp(`^/api/opportunities/${id}/preview\\.png\\?page=1&v=`));

  const shots = [];
  for (const url of info.pages) {
    const png = await call('GET', url);
    assert.equal(png.statusCode, 200);
    assert.equal(png.headers['content-type'], 'image/png');
    assert.ok(png.rawPayload.subarray(0, 4).equals(PNG_SIGNATURE), 'a real PNG');
    assert.ok(png.rawPayload.length > 2000, 'not an empty picture');
    shots.push(png.rawPayload);
  }
  assert.ok(!shots[0].equals(shots[1]), 'two different pages');
  assert.equal(app.db.value<number>('SELECT count(*) FROM generation_runs'), 0, 'no AI provider was called');
});

test('a stored preview is reused (not redrawn) and the list shows it', async () => {
  const id = await newIdea('Teacher Gratitude Habit Tracker', 'habit-tracker');
  const info = (await call('POST', `/api/opportunities/${id}/preview`, {})).json();
  const file = app.assets.resolve(`research/previews/${id}.png`);
  const mtime = statSync(file).mtimeMs;
  for (let i = 0; i < 3; i++) {
    const list = (await call('GET', '/api/opportunities')).json();
    const row = list.find((o: { id: string }) => o.id === id);
    assert.deepEqual(row.preview, info, 'list carries the same stored preview');
    await call('GET', `/api/opportunities/${id}`);
    await call('GET', info.url);
  }
  assert.equal(statSync(file).mtimeMs, mtime, 'opening the list and the idea never redraws it');
});

test('editing the title marks the preview out of date; remaking clears it', async () => {
  const id = await newIdea('Monthly Bill Budget Planner', 'budget-planner');
  await call('POST', `/api/opportunities/${id}/preview`, {});
  assert.equal((await call('PATCH', `/api/opportunities/${id}`, { status: 'evaluating' })).statusCode, 200);
  assert.equal((await call('GET', `/api/opportunities/${id}`)).json().opportunity.preview.stale, false, 'a status change does not change the picture');
  await call('PATCH', `/api/opportunities/${id}`, { title: 'Monthly Bill and Savings Planner' });
  const stale = (await call('GET', `/api/opportunities/${id}`)).json().opportunity.preview;
  assert.equal(stale.stale, true, 'the old picture is kept but marked out of date');
  const remade = (await call('POST', `/api/opportunities/${id}/preview`, {})).json();
  assert.equal(remade.stale, false);
});

test('procedural art types preview offline; AI-image types say why there is no free sample', async () => {
  const mandala = await newIdea('Calming Mandala Coloring Pages', 'mandala-coloring');
  const m = await call('POST', `/api/opportunities/${mandala}/preview`, {});
  assert.equal(m.statusCode, 200, m.body);

  const illustrated = await newIdea('Cozy Animal Coloring Book', 'illustrated-coloring');
  const detail = (await call('GET', `/api/opportunities/${illustrated}`)).json().opportunity;
  assert.match(detail.previewBlocker, /AI image provider/);
  const r = await call('POST', `/api/opportunities/${illustrated}/preview`, {});
  assert.equal(r.statusCode, 422);
  assert.equal(r.json().error.code, 'preview_unavailable');
  assert.equal(app.db.value<number>('SELECT count(*) FROM generation_runs'), 0, 'still no AI provider called');
});

test('unknown opportunity gives 404 for preview requests', async () => {
  assert.equal((await call('POST', '/api/opportunities/opp_missing/preview', {})).statusCode, 404);
  assert.equal((await call('GET', '/api/opportunities/opp_missing/preview.png')).statusCode, 404);
});
