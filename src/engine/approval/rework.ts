import type { AppContext } from '../../app/context.ts';
import { notFound } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';

/** One line on the Rework page. */
export type ReworkItem = {
  versionId: string;
  productId: string;
  title: string;
  productType: string;
  category: string | null;
  versionNo: number;
  versions: number;
  current: boolean;
  status: string;
  /** rejected | revision_requested | regenerate_requested for your decisions; failed | qa_failed for the machine's. */
  reason: string;
  at: string;
  notes: string;
  marketplaces: string[];
  /** QA checks that did not pass on this version's latest checks, without the page or field suffix. */
  checks: string[];
  /** 'hard' when a check failed outright, 'warning' when only warnings, null when QA said nothing. */
  severity: 'hard' | 'warning' | null;
  error: string | null;
  /** First page preview, shown only when Preview is pressed. */
  thumb: string | null;
  fixedAt: string | null;
};

const YOUR_DECISIONS = "'rejected','revision_requested','regenerate_requested'";

function qaFlags(app: AppContext, versionId: string): { checks: string[]; severity: 'hard' | 'warning' | null } {
  const rows = app.db.all<{ check_code: string; severity: string }>(
    `SELECT r.check_code, r.severity FROM qa_results r JOIN qa_runs q ON q.id = r.qa_run_id
      WHERE q.version_id = ? AND r.passed = 0 AND q.started_at = (SELECT max(q2.started_at) FROM qa_runs q2 WHERE q2.version_id = q.version_id AND q2.kind = q.kind)`,
    versionId,
  );
  const checks = [...new Set(rows.map((r) => r.check_code.replace(/:.*/, '')))];
  const severity = rows.some((r) => r.severity === 'hard') ? 'hard' : rows.length ? 'warning' : null;
  return { checks, severity };
}

/**
 * Everything waiting to be reworked, in two groups: what the factory failed (production or QA) and what you
 * rejected, returned for revision or regenerated. Older versions are included. An item leaves the list only
 * when it is marked fixed; `showFixed` brings those back.
 */
export function reworkList(app: AppContext, opts: { showFixed?: boolean } = {}): { machine: ReworkItem[]; yours: ReworkItem[] } {
  const fixedFilter = opts.showFixed ? '' : 'AND m.version_id IS NULL';
  const base = (extra = '') => `SELECT ${extra}v.id AS version_id, v.product_id, v.version_no, v.status, v.error, v.updated_at, p.title, p.product_type, p.current_version_id,
      (SELECT name FROM categories c WHERE c.id = p.category_id) AS category,
      (SELECT count(*) FROM product_versions v2 WHERE v2.product_id = p.id) AS versions,
      (SELECT a.id FROM assets a WHERE a.version_id = v.id AND a.role = 'preview' ORDER BY a.page_index LIMIT 1) AS thumb,
      m.marked_at
    FROM product_versions v JOIN products p ON p.id = v.product_id LEFT JOIN rework_marks m ON m.version_id = v.id`;
  type Row = { version_id: string; product_id: string; version_no: number; status: string; error: string | null; updated_at: string; title: string; product_type: string; current_version_id: string | null; category: string | null; versions: number; thumb: string | null; marked_at: string | null };
  const shape = (r: Row, reason: string, at: string, notes: string, marketplaces: string[]): ReworkItem => ({
    versionId: r.version_id, productId: r.product_id, title: r.title, productType: r.product_type, category: r.category, versionNo: r.version_no, versions: r.versions,
    current: r.current_version_id === r.version_id, status: r.status, reason, at, notes, marketplaces, ...qaFlags(app, r.version_id), error: r.error, thumb: r.thumb, fixedAt: r.marked_at,
  });

  const yours = app.db.all<Row & { decision: string; decided_at: string; notes: string; markets: string | null }>(
    `${base('d.decision, d.decided_at, d.notes, d.markets, ')} JOIN (
        SELECT d.version_id, d.decision, d.decided_at, d.notes,
          (SELECT group_concat(DISTINCT d2.marketplace) FROM approval_decisions d2 WHERE d2.version_id = d.version_id AND d2.marketplace IS NOT NULL) AS markets
        FROM approval_decisions d
        WHERE d.decision IN (${YOUR_DECISIONS}) AND d.decided_at = (SELECT max(d3.decided_at) FROM approval_decisions d3 WHERE d3.version_id = d.version_id AND d3.decision IN (${YOUR_DECISIONS}))
        GROUP BY d.version_id
      ) d ON d.version_id = v.id
      WHERE 1 = 1 ${fixedFilter} ORDER BY d.decided_at DESC`,
  ).map((r) => shape(r, r.decision, r.decided_at, r.notes, r.markets ? r.markets.split(',') : []));

  const machine = app.db.all<Row>(
    `${base()} WHERE v.status IN ('failed','qa_failed')
      AND NOT EXISTS (SELECT 1 FROM approval_decisions d WHERE d.version_id = v.id AND d.decision IN (${YOUR_DECISIONS})) ${fixedFilter}
      ORDER BY v.updated_at DESC`,
  ).map((r) => shape(r, r.status, r.updated_at, '', []));

  return { machine, yours };
}

/** How many items wait on the Rework page (for the menu count). */
export function reworkCount(app: AppContext): number {
  return app.db.value<number>(
    `SELECT count(*) FROM product_versions v WHERE NOT EXISTS (SELECT 1 FROM rework_marks m WHERE m.version_id = v.id)
      AND (v.status IN ('failed','qa_failed') OR EXISTS (SELECT 1 FROM approval_decisions d WHERE d.version_id = v.id AND d.decision IN (${YOUR_DECISIONS})))`,
  ) ?? 0;
}

export function markFixed(app: AppContext, versionId: string, fixed: boolean, actor: AuditActor = 'user'): { versionId: string; fixed: boolean } {
  if (!app.db.value('SELECT 1 FROM product_versions WHERE id = ?', versionId)) throw notFound('Version', versionId);
  if (fixed) app.db.run('INSERT OR IGNORE INTO rework_marks (version_id, marked_at, marked_by) VALUES (?, ?, ?)', versionId, new Date().toISOString(), actor);
  else app.db.run('DELETE FROM rework_marks WHERE version_id = ?', versionId);
  audit(app.db, actor, fixed ? 'rework.marked_fixed' : 'rework.reopened', 'version', versionId);
  return { versionId, fixed };
}
