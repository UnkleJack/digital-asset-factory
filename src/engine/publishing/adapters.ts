import type { ListingRow } from '../../db/repos.ts';
import type { AssetRecord } from '../../storage/assetStore.ts';

export interface AdapterInput {
  listing: ListingRow;
  productTitle: string;
  slug: string;
  versionNo: number;
  files: AssetRecord[];
  images: AssetRecord[];
}

export interface PublishResult {
  externalId: string;
  externalUrl: string | null;
  state: 'active' | 'draft';
}

export interface ReconcileResult {
  found: boolean;
  externalId?: string;
  externalUrl?: string | null;
  state?: 'active' | 'draft' | 'inactive' | 'removed';
}

export class OutcomeUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutcomeUnknownError';
  }
}

export interface MarketplaceAdapter {
  id: string;
  displayName: string;
  verification: 'verified' | 'unverified' | 'not_implemented';
  capabilities: { manualExport: true; connect: boolean; publish: boolean; update: boolean; reconcile: boolean };
  notes: string;
  urlHosts: RegExp | null;
  publishingSteps(input: AdapterInput): string[];
  publish?(input: AdapterInput): Promise<PublishResult>;
  update?(input: AdapterInput, externalId: string): Promise<PublishResult>;
  reconcile?(input: AdapterInput, idempotencyKey: string): Promise<ReconcileResult>;
}

const money = (cents: number, cur: string) => `${(cents / 100).toFixed(2)} ${cur}`;

export const etsyAdapter: MarketplaceAdapter = {
  id: 'etsy',
  displayName: 'Etsy',
  verification: 'not_implemented',
  capabilities: { manualExport: true, connect: false, publish: false, update: false, reconcile: false },
  notes: 'Direct Etsy publishing needs an approved Etsy Open API v3 app, OAuth (listings_r and listings_w scopes) and verification against a real shop. It has not been built or verified, so listings are published manually from the export package.',
  urlHosts: /^(www\.)?etsy\.com$/i,
  publishingSteps: (i) => [
    'Open Etsy Shop Manager → Listings → Add a listing.',
    `Photos: upload the images in the images/ folder in order (01 first — it becomes the thumbnail). ${i.images.length} image(s) provided.`,
    'Title: paste the TITLE block from listing.txt.',
    'About this listing: Who made it → "I did"; What is it → "A finished product"; When was it made → the most recent option.',
    `Category: choose the closest match (suggested: ${String(i.listing.attributes.category ?? 'Paper & Party Supplies')}).`,
    'Type: choose "Digital files".',
    'Description: paste the DESCRIPTION block from listing.txt.',
    `Tags: paste the TAGS block (${i.listing.tags.length} tags).`,
    `Price: ${money(i.listing.price_cents, i.listing.currency)}. Etsy still asks for a quantity on digital listings; set the quantity you prefer.`,
    `Digital files: upload every file in the files/ folder (${i.files.length} file(s)).`,
    'Preview the listing, then publish it.',
    'Back in Digital Asset Factory open Publishing → Record publication and paste the listing URL so the status is tracked.',
  ],
};

export const gumroadAdapter: MarketplaceAdapter = {
  id: 'gumroad',
  displayName: 'Gumroad',
  verification: 'not_implemented',
  capabilities: { manualExport: true, connect: false, publish: false, update: false, reconcile: false },
  notes: "Gumroad's own API documentation could not be confirmed during inspection; a product-creation endpoint is described only by third-party mirrors. Direct publishing is not built until it can be verified with a real access token.",
  urlHosts: /(^|\.)gumroad\.com$/i,
  publishingSteps: (i) => [
    'Open your Gumroad dashboard → Products → New product, and choose a digital product.',
    `Name: paste the TITLE block from listing.txt. Price: ${money(i.listing.price_cents, i.listing.currency)}.`,
    'Description: paste the DESCRIPTION block.',
    'Cover and thumbnail: upload the images from the images/ folder (01 as the main image).',
    `Content: upload every file in the files/ folder (${i.files.length} file(s)).`,
    'Publish the product.',
    'Back in Digital Asset Factory open Publishing → Record publication and paste the product URL.',
  ],
};

export const genericAdapter: MarketplaceAdapter = {
  id: 'generic',
  displayName: 'Generic / other shop',
  verification: 'not_implemented',
  capabilities: { manualExport: true, connect: false, publish: false, update: false, reconcile: false },
  notes: 'Export-only: a ZIP with files, images and a catalog CSV row you can import into another shop.',
  urlHosts: null,
  publishingSteps: () => [
    'Upload the files in files/ as the downloadable product in your shop platform.',
    'Use catalog.csv (title, description, price, tags) to fill in the product details, or import it if your platform supports CSV import.',
    'Upload the images in images/ as product photos.',
    'Record the product URL in Digital Asset Factory under Publishing → Record publication.',
  ],
};

const REGISTRY = new Map<string, MarketplaceAdapter>([etsyAdapter, gumroadAdapter, genericAdapter].map((a) => [a.id, a]));

export function adapterFor(id: string): MarketplaceAdapter {
  const a = REGISTRY.get(id);
  if (!a) throw new Error(`No adapter for marketplace ${id}`);
  return a;
}

export function adapters(): MarketplaceAdapter[] {
  return [...REGISTRY.values()];
}

export function registerAdapter(a: MarketplaceAdapter): () => void {
  const prev = REGISTRY.get(a.id);
  REGISTRY.set(a.id, a);
  return () => {
    if (prev) REGISTRY.set(a.id, prev);
    else REGISTRY.delete(a.id);
  };
}
