import { existsSync, rmSync } from 'node:fs';
import type { AppContext } from '../../app/context.ts';
import { newId, slugify } from '../../core/ids.ts';
import { sha256 } from '../../core/hash.ts';
import { conflict, notFound, validation } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import { localDay, safeSegment } from '../../storage/assetStore.ts';
import { createProduct } from '../specification/service.ts';
import { sniffImage } from './images.ts';
import { readMandala, type MandalaReading } from './mandalaMatch.ts';
export { referenceImageAsPng } from './load.ts';

/**
 * The reference library: things made outside the Factory.
 *  - Images (from Grok Imagine, ChatGPT, Gemini, arena.ai, ...) are kept as they are and can be
 *    turned into coloring-page products.
 *  - Text you liked (titles, descriptions, tags, page text) is shown to the AI as examples of the
 *    style you want, next to the lessons learned from your review notes.
 * Every item is checked for an exact duplicate (same bytes, or same text) before it is stored.
 */

export type ReferenceField = 'title' | 'description' | 'tags' | 'page_text' | 'other';

export interface ReferenceRow {
  id: string;
  kind: 'image' | 'text';
  label: string;
  field: ReferenceField | null;
  body: string | null;
  source_tool: string;
  prompt: string;
  notes: string;
  original_name: string;
  rel_path: string | null;
  mime: string | null;
  size_bytes: number | null;
  width_px: number | null;
  height_px: number | null;
  sha256: string;
  use_as_example: number;
  made_at: string;
  created_at: string;
}

export type ImportOutcome =
  | { status: 'imported'; item: ReferenceRow }
  | { status: 'duplicate'; existing: ReferenceRow; fileName: string; tagsAdded?: number }
  | { status: 'rejected'; fileName: string; reason: string };

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const LOOKS_LIKE_SECRET = /client_secret|credential|secret|token|password|\.pem$|\.key$|\.p12$|id_rsa/i;
const MEANINGLESS_NAME = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|image|img|download|untitled)$/i;

/** A short name for what an image is: the label you gave, else the file name when it means something, else "image". */
export function referenceLabel(fileName: string, label?: string): string {
  if (label && label.trim()) return slugify(label, 40);
  const stem = fileName.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  return MEANINGLESS_NAME.test(stem) ? 'image' : slugify(stem, 40);
}

function validDate(s: string | undefined): string {
  const d = s ? new Date(s) : new Date();
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86_400_000 ? new Date().toISOString() : d.toISOString();
}

function freePath(app: AppContext, base: string, ext: string): string {
  for (let i = 1; ; i++) {
    // Numbered per name and day whatever the format, so mandala_2026-11-01.webp is followed by mandala_2026-11-01-2.jpg.
    const stem = `${base}${i === 1 ? '' : `-${i}`}`;
    const rel = `${stem}.${ext}`;
    const taken = app.db.get("SELECT 1 FROM reference_items WHERE rel_path LIKE ? ESCAPE '\\'", `${stem.replace(/[\\%_]/g, (c) => `\\${c}`)}.%`);
    if (!taken && !existsSync(app.assets.resolve(rel))) return rel;
  }
}

export function getReference(app: AppContext, id: string): ReferenceRow {
  const r = app.db.get<ReferenceRow>('SELECT * FROM reference_items WHERE id = ?', id);
  if (!r) throw notFound('Reference item', id);
  return r;
}

export function listReferences(app: AppContext, kind?: 'image' | 'text', tag?: string): ReferenceRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (kind) { where.push('kind = ?'); args.push(kind); }
  if (tag === UNTAGGED) where.push('NOT EXISTS (SELECT 1 FROM reference_tags t WHERE t.reference_id = reference_items.id)');
  else if (tag) { where.push('EXISTS (SELECT 1 FROM reference_tags t WHERE t.reference_id = reference_items.id AND t.tag = ?)'); args.push(tag); }
  return app.db.all<ReferenceRow>(
    `SELECT * FROM reference_items ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY made_at DESC, created_at DESC`,
    ...args,
  );
}

// ---- Tags: groups of like things. One item can sit in many groups (a font picture can be "fonts" and "art"). ----

