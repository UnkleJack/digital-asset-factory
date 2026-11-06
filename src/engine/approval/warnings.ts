// Yellow flags (QA warnings) and whether the owner has accepted them. Used by approval, packing,
// bundling and publishing so the same rule applies at every gate.
import type { AppContext } from '../../app/context.ts';
import { qaReport } from '../qa/service.ts';

export type QaResult = { check_code: string; severity: string; passed: number; message: string; details?: string | null };

/** QA results from the newest run of each kind (deliverable, release, ...), so older runs that were fixed don't count. */
export function latestQaResults(app: AppContext, versionId: string): QaResult[] {
  const qa = qaReport(app, versionId);
  const latestByKind = new Map<string, (typeof qa)[number]>();
  for (const r of qa) if (!latestByKind.has(r.kind)) latestByKind.set(r.kind, r);
  return [...latestByKind.values()].flatMap((r) => r.results as QaResult[]);
}

/** Yellow flags still open on a version: failed warning-level checks in its newest QA runs. */
export function openWarnings(app: AppContext, versionId: string): QaResult[] {
  return latestQaResults(app, versionId).filter((r) => !r.passed && r.severity === 'warning');
}

/** True when a version has no yellow flags, or the owner ticked "I accept these warnings" for it.
 * Versions approved before the warning gate existed have no acceptance on record, so they count as not cleared. */
export function warningsCleared(app: AppContext, versionId: string): boolean {
  if (app.db.get("SELECT 1 FROM audit_events WHERE action = 'approval.warnings_accepted' AND entity_id = ?", versionId)) return true;
  const qa = app.db.value<string>('SELECT qa_status FROM product_versions WHERE id = ?', versionId);
  return qa !== 'passed_with_warnings' && openWarnings(app, versionId).length === 0;
}

/** Approved, current versions that still carry warnings nobody accepted (approved before the gate). */
export function unacceptedApprovals(app: AppContext): { versionId: string; productId: string; title: string; versionNo: number; warnings: number; itemId: string | null; batchId: string | null }[] {
  const rows = app.db.all<{ id: string; product_id: string; title: string; version_no: number; item_id: string | null; batch_id: string | null }>(`SELECT v.id, v.product_id, p.title, v.version_no,
      (SELECT i.id FROM approval_items i WHERE i.version_id = v.id ORDER BY i.added_at DESC LIMIT 1) AS item_id,
      (SELECT i.batch_id FROM approval_items i WHERE i.version_id = v.id ORDER BY i.added_at DESC LIMIT 1) AS batch_id
    FROM product_versions v JOIN products p ON p.current_version_id = v.id
    WHERE v.status = 'approved' AND p.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.action = 'approval.warnings_accepted' AND a.entity_id = v.id)
    ORDER BY v.created_at DESC`);
  return rows.flatMap((r) => {
    if (warningsCleared(app, r.id)) return [];
    return [{ versionId: r.id, productId: r.product_id, title: r.title, versionNo: r.version_no, warnings: openWarnings(app, r.id).length, itemId: r.item_id, batchId: r.batch_id }];
  });
}
