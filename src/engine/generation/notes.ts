// Notes for the AI: every note the owner writes during review is kept here, forever, in one list.
// Every 10 new notes (or when the owner presses "Read my notes now") the AI reads the whole list and
// writes a short set of repeat problems and preferences ("lessons"). learningBrief() puts those
// lessons into every AI prompt, so something flagged months ago still counts.
import { z } from 'zod';
import type { AppContext } from '../../app/context.ts';
import { json } from '../../db/sqlite.ts';
import { newId } from '../../core/ids.ts';
import { notFound, validation, conflict, ProviderError, errorMessage } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import { structuredCall, textMode } from './service.ts';

export const DIGEST_EVERY = 10;
const DIGEST_MAX_NOTES = 400;
const DIGEST_MAX_CHARS = 30_000;
const MAX_LESSONS = 15;

export type NoteKind = 'rejected' | 'revision_requested' | 'regenerate_requested' | 'approved' | 'warnings_accepted' | 'note';
export const NOTE_KINDS: NoteKind[] = ['rejected', 'revision_requested', 'regenerate_requested', 'approved', 'warnings_accepted', 'note'];
const KIND_LABEL: Record<NoteKind, string> = {
  rejected: 'REJECTED',
  revision_requested: 'SENT BACK FOR REVISION',
  regenerate_requested: 'REGENERATED',
  approved: 'APPROVED',
  warnings_accepted: 'ACCEPTED AS-IS (owner reviewed the QA warnings and decided they are fine)',
  note: 'NOTE',
};

export type ReviewNote = { id: string; kind: NoteKind; notes: string; at: string; versionId: string; productId: string; title: string; productType: string; versionNo: number; warnings?: string[] };

/** Every note, newest first. `since` keeps only notes written after that time. */
export function allNotes(app: AppContext, opts: { kind?: string; since?: string; limit?: number } = {}): { rows: ReviewNote[]; total: number } {
  const since = opts.since ?? '';
  const want = (k: NoteKind) => !opts.kind || opts.kind === k;
  const out: ReviewNote[] = [];
  const join = 'JOIN product_versions v ON v.id = x.version_id JOIN products p ON p.id = v.product_id';
  const cols = 'v.id AS version_id, v.product_id, v.version_no, p.title, p.product_type';
  type Row = { id: string; kind: string; notes: string; at: string; version_id: string; product_id: string; version_no: number; title: string; product_type: string };
  const shape = (r: Row, kind: NoteKind, warnings?: string[]): ReviewNote => ({ id: r.id, kind, notes: r.notes, at: r.at, versionId: r.version_id, productId: r.product_id, title: r.title, productType: r.product_type, versionNo: r.version_no, ...(warnings && { warnings }) });

  // Decision notes. An approval for several marketplaces writes one row per marketplace; count it once.
  for (const r of app.db.all<Row>(`SELECT min(x.id) AS id, x.decision AS kind, x.notes, max(x.decided_at) AS at, ${cols}
      FROM approval_decisions x ${join} WHERE x.notes <> '' AND x.decided_at > ? GROUP BY x.version_id, x.decision, x.notes`, since)) {
    if (want(r.kind as NoteKind)) out.push(shape(r, r.kind as NoteKind));
  }
  if (want('warnings_accepted')) {
    for (const r of app.db.all<Row & { details: string }>(`SELECT x.id, '' AS kind, x.details, x.at, ${cols}
        FROM audit_events x JOIN product_versions v ON v.id = x.entity_id JOIN products p ON p.id = v.product_id
        WHERE x.action = 'approval.warnings_accepted' AND x.at > ?`, since)) {
      const d = json<{ notes?: string; warnings?: { check: string; message: string }[] }>(r.details, {});
      if (d.notes?.trim()) out.push(shape({ ...r, notes: d.notes.trim() }, 'warnings_accepted', (d.warnings ?? []).map((w) => w.message)));
    }
  }
  if (want('note')) {
    for (const r of app.db.all<Row>(`SELECT x.id, 'note' AS kind, x.notes, x.created_at AS at, ${cols} FROM review_notes x ${join} WHERE x.created_at > ?`, since)) out.push(shape(r, 'note'));
  }
  out.sort((a, b) => b.at.localeCompare(a.at));
  return { rows: opts.limit ? out.slice(0, opts.limit) : out, total: out.length };
}

