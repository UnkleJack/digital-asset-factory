import type { AppContext } from '../../app/context.ts';
import { metrics } from '../analytics/service.ts';
import { CHARACTERS } from './service.ts';
import { worldsFor } from './worlds.ts';

// The stats ticker on the arcade hub (owner request, 2026-11-05): the stats the owner cares about, at a
// glance, chosen from a list of every stat the factory can report. Every value comes from numbers the
// factory already records, mostly metrics() behind the back-office Analytics page.
// Rules:
// - Nothing invented (Constitution Art. 5.2). Anything about the outside world (sales, live listings) with
//   nothing recorded is null and shows as NO DATA. A 0 is only shown when 0 was actually recorded, or for
//   the factory's own counts, where the factory knows the true number.
// - Sales from different sources are never added together (the Analytics page rule), so each source is its
//   own stat. Estimates are labelled as estimates.

export type TickerGroup = 'Arcade' | 'Production' | 'AI' | 'Listings' | 'Sales';
export type TickerUnit = 'count' | 'usd' | 'cents' | 'minutes' | 'percent';

export interface TickerStat {
  id: string;
  label: string;
  group: TickerGroup;
  unit: TickerUnit;
  /** One line on what the number means, shown in the EDIT list. */
  help: string;
}

export interface TickerValue extends TickerStat {
  /** null = nothing recorded: shown as NO DATA. */
  value: number | null;
  /** Extra context, e.g. "of 7" or "3 calls with unknown cost". */
  note?: string;
  /** True for the arcade's test credits, which are never live data. */
  test?: boolean;
}

type Metrics = ReturnType<typeof metrics>;
interface Ctx { app: AppContext; m: Metrics; character: string | null }
interface Def extends TickerStat { read: (c: Ctx) => { value: number | null; note?: string; test?: boolean } }

const MARKETPLACES = [['etsy', 'Etsy'], ['gumroad', 'Gumroad'], ['generic', 'Other shops']] as const;
const SOURCES = [['marketplace_api', 'from the shop'], ['csv_import', 'CSV import'], ['manual_entry', 'typed in'], ['estimate', 'estimate']] as const;
const SALES_METRICS = [['orders', 'Orders', 'count'], ['revenue_cents', 'Revenue', 'cents'], ['units', 'Units sold', 'count'], ['views', 'Views', 'count'], ['favorites', 'Favorites', 'count'], ['refunds', 'Refunds', 'count']] as const;

const rows = <T>(x: unknown) => x as T[];
const statusCount = (m: Metrics, status: string) => rows<{ status: string; n: number }>(m.production.productsByStatus).find((r) => r.status === status)?.n ?? 0;

