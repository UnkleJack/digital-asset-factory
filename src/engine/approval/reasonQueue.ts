// Every review note goes through the AI before the action it belongs to happens (owner, 2026-11-09).
// submitWithReason() checks the note now when it can. When the AI can't be reached, the note and its action
// wait in reason_queue, nothing happens to the item, and processReasonQueue() (every 60 seconds) checks
// them once the AI is back: a passing note's action is carried out, a refused one is shown with the reason.
import type { AppContext } from '../../app/context.ts';
import { json } from '../../db/sqlite.ts';
import { newId } from '../../core/ids.ts';
import { validation, conflict, notFound, errorMessage } from '../../core/errors.ts';
import { textMode } from '../generation/service.ts';
import { addReviewNote, addLesson, updateLesson, maybeDigest } from '../generation/notes.ts';
import { decide, type Decision } from './service.ts';
import { checkReason, type ReasonKind, type BoxHint } from './reasonCheck.ts';
import { discardBoxes, whereOnPage } from './reviewBoxes.ts';

export const RETRY_SECONDS = 60;

export type ReasonAction =
  | { action: 'decision'; itemId: string; decision: Exclude<Decision, 'approved'>; notes: string; boxIds?: string[] }
  | { action: 'note'; versionId: string; notes: string }
  | { action: 'lesson_add'; text: string }
  | { action: 'lesson_edit'; lessonId: string; text: string };

export type Submitted<T = unknown> = { queued: false; result: T } | { queued: true; id: string; message: string };

const QUEUED_MESSAGE = "The AI can't be reached right now, so your note is waiting in line. Nothing has changed yet. It gets checked as soon as the AI is back.";

function kindOf(a: ReasonAction): ReasonKind {
  return a.action === 'decision' ? a.decision : a.action === 'note' ? 'note' : 'lesson';
}
function textOf(a: ReasonAction): string {
  return a.action === 'decision' || a.action === 'note' ? a.notes : a.text;
}
function targetOf(a: ReasonAction): string | null {
  return a.action === 'decision' ? a.itemId : a.action === 'note' ? a.versionId : a.action === 'lesson_edit' ? a.lessonId : null;
}

/** Product title and type, and any boxes drawn with the note, so the check knows what the note is about. */
function contextOf(app: AppContext, a: ReasonAction): { title?: string; productType?: string; boxes?: BoxHint[] } {
  const boxes = a.action === 'decision' && a.boxIds?.length
    ? app.db.all<{ page: number; x: number; y: number; w: number; h: number }>('SELECT page, x, y, w, h FROM review_boxes WHERE id IN (SELECT value FROM json_each(?)) ORDER BY page', JSON.stringify(a.boxIds)).map((b) => ({ page: b.page, where: whereOnPage(b) }))
    : [];
  const withBoxes = <T extends object>(o: T) => (boxes.length ? { ...o, boxes } : o);
  const versionId = a.action === 'decision'
    ? app.db.value<string>('SELECT version_id FROM approval_items WHERE id = ?', a.itemId)
    : a.action === 'note' ? a.versionId : undefined;
  if (!versionId) return withBoxes({});
  const r = app.db.get<{ title: string; product_type: string }>('SELECT p.title, p.product_type FROM product_versions v JOIN products p ON p.id = v.product_id WHERE v.id = ?', versionId);
  return withBoxes(r ? { title: r.title, productType: r.product_type } : {});
}

/** Checks that what the note is attached to exists, so a queued note can't point at nothing. */
function mustExist(app: AppContext, a: ReasonAction): void {
  if (a.action === 'decision' && !app.db.value('SELECT 1 FROM approval_items WHERE id = ?', a.itemId)) throw notFound('Batch item', a.itemId);
  if (a.action === 'note' && !app.db.value('SELECT 1 FROM product_versions WHERE id = ?', a.versionId)) throw notFound('Version', a.versionId);
  if (a.action === 'lesson_edit' && !app.db.value('SELECT 1 FROM note_lessons WHERE id = ?', a.lessonId)) throw notFound('Lesson', a.lessonId);
}

function apply(app: AppContext, a: ReasonAction): unknown {
  let result: unknown;
  if (a.action === 'decision') result = decide(app, a.itemId, { decision: a.decision, notes: a.notes, boxIds: a.boxIds });
  else if (a.action === 'note') result = addReviewNote(app, a.versionId, a.notes);
  else if (a.action === 'lesson_add') result = addLesson(app, a.text);
  else result = updateLesson(app, a.lessonId, { text: a.text });
  // A note was written: once 10 have piled up, the AI reads them all in the background.
  if (a.action === 'decision' || a.action === 'note') void maybeDigest(app);
  return result;
}

