// Gumroad direct publishing and sales sync, against a local server that answers the way Gumroad's
// API does (shapes taken from Gumroad's own CLI, see src/engine/publishing/gumroad.ts). A live
// run with a real token is still required before the adapter is marked "verified".
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { startPipeline } from '../src/jobs/pipeline.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { createBatch, addToBatch } from '../src/engine/approval/batches.ts';
import { decide } from '../src/engine/approval/service.ts';
import { publishListing } from '../src/engine/publishing/service.ts';
import { GumroadClient, GumroadError, syncGumroadSales, descriptionHtml } from '../src/engine/publishing/gumroad.ts';
import { OutcomeUnknownError } from '../src/engine/publishing/adapters.ts';
import { getListing, getVersion, listingsForVersion } from '../src/db/repos.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { mockServer, type MockServer } from './mockServers.ts';
import { tempDir, idle } from './helpers.ts';

const TOKEN = 'gumroad-test-token-123456';
let app: App;
let worker: Worker;
let srv: MockServer;
let base = '';

function gumroadLike(_body: any, _i: number, path: string) {
  if (path === '/files/presign') return { json: { success: true, upload_id: 'u1', key: 'k1', parts: [{ part_number: 1, presigned_url: `${base}/s3/part1` }] } };
  if (path === '/s3/part1') return { headers: { ETag: '"etag-1"' }, json: {} };
  if (path === '/files/complete') return { json: { success: true, file_url: 'https://files.gumroad.example/abc.pdf' } };
  if (path === '/products') return { json: { success: true, product: { id: 'P1', name: 'x', short_url: 'https://tester.gumroad.com/l/abc' } } };
  if (path === '/products/P1/enable') return { json: { success: true, product: { id: 'P1', published: true } } };
  if (path.startsWith('/sales')) return { json: { success: true, sales: [{ id: 's1', product_id: 'P1', product_name: 'x', price: 499, created_at: '2026-10-21T15:00:00Z', refunded: false }, { id: 's2', product_id: 'OTHER', price: 100, created_at: '2026-10-21T16:00:00Z' }] } };
  if (path === '/user') return { json: { success: true, user: { name: 'Tester' } } };
  return { status: 404, json: { success: false, message: 'not found' } };
}

before(async () => {
  srv = await mockServer(gumroadLike);
  base = srv.url;
  const secrets = new MemorySecretStore();
  await secrets.set('gumroad_token', TOKEN);
  app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false });
  app.settings.update('marketplaces', { gumroad: { apiBaseUrl: srv.url } });
  worker = createWorker(app);
  worker.start();
});

after(async () => {
  await worker.stop();
  await app.close();
  await srv.close();
});

