import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { enqueue, claim, recoverInterrupted, getJob } from '../src/jobs/queue.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { startPipeline } from '../src/jobs/pipeline.ts';
import { createPlan, tick, dueSlots, zonedToUtc, runProductionPlanJob, runPlanNow, jitterFor, nextSlot, updatePlan } from '../src/scheduler/scheduler.ts';
import { createOpportunity, addObservation, importObservationsCsv } from '../src/engine/research/service.ts';
import { scoreOpportunity } from '../src/engine/scoring/service.ts';
import { importPerformanceCsv, metrics, generateRecommendations, addPerformance } from '../src/engine/analytics/service.ts';
import { createBundle, createVariation } from '../src/engine/bundling/service.ts';
import { recordManualPublication } from '../src/engine/publishing/service.ts';
import { decide } from '../src/engine/approval/service.ts';
import { createBatch, addToBatch } from '../src/engine/approval/batches.ts';
import { getVersion, listingsForVersion } from '../src/db/repos.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { mockServer, anthropicMessage } from './mockServers.ts';
import { tempDir, idle } from './helpers.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FONT_IDS, FONTS } from '../src/engine/templates/library.ts';

let now = new Date('2026-10-20T09:00:00Z');
const clock = { now: () => new Date(now) };
let app: App;
let worker: Worker;

before(() => {
  app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false, clock });
  app.settings.update('generation', { textProvider: 'anthropic', fallbackOrder: [] }); // these tests stand in for Anthropic
  app.settings.update('general', { timezone: 'America/New_York' });
  app.settings.update('scheduler', { retryBaseSeconds: 1 });
  worker = createWorker(app, { run_production_plan: runProductionPlanJob });
  worker.start();
});
after(async () => {
  await worker.stop();
  await app.close();
});

test('time-zone slots are correct across daylight saving changes', () => {
  assert.equal(zonedToUtc(2026, 3, 7, 6, 0, 'America/New_York').toISOString(), '2026-03-07T11:00:00.000Z');
  assert.equal(zonedToUtc(2026, 3, 9, 6, 0, 'America/New_York').toISOString(), '2026-03-09T10:00:00.000Z');
  assert.equal(zonedToUtc(2026, 11, 2, 6, 0, 'America/New_York').toISOString(), '2026-11-02T11:00:00.000Z');
  const slots = dueSlots({ run_at: '06:00', days_of_week: [1] }, new Date('2026-10-22T12:00:00Z'), 'America/New_York', 14);
  assert.deepEqual(slots.map((s) => s.toISOString()), ['2026-10-12T10:00:00.000Z', '2026-10-19T10:00:00.000Z']);
});

test('scheduler: one run per slot, missed slots recorded, latest caught up, catch-up window respected', () => {
  now = new Date('2026-10-20T09:00:00Z');
  const plan = createPlan(app, { name: 'Daily', enabled: true, runAt: '06:00', quota: 1, maxCostUsd: 1 });
  now = new Date('2026-10-20T10:00:30Z');
  const t1 = tick(app);
  assert.equal(t1.started.length, 1);
  assert.equal(app.db.value('SELECT trigger FROM plan_runs WHERE id = ?', t1.started[0]), 'schedule');
  assert.equal(tick(app).started.length, 0, 'same slot never runs twice');
  now = new Date('2026-10-23T15:00:00Z');
  const t2 = tick(app);
  assert.equal(t2.started.length, 1);
  assert.equal(app.db.value('SELECT trigger FROM plan_runs WHERE id = ?', t2.started[0]), 'catch_up');
  assert.equal(t2.missed, 2, 'the two older missed slots are recorded, not run');
  const statuses = app.db.all<{ slot: string; status: string }>("SELECT slot, status FROM plan_runs WHERE plan_id = ? AND slot NOT LIKE 'manual:%' ORDER BY slot", plan.id).map((r) => `${r.slot.slice(0, 10)}:${r.status === 'missed' ? 'missed' : 'run'}`);
  assert.deepEqual(statuses, ['2026-10-20:run', '2026-10-21:missed', '2026-10-22:missed', '2026-10-23:run']);
  app.settings.update('scheduler', { catchUpWindowHours: 0 });
  now = new Date('2026-10-24T18:00:00Z');
  const t3 = tick(app);
  assert.equal(t3.started.length, 0);
  assert.equal(t3.missed, 1, 'outside the catch-up window the slot is recorded as missed');
  app.settings.reset('scheduler');
  app.settings.update('scheduler', { retryBaseSeconds: 1 });
  app.db.run('UPDATE production_plans SET enabled = 0');
});

