/*
 * The one list of marketplaces the factory prepares listings for. Everything else (settings, the scheduler, the
 * routes, the seed rows, the ticker and the web screens) reads this list, so adding a marketplace starts here.
 * Maps keyed by `Marketplace` (Record<Marketplace, ...>) make the compiler point at every place that still needs
 * the new marketplace's details: its settings and rules, its adapter, and its fee numbers (or none, which shows
 * "not available" rather than another shop's numbers).
 *
 * No imports: the web screens read this file too.
 */
export const MARKETPLACES = ['etsy', 'gumroad', 'generic'] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

/** How each marketplace is named to a person (stats ticker, account rows). */
export const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  etsy: 'Etsy',
  gumroad: 'Gumroad',
  generic: 'Other shops',
};

export function isMarketplace(m: string): m is Marketplace {
  return (MARKETPLACES as readonly string[]).includes(m);
}
