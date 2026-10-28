import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { runProductionPlanJob } from '../src/scheduler/scheduler.ts';
import { buildServer } from '../src/server/app.ts';
import { restoreBackup } from '../src/ops/backup.ts';
import { resolvePaths } from '../src/config/paths.ts';
import { Db } from '../src/db/sqlite.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { tempDir, idle } from './helpers.ts';

const PORT = 4399;
const H = { host: `127.0.0.1:${PORT}`, 'x-daf-client': '1', 'content-type': 'application/json' };
let app: App;
let worker: Worker;
let server: FastifyInstance;
let dataDir: string;

before(async () => {
  dataDir = tempDir();
  app = bootstrap({ dataDir, secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  worker = createWorker(app, { run_production_plan: runProductionPlanJob });
  worker.start();
  server = await buildServer({ app, worker, scheduler: null, port: PORT, startedAt: new Date() });
});
after(async () => {
  await server.close();
  await worker.stop();
  await app.close();
});

const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = H) => {
  const h = { ...headers };
  if (body === undefined) delete h['content-type'];
  return server.inject({ method: method as 'GET', url, headers: h, payload: body === undefined ? undefined : JSON.stringify(body) });
};

test('host and CSRF guards; security headers', async () => {
  assert.equal((await server.inject({ method: 'GET', url: '/api/health', headers: { host: 'evil.example:4399' } })).statusCode, 421, 'DNS-rebinding host rejected');
  const ok = await server.inject({ method: 'GET', url: '/api/health', headers: { host: `127.0.0.1:${PORT}` } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers['x-content-type-options'], 'nosniff');
  assert.equal(ok.headers['x-frame-options'], 'DENY');
  assert.match(String(ok.headers['content-security-policy']), /default-src 'none'/);
  const noHeader = await server.inject({ method: 'POST', url: '/api/opportunities', headers: { host: `127.0.0.1:${PORT}`, 'content-type': 'application/json' }, payload: '{}' });
  assert.equal(noHeader.statusCode, 403, 'mutation without client header rejected');
  const cross = await call('POST', '/api/opportunities', {}, { ...H, origin: 'https://evil.example' });
  assert.equal(cross.statusCode, 403, 'cross-origin mutation rejected');
  assert.equal((await call('GET', '/api/nope')).statusCode, 404);
});

test('validation errors are 422 with field details; not-found is 404', async () => {
  const r = await call('POST', '/api/opportunities', { title: 'x', productType: 'nope' });
  assert.equal(r.statusCode, 422);
  assert.ok(Array.isArray(r.json().error.details));
  assert.equal((await call('GET', '/api/products/prd_missing')).statusCode, 404);
  assert.equal((await call('GET', '/api/assets/..%2F..%2Fetc%2Fpasswd/file')).statusCode, 404);
});

test('secrets are write-only through the API', async () => {
  const put = await call('PUT', '/api/secrets/anthropic_api_key', { value: 'sk-ant-secret-value-abcdef123' });
  assert.equal(put.statusCode, 200);
  for (const url of ['/api/secrets', '/api/settings', '/api/system', '/api/dashboard', '/api/audit', '/api/logs']) {
    const body = (await call('GET', url)).body;
    assert.ok(!body.includes('sk-ant-secret-value'), `${url} leaked the secret`);
  }
  const st = (await call('GET', '/api/secrets')).json();
  assert.equal(st.secrets.find((x: { name: string }) => x.name === 'anthropic_api_key').configured, true);
  assert.equal((await call('PUT', '/api/secrets/not_a_secret', { value: 'abcdefghijk' })).statusCode, 422);
  assert.equal((await call('DELETE', '/api/secrets/anthropic_api_key')).statusCode, 200);
  assert.equal(await app.secrets.get('anthropic_api_key'), null, 'secret really deleted');
  const empty = await server.inject({ method: 'DELETE', url: '/api/secrets/openai_api_key', headers: H });
  assert.equal(empty.statusCode, 200, 'empty JSON body is accepted');
});

test('API-driven lifecycle: create → review → approve → export → record; files served safely', async () => {
  const created = (await call('POST', '/api/products', { productType: 'word-search', params: { puzzles: 2 }, marketplaces: ['etsy'] })).json();
  assert.ok(created.productId && created.batchId);
  await idle(app);
  const batch = (await call('GET', `/api/batches/${created.batchId}`)).json();
  assert.equal(batch.batch.status, 'ready_for_review', JSON.stringify({ v: batch.items[0]?.version?.status, err: batch.items[0]?.version?.error, jobs: app.db.all("SELECT type, status, last_error FROM jobs WHERE version_id = ?", created.versionId) }));
  const item = batch.items[0];
  assert.equal(item.version.status, 'ready');
  const pdf = item.files.find((f: { kind: string }) => f.kind === 'pdf');
  const file = await call('GET', `/api/assets/${pdf.id}/file`);
  assert.equal(file.statusCode, 200);
  assert.equal(file.headers['content-type'], 'application/pdf');
  assert.match(String(file.headers['content-security-policy']), /sandbox/);
  assert.ok(file.rawPayload.subarray(0, 5).toString() === '%PDF-');
  const zip = item.files.find((f: { kind: string }) => f.kind === 'package_zip');
  assert.match(String((await call('GET', `/api/assets/${zip.id}/file`)).headers['content-disposition']), /^attachment/);
  const listing = item.listings[0];
  assert.equal((await call('POST', `/api/listings/${listing.id}/export`, {})).statusCode, 403, 'export before approval is refused');
  assert.equal((await call('POST', `/api/batch-items/${item.item.id}/decision`, { decision: 'approved' })).statusCode, 200);
  const exp = await call('POST', `/api/listings/${listing.id}/export`, {});
  assert.equal(exp.statusCode, 200);
  const pub = await call('POST', `/api/listings/${listing.id}/publish`, {});
  assert.equal(pub.statusCode, 409);
  assert.match(pub.json().error.message, /not available/);
  const rec = await call('POST', `/api/listings/${listing.id}/record`, { externalUrl: 'https://www.etsy.com/listing/42/word-search' });
  assert.equal(rec.json().status, 'published_manual');
  const dash = (await call('GET', '/api/dashboard')).json();
  assert.equal(dash.counts.publishedManual, 1);
  assert.equal(dash.counts.publishedVerified, 0);
  assert.ok(dash.marketplaces.every((m: { directPublishing: boolean }) => m.directPublishing === false), 'no marketplace is claimed as directly publishable');
});

test('backup via API and offline restore round-trip', async () => {
  const before = app.db.value<number>('SELECT count(*) FROM assets')!;
  const b = (await call('POST', '/api/backups', {})).json();
  assert.ok(b.name && b.assets === before);
  const target = tempDir();
  const paths = resolvePaths(target);
  const { cpSync } = await import('node:fs');
  cpSync(join(dataDir, 'backups'), paths.backupsDir, { recursive: true });
  const r = restoreBackup(paths, b.name);
  assert.ok(existsSync(r.previousDataMovedTo));
  const db = new Db(paths.dbFile);
  assert.equal(db.value('SELECT count(*) FROM assets'), before);
  const sample = db.get<{ rel_path: string }>("SELECT rel_path FROM assets WHERE kind = 'pdf' LIMIT 1")!;
  assert.ok(existsSync(join(paths.assetsDir, sample.rel_path)), 'restored files exist');
  db.close();
  assert.throws(() => restoreBackup(paths, '../../etc'), /Unsafe path/);
});

test('hub mode: other computers need the access token; this computer does not; tokens are made locally only', async () => {
  const LAN = { host: `192.168.1.20:${PORT}`, 'x-daf-client': '1', 'content-type': 'application/json' };
  const fromLaptop = (method: string, url: string, headers: Record<string, string> = LAN, payload?: string) => server.inject({ method: method as 'GET', url, headers, payload, remoteAddress: '192.168.1.44' });
  assert.equal((await fromLaptop('GET', '/api/health')).statusCode, 403, 'remote access is off by default');

  const made = await call('POST', '/api/remote/token', {});
  assert.equal(made.statusCode, 200);
  const token = made.json().token as string;
  assert.ok(token.length >= 30);
  assert.equal((await call('PUT', '/api/secrets/remote_access_token', { value: 'x'.repeat(20) })).statusCode, 422, 'not settable through the generic secrets route');
  await call('PATCH', '/api/settings/remote', { enabled: true });

  assert.equal((await fromLaptop('GET', '/api/products')).statusCode, 401);
  const page = await fromLaptop('GET', '/library');
  assert.equal(page.statusCode, 303);
  assert.equal(page.headers.location, '/login');
  assert.equal((await fromLaptop('GET', '/login')).statusCode, 200);
  const bad = await fromLaptop('POST', '/api/login', { host: LAN.host, 'content-type': 'application/x-www-form-urlencoded' }, 'token=wrong');
  assert.equal(bad.statusCode, 401);
  const good = await fromLaptop('POST', '/api/login', { host: LAN.host, 'content-type': 'application/x-www-form-urlencoded', origin: `http://${LAN.host}` }, `token=${encodeURIComponent(token)}`);
  assert.equal(good.statusCode, 303);
  const cookie = String(good.headers['set-cookie']).split(';')[0];
  assert.match(String(good.headers['set-cookie']), /HttpOnly; SameSite=Strict/);
  const withCookie = { ...LAN, cookie };
  assert.equal((await fromLaptop('GET', '/api/products', withCookie)).statusCode, 200, 'signed in');
  assert.equal((await fromLaptop('POST', '/api/packing/break', { ...withCookie, origin: `http://${LAN.host}` }, '{}')).statusCode, 200, 'same-origin writes work');
  assert.equal((await fromLaptop('POST', '/api/packing/break', { ...withCookie, origin: 'http://evil.example' }, '{}')).statusCode, 403, 'cross-origin writes are refused');
  assert.equal((await fromLaptop('POST', '/api/remote/token', withCookie, '{}')).statusCode, 403, 'a new token can only be made on the hub itself');
  for (let i = 0; i < 10; i++) await fromLaptop('POST', '/api/login', { host: LAN.host, 'content-type': 'application/x-www-form-urlencoded' }, 'token=nope');
  assert.equal((await fromLaptop('POST', '/api/login', { host: LAN.host, 'content-type': 'application/x-www-form-urlencoded' }, `token=${token}`)).statusCode, 429, 'brute-force brake');
  await call('PATCH', '/api/settings/remote', { enabled: false });
});
