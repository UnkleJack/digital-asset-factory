import { z } from 'zod';
import type { AppContext } from '../../app/context.ts';
import { newId } from '../../core/ids.ts';
import { hashObject } from '../../core/hash.ts';
import { validation, notFound, conflict } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import { parseCsv } from '../producttypes/sheets.ts';
import { productTypes } from '../producttypes/registry.ts';

const METRICS = ['views', 'favorites', 'orders', 'units', 'revenue_cents', 'refunds'] as const;
const REAL_SOURCES = ['marketplace_api', 'csv_import', 'manual_entry'] as const;

const PerfInput = z.object({
  listingId: z.string().optional(),
  productId: z.string().optional(),
  marketplace: z.string().max(40).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  metric: z.enum(METRICS),
  value: z.number().finite().min(0),
  sourceKind: z.enum(['manual_entry', 'estimate']),
  sourceDetail: z.string().max(500).optional(),
});

export function addPerformance(app: AppContext, input: unknown, actor: AuditActor = 'user'): string {
  const p = PerfInput.safeParse(input);
  if (!p.success) throw validation('Invalid performance entry', p.error.issues);
  const d = p.data;
  if (d.periodEnd < d.periodStart) throw validation('The period end is before its start');
  let productId = d.productId ?? null;
  let marketplace = d.marketplace ?? null;
  if (d.listingId) {
    const l = app.db.get<{ product_id: string; marketplace: string }>('SELECT product_id, marketplace FROM listings WHERE id = ?', d.listingId);
    if (!l) throw notFound('Listing', d.listingId);
    productId = l.product_id;
    marketplace = l.marketplace;
  }
  if (!productId) throw validation('Choose a product or listing');
  const id = newId('prf');
  app.db.insert('performance_observations', { id, listing_id: d.listingId ?? null, product_id: productId, marketplace, period_start: d.periodStart, period_end: d.periodEnd, metric: d.metric, value: d.value, source_kind: d.sourceKind, source_detail: d.sourceDetail ?? '', created_at: new Date().toISOString() });
  audit(app.db, actor, 'analytics.entry_added', 'performance', id, { metric: d.metric, sourceKind: d.sourceKind });
  return id;
}

const HEADERS = {
  date: ['date', 'sale_date', 'order_date', 'purchase_date', 'created_at'],
  ref: ['listing_id', 'external_id', 'product_id', 'listing', 'listing_url', 'url', 'item_name', 'product', 'product_name', 'title', 'name'],
  units: ['quantity', 'units', 'number_of_items', 'qty'],
  revenue: ['revenue', 'item_total', 'amount', 'price', 'order_value', 'total', 'sale_price'],
  views: ['views', 'visits'],
  favorites: ['favorites', 'favourites', 'likes'],
};

