import type { AppContext } from '../../app/context.ts';
import { productType } from '../producttypes/registry.ts';
import type { TypeContext } from '../producttypes/types.ts';
import { PaperSchema, DesignTokensSchema, AudienceProfileSchema, applyAudienceAndPaper, type Paper } from '../templates/library.ts';
import { getProduct, getSpec, getVersion, mapSpec, updateVersion, type ProductRow, type SpecRow, type VersionRow } from '../../db/repos.ts';
import { json } from '../../db/sqlite.ts';
import { newId, slugify } from '../../core/ids.ts';
import { hashObject, randomSeed } from '../../core/hash.ts';
import { validation, notFound, conflict } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import { designSystemWithFonts, type FontChoice } from '../templates/designSystems.ts';

export interface CreateProductInput {
  productType: string;
  title?: string;
  params?: Record<string, unknown>;
  paper?: Partial<Paper>;
  designSystemId?: string;
  audienceId?: string | null;
  themeId?: string | null;
  templateId?: string;
  opportunityId?: string | null;
  seed?: number;
  /** Overrides the design system's fonts (a matching custom design system is reused or created). */
  fonts?: FontChoice;
}

function zodIssues(err: { issues: { path: PropertyKey[]; message: string }[] }) {
  return err.issues.map((i) => ({ field: i.path.map(String).join('.'), message: i.message }));
}

export function resolveParams(productTypeId: string, base: Record<string, unknown>, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const def = productType(productTypeId);
  const parsed = def.paramsSchema.safeParse({ ...base, ...overrides });
  if (!parsed.success) throw validation(`Invalid parameters for ${def.name}`, zodIssues(parsed.error));
  return parsed.data as Record<string, unknown>;
}

function uniqueSlug(app: AppContext, title: string): string {
  const base = slugify(title);
  let slug = base;
  for (let i = 2; app.db.get('SELECT 1 FROM products WHERE slug = ?', slug); i++) slug = `${base}-${i}`;
  return slug;
}

export function buildContextFromSpec(app: AppContext, spec: SpecRow, title: string, revisionNotes = ''): TypeContext<unknown> {
  const ds = app.db.get<{ tokens: string }>('SELECT tokens FROM design_systems WHERE id = ?', spec.design_system_id);
  if (!ds) throw notFound('Design system', spec.design_system_id);
  const tokens = DesignTokensSchema.parse(JSON.parse(ds.tokens));
  const aud = spec.audience_id ? app.db.get<{ name: string; profile: string }>('SELECT name, profile FROM audiences WHERE id = ?', spec.audience_id) : undefined;
  const th = spec.theme_id ? app.db.get<{ name: string; keywords: string }>('SELECT name, keywords FROM themes WHERE id = ?', spec.theme_id) : undefined;
  const audience = aud ? { name: aud.name, profile: AudienceProfileSchema.parse(JSON.parse(aud.profile)) } : null;
  return {
    title,
    params: spec.params,
    paper: spec.paper,
    tokens: applyAudienceAndPaper(tokens, audience?.profile ?? null, spec.paper),
    audience,
    theme: th ? { name: th.name, keywords: json<string[]>(th.keywords, []) } : null,
    shopName: app.settings.get('general').shopName,
    seed: spec.seed,
    revisionNotes,
  };
}

export function versionContext(app: AppContext, versionId: string): { version: VersionRow; product: ProductRow; spec: SpecRow; ctx: TypeContext<unknown> } {
  const version = getVersion(app.db, versionId);
  const product = getProduct(app.db, version.product_id);
  const spec = getSpec(app.db, version.spec_id);
  return { version, product, spec, ctx: buildContextFromSpec(app, spec, product.title, version.revision_notes) };
}

