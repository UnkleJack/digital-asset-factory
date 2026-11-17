import type { AppContext } from '../../app/context.ts';
import { getProduct, getVersion, getSpec } from '../../db/repos.ts';
import { json } from '../../db/sqlite.ts';
import { addDaysUtc, parseYmd, ymd } from '../../core/time.ts';
import { validation, conflict } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import { createVariation } from '../bundling/service.ts';
import { createBatch, addToBatch } from '../approval/batches.ts';

/*
 * Yearly refresh (owner's pick from the ChatGPT review, 2026-11-17). A dated product stops being useful once the
 * dates it covers have passed, so the factory keeps a list of approved dated products whose period is over or ends
 * soon, and offers to make the next edition: the same product with its dates moved on by exactly what it covered.
 *
 * Only the three dated layouts have dates to move: monthly calendar, weekly planner and daily planner (when it is
 * set to dated). A product can be marked "doesn't expire" and then never shows up here.
 */

export const DATED_TYPES = ['monthly-calendar', 'weekly-planner', 'daily-planner'] as const;

interface Period { start: Date; end: Date }

/** First and last day a dated product covers, or null when it has no dates (an undated daily planner, any other type). */
export function periodOf(productType: string, params: Record<string, unknown>): Period | null {
  if (productType === 'monthly-calendar') {
    const year = Number(params.year), startMonth = Number(params.startMonth ?? 1), months = Number(params.months ?? 12);
    if (!Number.isFinite(year)) return null;
    return { start: new Date(Date.UTC(year, startMonth - 1, 1)), end: new Date(Date.UTC(year, startMonth - 1 + months, 0)) };
  }
  if (productType === 'weekly-planner') {
    if (typeof params.startDate !== 'string') return null;
    const weekStart = Number(params.weekStart ?? 1), weeks = Number(params.weeks ?? 52);
    const d = parseYmd(params.startDate);
    const start = addDaysUtc(d, -((d.getUTCDay() - weekStart + 7) % 7));
    return { start, end: addDaysUtc(start, weeks * 7 - 1) };
  }
  if (productType === 'daily-planner') {
    if (!params.dated || typeof params.startDate !== 'string') return null;
    const start = parseYmd(params.startDate);
    return { start, end: addDaysUtc(start, Number(params.days ?? 1) - 1) };
  }
  return null;
}

/** The settings that make the next edition: the dates move on by exactly what this one covered, nothing else changes. */
export function nextEditionParams(productType: string, params: Record<string, unknown>): Record<string, unknown> {
  const p = periodOf(productType, params);
  if (!p) throw validation('This product has no dates to move on.');
  if (productType === 'monthly-calendar') {
    const idx = Number(params.year) * 12 + Number(params.startMonth ?? 1) - 1 + Number(params.months ?? 12);
    return { year: Math.floor(idx / 12), startMonth: (idx % 12) + 1 };
  }
  const next = addDaysUtc(p.end, 1);
  return { startDate: ymd(next) };
}

/** "2027 Weekly Planner" becomes "2028 Weekly Planner": any four-digit year in the title moves on by the same number of years. */
export function nextEditionTitle(title: string, yearsForward: number): string | undefined {
  const moved = title.replace(/\b(20\d\d|21\d\d)\b/g, (y) => String(Number(y) + yearsForward));
  return moved === title ? undefined : moved;
}

export interface RefreshItem {
  productId: string;
  title: string;
  productType: string;
  versionStatus: string;
  periodStart: string;
  periodEnd: string;
  /** Days from today until the period ends; negative once it has ended. */
  daysLeft: number;
  state: 'ended' | 'ending_soon';
  /** Set once a next edition was made from this product. */
  nextEditionId: string | null;
}

export function refreshList(app: AppContext): { leadDays: number; items: RefreshItem[]; evergreen: { productId: string; title: string }[] } {
  const leadDays = app.settings.get('lifecycle').refreshLeadDays;
  const today = app.clock.now();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const rows = app.db.all<{ id: string; title: string; product_type: string; version_id: string; version_status: string; params: string; evergreen: number | null }>(
    `SELECT p.id, p.title, p.product_type, v.id AS version_id, v.status AS version_status, s.params, l.evergreen
       FROM products p JOIN product_versions v ON v.id = p.current_version_id JOIN product_specs s ON s.id = v.spec_id
       LEFT JOIN product_lifecycle l ON l.product_id = p.id
      WHERE p.status = 'active' AND v.status = 'approved' AND p.product_type IN ('monthly-calendar','weekly-planner','daily-planner')
      ORDER BY p.updated_at DESC`);
  const items: RefreshItem[] = [];
  const evergreen: { productId: string; title: string }[] = [];
  for (const r of rows) {
    if (r.evergreen) { evergreen.push({ productId: r.id, title: r.title }); continue; }
    const period = periodOf(r.product_type, json<Record<string, unknown>>(r.params, {}));
    if (!period) continue;
    const daysLeft = Math.round((period.end.getTime() - todayUtc) / 86_400_000);
    if (daysLeft > leadDays) continue;
    const made = app.db.value<string>("SELECT from_product_id FROM product_relationships WHERE to_product_id = ? AND kind = 'variation_of' AND json_extract(details, '$.edition') = 1 LIMIT 1", r.id) ?? null;
    items.push({ productId: r.id, title: r.title, productType: r.product_type, versionStatus: r.version_status, periodStart: ymd(period.start), periodEnd: ymd(period.end), daysLeft, state: daysLeft < 0 ? 'ended' : 'ending_soon', nextEditionId: made });
  }
  items.sort((a, b) => a.daysLeft - b.daysLeft);
  return { leadDays, items, evergreen };
}

