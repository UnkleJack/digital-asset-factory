import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { startPipeline } from '../src/jobs/pipeline.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { getVersion, getProduct } from '../src/db/repos.ts';
import { AssetStore } from '../src/storage/assetStore.ts';
import { planTidy, applyTidy } from '../src/ops/tidyFolders.ts';
import { planRestore, applyRestore, queueRebuilds, fontsFromNames } from '../src/ops/restoreProducts.ts';
import { idTime, newId } from '../src/core/ids.ts';
import { sha256 } from '../src/core/hash.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { tempDir, idle } from './helpers.ts';

const apps: { app: App; worker: Worker }[] = [];
function start(): App {
  const app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  app.settings.update('scheduler', { retryBaseSeconds: 1 });
  const worker = createWorker(app);
  worker.start();
  apps.push({ app, worker });
  return app;
}
after(async () => {
  for (const { app, worker } of apps) {
    await worker.stop();
    await app.close();
  }
});

/** Moves a finished version back to the products/<id>/v<n> layout the lost database used, manifest paths included. */
function toLegacy(app: App, versionId: string): string {
  const v = getVersion(app.db, versionId);
  const legacy = AssetStore.legacyVersionDir(v.product_id, v.version_no);
  mkdirSync(dirname(app.assets.resolve(legacy)), { recursive: true });
  renameSync(app.assets.resolve(v.asset_dir!), app.assets.resolve(legacy));
  const manifest = app.assets.resolve(`${legacy}/internal/manifest.json`);
  writeFileSync(manifest, readFileSync(manifest, 'utf8').split(`"${v.asset_dir}/`).join(`"${legacy}/`));
  return legacy;
}

test('idTime reads back when an id was made', () => {
  const before = Date.now();
  const t = idTime(newId('prd'))!.getTime();
  assert.ok(t >= before && t <= Date.now());
  assert.equal(idTime('prd_01m61hgb9d1w8vqaewm')!.toISOString(), '2026-10-28T15:19:22.157Z');
  assert.equal(idTime('not-an-id'), null);
});

test('fonts are matched to their roles from the names embedded in a PDF', () => {
  assert.deepEqual(fontsFromNames(['Lora-Bold', 'Inter-Regular', 'Inter-SemiBold']), { heading: 'lora', body: 'inter', accent: 'lora' });
  assert.deepEqual(fontsFromNames(['Caveat-Bold', 'NunitoExtraLight-Regular', 'NunitoExtraLight-SemiBold']), { heading: 'caveat', body: 'nunito', accent: 'caveat' });
  assert.deepEqual(fontsFromNames(['MerriweatherLight18pt-Bold', 'MerriweatherLight18pt-Regular']), { heading: 'merriweather', body: 'merriweather', accent: 'lora' });
  // A display face with only a regular weight is the heading, not the body.
  assert.deepEqual(fontsFromNames(['Pacifico-Regular', 'Montserrat-Regular', 'Montserrat-SemiBold']), { heading: 'pacifico', body: 'montserrat', accent: 'pacifico' });
  assert.equal(fontsFromNames(['Helvetica']), null);
});

