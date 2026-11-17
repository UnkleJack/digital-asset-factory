import type { AppContext } from '../../app/context.ts';
import { getProduct, getVersion } from '../../db/repos.ts';
import { conflict, notFound, validation } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';

/*
 * "Hold for research" (owner's pick from the ChatGPT review, 2026-11-17). Some finished products are not wrong, they
 * just aren't ready to be decided: you want to look at what competitors charge, or check a trend, first. A hold parks
 * the item with a note saying what you are waiting to find out.
 *
 * A hold is NOT a decision. It writes no approval_decisions row, so it is never counted as a rejection, never feeds
 * the "learning" notes, and never invalidates anything. The version stays "ready" and nothing about it changes.
 * Deciding the item (approve, reject, revise, regenerate) ends the hold, or you can release it by hand.
 *
 * A hold only counts while the version is still "ready". A leftover row on a version that has since been decided is
 * ignored everywhere, so a crash between the two steps can never leave an item stuck.
 */

export interface HoldInfo { note: string; heldBy: string; heldAt: string }

export function holdFor(app: AppContext, versionId: string): HoldInfo | null {
  const r = app.db.get<{ note: string; held_by: string; held_at: string }>("SELECT h.note, h.held_by, h.held_at FROM research_holds h JOIN product_versions v ON v.id = h.version_id WHERE h.version_id = ? AND v.status = 'ready'", versionId);
  return r ? { note: r.note, heldBy: r.held_by, heldAt: r.held_at } : null;
}

export function holdForResearch(app: AppContext, itemId: string, noteRaw: string, actor: AuditActor = 'user'): HoldInfo {
  const item = app.db.get<{ product_id: string; version_id: string }>('SELECT product_id, version_id FROM approval_items WHERE id = ?', itemId);
  if (!item) throw notFound('Batch item', itemId);
  const note = noteRaw.trim().slice(0, 1000);
  if (note.length < 3) throw validation('Say what you are waiting to find out, so you remember why it is on hold.');
  const product = getProduct(app.db, item.product_id);
  const version = getVersion(app.db, item.version_id);
  if (product.current_version_id !== version.id) throw conflict('A newer version of this product exists. Hold the newest version instead.');
  if (version.status !== 'ready') throw conflict(`Only a finished version waiting for review can be held (this one is "${version.status}").`);
  const now = new Date().toISOString();
  app.db.run('INSERT INTO research_holds (version_id, note, held_by, held_at) VALUES (?, ?, ?, ?) ON CONFLICT(version_id) DO UPDATE SET note = excluded.note, held_by = excluded.held_by, held_at = excluded.held_at', version.id, note, actor, now);
  audit(app.db, actor, 'approval.held_for_research', 'version', version.id, { note });
  return { note, heldBy: actor, heldAt: now };
}

/** Takes an item off hold without deciding it. Returns false when it was not on hold. */
export function releaseHold(app: AppContext, itemId: string, actor: AuditActor = 'user'): boolean {
  const versionId = app.db.value<string>('SELECT version_id FROM approval_items WHERE id = ?', itemId);
  if (!versionId) throw notFound('Batch item', itemId);
  return clearHold(app, versionId, actor, 'released');
}

/** Ends a hold because the item was decided, or because the owner released it. */
export function clearHold(app: AppContext, versionId: string, actor: AuditActor, why: 'released' | 'decided'): boolean {
  const had = app.db.get('SELECT 1 FROM research_holds WHERE version_id = ?', versionId);
  if (!had) return false;
  app.db.run('DELETE FROM research_holds WHERE version_id = ?', versionId);
  audit(app.db, actor, why === 'released' ? 'approval.hold_released' : 'approval.hold_ended_by_decision', 'version', versionId, {});
  return true;
}

/** Everything on hold right now, oldest first, for the list on the Batch approval page. */
export function listHolds(app: AppContext) {
  return app.db.all<{ item_id: string; batch_id: string; batch_name: string; product_id: string; version_id: string; title: string; product_type: string; note: string; held_by: string; held_at: string }>(
    `SELECT i.id AS item_id, i.batch_id, b.name AS batch_name, p.id AS product_id, v.id AS version_id, p.title, p.product_type, h.note, h.held_by, h.held_at
       FROM research_holds h JOIN product_versions v ON v.id = h.version_id AND v.status = 'ready'
       JOIN approval_items i ON i.version_id = v.id JOIN approval_batches b ON b.id = i.batch_id JOIN products p ON p.id = v.product_id
      WHERE p.current_version_id = v.id AND p.status = 'active' ORDER BY h.held_at`);
}
