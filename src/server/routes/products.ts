import { createReadStream } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { createProduct, resolveParams } from '../../engine/specification/service.ts';
import { startPipeline } from '../../jobs/pipeline.ts';
import { createBatch, addToBatch } from '../../engine/approval/batches.ts';
import { editVersion } from '../../engine/approval/service.ts';
import { createBundle, suggestBundleCopy, createVariation, relatedProducts, setProductStatus } from '../../engine/bundling/service.ts';
import { productTypes, describeType, productType } from '../../engine/producttypes/registry.ts';
import { DesignTokensSchema, AudienceProfileSchema, BUILTIN_DESIGN_SYSTEMS, PaperSchema, FONTS, FONT_IDS, FONT_PAIRINGS, type FontId } from '../../engine/templates/library.ts';
import { FontChoiceSchema } from '../../engine/templates/designSystems.ts';
import { renderProduct } from '../../engine/rendering/renderProduct.ts';
import { getProduct, getVersion, getSpec, listingsForVersion, nameOf } from '../../db/repos.ts';
import { json } from '../../db/sqlite.ts';
import { qaReport } from '../../engine/qa/service.ts';
import { retryJob } from '../../jobs/queue.ts';
import { seededRandom } from '../../core/hash.ts';
import { newId } from '../../core/ids.ts';
import { validation, notFound, conflict } from '../../core/errors.ts';
import { audit } from '../../logging/logger.ts';
import { int, parse, type Q, type P } from './util.ts';

const CreateBody = z.object({
  productType: z.string(),
  title: z.string().max(120).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  paper: PaperSchema.partial().optional(),
  designSystemId: z.string().optional(),
  audienceId: z.string().nullable().optional(),
  themeId: z.string().nullable().optional(),
  templateId: z.string().optional(),
  marketplaces: z.array(z.string()).optional(),
  batchId: z.string().optional(),
  fonts: FontChoiceSchema.optional(),
});

const previewCache = new Map<string, Buffer>();

