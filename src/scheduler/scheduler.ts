import { z } from 'zod';
import type { AppContext } from '../app/context.ts';
import { json } from '../db/sqlite.ts';
import { newId } from '../core/ids.ts';
import { validation, notFound, conflict } from '../core/errors.ts';
import { audit, type AuditActor } from '../logging/logger.ts';
import { enqueue, type JobRow } from '../jobs/queue.ts';
import { startPipeline } from '../jobs/pipeline.ts';
import { createProduct } from '../engine/specification/service.ts';
import { createBatch, addToBatch } from '../engine/approval/batches.ts';
import { scoreOpportunity, latestScore } from '../engine/scoring/service.ts';
import { hasProductType, productType } from '../engine/producttypes/registry.ts';
import { addPlanRunNote, refreshPlanRun } from './runs.ts';
import { MARKETPLACES } from '../engine/listing/service.ts';
import { sha256 } from '../core/hash.ts';
import { machineName } from '../config/machine.ts';

const PlanInput = z.object({
  name: z.string().trim().min(2).max(80),
  enabled: z.boolean().default(false),
  runAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)').default('06:00'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0, 1, 2, 3, 4, 5, 6]),
  quota: z.number().int().min(1).max(50).default(5),
  perCategoryMax: z.number().int().min(1).max(50).default(2),
  categoryRotation: z.array(z.string()).max(20).default([]),
  productTypes: z.array(z.string()).max(30).default([]),
  marketplaces: z.array(z.enum(MARKETPLACES)).min(1).default(['etsy']),
  maxCostUsd: z.number().min(0).max(1000).default(2),
  minScore: z.number().min(0).max(100).default(60),
  minConfidence: z.number().min(0).max(1).default(0.35),
  // Start up to this many minutes after runAt, a different but stable amount each day, so runs don't hit providers on the exact minute.
  jitterMinutes: z.number().int().min(0).max(180).default(0),
  // Which computer runs this plan (Settings → General → machine name); empty = any computer running the app.
  runOn: z.string().trim().max(60).default(''),
});

export interface PlanRow {
  id: string;
  name: string;
  enabled: number;
  run_at: string;
  days_of_week: number[];
  quota: number;
  per_category_max: number;
  category_rotation: string[];
  product_types: string[];
  marketplaces: string[];
  max_cost_usd: number;
  min_score: number;
  min_confidence: number;
  rotation_cursor: number;
  jitter_minutes: number;
  run_on: string;
  created_at: string;
  updated_at: string;
}

function mapPlan(r: Record<string, unknown>): PlanRow {
  return { ...(r as unknown as PlanRow), days_of_week: json(r.days_of_week, []), category_rotation: json(r.category_rotation, []), product_types: json(r.product_types, []), marketplaces: json(r.marketplaces, ['etsy']) };
}

export function getPlan(app: AppContext, id: string): PlanRow {
  const r = app.db.get<Record<string, unknown>>('SELECT * FROM production_plans WHERE id = ?', id);
  if (!r) throw notFound('Production plan', id);
  return mapPlan(r);
}

export function listPlans(app: AppContext): PlanRow[] {
  return app.db.all<Record<string, unknown>>('SELECT * FROM production_plans ORDER BY created_at').map(mapPlan);
}

function validatePlan(input: unknown, partial: boolean) {
  const p = (partial ? PlanInput.partial() : PlanInput).safeParse(input);
  if (!p.success) throw validation('Invalid production plan', p.error.issues);
  const bad = (p.data.productTypes ?? []).filter((t) => !hasProductType(t) || t === 'bundle');
  if (bad.length) throw validation(`Unknown product types: ${bad.join(', ')}`);
  return p.data;
}

function planRow(d: Partial<z.infer<typeof PlanInput>>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  if (d.name !== undefined) r.name = d.name;
  if (d.enabled !== undefined) r.enabled = d.enabled ? 1 : 0;
  if (d.runAt !== undefined) r.run_at = d.runAt;
  if (d.daysOfWeek !== undefined) r.days_of_week = JSON.stringify([...new Set(d.daysOfWeek)].sort());
  if (d.quota !== undefined) r.quota = d.quota;
  if (d.perCategoryMax !== undefined) r.per_category_max = d.perCategoryMax;
  if (d.categoryRotation !== undefined) r.category_rotation = JSON.stringify(d.categoryRotation);
  if (d.productTypes !== undefined) r.product_types = JSON.stringify(d.productTypes);
  if (d.marketplaces !== undefined) r.marketplaces = JSON.stringify(d.marketplaces);
  if (d.maxCostUsd !== undefined) r.max_cost_usd = d.maxCostUsd;
  if (d.minScore !== undefined) r.min_score = d.minScore;
  if (d.minConfidence !== undefined) r.min_confidence = d.minConfidence;
  if (d.jitterMinutes !== undefined) r.jitter_minutes = d.jitterMinutes;
  if (d.runOn !== undefined) r.run_on = d.runOn;
  return r;
}