/** Filter value meaning "items with no tags yet": the pile still to sort. Not a valid tag itself (tags never start with "_"). */
export const UNTAGGED = '_untagged';
export const MAX_TAGS_PER_ITEM = 12;

/** "Script Fonts!" → "script-fonts". Empty when nothing usable is left. */
export function normalizeTag(raw: string): string {
  // slugify() names an empty result "item" (right for file names, wrong for a tag), so blanks are caught first.
  if (!/[a-z0-9]/i.test(raw.normalize('NFKD'))) return '';
  return slugify(raw, 30);
}

function cleanTags(raw: string[] | undefined): string[] {
  return [...new Set((raw ?? []).map(normalizeTag).filter(Boolean))];
}

/** The tags on each of the given items, keyed by item id. Items with no tags are absent. */
export function tagsFor(app: AppContext, ids: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!ids.length) return out;
  // Chunked so a big library never goes past SQLite's limit on query parameters.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = app.db.all<{ reference_id: string; tag: string }>(
      `SELECT reference_id, tag FROM reference_tags WHERE reference_id IN (${chunk.map(() => '?').join(',')}) ORDER BY tag`,
      ...chunk,
    );
    for (const r of rows) out.set(r.reference_id, [...(out.get(r.reference_id) ?? []), r.tag]);
  }
  return out;
}

/** Every tag in use, with how many items carry it, most used first. */
export function listTags(app: AppContext, kind?: 'image' | 'text'): { tag: string; count: number }[] {
  return kind
    ? app.db.all(`SELECT t.tag, COUNT(*) AS count FROM reference_tags t JOIN reference_items r ON r.id = t.reference_id WHERE r.kind = ? GROUP BY t.tag ORDER BY count DESC, t.tag`, kind)
    : app.db.all(`SELECT tag, COUNT(*) AS count FROM reference_tags GROUP BY tag ORDER BY count DESC, tag`);
}

/**
 * Adds and removes tags on many items at once (the library's "tag selected" box, and imports).
 * Items already at the limit keep their tags and are reported, so nothing is dropped silently.
 */
export function tagReferences(app: AppContext, input: { ids: string[]; add?: string[]; remove?: string[] }, actor: AuditActor = 'user'): { changed: number; full: string[] } {
  const ids = [...new Set(input.ids)];
  const add = cleanTags(input.add);
  const remove = cleanTags(input.remove);
  if (!add.length && !remove.length) throw validation('Give at least one tag to add or remove');
  for (const id of ids) getReference(app, id);
  let changed = 0;
  const full: string[] = [];
  app.db.tx(() => {
    for (const id of ids) {
      for (const t of remove) changed += app.db.run('DELETE FROM reference_tags WHERE reference_id = ? AND tag = ?', id, t).changes;
      const have = new Set(tagsFor(app, [id]).get(id) ?? []);
      for (const t of add) {
        if (have.has(t)) continue;
        if (have.size >= MAX_TAGS_PER_ITEM) { full.push(id); break; }
        app.db.run('INSERT INTO reference_tags (reference_id, tag) VALUES (?, ?)', id, t);
        have.add(t);
        changed++;
      }
    }
  });
  if (changed) audit(app.db, actor, 'reference.tagged', 'reference', ids.length === 1 ? ids[0] : null, { count: ids.length, add, remove });
  return { changed, full };
}

