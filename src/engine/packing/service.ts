// The packer. Finished products come off the conveyor and are sorted onto up to `maxOpenCarts`
// carts, each building one pack. A product carries many tags (category, theme, audience, season,
// style, type, your own), so it can join several carts at once. What fits no open cart goes to
// the backlog, which is only re-sorted at a "break": when nothing is being produced. Deterministic:
// AI is only used elsewhere to name packs.
import type { AppContext } from '../../app/context.ts';
import { json } from '../../db/sqlite.ts';
import { newId } from '../../core/ids.ts';
import { validation, notFound, errorMessage } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import { createBundle } from '../bundling/service.ts';
import { z } from 'zod';
import { structuredCall, textMode } from '../generation/service.ts';
import { AI_SYSTEM_BASE } from '../producttypes/types.ts';
import { ProviderError } from '../../core/errors.ts';

export const TAG_KINDS = ['category', 'theme', 'audience', 'season', 'style', 'type', 'custom'] as const;
export type TagKind = (typeof TAG_KINDS)[number];
export interface Tag { kind: TagKind; tag: string }

/** How much a cart tag of each kind counts when matching a product to it. */
const KIND_WEIGHT: Record<TagKind, number> = { theme: 3, category: 2, custom: 2, audience: 1.5, season: 1.5, style: 1, type: 1 };
const SEASONS: Record<number, string> = { 12: 'winter', 1: 'winter', 2: 'winter', 3: 'spring', 4: 'spring', 5: 'spring', 6: 'summer', 7: 'summer', 8: 'summer', 9: 'autumn', 10: 'autumn', 11: 'autumn' };

export const normTag = (s: string) => s.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').slice(0, 40);
const SMALL = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
const titleCase = (s: string) => s.split(' ').map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

interface CartRow { id: string; name: string; tags: Tag[]; status: 'open' | 'built' | 'dissolved'; origin: string; slot: number | null; target_size: number; min_size: number; bundle_product_id: string | null; note: string; created_at: string; updated_at: string; closed_at: string | null }
const mapCart = (r: Record<string, unknown>): CartRow => ({ ...(r as unknown as CartRow), tags: json<Tag[]>(r.tags, []) });

function cfg(app: AppContext) {
  return app.settings.get('packing');
}

// ---- Tags -------------------------------------------------------------------------------

/** Tags that follow from what the product is: category, type, theme, audience, design style, season. */
export function deriveTags(app: AppContext, productId: string): Tag[] {
  const r = app.db.get<{ product_type: string; category: string | null; theme: string | null; audience: string | null; style: string | null; months: string | null }>(
    `SELECT p.product_type, c.name AS category, t.name AS theme, a.name AS audience, d.name AS style, o.seasonal_months AS months
     FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN themes t ON t.id = p.theme_id LEFT JOIN audiences a ON a.id = p.audience_id
     LEFT JOIN product_versions v ON v.id = p.current_version_id LEFT JOIN product_specs s ON s.id = v.spec_id LEFT JOIN design_systems d ON d.id = s.design_system_id
     LEFT JOIN opportunities o ON o.id = p.opportunity_id WHERE p.id = ?`, productId);
  if (!r) throw notFound('Product', productId);
  const out: Tag[] = [{ kind: 'type', tag: normTag(r.product_type) }];
  if (r.category) out.push({ kind: 'category', tag: normTag(r.category) });
  if (r.theme) out.push({ kind: 'theme', tag: normTag(r.theme) });
  if (r.audience) out.push({ kind: 'audience', tag: normTag(r.audience) });
  if (r.style) out.push({ kind: 'style', tag: normTag(r.style.replace(/\s*\(.*\)\s*$/, '')) });
  for (const s of new Set(json<number[]>(r.months, []).map((m) => SEASONS[m]).filter(Boolean))) out.push({ kind: 'season', tag: s });
  return out;
}

