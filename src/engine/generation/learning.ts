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
  /** What the picture-reading AI saw in boxes the owner drew with this note, joined with " | ". */
  boxes: string | null;
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
const MAX_LESSON_CHARS = 1800;

/**
 * The repeat-problems list the AI wrote from all of the owner's notes (plus lessons the owner wrote or
 * edited). Kept separate from the recent-notes list so an old, repeated problem never drops off.
 */
export function lessonsBrief(app: AppContext): string {
  const rows = app.db.all<{ text: string; times: number; source: string; pinned: number }>('SELECT text, times, source, pinned FROM note_lessons ORDER BY pinned DESC, times DESC, updated_at DESC LIMIT 20');
  if (!rows.length) return '';
  const lines = rows.map((r) => `- ${oneLine(r.text, 240)}${r.source === 'ai' && r.times > 1 ? ` (noted ${r.times} times)` : ''}`);
  const brief = `\n## Standing rules from the owner's review notes\nThese come from everything the owner has noted over time. Follow them in all new work.\n${lines.join('\n')}`;
  return brief.length <= MAX_LESSON_CHARS ? brief : `${brief.slice(0, MAX_LESSON_CHARS - 1)}…`;
}

export function learningBrief(app: AppContext): string {
  return lessonsBrief(app) + recentNotesBrief(app);
}

function recentNotesBrief(app: AppContext): string {
  // Approvals that were later invalidated (e.g. the product was then rejected) no longer count.
  const rows = app.db.all<DecisionRow>(
    `SELECT d.decision, d.notes, p.title, p.product_type,
       (SELECT group_concat('page ' || b.page || ': ' || b.description, ' | ') FROM review_boxes b JOIN approval_decisions d4 ON d4.id = b.decision_id
         WHERE d4.version_id = d.version_id AND d4.decision = d.decision AND b.description IS NOT NULL) AS boxes
     FROM approval_decisions d
     JOIN product_versions v ON v.id = d.version_id
     JOIN products p ON p.id = v.product_id
     WHERE d.notes <> '' AND (d.decision <> 'approved' OR d.invalidated_at IS NULL)
     GROUP BY d.version_id, d.decision, d.notes
     ORDER BY MAX(d.decided_at) DESC
     LIMIT ${MAX_ITEMS}`,
  );
  if (!rows.length) return '';
  const lines = rows.map((r) => `- ${LABELS[r.decision]} "${oneLine(r.title, 60)}" (${r.product_type}): ${oneLine(r.notes, MAX_NOTE_CHARS)}${r.boxes ? ` [boxed by the owner: ${oneLine(r.boxes, MAX_NOTE_CHARS)}]` : ''}`);
  const brief = `\n## Operator preferences learned from past review decisions\nApply these lessons to all new work: avoid what was rejected or criticized, lean toward what was approved.\n${lines.join('\n')}`;
  return brief.length <= MAX_BRIEF_CHARS ? brief : `${brief.slice(0, MAX_BRIEF_CHARS - 1)}…\n(older preferences omitted)`;
}
