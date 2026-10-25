import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { startPipeline } from '../src/jobs/pipeline.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { createBatch, addToBatch } from '../src/engine/approval/batches.ts';
import { decide, editVersion, itemDetail } from '../src/engine/approval/service.ts';
import { prepareExport, recordManualPublication, publishListing, reconcileListing, activeApproval } from '../src/engine/publishing/service.ts';
import { registerAdapter, OutcomeUnknownError, etsyAdapter } from '../src/engine/publishing/adapters.ts';
import { updateListing } from '../src/engine/listing/service.ts';
import { getVersion, listingsForVersion, getListing } from '../src/db/repos.ts';
import { qaReport } from '../src/engine/qa/service.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { tempDir, idle } from './helpers.ts';

let app: App;
let worker: Worker;

before(() => {
  app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  app.settings.update('scheduler', { retryBaseSeconds: 1 });
  worker = createWorker(app);
  worker.start();
});

after(async () => {
  await worker.stop();
  await app.close();
});

test('full lifecycle: produce → QA → package → listings → approve → export → record publication', async () => {
  const { version } = createProduct(app, { productType: 'habit-tracker', params: { months: 2 } });
  const batch = createBatch(app, 'Test batch', 'manual');
  addToBatch(app, batch, version.id);
  startPipeline(app, version.id, { marketplaces: ['etsy', 'gumroad'] });
  await idle(app);

  const v = getVersion(app.db, version.id);
  assert.equal(v.status, 'ready', `version status ${v.status}: ${v.error} ${JSON.stringify(qaReport(app, v.id).flatMap((r) => (r.results as any[]).filter((x) => !x.passed)))}`);
  assert.equal(v.stage, 'ready_for_review');
  assert.ok(['passed', 'passed_with_warnings'].includes(v.qa_status));
  assert.ok(v.deliverable_hash);
  const kinds = app.assets.forVersion(v.id).map((a) => a.kind).sort();
  for (const k of ['pdf', 'package_zip', 'license', 'instructions', 'preview_png', 'listing_png', 'manifest']) assert.ok(kinds.includes(k), `asset ${k}`);
  const zip = unzipSync(app.assets.read(app.assets.forVersion(v.id).find((a) => a.kind === 'package_zip')!));
  assert.ok(Object.keys(zip).some((n) => n.endsWith('.pdf')) && 'LICENSE.txt' in zip && 'HOW-TO-USE.txt' in zip);
  const manifest = JSON.parse(app.assets.read(app.assets.forVersion(v.id).find((a) => a.kind === 'manifest')!).toString());
  assert.equal(manifest.contentProvenance.generator, 'deterministic');

  const listings = listingsForVersion(app.db, v.id);
  assert.deepEqual(listings.map((l) => l.marketplace).sort(), ['etsy', 'gumroad']);
  const etsy = listings.find((l) => l.marketplace === 'etsy')!;
  assert.equal(etsy.status, 'ready', JSON.stringify(etsy.validation));
  assert.ok(etsy.title.length <= 140 && etsy.tags.length <= 13 && etsy.tags.every((t) => t.length <= 20));

  await assert.rejects(prepareExport(app, etsy.id), /no valid approval/, 'export refused before approval');
  assert.throws(() => recordManualPublication(app, etsy.id, { externalUrl: 'https://www.etsy.com/listing/123/x' }), /no valid approval/);

  const item = app.db.get<{ id: string }>('SELECT id FROM approval_items WHERE version_id = ?', v.id)!;
  const detail = itemDetail(app, item.id);
  assert.ok(detail.previews.length > 0 && detail.files.length > 0 && detail.listings.length === 2);
  decide(app, item.id, { decision: 'approved', marketplaces: ['etsy'] });
  assert.equal(getVersion(app.db, v.id).status, 'approved');
  assert.ok(activeApproval(app, getListing(app.db, etsy.id)));
  assert.equal(activeApproval(app, listings.find((l) => l.marketplace === 'gumroad')!), null, 'approval is per marketplace');

  const exp1 = await prepareExport(app, etsy.id);
  const exp2 = await prepareExport(app, etsy.id);
  assert.equal(exp1.exportAssetId, exp2.exportAssetId, 'export is idempotent for the same approval');
  assert.equal(exp2.reused, true);
  const exportZip = unzipSync(app.assets.read(app.assets.get(exp1.exportAssetId)));
  for (const n of ['listing.json', 'listing.txt', 'PUBLISHING_STEPS.md', 'images/01.png']) assert.ok(n in exportZip, n);
  assert.match(strFromU8(exportZip['PUBLISHING_STEPS.md']), /Digital files/);
  assert.ok(!strFromU8(exportZip['listing.json']).includes('sk-'), 'no secrets in export');

  await assert.rejects(publishListing(app, etsy.id), /direct publishing is not available/);
  assert.throws(() => recordManualPublication(app, etsy.id, { externalUrl: 'https://evil.example.com/listing/1' }), /not an address on Etsy/);
  const rec = recordManualPublication(app, etsy.id, { externalUrl: 'https://www.etsy.com/listing/987654321/habit-tracker' });
  assert.equal(rec.status, 'published_manual');
  const ext = app.db.get<{ verification: string; external_id: string }>('SELECT verification, external_id FROM external_listings WHERE listing_id = ?', etsy.id)!;
  assert.deepEqual({ ...ext }, { verification: 'manual_unverified', external_id: '987654321' });
  recordManualPublication(app, etsy.id, { externalUrl: 'https://www.etsy.com/listing/987654321/habit-tracker' });
  assert.equal(app.db.value('SELECT count(*) FROM external_listings WHERE listing_id = ?', etsy.id), 1, 'no duplicate external record');
  assert.throws(() => recordManualPublication(app, etsy.id, { externalUrl: 'https://www.etsy.com/listing/111/other' }), /already recorded as published/);

  updateListing(app, etsy.id, { price_cents: 799 });
  assert.equal(activeApproval(app, getListing(app.db, etsy.id)), null, 'editing the listing invalidates the approval');
  await assert.rejects(prepareExport(app, etsy.id), /no valid approval/);
});