export function syncDerivedTags(app: AppContext, productId: string): void {
  const now = app.clock.now().toISOString();
  app.db.tx(() => {
    app.db.run("DELETE FROM product_tags WHERE product_id = ? AND source = 'derived'", productId);
    for (const t of deriveTags(app, productId)) app.db.run('INSERT OR IGNORE INTO product_tags (product_id, tag, kind, source, created_at) VALUES (?, ?, ?, ?, ?)', productId, t.tag, t.kind, 'derived', now);
  });
}

export function productTags(app: AppContext, productId: string): (Tag & { source: string })[] {
  if (!app.db.get("SELECT 1 FROM product_tags WHERE product_id = ? AND source = 'derived'", productId)) syncDerivedTags(app, productId);
  return app.db.all<Tag & { source: string }>('SELECT kind, tag, source FROM product_tags WHERE product_id = ? ORDER BY kind, tag', productId).map((t) => ({ ...t }));
}

/** Replaces the tags you (or AI) added; tags derived from the product itself stay. */
export function setExtraTags(app: AppContext, productId: string, tags: Tag[], source: 'user' | 'ai' = 'user', actor: AuditActor = 'user'): void {
  const clean = tags.map((t) => ({ kind: t.kind, tag: normTag(t.tag) })).filter((t) => t.tag.length >= 2 && TAG_KINDS.includes(t.kind)).slice(0, 40);
  const now = app.clock.now().toISOString();
  app.db.tx(() => {
    app.db.run("DELETE FROM product_tags WHERE product_id = ? AND source IN ('user','ai')", productId);
    for (const t of clean) app.db.run('INSERT OR IGNORE INTO product_tags (product_id, tag, kind, source, created_at) VALUES (?, ?, ?, ?, ?)', productId, t.tag, t.kind, source, now);
  });
  audit(app.db, actor, 'product.tags_set', 'product', productId, { tags: clean });
}

export function allTags(app: AppContext): { tag: string; kind: string; products: number }[] {
  // Products made before tags existed get their derived tags on first look.
  for (const r of app.db.all<{ id: string }>("SELECT id FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_tags t WHERE t.product_id = p.id AND t.source = 'derived') LIMIT 2000")) syncDerivedTags(app, r.id);
  return app.db.all<{ tag: string; kind: string; products: number }>('SELECT tag, kind, count(DISTINCT product_id) AS products FROM product_tags GROUP BY tag, kind ORDER BY products DESC, tag LIMIT 500').map((r) => ({ ...r }));
}

// ---- Eligibility and scoring ------------------------------------------------------------------

const ELIGIBLE_SQL = `SELECT p.id, p.product_type FROM products p JOIN product_versions v ON v.id = p.current_version_id
  WHERE p.status = 'active' AND p.product_type != 'bundle' AND v.qa_status IN ('passed','passed_with_warnings') AND v.status IN ('ready','approved')`;

function eligibility(app: AppContext, productId: string): string | null {
  const r = app.db.get<{ product_type: string; status: string; v_status: string | null; qa: string | null }>('SELECT p.product_type, p.status, v.status AS v_status, v.qa_status AS qa FROM products p LEFT JOIN product_versions v ON v.id = p.current_version_id WHERE p.id = ?', productId);
  if (!r) return 'product not found';
  if (r.product_type === 'bundle') return 'packs are not packed into other packs';
  if (r.status !== 'active') return `product is ${r.status}`;
  if (!['passed', 'passed_with_warnings'].includes(r.qa ?? '') || !['ready', 'approved'].includes(r.v_status ?? '')) return 'not finished or did not pass QA';
  const packs = app.db.value<number>('SELECT count(*) FROM bundle_items b JOIN products bp ON bp.id = b.bundle_product_id WHERE b.member_product_id = ? AND bp.status = \'active\'', productId) ?? 0;
  if (packs >= cfg(app).maxPacksPerProduct) return `already in ${packs} packs (the limit)`;
  return null;
}

/** 0–1: how much of the cart's tag weight this product matches. A cart with no tags (variety) takes anything at 0.5. */
export function matchScore(productTags: Tag[], cartTags: Tag[]): number {
  if (!cartTags.length) return 0.5;
  const have = new Set(productTags.map((t) => t.tag));
  const total = cartTags.reduce((s, t) => s + KIND_WEIGHT[t.kind], 0);
  const hit = cartTags.filter((t) => have.has(t.tag)).reduce((s, t) => s + KIND_WEIGHT[t.kind], 0);
  return total ? hit / total : 0;
}

