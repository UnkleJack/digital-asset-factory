import { z } from 'zod';
import type { AppContext } from '../../app/context.ts';
import { json } from '../../db/sqlite.ts';
import { newId } from '../../core/ids.ts';
import { validation, notFound, ProviderError } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import { parseCsv } from '../producttypes/sheets.ts';
import { hasProductType, productTypes } from '../producttypes/registry.ts';
import { structuredCall, textMode } from '../generation/service.ts';
import { AI_SYSTEM_BASE } from '../producttypes/types.ts';

export const EVIDENCE_KINDS = ['measured', 'external_estimate', 'model_hypothesis', 'unknown'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const FACTORS = ['demand', 'competition', 'differentiation', 'commercial', 'productionCost', 'bundlePotential', 'seasonality', 'risk'] as const;
export type Factor = (typeof FACTORS)[number];

export const KNOWN_METRICS: Record<string, { factor: Factor; label: string; unit: string }> = {
  search_volume: { factor: 'demand', label: 'Monthly searches', unit: 'searches/month' },
  demand_rating: { factor: 'demand', label: 'Demand rating', unit: '0-10' },
  competing_listings: { factor: 'competition', label: 'Competing listings', unit: 'listings' },
  competition_rating: { factor: 'competition', label: 'Competition rating (10 = little competition)', unit: '0-10' },
  avg_price: { factor: 'commercial', label: 'Typical competitor price', unit: 'USD' },
  commercial_rating: { factor: 'commercial', label: 'Commercial potential rating', unit: '0-10' },
  differentiation_rating: { factor: 'differentiation', label: 'Differentiation rating', unit: '0-10' },
};

const ObservationInput = z.object({
  keyword: z.string().trim().min(2).max(120).optional(),
  opportunityId: z.string().optional(),
  marketplace: z.string().max(40).optional(),
  metric: z.string().trim().min(2).max(60),
  value: z.number().finite().optional(),
  valueText: z.string().max(500).optional(),
  unit: z.string().max(40).optional(),
  evidenceKind: z.enum(EVIDENCE_KINDS),
  source: z.string().trim().min(2).max(200),
  sourceDetail: z.string().max(1000).optional(),
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  notes: z.string().max(2000).optional(),
});
export type ObservationInput = z.infer<typeof ObservationInput>;

function keywordId(app: AppContext, phrase: string): string {
  const existing = app.db.value<string>('SELECT id FROM keywords WHERE phrase = ? COLLATE NOCASE', phrase);
  if (existing) return existing;
  const id = newId('kwd');
  app.db.insert('keywords', { id, phrase, created_at: new Date().toISOString() });
  return id;
}

export function addObservation(app: AppContext, input: unknown, importId: string | null = null, actor: AuditActor = 'user'): string {
  const p = ObservationInput.safeParse(input);
  if (!p.success) throw validation('Invalid observation', p.error.issues);
  const o = p.data;
  if (!o.keyword && !o.opportunityId) throw validation('An observation needs a keyword or an opportunity');
  if (o.opportunityId && !app.db.get('SELECT 1 FROM opportunities WHERE id = ?', o.opportunityId)) throw notFound('Opportunity', o.opportunityId);
  if (o.value === undefined && !o.valueText) throw validation('Provide a numeric value or a text value');
  if (o.evidenceKind === 'unknown' && o.value !== undefined) throw validation('A value cannot have evidence kind "unknown"; choose measured, external estimate or model hypothesis');
  const id = newId('obs');
  app.db.insert('research_observations', {
    id, keyword_id: o.keyword ? keywordId(app, o.keyword) : null, opportunity_id: o.opportunityId ?? null, marketplace: o.marketplace ?? null, metric: o.metric,
    value_num: o.value ?? null, value_text: o.valueText ?? null, unit: o.unit ?? KNOWN_METRICS[o.metric]?.unit ?? null, evidence_kind: o.evidenceKind, source: o.source,
    source_detail: o.sourceDetail ?? '', observed_at: o.observedAt ?? new Date().toISOString().slice(0, 10), notes: o.notes ?? '', import_id: importId, created_at: new Date().toISOString(),
  });
  if (!importId) audit(app.db, actor, 'research.observation_added', 'observation', id, { metric: o.metric, evidence: o.evidenceKind });
  return id;
}

export function importObservationsCsv(app: AppContext, filename: string, text: string, defaults: { evidenceKind?: EvidenceKind; source?: string } = {}, actor: AuditActor = 'user') {
  const rows = parseCsv(text);
  if (rows.length < 2) throw validation('The CSV needs a header row and at least one data row');
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (r: string[], ...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0 && r[i]?.trim()) return r[i].trim();
    }
    return undefined;
  };
  const importId = newId('imp');
  const errors: { row: number; message: string }[] = [];
  let ok = 0;
  app.db.insert('data_imports', { id: importId, kind: 'research_observations', filename: filename.slice(0, 200), rows_total: rows.length - 1, rows_imported: 0, rows_rejected: 0, errors: '[]', created_at: new Date().toISOString() });
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    try {
      const raw = col(r, 'value', 'volume', 'searches');
      const num = raw !== undefined ? Number(raw.replace(/[, $]/g, '')) : undefined;
      if (raw !== undefined && !Number.isFinite(num)) throw new Error(`value "${raw}" is not a number`);
      app.db.tx(() => addObservation(app, {
        keyword: col(r, 'keyword', 'phrase', 'search_term'), opportunityId: col(r, 'opportunity_id'), marketplace: col(r, 'marketplace'),
        metric: col(r, 'metric') ?? (raw !== undefined ? 'search_volume' : ''), value: num, valueText: col(r, 'value_text', 'text'), unit: col(r, 'unit'),
        evidenceKind: (col(r, 'evidence_kind', 'evidence') ?? defaults.evidenceKind) as EvidenceKind, source: col(r, 'source') ?? defaults.source ?? filename,
        observedAt: col(r, 'observed_at', 'date'), notes: col(r, 'notes'),
      }, importId));
      ok++;
    } catch (err) {
      const msg = err instanceof Error && 'details' in err && Array.isArray((err as { details: unknown }).details)
        ? ((err as { details: { path: string[]; message: string }[] }).details.map((d) => `${d.path.join('.')}: ${d.message}`).join('; '))
        : (err as Error).message;
      errors.push({ row: i + 1, message: msg.slice(0, 300) });
    }
  }
  app.db.update('data_imports', importId, { rows_imported: ok, rows_rejected: errors.length, errors: JSON.stringify(errors.slice(0, 500)) });
  audit(app.db, actor, 'research.imported', 'import', importId, { filename, ok, rejected: errors.length });
  return { importId, imported: ok, rejected: errors.length, errors: errors.slice(0, 50) };
}