export function importReferenceImage(
  app: AppContext,
  input: { fileName: string; data: Buffer; label?: string; sourceTool?: string; prompt?: string; notes?: string; madeAt?: string; tags?: string[] },
  actor: AuditActor = 'user',
): ImportOutcome {
  const fileName = input.fileName.slice(0, 200);
  if (LOOKS_LIKE_SECRET.test(fileName)) return { status: 'rejected', fileName, reason: 'This looks like a password or key file, not an image. It was not imported. Keep it out of image folders.' };
  if (input.data.byteLength > MAX_IMAGE_BYTES) return { status: 'rejected', fileName, reason: `Larger than ${MAX_IMAGE_BYTES / 1048576} MB.` };
  const img = sniffImage(input.data);
  if (!img) return { status: 'rejected', fileName, reason: 'Not a PNG, JPEG, WebP or GIF image.' };
  const hash = sha256(input.data);
  const existing = app.db.get<ReferenceRow>('SELECT * FROM reference_items WHERE sha256 = ?', hash);
  if (existing) return duplicateWithTags(app, existing, fileName, input.tags, actor);

  const madeAt = validDate(input.madeAt);
  const label = referenceLabel(fileName, input.label);
  const rel = freePath(app, `references/images/${safeSegment(`${label}_${localDay(madeAt)}`)}`, img.ext);
  const abs = app.assets.resolve(rel);
  const item: ReferenceRow = {
    id: newId('ref'),
    kind: 'image',
    label,
    field: null,
    body: null,
    source_tool: (input.sourceTool ?? '').trim().slice(0, 80),
    prompt: (input.prompt ?? '').trim().slice(0, 4000),
    notes: (input.notes ?? '').trim().slice(0, 2000),
    original_name: fileName,
    rel_path: rel,
    mime: img.mime,
    size_bytes: input.data.byteLength,
    width_px: img.widthPx,
    height_px: img.heightPx,
    sha256: hash,
    use_as_example: 1,
    made_at: madeAt,
    created_at: new Date().toISOString(),
  };
  app.assets.writeRaw(rel, input.data);
  try {
    app.db.tx(() => {
      app.db.insert('reference_items', item as unknown as Record<string, unknown>);
      insertTags(app, item.id, input.tags);
    });
  } catch (err) {
    rmSync(abs, { force: true });
    throw err;
  }
  audit(app.db, actor, 'reference.imported', 'reference', item.id, { kind: 'image', fileName, sourceTool: item.source_tool, rel, tags: cleanTags(input.tags) });
  return { status: 'imported', item };
}

function insertTags(app: AppContext, id: string, tags: string[] | undefined): void {
  for (const t of cleanTags(tags).slice(0, MAX_TAGS_PER_ITEM)) app.db.run('INSERT OR IGNORE INTO reference_tags (reference_id, tag) VALUES (?, ?)', id, t);
}

/**
 * Dropping something already in the library with tags typed in still sorts it: the tags go on the copy
 * that's there. That is how the 180 pictures imported before tags existed can be sorted by dropping them again.
 */
function duplicateWithTags(app: AppContext, existing: ReferenceRow, fileName: string, tags: string[] | undefined, actor: AuditActor): ImportOutcome {
  const add = cleanTags(tags);
  const tagged = add.length ? tagReferences(app, { ids: [existing.id], add }, actor).changed : 0;
  return { status: 'duplicate', existing, fileName, tagsAdded: tagged };
}

const FIELDS: ReferenceField[] = ['title', 'description', 'tags', 'page_text', 'other'];

export function importReferenceText(
  app: AppContext,
  input: { field: ReferenceField; text: string; label?: string; sourceTool?: string; notes?: string; madeAt?: string; tags?: string[] },
  actor: AuditActor = 'user',
): ImportOutcome {
  if (!FIELDS.includes(input.field)) throw validation(`Unknown kind of text: ${input.field}`);
  const text = input.text.replace(/\r\n/g, '\n').trim();
  if (text.length < 3) throw validation('The text is empty');
  if (text.length > 5000) throw validation('Keep each example under 5000 characters');
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();
  const hash = sha256(`text:${input.field}:${normalized}`);
  const existing = app.db.get<ReferenceRow>('SELECT * FROM reference_items WHERE sha256 = ?', hash);
  if (existing) return duplicateWithTags(app, existing, '', input.tags, actor);
  const madeAt = validDate(input.madeAt);
  const item: ReferenceRow = {
    id: newId('ref'),
    kind: 'text',
    label: input.label?.trim() ? slugify(input.label, 40) : input.field.replace('_', '-'),
    field: input.field,
    body: text,
    source_tool: (input.sourceTool ?? '').trim().slice(0, 80),
    prompt: '',
    notes: (input.notes ?? '').trim().slice(0, 2000),
    original_name: '',
    rel_path: null,
    mime: null,
    size_bytes: null,
    width_px: null,
    height_px: null,
    sha256: hash,
    use_as_example: 1,
    made_at: madeAt,
    created_at: new Date().toISOString(),
  };
  app.db.tx(() => {
    app.db.insert('reference_items', item as unknown as Record<string, unknown>);
    insertTags(app, item.id, input.tags);
  });
  audit(app.db, actor, 'reference.imported', 'reference', item.id, { kind: 'text', field: input.field, tags: cleanTags(input.tags) });
  return { status: 'imported', item };
}

