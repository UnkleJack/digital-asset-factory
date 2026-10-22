import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { getJob, retryJob, cancelJob, mapJob } from '../../jobs/queue.ts';
import { listBatches, batchDetail, decide, itemDetail } from '../../engine/approval/service.ts';
import { createBatch, addToBatch } from '../../engine/approval/batches.ts';
import { listPlans, createPlan, updatePlan, deletePlan, runPlanNow, nextSlot, dueSlots } from '../../scheduler/scheduler.ts';
import { textMode } from '../../engine/generation/service.ts';
import { adapters } from '../../engine/publishing/adapters.ts';
import { json } from '../../db/sqlite.ts';
import { publishListing } from '../../engine/publishing/service.ts';
import { errorMessage } from '../../core/errors.ts';
import { int, parse, type Q, type P } from './util.ts';

export function registerOperationsRoutes(s: FastifyInstance, deps: ServerDeps): void {
  const { app } = deps;

  s.get('/api/dashboard', async () => {
    const g = app.settings.get('generation');
    const tm = await textMode(app).catch((e: Error) => ({ mode: 'error' as const, reason: e.message }));
    const tz = app.settings.get('general').timezone;
    const plans = listPlans(app).filter((p) => p.enabled);
    const next = plans.map((p) => ({ plan: p.name, at: nextSlot(p, app.clock.now(), tz)?.toISOString() ?? null })).filter((x) => x.at).sort((a, b) => a.at!.localeCompare(b.at!))[0] ?? null;
    return {
      counts: {
        products: app.db.value<number>("SELECT count(*) FROM products WHERE status = 'active'"),
        inProduction: app.db.value<number>("SELECT count(*) FROM product_versions WHERE status = 'in_progress'"),
        awaitingReview: app.db.value<number>("SELECT count(*) FROM products p JOIN product_versions v ON v.id = p.current_version_id WHERE v.status = 'ready'"),
        approved: app.db.value<number>("SELECT count(*) FROM products p JOIN product_versions v ON v.id = p.current_version_id WHERE v.status = 'approved'"),
        qaFailed: app.db.value<number>("SELECT count(*) FROM products p JOIN product_versions v ON v.id = p.current_version_id WHERE v.status IN ('qa_failed','failed') AND p.status = 'active'"),
        publishedManual: app.db.value<number>("SELECT count(*) FROM external_listings WHERE verification = 'manual_unverified'"),
        publishedVerified: app.db.value<number>("SELECT count(*) FROM external_listings WHERE verification = 'api_verified'"),
        openOpportunities: app.db.value<number>("SELECT count(*) FROM opportunities WHERE status IN ('new','evaluating','approved')"),
        needsReconciliation: app.db.value<number>("SELECT count(*) FROM listings WHERE status = 'needs_reconciliation'"),
      },
      jobs: {
        queued: app.db.value<number>("SELECT count(*) FROM jobs WHERE status = 'queued'"),
        running: app.db.all("SELECT id, type, version_id, attempts, updated_at FROM jobs WHERE status = 'running' ORDER BY updated_at"),
        recentFailures: app.db.all("SELECT j.id, j.type, j.last_error, j.updated_at, p.title FROM jobs j LEFT JOIN products p ON p.id = j.product_id WHERE j.status = 'failed' ORDER BY j.updated_at DESC LIMIT 5"),
      },
      batches: app.db.all("SELECT id, name, status, created_at, (SELECT count(*) FROM approval_items i WHERE i.batch_id = b.id) AS items FROM approval_batches b WHERE status = 'ready_for_review' ORDER BY created_at DESC LIMIT 5"),
      providers: {
        text: { provider: g.textProvider, model: g.anthropic.model, mode: tm.mode, reason: 'reason' in tm ? tm.reason : null },
        image: { provider: g.imageProvider, configured: g.imageProvider === 'none' ? false : await app.providers.image.isConfigured(), model: g.openai.imageModel },
        chrome: app.renderer.available(),
      },
      marketplaces: adapters().map((a) => ({ id: a.id, name: a.displayName, verification: a.verification, directPublishing: a.capabilities.publish && a.verification === 'verified' })),
      nextRun: next,
      recentRuns: app.db.all("SELECT r.id, r.status, r.trigger, r.slot, r.products_created, r.items_skipped, r.cost_usd, p.name AS plan FROM plan_runs r JOIN production_plans p ON p.id = r.plan_id ORDER BY r.created_at DESC LIMIT 5"),
      cost30: app.db.get("SELECT sum(cost_usd) AS usd, sum(CASE WHEN cost_basis = 'unknown' AND status = 'succeeded' THEN 1 ELSE 0 END) AS unknown FROM generation_runs WHERE started_at > ?", new Date(Date.now() - 30 * 86_400_000).toISOString()),
      worker: deps.worker?.stats() ?? null,
    };
  });

  s.get('/api/jobs', async (req) => {
    const q = req.query as Q;
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.status) { where.push('j.status = ?'); args.push(q.status); }
    if (q.type) { where.push('j.type = ?'); args.push(q.type); }
    if (q.versionId) { where.push('j.version_id = ?'); args.push(q.versionId); }
    const rows = app.db.all<Record<string, unknown>>(`SELECT j.*, p.title AS product_title FROM jobs j LEFT JOIN products p ON p.id = j.product_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY j.created_at DESC LIMIT ?`, ...args, int(q.limit, 100, 1, 500));
    return { items: rows.map((r) => ({ ...mapJob(r), product_title: r.product_title })), counts: app.db.all('SELECT status, count(*) AS n FROM jobs GROUP BY status') };
  });
  s.get('/api/jobs/:id', async (req) => {
    const job = getJob(app, (req.params as P).id);
    return { job, attempts: app.db.all('SELECT * FROM job_attempts WHERE job_id = ? ORDER BY attempt_no', job.id) };
  });
  s.post('/api/jobs/:id/retry', async (req) => retryJob(app, (req.params as P).id));
  s.post('/api/jobs/:id/cancel', async (req) => cancelJob(app, (req.params as P).id));

  s.get('/api/qa', async (req) => {
    const q = req.query as Q;
    const rows = app.db.all<Record<string, unknown>>(`SELECT q.*, v.version_no, v.product_id, p.title, p.product_type FROM qa_runs q JOIN product_versions v ON v.id = q.version_id JOIN products p ON p.id = v.product_id
      ${q.status ? 'WHERE q.status = ?' : ''} ORDER BY q.id DESC LIMIT ?`, ...(q.status ? [q.status] : []), int(q.limit, 100, 1, 500));
    return rows.map((r) => ({ ...r, results: app.db.all('SELECT check_code, severity, passed, message FROM qa_results WHERE qa_run_id = ? ORDER BY passed, severity', r.id) }));
  });
  s.get('/api/qa/summary', async () => app.db.all(`SELECT r.check_code, r.severity, sum(CASE WHEN r.passed = 0 THEN 1 ELSE 0 END) AS failed, count(*) AS total FROM qa_results r GROUP BY r.check_code, r.severity ORDER BY failed DESC`));

  s.get('/api/batches', async (req) => listBatches(app, (req.query as Q).status));
  s.post('/api/batches', async (req) => {
    const b = parse(z.object({ name: z.string().trim().min(2).max(120), versionIds: z.array(z.string()).max(100).default([]) }), req.body, 'batch');
    const id = createBatch(app, b.name, 'manual');
    for (const v of b.versionIds) addToBatch(app, id, v);
    return { id };
  });
  s.get('/api/batches/:id', async (req) => batchDetail(app, (req.params as P).id));
  s.get('/api/batch-items/:id', async (req) => itemDetail(app, (req.params as P).id));
  s.post('/api/batch-items/:id/decision', async (req) => {
    const b = parse(z.object({ decision: z.enum(['approved', 'rejected', 'revision_requested', 'regenerate_requested']), marketplaces: z.array(z.string()).optional(), notes: z.string().max(4000).optional() }), req.body, 'decision');
    const result = decide(app, (req.params as P).id, b);
    const g = app.settings.get('marketplaces').gumroad;
    if (b.decision !== 'approved' || !g.autoPublishEnabled || !g.autoPublishOnApproval) return result;
    // Post approved Gumroad listings in the background; the outcome shows on the listing (Publishing page) and in the log.
    const listings = app.db.all<{ id: string }>("SELECT l.id FROM approval_decisions d JOIN listings l ON l.id = d.listing_id WHERE d.id IN (SELECT value FROM json_each(?)) AND l.marketplace = 'gumroad' AND l.status NOT IN ('published_verified','published_manual','needs_reconciliation')", JSON.stringify(result.decisionIds));
    for (const l of listings) {
      publishListing(app, l.id, 'system').then(
        (r) => app.log.info('Auto-published to Gumroad after approval', { listingId: l.id, url: r.externalUrl }),
        (err) => app.log.error('Auto-publish to Gumroad failed', { listingId: l.id, err: errorMessage(err) }),
      );
    }
    return { ...result, autoPublishing: listings.map((l) => l.id) };
  });

  s.get('/api/plans', async () => {
    const tz = app.settings.get('general').timezone;
    return listPlans(app).map((p) => ({ ...p, nextRun: nextSlot(p, app.clock.now(), tz)?.toISOString() ?? null, runs: app.db.all('SELECT id, slot, trigger, status, products_created, items_skipped, cost_usd, batch_id, notes, started_at, finished_at FROM plan_runs WHERE plan_id = ? ORDER BY created_at DESC LIMIT 20', p.id).map((r) => ({ ...(r as object), notes: json((r as { notes: string }).notes, []) })) }));
  });
  s.post('/api/plans', async (req) => createPlan(app, req.body));
  s.patch('/api/plans/:id', async (req) => updatePlan(app, (req.params as P).id, req.body));
  s.delete('/api/plans/:id', async (req) => {
    deletePlan(app, (req.params as P).id);
    return { ok: true };
  });
  s.post('/api/plans/:id/run', async (req) => ({ planRunId: runPlanNow(app, (req.params as P).id) }));

  s.get('/api/calendar', async (req) => {
    const q = req.query as Q;
    const from = new Date(q.from ?? new Date(Date.now() - 14 * 86_400_000).toISOString());
    const to = new Date(q.to ?? new Date(Date.now() + 31 * 86_400_000).toISOString());
    const tz = app.settings.get('general').timezone;
    const runs = app.db.all("SELECT r.id, r.slot, r.trigger, r.status, r.products_created, r.items_skipped, r.batch_id, r.created_at, p.name AS plan FROM plan_runs r JOIN production_plans p ON p.id = r.plan_id WHERE (r.slot >= ? AND r.slot <= ?) OR (r.slot LIKE 'manual:%' AND r.created_at >= ?) ORDER BY r.slot", from.toISOString(), to.toISOString(), from.toISOString());
    const upcoming: { plan: string; at: string }[] = [];
    for (const p of listPlans(app).filter((x) => x.enabled)) {
      for (const sl of dueSlots(p, to, tz, Math.ceil((to.getTime() - Date.now()) / 86_400_000))) if (sl > app.clock.now() && sl >= from) upcoming.push({ plan: p.name, at: sl.toISOString() });
    }
    const seasonal = app.db.all<{ id: string; title: string; seasonal_months: string; status: string }>("SELECT id, title, seasonal_months, status FROM opportunities WHERE seasonal_months <> '[]' AND status NOT IN ('archived','rejected')").map((o) => ({ ...o, seasonal_months: json<number[]>(o.seasonal_months, []) }));
    return { from: from.toISOString(), to: to.toISOString(), timezone: tz, runs, upcoming: upcoming.sort((a, b) => a.at.localeCompare(b.at)), seasonal, note: 'Scheduled runs only happen while the app is running. Runs missed while the computer was off or asleep are recorded; the most recent one is caught up when the app starts.' };
  });
}