test('QA failure blocks approval; revision creates a new version that re-enters the batch', async () => {
  app.settings.update('compliance', { blockedTerms: ['habit'] });
  const { version } = createProduct(app, { productType: 'habit-tracker', params: { months: 1 }, title: 'Blocked Term Tracker' });
  const batch = createBatch(app, 'QA batch', 'manual');
  addToBatch(app, batch, version.id);
  startPipeline(app, version.id);
  await idle(app);
  app.settings.reset('compliance');
  const v = getVersion(app.db, version.id);
  assert.equal(v.status, 'qa_failed');
  const failed = qaReport(app, v.id)[0].results as { check_code: string; passed: number }[];
  assert.ok(failed.some((r) => r.check_code === 'policy_terms' && !r.passed));
  const item = app.db.get<{ id: string }>('SELECT id FROM approval_items WHERE version_id = ?', v.id)!;
  assert.throws(() => decide(app, item.id, { decision: 'approved' }), /cannot be approved/);
  assert.throws(() => decide(app, item.id, { decision: 'revision_requested', notes: '' }), /Describe what should change/);
  const r = decide(app, item.id, { decision: 'regenerate_requested', notes: 'try again' });
  await idle(app);
  const nv = getVersion(app.db, r.newVersionId!);
  assert.equal(nv.version_no, 2);
  assert.equal(getVersion(app.db, v.id).status, 'superseded');
  assert.ok(app.db.get('SELECT 1 FROM approval_items WHERE batch_id = ? AND version_id = ?', batch, nv.id), 'new version added to the same batch');
});

test('editing an approved version invalidates its approval and re-renders with the copied content', async () => {
  const { version } = createProduct(app, { productType: 'todo-checklist', params: { topic: 'moving house' } });
  const batch = createBatch(app, 'Edit batch', 'manual');
  addToBatch(app, batch, version.id);
  startPipeline(app, version.id, { marketplaces: ['etsy'] });
  await idle(app);
  const item = app.db.get<{ id: string }>('SELECT id FROM approval_items WHERE version_id = ?', version.id)!;
  decide(app, item.id, { decision: 'approved' });
  const listing = listingsForVersion(app.db, version.id)[0];
  assert.ok(activeApproval(app, listing));
  const ds = app.db.value<string>("SELECT id FROM design_systems WHERE name = 'Bold Modern'")!;
  const { newVersionId } = editVersion(app, version.id, { designSystemId: ds, note: 'new look' });
  await idle(app);
  assert.equal(activeApproval(app, getListing(app.db, listing.id)), null, 'old approval invalidated');
  const nv = getVersion(app.db, newVersionId);
  assert.equal(nv.status, 'ready', String(nv.error));
  assert.deepEqual(nv.content, getVersion(app.db, version.id).content, 'content copied for a design-only edit');
  assert.equal((nv.content_provenance as any).copiedFromVersion, version.id);
});

test('publishing with a verified adapter is idempotent and unknown outcomes require reconciliation', async () => {
  let calls = 0;
  let mode: 'ok' | 'unknown' = 'unknown';
  const restore = registerAdapter({
    ...etsyAdapter,
    verification: 'verified',
    capabilities: { ...etsyAdapter.capabilities, publish: true },
    publish: async () => {
      calls++;
      if (mode === 'unknown') throw new OutcomeUnknownError('connection dropped after sending');
      return { externalId: 'E-1', externalUrl: 'https://www.etsy.com/listing/1', state: 'active' };
    },
  });
  try {
    const { version } = createProduct(app, { productType: 'invoice-template' });
    const batch = createBatch(app, 'Publish batch', 'manual');
    addToBatch(app, batch, version.id);
    startPipeline(app, version.id, { marketplaces: ['etsy'] });
    await idle(app);
    assert.equal(getVersion(app.db, version.id).status, 'ready', String(getVersion(app.db, version.id).error));
    const item = app.db.get<{ id: string }>('SELECT id FROM approval_items WHERE version_id = ?', version.id)!;
    const listing = listingsForVersion(app.db, version.id)[0];
    await assert.rejects(publishListing(app, listing.id), /no valid approval/);
    assert.equal(calls, 0, 'no remote call without approval');
    decide(app, item.id, { decision: 'approved' });
    await assert.rejects(publishListing(app, listing.id), /needs reconciliation/);
    assert.equal(getListing(app.db, listing.id).status, 'needs_reconciliation');
    await assert.rejects(publishListing(app, listing.id), /Reconcile/);
    assert.equal(calls, 1, 'no blind retry after an unknown outcome');
    reconcileListing(app, listing.id, { outcome: 'not_published' });
    assert.equal(getListing(app.db, listing.id).status, 'ready');
    mode = 'ok';
    const res = await publishListing(app, listing.id);
    assert.equal(res.status, 'published_verified');
    assert.equal(calls, 2, 'one retry after the operator confirmed nothing was published');
    await assert.rejects(publishListing(app, listing.id), /already published/);
    assert.equal(calls, 2, 'a published listing is never published twice');
    const ext = app.db.all<{ verification: string }>('SELECT verification FROM external_listings WHERE listing_id = ?', listing.id);
    assert.deepEqual(ext.map((e) => e.verification), ['api_verified']);
  } finally {
    restore();
  }
});
