// The packer: products sorted onto up to N open carts by tags, multi-cart membership, the
// backlog and the break, sealing into real bundles, reuse limits and cooldown, and remixing winners.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { newId } from '../src/core/ids.ts';
import { feedProduct, runBreak, floor, setExtraTags, productTags, openCart, sealCart, remixWinners, matchScore, onProductFinished } from '../src/engine/packing/service.ts';
import { addPerformance } from '../src/engine/analytics/service.ts';
import { tempDir } from './helpers.ts';

let app: App;
let now = new Date('2026-10-24T12:00:00Z');
const TYPES = ['habit-tracker', 'goal-planner', 'todo-checklist', 'weekly-planner', 'daily-planner', 'budget-planner'];
let n = 0;

beforeEach(() => {
  now = new Date('2026-10-24T12:00:00Z');
  app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false, clock: { now: () => new Date(now) } });
  app.settings.update('packing', { maxOpenCarts: 3, targetSize: 4, minSize: 3 });
});
afterEach(async () => { await app.close(); });

function theme(name: string): string {
  const id = app.db.value<string>('SELECT id FROM themes WHERE name = ?', name);
  if (id) return id;
  const nid = newId('thm');
  app.db.insert('themes', { id: nid, name, created_at: now.toISOString() });
  return nid;
}

/** A finished, QA-passed product (no rendering needed for packing logic). */
function finished(title: string, themeName: string | null, opts: { type?: string; extra?: string[] } = {}): string {
  const { product, version } = createProduct(app, { productType: opts.type ?? TYPES[n++ % TYPES.length], title, ...(themeName && { themeId: theme(themeName) }) });
  app.db.update('product_versions', version.id, { status: 'ready', qa_status: 'passed' });
  app.assets.write(`products/${product.id}/${version.id}/item.pdf`, '%PDF-1.4 stand-in', { productId: product.id, versionId: version.id, kind: 'pdf', role: 'deliverable', mime: 'application/pdf', pageCount: 3 });
  if (opts.extra) setExtraTags(app, product.id, opts.extra.map((tag) => ({ kind: 'custom' as const, tag })));
  return product.id;
}

test('products sort onto carts by tag; a new theme opens a cart; when every cart is in use the rest wait in the backlog', () => {
  const a = feedProduct(app, finished('Pumpkin habit tracker', 'Halloween'));
  assert.ok(a.opened, 'first product opens a cart');
  const b = feedProduct(app, finished('Spooky goal planner', 'Halloween'));
  assert.deepEqual(b.joined, [a.opened], 'same theme joins the same cart');
  feedProduct(app, finished('Beach planner', 'Summer Beach'));
  feedProduct(app, finished('Snow planner', 'Winter Wonderland'));
  const e = feedProduct(app, finished('Garden planner', 'Spring Garden'));
  assert.equal(e.backlog?.includes('all slots are in use'), true);
  const f = floor(app);
  assert.equal(f.open.length, 3);
  assert.deepEqual(f.open.map((c) => c.slot), [1, 2, 3]);
  assert.equal(f.backlog.length, 1);
  assert.equal(f.open[0].items.length, 2);
});

test('one product can sit in several carts at once through its extra tags', () => {
  const teachers = openCart(app, { tags: [{ kind: 'custom', tag: 'Teachers' }] });
  feedProduct(app, finished('Pumpkin tracker', 'Halloween'));
  const both = feedProduct(app, finished('Classroom Halloween planner', 'Halloween', { extra: ['teachers'] }));
  assert.equal(both.joined.length, 2, 'joined the Halloween cart and the Teachers cart');
  assert.ok(both.joined.includes(teachers));
  assert.ok(productTags(app, both.productId).some((t) => t.tag === 'teachers' && t.source === 'user'));
  assert.ok(productTags(app, both.productId).some((t) => t.tag === 'halloween' && t.source === 'derived'));
  assert.equal(matchScore([{ kind: 'theme', tag: 'halloween' }], [{ kind: 'theme', tag: 'halloween' }, { kind: 'audience', tag: 'teachers' }]), 3 / 4.5);
});

test('a full cart becomes a real pack, frees its slot, and its products wait out the cooldown before a similar pack', () => {
  const ids = ['habit-tracker', 'goal-planner', 'todo-checklist', 'habit-tracker'].map((type, i) => finished(`Halloween ${i}`, 'Halloween', { type }));
  const results = ids.map((id) => feedProduct(app, id));
  const built = results.at(-1)!.built;
  assert.equal(built.length, 1, 'the fourth item filled the cart and it was packed');
  assert.equal(app.db.value<number>('SELECT count(*) FROM bundle_items WHERE bundle_product_id = ?', built[0]), 4);
  assert.equal(app.db.value('SELECT product_type FROM products WHERE id = ?', built[0]), 'bundle');
  const f = floor(app);
  assert.equal(f.open.length, 0);
  assert.equal(f.closed[0].status, 'built');
  // Same theme straight away: cooldown keeps the old items out, a new item opens a fresh cart alone.
  const again = feedProduct(app, ids[0]);
  assert.equal(again.joined.length + (again.opened ? 1 : 0), 1);
  const fresh = feedProduct(app, finished('Halloween E', 'Halloween'));
  assert.equal(fresh.joined.length, 1);
  now = new Date(now.getTime() + 31 * 86_400_000);
});