test('plans start at a stable random offset each day, and a plan pinned to another computer does not run here', () => {
  const p = { id: 'pln_fixed', run_at: '06:00', days_of_week: [0, 1, 2, 3, 4, 5, 6], jitter_minutes: 40 };
  const offs = [20, 21, 22, 23, 24, 25, 26].map((d) => jitterFor(p, 2026, 10, d));
  assert.ok(offs.every((o) => o >= 0 && o <= 40));
  assert.ok(new Set(offs).size > 1, 'the offset changes from day to day');
  assert.equal(jitterFor(p, 2026, 10, 20), offs[0], 'and is the same every time for the same day');
  const next = nextSlot(p, new Date('2026-10-20T08:00:00Z'), 'America/New_York')!;
  assert.equal(next.getTime(), Date.parse('2026-10-20T10:00:00Z') + offs[0] * 60_000);

  now = new Date('2026-10-20T09:00:00Z');
  const away = createPlan(app, { name: 'Other laptop', enabled: true, runAt: '06:00', quota: 1, maxCostUsd: 1, runOn: 'some-other-computer' });
  now = new Date('2026-10-20T10:00:30Z');
  assert.equal(app.db.value('SELECT count(*) FROM plan_runs WHERE plan_id = ?', away.id), 0);
  tick(app);
  assert.equal(app.db.value('SELECT count(*) FROM plan_runs WHERE plan_id = ?', away.id), 0, 'pinned elsewhere: never started here');
  updatePlan(app, away.id, { enabled: false });
});

test('scoring separates evidence kinds, excludes unknowns and blocks trademark terms', () => {
  const opp = createOpportunity(app, { title: 'Teacher lesson planner', productType: 'weekly-planner', keywords: ['teacher planner'], inputs: { differentiation: { value: 7, evidence: 'model_hypothesis', note: 'AI idea' } } });
  addObservation(app, { keyword: 'teacher planner', metric: 'search_volume', value: 1000, evidenceKind: 'external_estimate', source: 'keyword tool export' });
  addObservation(app, { opportunityId: opp, metric: 'competing_listings', value: 100, evidenceKind: 'measured', source: 'counted manually' });
  const r = scoreOpportunity(app, opp);
  const f = Object.fromEntries(r.factors.map((x) => [x.factor, x]));
  assert.equal(f.demand.value, 6);
  assert.equal(f.demand.evidence, 'external_estimate');
  assert.equal(f.competition.value, 6);
  assert.equal(f.differentiation.evidence, 'model_hypothesis');
  assert.equal(f.commercial.value, null, 'no price data → unknown, never invented');
  assert.ok(r.confidence > 0 && r.confidence < 1);
  const blocked = createOpportunity(app, { title: 'Disney princess coloring', productType: 'illustrated-coloring' });
  assert.equal(scoreOpportunity(app, blocked).outcome, 'policy_blocked');
});

test('research CSV import keeps valid rows and reports bad ones', () => {
  const csv = 'keyword,metric,value,evidence_kind,source\nhabit tracker,search_volume,2400,external_estimate,eRank\nbad row,search_volume,lots,measured,me\nmissing,search_volume,10,,x\n';
  const r = importObservationsCsv(app, 'kw.csv', csv);
  assert.equal(r.imported, 1);
  assert.equal(r.rejected, 2);
  assert.match(r.errors[0].message, /not a number/);
});

test('production run picks within quota and rotation, creates a batch, and dedupes opportunities', async () => {
  now = new Date('2026-10-25T12:00:00Z');
  app.db.run("UPDATE opportunities SET status = 'archived'");
  const a = createOpportunity(app, { title: 'Moving checklist', productType: 'todo-checklist', description: 'moving house' });
  const b = createOpportunity(app, { title: 'Ocean word search', productType: 'word-search' });
  const c = createOpportunity(app, { title: 'Mini mazes', productType: 'maze-activity' });
  for (const id of [a, b, c]) app.db.update('opportunities', id, { status: 'approved' });
  const plan = createPlan(app, { name: 'Rotation test', quota: 2, perCategoryMax: 1, marketplaces: ['etsy'] });
  const run = runPlanNow(app, plan.id);
  await idle(app);
  const pr = app.db.get<{ status: string; products_created: number; batch_id: string }>('SELECT status, products_created, batch_id FROM plan_runs WHERE id = ?', run)!;
  assert.equal(pr.products_created, 2);
  assert.equal(pr.status, 'completed');
  const items = app.db.all<{ category: string; status: string }>('SELECT c.name AS category, v.status FROM approval_items i JOIN products p ON p.id = i.product_id JOIN categories c ON c.id = p.category_id JOIN product_versions v ON v.id = i.version_id WHERE i.batch_id = ?', pr.batch_id);
  assert.equal(new Set(items.map((i) => i.category)).size, 2, 'one per category');
  assert.ok(items.every((i) => i.status === 'ready'), JSON.stringify(items));
  assert.equal(app.db.value('SELECT status FROM approval_batches WHERE id = ?', pr.batch_id), 'ready_for_review');
  const run2 = runPlanNow(app, plan.id);
  await idle(app);
  assert.equal(app.db.value('SELECT products_created FROM plan_runs WHERE id = ?', run2), 1, 'already-produced opportunities are not produced again');
});

