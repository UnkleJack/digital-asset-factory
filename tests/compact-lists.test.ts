import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { buildServer } from '../src/server/app.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { tempDir, idle, withReasonAi } from './helpers.ts';

// Compact output lists: true totals for paged lists, the library gallery spread, "made" counts and the Rework page.

const PORT = 4398;
const H = { host: `127.0.0.1:${PORT}`, 'x-daf-client': '1', 'content-type': 'application/json' };
let app: App;
let worker: Worker;
let server: FastifyInstance;
const started = new Date(Date.now() - 60_000).toISOString();

before(async () => {
  app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  worker = createWorker(app, {});
  worker.start();
  server = await buildServer({ app, worker, scheduler: null, port: PORT, startedAt: new Date() });
});
after(async () => {
  await server.close();
  await worker.stop();
  await app.close();
});

const call = (method: string, url: string, body?: unknown) => {
  const h: Record<string, string> = { ...H };
  if (body === undefined) delete h['content-type'];
  return server.inject({ method: method as 'GET', url, headers: h, payload: body === undefined ? undefined : JSON.stringify(body) });
};

test('approved work shows in the gallery, rejected work waits on the Rework page until marked fixed', async () => {
  const a = (await call('POST', '/api/products', { productType: 'word-search', params: { puzzles: 2 }, marketplaces: ['etsy'] })).json();
  const b = (await call('POST', '/api/products', { productType: 'word-search', params: { puzzles: 2 }, marketplaces: ['etsy'] })).json();
  await idle(app);
  const itemOf = async (batchId: string) => (await call('GET', `/api/batches/${batchId}`)).json().items[0];
  const ia = await itemOf(a.batchId);
  const ib = await itemOf(b.batchId);
  assert.equal(ia.version.status, 'ready');
  assert.equal((await call('POST', `/api/batch-items/${ia.item.id}/decision`, { decision: 'approved' })).statusCode, 200);
  assert.equal((await withReasonAi(app, () => call('POST', `/api/batch-items/${ib.item.id}/decision`, { decision: 'rejected', notes: 'too plain' }))).statusCode, 200);

  // Gallery: approved only, grouped by type.
  const spread = (await call('GET', '/api/products/spread?types=5&per=4')).json();
  assert.equal(spread.length, 1);
  assert.equal(spread[0].type, 'word-search');
  assert.equal(spread[0].total, 1);
  assert.deepEqual(spread[0].items.map((p: { id: string }) => p.id), [a.productId]);

  // Rework: the rejected one, with its notes; nothing from the machine.
  let rw = (await call('GET', '/api/rework')).json();
  assert.equal(rw.machine.length, 0);
  assert.equal(rw.yours.length, 1);
  assert.equal(rw.yours[0].productId, b.productId);
  assert.equal(rw.yours[0].reason, 'rejected');
  assert.equal(rw.yours[0].notes, 'too plain');
  assert.equal(rw.yours[0].fixedAt, null);
  assert.equal((await call('GET', '/api/dashboard')).json().counts.rework, 1);

  const vid = rw.yours[0].versionId;
  assert.equal((await call('POST', `/api/rework/${vid}/fixed`, {})).statusCode, 200);
  rw = (await call('GET', '/api/rework')).json();
  assert.equal(rw.yours.length, 0, 'a fixed item leaves the list');
  const all = (await call('GET', '/api/rework?showFixed=1')).json();
  assert.equal(all.yours.length, 1, 'but it can still be shown');
  assert.ok(all.yours[0].fixedAt);
  assert.equal((await call('GET', '/api/dashboard')).json().counts.rework, 0);
  assert.equal((await call('DELETE', `/api/rework/${vid}/fixed`)).statusCode, 200);
  assert.equal((await call('GET', '/api/rework')).json().yours.length, 1, 'Put back returns it');
  assert.equal((await call('POST', '/api/rework/nope/fixed', {})).statusCode, 404);

  // A version that failed in the factory lands in the machine section (set directly here; making a real QA failure is slow).
  app.db.run("UPDATE product_versions SET status = 'qa_failed' WHERE id = ?", ia.version.id);
  rw = (await call('GET', '/api/rework')).json();
  assert.deepEqual(rw.machine.map((x: { versionId: string; reason: string }) => [x.versionId, x.reason]), [[ia.version.id, 'qa_failed']]);
  app.db.run("UPDATE product_versions SET status = 'approved' WHERE id = ?", ia.version.id);

  // Made counts include both versions (one approved, one rejected): they were made before review.
  const counts = (await call('GET', `/api/made-counts?since=${encodeURIComponent(started)},${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`)).json();
  assert.deepEqual(counts, [2, 0]);
  const cal = (await call('GET', `/api/calendar?from=${encodeURIComponent(started)}&to=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`)).json();
  assert.equal(cal.made.length, 2);
});

test('paged lists report their real size so nothing is cut off silently', async () => {
  const jobs = await call('GET', '/api/jobs?limit=1');
  const body = jobs.json();
  assert.equal(body.items.length, 1);
  assert.ok(Number(jobs.headers['x-total-count']) > 1);
  assert.equal(body.total, Number(jobs.headers['x-total-count']));
  const open = (await call('GET', '/api/jobs?open=1')).json();
  assert.ok(open.items.every((j: { status: string }) => ['queued', 'running', 'failed'].includes(j.status)), 'open=1 hides finished jobs');

  const batches = await call('GET', '/api/batches?limit=1');
  assert.ok(Array.isArray(batches.json()), 'batches keep their array shape');
  assert.equal(batches.json().length, 1);
  assert.equal(Number(batches.headers['x-total-count']), 2);
  const openBatches = await call('GET', '/api/batches?open=1');
  assert.ok(openBatches.json().every((b: { status: string }) => b.status !== 'closed'));

  for (const url of ['/api/qa', '/api/listings', '/api/publishing', '/api/opportunities', '/api/observations']) {
    const r = await call('GET', `${url}?limit=1`);
    assert.equal(r.statusCode, 200, url);
    assert.ok(r.headers['x-total-count'] !== undefined, `${url} sends X-Total-Count`);
    assert.ok(r.json().length <= 1, `${url} honours limit`);
  }
});
