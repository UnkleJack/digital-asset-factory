import type { AppContext } from '../../app/context.ts';
import { productType } from '../producttypes/registry.ts';
import { offlinePreviewBlocker } from '../research/preview.ts';
import { PaperSchema, type Paper } from '../templates/library.ts';
import { buildContextFromSpec, resolveParams } from './service.ts';
import { renderProduct } from '../rendering/renderProduct.ts';
import type { SpecRow } from '../../db/repos.ts';
import { json } from '../../db/sqlite.ts';
import { seededRandom } from '../../core/hash.ts';
import { AppError, validation } from '../../core/errors.ts';

/**
 * "Try it first": what a product will look like, drawn from the New product form's settings before anything is
 * created. Nothing is stored. Free, offline, no AI key.
 *
 * Procedural art (mandalas, patterns, mazes) is drawn from the seed, and the product's own artwork uses the same
 * seed, so the sample designs ARE the designs the product will get when it is created with that seed. The words
 * on the pages come from the built-in library here; when an AI key works, the real product's words may differ.
 */

export interface SampleInput {
  productType: string;
  title?: string;
  params?: Record<string, unknown>;
  paper?: Partial<Paper>;
  designSystemId?: string;
  audienceId?: string | null;
  themeId?: string | null;
  seed: number;
}

export interface SampleResult {
  seed: number;
  /** True when the art is the product's real art for this seed (procedural types). False when only a layout sample is shown. */
  artIsExact: boolean;
  /** The first designs, as SVG (procedural types only). */
  art: { name: string; svg: string }[];
  /** The first rendered pages as PNG data URLs; only when asked for, because Chrome draws them. */
  pages: string[];
  /** How many designs the product will have in all, when it's a design count. */
  totalArt: number;
}

const ART_SHOWN = 6;
const PAGE_DPI = 72;

export function sampleBlocker(productTypeId: string): string | null {
  return offlinePreviewBlocker(productTypeId);
}

export async function sampleProduct(app: AppContext, input: SampleInput, withPages: boolean): Promise<SampleResult> {
  const blocker = sampleBlocker(input.productType);
  if (blocker) throw new AppError('preview_unavailable', blocker, { httpStatus: 422 });
  const def = productType(input.productType);
  const template = app.db.get<{ default_params: string; default_design_system_id: string | null }>('SELECT default_params, default_design_system_id FROM templates WHERE product_type = ? ORDER BY is_builtin DESC, created_at LIMIT 1', def.id);
  const base = { ...(def.defaultParams(app.clock.now()) as object), ...json<Record<string, unknown>>(template?.default_params, {}) } as Record<string, unknown>;
  delete base.members;
  const params = resolveParams(def.id, base, input.params);
  const paper = PaperSchema.safeParse(input.paper ?? {});
  if (!paper.success) throw validation('Invalid paper settings');
  const designSystemId = input.designSystemId ?? template?.default_design_system_id ?? app.db.value<string>('SELECT id FROM design_systems ORDER BY is_builtin DESC, created_at LIMIT 1') ?? '';
  if (!app.db.get('SELECT 1 FROM design_systems WHERE id = ?', designSystemId)) throw validation('Unknown design system');
  for (const [table, id] of [['audiences', input.audienceId], ['themes', input.themeId]] as const) {
    if (id && !app.db.get(`SELECT 1 FROM ${table} WHERE id = ?`, id)) throw validation(`Unknown ${table.slice(0, -1)} ${id}`);
  }
  const spec: SpecRow = { id: 'sample', product_id: 'sample', product_type: def.id, params, design_system_id: designSystemId, audience_id: input.audienceId ?? null, theme_id: input.themeId ?? null, paper: paper.data, seed: input.seed, brief: '', created_at: new Date().toISOString() };
  const title = input.title?.trim() || def.defaultTitle({ ...buildContextFromSpec(app, spec, ''), title: undefined } as never);
  const ctx = buildContextFromSpec(app, spec, title);
  const content = def.contentSchema.parse(def.deterministicContent(ctx, seededRandom(ctx.seed)));
  // The same seeding the factory's own artwork step uses (generation/service.ts), so these are the real designs.
  const procedural = def.artwork === 'procedural' && !!def.generateArtwork;
  const artwork = procedural ? await def.generateArtwork!(ctx, content, seededRandom(ctx.seed ^ 0x5bd1e995), null) : [];
  const art = artwork.filter((a) => a.kind === 'svg').slice(0, ART_SHOWN).map((a) => ({ name: a.name, svg: String(a.data) }));
  let pages: string[] = [];
  if (withPages) {
    const out = await renderProduct(def, ctx, content, artwork, app.renderer, { fontsDir: app.paths.fontsDir, previewPages: 2, previewDpi: PAGE_DPI });
    pages = out.doc.previews.slice(0, 2).map((png) => `data:image/png;base64,${png.toString('base64')}`);
  }
  return { seed: input.seed, artIsExact: procedural, art, pages, totalArt: artwork.length };
}
