import type { AppContext } from '../../app/context.ts';
import { newId } from '../../core/ids.ts';
import { notFound } from '../../core/errors.ts';

const PIPELINE_DONE = new Set(['ready', 'failed', 'qa_failed', 'approved', 'rejected', 'superseded']);

export function createBatch(app: AppContext, name: string, origin: 'scheduler' | 'manual', planRunId: string | null = null): string {
  const id = newId('bat');
  const now = new Date().toISOString();
  app.db.insert('approval_batches', { id, name: name.slice(0, 120), origin, plan_run_id: planRunId, status: 'collecting', created_at: now, updated_at: now });
  return id;
}

export function addToBatch(app: AppContext, batchId: string, versionId: string): void {
  const batch = app.db.get<{ status: string }>('SELECT status FROM approval_batches WHERE id = ?', batchId);
  if (!batch) throw notFound('Batch', batchId);
  const v = app.db.get<{ product_id: string }>('SELECT product_id FROM product_versions WHERE id = ?', versionId);
  if (!v) throw notFound('Version', versionId);
  app.db.run('INSERT OR IGNORE INTO approval_items (id, batch_id, product_id, version_id, added_at) VALUES (?, ?, ?, ?, ?)', newId('itm'), batchId, v.product_id, versionId, new Date().toISOString());
  if (batch.status === 'closed') app.db.update('approval_batches', batchId, { status: 'collecting', closed_at: null, updated_at: new Date().toISOString() });
  refreshBatch(app, batchId);
}

export function refreshBatch(app: AppContext, batchId: string): string {
  const batch = app.db.get<{ status: string }>('SELECT status FROM approval_batches WHERE id = ?', batchId);
  if (!batch) throw notFound('Batch', batchId);
  const items = app.db.all<{ status: string; decided: number }>(`SELECT v.status, (SELECT count(*) FROM approval_decisions d WHERE d.item_id = i.id AND d.version_id = v.id AND d.invalidated_at IS NULL) AS decided
    FROM approval_items i JOIN product_versions v ON v.id = i.version_id WHERE i.batch_id = ?`, batchId);
  let status = batch.status;
  const allDone = items.length > 0 && items.every((i) => PIPELINE_DONE.has(i.status));
  const allDecided = items.length > 0 && items.every((i) => i.decided > 0 || ['superseded', 'failed'].includes(i.status));
  if (allDecided) status = 'closed';
  else if (allDone) status = 'ready_for_review';
  else status = 'collecting';
  if (status !== batch.status) {
    const now = new Date().toISOString();
    app.db.update('approval_batches', batchId, { status, updated_at: now, closed_at: status === 'closed' ? now : null });
  }
  return status;
}

export function refreshBatchesForVersion(app: AppContext, versionId: string): void {
  for (const b of app.db.all<{ batch_id: string }>('SELECT DISTINCT batch_id FROM approval_items WHERE version_id = ?', versionId)) refreshBatch(app, b.batch_id);
}

export function batchesContaining(app: AppContext, versionId: string): string[] {
  return app.db.all<{ batch_id: string }>('SELECT DISTINCT batch_id FROM approval_items WHERE version_id = ?', versionId).map((r) => r.batch_id);
}
