import { z } from 'zod';
import type { AppContext } from '../../app/context.ts';
import type { ListingRules } from '../../config/settings.ts';
import { productType } from '../producttypes/registry.ts';
import { versionContext } from '../specification/service.ts';
import { getListing, listingsForVersion, updateVersion, type ListingRow } from '../../db/repos.ts';
import { textMode, structuredCall, type CallTrace, type Provenance } from '../generation/service.ts';
import { AI_SYSTEM_BASE } from '../producttypes/types.ts';
import { hashObject } from '../../core/hash.ts';
import { newId } from '../../core/ids.ts';
import { validation, conflict } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import type { AssetRecord } from '../../storage/assetStore.ts';

export const MARKETPLACES = ['etsy', 'gumroad', 'generic'] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

export function isMarketplace(m: string): m is Marketplace {
  return (MARKETPLACES as readonly string[]).includes(m);
}

export function rulesFor(app: AppContext, m: Marketplace): ListingRules {
  return app.settings.get('marketplaces')[m].rules;
}

export interface ListingDraft {
  title: string;
  description: string;
  tags: string[];
  price_cents: number;
  image_asset_ids: string[];
  file_asset_ids: string[];
}

export function listingHashOf(l: ListingDraft & { currency: string; attributes: Record<string, unknown> }): string {
  return hashObject({ t: l.title, d: l.description, g: l.tags, p: l.price_cents, c: l.currency, a: l.attributes, i: l.image_asset_ids, f: l.file_asset_ids });
}

export function normalizeTags(tags: string[], rules: ListingRules): { tags: string[]; notes: string[] } {
  const notes: string[] = [];
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.toLowerCase().replace(/[^a-z0-9 &'-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (t.length > rules.tagMaxLen) {
      notes.push(`Dropped tag longer than ${rules.tagMaxLen} characters: "${t}"`);
      continue;
    }
    if (!out.includes(t)) out.push(t);
  }
  if (out.length > rules.tagsMax) notes.push(`Kept the first ${rules.tagsMax} of ${out.length} tags`);
  return { tags: out.slice(0, rules.tagsMax), notes };
}

export function fitTitle(parts: string[], max: number): string {
  let title = '';
  for (const p of parts) {
    const next = title ? `${title} | ${p}` : p;
    if (next.length > max) break;
    title = next;
  }
  if (!title) title = parts[0].slice(0, max).replace(/\s+\S*$/, '');
  return title;
}

export function validateListing(rules: ListingRules, l: ListingDraft, files: AssetRecord[], images: AssetRecord[]): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = [];
  if (l.title.length < rules.titleMin || l.title.length > rules.titleMax) issues.push({ field: 'title', message: `must be ${rules.titleMin}-${rules.titleMax} characters (now ${l.title.length})` });
  if (l.description.length < rules.descriptionMin || l.description.length > rules.descriptionMax) issues.push({ field: 'description', message: `must be ${rules.descriptionMin}-${rules.descriptionMax} characters (now ${l.description.length})` });
  if (l.tags.length < rules.tagsMin || l.tags.length > rules.tagsMax) issues.push({ field: 'tags', message: `needs ${rules.tagsMin}-${rules.tagsMax} tags (now ${l.tags.length})` });
  const longTags = l.tags.filter((t) => t.length > rules.tagMaxLen);
  if (longTags.length) issues.push({ field: 'tags', message: `tags longer than ${rules.tagMaxLen} characters: ${longTags.join(', ')}` });
  if (new Set(l.tags).size !== l.tags.length) issues.push({ field: 'tags', message: 'duplicate tags' });
  if (l.price_cents < rules.priceMinCents) issues.push({ field: 'price', message: `must be at least ${(rules.priceMinCents / 100).toFixed(2)}` });
  if (images.length < rules.imagesMin || images.length > rules.imagesMax) issues.push({ field: 'images', message: `needs ${rules.imagesMin}-${rules.imagesMax} images (now ${images.length})` });
  if (files.length < 1 || files.length > rules.filesMax) issues.push({ field: 'files', message: `needs 1-${rules.filesMax} files (now ${files.length})` });
  const big = files.filter((f) => f.size_bytes > rules.fileMaxBytes);
  if (big.length) issues.push({ field: 'files', message: `files over ${Math.round(rules.fileMaxBytes / 1048576)} MB: ${big.map((f) => f.rel_path.split('/').pop()).join(', ')}` });
  return issues;
}

function chooseFiles(assets: AssetRecord[], rules: ListingRules): AssetRecord[] {
  const deliverables = assets.filter((a) => a.role === 'deliverable');
  const zip = deliverables.find((a) => a.kind === 'package_zip');
  const pdf = deliverables.find((a) => a.kind === 'pdf');
  const primary = deliverables.filter((a) => !['package_zip', 'license', 'instructions'].includes(a.kind));
  if (primary.length === 1 && pdf && zip && rules.filesMax >= 2) return [pdf, zip];
  return zip ? [zip] : primary.slice(0, rules.filesMax);
}