const tagSet = (tags: Tag[]) => new Set(tags.map((t) => t.tag));
function overlap(a: Tag[], b: Tag[]): number {
  const A = tagSet(a);
  const B = tagSet(b);
  if (!A.size || !B.size) return 0;
  return [...A].filter((x) => B.has(x)).length / Math.min(A.size, B.size);
}

/** True while the product was recently packed into a pack with mostly the same tags. */
function inCooldown(app: AppContext, productId: string, cartTags: Tag[]): boolean {
  const days = cfg(app).cooldownDays;
  if (!days || !cartTags.length) return false;
  const since = new Date(app.clock.now().getTime() - days * 86_400_000).toISOString();
  const recent = app.db.all<{ tags: string }>("SELECT c.tags FROM pack_carts c JOIN pack_cart_items i ON i.cart_id = c.id WHERE i.product_id = ? AND c.status = 'built' AND c.closed_at >= ?", productId, since);
  return recent.some((r) => overlap(json<Tag[]>(r.tags, []), cartTags) >= 0.5);
}

function openCarts(app: AppContext): CartRow[] {
  return app.db.all<Record<string, unknown>>("SELECT * FROM pack_carts WHERE status = 'open' ORDER BY slot").map(mapCart);
}

function cartItems(app: AppContext, cartId: string): { product_id: string; product_type: string }[] {
  return app.db.all<{ product_id: string; product_type: string }>('SELECT i.product_id, p.product_type FROM pack_cart_items i JOIN products p ON p.id = i.product_id WHERE i.cart_id = ? ORDER BY i.position', cartId).map((r) => ({ ...r }));
}

/** Score for one product on one cart, or null when it can't go there (full, already in, too many of its type, cooldown). */
function fit(app: AppContext, cart: CartRow, productId: string, type: string, tags: Tag[]): number | null {
  const items = cartItems(app, cart.id);
  if (items.length >= cart.target_size) return null;
  if (items.some((i) => i.product_id === productId)) return null;
  if (items.filter((i) => i.product_type === type).length >= cfg(app).maxSameTypePerCart) return null;
  if (inCooldown(app, productId, cart.tags)) return null;
  return matchScore(tags, cart.tags);
}

/** Sales signal for rotating winners: revenue plus orders over the last 90 days. */
export function winnerScores(app: AppContext): Map<string, number> {
  const since = new Date(app.clock.now().getTime() - 90 * 86_400_000).toISOString();
  const rows = app.db.all<{ product_id: string; s: number }>("SELECT product_id, sum(CASE WHEN metric = 'revenue_cents' THEN value WHEN metric = 'orders' THEN value * 100 ELSE 0 END) AS s FROM performance_observations WHERE product_id IS NOT NULL AND period_end >= ? GROUP BY product_id", since);
  return new Map(rows.filter((r) => r.s > 0).map((r) => [r.product_id, r.s]));
}

// ---- Carts --------------------------------------------------------------------------------

function freeSlot(app: AppContext): number | null {
  const used = new Set(openCarts(app).map((c) => c.slot));
  for (let s = 1; s <= cfg(app).maxOpenCarts; s++) if (!used.has(s)) return s;
  return null;
}

/** The tags a new cart is built around: the product's strongest identity plus who it's for. */
function seedTags(tags: Tag[]): Tag[] {
  const first = (k: TagKind) => tags.find((t) => t.kind === k);
  const primary = first('theme') ?? first('custom') ?? first('category') ?? first('type');
  const secondary = first('audience') ?? first('season');
  return [primary, secondary].filter((t): t is Tag => !!t);
}

const cartName = (tags: Tag[]) => (tags.length ? `${tags.map((t) => titleCase(t.tag)).join(' · ')} pack` : 'Variety pack');

