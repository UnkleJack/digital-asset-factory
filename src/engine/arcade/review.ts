import { rmSync } from 'node:fs';
import type { AppContext } from '../../app/context.ts';
import { AppError, conflict, notFound, validation } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import { audit } from '../../logging/logger.ts';
import { getProduct, getVersion, listingsForVersion } from '../../db/repos.ts';
import { createBatch, addToBatch } from '../approval/batches.ts';
import { decide } from '../approval/service.ts';
import { latestQaResults, openWarnings } from '../approval/warnings.ts';
import { submitWithReason } from '../approval/reasonQueue.ts';
import { maybeDigest } from '../generation/notes.ts';
import { setProductStatus } from '../bundling/service.ts';
import { productType, hasProductType } from '../producttypes/registry.ts';
import { creditState, payRejectionRewards } from './credits.ts';
import { recordCrossTab } from './codex.ts';
import { frictionNow, signalsFor, updateLaziness } from './failsafe.ts';
import { taskOfProduct, assetsForTask } from './workspace.ts';

// HAPPY DAFFY milestone 4: QA Review and the Bin (spec B8, B12, C7). Owner's choice, 2026-11-10: the spec's
// recommendations for every open question.
// - APPROVE and REJECT go through the factory's own decide(): same QA gate, same warning gate, same listings.
//   Approving here is approving in the back office, and the other way round.
// - QA checklist (H9 option 3): the factory's automated checks, a shared core plus each product type's own
//   consistency checks. A hard failure blocks approval; warnings need "I accept these warnings" (existing gate).
// - REJECT (locked): a reason of at least two sentences, then the specificity check (H8 option 3): the factory's
//   AI reason check, which says what is missing. If the AI can't be reached the rejection waits in line and only
//   counts once the AI passes it. Every qualifying rejection counts toward the +1 credit per 5 (locked).
// - DELETE (locked): no reason, no credits, never a rejection. BIN archives the item and lists it in the Bin;
//   PERMANENT DELETE removes it and its files after typing DELETE to confirm (H15 option 3). The Bin can restore.
// - Every decision is kept in arcade_reviews with how long the review took, even after a permanent delete.

const MIN_SENTENCES = 2;

/** Sentences of at least two words. "Bad. Ugly." is two words, not two sentences. */
export function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => (s.match(/\p{L}+/gu) ?? []).length >= 2).length;
}

