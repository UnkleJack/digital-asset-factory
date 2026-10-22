import type { Handler } from './worker.ts';
import type { JobType } from './queue.ts';
import { runStage, onStageFailedFinal, STAGES } from './pipeline.ts';
import { Worker } from './worker.ts';
import type { AppContext } from '../app/context.ts';
import { addPlanRunNote } from '../scheduler/runs.ts';

export function createWorker(app: AppContext, extra: Partial<Record<JobType, Handler>> = {}): Worker {
  const handlers: Partial<Record<JobType, Handler>> = { ...extra };
  for (const s of STAGES) handlers[s] = runStage;
  return new Worker(app, handlers, {
    onFinalFailure: (a, job, message) => {
      if (STAGES.includes(job.type)) onStageFailedFinal(a, job, message);
      else if (job.type === 'run_production_plan' && job.plan_run_id) {
        a.db.update('plan_runs', job.plan_run_id, { status: 'failed', finished_at: new Date().toISOString() });
        addPlanRunNote(a, job.plan_run_id, `Run failed: ${message}`);
      }
    },
  });
}
