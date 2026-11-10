import type { AppContext } from '../../app/context.ts';
import { notFound, validation } from '../../core/errors.ts';
import { audit } from '../../logging/logger.ts';
import { sealCart } from '../packing/service.ts';
import { payPackBonuses } from './credits.ts';
import { recordCrossTab } from './codex.ts';

// HAPPY DAFFY milestone 5: Packs and the pack pool (spec B9, C6, D3).
// The arcade does not invent its own packing: packs are the factory's own (Factory floor carts and bundles).
//   IN PROGRESS   an open cart still collecting approved items
//   BUILT         the cart became a bundle product; it goes through QA and approval like any product
//   READY TO SELL the bundle's current version is approved (QA passed, listing approved)
//   FINALIZED     the owner pressed FINALIZE PACK: the pack enters the pool (spec H14 option 3)
// A pack qualifies for the pack bonus when it is finalized, ready to sell and has at least 15 items (locked).
// Finalizing can't be undone from the arcade: the pool is the record the FINISHED board is built on.

interface BundleRow { id: string; title: string; status: string; version_id: string | null; version_status: string | null; qa_status: string | null; items: number; cart_id: string | null; finalized_at: string | null; thumb: string | null; created_at: string }

function bundles(app: AppContext): BundleRow[] {
  return app.db.all<BundleRow>(
    `SELECT p.id, p.title, p.status, v.id AS version_id, v.status AS version_status, v.qa_status, p.created_at,
            (SELECT count(*) FROM bundle_items bi WHERE bi.bundle_product_id = p.id) AS items,
            (SELECT c.id FROM pack_carts c WHERE c.bundle_product_id = p.id LIMIT 1) AS cart_id,
            pp.finalized_at,
            (SELECT a.id FROM assets a WHERE a.version_id = v.id AND a.role = 'preview' ORDER BY a.page_index LIMIT 1) AS thumb
     FROM products p LEFT JOIN product_versions v ON v.id = p.current_version_id LEFT JOIN pack_pool pp ON pp.bundle_product_id = p.id
     WHERE p.product_type = 'bundle' AND (p.status = 'active' OR pp.bundle_product_id IS NOT NULL)
     ORDER BY coalesce(pp.finalized_at, p.created_at) DESC`);
}

function notReadyReason(b: BundleRow): string | null {
  if (b.version_status === 'approved') return null;
  if (b.version_status === 'in_progress') return 'Still being made.';
  if (b.version_status === 'ready') return 'Waiting for your approval in QA Review.';
  if (b.version_status === 'rejected') return 'Rejected in review.';
  if (b.version_status === 'failed' || b.version_status === 'qa_failed') return 'Failed QA or production. Fix it in the back office.';
  return 'Not approved yet.';
}

export function packsView(app: AppContext) {
  const size = app.settings.get('arcade').qualifyingPackSize;
  const open = app.db.all<{ id: string; name: string; target_size: number; min_size: number; items: number; created_at: string }>(
    `SELECT c.id, c.name, c.target_size, c.min_size, c.created_at, (SELECT count(*) FROM pack_cart_items i WHERE i.cart_id = c.id) AS items
     FROM pack_carts c WHERE c.status = 'open' ORDER BY c.created_at`,
  ).map((c) => ({ ...c, canBuild: c.items >= Math.max(2, c.min_size) }));
  const packs = bundles(app).map((b) => {
    const why = notReadyReason(b);
    const readyToSell = why === null;
    const finalized = !!b.finalized_at;
    return {
      productId: b.id, title: b.title, items: b.items, thumb: b.thumb, versionId: b.version_id, cartId: b.cart_id,
      versionStatus: b.version_status, readyToSell, notReady: why, finalized, finalizedAt: b.finalized_at,
      status: finalized ? 'FINALIZED' : readyToSell ? 'ELIGIBLE' : 'IN PROGRESS',
      qualifies: finalized && readyToSell && b.items >= size,
      canFinalize: !finalized && readyToSell,
      reviewable: b.version_status === 'ready',
    };
  });
  const qualifying = packs.filter((p) => p.qualifies).length;
  const cfg = app.settings.get('arcade');
  return {
    open,
    packs,
    rules: { qualifyingPackSize: size, packsPerBonus: cfg.packsPerBonus, packBonusCredits: cfg.packBonusCredits },
    qualifying,
    /** Qualifying packs counted toward the next bonus (rolling groups). */
    towardNextBonus: qualifying % cfg.packsPerBonus,
  };
}

export function packContents(app: AppContext, bundleProductId: string) {
  if (!app.db.get("SELECT 1 FROM products WHERE id = ? AND product_type = 'bundle'", bundleProductId)) throw notFound('Pack', bundleProductId);
  return app.db.all<{ id: string; title: string; product_type: string; thumb: string | null }>(
    `SELECT p.id, p.title, p.product_type, (SELECT a.id FROM assets a WHERE a.version_id = p.current_version_id AND a.role = 'preview' ORDER BY a.page_index LIMIT 1) AS thumb
     FROM bundle_items bi JOIN products p ON p.id = bi.member_product_id WHERE bi.bundle_product_id = ? ORDER BY bi.position`, bundleProductId);
}

/** Turn an open cart into a pack (the factory's own sealCart). The pack then goes through QA and approval. */
export function buildPack(app: AppContext, cartId: string) {
  return sealCart(app, cartId);
}

/** FINALIZE PACK: only a ready-to-sell pack, once. Counts toward the pack bonus when it qualifies. */
export function finalizePack(app: AppContext, bundleProductId: string, characterId?: string | null) {
  const b = bundles(app).find((x) => x.id === bundleProductId);
  if (!b) throw notFound('Pack', bundleProductId);
  if (b.finalized_at) throw validation('This pack is already finalized.');
  const why = notReadyReason(b);
  if (why) throw validation(`This pack isn't ready to sell yet: ${why}`);
  const now = new Date().toISOString();
  app.db.insert('pack_pool', { bundle_product_id: b.id, cart_id: b.cart_id, items: b.items, finalized_at: now });
  audit(app.db, 'user', 'arcade.pack_finalized', 'product', b.id, { items: b.items });
  const view = packsView(app);
  const bonus = payPackBonuses(app, view.qualifying);
  recordCrossTab(app, characterId, 'packs>leaderboards');
  return { finalizedAt: now, qualifies: view.packs.find((p) => p.productId === b.id)?.qualifies ?? false, bonusPaid: bonus };
}