// Text aimed at the AI reason check rather than describing the product ("mark this usable", "ignore the
// rules", "system:"). Refused before the AI sees it, so a reason can't talk its way into counting as
// specific (PR #32 review). Plain descriptions of a product never match these.
const STEERING = [
  /\b(ignore|disregard|forget|override)\b[^.!?\n]{0,40}\b(rules?|instructions?|prompt|above|previous|checks?)\b/i,
  /\bmark\b[^.!?\n]{0,30}\b(usable|intelligible|valid|specific|approved|passed)\b/i,
  /\b(usable|intelligible)\b\s*["']?\s*[:=]\s*["']?\s*(true|yes)\b/i,
  /(^|\n)\s*(system|assistant|developer)\s*:/i,
  /\b(as an ai|language model|you must (answer|reply|return|output))\b/i,
];
export function steersTheChecker(text: string): boolean {
  return STEERING.some((r) => r.test(text));
}

function currentVersion(app: AppContext, productId: string) {
  const p = getProduct(app.db, productId);
  if (!p.current_version_id) throw validation('This item has no version yet.');
  return { product: p, version: getVersion(app.db, p.current_version_id) };
}

/** The approval item to decide on; items made outside a batch (a pack built on the floor) get one here. */
function approvalItemFor(app: AppContext, productId: string, versionId: string): string {
  const item = app.db.value<string>('SELECT id FROM approval_items WHERE version_id = ? ORDER BY added_at DESC LIMIT 1', versionId);
  if (item) return item;
  const title = app.db.value<string>('SELECT title FROM products WHERE id = ?', productId) ?? 'item';
  addToBatch(app, createBatch(app, `Arcade review — ${title}`.slice(0, 120), 'manual'), versionId);
  return app.db.value<string>('SELECT id FROM approval_items WHERE version_id = ? ORDER BY added_at DESC LIMIT 1', versionId)!;
}

export async function reviewScreen(app: AppContext, productId: string) {
  const { product, version } = currentVersion(app, productId);
  const assets = app.assets.forVersion(version.id);
  const results = latestQaResults(app, version.id);
  const task = taskOfProduct(app, product.id);
  const binned = !!app.db.get('SELECT 1 FROM arcade_bin WHERE product_id = ?', product.id);
  return {
    product: { id: product.id, title: product.title, productType: product.product_type, typeName: hasProductType(product.product_type) ? productType(product.product_type).name : product.product_type, status: product.status, binned },
    version: { id: version.id, versionNo: version.version_no, status: version.status, stage: version.stage, qaStatus: version.qa_status, error: version.error },
    task,
    previews: assets.filter((a) => a.role === 'preview').map((a) => ({ id: a.id, page: (a.page_index ?? 0) + 1 })),
    checklist: results.map((r) => ({ check: r.check_code, severity: r.severity, passed: !!r.passed, message: r.message })),
    warnings: openWarnings(app, version.id).map((w) => ({ check: w.check_code, message: w.message })),
    listings: listingsForVersion(app.db, version.id).map((l) => ({ marketplace: l.marketplace, status: l.status, issues: l.validation.issues.length })),
    decidable: version.status === 'ready' && !binned,
    /** A version that failed production or QA, or was rejected, can be made again with a new seed. */
    canRemake: ['failed', 'qa_failed', 'rejected'].includes(version.status) && !binned,
    history: app.db.all('SELECT outcome, reason_status, liked_note, reason, qualifying, decided_at, duration_ms FROM arcade_reviews WHERE product_id = ? ORDER BY decided_at DESC LIMIT 10', product.id),
    friction: frictionNow(app),
    credits: await creditState(app),
    /** Server time the screen opened; sent back with the decision so the review's duration is measured here. */
    openedAt: new Date().toISOString(),
    minSentences: MIN_SENTENCES,
  };
}

/** Assets waiting for a decision: this character's task assets, plus built packs. Shuffled at friction stage 1+. */
export function reviewQueue(app: AppContext, characterId: string) {
  const tasks = app.db.all<{ id: string; title: string; world: string }>(
    "SELECT t.id, t.title, w.name AS world FROM world_tasks t JOIN worlds w ON w.id = t.world_id WHERE t.character_id = ? AND w.status = 'active'", characterId);
  const items = tasks.flatMap((t) => assetsForTask(app, t.id).filter((a) => a.reviewable).map((a) => ({ productId: a.productId, title: a.title, productType: a.productType, thumb: a.thumb, task: t.title, world: t.world })));
  const packs = app.db.all<{ productId: string; title: string; thumb: string | null }>(
    `SELECT p.id AS productId, p.title, (SELECT a.id FROM assets a WHERE a.version_id = v.id AND a.role = 'preview' ORDER BY a.page_index LIMIT 1) AS thumb
     FROM products p JOIN product_versions v ON v.id = p.current_version_id
     WHERE p.product_type = 'bundle' AND p.status = 'active' AND v.status = 'ready' AND v.qa_status NOT IN ('pending','failed')`,
  ).map((p) => ({ ...p, productType: 'bundle', task: null, world: null }));
  const all = [...items, ...packs];
  const friction = frictionNow(app);
  if (friction.shuffle) for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j]!, all[i]!]; }
  return { items: all, friction };
}

interface ReviewInput {
  characterId?: string | null;
  openedAt: string;
  likedNote?: string;
  reason?: string;
  acceptWarnings?: boolean;
  warningNote?: string;
  oneThingWrong?: string;
  heldMs?: number;
}

function durationSince(openedAt: string): { opened: string; ms: number } {
  const t = Date.parse(openedAt);
  const now = Date.now();
  // A missing or future time can't make a review look slower than it was: it counts as 0 ms.
  if (!Number.isFinite(t) || t > now) return { opened: new Date(now).toISOString(), ms: 0 };
  return { opened: new Date(t).toISOString(), ms: Math.min(now - t, 24 * 3600_000) };
}