test('cost limit skips AI generation before any call and marks the run partial', async () => {
  const srv = await mockServer(() => ({ json: anthropicMessage('{}') }));
  await app.secrets.set('anthropic_api_key', 'sk-ant-test-budget-123456');
  app.settings.update('generation', { anthropic: { baseUrl: srv.url } });
  app.db.run("UPDATE opportunities SET status = 'archived'");
  const o = createOpportunity(app, { title: 'Budget test tracker', productType: 'habit-tracker' });
  app.db.update('opportunities', o, { status: 'approved' });
  const plan = createPlan(app, { name: 'Zero budget', quota: 1, maxCostUsd: 0 });
  const run = runPlanNow(app, plan.id);
  await idle(app);
  const pr = app.db.get<{ status: string; items_skipped: number }>('SELECT status, items_skipped FROM plan_runs WHERE id = ?', run)!;
  assert.equal(srv.calls.length, 0, 'no paid call was made');
  assert.equal(pr.status, 'partial');
  assert.equal(pr.items_skipped, 1);
  await app.secrets.delete('anthropic_api_key');
  await srv.close();
});

test('a job interrupted by a crash is re-queued and completes exactly once', async () => {
  await worker.stop();
  const { version } = createProduct(app, { productType: 'goal-planner' });
  startPipeline(app, version.id);
  const job = claim(app, 'dead-worker', ['generate_content'])!;
  assert.equal(job.status, 'running');
  const rec = recoverInterrupted(app);
  assert.equal(rec.requeued, 1);
  const attempts = app.db.all<{ outcome: string }>('SELECT outcome FROM job_attempts WHERE job_id = ?', job.id);
  assert.deepEqual(attempts.map((a) => a.outcome), ['interrupted']);
  assert.equal(enqueue(app, 'generate_content', { dedupeKey: `generate_content:${version.id}`, versionId: version.id, payload: { versionId: version.id } }).created, false, 'dedupe prevents a duplicate job');
  worker = createWorker(app, { run_production_plan: runProductionPlanJob });
  worker.start();
  await idle(app);
  assert.equal(getJob(app, job.id).status, 'succeeded');
  assert.equal(app.db.value("SELECT count(*) FROM jobs WHERE type = 'generate_content' AND version_id = ?", version.id), 1);
  assert.equal(getVersion(app.db, version.id).status, 'ready');
});

test('bundles include member files; variations must change a real axis', async () => {
  const p1 = createProduct(app, { productType: 'invoice-template' });
  const p2 = createProduct(app, { productType: 'cleaning-schedule' });
  startPipeline(app, p1.version.id);
  startPipeline(app, p2.version.id);
  await idle(app);
  const b = createBundle(app, { productIds: [p1.product.id, p2.product.id], title: 'Home and Business Bundle', marketplaces: ['etsy'] });
  await idle(app);
  const bv = getVersion(app.db, b.versionId);
  assert.equal(bv.status, 'ready', `${bv.error} ${JSON.stringify(app.db.all("SELECT r.check_code, r.message FROM qa_results r JOIN qa_runs q ON q.id = r.qa_run_id WHERE q.version_id = ? AND r.passed = 0 AND r.severity = 'hard'", bv.id))}`);
  const zip = unzipSync(app.assets.read(app.assets.forVersion(bv.id).find((a) => a.kind === 'package_zip')!));
  assert.ok(Object.keys(zip).some((k) => k.startsWith(`${p1.product.slug}/`) && k.endsWith('.xlsx')));
  assert.ok(Object.keys(zip).some((k) => k.startsWith(`${p2.product.slug}/`) && k.endsWith('.pdf')));
  assert.throws(() => createVariation(app, p1.product.id, { axes: {} }), /must change at least one/);
  const ds = app.db.value<string>("SELECT id FROM design_systems WHERE name = 'Warm Neutral'")!;
  const v = createVariation(app, p1.product.id, { axes: { designSystemId: ds, paper: { size: 'a4' } } });
  assert.deepEqual(v.axes, ['design', 'paper']);
  await idle(app);
  assert.equal(getVersion(app.db, v.versionId).status, 'ready');
  assert.ok(app.db.get("SELECT 1 FROM product_relationships WHERE from_product_id = ? AND kind = 'variation_of'", v.productId));
});