export function openCart(app: AppContext, input: { name?: string; tags: Tag[]; origin?: CartRow['origin']; note?: string }, actor: AuditActor = 'user'): string {
  const slot = freeSlot(app);
  if (slot === null) throw validation(`All ${cfg(app).maxOpenCarts} carts are in use. Pack or empty one first.`);
  const tags = input.tags.map((t) => ({ kind: t.kind, tag: normTag(t.tag) })).filter((t) => t.tag);
  const id = newId('cart');
  const now = app.clock.now().toISOString();
  const c = cfg(app);
  app.db.insert('pack_carts', { id, name: (input.name?.trim() || cartName(tags)).slice(0, 120), tags: JSON.stringify(tags), status: 'open', origin: input.origin ?? 'manual', slot, target_size: c.targetSize, min_size: Math.min(c.minSize, c.targetSize), note: input.note ?? '', created_at: now, updated_at: now });
  audit(app.db, actor, 'packing.cart_opened', 'pack_cart', id, { tags, slot });
  return id;
}

function addToCart(app: AppContext, cartId: string, productId: string, score: number): void {
  const pos = (app.db.value<number>('SELECT max(position) FROM pack_cart_items WHERE cart_id = ?', cartId) ?? -1) + 1;
  app.db.run('INSERT OR IGNORE INTO pack_cart_items (cart_id, product_id, position, score, added_at) VALUES (?, ?, ?, ?, ?)', cartId, productId, pos, Math.round(score * 1000) / 1000, app.clock.now().toISOString());
  app.db.run('UPDATE pack_carts SET updated_at = ? WHERE id = ?', app.clock.now().toISOString(), cartId);
  app.db.run('DELETE FROM packing_backlog WHERE product_id = ?', productId);
}

function toBacklog(app: AppContext, productId: string, reason: string, bumpPass = false): void {
  const now = app.clock.now().toISOString();
  app.db.run(`INSERT INTO packing_backlog (product_id, passes, reason, created_at, updated_at) VALUES (?, 1, ?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET reason = excluded.reason, updated_at = excluded.updated_at${bumpPass ? ', passes = passes + 1' : ''}`, productId, reason, now, now);
}

export type PlaceResult = { productId: string; joined: string[]; opened: string | null; backlog: string | null };

/** Put one product on every open cart it fits (up to the per-product limit), open a new cart if it fits none, or send it to the backlog. */
function place(app: AppContext, productId: string, threshold: number, opts: { allowOpen: boolean | ((seed: Tag[]) => boolean); origin: CartRow['origin']; bumpPass?: boolean }): PlaceResult {
  const res: PlaceResult = { productId, joined: [], opened: null, backlog: null };
  const why = eligibility(app, productId);
  if (why) {
    app.db.run('DELETE FROM packing_backlog WHERE product_id = ?', productId);
    res.backlog = why;
    return res;
  }
  const tags = productTags(app, productId);
  const type = app.db.value<string>('SELECT product_type FROM products WHERE id = ?', productId)!;
  const carts = openCarts(app);
  const already = carts.filter((c) => cartItems(app, c.id).some((i) => i.product_id === productId)).length;
  const room = cfg(app).maxCartsPerProduct - already;
  const scored = carts.map((c) => ({ c, s: fit(app, c, productId, type, tags) })).filter((x): x is { c: CartRow; s: number } => x.s !== null && x.s >= threshold).sort((a, b) => b.s - a.s).slice(0, Math.max(0, room));
  for (const { c, s } of scored) {
    addToCart(app, c.id, productId, s);
    res.joined.push(c.id);
  }
  if (res.joined.length || already) return res;
  const seed = seedTags(tags);
  if ((typeof opts.allowOpen === 'function' ? opts.allowOpen(seed) : opts.allowOpen) && freeSlot(app) !== null && seed.length) {
    const id = openCart(app, { tags: seed, origin: opts.origin }, 'system');
    addToCart(app, id, productId, matchScore(tags, seed));
    res.opened = id;
    return res;
  }
  const reason = freeSlot(app) === null ? `fits none of the ${carts.length} open carts and all slots are in use` : 'fits none of the open carts';
  toBacklog(app, productId, reason, opts.bumpPass);
  res.backlog = reason;
  return res;
}