function record(app: AppContext, row: Record<string, unknown>): string {
  const id = newId('arv');
  app.db.insert('arcade_reviews', { id, liked_note: '', reason: '', checklist: '[]', qualifying: 0, friction_stage: 0, ...row });
  return id;
}

export async function approve(app: AppContext, productId: string, input: ReviewInput) {
  const { product, version } = currentVersion(app, productId);
  if (app.db.get('SELECT 1 FROM arcade_bin WHERE product_id = ?', productId)) throw validation('This item is in the bin. Restore it first.');
  const friction = frictionNow(app);
  // Failsafe friction is checked here too, so it holds however the request is sent. It never touches the asset.
  if (friction.nameOneThingWrong && (input.oneThingWrong ?? '').trim().length < 8) {
    throw validation('Before approving, name one thing that could be better about it. Anything small counts.', [{ field: 'oneThingWrong', message: 'Name one thing' }]);
  }
  if (friction.holdSeconds !== null && (input.heldMs ?? 0) < friction.holdSeconds * 1000) {
    throw validation(`Hold APPROVE for ${friction.holdSeconds} seconds.`, [{ field: 'heldMs', message: 'Hold to approve' }]);
  }
  const { opened, ms } = durationSince(input.openedAt);
  const liked = (input.likedNote ?? '').trim().slice(0, 2000);
  const itemId = approvalItemFor(app, product.id, version.id);
  const result = decide(app, itemId, { decision: 'approved', notes: liked, acceptWarnings: input.acceptWarnings, warningNote: input.warningNote });
  if (liked || input.warningNote?.trim()) void maybeDigest(app);
  const checklist = latestQaResults(app, version.id).map((r) => ({ check: r.check_code, passed: !!r.passed, severity: r.severity }));
  const signals = signalsFor(app, { outcome: 'APPROVE', durationMs: ms, likedNote: liked, reason: '' });
  const task = taskOfProduct(app, product.id);
  const id = record(app, {
    product_id: product.id, version_id: version.id, product_title: product.title, product_type: product.product_type, task_id: task?.id ?? null,
    character_id: input.characterId ?? null, outcome: 'APPROVE', liked_note: liked,
    checklist: JSON.stringify({ results: checklist, oneThingWrong: (input.oneThingWrong ?? '').trim().slice(0, 500) || undefined }),
    friction_stage: friction.stage, opened_at: opened, decided_at: new Date().toISOString(), duration_ms: ms,
  });
  updateLaziness(app, signals);
  if (task) recordCrossTab(app, input.characterId, 'workspace>qa');
  recordCrossTab(app, input.characterId, 'qa>packs');
  return { reviewId: id, decisionIds: result.decisionIds };
}

export async function reject(app: AppContext, productId: string, input: ReviewInput) {
  const { product, version } = currentVersion(app, productId);
  const reason = (input.reason ?? '').trim();
  // Locked: empty, under two sentences or vague is refused; the text stays on screen to fix (the page keeps it).
  if (!reason) throw validation('Write why you are rejecting it.', [{ field: 'reason', message: 'Required' }]);
  if (sentenceCount(reason) < MIN_SENTENCES) throw validation(`A rejection needs at least ${MIN_SENTENCES} sentences: say which part is wrong, then what is wrong with it.`, [{ field: 'reason', message: 'At least 2 sentences' }]);
  if (steersTheChecker(reason)) throw validation('Write the reason about the item only: which part is wrong, then what is wrong with it. Notes addressed to the checker are not accepted.', [{ field: 'reason', message: 'About the item only' }]);
  const { opened, ms } = durationSince(input.openedAt);
  const signals = signalsFor(app, { outcome: 'REJECT', durationMs: ms, likedNote: '', reason });
  const itemId = approvalItemFor(app, product.id, version.id);
  // Specificity check: the factory's AI reason check. A refusal throws a validation error with the AI's tip.
  const r = await submitWithReason(app, { action: 'decision', itemId, decision: 'rejected', notes: reason });
  const task = taskOfProduct(app, product.id);
  const id = record(app, {
    product_id: product.id, version_id: version.id, product_title: product.title, product_type: product.product_type, task_id: task?.id ?? null,
    character_id: input.characterId ?? null, outcome: 'REJECT', reason, reason_status: r.queued ? 'waiting' : 'checked', reason_queue_id: r.queued ? r.id : null,
    qualifying: r.queued ? 0 : 1, friction_stage: frictionNow(app).stage, opened_at: opened, decided_at: new Date().toISOString(), duration_ms: ms,
  });
  updateLaziness(app, signals);
  const paid = r.queued ? 0 : payRejectionRewards(app);
  if (task) recordCrossTab(app, input.characterId, 'workspace>qa');
  return { reviewId: id, queued: r.queued, message: r.queued ? r.message : null, creditsEarned: paid };
}

