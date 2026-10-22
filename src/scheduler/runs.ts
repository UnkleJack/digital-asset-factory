import type { AppContext } from '../app/context.ts';
import type { BudgetGuard } from '../engine/generation/service.ts';
import { ProviderError } from '../core/errors.ts';
import { json } from '../db/sqlite.ts';

function addNote(app: AppContext, planRunId: string, note: string): void {
  const notes = json<string[]>(app.db.value<string>('SELECT notes FROM plan_runs WHERE id = ?', planRunId), []);
  if (!notes.includes(note)) {
    notes.push(note);
    app.db.update('plan_runs', planRunId, { notes: JSON.stringify(notes.slice(-50)) });
  }
}

export function planRunBudget(app: AppContext, planRunId: string): BudgetGuard {
  return {
    check(estimateUsd, what) {
      const run = app.db.get<{ cost_usd: number; max_cost_usd: number }>('SELECT r.cost_usd, p.max_cost_usd FROM plan_runs r JOIN production_plans p ON p.id = r.plan_id WHERE r.id = ?', planRunId);
      if (!run) return;
      if (estimateUsd === null) {
        addNote(app, planRunId, `Cost of ${what} is unknown (no price configured), so the cost limit cannot be enforced for it.`);
        return;
      }
      if (run.cost_usd + estimateUsd > run.max_cost_usd) {
        throw new ProviderError('budget', 'budget_exceeded', `Skipped: this production run reached its cost limit of $${run.max_cost_usd.toFixed(2)} (spent ≈ $${run.cost_usd.toFixed(2)}).`);
      }
    },
    record(actualUsd) {
      if (actualUsd !== null) app.db.run('UPDATE plan_runs SET cost_usd = cost_usd + ? WHERE id = ?', actualUsd, planRunId);
    },
  };
}

export function refreshPlanRun(app: AppContext, planRunId: string): void {
  const run = app.db.get<{ status: string; batch_id: string | null }>('SELECT status, batch_id FROM plan_runs WHERE id = ?', planRunId);
  if (!run || run.status !== 'running') return;
  const versions = app.db.all<{ status: string; error: string | null }>(`SELECT v.status, v.error FROM approval_items i JOIN product_versions v ON v.id = i.version_id WHERE i.batch_id = ?`, run.batch_id ?? '');
  if (versions.some((v) => v.status === 'in_progress')) return;
  const skipped = versions.filter((v) => v.status === 'failed' && /cost limit/.test(v.error ?? '')).length;
  const failed = versions.filter((v) => v.status === 'failed').length;
  const now = new Date().toISOString();
  app.db.update('plan_runs', planRunId, { status: failed ? 'partial' : 'completed', items_skipped: skipped, finished_at: now });
}

export { addNote as addPlanRunNote };
