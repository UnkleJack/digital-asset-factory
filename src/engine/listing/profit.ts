import type { AppContext } from '../../app/context.ts';

/*
 * What a listing would earn after the marketplace takes its fees (owner's pick from the ChatGPT review, 2026-11-17).
 * The fee numbers live in Settings → Marketplaces → fees, never in this file. The defaults there were read from the
 * marketplaces' own help pages on 2026-11-17 (Etsy: listing fee, transaction fee, US Etsy Payments rate; Gumroad:
 * direct and Discover rates). Nothing here is invented: when a marketplace has no fee numbers, or the price isn't in
 * US dollars, the answer is "unavailable" with the reason, never a guess.
 *
 * What it does NOT include: advertising (Etsy Ads, promoted listings and the like), sales tax, currency conversion,
 * refunds, and whatever you pay to make the product. It is "after the marketplace's published fees", not "profit".
 */

export interface FeeLine { label: string; cents: number }
export interface ProfitScenario {
  label: string;
  /** Fees taken from one sale. */
  feesCents: number;
  /** What is left of the price after those fees. */
  netCents: number;
  /** Net as a share of the price, 0 to 1 (null when the price is 0). */
  netShare: number | null;
  breakdown: FeeLine[];
}
export interface ProfitEstimate {
  available: boolean;
  /** Why there is no estimate (only when not available). */
  reason?: string;
  currency: string;
  priceCents: number;
  scenarios: ProfitScenario[];
  /** A fee paid once per listing, not per sale (Etsy's listing fee). */
  oneTimeCents: number;
  notes: string[];
}

interface ListingLike { marketplace: string; price_cents: number; currency: string }

const pct = (cents: number, percent: number) => Math.round((cents * percent) / 100);

function scenario(label: string, priceCents: number, lines: FeeLine[]): ProfitScenario {
  const feesCents = lines.reduce((a, l) => a + l.cents, 0);
  return { label, feesCents, netCents: priceCents - feesCents, netShare: priceCents > 0 ? (priceCents - feesCents) / priceCents : null, breakdown: lines };
}

export function estimateProfit(app: AppContext, l: ListingLike): ProfitEstimate {
  const base = { currency: l.currency, priceCents: l.price_cents, scenarios: [] as ProfitScenario[], oneTimeCents: 0, notes: [] as string[] };
  const none = (reason: string): ProfitEstimate => ({ ...base, available: false, reason });
  if (l.currency.toUpperCase() !== 'USD') return none(`The fee numbers are in US dollars and this listing is priced in ${l.currency}, so no estimate is made.`);
  const fees = app.settings.get('marketplaces').fees;
  const p = l.price_cents;
  if (l.marketplace === 'etsy') {
    const f = fees.etsy;
    return {
      ...base, available: true,
      oneTimeCents: f.listingFeeCents,
      scenarios: [scenario('Per sale', p, [
        { label: `Transaction fee (${f.transactionPercent}%)`, cents: pct(p, f.transactionPercent) },
        { label: `Payment processing (${f.processingPercent}% + ${(f.processingFixedCents / 100).toFixed(2)})`, cents: pct(p, f.processingPercent) + f.processingFixedCents },
      ])],
      notes: ['Etsy advertising fees are not included. They depend on what you run.'],
    };
  }
  if (l.marketplace === 'gumroad') {
    const f = fees.gumroad;
    return {
      ...base, available: true,
      scenarios: [
        scenario('Sale through your own link', p, [{ label: `Gumroad fee (${f.directPercent}% + ${(f.directFixedCents / 100).toFixed(2)})`, cents: pct(p, f.directPercent) + f.directFixedCents }]),
        scenario('Sale found through Gumroad Discover', p, [{ label: `Gumroad fee (${f.discoverPercent}%)`, cents: pct(p, f.discoverPercent) }]),
      ],
      notes: ["Gumroad's pricing page gives only a percentage for Discover sales, so no fixed amount is added to that line."],
    };
  }
  const f = fees.generic;
  if (!f.known) return none('No fee numbers are set for this marketplace. Add them in Settings → Marketplaces → fees to see an estimate.');
  return {
    ...base, available: true,
    scenarios: [scenario('Per sale', p, [{ label: `Fee (${f.percent}% + ${(f.fixedCents / 100).toFixed(2)})`, cents: pct(p, f.percent) + f.fixedCents }])],
    notes: ['Based on the fee numbers you entered in Settings.'],
  };
}

/** A one-line warning for the listing's notes when a sale would leave nothing, else null. */
export function profitWarning(app: AppContext, l: ListingLike): string | null {
  const e = estimateProfit(app, l);
  if (!e.available) return null;
  const worst = e.scenarios.reduce((a, s) => (s.netCents < a.netCents ? s : a));
  return worst.netCents <= 0 ? `At this price a sale leaves nothing after fees (${worst.label.toLowerCase()}: fees ${(worst.feesCents / 100).toFixed(2)} on a ${(l.price_cents / 100).toFixed(2)} price). Raise the price.` : null;
}
