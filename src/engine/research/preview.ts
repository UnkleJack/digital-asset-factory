import { existsSync, readFileSync, rmSync } from 'node:fs';
import type { AppContext } from '../../app/context.ts';
import { hasProductType, productType } from '../producttypes/registry.ts';
import { CONTENT_LIBRARY_REVISION } from '../producttypes/library.ts';
import { PaperSchema } from '../templates/library.ts';
import { buildContextFromSpec, resolveParams } from '../specification/service.ts';
import { renderProduct } from '../rendering/renderProduct.ts';
import type { SpecRow } from '../../db/repos.ts';
import { json } from '../../db/sqlite.ts';
import { hashObject, seededRandom, sha256 } from '../../core/hash.ts';
import { AppError, notFound } from '../../core/errors.ts';
import { getOpportunity } from './service.ts';

// Opportunity previews: a sample first page of the idea's product type, drawn offline with the
// built-in content library and the idea's title, audience and theme. Free and needs no AI key.
// It shows what that kind of product looks like, not the finished product: the idea's own
// extras (its differentiation note) are not drawn, and the screen labels it as a sample.
// Made only when the owner presses a button, then kept under research/previews/ in the asset folder:
// page 1 (usually the cover) and, when there is one, the first inside page.

/** Bump when the way previews are drawn changes, so older pictures show as out of date. */
const PREVIEW_FORMAT = 1;
const PREVIEW_DPI = 72;
/** The cover alone says little, so the first inside page is kept too when the product has one. */
const PREVIEW_PAGES = 2;

export interface PreviewInfo {
  /** The page that best shows the product at a glance: the first inside page, or page 1 if there is only one. */
  url: string;
  /** Every stored page, in order (page 1 first). */
  pages: string[];
  madeAt: string;
  /** True when the idea's title, type, audience or theme (or the design) changed since it was made. */
  stale: boolean;
  kind: 'offline_sample';
}

interface PreviewMeta {
  key: string;
  madeAt: string;
  productType: string;
  pages: number;
  kind: 'offline_sample';
}

const pngRel = (id: string, page = 1) => `research/previews/${id}${page > 1 ? `-p${page}` : ''}.png`;
const metaRel = (id: string) => `research/previews/${id}.json`;

type OppLike = { id: string; title: string; product_type: string; audience_id: string | null; theme_id: string | null };

/** The same choices Produce now would make: the type's first template, its design system, default paper. */
function previewSpec(app: AppContext, o: OppLike): { spec: SpecRow; designUpdatedAt: string | null } {
  const def = productType(o.product_type);
  const template = app.db.get<{ default_params: string; default_design_system_id: string | null }>('SELECT default_params, default_design_system_id FROM templates WHERE product_type = ? ORDER BY is_builtin DESC, created_at LIMIT 1', def.id);
  const base = { ...(def.defaultParams(app.clock.now()) as object), ...json<Record<string, unknown>>(template?.default_params, {}) };
  delete (base as Record<string, unknown>).members;
  const params = resolveParams(def.id, base);
  const designSystemId = template?.default_design_system_id ?? app.db.value<string>('SELECT id FROM design_systems ORDER BY is_builtin DESC, created_at LIMIT 1') ?? '';
  const designUpdatedAt = app.db.value<string>('SELECT updated_at FROM design_systems WHERE id = ?', designSystemId) ?? null;
  // A seed fixed per idea, so remaking an unchanged idea draws the same page.
  const seed = parseInt(sha256(o.id).slice(0, 8), 16);
  const spec: SpecRow = { id: `preview_${o.id}`, product_id: o.id, product_type: def.id, params, design_system_id: designSystemId, audience_id: o.audience_id, theme_id: o.theme_id, paper: PaperSchema.parse({}), seed, created_at: new Date().toISOString() };
  return { spec, designUpdatedAt };
}

