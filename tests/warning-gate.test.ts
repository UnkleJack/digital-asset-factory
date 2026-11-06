// The warning gate: a version with open QA warnings (yellow flags) can't be approved until the owner ticks
// "I accept these warnings"; the acceptance is recorded; the AI help endpoint only suggests.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { startPipeline } from '../src/jobs/pipeline.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { createBatch, addToBatch } from '../src/engine/approval/batches.ts';
import { decide, itemDetail, openWarnings } from '../src/engine/approval/service.ts';
import { warningHelp } from '../src/engine/approval/warningHelp.ts';
import { unacceptedApprovals, warningsCleared } from '../src/engine/approval/warnings.ts';
import { prepareExport } from '../src/engine/publishing/service.ts';
import { feedProduct } from '../src/engine/packing/service.ts';
import { listingsForVersion } from '../src/db/repos.ts';
import { getVersion } from '../src/db/repos.ts';
import { newId } from '../src/core/ids.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { tempDir, idle } from './helpers.ts';

let app: App;
let worker: Worker;
before(() => {
  app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  worker = createWorker(app);
  worker.start();
});
after(async () => {
  await worker.stop();
  await app.close();
});

async function readyItem(): Promise<{ itemId: string; versionId: string }> {
  const { version } = createProduct(app, { productType: 'habit-tracker', params: { months: 1 } });
  const batch = createBatch(app, 'Gate', 'manual');
  addToBatch(app, batch, version.id);
  startPipeline(app, version.id, { marketplaces: ['etsy'] });
  await idle(app);
  assert.equal(getVersion(app.db, version.id).status, 'ready');
  return { itemId: app.db.value<string>('SELECT id FROM approval_items WHERE version_id = ?', version.id)!, versionId: version.id };
}

/** Add a failed warning-level check to the version's newest deliverable QA run, as QA would. */
function addWarning(versionId: string, code: string, message: string): void {
  const run = app.db.value<string>("SELECT id FROM qa_runs WHERE version_id = ? AND kind = 'deliverable' ORDER BY id DESC LIMIT 1", versionId)!;
  app.db.insert('qa_results', { id: newId('qar'), qa_run_id: run, check_code: code, severity: 'warning', passed: 0, message, details: '{}' });
  app.db.run("UPDATE product_versions SET qa_status = 'passed_with_warnings' WHERE id = ?", versionId);
}

test('a yellow-flagged version cannot be approved until the warnings are accepted, and the acceptance is recorded', async () => {
  const { itemId, versionId } = await readyItem();
  // Clear any warnings the deterministic run produced so the test controls exactly what is open.
  app.db.run("DELETE FROM qa_results WHERE severity = 'warning' AND passed = 0 AND qa_run_id IN (SELECT id FROM qa_runs WHERE version_id = ?)", versionId);
  addWarning(versionId, 'text_density', 'Page 2 is crowded');
  assert.equal(openWarnings(app, versionId).length, 1);
  assert.throws(() => decide(app, itemId, { decision: 'approved' }), /1 QA warning.*I accept these warnings/);
  assert.throws(() => decide(app, itemId, { decision: 'approved', acceptWarnings: false }), /I accept these warnings/);
  assert.equal(getVersion(app.db, versionId).status, 'ready', 'still not approved');

  decide(app, itemId, { decision: 'approved', acceptWarnings: true, warningNote: 'Fine for a tracker' });
  assert.equal(getVersion(app.db, versionId).status, 'approved');
  const d = itemDetail(app, itemId);
  assert.equal(d.acceptedWarnings.length, 1);
  assert.deepEqual(d.acceptedWarnings[0].warnings, [{ check: 'text_density', message: 'Page 2 is crowded' }]);
  assert.equal(d.acceptedWarnings[0].notes, 'Fine for a tracker');
  assert.equal(d.decisions[0].notes, '', 'the warning note is kept out of the decision notes that feed prompts');
});

test('a clean version approves without the tick', async () => {
  const { itemId, versionId } = await readyItem();
  app.db.run("DELETE FROM qa_results WHERE severity = 'warning' AND passed = 0 AND qa_run_id IN (SELECT id FROM qa_runs WHERE version_id = ?)", versionId);
  app.db.run("UPDATE product_versions SET qa_status = 'passed' WHERE id = ?", versionId);
  decide(app, itemId, { decision: 'approved' });
  assert.equal(getVersion(app.db, versionId).status, 'approved');
  assert.equal(itemDetail(app, itemId).acceptedWarnings.length, 0);
});

test('AI help only works with a provider key, and only for a warning that is open', async () => {
  const { versionId } = await readyItem();
  addWarning(versionId, 'image_quality', 'Illustration is blurry');
  await assert.rejects(warningHelp(app, versionId, 'no_such_check'), /not found/i);
  await assert.rejects(warningHelp(app, versionId, 'image_quality'), /AI help needs an AI provider key/);
  assert.equal(getVersion(app.db, versionId).status, 'ready', 'asking for help changes nothing');
});

test('approvals made before the gate are held back from packing and publishing until the warnings are accepted', async () => {
  const { itemId, versionId } = await readyItem();
  app.db.run("DELETE FROM qa_results WHERE severity = 'warning' AND passed = 0 AND qa_run_id IN (SELECT id FROM qa_runs WHERE version_id = ?)", versionId);
  app.db.run("UPDATE product_versions SET qa_status = 'passed' WHERE id = ?", versionId);
  decide(app, itemId, { decision: 'approved' });
  // The warning was there all along, but the old rules let it through without a tick.
  addWarning(versionId, 'text_density', 'Page 2 is crowded');
  const productId = getVersion(app.db, versionId).product_id;
  const etsy = listingsForVersion(app.db, versionId).find((l) => l.marketplace === 'etsy')!;

  assert.equal(warningsCleared(app, versionId), false);
  assert.deepEqual(unacceptedApprovals(app).map((r) => r.versionId), [versionId]);
  assert.equal(unacceptedApprovals(app)[0].itemId, itemId);
  await assert.rejects(prepareExport(app, etsy.id), /warnings you haven't accepted/, 'no export or publishing');
  assert.match(feedProduct(app, productId).backlog ?? '', /haven't accepted/, 'not packed');
  assert.equal(getVersion(app.db, versionId).status, 'approved', 'the approval itself is kept');
  assert.equal(itemDetail(app, itemId).warningsCleared, false);

  decide(app, itemId, { decision: 'approved', acceptWarnings: true });
  assert.equal(warningsCleared(app, versionId), true);
  assert.equal(unacceptedApprovals(app).length, 0);
  await prepareExport(app, etsy.id);
  assert.equal(feedProduct(app, productId).backlog, null);
});