test('products are restored from their folders after the database is lost', async () => {
  // The old computer: one coloring set built from its seed, one product whose text came from an AI.
  const old = start();
  const mandala = createProduct(old, { productType: 'mandala-coloring', params: { pages: 3, complexity: 'simple', cover: true }, paper: { size: 'letter', orientation: 'landscape' } });
  const journal = createProduct(old, { productType: 'todo-checklist' });
  startPipeline(old, mandala.version.id);
  startPipeline(old, journal.version.id);
  await idle(old);
  for (const id of [mandala.version.id, journal.version.id]) assert.equal(getVersion(old.db, id).status, 'ready', String(getVersion(old.db, id).error));
  const mandalaDir = toLegacy(old, mandala.version.id);
  const journalDir = toLegacy(old, journal.version.id);
  const artworkBefore = old.assets.forVersion(mandala.version.id, 'deliverable').filter((a) => a.kind === 'artwork_svg').map((a) => a.sha256).sort();
  const journalManifest = old.assets.resolve(`${journalDir}/internal/manifest.json`);
  const jm = JSON.parse(readFileSync(journalManifest, 'utf8'));
  jm.contentProvenance = { generator: 'groq', model: 'test-model' };
  jm.generationRuns = [{ id: 'gen_test', purpose: 'content', provider: 'groq', model: 'test-model', input_tokens: 10, output_tokens: 20, image_count: null, cost_usd: 0, cost_basis: 'none', status: 'succeeded', started_at: jm.version.createdAt }];
  writeFileSync(journalManifest, JSON.stringify(jm, null, 2));
  // A build that stopped after rendering: artwork, PDF and previews, no manifest.
  const unfinishedId = newId('prd');
  const unfinishedDir = `products/${unfinishedId}/v1`;
  cpSync(old.assets.resolve(mandalaDir), old.assets.resolve(unfinishedDir), { recursive: true });
  for (const p of ['internal', 'listing', 'LICENSE.txt', 'HOW-TO-USE.txt', `${mandala.product.slug}.zip`]) rmSync(old.assets.resolve(`${unfinishedDir}/${p}`), { recursive: true });
  renameSync(old.assets.resolve(`${unfinishedDir}/${mandala.product.slug}.pdf`), old.assets.resolve(`${unfinishedDir}/detailed-mandalas-3.pdf`));

  // The new database: empty, with only the files carried over.
  const app = start();
  cpSync(old.assets.resolve('products'), app.assets.resolve('products'), { recursive: true });
  const plan = await planRestore(app);
  assert.deepEqual(plan.skipped, []);
  assert.deepEqual(plan.items.map((i) => [i.productId, i.mode]).sort(), [[mandala.product.id, 'rebuild'], [journal.product.id, 'view_only'], [unfinishedId, 'unfinished']].sort());
  const unfinishedPlan = plan.items.find((i) => i.productId === unfinishedId)!;
  assert.equal(unfinishedPlan.title, 'Detailed Mandalas 3');
  // Read from the folder name as the old "complexity" setting, which the mandala type now stores as "detail".
  assert.deepEqual(unfinishedPlan.params, { pages: 3, detail: 'detailed', symmetry: 'auto', motifSet: 'classic', cover: true });
  assert.deepEqual(unfinishedPlan.paper, { size: 'letter', orientation: 'landscape', grayscale: false });
  assert.ok(plan.items.every((i) => i.fonts), 'fonts are read back out of every PDF');

  const result = applyRestore(app, plan);
  assert.deepEqual(result.failed, []);
  assert.ok(result.batchId);
  assert.equal(app.db.value<number>('SELECT count(*) FROM approval_items WHERE batch_id = ?', result.batchId), 3, 'every restored product can be reviewed from one batch');
  assert.equal((getVersion(app.db, mandala.version.id).content_provenance as { generator?: string }).generator, 'deterministic', 'text rebuilt from the seed, never by an AI provider');
  const tidy = applyTidy(app.db, app.assets, planTidy(app.db, app.assets));
  assert.equal(tidy.moved.length, 3);
  queueRebuilds(app, result);
  await idle(app);

  // Built from the seed: same id, same artwork, and back through QA, packaging and listings.
  const m = getVersion(app.db, mandala.version.id);
  assert.equal(m.status, 'ready', String(m.error));
  assert.equal(m.stage, 'ready_for_review');
  assert.notEqual(m.qa_status, 'failed');
  assert.equal(getProduct(app.db, mandala.product.id).title, mandala.product.title);
  assert.deepEqual(app.assets.forVersion(m.id, 'deliverable').filter((a) => a.kind === 'artwork_svg').map((a) => a.sha256).sort(), artworkBefore);
  assert.ok(app.db.value<number>('SELECT count(*) FROM listings WHERE version_id = ?', m.id)! > 0);
  const spec = app.db.get<{ design_system_id: string }>('SELECT design_system_id FROM product_specs WHERE id = ?', m.spec_id)!;
  const oldSpec = old.db.get<{ design_system_id: string }>('SELECT design_system_id FROM product_specs WHERE id = ?', mandala.version.spec_id)!;
  const tokens = (db: App['db'], id: string) => JSON.parse(db.value<string>('SELECT tokens FROM design_systems WHERE id = ?', id)!);
  assert.deepEqual(tokens(app.db, spec.design_system_id), tokens(old.db, oldSpec.design_system_id), 'the same look is recognised from the cover');

  // AI text is gone: view-only, but every file is recorded with a matching checksum.
  const j = getVersion(app.db, journal.version.id);
  assert.equal(j.status, 'ready');
  assert.equal(j.stage, 'packaged');
  assert.match(String(j.error), /view-only/);
  assert.equal(j.deliverable_hash, jm.deliverableHash);
  const files = app.assets.forVersion(j.id);
  assert.ok(files.some((a) => a.kind === 'pdf' && a.page_count && a.page_count > 0));
  assert.ok(files.some((a) => a.kind === 'package_zip'));
  for (const a of files) assert.equal(sha256(app.assets.read(a)), a.sha256, a.rel_path);
  assert.equal(app.db.value('SELECT provider FROM generation_runs WHERE version_id = ?', j.id), 'groq');

  // Unfinished: a failed draft with its files, created when its id says it was.
  const u = getProduct(app.db, unfinishedId);
  const uv = getVersion(app.db, u.current_version_id!);
  assert.equal(uv.status, 'failed');
  assert.equal(uv.created_at, idTime(unfinishedId)!.toISOString());
  assert.equal(app.assets.forVersion(uv.id).filter((a) => a.kind === 'artwork_svg').length, 3);

  assert.equal((await planRestore(app)).items.length, 0, 'running it again restores nothing');

  // Lose the database again, now that the folders have readable names: manifests still say which product each holds.
  const again = start();
  cpSync(app.assets.resolve('products'), again.assets.resolve('products'), { recursive: true });
  const second = await planRestore(again);
  assert.deepEqual(second.items.map((i) => i.productId).sort(), [mandala.product.id, journal.product.id].sort());
  assert.ok(second.skipped.some((s) => s.folder === getVersion(app.db, uv.id).asset_dir && /no manifest/.test(s.reason)), JSON.stringify(second.skipped));
  const r2 = applyRestore(again, second);
  assert.deepEqual(r2.failed, []);
  assert.equal(getVersion(again.db, mandala.version.id).asset_dir, getVersion(app.db, mandala.version.id).asset_dir, 'readable folders stay where they are');
  assert.equal(planTidy(again.db, again.assets).moves.length, 0);
  for (const a of again.assets.forVersion(journal.version.id)) assert.equal(sha256(again.assets.read(a)), a.sha256, a.rel_path);
});