/** Everything that changes the picture. If any of it changes, the stored preview is out of date. */
function previewKey(app: AppContext, o: OppLike): string {
  const { spec, designUpdatedAt } = previewSpec(app, o);
  return hashObject({ format: PREVIEW_FORMAT, library: CONTENT_LIBRARY_REVISION, type: o.product_type, title: o.title, audience: o.audience_id, theme: o.theme_id, design: spec.design_system_id, designUpdatedAt });
}

function readMeta(app: AppContext, id: string): PreviewMeta | null {
  const abs = app.assets.resolve(metaRel(id));
  if (!existsSync(abs) || !existsSync(app.assets.resolve(pngRel(id)))) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as PreviewMeta;
  } catch {
    return null;
  }
}

/** Why a type can't get an offline preview, or null if it can. */
export function offlinePreviewBlocker(productTypeId: string): string | null {
  if (!hasProductType(productTypeId)) return 'This product type is no longer in the factory, so there is no sample page to preview.';
  const def = productType(productTypeId);
  if (def.artwork === 'ai-image') return `${def.name} are drawn by an AI image provider, so there is no free offline sample for them.`;
  if (def.importOnly || def.id === 'bundle') return `${def.name} have no sample page to preview.`;
  return null;
}

/** The stored preview for an idea, if one was made. */
export function previewInfo(app: AppContext, o: OppLike): PreviewInfo | null {
  const meta = readMeta(app, o.id);
  if (!meta) return null;
  let stale = true;
  try {
    stale = meta.key !== previewKey(app, o);
  } catch {
    // The type or design system is gone: keep showing the old picture, marked out of date.
  }
  const v = encodeURIComponent(meta.madeAt);
  const pages = Array.from({ length: Math.max(1, meta.pages ?? 1) }, (_, i) => `/api/opportunities/${o.id}/preview.png?page=${i + 1}&v=${v}`);
  return { url: pages[pages.length - 1], pages, madeAt: meta.madeAt, stale, kind: meta.kind };
}

/** Draws the first pages of the idea's product type offline and stores it, replacing any older preview. */
export async function makeOpportunityPreview(app: AppContext, id: string): Promise<PreviewInfo> {
  const o = getOpportunity(app, id);
  const blocker = offlinePreviewBlocker(o.product_type);
  if (blocker) throw new AppError('preview_unavailable', blocker, { httpStatus: 422 });
  const def = productType(o.product_type);
  const { spec } = previewSpec(app, o);
  const ctx = buildContextFromSpec(app, spec, o.title);
  const content = def.contentSchema.parse(def.deterministicContent(ctx, seededRandom(ctx.seed)));
  // Procedural art (mandalas, mazes) is drawn offline too; no image provider is ever called.
  const artwork = def.generateArtwork && def.artwork === 'procedural' ? await def.generateArtwork(ctx, content, seededRandom(ctx.seed ^ 0x5bd1e995), null) : [];
  const out = await renderProduct(def, ctx, content, artwork, app.renderer, { fontsDir: app.paths.fontsDir, previewPages: PREVIEW_PAGES, previewDpi: PREVIEW_DPI });
  const pngs = out.doc.previews.slice(0, PREVIEW_PAGES);
  if (!pngs.length) throw new AppError('preview_failed', 'The page was drawn but no picture came back. Try again.', { httpStatus: 500 });
  const meta: PreviewMeta = { key: previewKey(app, o), madeAt: new Date().toISOString(), productType: o.product_type, pages: pngs.length, kind: 'offline_sample' };
  for (let page = 1; page <= PREVIEW_PAGES; page++) rmSync(app.assets.resolve(pngRel(id, page)), { force: true });
  pngs.forEach((png, i) => app.assets.writeRaw(pngRel(id, i + 1), png));
  app.assets.writeRaw(metaRel(id), Buffer.from(JSON.stringify(meta, null, 2)));
  return previewInfo(app, o)!;
}

export function previewPng(app: AppContext, id: string, page = 1): Buffer {
  const abs = app.assets.resolve(pngRel(id, Number.isInteger(page) && page >= 1 && page <= PREVIEW_PAGES ? page : 1));
  if (!existsSync(abs)) throw notFound('Preview for opportunity', id);
  return readFileSync(abs);
}