export function createPlan(app: AppContext, input: unknown, actor: AuditActor = 'user'): PlanRow {
  const d = validatePlan(input, false) as z.infer<typeof PlanInput>;
  const id = newId('pln');
  const now = app.clock.now().toISOString();
  app.db.insert('production_plans', { id, ...planRow(d), rotation_cursor: 0, created_at: now, updated_at: now });
  audit(app.db, actor, 'plan.created', 'plan', id, { name: d.name });
  return getPlan(app, id);
}

export function updatePlan(app: AppContext, id: string, input: unknown, actor: AuditActor = 'user'): PlanRow {
  getPlan(app, id);
  const d = validatePlan(input, true);
  app.db.update('production_plans', id, { ...planRow(d), updated_at: new Date().toISOString() });
  audit(app.db, actor, 'plan.updated', 'plan', id, { fields: Object.keys(d) });
  return getPlan(app, id);
}

export function deletePlan(app: AppContext, id: string, actor: AuditActor = 'user'): void {
  getPlan(app, id);
  if (app.db.get("SELECT 1 FROM plan_runs WHERE plan_id = ? AND status IN ('pending','running')", id)) throw conflict('This plan has a run in progress.');
  app.db.run('DELETE FROM production_plans WHERE id = ?', id);
  audit(app.db, actor, 'plan.deleted', 'plan', id, {});
}

// ---------------------------------------------------------------- time zones and slots

export function tzParts(date: Date, tz: string): { y: number; m: number; d: number; hh: number; mm: number; dow: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(date).map((p) => [p.type, p.value]));
  const dows: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), hh: Number(parts.hour), mm: Number(parts.minute), dow: dows[parts.weekday] };
}

export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const target = Date.UTC(y, m - 1, d, hh, mm);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = tzParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
    const diff = target - asUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** Stable per plan and day: the same plan on the same date always gets the same offset. */
export function jitterFor(plan: { id?: string; jitter_minutes?: number }, y: number, m: number, d: number): number {
  const max = plan.jitter_minutes ?? 0;
  if (!max || !plan.id) return 0;
  return parseInt(sha256(`${plan.id}:${y}-${m}-${d}`).slice(0, 8), 16) % (max + 1);
}

type SlotPlan = Pick<PlanRow, 'run_at' | 'days_of_week'> & { id?: string; jitter_minutes?: number };

export function dueSlots(plan: SlotPlan, now: Date, tz: string, lookbackDays = 14): Date[] {
  const [hh, mm] = plan.run_at.split(':').map(Number);
  const out: Date[] = [];
  for (let back = lookbackDays; back >= 0; back--) {
    const p = tzParts(new Date(now.getTime() - back * 86_400_000), tz);
    const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
    if (!plan.days_of_week.includes(dow)) continue;
    const slot = new Date(zonedToUtc(p.y, p.m, p.d, hh, mm, tz).getTime() + jitterFor(plan, p.y, p.m, p.d) * 60_000);
    if (slot <= now && !out.some((s) => s.getTime() === slot.getTime())) out.push(slot);
  }
  return out;
}

export function nextSlot(plan: SlotPlan, now: Date, tz: string): Date | null {
  const [hh, mm] = plan.run_at.split(':').map(Number);
  for (let fwd = 0; fwd <= 8; fwd++) {
    const p = tzParts(new Date(now.getTime() + fwd * 86_400_000), tz);
    const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
    if (!plan.days_of_week.includes(dow)) continue;
    const slot = new Date(zonedToUtc(p.y, p.m, p.d, hh, mm, tz).getTime() + jitterFor(plan, p.y, p.m, p.d) * 60_000);
    if (slot > now) return slot;
  }
  return null;
}

// ---------------------------------------------------------------- tick

