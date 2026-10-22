import type { AppContext } from '../app/context.ts';
import { claim, complete, fail, heartbeat, recoverInterrupted, onEnqueue, JOB_CATEGORY, type JobRow, type JobType } from './queue.ts';
import { errorMessage } from '../core/errors.ts';

export type Handler = (app: AppContext, job: JobRow) => Promise<unknown>;

export interface WorkerHooks {
  onFinalFailure?: (app: AppContext, job: JobRow, message: string) => void;
}

export class Worker {
  private app: AppContext;
  private handlers: Partial<Record<JobType, Handler>>;
  private hooks: WorkerHooks;
  private running = new Map<string, Promise<void>>();
  private active = { ai: 0, render: 0, default: 0 };
  private stopped = true;
  private wake: (() => void) | null = null;
  private loopDone: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  readonly id = `worker-${process.pid}-${Date.now().toString(36)}`;

  constructor(app: AppContext, handlers: Partial<Record<JobType, Handler>>, hooks: WorkerHooks = {}) {
    this.app = app;
    this.handlers = handlers;
    this.hooks = hooks;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const rec = recoverInterrupted(this.app);
    if (rec.requeued || rec.failed) this.app.log.warn('Recovered jobs interrupted by the last shutdown', rec);
    this.unsubscribe = onEnqueue(() => this.wake?.());
    this.loopDone = this.loop();
  }

  async stop(timeoutMs = 30_000): Promise<void> {
    this.stopped = true;
    this.unsubscribe?.();
    this.wake?.();
    await this.loopDone;
    await Promise.race([Promise.allSettled([...this.running.values()]), new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  stats() {
    return { running: this.running.size, active: { ...this.active }, stopped: this.stopped };
  }

  private typesFor(cat: 'ai' | 'render' | 'default'): JobType[] {
    return (Object.keys(this.handlers) as JobType[]).filter((t) => JOB_CATEGORY[t] === cat);
  }

  private async loop(): Promise<void> {
    let lastSweep = 0;
    while (!this.stopped) {
      try {
        if (Date.now() - lastSweep > 60_000) {
          recoverInterrupted(this.app, true);
          lastSweep = Date.now();
        }
        const limits = this.app.settings.get('scheduler').concurrency;
        let claimed = false;
        for (const cat of ['ai', 'render', 'default'] as const) {
          while (!this.stopped && this.active[cat] < limits[cat]) {
            const job = claim(this.app, this.id, this.typesFor(cat));
            if (!job) break;
            claimed = true;
            this.active[cat]++;
            const p = this.execute(job).finally(() => {
              this.active[cat]--;
              this.running.delete(job.id);
              this.wake?.();
            });
            this.running.set(job.id, p);
          }
        }
        if (!claimed) await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 1000);
          this.wake = () => {
            clearTimeout(t);
            this.wake = null;
            resolve();
          };
        });
      } catch (err) {
        this.app.log.error('Worker loop error', { err });
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  private async execute(job: JobRow): Promise<void> {
    const log = this.app.log.child({ jobId: job.id, jobType: job.type, versionId: job.version_id ?? undefined });
    const handler = this.handlers[job.type];
    const leaseMs = this.app.settings.get('scheduler').leaseSeconds * 1000;
    const hb = setInterval(() => heartbeat(this.app, job.id, this.id), Math.max(5000, leaseMs / 3));
    const started = Date.now();
    try {
      if (!handler) throw new Error(`No handler registered for ${job.type}`);
      const result = await handler(this.app, job);
      complete(this.app, job, result);
      log.info('Job succeeded', { outcome: 'succeeded', ms: Date.now() - started, attempt: job.attempts });
    } catch (err) {
      const { final, errorClass } = fail(this.app, job, err);
      log[final ? 'error' : 'warn'](final ? 'Job failed' : 'Job failed; will retry', { outcome: 'failed', errorClass, attempt: job.attempts, err: errorMessage(err) });
      if (final) {
        try {
          this.hooks.onFinalFailure?.(this.app, job, errorMessage(err));
        } catch (hookErr) {
          log.error('Failure hook error', { err: errorMessage(hookErr) });
        }
      }
    } finally {
      clearInterval(hb);
    }
  }
}