const FactorInput = z.object({ value: z.number().min(0).max(10), evidence: z.enum(EVIDENCE_KINDS), note: z.string().max(500).optional() });
const OpportunityInput = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().max(4000).default(''),
  productType: z.string(),
  categoryId: z.string().nullable().optional(),
  audienceId: z.string().nullable().optional(),
  themeId: z.string().nullable().optional(),
  keywords: z.array(z.string().trim().min(2).max(120)).max(30).default([]),
  seasonalMonths: z.array(z.number().int().min(1).max(12)).max(12).default([]),
  differentiationNote: z.string().max(2000).default(''),
  inputs: z.partialRecord(z.enum(FACTORS), FactorInput).default({}),
});

export function createOpportunity(app: AppContext, input: unknown, origin: 'manual' | 'csv_import' | 'ai_suggestion' = 'manual', originDetails: Record<string, unknown> = {}, actor: AuditActor = 'user'): string {
  const p = OpportunityInput.safeParse(input);
  if (!p.success) throw validation('Invalid opportunity', p.error.issues);
  const o = p.data;
  if (!hasProductType(o.productType)) throw validation(`Unknown product type ${o.productType}`);
  for (const [t, id] of [['categories', o.categoryId], ['audiences', o.audienceId], ['themes', o.themeId]] as const) if (id && !app.db.get(`SELECT 1 FROM ${t} WHERE id = ?`, id)) throw validation(`Unknown ${t} ${id}`);
  const id = newId('opp');
  const now = new Date().toISOString();
  const categoryId = o.categoryId ?? app.db.value<string>('SELECT id FROM categories WHERE name = ?', productTypes().find((t) => t.id === o.productType)!.category) ?? null;
  app.db.tx(() => {
    app.db.insert('opportunities', {
      id, title: o.title, description: o.description, product_type: o.productType, category_id: categoryId, audience_id: o.audienceId ?? null, theme_id: o.themeId ?? null,
      keyword_ids: JSON.stringify(o.keywords.map((k) => keywordId(app, k))), seasonal_months: JSON.stringify(o.seasonalMonths), differentiation_note: o.differentiationNote,
      inputs: JSON.stringify(o.inputs), status: 'new', origin, origin_details: JSON.stringify(originDetails), created_at: now, updated_at: now,
    });
    audit(app.db, actor, 'opportunity.created', 'opportunity', id, { title: o.title, origin });
  });
  return id;
}

const OpportunityPatch = OpportunityInput.partial().extend({ status: z.enum(['new', 'evaluating', 'approved', 'rejected', 'produced', 'archived']).optional() });

export function updateOpportunity(app: AppContext, id: string, patch: unknown, actor: AuditActor = 'user'): void {
  if (!app.db.get('SELECT 1 FROM opportunities WHERE id = ?', id)) throw notFound('Opportunity', id);
  const p = OpportunityPatch.safeParse(patch);
  if (!p.success) throw validation('Invalid opportunity changes', p.error.issues);
  const o = p.data;
  if (o.productType && !hasProductType(o.productType)) throw validation(`Unknown product type ${o.productType}`);
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (o.title !== undefined) row.title = o.title;
  if (o.description !== undefined) row.description = o.description;
  if (o.productType !== undefined) row.product_type = o.productType;
  if (o.categoryId !== undefined) row.category_id = o.categoryId;
  if (o.audienceId !== undefined) row.audience_id = o.audienceId;
  if (o.themeId !== undefined) row.theme_id = o.themeId;
  if (o.keywords !== undefined) row.keyword_ids = JSON.stringify(o.keywords.map((k) => keywordId(app, k)));
  if (o.seasonalMonths !== undefined) row.seasonal_months = JSON.stringify(o.seasonalMonths);
  if (o.differentiationNote !== undefined) row.differentiation_note = o.differentiationNote;
  if (o.inputs !== undefined) row.inputs = JSON.stringify(o.inputs);
  if (o.status !== undefined) row.status = o.status;
  app.db.update('opportunities', id, row);
  audit(app.db, actor, 'opportunity.updated', 'opportunity', id, { fields: Object.keys(o) });
}