/** MAKE A NEW VERSION: the factory's own regenerate (a new seed), for a version that failed or was rejected. */
export function remake(app: AppContext, productId: string) {
  const { product, version } = currentVersion(app, productId);
  if (!['failed', 'qa_failed', 'rejected'].includes(version.status)) throw validation('Only a version that failed or was rejected is made again here.');
  if (app.db.get('SELECT 1 FROM arcade_bin WHERE product_id = ?', productId)) throw validation('This item is in the bin. Restore it first.');
  const r = decide(app, approvalItemFor(app, product.id, version.id), { decision: 'regenerate_requested', notes: '' });
  return { newVersionId: r.newVersionId };
}

/** Rejections that waited for the AI: count them once the AI passed them, drop them if it refused. */
export function settleWaitingRejections(app: AppContext): void {
  const waiting = app.db.all<{ id: string; reason_queue_id: string | null }>("SELECT id, reason_queue_id FROM arcade_reviews WHERE reason_status = 'waiting'");
  let changed = false;
  for (const w of waiting) {
    const status = w.reason_queue_id ? app.db.value<string>('SELECT status FROM reason_queue WHERE id = ?', w.reason_queue_id) : 'dismissed';
    if (status === 'applied') { app.db.run("UPDATE arcade_reviews SET reason_status = 'checked', qualifying = 1 WHERE id = ?", w.id); changed = true; }
    else if (status && status !== 'waiting') app.db.run("UPDATE arcade_reviews SET reason_status = 'refused', qualifying = 0 WHERE id = ?", w.id);
  }
  if (changed) payRejectionRewards(app);
}

export function deleteItem(app: AppContext, productId: string, input: { destination: 'bin' | 'permanent'; confirm?: string; openedAt: string; characterId?: string | null }) {
  const { product, version } = currentVersion(app, productId);
  const { opened, ms } = durationSince(input.openedAt);
  const base = {
    product_title: product.title, product_type: product.product_type, task_id: taskOfProduct(app, product.id)?.id ?? null, character_id: input.characterId ?? null,
    opened_at: opened, decided_at: new Date().toISOString(), duration_ms: ms,
  };
  if (input.destination === 'bin') {
    if (app.db.get('SELECT 1 FROM arcade_bin WHERE product_id = ?', product.id)) throw validation('This item is already in the bin.');
    const reviewId = record(app, { ...base, product_id: product.id, version_id: version.id, outcome: 'DELETE_BIN' });
    setProductStatus(app, product.id, 'archived');
    app.db.insert('arcade_bin', { product_id: product.id, review_id: reviewId, previous_status: product.status, binned_at: base.decided_at });
    audit(app.db, 'user', 'arcade.binned', 'product', product.id, {});
    return { reviewId, destination: 'bin' as const };
  }
  return permanentlyDelete(app, product.id, input.confirm, base);
}