export function createProduct(app: AppContext, input: CreateProductInput, actor: AuditActor = 'user'): { product: ProductRow; version: VersionRow; spec: SpecRow } {
  const def = productType(input.productType);
  const template = input.templateId
    ? app.db.get<{ default_params: string; default_design_system_id: string | null; product_type: string }>('SELECT default_params, default_design_system_id, product_type FROM templates WHERE id = ?', input.templateId)
    : app.db.get<{ default_params: string; default_design_system_id: string | null; product_type: string }>('SELECT default_params, default_design_system_id, product_type FROM templates WHERE product_type = ? ORDER BY is_builtin DESC, created_at LIMIT 1', def.id);
  if (input.templateId && !template) throw notFound('Template', input.templateId);
  if (template && template.product_type !== def.id) throw validation('Template belongs to a different product type');
  const base = def.id === 'bundle' ? {} : { ...(def.defaultParams(app.clock.now()) as object), ...json<Record<string, unknown>>(template?.default_params, {}) };
  if (def.id !== 'bundle') delete (base as Record<string, unknown>).members;
  const params = resolveParams(def.id, base, input.params);
  const paperParsed = PaperSchema.safeParse(input.paper ?? {});
  if (!paperParsed.success) throw validation('Invalid paper settings', zodIssues(paperParsed.error));
  const baseDesignSystemId = input.designSystemId ?? template?.default_design_system_id ?? app.db.value<string>('SELECT id FROM design_systems ORDER BY is_builtin DESC, created_at LIMIT 1');
  if (!baseDesignSystemId || !app.db.get('SELECT 1 FROM design_systems WHERE id = ?', baseDesignSystemId)) throw validation('Unknown design system');
  for (const [table, id] of [['audiences', input.audienceId], ['themes', input.themeId], ['opportunities', input.opportunityId]] as const) {
    if (id && !app.db.get(`SELECT 1 FROM ${table} WHERE id = ?`, id)) throw validation(`Unknown ${table.slice(0, -1)} ${id}`);
  }
  const designSystemId = input.fonts ? designSystemWithFonts(app, baseDesignSystemId, input.fonts, actor) : baseDesignSystemId;
  const now = new Date().toISOString();
  const productId = newId('prd');
  const specId = newId('spc');
  const versionId = newId('ver');
  const spec: SpecRow = { id: specId, product_id: productId, product_type: def.id, params, design_system_id: designSystemId, audience_id: input.audienceId ?? null, theme_id: input.themeId ?? null, paper: paperParsed.data, seed: input.seed ?? randomSeed(), created_at: now };
  const title = (input.title?.trim() || def.defaultTitle({ ...buildContextFromSpec(app, spec, ''), title: undefined } as never)).slice(0, 120);
  const categoryId = app.db.value<string>('SELECT id FROM categories WHERE name = ?', def.category) ?? null;
  app.db.tx(() => {
    app.db.insert('products', { id: productId, slug: uniqueSlug(app, title), title, product_type: def.id, category_id: categoryId, audience_id: spec.audience_id, theme_id: spec.theme_id, opportunity_id: input.opportunityId ?? null, template_id: input.templateId ?? null, status: 'active', current_version_id: versionId, created_at: now, updated_at: now });
    app.db.insert('product_specs', { ...spec, params: JSON.stringify(params), paper: JSON.stringify(spec.paper) });
    app.db.insert('product_versions', { id: versionId, product_id: productId, version_no: 1, spec_id: specId, origin: 'initial', stage: 'specified', status: 'in_progress', qa_status: 'pending', created_at: now, updated_at: now });
    audit(app.db, actor, 'product.created', 'product', productId, { productType: def.id, title });
  });
  return { product: getProduct(app.db, productId), version: getVersion(app.db, versionId), spec: getSpec(app.db, specId) };
}

export interface NewVersionInput {
  origin: 'regenerate' | 'revision' | 'edit' | 'variation';
  fromVersionId: string;
  revisionNotes?: string;
  changeNote?: string;
  specChanges?: { params?: Record<string, unknown>; paper?: Partial<Paper>; designSystemId?: string; audienceId?: string | null; themeId?: string | null; newSeed?: boolean };
  content?: unknown;
  copyContent?: boolean;
}