export function registerProductRoutes(s: FastifyInstance, { app }: ServerDeps): void {
  s.get('/api/products', async (req) => {
    const q = req.query as Q;
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.type) { where.push('p.product_type = ?'); args.push(q.type); }
    if (q.status) { where.push('p.status = ?'); args.push(q.status); }
    if (q.versionStatus) { where.push('v.status = ?'); args.push(q.versionStatus); }
    if (q.category) { where.push('p.category_id = ?'); args.push(q.category); }
    if (q.q) { where.push('(p.title LIKE ? OR p.slug LIKE ?)'); args.push(`%${q.q}%`, `%${q.q}%`); }
    const sql = `FROM products p LEFT JOIN product_versions v ON v.id = p.current_version_id LEFT JOIN categories c ON c.id = p.category_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
    const total = app.db.value<number>(`SELECT count(*) ${sql}`, ...args) ?? 0;
    const rows = app.db.all<Record<string, unknown>>(`SELECT p.id, p.title, p.slug, p.product_type, p.status, p.updated_at, c.name AS category, v.id AS version_id, v.version_no, v.status AS version_status, v.stage, v.qa_status,
      (SELECT a.id FROM assets a WHERE a.version_id = v.id AND a.role = 'preview' ORDER BY a.page_index LIMIT 1) AS thumb,
      (SELECT count(*) FROM listings l WHERE l.product_id = p.id) AS listings,
      (SELECT count(*) FROM external_listings e JOIN listings l2 ON l2.id = e.listing_id WHERE l2.product_id = p.id) AS published
      ${sql} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`, ...args, int(q.limit, 50, 1, 200), int(q.offset, 0, 0, 1_000_000));
    return { total, items: rows };
  });

  s.post('/api/products', async (req) => {
    const b = parse(CreateBody, req.body, 'product');
    const { product, version } = createProduct(app, b);
    const batchId = b.batchId ?? createBatch(app, `Manual — ${product.title}`.slice(0, 120), 'manual');
    addToBatch(app, batchId, version.id);
    startPipeline(app, version.id, { marketplaces: b.marketplaces });
    return { productId: product.id, versionId: version.id, batchId };
  });

  s.get('/api/products/:id', async (req) => {
    const product = getProduct(app.db, (req.params as P).id);
    const versions = app.db.all<Record<string, unknown>>('SELECT id, version_no, origin, status, stage, qa_status, change_note, revision_notes, error, created_at FROM product_versions WHERE product_id = ? ORDER BY version_no DESC', product.id);
    return {
      product: { ...product, category: nameOf(app.db, 'categories', product.category_id), audience: nameOf(app.db, 'audiences', product.audience_id), theme: nameOf(app.db, 'themes', product.theme_id), opportunity: product.opportunity_id ? app.db.get('SELECT id, title, status FROM opportunities WHERE id = ?', product.opportunity_id) : null },
      versions,
      related: relatedProducts(app, product.id),
      batches: app.db.all('SELECT DISTINCT b.id, b.name, b.status FROM approval_items i JOIN approval_batches b ON b.id = i.batch_id WHERE i.product_id = ? ORDER BY b.created_at DESC', product.id),
    };
  });

  s.patch('/api/products/:id/status', async (req) => {
    const { status } = parse(z.object({ status: z.enum(['active', 'archived', 'retired']) }), req.body);
    setProductStatus(app, (req.params as P).id, status);
    return { ok: true };
  });

  s.get('/api/products/:id/related', async (req) => relatedProducts(app, (req.params as P).id));

  s.post('/api/products/:id/variations', async (req) => {
    const b = parse(z.object({ title: z.string().max(120).optional(), designSystemId: z.string().optional(), audienceId: z.string().nullable().optional(), themeId: z.string().nullable().optional(), paper: PaperSchema.partial().optional(), params: z.record(z.string(), z.unknown()).optional(), marketplaces: z.array(z.string()).optional(), fonts: FontChoiceSchema.optional(), newSeed: z.boolean().optional() }), req.body, 'variation');
    const r = createVariation(app, (req.params as P).id, { title: b.title, marketplaces: b.marketplaces, fonts: b.fonts, axes: { designSystemId: b.designSystemId, audienceId: b.audienceId, themeId: b.themeId, paper: b.paper, params: b.params, newSeed: b.newSeed } });
    const batch = createBatch(app, `Variation — ${getProduct(app.db, r.productId).title}`.slice(0, 120), 'manual');
    addToBatch(app, batch, r.versionId);
    return { ...r, batchId: batch };
  });

  s.post('/api/bundles/suggest-copy', async (req) => suggestBundleCopy(app, parse(z.object({ productIds: z.array(z.string()).min(2).max(20), theme: z.string().max(200).optional() }), req.body, 'bundle')));

  s.post('/api/bundles', async (req) => {
    const b = parse(z.object({ productIds: z.array(z.string()).min(2).max(20), title: z.string().max(120).optional(), pitch: z.string().max(1200).optional(), designSystemId: z.string().optional(), marketplaces: z.array(z.string()).optional() }), req.body, 'bundle');
    const r = createBundle(app, b);
    const batch = createBatch(app, `Bundle — ${getProduct(app.db, r.productId).title}`.slice(0, 120), 'manual');
    addToBatch(app, batch, r.versionId);
    return { ...r, batchId: batch };
  });

  s.get('/api/versions/:id', async (req) => {
    const version = getVersion(app.db, (req.params as P).id);
    const product = getProduct(app.db, version.product_id);
    const spec = getSpec(app.db, version.spec_id);
    const assets = app.assets.forVersion(version.id);
    return {
      version,
      product: { id: product.id, title: product.title, product_type: product.product_type, current_version_id: product.current_version_id },
      spec: { ...spec, designSystem: nameOf(app.db, 'design_systems', spec.design_system_id), audience: nameOf(app.db, 'audiences', spec.audience_id), theme: nameOf(app.db, 'themes', spec.theme_id) },
      assets: assets.map((a) => ({ id: a.id, kind: a.kind, role: a.role, name: basename(a.rel_path), mime: a.mime, bytes: a.size_bytes, pages: a.page_count, pageIndex: a.page_index, widthPx: a.width_px, heightPx: a.height_px, provenance: a.provenance })),
      qa: qaReport(app, version.id),
      listings: listingsForVersion(app.db, version.id),
      generationRuns: app.db.all('SELECT id, purpose, provider, model, input_tokens, output_tokens, image_count, cost_usd, cost_basis, status, error, started_at FROM generation_runs WHERE version_id = ? ORDER BY started_at', version.id),
      jobs: app.db.all('SELECT id, type, status, attempts, max_attempts, last_error, error_class, created_at, finished_at FROM jobs WHERE version_id = ? ORDER BY created_at', version.id),
      contentSchemaHint: productType(product.product_type).id,
    };
  });

  s.post('/api/versions/:id/edit', async (req) => {
    const b = parse(z.object({ content: z.unknown().optional(), params: z.record(z.string(), z.unknown()).optional(), paper: PaperSchema.partial().optional(), designSystemId: z.string().optional(), note: z.string().max(500).optional() }), req.body, 'edit');
    return editVersion(app, (req.params as P).id, b);
  });

  s.post('/api/versions/:id/retry', async (req) => {
    const v = getVersion(app.db, (req.params as P).id);
    if (!['failed', 'qa_failed'].includes(v.status)) throw conflict('Only failed versions can be retried. Use Regenerate in batch review to make a new version.');
    const failed = app.db.get<{ id: string }>("SELECT id FROM jobs WHERE version_id = ? AND status = 'failed' ORDER BY updated_at DESC LIMIT 1", v.id);
    if (!failed) throw conflict('No failed job to retry for this version. QA failures need a new version (edit or regenerate).');
    app.db.update('product_versions', v.id, { status: 'in_progress', error: null, updated_at: new Date().toISOString() });
    return retryJob(app, failed.id);
  });

  s.get('/api/assets/:id/file', async (req, reply) => {
    const a = app.assets.get((req.params as P).id);
    if (!app.assets.exists(a)) throw notFound('File for asset', a.id);
    const name = basename(a.rel_path).replace(/[^A-Za-z0-9._-]/g, '_');
    const download = (req.query as Q).download === '1' || !/^(image\/(png|svg\+xml)|application\/pdf)$/.test(a.mime);
    reply.header('Content-Type', a.mime);
    reply.header('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${name}"`);
    reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
    reply.header('Cache-Control', 'private, max-age=60');
    return reply.send(createReadStream(app.assets.pathOf(a)));
  });

  s.get('/api/product-types', async () => productTypes().map(describeType));

  s.get('/api/fonts', async () => ({
    fonts: FONT_IDS.map((id) => ({ id, family: FONTS[id].family, fallback: FONTS[id].fallback, license: FONTS[id].license })),
    pairings: FONT_PAIRINGS,
  }));

  // Lets the UI show each font in its own face. Only bundled font ids are accepted, so no path is user-controlled.
  s.get('/api/fonts/:id/sample.woff2', async (req, reply) => {
    const id = (req.params as P).id;
    if (!(FONT_IDS as readonly string[]).includes(id)) throw notFound('Font', id);
    reply.header('Content-Type', 'font/woff2');
    reply.header('Cache-Control', 'private, max-age=86400');
    return reply.send(createReadStream(join(app.paths.fontsDir, id, 'files', `${id as FontId}-latin-400-normal.woff2`)));
  });

  s.get('/api/design-systems', async () => app.db.all<Record<string, unknown>>('SELECT * FROM design_systems ORDER BY is_builtin DESC, name').map((d) => ({ ...d, tokens: json(d.tokens, {}), inUse: app.db.value<number>('SELECT count(*) FROM product_specs WHERE design_system_id = ?', d.id) ?? 0 })));

  s.post('/api/design-systems', async (req) => {
    const b = parse(z.object({ name: z.string().trim().min(2).max(60), description: z.string().max(300).default(''), tokens: DesignTokensSchema.optional(), basedOn: z.string().optional() }), req.body, 'design system');
    const base = b.basedOn ? app.db.get<{ tokens: string }>('SELECT tokens FROM design_systems WHERE id = ?', b.basedOn) : undefined;
    const tokens = b.tokens ?? (base ? DesignTokensSchema.parse(JSON.parse(base.tokens)) : BUILTIN_DESIGN_SYSTEMS[0].tokens);
    if (app.db.get('SELECT 1 FROM design_systems WHERE name = ?', b.name)) throw conflict('A design system with that name exists');
    const id = newId('dsn');
    const now = new Date().toISOString();
    app.db.insert('design_systems', { id, name: b.name, description: b.description, tokens: JSON.stringify(tokens), is_builtin: 0, created_at: now, updated_at: now });
    audit(app.db, 'user', 'design_system.created', 'design_system', id, { name: b.name });
    return { id };
  });

  s.patch('/api/design-systems/:id', async (req) => {
    const id = (req.params as P).id;
    const d = app.db.get<{ is_builtin: number }>('SELECT is_builtin FROM design_systems WHERE id = ?', id);
    if (!d) throw notFound('Design system', id);
    if (d.is_builtin) throw conflict('Built-in design systems cannot be changed. Duplicate it first.');
    const b = parse(z.object({ name: z.string().trim().min(2).max(60).optional(), description: z.string().max(300).optional(), tokens: DesignTokensSchema.optional() }), req.body, 'design system');
    app.db.update('design_systems', id, { name: b.name, description: b.description, tokens: b.tokens ? JSON.stringify(b.tokens) : undefined, updated_at: new Date().toISOString() });
    audit(app.db, 'user', 'design_system.updated', 'design_system', id, {});
    return { ok: true };
  });

  s.delete('/api/design-systems/:id', async (req) => {
    const id = (req.params as P).id;
    const d = app.db.get<{ is_builtin: number }>('SELECT is_builtin FROM design_systems WHERE id = ?', id);
    if (!d) throw notFound('Design system', id);
    if (d.is_builtin) throw conflict('Built-in design systems cannot be deleted.');
    if (app.db.get('SELECT 1 FROM product_specs WHERE design_system_id = ? UNION SELECT 1 FROM templates WHERE default_design_system_id = ?', id, id)) throw conflict('This design system is used by products or templates.');
    app.db.run('DELETE FROM design_systems WHERE id = ?', id);
    return { ok: true };
  });

  s.get('/api/design-systems/:id/preview.png', async (req, reply) => {
    const id = (req.params as P).id;
    const d = app.db.get<{ tokens: string; updated_at: string }>('SELECT tokens, updated_at FROM design_systems WHERE id = ?', id);
    if (!d) throw notFound('Design system', id);
    const key = `${id}:${d.updated_at}`;
    let png = previewCache.get(key);
    if (!png) {
      const def = productType('habit-tracker');
      const tokens = DesignTokensSchema.parse(JSON.parse(d.tokens));
      const base = { params: def.paramsSchema.parse({ year: new Date().getUTCFullYear(), months: 1 }), paper: { size: 'letter' as const, orientation: 'portrait' as const, grayscale: false }, tokens, audience: null, theme: null, shopName: app.settings.get('general').shopName, seed: 1, revisionNotes: '' };
      const ctx = { ...base, title: def.defaultTitle(base) };
      const out = await renderProduct(def, ctx, def.contentSchema.parse(def.deterministicContent(ctx, seededRandom(1))), [], app.renderer, { fontsDir: app.paths.fontsDir, previewPages: 1, previewDpi: 60 });
      png = out.doc.previews[0];
      previewCache.set(key, png);
    }
    reply.header('Content-Type', 'image/png');
    return reply.send(png);
  });

  s.get('/api/audiences', async () => app.db.all<Record<string, unknown>>('SELECT * FROM audiences ORDER BY is_builtin DESC, name').map((a) => ({ ...a, profile: json(a.profile, {}) })));
  s.post('/api/audiences', async (req) => {
    const b = parse(z.object({ name: z.string().trim().min(2).max(60), description: z.string().max(300).default(''), profile: AudienceProfileSchema }), req.body, 'audience');
    if (app.db.get('SELECT 1 FROM audiences WHERE name = ?', b.name)) throw conflict('An audience with that name exists');
    const id = newId('aud');
    app.db.insert('audiences', { id, name: b.name, description: b.description, profile: JSON.stringify(b.profile), is_builtin: 0, created_at: new Date().toISOString() });
    return { id };
  });
  s.get('/api/themes', async () => app.db.all<Record<string, unknown>>('SELECT * FROM themes ORDER BY is_builtin DESC, name').map((t) => ({ ...t, keywords: json(t.keywords, []), seasonal_months: json(t.seasonal_months, []) })));
  s.post('/api/themes', async (req) => {
    const b = parse(z.object({ name: z.string().trim().min(2).max(60), description: z.string().max(300).default(''), keywords: z.array(z.string().min(2).max(40)).max(12).default([]), seasonalMonths: z.array(z.number().int().min(1).max(12)).max(12).default([]) }), req.body, 'theme');
    if (app.db.get('SELECT 1 FROM themes WHERE name = ?', b.name)) throw conflict('A theme with that name exists');
    const id = newId('thm');
    app.db.insert('themes', { id, name: b.name, description: b.description, keywords: JSON.stringify(b.keywords), seasonal_months: JSON.stringify(b.seasonalMonths), is_builtin: 0, created_at: new Date().toISOString() });
    return { id };
  });
  s.get('/api/categories', async () => app.db.all('SELECT c.*, (SELECT count(*) FROM products p WHERE p.category_id = c.id) AS products FROM categories c ORDER BY name'));
  s.get('/api/templates', async () => app.db.all<Record<string, unknown>>('SELECT t.*, d.name AS design_system FROM templates t LEFT JOIN design_systems d ON d.id = t.default_design_system_id ORDER BY t.product_type, t.name').map((t) => ({ ...t, default_params: json(t.default_params, {}) })));
  s.patch('/api/templates/:id', async (req) => {
    const id = (req.params as P).id;
    const t = app.db.get<{ product_type: string; revision: number }>('SELECT product_type, revision FROM templates WHERE id = ?', id);
    if (!t) throw notFound('Template', id);
    const b = parse(z.object({ defaultParams: z.record(z.string(), z.unknown()).optional(), defaultDesignSystemId: z.string().optional(), description: z.string().max(300).optional() }), req.body, 'template');
    if (b.defaultDesignSystemId && !app.db.get('SELECT 1 FROM design_systems WHERE id = ?', b.defaultDesignSystemId)) throw validation('Unknown design system');
    const params = b.defaultParams && t.product_type !== 'bundle' ? resolveParams(t.product_type, productType(t.product_type).defaultParams(new Date()) as Record<string, unknown>, b.defaultParams) : undefined;
    app.db.update('templates', id, { default_params: params ? JSON.stringify(params) : undefined, default_design_system_id: b.defaultDesignSystemId, description: b.description, revision: t.revision + 1, updated_at: new Date().toISOString() });
    audit(app.db, 'user', 'template.updated', 'template', id, {});
    return { ok: true };
  });

  s.get('/api/versions/:id/content', async (req) => {
    const v = getVersion(app.db, (req.params as P).id);
    return { content: v.content, provenance: v.content_provenance };
  });
}