export function tick(app: AppContext): { started: string[]; missed: number } {
  const s = app.settings.all();
  if (!s.scheduler.enabled) return { started: [], missed: 0 };
  const now = app.clock.now();
  const tz = s.general.timezone;
  const started: string[] = [];
  let missed = 0;
  const me = machineName(app);
  for (const plan of listPlans(app).filter((p) => p.enabled && (!p.run_on || p.run_on.toLowerCase() === me.toLowerCase()))) {
    const createdMs = new Date(plan.created_at).getTime() - 60_000;
    const eligible = dueSlots(plan, now, tz).filter((sl) => sl.getTime() >= createdMs);
    if (!eligible.length) continue;
    const latest = eligible[eligible.length - 1];
    const lastRecorded = app.db.value<string>("SELECT max(slot) FROM plan_runs WHERE plan_id = ? AND slot NOT LIKE 'manual:%'", plan.id);
    for (const sl of eligible.slice(0, -1)) {
      if (lastRecorded && sl.toISOString() <= lastRecorded) continue;
      missed += app.db.run("INSERT OR IGNORE INTO plan_runs (id, plan_id, slot, trigger, status, notes, created_at) VALUES (?, ?, ?, 'schedule', 'missed', ?, ?)", newId('prn'), plan.id, sl.toISOString(), JSON.stringify(['The app was not running at this time; only the most recent missed run is caught up.']), now.toISOString()).changes;
    }
    if (app.db.get('SELECT 1 FROM plan_runs WHERE plan_id = ? AND slot = ?', plan.id, latest.toISOString())) continue;
    const ageH = (now.getTime() - latest.getTime()) / 3_600_000;
    if (ageH > s.scheduler.catchUpWindowHours) {
      missed += app.db.run("INSERT OR IGNORE INTO plan_runs (id, plan_id, slot, trigger, status, notes, created_at) VALUES (?, ?, ?, 'schedule', 'missed', ?, ?)", newId('prn'), plan.id, latest.toISOString(), JSON.stringify([`Older than the ${s.scheduler.catchUpWindowHours}-hour catch-up window when the app started.`]), now.toISOString()).changes;
      continue;
    }
    const trigger = now.getTime() - latest.getTime() <= (s.scheduler.tickSeconds * 2 + 60) * 1000 ? 'schedule' : 'catch_up';
    const runId = startPlanRun(app, plan.id, latest.toISOString(), trigger);
    if (runId) started.push(runId);
  }
  return { started, missed };
}

export function startPlanRun(app: AppContext, planId: string, slot: string, trigger: 'schedule' | 'catch_up' | 'manual'): string | null {
  const id = newId('prn');
  const now = new Date().toISOString();
  const inserted = app.db.run("INSERT OR IGNORE INTO plan_runs (id, plan_id, slot, trigger, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)", id, planId, slot, trigger, now).changes;
  if (!inserted) return null;
  enqueue(app, 'run_production_plan', { dedupeKey: `plan:${planId}:${slot}`, payload: { planRunId: id }, priority: 10, planRunId: id, maxAttempts: 2 });
  audit(app.db, trigger === 'manual' ? 'user' : 'scheduler', 'plan.run_started', 'plan_run', id, { planId, slot, trigger });
  return id;
}

export function runPlanNow(app: AppContext, planId: string): string {
  getPlan(app, planId);
  if (app.db.get("SELECT 1 FROM plan_runs WHERE plan_id = ? AND status IN ('pending','running')", planId)) throw conflict('This plan already has a run in progress.');
  return startPlanRun(app, planId, `manual:${new Date().toISOString()}`, 'manual')!;
}

// ---------------------------------------------------------------- production run

interface Candidate {
  id: string;
  title: string;
  productType: string;
  category: string;
  audienceId: string | null;
  themeId: string | null;
  score: number | null;
}