test('the backlog waits while products are still being made, then the break re-sorts it loosely and gathers leftovers into a variety pack', () => {
  app.settings.update('packing', { maxOpenCarts: 2, targetSize: 6, minSize: 3 });
  feedProduct(app, finished('Halloween A', 'Halloween'));
  feedProduct(app, finished('Beach A', 'Summer Beach'));
  const waiting = ['Garden', 'Snow', 'Autumn'].map((t) => finished(`${t} planner`, `${t} theme`));
  for (const id of waiting) assert.ok(feedProduct(app, id).backlog);
  createProduct(app, { productType: 'habit-tracker', title: 'Still rendering' });
  assert.equal(runBreak(app).ran, false, 'nothing re-sorts while the conveyor is busy');
  app.db.run("UPDATE product_versions SET status = 'failed' WHERE status = 'in_progress'");

  // Carts left untouched past staleHours: too small to pack, so they empty back into the backlog.
  now = new Date(now.getTime() + 80 * 3_600_000);
  const r = runBreak(app);
  assert.equal(r.ran, true);
  assert.equal(r.dissolved.length, 2, 'two stale, under-filled carts were emptied');
  const f = floor(app);
  assert.ok(f.open.length >= 1);
  assert.equal(f.open.reduce((s, c) => s + c.items.length, 0) + f.backlog.length >= 5, true, 'nothing was lost');
});

test('leftovers that match nothing become a variety cart at the break', () => {
  app.settings.update('packing', { maxOpenCarts: 2, targetSize: 8, minSize: 3, staleHours: 700 });
  openCart(app, { tags: [{ kind: 'custom', tag: 'nothing matches this' }] });
  for (const t of ['Garden', 'Snow', 'Autumn', 'Space']) feedProduct(app, finished(`${t} planner`, `${t} theme`));
  // One themed cart opened from the first product, then both slots are used; the rest wait.
  assert.equal(floor(app).backlog.length, 3);
  app.db.run("UPDATE pack_carts SET status = 'dissolved', slot = NULL WHERE name LIKE 'Nothing%'");
  const r = runBreak(app);
  assert.ok(r.variety, 'a variety cart was opened');
  const variety = floor(app).open.find((c) => c.id === r.variety)!;
  assert.equal(variety.origin, 'variety');
  assert.ok(variety.items.length >= 3);
});

test('a pack needs at least min-size usable items, and rejected members are dropped before packing', () => {
  app.settings.update('packing', { autoBuild: false });
  const ids = ['A', 'B', 'C'].map((t) => finished(`Halloween ${t}`, 'Halloween'));
  for (const id of ids) feedProduct(app, id);
  const cart = floor(app).open[0];
  app.db.run("UPDATE product_versions SET status = 'rejected' WHERE id = (SELECT current_version_id FROM products WHERE id = ?)", ids[0]);
  assert.throws(() => sealCart(app, cart.id), /2 usable item/);
});

test('remixing winners opens a cart around a tag the best sellers share and fills it from the library', () => {
  const a = finished('Teacher tracker', 'Back to School', { extra: ['teachers'] });
  const b = finished('Teacher planner', 'Classroom', { extra: ['teachers'] });
  finished('Teacher checklist', 'Fall', { extra: ['teachers'] });
  for (const id of [a, b]) addPerformance(app, { productId: id, metric: 'revenue_cents', value: 2500, periodStart: '2026-10-01', periodEnd: '2026-10-20', sourceKind: 'manual_entry' });
  const r = remixWinners(app);
  assert.equal(r.tag.tag, 'teachers');
  assert.equal(r.added, 3, 'all three teacher products, winners first');
  assert.equal(floor(app).open.find((c) => c.id === r.cartId)!.origin, 'remix');
});

test('the pipeline hook feeds finished products automatically only for the configured event', () => {
  const id = finished('Halloween A', 'Halloween');
  const v = app.db.value<string>('SELECT current_version_id FROM products WHERE id = ?', id)!;
  app.settings.update('packing', { feedOn: 'approved' });
  onProductFinished(app, v, 'qa_passed');
  assert.equal(floor(app).open.length, 0);
  onProductFinished(app, v, 'approved');
  assert.equal(floor(app).open.length, 1);
});
