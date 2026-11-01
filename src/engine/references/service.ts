import { existsSync, rmSync } from 'node:fs';
import type { AppContext } from '../../app/context.ts';
import { newId, slugify } from '../../core/ids.ts';
import { sha256 } from '../../core/hash.ts';
import { conflict, notFound, validation } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import { localDay, safeSegment } from '../../storage/assetStore.ts';
import { createProduct } from '../specification/service.ts';
import { sniffImage } from './images.ts';
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
  | { status: 'duplicate'; existing: ReferenceRow; fileName: string }
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

export function listReferences(app: AppContext, kind?: 'image' | 'text'): ReferenceRow[] {
  return kind
    ? app.db.all<ReferenceRow>('SELECT * FROM reference_items WHERE kind = ? ORDER BY made_at DESC, created_at DESC', kind)
    : app.db.all<ReferenceRow>('SELECT * FROM reference_items ORDER BY made_at DESC, created_at DESC');
}

export function importReferenceImage(
  app: AppContext,
  input: { fileName: string; data: Buffer; label?: string; sourceTool?: string; prompt?: string; notes?: string; madeAt?: string },
  actor: AuditActor = 'user',
): ImportOutcome {
  const fileName = input.fileName.slice(0, 200);
  if (LOOKS_LIKE_SECRET.test(fileName)) return { status: 'rejected', fileName, reason: 'This looks like a password or key file, not an image. It was not imported. Keep it out of image folders.' };
  if (input.data.byteLength > MAX_IMAGE_BYTES) return { status: 'rejected', fileName, reason: `Larger than ${MAX_IMAGE_BYTES / 1048576} MB.` };
  const img = sniffImage(input.data);
  if (!img) return { status: 'rejected', fileName, reason: 'Not a PNG, JPEG, WebP or GIF image.' };
  const hash = sha256(input.data);
  const existing = app.db.get<ReferenceRow>('SELECT * FROM reference_items WHERE sha256 = ?', hash);
  if (existing) return { status: 'duplicate', existing, fileName };

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
    app.db.insert('reference_items', item as unknown as Record<string, unknown>);
  } catch (err) {
    rmSync(abs, { force: true });
    throw err;
  }
  audit(app.db, actor, 'reference.imported', 'reference', item.id, { kind: 'image', fileName, sourceTool: item.source_tool, rel });
  return { status: 'imported', item };
}

const FIELDS: ReferenceField[] = ['title', 'description', 'tags', 'page_text', 'other'];

export function importReferenceText(
  app: AppContext,
  input: { field: ReferenceField; text: string; label?: string; sourceTool?: string; notes?: string; madeAt?: string },
  actor: AuditActor = 'user',
): ImportOutcome {
  if (!FIELDS.includes(input.field)) throw validation(`Unknown kind of text: ${input.field}`);
  const text = input.text.replace(/\r\n/g, '\n').trim();
  if (text.length < 3) throw validation('The text is empty');
  if (text.length > 5000) throw validation('Keep each example under 5000 characters');
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();
  const hash = sha256(`text:${input.field}:${normalized}`);
  const existing = app.db.get<ReferenceRow>('SELECT * FROM reference_items WHERE sha256 = ?', hash);
  if (existing) return { status: 'duplicate', existing, fileName: '' };
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
  app.db.insert('reference_items', item as unknown as Record<string, unknown>);
  audit(app.db, actor, 'reference.imported', 'reference', item.id, { kind: 'text', field: input.field });
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