function moneyCents(raw: string): number | null {
  const v = Number(raw.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

export function importPerformanceCsv(app: AppContext, filename: string, text: string, marketplace: string, actor: AuditActor = 'user') {
  const rows = parseCsv(text);
  if (rows.length < 2) throw validation('The CSV needs a header row and at least one data row');
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const find = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const ci = { date: find(HEADERS.date), ref: find(HEADERS.ref), units: find(HEADERS.units), revenue: find(HEADERS.revenue), views: find(HEADERS.views), favorites: find(HEADERS.favorites) };
  if (ci.date < 0 || ci.ref < 0) throw validation(`The CSV needs a date column (${HEADERS.date.join('/')}) and a listing column (${HEADERS.ref.join('/')}). Found: ${header.join(', ')}`);
  const listings = app.db.all<{ id: string; product_id: string; title: string; ext_id: string | null; ext_url: string | null; product_title: string }>(`SELECT l.id, l.product_id, l.title, e.external_id AS ext_id, e.external_url AS ext_url, p.title AS product_title
    FROM listings l JOIN products p ON p.id = l.product_id LEFT JOIN external_listings e ON e.listing_id = l.id WHERE l.marketplace = ?`, marketplace);
  const match = (ref: string) => {
    const r = ref.trim().toLowerCase();
    return listings.find((l) => (l.ext_id && l.ext_id.toLowerCase() === r) || (l.ext_url && l.ext_url.toLowerCase() === r) || l.id === ref.trim() || l.title.toLowerCase() === r || l.product_title.toLowerCase() === r)
      ?? listings.find((l) => l.ext_url && r.includes('/listing/') && l.ext_id && r.includes(`/listing/${l.ext_id.toLowerCase()}`));
  };
  const importId = newId('imp');
  app.db.insert('data_imports', { id: importId, kind: `performance:${marketplace}`, filename: filename.slice(0, 200), rows_total: rows.length - 1, rows_imported: 0, rows_rejected: 0, errors: '[]', created_at: new Date().toISOString() });
  const errors: { row: number; message: string }[] = [];
  let ok = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = (r[ci.date] ?? '').trim();
    const iso = /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString().slice(0, 10) : null;
    const l = match(r[ci.ref] ?? '');
    if (!iso) { errors.push({ row: i + 1, message: `Unreadable date "${date}"` }); continue; }
    if (!l) { errors.push({ row: i + 1, message: `No listing matches "${(r[ci.ref] ?? '').slice(0, 80)}"` }); continue; }
    const add = (metric: string, value: number) => app.db.insert('performance_observations', { id: newId('prf'), listing_id: l.id, product_id: l.product_id, marketplace, period_start: iso, period_end: iso, metric, value, source_kind: 'csv_import', source_detail: filename.slice(0, 200), import_id: importId, created_at: new Date().toISOString() });
    app.db.tx(() => {
      if (ci.units >= 0 || ci.revenue >= 0) add('orders', 1);
      if (ci.units >= 0) add('units', Number(r[ci.units]) || 1);
      if (ci.revenue >= 0) {
        const c = moneyCents(r[ci.revenue] ?? '');
        if (c !== null) add('revenue_cents', c);
      }
      if (ci.views >= 0 && Number(r[ci.views])) add('views', Number(r[ci.views]));
      if (ci.favorites >= 0 && Number(r[ci.favorites])) add('favorites', Number(r[ci.favorites]));
    });
    ok++;
  }
  app.db.update('data_imports', importId, { rows_imported: ok, rows_rejected: errors.length, errors: JSON.stringify(errors.slice(0, 500)) });
  audit(app.db, actor, 'analytics.imported', 'import', importId, { filename, marketplace, ok, rejected: errors.length });
  return { importId, imported: ok, rejected: errors.length, errors: errors.slice(0, 50) };
}

export function metrics(app: AppContext) {
  const since30 = new Date(app.clock.now().getTime() - 30 * 86_400_000).toISOString();
  const production = {
    productsByStatus: app.db.all("SELECT v.status, count(*) AS n FROM products p JOIN product_versions v ON v.id = p.current_version_id WHERE p.status = 'active' GROUP BY v.status"),
    versionsLast30: app.db.value<number>('SELECT count(*) FROM product_versions WHERE created_at > ?', since30) ?? 0,
    avgPipelineMinutes: app.db.value<number>(`SELECT avg((julianday(fin) - julianday(st)) * 1440) FROM (SELECT min(created_at) AS st, max(finished_at) AS fin FROM jobs WHERE version_id IS NOT NULL AND status = 'succeeded' GROUP BY version_id HAVING sum(CASE WHEN type = 'prepare_listings' THEN 1 ELSE 0 END) > 0)`) ?? null,
    aiCost30: app.db.get<{ usd: number | null; unknown: number; runs: number }>("SELECT sum(cost_usd) AS usd, sum(CASE WHEN cost_basis = 'unknown' AND status = 'succeeded' THEN 1 ELSE 0 END) AS unknown, count(*) AS runs FROM generation_runs WHERE started_at > ?", since30),
    qaByType: app.db.all(`SELECT p.product_type AS type, count(*) AS runs, sum(CASE WHEN q.status = 'failed' THEN 1 ELSE 0 END) AS failed FROM qa_runs q JOIN product_versions v ON v.id = q.version_id JOIN products p ON p.id = v.product_id WHERE q.kind = 'deliverable' GROUP BY p.product_type ORDER BY runs DESC`),
    decisionsByType: app.db.all(`SELECT p.product_type AS type, d.decision, count(*) AS n FROM approval_decisions d JOIN product_versions v ON v.id = d.version_id JOIN products p ON p.id = v.product_id GROUP BY p.product_type, d.decision`),
    jobsFailed30: app.db.value<number>("SELECT count(*) FROM jobs WHERE status = 'failed' AND updated_at > ?", since30) ?? 0,
  };
  const listings = {
    byStatus: app.db.all('SELECT marketplace, status, count(*) AS n FROM listings GROUP BY marketplace, status'),
    published: app.db.all('SELECT marketplace, verification, count(*) AS n FROM external_listings GROUP BY marketplace, verification'),
  };
  const sales = {
    bySource: app.db.all('SELECT source_kind, metric, sum(value) AS total, count(*) AS rows FROM performance_observations GROUP BY source_kind, metric ORDER BY source_kind, metric'),
    byProduct: app.db.all(`SELECT p.id, p.title, p.product_type AS type, o.source_kind,
        sum(CASE WHEN o.metric = 'orders' THEN o.value ELSE 0 END) AS orders,
        sum(CASE WHEN o.metric = 'revenue_cents' THEN o.value ELSE 0 END) AS revenue_cents,
        sum(CASE WHEN o.metric = 'views' THEN o.value ELSE 0 END) AS views
      FROM performance_observations o JOIN products p ON p.id = o.product_id GROUP BY p.id, o.source_kind ORDER BY revenue_cents DESC LIMIT 100`),
    byCategory: app.db.all(`SELECT c.name AS category, o.source_kind, sum(CASE WHEN o.metric = 'orders' THEN o.value ELSE 0 END) AS orders, sum(CASE WHEN o.metric = 'revenue_cents' THEN o.value ELSE 0 END) AS revenue_cents
      FROM performance_observations o JOIN products p ON p.id = o.product_id LEFT JOIN categories c ON c.id = p.category_id GROUP BY c.name, o.source_kind`),
  };
  return { production, listings, sales, note: 'Sales figures are grouped by source (marketplace API, CSV import, manual entry, estimate) and are never combined.' };
}

interface Rec {
  kind: 'produce_more' | 'improve_template' | 'create_bundle' | 'retire_product' | 'run_experiment';
  title: string;
  rationale: string;
  evidence: Record<string, unknown>;
  confidence: number;
  subjectType: string | null;
  subjectId: string | null;
}

export function generateRecommendations(app: AppContext): { created: number; open: number } {
  const a = app.settings.get('analytics');
  const recs: Rec[] = [];
  const realSql = `o.source_kind IN (${REAL_SOURCES.map((s) => `'${s}'`).join(',')})`;

  const cats = app.db.all<{ category: string; category_id: string; published: number; orders: number; sources: string }>(`SELECT c.name AS category, c.id AS category_id,
      (SELECT count(DISTINCT e.listing_id) FROM external_listings e JOIN listings l ON l.id = e.listing_id JOIN products p2 ON p2.id = l.product_id WHERE p2.category_id = c.id) AS published,
      (SELECT coalesce(sum(o.value), 0) FROM performance_observations o JOIN products p3 ON p3.id = o.product_id WHERE p3.category_id = c.id AND o.metric = 'orders' AND ${realSql}) AS orders,
      (SELECT group_concat(DISTINCT o.source_kind) FROM performance_observations o JOIN products p4 ON p4.id = o.product_id WHERE p4.category_id = c.id AND ${realSql}) AS sources
    FROM categories c`);
  const strong = cats.filter((c) => c.published >= a.minListingsPerCategory && c.orders >= a.minOrdersForSignal).sort((x, y) => y.orders / y.published - x.orders / x.published);
  for (const c of strong.slice(0, 3)) {
    recs.push({ kind: 'produce_more', title: `Produce more ${c.category}`, rationale: `${c.orders} recorded orders across ${c.published} published listings (${(c.orders / c.published).toFixed(1)} per listing), the strongest in the shop.`, evidence: { orders: c.orders, publishedListings: c.published, sources: c.sources?.split(',') ?? [] }, confidence: Math.min(0.9, 0.4 + c.orders / 100), subjectType: 'category', subjectId: c.category_id });
  }

  const types = app.db.all<{ type: string; runs: number; failed: number }>(`SELECT p.product_type AS type, count(*) AS runs, sum(CASE WHEN q.status = 'failed' THEN 1 ELSE 0 END) AS failed FROM qa_runs q JOIN product_versions v ON v.id = q.version_id JOIN products p ON p.id = v.product_id WHERE q.kind = 'deliverable' GROUP BY p.product_type`);
  for (const t of types.filter((x) => x.runs >= 5 && x.failed / x.runs >= a.qaFailureRateAlert)) {
    const top = app.db.all<{ check_code: string; n: number }>(`SELECT r.check_code, count(*) AS n FROM qa_results r JOIN qa_runs q ON q.id = r.qa_run_id JOIN product_versions v ON v.id = q.version_id JOIN products p ON p.id = v.product_id WHERE p.product_type = ? AND r.passed = 0 AND r.severity = 'hard' GROUP BY r.check_code ORDER BY n DESC LIMIT 3`, t.type);
    recs.push({ kind: 'improve_template', title: `Improve the ${t.type} template`, rationale: `${t.failed} of ${t.runs} QA runs failed (${Math.round((100 * t.failed) / t.runs)}%). Most common: ${top.map((x) => x.check_code).join(', ') || 'n/a'}.`, evidence: { runs: t.runs, failed: t.failed, topChecks: top }, confidence: 0.8, subjectType: 'product_type', subjectId: t.type });
  }
  const rej = app.db.all<{ type: string; total: number; rejected: number }>(`SELECT p.product_type AS type, count(*) AS total, sum(CASE WHEN d.decision IN ('rejected','revision_requested','regenerate_requested') THEN 1 ELSE 0 END) AS rejected FROM approval_decisions d JOIN product_versions v ON v.id = d.version_id JOIN products p ON p.id = v.product_id GROUP BY p.product_type`);
  for (const t of rej.filter((x) => x.total >= 5 && x.rejected / x.total >= a.rejectionRateAlert)) {
    recs.push({ kind: 'improve_template', title: `Review why ${t.type} products are sent back`, rationale: `${t.rejected} of ${t.total} review decisions rejected or returned this product type.`, evidence: { decisions: t.total, sentBack: t.rejected }, confidence: 0.7, subjectType: 'product_type', subjectId: t.type });
  }

  const bundleable = app.db.all<{ category_id: string; category: string; n: number }>(`SELECT p.category_id, c.name AS category, count(*) AS n FROM products p JOIN product_versions v ON v.id = p.current_version_id JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'active' AND p.product_type <> 'bundle' AND v.status = 'approved' AND p.id NOT IN (SELECT member_product_id FROM bundle_items) GROUP BY p.category_id HAVING n >= 3`);
  for (const b of bundleable) recs.push({ kind: 'create_bundle', title: `Bundle ${b.n} approved ${b.category} products`, rationale: `${b.n} approved products in ${b.category} are not in any bundle yet.`, evidence: { products: b.n }, confidence: 0.5, subjectType: 'category', subjectId: b.category_id });

  const cutoff = new Date(app.clock.now().getTime() - a.retireAfterDays * 86_400_000).toISOString();
  const stale = app.db.all<{ listing_id: string; title: string; views: number | null; orders: number | null; since: string }>(`SELECT e.listing_id, l.title, e.created_at AS since,
      (SELECT sum(o.value) FROM performance_observations o WHERE o.listing_id = e.listing_id AND o.metric = 'views' AND ${realSql}) AS views,
      (SELECT sum(o.value) FROM performance_observations o WHERE o.listing_id = e.listing_id AND o.metric = 'orders' AND ${realSql}) AS orders
    FROM external_listings e JOIN listings l ON l.id = e.listing_id WHERE e.created_at < ? AND l.status <> 'retired'`, cutoff);
  for (const s of stale.filter((x) => x.views !== null && x.views <= a.retireMaxViews && !x.orders)) {
    recs.push({ kind: 'retire_product', title: `Consider retiring "${s.title}"`, rationale: `Published since ${s.since.slice(0, 10)} with ${s.views} recorded views and no recorded orders.`, evidence: { views: s.views, orders: 0, since: s.since }, confidence: 0.6, subjectType: 'listing', subjectId: s.listing_id });
  }

  const produced = new Set(app.db.all<{ t: string }>('SELECT DISTINCT product_type AS t FROM products').map((r) => r.t));
  const untried = productTypes().filter((t) => t.id !== 'bundle' && !produced.has(t.id));
  if (untried.length) recs.push({ kind: 'run_experiment', title: `Try a small run of ${untried.slice(0, 3).map((t) => t.name.toLowerCase()).join(', ')}`, rationale: 'These product types have never been produced, so there is no evidence about them either way. A small test batch would create some.', evidence: { untried: untried.map((t) => t.id), note: 'No data — this is an experiment suggestion, not a demand signal.' }, confidence: 0.2, subjectType: null, subjectId: null });

  let created = 0;
  for (const r of recs) {
    const fingerprint = hashObject({ k: r.kind, s: r.subjectType, i: r.subjectId, t: r.title });
    created += app.db.run(`INSERT OR IGNORE INTO recommendations (id, kind, title, rationale, evidence, confidence, subject_type, subject_id, fingerprint, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      newId('rec'), r.kind, r.title, r.rationale, JSON.stringify(r.evidence), r.confidence, r.subjectType, r.subjectId, fingerprint, new Date().toISOString()).changes;
  }
  return { created, open: app.db.value<number>("SELECT count(*) FROM recommendations WHERE status = 'open'") ?? 0 };
}

export function decideRecommendation(app: AppContext, id: string, status: 'accepted' | 'dismissed', actor: AuditActor = 'user'): void {
  const r = app.db.get<{ status: string }>('SELECT status FROM recommendations WHERE id = ?', id);
  if (!r) throw notFound('Recommendation', id);
  if (r.status !== 'open') throw conflict('This recommendation was already decided.');
  app.db.update('recommendations', id, { status, decided_at: new Date().toISOString() });
  audit(app.db, actor, `recommendation.${status}`, 'recommendation', id, {});
}