export function updateReference(app: AppContext, id: string, patch: { label?: string; sourceTool?: string; prompt?: string; notes?: string; useAsExample?: boolean }): ReferenceRow {
  const r = getReference(app, id);
  const next: Record<string, unknown> = {};
  if (patch.label !== undefined && patch.label.trim()) next.label = slugify(patch.label, 40);
  if (patch.sourceTool !== undefined) next.source_tool = patch.sourceTool.trim().slice(0, 80);
  if (patch.prompt !== undefined) next.prompt = patch.prompt.trim().slice(0, 4000);
  if (patch.notes !== undefined) next.notes = patch.notes.trim().slice(0, 2000);
  if (patch.useAsExample !== undefined) next.use_as_example = patch.useAsExample ? 1 : 0;
  if (Object.keys(next).length) app.db.update('reference_items', r.id, next);
  return getReference(app, id);
}

/** Products whose specification uses this reference image. */
export function productsUsingReference(app: AppContext, id: string): { id: string; title: string }[] {
  return app.db.all<{ id: string; title: string }>(
    `SELECT DISTINCT p.id, p.title FROM product_specs s JOIN products p ON p.id = s.product_id
     WHERE s.product_type = 'imported-coloring' AND s.params LIKE ?`,
    `%"${id}"%`,
  );
}

export function deleteReference(app: AppContext, id: string, actor: AuditActor = 'user'): void {
  const r = getReference(app, id);
  const users = productsUsingReference(app, id);
  if (users.length) throw conflict(`This image is used by ${users.map((u) => `"${u.title}"`).join(', ')}. Archive those products first.`);
  if (r.rel_path) rmSync(app.assets.resolve(r.rel_path), { force: true });
  app.db.run('DELETE FROM reference_items WHERE id = ?', id);
  audit(app.db, actor, 'reference.deleted', 'reference', id, { kind: r.kind, label: r.label, sourceTool: r.source_tool });
}

/** Makes a coloring-page product from reference images, one image per page, in the order given. */
export function createProductFromReferences(app: AppContext, input: { referenceIds: string[]; title?: string; cover?: boolean; designSystemId?: string }, actor: AuditActor = 'user') {
  const ids = [...new Set(input.referenceIds)];
  if (!ids.length) throw validation('Pick at least one image');
  if (ids.length > 40) throw validation('At most 40 images per product');
  const rows = ids.map((id) => getReference(app, id));
  const notImages = rows.filter((r) => r.kind !== 'image');
  if (notImages.length) throw validation('Only images can become coloring pages');
  const labels = [...new Set(rows.map((r) => r.label).filter((l) => l !== 'image'))];
  const subject = labels.length === 1 ? labels[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
  const title = input.title?.trim() || `${subject ? `${subject} ` : ''}Coloring Pages`;
  return createProduct(app, { productType: 'imported-coloring', title, params: { references: ids, cover: input.cover ?? true }, designSystemId: input.designSystemId }, actor);
}

// ---- Reading a mandala picture ----

/** The picture is shrunk to this many pixels a side before it is read (see mandalaMatch.ts). */
const READ_SIZE = 256;

/** Reads an imported picture as a mandala: its repeat count and rough detail level. Nothing is changed or stored. */
export async function readMandalaFromReference(app: AppContext, id: string): Promise<MandalaReading & { referenceId: string }> {
  const r = getReference(app, id);
  if (r.kind !== 'image' || !r.rel_path || !existsSync(app.assets.resolve(r.rel_path))) throw validation('Only a picture can be read as a mandala.');
  const { grey } = await app.renderer.greySquare(app.assets.readRaw(r.rel_path), r.mime ?? 'image/png', READ_SIZE);
  return { referenceId: r.id, ...readMandala(grey, READ_SIZE) };
}