export interface OpportunityRow {
  id: string;
  title: string;
  description: string;
  product_type: string;
  category_id: string | null;
  audience_id: string | null;
  theme_id: string | null;
  differentiation_note: string;
  status: 'new' | 'evaluating' | 'approved' | 'rejected' | 'produced' | 'archived';
  origin: 'manual' | 'csv_import' | 'ai_suggestion';
  created_at: string;
  updated_at: string;
}

export function getOpportunity(app: AppContext, id: string) {
  const o = app.db.get<OpportunityRow & Record<string, unknown>>('SELECT * FROM opportunities WHERE id = ?', id);
  if (!o) throw notFound('Opportunity', id);
  const keywordIds = json<string[]>(o.keyword_ids, []);
  const keywords = keywordIds.length ? app.db.all<{ id: string; phrase: string }>(`SELECT id, phrase FROM keywords WHERE id IN (${keywordIds.map(() => '?').join(',')})`, ...keywordIds) : [];
  return { ...o, keyword_ids: keywordIds, keywords: keywords.map((k) => k.phrase), seasonal_months: json<number[]>(o.seasonal_months, []), inputs: json<Record<string, unknown>>(o.inputs, {}), origin_details: json(o.origin_details, {}) };
}

export function observationsFor(app: AppContext, opportunityId: string) {
  const o = getOpportunity(app, opportunityId);
  const ids = o.keyword_ids;
  return app.db.all<Record<string, unknown>>(`SELECT r.*, k.phrase AS keyword FROM research_observations r LEFT JOIN keywords k ON k.id = r.keyword_id
    WHERE r.opportunity_id = ? ${ids.length ? `OR r.keyword_id IN (${ids.map(() => '?').join(',')})` : ''} ORDER BY r.observed_at DESC, r.created_at DESC`, opportunityId, ...ids);
}

const Suggestions = z.object({
  ideas: z.array(z.object({
    title: z.string().min(5).max(120),
    productType: z.string(),
    description: z.string().min(10).max(600),
    differentiation: z.string().min(10).max(400),
    keywords: z.array(z.string().min(2).max(60)).min(2).max(8),
    seasonalMonths: z.array(z.number().int().min(1).max(12)).max(12),
  })).min(1).max(20),
});

export async function suggestOpportunities(app: AppContext, input: { count?: number; focus?: string }, actor: AuditActor = 'user'): Promise<string[]> {
  const mode = await textMode(app).catch(() => ({ mode: 'deterministic' as const, reason: 'AI provider not configured' }));
  if (mode.mode !== 'ai') throw new ProviderError(app.settings.get('generation').textProvider, 'unconfigured', 'AI opportunity suggestions need an AI provider. Add opportunities manually or import research data instead.');
  const count = Math.min(10, Math.max(1, input.count ?? 5));
  const types = productTypes().filter((t) => t.id !== 'bundle').map((t) => `${t.id} (${t.name}: ${t.description})`).join('\n');
  const existing = app.db.all<{ title: string }>('SELECT title FROM opportunities ORDER BY created_at DESC LIMIT 60').map((r) => r.title);
  const r = await structuredCall(app, {
    purpose: 'research:suggest',
    schema: Suggestions,
    system: `${AI_SYSTEM_BASE}\n- You propose product ideas only. Do not state or invent search volumes, sales figures, prices, rankings or demand statistics; those are unknown to you.`,
    prompt: `Today is ${new Date().toISOString().slice(0, 10)}. Suggest ${count} distinct printable product ideas for an independent digital-download shop${input.focus ? ` with this focus: ${input.focus}` : ''}.
Allowed product types (use the id exactly):\n${types}
Avoid repeating these existing ideas: ${existing.join('; ') || 'none'}.
For each idea return title, productType, description, differentiation (what would make it different from typical listings), 2-8 keywords a buyer might search, and seasonalMonths (1-12, empty if evergreen).`,
    maxTokens: 8000,
    trace: {},
  });
  const ids: string[] = [];
  for (const idea of r.data.ideas) {
    if (!hasProductType(idea.productType) || idea.productType === 'bundle') continue;
    ids.push(createOpportunity(app, {
      title: idea.title, description: idea.description, productType: idea.productType, keywords: idea.keywords, seasonalMonths: idea.seasonalMonths,
      differentiationNote: idea.differentiation, inputs: {},
    }, 'ai_suggestion', { model: r.provenance.model, generationRunIds: r.provenance.generationRunIds, evidence: 'model_hypothesis' }, actor));
  }
  return ids;
}
