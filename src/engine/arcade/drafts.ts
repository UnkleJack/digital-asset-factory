import type { AppContext } from '../../app/context.ts';
import type { Db } from '../../db/sqlite.ts';
import { newId } from '../../core/ids.ts';
import { notFound } from '../../core/errors.ts';

// World Builder drafts (owner request, 2026-11-05). The AI can take a minute or more to write a world
// (Nemotron 3 Ultra took 76 seconds on the first real one), and before this the answer only ever went back
// to the open page, so leaving the page threw it away. Now the request starts a draft, the AI works in the
// background, and its answer is stored on the draft. The page polls the draft and can be left and reopened.
// A draft is never a world; SAVE WORLD (from-proposal) stays the only thing that creates one.

export const DRAFT_KINDS = ['world', 'notes'] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];
export type DraftStatus = 'writing' | 'ready' | 'failed';

interface DraftRow {
  id: string; kind: DraftKind; status: DraftStatus; request: string; result: string | null;
  error: string | null; model: string | null; created_at: string; updated_at: string;
}

export interface Draft {
  id: string;
  kind: DraftKind;
  status: DraftStatus;
  request: unknown;
  result: unknown;
  error: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export const INTERRUPTED = 'The app stopped before the AI finished this draft. Try again.';
const LIST_LIMIT = 20;

function parseJson(s: string | null): unknown {
  if (s === null) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function toDraft(r: DraftRow): Draft {
  return { id: r.id, kind: r.kind, status: r.status, request: parseJson(r.request), result: parseJson(r.result), error: r.error, model: r.model, createdAt: r.created_at, updatedAt: r.updated_at };
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 600);

/**
 * Records a draft as "writing", starts `work` in the background and returns at once.
 * When the work finishes the draft becomes "ready" with the result, or "failed" with the reason.
 */
export function startDraft<R>(app: AppContext, kind: DraftKind, request: unknown, work: () => Promise<{ result: R; model: string | null }>): Draft {
  const now = new Date().toISOString();
  const id = newId('wdr');
  app.db.insert('world_drafts', { id, kind, status: 'writing', request: JSON.stringify(request), created_at: now, updated_at: now });
  const finish = (patch: Record<string, unknown>) => {
    try {
      // A draft discarded while the AI was still writing simply isn't there to update.
      app.db.update('world_drafts', id, { ...patch, updated_at: new Date().toISOString() });
    } catch {
      // The app closed while the AI was working. recoverDrafts marks the draft failed on the next start.
    }
  };
  void Promise.resolve()
    .then(work)
    .then(
      (r) => finish({ status: 'ready', result: JSON.stringify(r.result), model: r.model }),
      (err) => {
        finish({ status: 'failed', error: messageOf(err) });
        try {
          app.log.warn('World Builder AI draft failed', { draftId: id, kind, err: messageOf(err) });
        } catch {
          /* logger already closed */
        }
      },
    );
  return getDraft(app, id);
}

export function getDraft(app: AppContext, id: string): Draft {
  const r = app.db.get<DraftRow>('SELECT * FROM world_drafts WHERE id = ?', id);
  if (!r) throw notFound('Draft', id);
  return toDraft(r);
}

/** Newest first. Drafts stay until the owner saves or discards them. */
export function listDrafts(app: AppContext, kind?: DraftKind): Draft[] {
  const rows = kind
    ? app.db.all<DraftRow>('SELECT * FROM world_drafts WHERE kind = ? ORDER BY created_at DESC LIMIT ?', kind, LIST_LIMIT)
    : app.db.all<DraftRow>('SELECT * FROM world_drafts ORDER BY created_at DESC LIMIT ?', LIST_LIMIT);
  return rows.map(toDraft);
}

export function discardDraft(app: AppContext, id: string): void {
  if (app.db.run('DELETE FROM world_drafts WHERE id = ?', id).changes === 0) throw notFound('Draft', id);
}

/** On startup: a draft still "writing" lost its AI call when the app stopped, so say so instead of waiting forever. */
export function recoverDrafts(db: Db): number {
  return db.run("UPDATE world_drafts SET status = 'failed', error = ?, updated_at = ? WHERE status = 'writing'", INTERRUPTED, new Date().toISOString()).changes;
}