/** Turn a cart into a pack. Members that stopped qualifying (rejected, retired) are dropped first. */
export function sealCart(app: AppContext, cartId: string, actor: AuditActor = 'user'): { bundleProductId: string } {
  const cart = getCart(app, cartId);
  if (cart.status !== 'open') throw validation('This cart is already closed.');
  const items = cartItems(app, cartId);
  const keep = items.filter((i) => {
    const why = eligibility(app, i.product_id);
    if (why) app.db.run('DELETE FROM pack_cart_items WHERE cart_id = ? AND product_id = ?', cartId, i.product_id);
    return !why;
  });
  if (keep.length < Math.max(2, cart.min_size)) throw validation(`"${cart.name}" has ${keep.length} usable item(s); a pack needs at least ${Math.max(2, cart.min_size)}.`);
  const { productId } = createBundle(app, { productIds: keep.map((i) => i.product_id), title: cart.name, marketplaces: cfg(app).marketplaces }, actor);
  const now = app.clock.now().toISOString();
  app.db.update('pack_carts', cartId, { status: 'built', slot: null, bundle_product_id: productId, closed_at: now, updated_at: now });
  audit(app.db, actor, 'packing.cart_built', 'pack_cart', cartId, { bundleProductId: productId, items: keep.length });
  return { bundleProductId: productId };
}

/** Empty a cart; items not in another open cart go back to the backlog. */
export function dissolveCart(app: AppContext, cartId: string, actor: AuditActor = 'user', reason = 'its cart was emptied'): void {
  const cart = getCart(app, cartId);
  if (cart.status !== 'open') throw validation('This cart is already closed.');
  app.db.tx(() => {
    const items = cartItems(app, cartId);
    const now = app.clock.now().toISOString();
    app.db.update('pack_carts', cartId, { status: 'dissolved', slot: null, closed_at: now, updated_at: now });
    for (const i of items) {
      const elsewhere = app.db.get("SELECT 1 FROM pack_cart_items x JOIN pack_carts c ON c.id = x.cart_id WHERE x.product_id = ? AND c.status = 'open'", i.product_id);
      if (!elsewhere && !eligibility(app, i.product_id)) toBacklog(app, i.product_id, reason);
    }
  });
  audit(app.db, actor, 'packing.cart_dissolved', 'pack_cart', cartId, {});
}

function getCart(app: AppContext, id: string): CartRow {
  const r = app.db.get<Record<string, unknown>>('SELECT * FROM pack_carts WHERE id = ?', id);
  if (!r) throw notFound('Cart', id);
  return mapCart(r);
}

function sealFull(app: AppContext, actor: AuditActor): string[] {
  if (!cfg(app).autoBuild) return [];
  const built: string[] = [];
  for (const c of openCarts(app)) {
    if (cartItems(app, c.id).length < c.target_size) continue;
    try {
      built.push(sealCart(app, c.id, actor).bundleProductId);
    } catch (err) {
      app.log.warn('A full cart could not be packed', { cart: c.id, err: errorMessage(err) });
    }
  }
  return built;
}

// ---- The conveyor and the break ------------------------------------------------------------

/** A product came off the line: sort it onto carts. */
export function feedProduct(app: AppContext, productId: string, actor: AuditActor = 'system'): PlaceResult & { built: string[] } {
  syncDerivedTags(app, productId);
  const r = app.db.tx(() => place(app, productId, cfg(app).joinThreshold, { allowOpen: true, origin: 'conveyor' }));
  return { ...r, built: sealFull(app, actor) };
}

/** Products still being made (not packs). While any are, the backlog waits. */
export function conveyorCount(app: AppContext): number {
  return app.db.value<number>("SELECT count(*) FROM product_versions v JOIN products p ON p.id = v.product_id WHERE v.status = 'in_progress' AND p.product_type != 'bundle'") ?? 0;
}

export interface BreakResult { ran: boolean; reason?: string; sealed: string[]; dissolved: string[]; placed: number; variety: string | null; stillWaiting: number }