const ListingCopy = z.object({
  title: z.string().min(5).max(255),
  description: z.string().min(50).max(8000),
  tags: z.array(z.string().min(2).max(60)).min(3).max(25),
});

export function deterministicCopy(title: string, hints: ReturnType<ReturnType<typeof productType>['listingHints']>, rules: ListingRules, typeName: string): z.infer<typeof ListingCopy> {
  const kw = hints.keywords.map((k) => k.replace(/\b\w/g, (m) => m.toUpperCase()));
  const description = [
    `${title} — printable ${typeName.toLowerCase()}, ready to download and use today.`, '',
    "WHAT'S INCLUDED", ...hints.included.map((i) => `• ${i}`), '',
    'FEATURES', ...hints.features.map((f) => `• ${f}`), '',
    'HOW IT WORKS', hints.usage, '',
    'PLEASE NOTE',
    '• This is a digital download. No physical item will be shipped.',
    '• Colors may look slightly different depending on your screen and printer.',
    '• For personal use. See the license file included with your download.',
  ].join('\n');
  return { title: fitTitle([title, ...kw.slice(0, 4)], rules.titleMax), description, tags: hints.keywords };
}

export async function prepareListings(app: AppContext, versionId: string, marketplaces: Marketplace[], trace: CallTrace = {}, actor: AuditActor = 'worker'): Promise<ListingRow[]> {
  const { version, product, ctx } = versionContext(app, versionId);
  const def = productType(product.product_type);
  if (!version.content) throw validation('Version has no content yet');
  const hints = def.listingHints(ctx, version.content);
  const assets = app.assets.forVersion(versionId);
  const images = assets.filter((a) => a.role === 'listing_image').sort((a, b) => (a.page_index ?? 0) - (b.page_index ?? 0));
  const s = app.settings.all();
  const price = s.marketplaces.defaultPriceCents[product.product_type] ?? 499;
  const mode = await textMode(app);
  const out: ListingRow[] = [];
  for (const m of marketplaces) {
    if (!s.marketplaces[m].enabled) continue;
    const rules = rulesFor(app, m);
    let copy: z.infer<typeof ListingCopy>;
    let provenance: Provenance;
    if (mode.mode === 'ai') {
      const r = await structuredCall(app, {
        purpose: `listing:${m}`,
        schema: ListingCopy,
        system: `${AI_SYSTEM_BASE}\n- Describe the product honestly. Never claim it is a bestseller, popular, award-winning, or guaranteed to produce results.\n- State clearly that it is a digital download and no physical item ships.`,
        prompt: `Write a ${m === 'generic' ? 'web shop' : m} listing for a digital product.
Product title: ${product.title}
Type: ${def.name}. Paper: ${ctx.paper.size} ${ctx.paper.orientation}.
Audience: ${ctx.audience?.name ?? 'general adults'}. Theme: ${ctx.theme?.name ?? 'none'}.
Features: ${hints.features.join('; ')}
Included files: ${hints.included.join('; ')}
How to use: ${hints.usage}
Candidate search keywords: ${hints.keywords.join(', ')}
Constraints: title at most ${rules.titleMax} characters and front-loaded with the most important search phrase; description ${rules.descriptionMin}-${Math.min(rules.descriptionMax, 3000)} characters with short sections (What's included, Features, How it works, Please note); exactly ${Math.min(rules.tagsMax, 13)} tags, each at most ${rules.tagMaxLen} characters, lowercase, no repeated words from the title where avoidable.${version.revision_notes ? `\nReviewer notes to apply: ${version.revision_notes}` : ''}`,
        maxTokens: 6000,
        trace: { ...trace, versionId },
      });
      copy = r.data;
      provenance = r.provenance;
    } else {
      copy = deterministicCopy(product.title, hints, rules, def.name);
      provenance = { generator: 'deterministic', library: 'listing-template@1', note: mode.reason };
    }
    const notes: string[] = [];
    let title = copy.title.trim();
    if (title.length > rules.titleMax) {
      title = title.slice(0, rules.titleMax).replace(/\s+\S*$/, '').replace(/[|,\-\s]+$/, '');
      notes.push(`Title shortened to ${rules.titleMax} characters`);
    }
    const nt = normalizeTags(copy.tags, rules);
    notes.push(...nt.notes);
    const files = chooseFiles(assets, rules);
    const draft: ListingDraft = { title, description: copy.description.trim(), tags: nt.tags, price_cents: price, image_asset_ids: images.slice(0, rules.imagesMax).map((i) => i.id), file_asset_ids: files.map((f) => f.id) };
    const attributes = { listingType: 'digital download', whoMade: 'I did', whatIsIt: 'A finished product', category: def.category, paper: `${ctx.paper.size} ${ctx.paper.orientation}` };
    const issues = validateListing(rules, draft, files, images.slice(0, rules.imagesMax));
    const hash = listingHashOf({ ...draft, currency: s.general.currency, attributes });
    const now = new Date().toISOString();
    const existing = app.db.get<{ id: string; listing_hash: string }>('SELECT id, listing_hash FROM listings WHERE version_id = ? AND marketplace = ?', versionId, m);
    const row = {
      ...draft,
      tags: JSON.stringify(draft.tags),
      image_asset_ids: JSON.stringify(draft.image_asset_ids),
      file_asset_ids: JSON.stringify(draft.file_asset_ids),
      attributes: JSON.stringify(attributes),
      currency: s.general.currency,
      listing_hash: hash,
      provenance: JSON.stringify(provenance),
      validation: JSON.stringify({ issues, notes }),
      status: issues.length ? 'invalid' : 'ready',
      updated_at: now,
    };
    if (existing) {
      app.db.update('listings', existing.id, row);
      if (existing.listing_hash !== hash) invalidateApprovals(app, existing.id, 'Listing regenerated', actor);
      out.push(getListing(app.db, existing.id));
    } else {
      const id = newId('lst');
      const account = app.db.value<string>('SELECT id FROM marketplace_accounts WHERE marketplace = ? LIMIT 1', m) ?? null;
      app.db.insert('listings', { id, product_id: product.id, version_id: versionId, marketplace: m, account_id: account, created_at: now, ...row });
      out.push(getListing(app.db, id));
    }
  }
  updateVersion(app.db, versionId, { stage: 'listing_prepared' });
  return out;
}

