import type { AppContext } from '../../app/context.ts';

/**
 * The learning loop: notes the operator wrote when approving, rejecting or returning products
 * are distilled into a brief that is appended to the system prompt of every AI call, so review
 * decisions shape future content, listings, tags and digest ideas — not just the revised product.
 *
 * A rejection reason like "too much text, pages look crowded" should make the next planner the
 * model writes leaner, even though that reason was given on a different product.
 */

interface DecisionRow {
  decision: 'approved' | 'rejected' | 'revision_requested' | 'regenerate_requested';
  notes: string;
  title: string;
  product_type: string;
}

const LABELS: Record<DecisionRow['decision'], string> = {
  approved: 'APPROVED',
  rejected: 'REJECTED',
  revision_requested: 'REVISION ASKED',
  regenerate_requested: 'REGENERATED',
};

const MAX_ITEMS = 12;
const MAX_NOTE_CHARS = 240;
const MAX_BRIEF_CHARS = 2400;

function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * A compact text block describing what the operator has liked and disliked, built from recent
 * approval decisions that carried notes. Empty string when there is nothing to learn from yet.
 */
export function learningBrief(app: AppContext): string {
  // Approvals that were later invalidated (e.g. the product was then rejected) no longer count.
  const rows = app.db.all<DecisionRow>(
    `SELECT d.decision, d.notes, p.title, p.product_type
     FROM approval_decisions d
     JOIN product_versions v ON v.id = d.version_id
     JOIN products p ON p.id = v.product_id
     WHERE d.notes <> '' AND (d.decision <> 'approved' OR d.invalidated_at IS NULL)
     GROUP BY d.version_id, d.decision, d.notes
     ORDER BY MAX(d.decided_at) DESC
     LIMIT ${MAX_ITEMS}`,
  );
  if (!rows.length) return '';
  const lines = rows.map((r) => `- ${LABELS[r.decision]} "${oneLine(r.title, 60)}" (${r.product_type}): ${oneLine(r.notes, MAX_NOTE_CHARS)}`);
  const brief = `\n## Operator preferences learned from past review decisions\nApply these lessons to all new work: avoid what was rejected or criticized, lean toward what was approved.\n${lines.join('\n')}`;
  return brief.length <= MAX_BRIEF_CHARS ? brief : `${brief.slice(0, MAX_BRIEF_CHARS - 1)}…\n(older preferences omitted)`;
}