/**
 * The factory's break: pack or empty stale carts, then re-sort the backlog with a looser match,
 * then gather leftovers into a variety cart. Runs only once the conveyor is empty, unless forced.
 */
export function runBreak(app: AppContext, opts: { force?: boolean; actor?: AuditActor } = {}): BreakResult {
  const actor = opts.actor ?? 'system';
  const out: BreakResult = { ran: false, sealed: [], dissolved: [], placed: 0, variety: null, stillWaiting: 0 };
  if (!opts.force && conveyorCount(app) > 0) return { ...out, reason: 'products are still being made', stillWaiting: backlogCount(app) };
  out.ran = true;
  const c = cfg(app);
  const staleBefore = new Date(app.clock.now().getTime() - c.staleHours * 3_600_000).toISOString();
  for (const cart of openCarts(app)) {
    if (cart.updated_at >= staleBefore) continue;
    const n = cartItems(app, cart.id).length;
    if (n >= Math.max(2, cart.min_size) && c.autoBuild) {
      try { out.sealed.push(sealCart(app, cart.id, actor).bundleProductId); continue; } catch (err) { app.log.warn('Stale cart could not be packed', { cart: cart.id, err: errorMessage(err) }); }
    }
    if (n < cart.min_size) { dissolveCart(app, cart.id, actor, 'its cart sat too long without filling'); out.dissolved.push(cart.id); }
  }
  // Re-sort the backlog, best sellers first, then oldest first.
  const wins = winnerScores(app);
  const waiting = app.db.all<{ product_id: string; created_at: string }>('SELECT product_id, created_at FROM packing_backlog').sort((a, b) => (wins.get(b.product_id) ?? 0) - (wins.get(a.product_id) ?? 0) || a.created_at.localeCompare(b.created_at));
  // A backlog item only opens a new cart when another waiting item would share it; singletons go to the variety pack.
  const waitingTags = new Map(waiting.map((w) => [w.product_id, productTags(app, w.product_id)]));
  for (const w of waiting) {
    const shared = (seed: Tag[]) => [...waitingTags].some(([id, tags]) => id !== w.product_id && app.db.get('SELECT 1 FROM packing_backlog WHERE product_id = ?', id) && matchScore(tags, seed) >= c.relaxedThreshold);
    const r = app.db.tx(() => place(app, w.product_id, c.relaxedThreshold, { allowOpen: shared, origin: 'backlog', bumpPass: true }));
    if (r.joined.length || r.opened) out.placed++;
  }
  // Whatever still fits nowhere: a variety pack, if there are enough and a slot is free.
  const left = app.db.all<{ product_id: string }>('SELECT product_id FROM packing_backlog ORDER BY created_at').map((r) => r.product_id).filter((id) => !eligibility(app, id));
  if (left.length >= c.minSize && freeSlot(app) !== null) {
    const id = openCart(app, { tags: [], origin: 'variety', name: 'Variety pack', note: 'Leftovers that matched no themed cart' }, actor);
    const cart = getCart(app, id);
    for (const pid of left) {
      const type = app.db.value<string>('SELECT product_type FROM products WHERE id = ?', pid)!;
      const s = fit(app, cart, pid, type, []);
      if (s !== null) addToCart(app, id, pid, s);
    }
    out.variety = id;
  }
  out.sealed.push(...sealFull(app, actor));
  out.stillWaiting = backlogCount(app);
  audit(app.db, actor, 'packing.break', 'packing', 'floor', { sealed: out.sealed.length, dissolved: out.dissolved.length, placed: out.placed, variety: !!out.variety, stillWaiting: out.stillWaiting });
  return out;
}

const backlogCount = (app: AppContext) => app.db.value<number>('SELECT count(*) FROM packing_backlog') ?? 0;