test('Gumroad: publishing is off until opted in, then uploads files, creates and publishes the product; sales sync matches it', async () => {
  const { version } = createProduct(app, { productType: 'habit-tracker', params: { months: 1 } });
  addToBatch(app, createBatch(app, 'Gumroad', 'manual'), version.id);
  startPipeline(app, version.id, { marketplaces: ['gumroad'] });
  await idle(app);
  assert.equal(getVersion(app.db, version.id).status, 'ready', String(getVersion(app.db, version.id).error));
  const listing = listingsForVersion(app.db, version.id)[0];
  const item = app.db.get<{ id: string }>('SELECT id FROM approval_items WHERE version_id = ?', version.id)!;
  decide(app, item.id, { decision: 'approved' });

  await assert.rejects(publishListing(app, listing.id), /direct publishing is off/);
  assert.equal(srv.calls.length, 0, 'nothing is sent before the operator opts in');

  app.settings.update('marketplaces', { gumroad: { autoPublishEnabled: true } });
  const res = await publishListing(app, listing.id);
  assert.equal(res.status, 'published_verified');
  assert.equal(res.externalUrl, 'https://tester.gumroad.com/l/abc');

  const paths = srv.calls.map((c) => c.path);
  const fileCount = listing.file_asset_ids.length;
  assert.equal(paths.filter((p) => p === '/files/presign').length, fileCount, 'every deliverable file is uploaded');
  assert.deepEqual(paths.slice(-2), ['/products', '/products/P1/enable']);
  assert.ok(srv.calls.filter((c) => !c.path.startsWith('/s3')).every((c) => c.headers.authorization === `Bearer ${TOKEN}`));
  const presign = srv.calls.find((c) => c.path === '/files/presign')!;
  assert.match(String(presign.body), /filename=.+&file_size=\d+/);
  const complete = srv.calls.find((c) => c.path === '/files/complete')!.body;
  assert.deepEqual(complete, { upload_id: 'u1', key: 'k1', parts: [{ part_number: 1, etag: 'etag-1' }] });

  const product = srv.calls.find((c) => c.path === '/products')!.body;
  assert.equal(product.name, listing.title);
  assert.equal(product.native_type, 'digital');
  assert.equal(product.price, String(listing.price_cents));
  assert.deepEqual(product.tags, listing.tags);
  assert.equal(product.files.length, fileCount);
  assert.equal(product.files[0].url, 'https://files.gumroad.example/abc.pdf');
  const embeds = product.rich_content[0].description.content.filter((n: any) => n.type === 'fileEmbed');
  assert.deepEqual(embeds.map((n: any) => n.attrs.id), product.files.map((f: any) => f.id), 'each uploaded file is shown on the product page');
  assert.match(product.description, /^<p>/);

  const ext = app.db.get<{ external_id: string; verification: string; state: string }>('SELECT external_id, verification, state FROM external_listings WHERE listing_id = ?', listing.id)!;
  assert.deepEqual({ ...ext }, { external_id: 'P1', verification: 'api_verified', state: 'active' });
  await assert.rejects(publishListing(app, listing.id), /already published/);

  const s1 = await syncGumroadSales(app);
  assert.deepEqual(s1, { seen: 2, imported: 1, unmatched: 1 });
  const obs = app.db.all<{ metric: string; value: number; source_kind: string }>("SELECT metric, value, source_kind FROM performance_observations WHERE marketplace = 'gumroad' ORDER BY metric");
  assert.deepEqual(obs.map((o) => ({ ...o })), [{ metric: 'orders', value: 1, source_kind: 'marketplace_api' }, { metric: 'revenue_cents', value: 499, source_kind: 'marketplace_api' }]);
  assert.equal((await syncGumroadSales(app)).imported, 0, 'a sale is imported once');
  app.settings.update('marketplaces', { gumroad: { autoPublishEnabled: false } });
});

test('Gumroad client: rejected tokens, {success:false}, and timeouts on product creation are reported correctly', async () => {
  const bad = await mockServer((_b, _i, path) => (path === '/user' ? { status: 401, json: { success: false, message: 'The access token is invalid' } } : path === '/products' ? { delayMs: 800, json: {} } : { json: { success: false, message: 'Price is too low' } }));
  try {
    const c = new GumroadClient(async () => TOKEN, () => ({ baseUrl: bad.url, timeoutMs: 300 }));
    await assert.rejects(c.user(), (e: unknown) => e instanceof GumroadError && e.errorClass === 'permanent' && /token was rejected/.test(e.message));
    await assert.rejects(c.enableProduct('P9'), (e: unknown) => e instanceof GumroadError && /Price is too low/.test(e.message));
    await assert.rejects(c.createProduct({ name: 'x', priceCents: 100, currency: 'USD', descriptionHtml: '<p>x</p>', tags: [], files: [] }), (e: unknown) => e instanceof OutcomeUnknownError, 'a timeout while creating may have created it');
    const none = new GumroadClient(async () => null, () => ({ baseUrl: bad.url, timeoutMs: 300 }));
    await assert.rejects(none.user(), /no access token/);
  } finally {
    await bad.close();
  }
  assert.equal(descriptionHtml('Line one\nline two\n\n<b>Para</b> & more'), '<p>Line one<br>line two</p><p>&lt;b&gt;Para&lt;/b&gt; &amp; more</p>');
});

test('Gumroad listing state after a failed publish is visible, not silent', async () => {
  const { version } = createProduct(app, { productType: 'todo-checklist' });
  addToBatch(app, createBatch(app, 'Gumroad fail', 'manual'), version.id);
  startPipeline(app, version.id, { marketplaces: ['gumroad'] });
  await idle(app);
  const listing = listingsForVersion(app.db, version.id)[0];
  decide(app, app.db.get<{ id: string }>('SELECT id FROM approval_items WHERE version_id = ?', version.id)!.id, { decision: 'approved' });
  const down = await mockServer(() => ({ status: 401, json: { success: false, message: 'bad token' } }));
  try {
    app.settings.update('marketplaces', { gumroad: { autoPublishEnabled: true, apiBaseUrl: down.url } });
    await assert.rejects(publishListing(app, listing.id), /token was rejected/);
    assert.equal(getListing(app.db, listing.id).status, 'failed');
  } finally {
    app.settings.update('marketplaces', { gumroad: { autoPublishEnabled: false, apiBaseUrl: srv.url } });
    await down.close();
  }
});
