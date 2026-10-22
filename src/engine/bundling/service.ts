import type { AppContext } from '../../app/context.ts';
import { createProduct } from '../specification/service.ts';
import { startPipeline } from '../../jobs/pipeline.ts';
import { getProduct, getVersion, getSpec } from '../../db/repos.ts';
import { newId } from '../../core/ids.ts';
import { validation, conflict } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import { jaccard } from '../qa/service.ts';
import { productType } from '../producttypes/registry.ts';
import type { Paper } from '../templates/library.ts';
import { designSystemWithFonts, type FontChoice } from '../templates/designSystems.ts';
import { z } from 'zod';
import { structuredCall, textMode } from '../generation/service.ts';
import { AI_SYSTEM_BASE } from '../producttypes/types.ts';
import { ProviderError } from '../../core/errors.ts';

export function createBundle(app: AppContext, input: { productIds: string[]; title?: string; pitch?: string; designSystemId?: string; marketplaces?: string[] }, actor: AuditActor = 'user') {
  const ids = [...new Set(input.productIds)];
  if (ids.length < 2) throw validation('A bundle needs at least two products');
  const members = ids.map((id) => {
    const p = getProduct(app.db, id);
    if (p.product_type === 'bundle') throw validation('Bundles cannot contain other bundles');
    if (!p.current_version_id) throw validation(`"${p.title}" has no version`);
    const v = getVersion(app.db, p.current_version_id);
    if (!['passed', 'passed_with_warnings'].includes(v.qa_status) || !['ready', 'approved'].includes(v.status)) throw validation(`"${p.title}" must pass QA (and not be rejected) before it can be bundled`);
    const files = app.assets.forVersion(v.id, 'deliverable').filter((a) => !['package_zip', 'license', 'instructions'].includes(a.kind));
    const pdf = files.find((a) => a.kind === 'pdf');
    return { productId: p.id, versionId: v.id, title: p.title, productType: p.product_type, pageCount: pdf?.page_count ?? 0, files: files.map((f) => f.rel_path.split('/').pop()!) };
  });
  const { product, version } = createProduct(app, { productType: 'bundle', title: input.title, params: { members, ...(input.pitch?.trim() && { pitch: input.pitch.trim().slice(0, 1200) }) }, designSystemId: input.designSystemId }, actor);
  app.db.tx(() => {
    members.forEach((m, i) => {
      app.db.insert('bundle_items', { bundle_product_id: product.id, member_product_id: m.productId, position: i });
      app.db.run('INSERT OR IGNORE INTO product_relationships (id, from_product_id, to_product_id, kind, details, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId('rel'), product.id, m.productId, 'bundle_member', JSON.stringify({ versionId: m.versionId, position: i }), new Date().toISOString());
    });
  });
  startPipeline(app, version.id, { marketplaces: input.marketplaces });
  audit(app.db, actor, 'bundle.created', 'product', product.id, { members: ids });
  return { productId: product.id, versionId: version.id };
}

export interface VariationAxes {
  designSystemId?: string;
  audienceId?: string | null;
  themeId?: string | null;
  paper?: Partial<Paper>;
  params?: Record<string, unknown>;
  /** A fresh random seed (new mandala patterns, mazes, puzzle layouts). Every variation gets a new seed; this makes it count as the change. */
  newSeed?: boolean;
}

export function createVariation(app: AppContext, productId: string, input: { axes: VariationAxes; title?: string; marketplaces?: string[]; fonts?: FontChoice }, actor: AuditActor = 'user') {
  const src = getProduct(app.db, productId);
  if (src.product_type === 'bundle') throw validation('Create a new bundle instead of a bundle variation');
  const v = getVersion(app.db, src.current_version_id!);
  const spec = getSpec(app.db, v.spec_id);
  const ax = input.fonts ? { ...input.axes, designSystemId: designSystemWithFonts(app, input.axes.designSystemId ?? spec.design_system_id, input.fonts, actor) } : input.axes;
  const paper = { ...spec.paper, ...(ax.paper ?? {}) };
  const params = { ...spec.params, ...(ax.params ?? {}) };
  const changed: string[] = [];
  if (ax.designSystemId && ax.designSystemId !== spec.design_system_id) changed.push('design');
  if (ax.audienceId !== undefined && ax.audienceId !== spec.audience_id) changed.push('audience');
  if (ax.themeId !== undefined && ax.themeId !== spec.theme_id) changed.push('theme');
  if (JSON.stringify(paper) !== JSON.stringify(spec.paper)) changed.push('paper');
  if (JSON.stringify(params) !== JSON.stringify(spec.params)) changed.push('parameters');
  if (ax.newSeed) changed.push('seed');
  if (!changed.length) throw validation('A variation must change at least one of: design, audience, theme, paper, parameters or seed. A title change alone is not a variation.');
  const { product, version } = createProduct(app, {
    productType: src.product_type, title: input.title, params, paper, designSystemId: ax.designSystemId ?? spec.design_system_id,
    audienceId: ax.audienceId !== undefined ? ax.audienceId : spec.audience_id, themeId: ax.themeId !== undefined ? ax.themeId : spec.theme_id, opportunityId: src.opportunity_id,
  }, actor);
  if (product.title === src.title) {
    app.db.update('products', product.id, { title: `${src.title} (${changed.join(', ')} variation)`.slice(0, 120) });
  }
  app.db.insert('product_relationships', { id: newId('rel'), from_product_id: product.id, to_product_id: src.id, kind: 'variation_of', details: JSON.stringify({ axes: changed, sourceVersionId: v.id }), created_at: new Date().toISOString() });
  startPipeline(app, version.id, { marketplaces: input.marketplaces });
  audit(app.db, actor, 'product.variation_created', 'product', product.id, { from: src.id, axes: changed });
  return { productId: product.id, versionId: version.id, axes: changed };
}

export function relatedProducts(app: AppContext, productId: string) {
  const p = getProduct(app.db, productId);
  const relationships = app.db.all(`SELECT r.kind, r.details, r.from_product_id, r.to_product_id, p1.title AS from_title, p2.title AS to_title FROM product_relationships r
    JOIN products p1 ON p1.id = r.from_product_id JOIN products p2 ON p2.id = r.to_product_id WHERE r.from_product_id = ? OR r.to_product_id = ?`, productId, productId);
  const sameCategory = app.db.all<{ id: string; title: string; product_type: string }>("SELECT id, title, product_type FROM products WHERE category_id IS ? AND id <> ? AND status = 'active' ORDER BY updated_at DESC LIMIT 12", p.category_id, productId);
  const mine = p.current_version_id ? getVersion(app.db, p.current_version_id) : null;
  const def = productType(p.product_type);
  const words = (c: unknown) => new Set((def.qaText(c).join(' ').toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 3));
  const mergeCandidates: { id: string; title: string; similarity: number }[] = [];
  if (mine?.content) {
    const a = words(mine.content);
    for (const o of app.db.all<{ id: string; title: string; content: string | null }>("SELECT p.id, p.title, v.content FROM products p JOIN product_versions v ON v.id = p.current_version_id WHERE p.product_type = ? AND p.id <> ? AND p.status = 'active'", p.product_type, productId)) {
      if (!o.content) continue;
      const sim = jaccard(a, words(JSON.parse(o.content)));
      if (sim >= 0.6) mergeCandidates.push({ id: o.id, title: o.title, similarity: Math.round(sim * 100) / 100 });
    }
  }
  return { relationships, sameCategory, mergeCandidates: mergeCandidates.sort((x, y) => y.similarity - x.similarity).slice(0, 5) };
}

export function setProductStatus(app: AppContext, productId: string, status: 'active' | 'archived' | 'retired', actor: AuditActor = 'user'): void {
  const p = getProduct(app.db, productId);
  if (status !== 'active' && app.db.get("SELECT 1 FROM jobs WHERE product_id = ? AND status IN ('queued','running')", productId)) throw conflict('Wait for production to finish first.');
  app.db.update('products', productId, { status, updated_at: new Date().toISOString() });
  if (status === 'retired') app.db.run("UPDATE listings SET status = 'retired', updated_at = ? WHERE product_id = ? AND status NOT IN ('published_manual','published_verified')", new Date().toISOString(), productId);
  audit(app.db, actor, `product.${status}`, 'product', p.id, {});
}

const BundleCopy = z.object({
  titles: z.array(z.string().min(5).max(140)).min(2).max(5),
  pitch: z.string().min(20).max(1200),
});

/**
 * Suggests pack titles and a short description from the chosen products. A draft for the
 * operator to pick from and edit before creating the bundle; nothing is saved here.
 */
export async function suggestBundleCopy(app: AppContext, input: { productIds: string[]; theme?: string }): Promise<{ titles: string[]; pitch: string; model: string | undefined }> {
  const ids = [...new Set(input.productIds)];
  if (ids.length < 2) throw validation('Pick at least two products first');
  const mode = await textMode(app).catch(() => ({ mode: 'deterministic' as const }));
  if (mode.mode !== 'ai') throw new ProviderError(app.settings.get('generation').textProvider, 'unconfigured', 'Title and description suggestions need an AI provider key (Settings → AI providers).');
  const items = ids.map((id) => {
    const p = getProduct(app.db, id);
    const spec = p.current_version_id ? getSpec(app.db, getVersion(app.db, p.current_version_id).spec_id) : null;
    const theme = spec?.theme_id ? app.db.value<string>('SELECT name FROM themes WHERE id = ?', spec.theme_id) : null;
    const audience = spec?.audience_id ? app.db.value<string>('SELECT name FROM audiences WHERE id = ?', spec.audience_id) : null;
    return `- ${p.title} (${productType(p.product_type).name}${theme ? `, theme ${theme}` : ''}${audience ? `, for ${audience}` : ''})`;
  });
  const r = await structuredCall(app, {
    purpose: 'bundle:suggest-copy',
    schema: BundleCopy,
    system: `${AI_SYSTEM_BASE}
- You name and describe printable bundles for marketplace listings. Titles lead with what a buyer would search for. No prices, ratings or sales claims.`,
    prompt: `These printables are going into one bundle:
${items.join('\n')}
${input.theme ? `The seller's theme for the pack: ${input.theme}\n` : ''}Suggest 3 distinct titles (max 140 characters each) and one pitch: 2-4 sentences saying who it is for and what problem the set solves together.`,
    maxTokens: 1500,
    trace: {},
  });
  return { titles: r.data.titles, pitch: r.data.pitch, model: r.provenance.model };
}