function permanentlyDelete(app: AppContext, productId: string, confirm: string | undefined, base: Record<string, unknown>) {
  if (confirm !== 'DELETE') throw validation('Type DELETE to confirm. A permanent delete removes the item and its files and cannot be undone.', [{ field: 'confirm', message: 'Type DELETE' }]);
  const product = getProduct(app.db, productId);
  if (app.db.get("SELECT 1 FROM jobs WHERE product_id = ? AND status IN ('queued','running')", productId)) throw conflict('Wait for production to finish first.');
  if (app.db.get('SELECT 1 FROM external_listings e JOIN listings l ON l.id = e.listing_id WHERE l.product_id = ?', productId)) throw conflict('This item has been published to a marketplace, so it can only go in the bin.');
  if (app.db.get('SELECT 1 FROM bundle_items WHERE member_product_id = ?', productId)) throw conflict('This item is inside a pack, so it can only go in the bin.');
  if (app.db.get('SELECT 1 FROM pack_pool WHERE bundle_product_id = ?', productId)) throw conflict('This pack is finalized in the pack pool, so it can only go in the bin.');
  const versions = app.db.all<{ id: string; asset_dir: string | null }>('SELECT id, asset_dir FROM product_versions WHERE product_id = ?', productId);
  const reviewId = record(app, { ...base, product_id: productId, version_id: null, outcome: 'DELETE_PERMANENT' });
  try {
    app.db.tx(() => {
      for (const v of versions) app.assets.removeVersionRole(v.id, ['deliverable', 'preview', 'listing_image', 'source', 'internal', 'export']);
      app.db.run('DELETE FROM assets WHERE product_id = ?', productId);
      app.db.run('DELETE FROM products WHERE id = ?', productId);
    });
  } catch (err) {
    app.db.run('DELETE FROM arcade_reviews WHERE id = ?', reviewId);
    throw new AppError('delete_blocked', `This item is still used elsewhere, so it can only go in the bin. (${(err as Error).message})`, { httpStatus: 409 });
  }
  // The rows are gone; now the folders. Only folders under products/ inside the asset root are touched.
  for (const v of versions) {
    if (!v.asset_dir?.startsWith('products/')) continue;
    try { rmSync(app.assets.resolve(v.asset_dir), { recursive: true, force: true }); } catch { /* already gone */ }
  }
  audit(app.db, 'user', 'arcade.deleted_permanently', 'product', productId, { title: product.title, versions: versions.length });
  return { reviewId, destination: 'permanent' as const };
}

export function binList(app: AppContext) {
  return app.db.all<{ productId: string; title: string; productType: string; binnedAt: string; versionId: string | null; thumb: string | null }>(
    `SELECT p.id AS productId, p.title, p.product_type AS productType, b.binned_at AS binnedAt, p.current_version_id AS versionId,
            (SELECT a.id FROM assets a WHERE a.version_id = p.current_version_id AND a.role = 'preview' ORDER BY a.page_index LIMIT 1) AS thumb
     FROM arcade_bin b JOIN products p ON p.id = b.product_id ORDER BY b.binned_at DESC`);
}

export function restoreFromBin(app: AppContext, productId: string) {
  const b = app.db.get<{ previous_status: string }>('SELECT previous_status FROM arcade_bin WHERE product_id = ?', productId);
  if (!b) throw notFound('Binned item', productId);
  setProductStatus(app, productId, b.previous_status === 'retired' ? 'retired' : b.previous_status === 'archived' ? 'archived' : 'active');
  app.db.run('DELETE FROM arcade_bin WHERE product_id = ?', productId);
  audit(app.db, 'user', 'arcade.restored', 'product', productId, {});
  return { ok: true };
}

export function deleteFromBin(app: AppContext, productId: string, confirm: string | undefined) {
  if (!app.db.get('SELECT 1 FROM arcade_bin WHERE product_id = ?', productId)) throw notFound('Binned item', productId);
  const p = getProduct(app.db, productId);
  const now = new Date().toISOString();
  return permanentlyDelete(app, productId, confirm, { product_title: p.title, product_type: p.product_type, task_id: taskOfProduct(app, productId)?.id ?? null, character_id: null, opened_at: now, decided_at: now, duration_ms: 0 });
}
