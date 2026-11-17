import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { startPipeline } from '../src/jobs/pipeline.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { getVersion } from '../src/db/repos.ts';
import { sampleProduct } from '../src/engine/specification/sample.ts';
import { buildServer } from '../src/server/app.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { tempDir, idle } from './helpers.ts';

/*
 * "Try it first" on New product (engine/specification/sample.ts): a sample drawn from the form's settings
 * before anything is created. For procedural art the sample IS the product's art for that seed.
 */

const PORT = 4398;
const H = { host: `127.0.0.1:${PORT}`, 'x-daf-client': '1', 'content-type': 'application/json' };
let app: App;
let worker: Worker;
let server: FastifyInstance;

before(async () => {
  app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  worker = createWorker(app);
  worker.start();
  server = await buildServer({ app, worker, scheduler: null, port: PORT, startedAt: new Date() });
});
after(async () => {
  await server.close();
  await worker.stop();
  await app.close();
});

const count = (table: string) => app.db.value<number>(`SELECT count(*) FROM ${table}`) ?? 0;

test('a mandala sample shows the first designs, is repeatable per seed, and creates nothing', async () => {
  const input = { productType: 'mandala-coloring', params: { pages: 8, detail: 'simple', symmetry: 8 }, seed: 4242 };
  const a = await sampleProduct(app, input, false);
  assert.equal(a.artIsExact, true);
  assert.equal(a.art.length, 6, 'six designs are shown');
  assert.equal(a.totalArt, 8);
  assert.ok(a.art.every((x) => x.svg.startsWith('<svg')));
  assert.equal((await sampleProduct(app, input, false)).art[0].svg, a.art[0].svg, 'same seed, same design');
  assert.notEqual((await sampleProduct(app, { ...input, seed: 4243 }, false)).art[0].svg, a.art[0].svg, 'a new seed gives new designs');
  assert.equal(count('products'), 0);
  assert.equal(count('jobs'), 0);
});

test('the product made with the previewed seed gets exactly the previewed designs', async () => {
  const params = { pages: 3, detail: 'medium', symmetry: 12, motifSet: 'botanical', cover: false };
  const sample = await sampleProduct(app, { productType: 'mandala-coloring', params, seed: 777 }, false);
  const { version } = createProduct(app, { productType: 'mandala-coloring', params, seed: 777 });
  startPipeline(app, version.id, { marketplaces: ['etsy'] });
  await idle(app, 240_000);
  assert.equal(getVersion(app.db, version.id).status, 'ready');
  const svgs = app.assets.forVersion(version.id).filter((a) => a.kind === 'artwork_svg').sort((x, y) => x.rel_path.localeCompare(y.rel_path));
  assert.equal(svgs.length, 3);
  sample.art.forEach((a, i) => assert.equal(app.assets.read(svgs[i]).toString('utf8'), a.svg, `design ${i + 1} is the one that was previewed`));
});

test('the sample uses the form\'s paper, and the same designs show on any paper unless a line would print too thin', async () => {
  const base = { productType: 'mandala-coloring', params: { pages: 2, detail: 'medium' }, seed: 5 };
  const letter = await sampleProduct(app, { ...base, paper: { size: 'letter' } }, false);
  const a5 = await sampleProduct(app, { ...base, paper: { size: 'a5', orientation: 'landscape' } }, false);
  assert.equal(letter.art.length, 2);
  assert.equal(a5.art.length, 2);
  assert.equal(letter.art[0].svg.slice(0, 40), a5.art[0].svg.slice(0, 40));
  const pages = await sampleProduct(app, { ...base, paper: { size: 'a5', orientation: 'landscape' } }, true);
  assert.equal(pages.pages.length, 2, 'the page preview is drawn on the chosen paper');
});

test('first pages are drawn on request, as picture data', async () => {
  const r = await sampleProduct(app, { productType: 'mandala-coloring', params: { pages: 2 }, seed: 9 }, true);
  assert.equal(r.pages.length, 2);
  assert.ok(r.pages.every((p) => p.startsWith('data:image/png;base64,')));
  const layout = await sampleProduct(app, { productType: 'monthly-calendar', seed: 9 }, true);
  assert.equal(layout.artIsExact, false, 'a calendar has no procedural art, so only the layout is shown');
  assert.equal(layout.art.length, 0);
  assert.ok(layout.pages.length >= 1);
});

test('kinds with no free offline sample say why, and bad settings are refused', async () => {
  await assert.rejects(sampleProduct(app, { productType: 'illustrated-coloring', seed: 1 }, false), /AI image provider/);
  await assert.rejects(sampleProduct(app, { productType: 'mandala-coloring', params: { pages: 999 }, seed: 1 }, false));
  await assert.rejects(sampleProduct(app, { productType: 'mandala-coloring', designSystemId: 'nope', seed: 1 }, false), /design system/i);
});

test('the sample route answers, requires a seed, and the create route accepts the seed', async () => {
  const call = (method: string, url: string, body: unknown) => server.inject({ method: method as 'POST', url, headers: H, payload: JSON.stringify(body) });
  const ok = await call('POST', '/api/products/sample', { productType: 'mandala-coloring', params: { pages: 2 }, seed: 11 });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().art.length, 2);
  assert.equal((await call('POST', '/api/products/sample', { productType: 'mandala-coloring' })).statusCode, 422, 'a seed is required, so the sample is repeatable');
  const made = await call('POST', '/api/products', { productType: 'mandala-coloring', params: { pages: 1, cover: false }, seed: 31337, marketplaces: ['etsy'] });
  assert.equal(made.statusCode, 200);
  assert.equal(app.db.value<number>('SELECT seed FROM product_specs WHERE product_id = ?', made.json().productId), 31337);
  await idle(app, 240_000);
});