/** A free note on a version, from the Rework page. */
export function addReviewNote(app: AppContext, versionId: string, notes: string, actor: AuditActor = 'user'): { id: string } {
  const text = notes.trim().slice(0, 4000);
  if (text.length < 3) throw validation('Write a few words for the note.');
  if (!app.db.value('SELECT 1 FROM product_versions WHERE id = ?', versionId)) throw notFound('Version', versionId);
  const id = newId('rvn');
  app.db.insert('review_notes', { id, version_id: versionId, notes: text, created_by: actor, created_at: new Date().toISOString() });
  audit(app.db, actor, 'notes.added', 'version', versionId, { notes: text });
  return { id };
}

export function reviewNotesFor(app: AppContext, versionId: string): { id: string; notes: string; at: string }[] {
  return app.db.all<{ id: string; notes: string; at: string }>('SELECT id, notes, created_at AS at FROM review_notes WHERE version_id = ? ORDER BY created_at DESC', versionId).map((r) => ({ ...r }));
}

// ---- Lessons (the repeat-problems list) ------------------------------------------------------

export type Lesson = { id: string; text: string; times: number; source: 'ai' | 'user'; pinned: boolean; created_at: string; updated_at: string };

export function listLessons(app: AppContext): Lesson[] {
  return app.db.all<Omit<Lesson, 'pinned'> & { pinned: number }>('SELECT * FROM note_lessons ORDER BY pinned DESC, times DESC, updated_at DESC').map((r) => ({ ...r, pinned: !!r.pinned }));
}

export function addLesson(app: AppContext, text: string): Lesson {
  const t = text.trim().slice(0, 300);
  if (t.length < 3) throw validation('Write a few words for the lesson.');
  const now = new Date().toISOString();
  const id = newId('lsn');
  app.db.insert('note_lessons', { id, text: t, times: 1, source: 'user', pinned: 0, created_at: now, updated_at: now });
  audit(app.db, 'user', 'notes.lesson_added', 'note_lesson', id, { text: t });
  return listLessons(app).find((l) => l.id === id)!;
}

/** Editing a lesson makes it yours, so the next read-through won't replace it. */
export function updateLesson(app: AppContext, id: string, patch: { text?: string; pinned?: boolean }): Lesson {
  const l = listLessons(app).find((x) => x.id === id);
  if (!l) throw notFound('Lesson', id);
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.text !== undefined) {
    const t = patch.text.trim().slice(0, 300);
    if (t.length < 3) throw validation('Write a few words for the lesson.');
    row.text = t;
    row.source = 'user';
  }
  if (patch.pinned !== undefined) row.pinned = patch.pinned ? 1 : 0;
  app.db.update('note_lessons', id, row);
  audit(app.db, 'user', 'notes.lesson_changed', 'note_lesson', id, { before: l.text, ...patch });
  return listLessons(app).find((x) => x.id === id)!;
}

export function deleteLesson(app: AppContext, id: string): void {
  const l = listLessons(app).find((x) => x.id === id);
  if (!l) throw notFound('Lesson', id);
  app.db.run('DELETE FROM note_lessons WHERE id = ?', id);
  audit(app.db, 'user', 'notes.lesson_deleted', 'note_lesson', id, { text: l.text });
}

// ---- Read-throughs -------------------------------------------------------------------------

type DigestRow = { id: string; started_at: string; finished_at: string | null; status: string; started_by: string; notes_read: number; lessons: number; error: string | null };

function lastGoodDigest(app: AppContext): DigestRow | undefined {
  return app.db.get<DigestRow>("SELECT * FROM note_digests WHERE status = 'succeeded' ORDER BY started_at DESC LIMIT 1");
}

export async function notesStatus(app: AppContext) {
  const last = lastGoodDigest(app);
  const latest = app.db.get<DigestRow>('SELECT * FROM note_digests ORDER BY started_at DESC LIMIT 1');
  const mode = await textMode(app).catch(() => ({ mode: 'deterministic' as const }));
  return {
    newSinceLastRead: allNotes(app, { since: last?.started_at }).total,
    totalNotes: allNotes(app).total,
    every: DIGEST_EVERY,
    lastRead: last ? { at: last.finished_at ?? last.started_at, notesRead: last.notes_read, lessons: last.lessons, by: last.started_by } : null,
    lastAttempt: latest ? { at: latest.started_at, status: latest.status, error: latest.error } : null,
    running: latest?.status === 'running',
    aiReady: mode.mode === 'ai',
  };
}

const Digest = z.object({
  lessons: z.array(z.object({
    text: z.string().min(5).max(240),
    times: z.number().int().min(1).max(10000),
  })).max(MAX_LESSONS),
});