export function invalidateApprovals(app: AppContext, listingId: string, reason: string, actor: AuditActor): number {
  const now = new Date().toISOString();
  const n = app.db.run("UPDATE approval_decisions SET invalidated_at = ?, invalidated_reason = ? WHERE listing_id = ? AND decision = 'approved' AND invalidated_at IS NULL", now, reason, listingId).changes;
  if (n) audit(app.db, actor, 'approval.invalidated', 'listing', listingId, { reason, decisions: n });
  return n;
}

export const ListingPatch = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().min(1).max(60000).optional(),
  tags: z.array(z.string().min(1).max(80)).max(40).optional(),
  price_cents: z.number().int().min(0).max(10_000_000).optional(),
}).strict();

export function updateListing(app: AppContext, listingId: string, patchInput: unknown, actor: AuditActor = 'user'): ListingRow {
  const parsed = ListingPatch.safeParse(patchInput);
  if (!parsed.success) throw validation('Invalid listing changes', parsed.error.issues);
  const l = getListing(app.db, listingId);
  if (l.status === 'needs_reconciliation') throw conflict('This listing has a publication in an unknown state. Reconcile it before editing.');
  const rules = rulesFor(app, l.marketplace as Marketplace);
  const p = parsed.data;
  const notes: string[] = [];
  let tags = l.tags;
  if (p.tags) {
    const nt = normalizeTags(p.tags, rules);
    tags = nt.tags;
    notes.push(...nt.notes);
  }
  const draft: ListingDraft = { title: p.title?.trim() ?? l.title, description: p.description?.trim() ?? l.description, tags, price_cents: p.price_cents ?? l.price_cents, image_asset_ids: l.image_asset_ids, file_asset_ids: l.file_asset_ids };
  const files = l.file_asset_ids.map((id) => app.assets.get(id));
  const images = l.image_asset_ids.map((id) => app.assets.get(id));
  const issues = validateListing(rules, draft, files, images);
  const hash = listingHashOf({ ...draft, currency: l.currency, attributes: l.attributes });
  if (hash === l.listing_hash) return l;
  const published = l.status === 'published_manual' || l.status === 'published_verified';
  if (published) notes.push('Local changes are not yet on the marketplace: re-approve, then update the live listing.');
  app.db.update('listings', listingId, {
    title: draft.title, description: draft.description, tags: JSON.stringify(draft.tags), price_cents: draft.price_cents, listing_hash: hash,
    validation: JSON.stringify({ issues, notes }), status: published ? l.status : issues.length ? 'invalid' : 'ready',
    provenance: JSON.stringify({ ...l.provenance, editedBy: actor, editedAt: new Date().toISOString() }), updated_at: new Date().toISOString(),
  });
  invalidateApprovals(app, listingId, 'Listing edited after approval', actor);
  audit(app.db, actor, 'listing.edited', 'listing', listingId, { fields: Object.keys(p) });
  return getListing(app.db, listingId);
}

export { listingsForVersion };
