import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { startPipeline } from '../src/jobs/pipeline.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { getVersion, listingsForVersion } from '../src/db/repos.ts';
import { qaReport } from '../src/engine/qa/service.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { tempDir, idle } from './helpers.ts';

/*
 * Product types added by the 2026-11-10 factory upgrades, each made through the real pipeline (content, render,
 * QA, package, listings) the way the app makes them. Each product differs from the others, because the factory
 * refuses an identical duplicate.
 */

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

async function produce(productType: string, params: Record<string, unknown>, extra: { designSystemId?: string } = {}) {
  const { version } = createProduct(app, { productType, params, ...extra });
  startPipeline(app, version.id, { marketplaces: ['etsy'] });
  await idle(app, 300_000);
  const v = getVersion(app.db, version.id);
  const failed = qaReport(app, v.id).flatMap((r) => (r.results as Array<{ passed: number; check_code: string; message: string }>).filter((x) => !x.passed));
  assert.equal(v.status, 'ready', `${productType} ${JSON.stringify(params)}: ${v.status} ${v.error ?? ''} ${JSON.stringify(failed)}`);
  assert.equal(v.qa_status, 'passed', `${productType} QA: ${JSON.stringify(failed)}`);
  const pdf = app.assets.forVersion(v.id).find((a) => a.kind === 'pdf')!;
  const doc = await PDFDocument.load(app.assets.read(pdf));
  assert.ok(doc.getPageCount() >= 1);
  const etsy = listingsForVersion(app.db, v.id).find((l) => l.marketplace === 'etsy')!;
  assert.equal(etsy.status, 'ready', JSON.stringify(etsy.validation));
  assert.ok(etsy.price_cents > 0);
  return { v, etsy, assets: app.assets.forVersion(v.id) };
}

test('geometric pattern art: a coloring book and a wall-art set go all the way through the pipeline and pass QA', async () => {
  const coloring = await produce('geometric-pattern-art', { pages: 3, family: 'tessellate', mode: 'coloring' });
  assert.equal(coloring.etsy.price_cents, 399, 'its own default price, not the 499 fallback');
  assert.equal(coloring.assets.filter((a) => a.kind === 'artwork_svg').length, 3, 'the SVG set is delivered');
  const bold = app.db.value<string>("SELECT id FROM design_systems WHERE name = 'Bold Modern'")!;
  await produce('geometric-pattern-art', { pages: 2, family: 'girih', mode: 'print', cover: false }, { designSystemId: bold });
});

test('student types: an assignment tracker, a timetable and a reading log each go through the pipeline and pass QA', async () => {
  const assign = await produce('assignment-tracker', { layout: 'per-subject', subjects: ['Algebra', 'Biology', 'World History', 'Literature'] });
  assert.equal(assign.etsy.price_cents, 349);
  const tt = await produce('timetable', { weeks: 'ab', periods: 5, lunchAfter: 2 });
  assert.equal(tt.etsy.price_cents, 299);
  const read = await produce('reading-log', { books: 24, goal: 20, minutesMonths: 1, reviewPages: 2 });
  assert.equal(read.etsy.price_cents, 349);
  for (const r of [assign, tt, read]) assert.equal((r.v.content_provenance as { generator?: string }).generator, 'deterministic', 'made offline with the built-in content library');
});