/** Pull matching finished products from the whole library into a cart (winners first). */
export function fillCart(app: AppContext, cartId: string, threshold = cfg(app).relaxedThreshold): number {
  const cart = getCart(app, cartId);
  if (cart.status !== 'open') throw validation('This cart is already closed.');
  const wins = winnerScores(app);
  const candidates = app.db.all<{ id: string; product_type: string }>(ELIGIBLE_SQL).filter((p) => !eligibility(app, p.id));
  const scored = candidates.map((p) => ({ p, tags: productTags(app, p.id) })).map((x) => ({ ...x, s: matchScore(x.tags, cart.tags) })).filter((x) => x.s >= threshold)
    .sort((a, b) => b.s - a.s || (wins.get(b.p.id) ?? 0) - (wins.get(a.p.id) ?? 0));
  let added = 0;
  for (const x of scored) {
    const s = fit(app, getCart(app, cartId), x.p.id, x.p.product_type, x.tags);
    if (s === null) continue;
    addToCart(app, cartId, x.p.id, s);
    added++;
  }
  return added;
}

/** Keep winners in rotation: open a cart around a tag your best sellers share but haven't been packed under yet, and fill it. */
export function remixWinners(app: AppContext, actor: AuditActor = 'user'): { cartId: string; tag: Tag; added: number } {
  const wins = [...winnerScores(app).entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id).filter((id) => !eligibility(app, id));
  if (!wins.length) throw validation('No sales recorded yet for finished products. Import sales (Analytics) or pull Gumroad sales first.');
  if (freeSlot(app) === null) throw validation(`All ${cfg(app).maxOpenCarts} carts are in use. Pack or empty one first.`);
  const used = new Set(app.db.all<{ tags: string }>(`SELECT DISTINCT c.tags FROM pack_carts c JOIN pack_cart_items i ON i.cart_id = c.id WHERE c.status = 'built' AND i.product_id IN (${wins.map(() => '?').join(',')})`, ...wins).flatMap((r) => json<Tag[]>(r.tags, []).map((t) => t.tag)));
  const freq = new Map<string, { tag: Tag; n: number }>();
  for (const id of wins) for (const t of productTags(app, id)) {
    if (t.kind === 'type' || used.has(t.tag)) continue;
    const k = `${t.kind}:${t.tag}`;
    freq.set(k, { tag: { kind: t.kind, tag: t.tag }, n: (freq.get(k)?.n ?? 0) + 1 });
  }
  const pick = [...freq.values()].sort((a, b) => b.n - a.n || KIND_WEIGHT[b.tag.kind] - KIND_WEIGHT[a.tag.kind])[0];
  if (!pick) throw validation('Your best sellers have already been packed under every tag they carry. Add new tags to them (Product → Tags) for fresh remix angles.');
  const cartId = openCart(app, { tags: [pick.tag], origin: 'remix', name: `${titleCase(pick.tag.tag)} best-sellers remix`, note: 'Built around your top sellers' }, actor);
  const added = fillCart(app, cartId);
  return { cartId, tag: pick.tag, added };
}

export function addItemManually(app: AppContext, cartId: string, productId: string): void {
  const cart = getCart(app, cartId);
  if (cart.status !== 'open') throw validation('This cart is already closed.');
  const why = eligibility(app, productId);
  if (why) throw validation(`Can't add this product: ${why}.`);
  if (cartItems(app, cartId).length >= cart.target_size) throw validation('This cart is full.');
  addToCart(app, cartId, productId, matchScore(productTags(app, productId), cart.tags));
}

export function removeItem(app: AppContext, cartId: string, productId: string): void {
  app.db.tx(() => {
    app.db.run('DELETE FROM pack_cart_items WHERE cart_id = ? AND product_id = ?', cartId, productId);
    const elsewhere = app.db.get("SELECT 1 FROM pack_cart_items x JOIN pack_carts c ON c.id = x.cart_id WHERE x.product_id = ? AND c.status = 'open'", productId);
    if (!elsewhere && !eligibility(app, productId)) toBacklog(app, productId, 'taken out of a cart by you');
  });
}