/** Check the note, then carry out the action; or queue both when the AI can't be reached. A refused note throws. */
export async function submitWithReason<T = unknown>(app: AppContext, a: ReasonAction): Promise<Submitted<T>> {
  mustExist(app, a);
  if (a.action === 'decision' && app.db.value("SELECT 1 FROM reason_queue WHERE status = 'waiting' AND target = ? AND action LIKE '%\"decision\"%'", a.itemId)) {
    throw conflict('A decision on this item is already waiting for the AI to check its note.');
  }
  const ctx = contextOf(app, a);
  const v = await checkReason(app, textOf(a), kindOf(a), ctx);
  if (v.status === 'refused') throw validation(v.message, [{ field: 'notes', message: v.message }]);
  if (v.status === 'ok') return { queued: false, result: apply(app, a) as T };
  const id = newId('rsq');
  const now = new Date();
  app.db.insert('reason_queue', {
    id, kind: kindOf(a), action: JSON.stringify(a), text: textOf(a).trim().slice(0, 4000), target: targetOf(a), title: ctx.title ?? null,
    status: 'waiting', attempts: 1, last_error: v.why, created_at: now.toISOString(), next_try_at: new Date(now.getTime() + RETRY_SECONDS * 1000).toISOString(),
  });
  return { queued: true, id, message: QUEUED_MESSAGE };
}

type Row = { id: string; kind: string; action: string; text: string; target: string | null; title: string | null; status: string; attempts: number; last_error: string | null; message: string | null; created_at: string; next_try_at: string; finished_at: string | null };

let running = false;

/** Every 60 seconds: if the AI is reachable, check the waiting notes that are due. */
export async function processReasonQueue(app: AppContext): Promise<{ applied: number; refused: number; failed: number; stillWaiting: number }> {
  const out = { applied: 0, refused: 0, failed: 0, stillWaiting: 0 };
  if (running) return out;
  running = true;
  try {
    const now = () => new Date().toISOString();
    const due = app.db.all<Row>("SELECT * FROM reason_queue WHERE status = 'waiting' AND next_try_at <= ? ORDER BY created_at", now());
    if (!due.length) return out;
    const mode = await textMode(app).catch(() => ({ mode: 'deterministic' as const }));
    if (mode.mode !== 'ai') {
      app.db.run("UPDATE reason_queue SET next_try_at = ? WHERE status = 'waiting' AND next_try_at <= ?", new Date(Date.now() + RETRY_SECONDS * 1000).toISOString(), now());
      out.stillWaiting = due.length;
      return out;
    }
    for (const r of due) {
      const a = json<ReasonAction>(r.action, null as unknown as ReasonAction);
      const v = await checkReason(app, textOf(a), kindOf(a), contextOf(app, a));
      if (v.status === 'unavailable') {
        app.db.run('UPDATE reason_queue SET attempts = attempts + 1, last_error = ?, next_try_at = ? WHERE id = ?', v.why, new Date(Date.now() + RETRY_SECONDS * 1000).toISOString(), r.id);
        out.stillWaiting += 1;
        continue;
      }
      if (v.status === 'refused') {
        if (a.action === 'decision' && a.boxIds?.length) discardBoxes(app, a.boxIds);
        app.db.run("UPDATE reason_queue SET status = 'refused', attempts = attempts + 1, message = ?, finished_at = ? WHERE id = ?", v.message, now(), r.id);
        out.refused += 1;
        continue;
      }
      try {
        apply(app, a);
        app.db.run("UPDATE reason_queue SET status = 'applied', attempts = attempts + 1, finished_at = ? WHERE id = ?", now(), r.id);
        out.applied += 1;
      } catch (err) {
        // e.g. a newer version was made meanwhile. The note passed; what it was for can't be done any more.
        app.db.run("UPDATE reason_queue SET status = 'failed', attempts = attempts + 1, message = ?, finished_at = ? WHERE id = ?", errorMessage(err).slice(0, 500), now(), r.id);
        out.failed += 1;
      }
    }
    if (out.applied || out.refused || out.failed) app.log.info('Checked waiting review notes', out);
    return out;
  } finally {
    running = false;
  }
}

export type QueuedNote = { id: string; kind: string; text: string; target: string | null; title: string | null; status: string; attempts: number; message: string | null; createdAt: string; nextTryAt: string; finishedAt: string | null };

/** Notes still waiting, plus refused or failed ones you haven't dismissed. */
export function listReasonQueue(app: AppContext): QueuedNote[] {
  return app.db.all<Row>("SELECT * FROM reason_queue WHERE status IN ('waiting','refused','failed') ORDER BY created_at DESC LIMIT 200")
    .map((r) => ({ id: r.id, kind: r.kind, text: r.text, target: r.target, title: r.title, status: r.status, attempts: r.attempts, message: r.message, createdAt: r.created_at, nextTryAt: r.next_try_at, finishedAt: r.finished_at }));
}

/** Hide a refused or failed note from the list (it stays in the table), or cancel a waiting one. */
export function dismissQueuedNote(app: AppContext, id: string): void {
  const r = app.db.get<{ status: string }>('SELECT status FROM reason_queue WHERE id = ?', id);
  if (!r) throw notFound('Waiting note', id);
  if (r.status === 'applied') throw validation('That note was already used.');
  app.db.run("UPDATE reason_queue SET status = 'dismissed', finished_at = coalesce(finished_at, ?) WHERE id = ?", new Date().toISOString(), id);
}