/** The AI reads every note and rewrites the repeat-problems list. Pinned and owner-written lessons are kept. */
export async function digestNotes(app: AppContext, startedBy: 'auto' | 'manual'): Promise<{ notesRead: number; lessons: Lesson[] }> {
  const mode = await textMode(app).catch(() => ({ mode: 'deterministic' as const }));
  if (mode.mode !== 'ai') throw new ProviderError(app.settings.get('generation').textProvider, 'unconfigured', 'Reading your notes needs an AI provider key (Settings → AI providers).');
  // A read-through that crashed mid-way would block the next one forever; treat anything older than 15 minutes as dead.
  const stale = new Date(Date.now() - 15 * 60_000).toISOString();
  app.db.run("UPDATE note_digests SET status = 'failed', error = 'Did not finish', finished_at = ? WHERE status = 'running' AND started_at < ?", new Date().toISOString(), stale);
  if (app.db.get("SELECT 1 FROM note_digests WHERE status = 'running'")) throw conflict('The AI is already reading your notes.');
  const notes = allNotes(app, { limit: DIGEST_MAX_NOTES }).rows;
  if (!notes.length) throw validation('There are no notes to read yet.');
  const id = newId('ndg');
  const started = new Date().toISOString();
  app.db.insert('note_digests', { id, started_at: started, status: 'running', started_by: startedBy, notes_read: 0, lessons: 0 });
  try {
    const kept = listLessons(app).filter((l) => l.pinned || l.source === 'user');
    let lines = notes.map((n) => `- [${n.at.slice(0, 10)}] ${KIND_LABEL[n.kind]} "${n.title.slice(0, 60)}" (${n.productType})${n.warnings?.length ? ` warnings: ${n.warnings.join('; ').slice(0, 200)}` : ''}: ${n.notes.replace(/\s+/g, ' ').slice(0, 400)}`);
    let text = lines.join('\n');
    while (text.length > DIGEST_MAX_CHARS && lines.length > 20) { lines = lines.slice(0, Math.floor(lines.length * 0.8)); text = lines.join('\n'); }
    const r = await structuredCall(app, {
      purpose: 'notes:digest',
      schema: Digest,
      noBrief: true,
      system: `You read every review note the owner of a printable-products shop has written about the products their Factory made, and you turn them into a short list of standing rules for future work.
- Look hardest for things that come up more than once: repeat problems to avoid, and things the owner keeps liking. Put a clear, important one-off rule in too if the owner was emphatic.
- Each lesson is one plain, specific instruction a designer or writer can follow ("Keep checklist items under 8 words"), not a summary of a note.
- "times" is how many notes back the lesson up.
- Notes marked ACCEPTED AS-IS mean the owner looked at a QA warning and decided it was fine for that product. They are not complaints. Do not turn them into "do more of this"; at most they mean a check can be relaxed for that kind of product.
- Newer notes win when two notes disagree.
- At most ${MAX_LESSONS} lessons, most important first. Do not repeat the owner's own lessons listed below.`,
    prompt: `${kept.length ? `Owner's own lessons (already kept, don't repeat):\n${kept.map((l) => `- ${l.text}`).join('\n')}\n\n` : ''}All notes, newest first (${lines.length}${lines.length < notes.length ? ` of ${notes.length}, older ones left out for length` : ''}):\n${text}`,
    maxTokens: 1500,
    trace: {},
  });
    const now = new Date().toISOString();
    app.db.tx(() => {
      app.db.run("DELETE FROM note_lessons WHERE source = 'ai' AND pinned = 0");
      for (const l of r.data.lessons) app.db.insert('note_lessons', { id: newId('lsn'), text: l.text.trim(), times: l.times, source: 'ai', pinned: 0, created_at: now, updated_at: now });
      app.db.update('note_digests', id, { status: 'succeeded', finished_at: now, notes_read: lines.length, lessons: r.data.lessons.length });
    });
    audit(app.db, startedBy === 'auto' ? 'system' : 'user', 'notes.digested', 'note_digest', id, { notesRead: lines.length, lessons: r.data.lessons.length });
    return { notesRead: lines.length, lessons: listLessons(app) };
  } catch (err) {
    app.db.update('note_digests', id, { status: 'failed', finished_at: new Date().toISOString(), error: errorMessage(err).slice(0, 500) });
    throw err;
  }
}

/** After a note is written: once 10 new notes have piled up since the last read-through, read them in the background. */
export async function maybeDigest(app: AppContext): Promise<void> {
  try {
    const st = await notesStatus(app);
    if (!st.aiReady || st.running || st.newSinceLastRead < DIGEST_EVERY) return;
    await digestNotes(app, 'auto');
    app.log.info('Read your notes and updated the repeat-problems list', {});
  } catch (err) {
    app.log.warn('Automatic notes read-through failed', { err: errorMessage(err) });
  }
}