/** Everything the Factory floor page shows. */
export function floor(app: AppContext) {
  const thumb = `(SELECT a.id FROM assets a WHERE a.version_id = p.current_version_id AND a.role = 'preview' ORDER BY a.page_index LIMIT 1)`;
  const items = (cartId: string) => app.db.all(`SELECT p.id, p.title, p.product_type, i.score, ${thumb} AS thumb FROM pack_cart_items i JOIN products p ON p.id = i.product_id WHERE i.cart_id = ? ORDER BY i.position`, cartId).map((r) => ({ ...r }));
  const c = cfg(app);
  const open = openCarts(app).map((x) => ({ ...x, items: items(x.id) }));
  const closed = app.db.all<Record<string, unknown>>(`SELECT c.*, bp.title AS bundle_title, v.status AS bundle_status FROM pack_carts c LEFT JOIN products bp ON bp.id = c.bundle_product_id LEFT JOIN product_versions v ON v.id = bp.current_version_id WHERE c.status != 'open' ORDER BY c.closed_at DESC LIMIT 12`).map((r) => ({ ...mapCart(r), bundle_title: r.bundle_title, bundle_status: r.bundle_status, items: items(String(r.id)).length }));
  const backlog = app.db.all(`SELECT b.product_id AS id, p.title, p.product_type, b.reason, b.passes, b.created_at, ${thumb} AS thumb FROM packing_backlog b JOIN products p ON p.id = b.product_id ORDER BY b.created_at`).map((r) => ({ ...r }));
  return { slots: c.maxOpenCarts, open, closed, backlog, conveyor: conveyorCount(app), settings: c };
}

/** Hook: a version finished its pipeline (or was approved). Feeds it and, if the line is now empty, takes a break. */
export function onProductFinished(app: AppContext, versionId: string, event: 'qa_passed' | 'approved'): void {
  const c = cfg(app);
  if (!c.autoFeed || c.feedOn !== event) return;
  const v = app.db.get<{ product_id: string; status: string; qa_status: string; type: string; current: string | null }>('SELECT v.product_id, v.status, v.qa_status, p.product_type AS type, p.current_version_id AS current FROM product_versions v JOIN products p ON p.id = v.product_id WHERE v.id = ?', versionId);
  if (!v || v.type === 'bundle' || v.current !== versionId || !['passed', 'passed_with_warnings'].includes(v.qa_status) || !['ready', 'approved'].includes(v.status)) return;
  try {
    feedProduct(app, v.product_id);
    if (conveyorCount(app) === 0) runBreak(app);
  } catch (err) {
    app.log.warn('Packing failed for a finished product', { versionId, err: errorMessage(err) });
  }
}

const TagSuggestions = z.object({ tags: z.array(z.object({ kind: z.enum(['theme', 'audience', 'season', 'style', 'custom']), tag: z.string().min(2).max(40) })).min(1).max(12) });

/** AI proposes extra tags (other buyers, occasions, styles) so a product can join more kinds of packs. Nothing is saved. */
export async function suggestTags(app: AppContext, productId: string): Promise<Tag[]> {
  const mode = await textMode(app).catch(() => ({ mode: 'deterministic' as const }));
  if (mode.mode !== 'ai') throw new ProviderError(app.settings.get('generation').textProvider, 'unconfigured', 'Tag suggestions need an AI provider key (Settings → AI providers).');
  const title = app.db.value<string>('SELECT title FROM products WHERE id = ?', productId);
  if (!title) throw notFound('Product', productId);
  const have = productTags(app, productId);
  const r = await structuredCall(app, {
    purpose: 'packing:suggest-tags',
    schema: TagSuggestions,
    system: `${AI_SYSTEM_BASE}\n- You tag printable products so they can be grouped into themed packs. Tags are short, lowercase, and are things buyers search for. No brand or trademarked names.`,
    prompt: `Product: "${title}"\nCurrent tags: ${have.map((t) => `${t.kind}:${t.tag}`).join(', ')}\nSuggest up to 8 more tags: other audiences who would buy it, occasions or seasons it suits, and styles or themes it would fit into a pack with. Do not repeat current tags.`,
    maxTokens: 800,
    trace: {},
  });
  const existing = new Set(have.map((t) => t.tag));
  return r.data.tags.map((t) => ({ kind: t.kind, tag: normTag(t.tag) })).filter((t) => !existing.has(t.tag));
}