const DEFS: Def[] = [
  // ---------- Arcade ----------
  {
    id: 'arcade.openTasks', label: 'Open tasks', group: 'Arcade', unit: 'count', help: 'Open, in-progress and blocked tasks for the character you picked, across all worlds.',
    read: ({ app, character }) => {
      if (!character || !CHARACTERS.some((c) => c.id === character)) return { value: null, note: 'pick a character' };
      return { value: worldsFor(app, character).reduce((n, w) => n + w.tasksLeft, 0) };
    },
  },
  { id: 'arcade.worlds', label: 'Active worlds', group: 'Arcade', unit: 'count', help: 'Worlds that are not archived.', read: ({ app }) => ({ value: app.db.value<number>("SELECT count(*) FROM worlds WHERE status = 'active'") ?? 0 }) },
  {
    id: 'arcade.milestones', label: 'Milestones done', group: 'Arcade', unit: 'count', help: 'Completed milestones in active worlds, out of all of them.',
    read: ({ app }) => {
      const r = app.db.get<{ total: number; done: number | null }>("SELECT count(*) AS total, sum(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END) AS done FROM world_milestones m JOIN worlds w ON w.id = m.world_id WHERE w.status = 'active'")!;
      return { value: r.done ?? 0, note: `of ${r.total}` };
    },
  },
  { id: 'arcade.draftsReady', label: 'AI drafts waiting', group: 'Arcade', unit: 'count', help: 'World Builder drafts the AI has finished that you have not saved or discarded yet.', read: ({ app }) => ({ value: app.db.value<number>("SELECT count(*) FROM world_drafts WHERE status = 'ready'") ?? 0 }) },
  { id: 'arcade.credits', label: 'Credits', group: 'Arcade', unit: 'count', help: 'The arcade credit meter. A test number from Settings until live provider credits are built.', read: ({ app }) => ({ value: app.settings.get('arcade').testCredits, test: true }) },

  // ---------- Production (the factory's own counts: 0 is a real 0) ----------
  { id: 'products.active', label: 'Products', group: 'Production', unit: 'count', help: 'Active products in the library.', read: ({ m }) => ({ value: rows<{ n: number }>(m.production.productsByStatus).reduce((n, r) => n + r.n, 0) }) },
  { id: 'products.ready', label: 'Ready for review', group: 'Production', unit: 'count', help: 'Products whose current version passed QA and waits for your approval.', read: ({ m }) => ({ value: statusCount(m, 'ready') }) },
  { id: 'products.approved', label: 'Approved products', group: 'Production', unit: 'count', help: 'Products whose current version you approved.', read: ({ m }) => ({ value: statusCount(m, 'approved') }) },
  { id: 'products.qaFailed', label: 'Failing QA', group: 'Production', unit: 'count', help: 'Products whose current version failed QA.', read: ({ m }) => ({ value: statusCount(m, 'qa_failed') }) },
  { id: 'production.versions30', label: 'Made in 30 days', group: 'Production', unit: 'count', help: 'Product versions made in the last 30 days.', read: ({ m }) => ({ value: m.production.versionsLast30 }) },
  {
    id: 'production.pipelineMinutes', label: 'Minutes per product', group: 'Production', unit: 'minutes', help: 'Average time from a product starting to its last job finishing.',
    read: ({ m }) => ({ value: typeof m.production.avgPipelineMinutes === 'number' ? m.production.avgPipelineMinutes : null }),
  },
  { id: 'production.jobsFailed30', label: 'Failed jobs, 30 days', group: 'Production', unit: 'count', help: 'Factory jobs that failed in the last 30 days.', read: ({ m }) => ({ value: m.production.jobsFailed30 }) },
  {
    id: 'qa.failRate', label: 'QA fail rate', group: 'Production', unit: 'percent', help: 'Share of all QA runs that failed.',
    read: ({ m }) => {
      const q = rows<{ runs: number; failed: number | null }>(m.production.qaByType);
      const runs = q.reduce((n, r) => n + r.runs, 0);
      return runs ? { value: (100 * q.reduce((n, r) => n + (r.failed ?? 0), 0)) / runs, note: `${runs} runs` } : { value: null };
    },
  },
  {
    id: 'review.approved', label: 'Approvals', group: 'Production', unit: 'count', help: 'Review decisions that approved a product.',
    read: ({ m }) => ({ value: rows<{ decision: string; n: number }>(m.production.decisionsByType).filter((r) => r.decision === 'approved').reduce((n, r) => n + r.n, 0) }),
  },
  {
    id: 'review.sentBack', label: 'Rejected or sent back', group: 'Production', unit: 'count', help: 'Review decisions that rejected a product or asked for a revision or a regenerate.',
    read: ({ m }) => ({ value: rows<{ decision: string; n: number }>(m.production.decisionsByType).filter((r) => r.decision !== 'approved').reduce((n, r) => n + r.n, 0) }),
  },

  // ---------- AI ----------
  {
    id: 'ai.cost30', label: 'AI cost, 30 days', group: 'AI', unit: 'usd', help: 'What AI calls cost in the last 30 days. Calls with an unknown price are counted, never guessed.',
    read: ({ m }) => {
      const c = m.production.aiCost30;
      if (!c || !c.runs) return { value: 0, note: 'no AI calls' };
      const note = c.unknown ? `${c.unknown} call${c.unknown === 1 ? '' : 's'} with unknown cost` : undefined;
      return { value: c.usd ?? null, note };
    },
  },
  { id: 'ai.calls30', label: 'AI calls, 30 days', group: 'AI', unit: 'count', help: 'AI calls made in the last 30 days.', read: ({ m }) => ({ value: m.production.aiCost30?.runs ?? 0 }) },

  // ---------- Listings, per marketplace ----------
  ...MARKETPLACES.flatMap(([mk, name]): Def[] => [
    {
      id: `listings.published.${mk}`, label: `${name} live`, group: 'Listings', unit: 'count',
      help: `Listings recorded as published on ${name}. Only listings published from the factory or recorded in it count; with none recorded it shows NO DATA, not 0.`,
      read: ({ m }) => {
        const n = rows<{ marketplace: string; n: number }>(m.listings.published).filter((r) => r.marketplace === mk).reduce((s, r) => s + r.n, 0);
        return { value: n || null };
      },
    },
    {
      id: `listings.ready.${mk}`, label: `${name} ready to publish`, group: 'Listings', unit: 'count', help: `${name} listings written and ready, not published yet.`,
      read: ({ m }) => ({ value: rows<{ marketplace: string; status: string; n: number }>(m.listings.byStatus).filter((r) => r.marketplace === mk && (r.status === 'ready' || r.status === 'export_prepared')).reduce((s, r) => s + r.n, 0) }),
    },
  ]),

  // ---------- Sales, one stat per metric and source ----------
  ...SALES_METRICS.flatMap(([metric, name, unit]) => SOURCES.map(([src, srcName]): Def => ({
    id: `sales.${metric}.${src}`, label: `${name} · ${srcName}`, group: 'Sales', unit,
    help: `${name}, all time, from ${src === 'marketplace_api' ? 'a shop connection' : src === 'csv_import' ? 'imported sales files' : src === 'manual_entry' ? 'numbers you typed in' : 'estimates (not real sales)'}. Never added to other sources.`,
    read: ({ m }) => {
      const r = rows<{ source_kind: string; metric: string; total: number }>(m.sales.bySource).find((x) => x.source_kind === src && x.metric === metric);
      return r ? { value: r.total, note: src === 'estimate' ? 'estimate' : undefined } : { value: null };
    },
  }))),
];

const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

/** Every stat the ticker can show, for the EDIT list. */
export function tickerCatalog(): TickerStat[] {
  return DEFS.map(({ id, label, group, unit, help }) => ({ id, label, group, unit, help }));
}

/** The owner's chosen stats, in order, without any id that no longer exists. */
export function chosenTickerStats(app: AppContext): string[] {
  return [...new Set(app.settings.get('arcade').tickerStats)].filter((id) => BY_ID.has(id));
}

/** Current values for the chosen stats. `character` is the arcade's current player, for per-character stats. */
export function tickerValues(app: AppContext, character: string | null, ids = chosenTickerStats(app)): TickerValue[] {
  const ctx: Ctx = { app, m: metrics(app), character };
  return ids.flatMap((id) => {
    const d = BY_ID.get(id);
    if (!d) return [];
    const { read, ...stat } = d;
    return [{ ...stat, ...read(ctx) }];
  });
}
