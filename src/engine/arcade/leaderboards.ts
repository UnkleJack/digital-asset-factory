import type { AppContext } from '../../app/context.ts';

// HAPPY DAFFY milestone 8: Leaderboards (spec B10, C11, H16). Owner's choice, 2026-11-10: the spec's
// recommendation (H16 option 3): totals plus a ranking. All boards are personal (one owner), all-time.
//   FINISHED       packs that are QA'd (current version approved), finalized and in the pack pool. All three, or
//                  nothing (locked). Ranked by items in the pack, then the earlier finish wins a tie.
//   REJECTED WELL  qualifying rejections only: a reason of 2+ sentences that passed the specificity check.
//                  DELETE never appears (locked). The spec leaves the score open, so the board ranks characters
//                  by how many qualifying rejections they made (a plain count, H16 option 1 within option 3).
//   PER TYPE       finished assets (members of finished packs), one board per product type.
//   LAST 3 SHIPPED the newest three finished assets, by the time their pack was finalized (locked: real timestamps).

const FINISHED_SQL = `FROM pack_pool pp JOIN products p ON p.id = pp.bundle_product_id JOIN product_versions v ON v.id = p.current_version_id WHERE v.status = 'approved'`;

export function finishedBoard(app: AppContext) {
  return app.db.all<{ productId: string; title: string; items: number; finalizedAt: string }>(
    `SELECT p.id AS productId, p.title, pp.items, pp.finalized_at AS finalizedAt ${FINISHED_SQL} ORDER BY pp.items DESC, pp.finalized_at ASC`,
  ).map((r, i) => ({ rank: i + 1, ...r }));
}

function finishedAssets(app: AppContext) {
  return app.db.all<{ productId: string; title: string; productType: string; pack: string; finalizedAt: string }>(
    `SELECT m.id AS productId, m.title, m.product_type AS productType, p.title AS pack, pp.finalized_at AS finalizedAt
     ${FINISHED_SQL.replace('FROM pack_pool pp', 'FROM pack_pool pp JOIN bundle_items bi ON bi.bundle_product_id = pp.bundle_product_id JOIN products m ON m.id = bi.member_product_id')}
     ORDER BY pp.finalized_at DESC, bi.position ASC`);
}

export function leaderboards(app: AppContext) {
  const finished = finishedBoard(app);
  const rejectedWell = app.db.all<{ character_id: string | null; count: number; last: string }>(
    "SELECT character_id, count(*) AS count, max(decided_at) AS last FROM arcade_reviews WHERE outcome = 'REJECT' AND qualifying = 1 GROUP BY character_id ORDER BY count DESC, last ASC",
  ).map((r, i) => ({ rank: i + 1, characterId: r.character_id, count: r.count, last: r.last }));
  const recentRejections = app.db.all<{ title: string; productType: string; reason: string; decidedAt: string; characterId: string | null }>(
    "SELECT product_title AS title, product_type AS productType, reason, decided_at AS decidedAt, character_id AS characterId FROM arcade_reviews WHERE outcome = 'REJECT' AND qualifying = 1 ORDER BY decided_at DESC LIMIT 10");
  const assets = finishedAssets(app);
  const byType = new Map<string, { productId: string; title: string; pack: string; finalizedAt: string }[]>();
  for (const a of assets) {
    const list = byType.get(a.productType) ?? [];
    list.push({ productId: a.productId, title: a.title, pack: a.pack, finalizedAt: a.finalizedAt });
    byType.set(a.productType, list);
  }
  const types = [...byType.entries()].map(([type, items]) => ({ type, total: items.length, items: items.slice(0, 20) })).sort((a, b) => b.total - a.total || a.type.localeCompare(b.type));
  const seen = new Set<string>();
  const lastShipped = assets.filter((a) => (seen.has(a.productId) ? false : (seen.add(a.productId), true))).slice(0, 3);
  return {
    finished: { total: finished.length, items: finished.reduce((s, f) => s + f.items, 0), entries: finished.slice(0, 20) },
    rejectedWell: { total: rejectedWell.reduce((s, r) => s + r.count, 0), entries: rejectedWell, recent: recentRejections },
    types,
    lastShipped,
  };
}