/** The refresh state of one product, for its page. `dated` is false for products with no dates to move on. */
export function productLifecycle(app: AppContext, productId: string): { dated: boolean; evergreen: boolean; periodEnd: string | null; daysLeft: number | null; due: boolean; nextEditionId: string | null } {
  const p = getProduct(app.db, productId);
  const none = { dated: false, evergreen: false, periodEnd: null, daysLeft: null, due: false, nextEditionId: null };
  if (!p.current_version_id || !(DATED_TYPES as readonly string[]).includes(p.product_type)) return none;
  const period = periodOf(p.product_type, getSpec(app.db, getVersion(app.db, p.current_version_id).spec_id).params);
  if (!period) return none;
  const today = app.clock.now();
  const daysLeft = Math.round((period.end.getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);
  const evergreen = !!app.db.value('SELECT evergreen FROM product_lifecycle WHERE product_id = ?', productId);
  const nextEditionId = app.db.value<string>("SELECT from_product_id FROM product_relationships WHERE to_product_id = ? AND kind = 'variation_of' AND json_extract(details, '$.edition') = 1 LIMIT 1", productId) ?? null;
  return { dated: true, evergreen, periodEnd: ymd(period.end), daysLeft, due: !evergreen && daysLeft <= app.settings.get('lifecycle').refreshLeadDays, nextEditionId };
}

export function setEvergreen(app: AppContext, productId: string, evergreen: boolean, actor: AuditActor = 'user'): void {
  const p = getProduct(app.db, productId);
  if (!(DATED_TYPES as readonly string[]).includes(p.product_type)) throw validation('Only dated products (monthly calendar, weekly planner, daily planner) have an end date to track.');
  app.db.run('INSERT INTO product_lifecycle (product_id, evergreen, updated_at) VALUES (?, ?, ?) ON CONFLICT(product_id) DO UPDATE SET evergreen = excluded.evergreen, updated_at = excluded.updated_at', productId, evergreen ? 1 : 0, new Date().toISOString());
  audit(app.db, actor, evergreen ? 'lifecycle.evergreen_on' : 'lifecycle.evergreen_off', 'product', productId, {});
}

/** Makes the next edition as a variation (same design, audience, theme, license and brief; new dates and a new title year) and puts it in its own review batch. */
export function makeNextEdition(app: AppContext, productId: string, actor: AuditActor = 'user'): { productId: string; versionId: string; batchId: string } {
  const src = getProduct(app.db, productId);
  if (!src.current_version_id) throw validation('This product has no version.');
  const v = getVersion(app.db, src.current_version_id);
  const spec = getSpec(app.db, v.spec_id);
  const period = periodOf(src.product_type, spec.params);
  if (!period) throw validation('This product has no dates to move on.');
  if (app.db.get("SELECT 1 FROM product_relationships WHERE to_product_id = ? AND kind = 'variation_of' AND json_extract(details, '$.edition') = 1", productId)) {
    throw conflict('A next edition was already made from this product. Open it from the product page.');
  }
  const params = nextEditionParams(src.product_type, spec.params);
  const next = periodOf(src.product_type, { ...spec.params, ...params })!;
  const title = nextEditionTitle(src.title, next.start.getUTCFullYear() - period.start.getUTCFullYear());
  const r = createVariation(app, productId, { title, axes: { params }, edition: true }, actor);
  const batchId = createBatch(app, `Next edition — ${getProduct(app.db, r.productId).title}`.slice(0, 120), 'manual');
  addToBatch(app, batchId, r.versionId);
  audit(app.db, actor, 'lifecycle.next_edition', 'product', r.productId, { from: productId, covers: `${ymd(next.start)} to ${ymd(next.end)}` });
  return { ...r, batchId };
}
