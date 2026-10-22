import type { AppContext } from '../app/context.ts';
import { json } from '../db/sqlite.ts';
import { newId } from '../core/ids.ts';
import { classifyError, errorMessage, notFound, conflict, type ErrorClass } from '../core/errors.ts';
import { redact, audit, type AuditActor } from '../logging/logger.ts';

export type JobType = 'generate_content' | 'generate_artwork' | 'render' | 'qa' | 'package' | 'prepare_listings' | 'run_production_plan' | 'refresh_recommendations' | 'research_digest';

export const JOB_CATEGORY: Record<JobType, 'ai' | 'render' | 'default'> = {
  generate_content: 'ai', generate_artwork: 'ai', prepare_listings: 'ai', render: 'render', package: 'render', qa: 'render',
  run_production_plan: 'default', refresh_recommendations: 'default', research_digest: 'ai',
};

export interface JobRow {
  id: string;
  type: JobType;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  dedupe_key: string;
  payload: Record<string, unknown>;
  priority: number;
  run_after: string;
  attempts: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  error_class: string | null;
  result: unknown;
  product_id: string | null;
  version_id: string | null;
  plan_run_id: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export function mapJob(r: Record<string, unknown>): JobRow {
  return { ...(r as unknown as JobRow), payload: json(r.payload, {}), result: json(r.result, null) };
}

export interface EnqueueOptions {
  dedupeKey: string;
  payload?: Record<string, unknown>;
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
  productId?: string | null;
  versionId?: string | null;
  planRunId?: string | null;
}

type Listener = () => void;
const listeners = new Set<Listener>();
export function onEnqueue(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function enqueue(app: AppContext, type: JobType, o: EnqueueOptions): { id: string; created: boolean } {
  const active = app.db.get<{ id: string }>("SELECT id FROM jobs WHERE dedupe_key = ? AND status IN ('queued','running')", o.dedupeKey);
  if (active) return { id: active.id, created: false };
  const id = newId('job');
  const now = new Date().toISOString();
  try {
    app.db.insert('jobs', {
      id, type, status: 'queued', dedupe_key: o.dedupeKey, payload: JSON.stringify(o.payload ?? {}), priority: o.priority ?? 100,
      run_after: (o.runAfter ?? app.clock.now()).toISOString(), attempts: 0, max_attempts: o.maxAttempts ?? app.settings.get('scheduler').jobMaxAttempts,
      product_id: o.productId ?? null, version_id: o.versionId ?? null, plan_run_id: o.planRunId ?? null, created_at: now, updated_at: now,
    });
  } catch {
    const again = app.db.get<{ id: string }>("SELECT id FROM jobs WHERE dedupe_key = ? AND status IN ('queued','running')", o.dedupeKey);
    if (again) return { id: again.id, created: false };
    throw new Error(`Could not enqueue job ${type}`);
  }
  for (const l of listeners) l();
  return { id, created: true };
}

export function claim(app: AppContext, worker: string, types: JobType[]): JobRow | null {
  if (!types.length) return null;
  const now = app.clock.now();
  const lease = new Date(now.getTime() + app.settings.get('scheduler').leaseSeconds * 1000).toISOString();
  const row = app.db.get<Record<string, unknown>>(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1, lease_owner = ?, lease_expires_at = ?, updated_at = ?
     WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_after <= ? AND type IN (${types.map(() => '?').join(',')}) ORDER BY priority, created_at LIMIT 1)
     RETURNING *`,
    worker, lease, now.toISOString(), now.toISOString(), ...types,
  );
  if (!row) return null;
  const job = mapJob(row);
  app.db.insert('job_attempts', { id: newId('jat'), job_id: job.id, attempt_no: job.attempts, worker, started_at: now.toISOString() });
  return job;
}

export function heartbeat(app: AppContext, jobId: string, worker: string): void {
  const lease = new Date(app.clock.now().getTime() + app.settings.get('scheduler').leaseSeconds * 1000).toISOString();
  app.db.run("UPDATE jobs SET lease_expires_at = ? WHERE id = ? AND lease_owner = ? AND status = 'running'", lease, jobId, worker);
}

function closeAttempt(app: AppContext, job: JobRow, outcome: string, error: string | null, errorClass: string | null) {
  const att = app.db.get<{ id: string; started_at: string }>('SELECT id, started_at FROM job_attempts WHERE job_id = ? AND finished_at IS NULL ORDER BY attempt_no DESC LIMIT 1', job.id);
  if (!att) return;
  const now = new Date();
  app.db.update('job_attempts', att.id, { finished_at: now.toISOString(), outcome, error, error_class: errorClass, duration_ms: now.getTime() - new Date(att.started_at).getTime() });
}

export function complete(app: AppContext, job: JobRow, result: unknown): void {
  app.db.tx(() => {
    app.db.update('jobs', job.id, { status: 'succeeded', result: JSON.stringify(result ?? null), lease_owner: null, lease_expires_at: null, last_error: null, updated_at: new Date().toISOString(), finished_at: new Date().toISOString() });
    closeAttempt(app, job, 'succeeded', null, null);
  });
}

export function fail(app: AppContext, job: JobRow, err: unknown): { final: boolean; errorClass: ErrorClass } {
  const cls = classifyError(err);
  const message = redact(errorMessage(err)).slice(0, 2000);
  const retry = cls === 'transient' && job.attempts < job.max_attempts;
  const base = app.settings.get('scheduler').retryBaseSeconds;
  app.db.tx(() => {
    app.db.update('jobs', job.id, retry
      ? { status: 'queued', run_after: new Date(app.clock.now().getTime() + base * 1000 * 4 ** (job.attempts - 1)).toISOString(), lease_owner: null, lease_expires_at: null, last_error: message, error_class: cls, updated_at: new Date().toISOString() }
      : { status: 'failed', lease_owner: null, lease_expires_at: null, last_error: message, error_class: cls, updated_at: new Date().toISOString(), finished_at: new Date().toISOString() });
    closeAttempt(app, job, cls === 'transient' ? 'failed_transient' : 'failed_permanent', message, cls);
  });
  return { final: !retry, errorClass: cls };
}

export function recoverInterrupted(app: AppContext, onlyExpired = false): { requeued: number; failed: number } {
  const now = app.clock.now().toISOString();
  const rows = app.db.all<Record<string, unknown>>(onlyExpired ? "SELECT * FROM jobs WHERE status = 'running' AND lease_expires_at < ?" : "SELECT * FROM jobs WHERE status = 'running'", ...(onlyExpired ? [now] : []));
  let requeued = 0;
  let failed = 0;
  for (const r of rows.map(mapJob)) {
    app.db.tx(() => {
      closeAttempt(app, r, 'interrupted', 'The app stopped while this job was running', 'transient');
      if (r.attempts < r.max_attempts) {
        app.db.update('jobs', r.id, { status: 'queued', run_after: now, lease_owner: null, lease_expires_at: null, last_error: 'Interrupted (app restart); re-queued', error_class: 'transient', updated_at: now });
        requeued++;
      } else {
        app.db.update('jobs', r.id, { status: 'failed', lease_owner: null, lease_expires_at: null, last_error: 'Interrupted and out of attempts', error_class: 'transient', updated_at: now, finished_at: now });
        failed++;
      }
    });
  }
  return { requeued, failed };
}

export function getJob(app: AppContext, id: string): JobRow {
  const r = app.db.get<Record<string, unknown>>('SELECT * FROM jobs WHERE id = ?', id);
  if (!r) throw notFound('Job', id);
  return mapJob(r);
}

export function retryJob(app: AppContext, id: string, actor: AuditActor = 'user'): JobRow {
  const job = getJob(app, id);
  if (job.status !== 'failed' && job.status !== 'cancelled') throw conflict('Only failed or cancelled jobs can be retried.');
  if (app.db.get("SELECT 1 FROM jobs WHERE dedupe_key = ? AND status IN ('queued','running') AND id <> ?", job.dedupe_key, id)) throw conflict('An equivalent job is already queued or running.');
  const now = app.clock.now().toISOString();
  app.db.update('jobs', id, { status: 'queued', max_attempts: job.attempts + app.settings.get('scheduler').jobMaxAttempts, run_after: now, finished_at: null, updated_at: now });
  audit(app.db, actor, 'job.retried', 'job', id, { type: job.type });
  for (const l of listeners) l();
  return getJob(app, id);
}

export function cancelJob(app: AppContext, id: string, actor: AuditActor = 'user'): JobRow {
  const job = getJob(app, id);
  if (job.status !== 'queued') throw conflict('Only queued jobs can be cancelled; running jobs finish their current step.');
  const now = new Date().toISOString();
  app.db.update('jobs', id, { status: 'cancelled', updated_at: now, finished_at: now });
  audit(app.db, actor, 'job.cancelled', 'job', id, { type: job.type });
  return getJob(app, id);
}