export function selectCandidates(app: AppContext, plan: PlanRow): { picked: Candidate[]; considered: number; notes: string[] } {
  const notes: string[] = [];
  const rows = app.db.all<{ id: string; title: string; product_type: string; status: string; category: string | null; audience_id: string | null; theme_id: string | null }>(
    `SELECT o.id, o.title, o.product_type, o.status, c.name AS category, o.audience_id, o.theme_id FROM opportunities o LEFT JOIN categories c ON c.id = o.category_id WHERE o.status IN ('new','evaluating','approved') ORDER BY o.created_at`);
  const since = new Date(app.clock.now().getTime() - 30 * 86_400_000).toISOString();
  const eligible: Candidate[] = [];
  for (const o of rows) {
    if (plan.product_types.length && !plan.product_types.includes(o.product_type)) continue;
    if (app.db.get('SELECT 1 FROM products WHERE opportunity_id = ? AND created_at > ?', o.id, since)) continue;
    let sc = latestScore(app, o.id);
    if (!sc || Date.now() - new Date(sc.created_at).getTime() > 24 * 3_600_000) sc = { ...scoreOpportunity(app, o.id), created_at: new Date().toISOString() };
    if (sc.outcome === 'policy_blocked') continue;
    const passes = o.status === 'approved' || (sc.score !== null && sc.score >= plan.min_score && sc.confidence >= plan.min_confidence);
    if (!passes) continue;
    eligible.push({ id: o.id, title: o.title, productType: o.product_type, category: o.category ?? productType(o.product_type).category, audienceId: o.audience_id, themeId: o.theme_id, score: sc.score });
  }
  if (!eligible.length) {
    notes.push(rows.length ? `None of the ${rows.length} open opportunities met this plan's thresholds (score ≥ ${plan.min_score}, confidence ≥ ${plan.min_confidence}) or they were produced in the last 30 days. Approve opportunities or add research data.` : 'There are no open opportunities. Add or import opportunities in Research.');
    return { picked: [], considered: rows.length, notes };
  }
  const byCat = new Map<string, Candidate[]>();
  for (const c of eligible.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category)!.push(c);
  }
  const rotation = plan.category_rotation.length ? plan.category_rotation.filter((c) => byCat.has(c)) : [...byCat.keys()].sort();
  const start = plan.rotation_cursor % Math.max(1, rotation.length);
  const order = [...rotation.slice(start), ...rotation.slice(0, start)];
  const picked: Candidate[] = [];
  const perCat = new Map<string, number>();
  let progress = true;
  while (picked.length < plan.quota && progress) {
    progress = false;
    for (const cat of order) {
      if (picked.length >= plan.quota) break;
      const list = byCat.get(cat)!;
      if (!list.length || (perCat.get(cat) ?? 0) >= plan.per_category_max) continue;
      picked.push(list.shift()!);
      perCat.set(cat, (perCat.get(cat) ?? 0) + 1);
      progress = true;
    }
  }
  if (plan.category_rotation.length && eligible.length > picked.length) notes.push(`Rotation limited this run to: ${plan.category_rotation.join(', ')}.`);
  return { picked, considered: rows.length, notes };
}

export async function runProductionPlanJob(app: AppContext, job: JobRow): Promise<unknown> {
  const runId = String(job.payload.planRunId);
  const run = app.db.get<{ id: string; plan_id: string; status: string; batch_id: string | null; slot: string }>('SELECT * FROM plan_runs WHERE id = ?', runId);
  if (!run) throw notFound('Plan run', runId);
  if (run.batch_id) return { resumed: true, batchId: run.batch_id };
  const plan = getPlan(app, run.plan_id);
  app.db.update('plan_runs', runId, { status: 'running', started_at: new Date().toISOString() });
  const { picked, considered, notes } = selectCandidates(app, plan);
  for (const n of notes) addPlanRunNote(app, runId, n);
  if (!picked.length) {
    app.db.update('plan_runs', runId, { status: 'completed', products_created: 0, finished_at: new Date().toISOString() });
    return { considered, created: 0 };
  }
  const label = run.slot.startsWith('manual:') ? run.slot.slice(7, 17) : run.slot.slice(0, 10);
  const batchId = createBatch(app, `${plan.name} — ${label}`, 'scheduler', runId);
  app.db.update('plan_runs', runId, { batch_id: batchId });
  let created = 0;
  for (const c of picked) {
    try {
      const { version } = createProduct(app, { productType: c.productType, title: c.title, audienceId: c.audienceId, themeId: c.themeId, opportunityId: c.id }, 'scheduler');
      addToBatch(app, batchId, version.id);
      startPipeline(app, version.id, { planRunId: runId, marketplaces: plan.marketplaces });
      app.db.update('opportunities', c.id, { status: 'produced', updated_at: new Date().toISOString() });
      created++;
    } catch (err) {
      addPlanRunNote(app, runId, `Could not start "${c.title}": ${(err as Error).message}`);
    }
  }
  app.db.update('plan_runs', runId, { products_created: created });
  app.db.update('production_plans', plan.id, { rotation_cursor: plan.rotation_cursor + 1 });
  if (!created) app.db.update('plan_runs', runId, { status: 'failed', finished_at: new Date().toISOString() });
  refreshPlanRun(app, runId);
  return { considered, created, batchId };
}

export class Scheduler {
  private app: AppContext;
  private timer: NodeJS.Timeout | null = null;

  constructor(app: AppContext) {
    this.app = app;
  }

  start(): void {
    const run = () => {
      try {
        const r = tick(this.app);
        if (r.started.length || r.missed) this.app.log.info('Scheduler tick', r);
      } catch (err) {
        this.app.log.error('Scheduler tick failed', { err });
      }
    };
    run();
    this.timer = setInterval(run, this.app.settings.get('scheduler').tickSeconds * 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