export function createVersion(app: AppContext, input: NewVersionInput, actor: AuditActor = 'user'): VersionRow {
  const from = getVersion(app.db, input.fromVersionId);
  const product = getProduct(app.db, from.product_id);
  if (product.current_version_id !== from.id) throw conflict('Only the current version can be revised; open the latest version instead.');
  const def = productType(product.product_type);
  let spec = getSpec(app.db, from.spec_id);
  const ch = input.specChanges;
  const now = new Date().toISOString();
  if (ch && (ch.params || ch.paper || ch.designSystemId || ch.audienceId !== undefined || ch.themeId !== undefined || ch.newSeed)) {
    const params = ch.params ? resolveParams(def.id, spec.params, ch.params) : spec.params;
    const paperParsed = PaperSchema.safeParse({ ...spec.paper, ...(ch.paper ?? {}) });
    if (!paperParsed.success) throw validation('Invalid paper settings', zodIssues(paperParsed.error));
    if (ch.designSystemId && !app.db.get('SELECT 1 FROM design_systems WHERE id = ?', ch.designSystemId)) throw validation('Unknown design system');
    const next: SpecRow = { ...spec, id: newId('spc'), params, paper: paperParsed.data, design_system_id: ch.designSystemId ?? spec.design_system_id, audience_id: ch.audienceId !== undefined ? ch.audienceId : spec.audience_id, theme_id: ch.themeId !== undefined ? ch.themeId : spec.theme_id, seed: ch.newSeed ? randomSeed() : spec.seed, created_at: now };
    app.db.insert('product_specs', { ...next, params: JSON.stringify(next.params), paper: JSON.stringify(next.paper) });
    spec = next;
  }
  let contentPatch: Record<string, unknown> = {};
  if (input.content !== undefined) {
    const parsed = def.contentSchema.safeParse(input.content);
    if (!parsed.success) throw validation('Edited content is invalid', zodIssues(parsed.error));
    contentPatch = { content: JSON.stringify(parsed.data), content_provenance: JSON.stringify({ generator: 'user_edit', basedOnVersion: from.id, previous: from.content_provenance }), content_signature: contentSignature(def.id, spec, parsed.data), stage: 'content_generated' };
  } else if (input.copyContent && from.content !== null) {
    contentPatch = { content: JSON.stringify(from.content), content_provenance: JSON.stringify({ ...(from.content_provenance ?? {}), copiedFromVersion: from.id }), content_signature: contentSignature(def.id, spec, from.content), stage: 'content_generated' };
  }
  const id = newId('ver');
  const versionNo = (app.db.value<number>('SELECT max(version_no) FROM product_versions WHERE product_id = ?', product.id) ?? 0) + 1;
  app.db.tx(() => {
    app.db.insert('product_versions', { id, product_id: product.id, version_no: versionNo, spec_id: spec.id, parent_version_id: from.id, origin: input.origin, change_note: input.changeNote ?? '', revision_notes: input.revisionNotes ?? '', stage: 'specified', status: 'in_progress', qa_status: 'pending', created_at: now, updated_at: now, ...contentPatch });
    updateVersion(app.db, from.id, { status: 'superseded' });
    const invalidated = app.db.run("UPDATE approval_decisions SET invalidated_at = ?, invalidated_reason = 'Superseded by a newer version' WHERE version_id = ? AND decision = 'approved' AND invalidated_at IS NULL", now, from.id).changes;
    if (invalidated) audit(app.db, actor, 'approval.invalidated', 'version', from.id, { reason: 'superseded', decisions: invalidated });
    app.db.update('products', product.id, { current_version_id: id, updated_at: now, audience_id: spec.audience_id, theme_id: spec.theme_id });
    audit(app.db, actor, `version.${input.origin}`, 'version', id, { productId: product.id, from: from.id, versionNo, notes: input.revisionNotes ?? input.changeNote ?? '' });
  });
  return getVersion(app.db, id);
}

export function contentSignature(productTypeId: string, spec: SpecRow, content: unknown): string {
  return hashObject({ t: productTypeId, p: spec.params, paper: spec.paper, d: spec.design_system_id, a: spec.audience_id, c: content });
}

export { mapSpec };
