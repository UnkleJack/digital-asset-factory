import type { AppContext } from '../../app/context.ts';
import { newId } from '../../core/ids.ts';
import { audit } from '../../logging/logger.ts';

// HAPPY DAFFY credits: milestone 6 (live provider headroom) plus the earned-credit ledger (milestones 4 and 5).
//
// Credits N (spec D1, locked): the bottleneck provider's usable headroom. Each configured AI text provider's
// headroom is worked out in one unit, AI calls left today (spec H3 option 3: the most restrictive of its own
// constraints):
//   - resting after a rate limit or guardrail hit  -> 0 calls left until the rest ends
//   - a daily call ceiling (Settings -> Generation -> pacing) -> ceiling minus calls made today
//   - no ceiling set                                -> unknown: the app has no number to report for it
// N is the smallest known headroom, and that provider is the bottleneck. The numbers come straight from the
// call log and the pacer at the moment they are asked for, so they are never stale (spec H4).
// When no provider has a known number, there is no live N: the meter falls back to the test number in
// Settings and keeps the TEST label (spec: test values are never shown as live).
//
// Earned credits (spec H1 option 1, owner, 2026-11-10): rewards for qualifying rejections and packs. They are a
// separate balance in credit_ledger and are never added to N, because a reward cannot create AI capacity.

export interface ProviderHeadroom { id: string; limit: number | null; used: number; left: number | null; resting: boolean; restingUntil: string | null }
export interface CreditState {
  value: number;
  source: 'live' | 'test';
  live: boolean;
  state: 'normal' | 'low' | 'zero';
  /** The provider that sets N, when N is live. */
  bottleneck: string | null;
  providers: ProviderHeadroom[];
  /** Providers with no daily ceiling: their headroom is unknown, so they can't be the bottleneck. */
  unknown: string[];
  lowThreshold: number | null;
  earned: number;
}

type Headroom = { id: string; limit: number; used: number; coolingUntil: string | null };

export async function creditState(app: AppContext): Promise<CreditState> {
  const cfg = app.settings.get('arcade');
  const text = app.providers.text as { headroom?: () => Promise<Headroom[] | null> };
  const raw = (await text.headroom?.().catch(() => null)) ?? null;
  const providers: ProviderHeadroom[] = (raw ?? []).map((h) => {
    const resting = !!h.coolingUntil;
    const left = resting ? 0 : h.limit > 0 ? Math.max(0, h.limit - h.used) : null;
    return { id: h.id, limit: h.limit > 0 ? h.limit : null, used: h.used, left, resting, restingUntil: h.coolingUntil };
  });
  const known = providers.filter((p) => p.left !== null);
  const bottleneck = known.length ? known.reduce((a, b) => ((b.left ?? 0) < (a.left ?? 0) ? b : a)) : null;
  const live = !!bottleneck;
  const value = live ? bottleneck!.left! : cfg.testCredits;
  const low = live && cfg.lowCreditWarning !== null && value > 0 && value <= cfg.lowCreditWarning;
  return {
    value,
    source: live ? 'live' : 'test',
    live,
    state: value <= 0 ? 'zero' : low ? 'low' : 'normal',
    bottleneck: bottleneck?.id ?? null,
    providers,
    unknown: providers.filter((p) => p.left === null).map((p) => p.id),
    lowThreshold: cfg.lowCreditWarning,
    earned: earnedCredits(app),
  };
}

/** Locked rule: nothing starts at N = 0. Earned credits never unlock it. */
export function canStartWork(c: Pick<CreditState, 'value'>): boolean {
  return c.value > 0;
}

export function earnedCredits(app: AppContext): number {
  return app.db.value<number>('SELECT coalesce(sum(amount), 0) FROM credit_ledger') ?? 0;
}

export function ledger(app: AppContext, limit = 50) {
  return app.db.all<{ id: string; kind: string; amount: number; award_key: string; note: string; created_at: string }>('SELECT * FROM credit_ledger ORDER BY created_at DESC LIMIT ?', limit);
}

function award(app: AppContext, kind: 'rejection_reward' | 'pack_bonus', key: string, amount: number, note: string): boolean {
  if (app.db.get('SELECT 1 FROM credit_ledger WHERE award_key = ?', key)) return false;
  app.db.insert('credit_ledger', { id: newId('crl'), kind, amount, award_key: key, note, created_at: new Date().toISOString() });
  audit(app.db, 'system', 'arcade.credit_awarded', 'credit_ledger', key, { kind, amount });
  return true;
}

export function qualifyingRejections(app: AppContext): number {
  return app.db.value<number>("SELECT count(*) FROM arcade_reviews WHERE outcome = 'REJECT' AND qualifying = 1") ?? 0;
}

/**
 * Spec D4 (locked): every 5 qualifying rejections earn +1 credit. Counted in rolling groups: each qualifying
 * rejection counts once, and each completed group pays once (award key = the count it was paid at).
 */
export function payRejectionRewards(app: AppContext): number {
  const cfg = app.settings.get('arcade');
  const count = qualifyingRejections(app);
  let paid = 0;
  for (let at = cfg.rejectionsPerCredit; at <= count; at += cfg.rejectionsPerCredit) {
    if (cfg.rejectionRewardCredits > 0 && award(app, 'rejection_reward', `rejections:${at}`, cfg.rejectionRewardCredits, `${at} qualifying rejections`)) paid += cfg.rejectionRewardCredits;
  }
  return paid;
}

/** Spec D3: every 3 qualifying packs earn the pack bonus. The amount is TBD, so nothing is paid until it is set. */
export function payPackBonuses(app: AppContext, qualifyingPacks: number): number {
  const cfg = app.settings.get('arcade');
  if (cfg.packBonusCredits === null) return 0;
  let paid = 0;
  for (let at = cfg.packsPerBonus; at <= qualifyingPacks; at += cfg.packsPerBonus) {
    if (award(app, 'pack_bonus', `packs:${at}`, cfg.packBonusCredits, `${at} qualifying packs`)) paid += cfg.packBonusCredits;
  }
  return paid;
}