test('fonts can be chosen per product: a matching design system is reused or created, renders, and drives variations', async () => {
  for (const id of FONT_IDS) for (const w of FONTS[id].weights) assert.ok(existsSync(join(app.paths.fontsDir, id, 'files', `${id}-latin-${w}-normal.woff2`)), `${id} ${w}`);
  const base = app.db.value<string>("SELECT id FROM design_systems WHERE name = 'Minimal Mono'")!;
  const fonts = { heading: 'fredoka', body: 'merriweather', accent: 'caveat' } as const;
  const p = createProduct(app, { productType: 'habit-tracker', params: { months: 1 }, designSystemId: base, fonts });
  assert.notEqual(p.spec.design_system_id, base, 'a derived design system is used');
  const tokens = JSON.parse(app.db.value<string>('SELECT tokens FROM design_systems WHERE id = ?', p.spec.design_system_id)!);
  assert.deepEqual(tokens.fonts, fonts);
  assert.equal(createProduct(app, { productType: 'goal-planner', designSystemId: base, fonts }).spec.design_system_id, p.spec.design_system_id, 'same look reuses the same design system');
  assert.equal(createProduct(app, { productType: 'goal-planner', designSystemId: base, fonts: { heading: 'inter', body: 'inter', accent: 'inter' } }).spec.design_system_id, base, 'fonts that match the base need no copy');
  startPipeline(app, p.version.id);
  const seedVar = createVariation(app, p.product.id, { axes: { newSeed: true } });
  assert.deepEqual(seedVar.axes, ['seed']);
  const fontVar = createVariation(app, p.product.id, { axes: {}, fonts: { heading: 'amatic-sc', body: 'quicksand' } });
  assert.deepEqual(fontVar.axes, ['design']);
  await idle(app);
  for (const id of [p.version.id, seedVar.versionId, fontVar.versionId]) assert.equal(getVersion(app.db, id).status, 'ready', `${id}: ${getVersion(app.db, id).error}`);
});

test('sales CSV import matches recorded listings; metrics keep sources apart; recommendations need evidence', async () => {
  const { version } = createProduct(app, { productType: 'habit-tracker', params: { months: 1 } });
  const batch = createBatch(app, 'Sales', 'manual');
  addToBatch(app, batch, version.id);
  startPipeline(app, version.id, { marketplaces: ['etsy'] });
  await idle(app);
  const item = app.db.get<{ id: string }>('SELECT id FROM approval_items WHERE version_id = ?', version.id)!;
  decide(app, item.id, { decision: 'approved' });
  const listing = listingsForVersion(app.db, version.id)[0];
  recordManualPublication(app, listing.id, { externalUrl: 'https://www.etsy.com/listing/555/habit' });
  const csv = 'Sale Date,Listing ID,Quantity,Item Total\n2026-10-01,555,1,4.99\n2026-10-02,555,2,9.98\n2026-10-03,999,1,1.00\n';
  const r = importPerformanceCsv(app, 'etsy-sales.csv', csv, 'etsy');
  assert.equal(r.imported, 2);
  assert.equal(r.rejected, 1);
  addPerformance(app, { listingId: listing.id, periodStart: '2026-10-01', periodEnd: '2026-10-31', metric: 'orders', value: 50, sourceKind: 'estimate' });
  const m = metrics(app);
  const bySource = Object.fromEntries((m.sales.bySource as { source_kind: string; metric: string; total: number }[]).filter((x) => x.metric === 'orders').map((x) => [x.source_kind, x.total]));
  assert.deepEqual(bySource, { csv_import: 2, estimate: 50 });
  const recs = generateRecommendations(app);
  const kinds = app.db.all<{ kind: string }>("SELECT kind FROM recommendations WHERE status = 'open'").map((x) => x.kind);
  assert.ok(!kinds.includes('produce_more'), 'two real orders is not enough evidence; estimates never count');
  assert.ok(recs.open >= 1);
});
