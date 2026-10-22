import { basename } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import type { AppContext } from '../../app/context.ts';
import { getListing, getVersion, getProduct, type ListingRow } from '../../db/repos.ts';
import { adapterFor, OutcomeUnknownError, type AdapterInput } from './adapters.ts';
import { adapterForApp } from './gumroad.ts';
import { sha256 } from '../../core/hash.ts';
import { newId } from '../../core/ids.ts';
import { AppError, approvalRequired, conflict, validation, errorMessage } from '../../core/errors.ts';
import { audit, type AuditActor, redact } from '../../logging/logger.ts';
import { toCsv } from '../producttypes/sheets.ts';
import { invalidateApprovals } from '../listing/service.ts';

export interface ApprovalDecision {
  id: string;
  version_id: string;
  listing_id: string;
  marketplace: string;
  fingerprint: string;
  decided_by: string;
  decided_at: string;
}

export function fingerprintFor(deliverableHash: string | null, listing: Pick<ListingRow, 'listing_hash' | 'marketplace'>): string {
  return sha256(`${deliverableHash ?? 'none'}\n${listing.listing_hash}\n${listing.marketplace}`);
}

export function currentFingerprint(app: AppContext, listing: ListingRow): string {
  return fingerprintFor(getVersion(app.db, listing.version_id).deliverable_hash, listing);
}

export function activeApproval(app: AppContext, listing: ListingRow): ApprovalDecision | null {
  const rows = app.db.all<ApprovalDecision>("SELECT * FROM approval_decisions WHERE listing_id = ? AND decision = 'approved' AND invalidated_at IS NULL ORDER BY decided_at DESC", listing.id);
  const fp = currentFingerprint(app, listing);
  const valid = rows.find((r) => r.fingerprint === fp && r.version_id === listing.version_id);
  if (!valid && rows.length) invalidateApprovals(app, listing.id, 'Deliverables or listing changed since approval', 'system');
  return valid ?? null;
}

export function requireApproval(app: AppContext, listing: ListingRow): ApprovalDecision {
  const a = activeApproval(app, listing);
  if (!a) throw approvalRequired(`"${listing.title}" on ${listing.marketplace} has no valid approval for its current files and listing text. Approve it in Batch approval first.`);
  return a;
}

function adapterInput(app: AppContext, listing: ListingRow): AdapterInput {
  const version = getVersion(app.db, listing.version_id);
  const product = getProduct(app.db, listing.product_id);
  return { listing, productTitle: product.title, slug: product.slug, versionNo: version.version_no, files: listing.file_asset_ids.map((id) => app.assets.get(id)), images: listing.image_asset_ids.map((id) => app.assets.get(id)) };
}

function startAttempt(app: AppContext, listing: ListingRow, operation: string, approval: ApprovalDecision | null, adapter: string, request: Record<string, unknown>): { id: string; key: string; existing: Record<string, unknown> | null } {
  const key = sha256(`${operation}\n${listing.id}\n${approval?.id ?? '-'}\n${approval?.fingerprint ?? '-'}`);
  const prior = app.db.get<Record<string, unknown>>("SELECT * FROM publication_attempts WHERE idempotency_key = ? AND status IN ('started','succeeded','unknown')", key);
  if (prior) {
    if (prior.status === 'succeeded') return { id: String(prior.id), key, existing: prior };
    if (prior.status === 'unknown') throw conflict('A previous attempt has an unknown outcome. Reconcile it before trying again.', { attemptId: prior.id });
    throw conflict('This operation is already in progress.', { attemptId: prior.id });
  }
  const id = newId('pub');
  try {
    app.db.insert('publication_attempts', { id, listing_id: listing.id, operation, idempotency_key: key, approval_decision_id: approval?.id ?? null, adapter, status: 'started', request_summary: JSON.stringify(redactRequest(request)), started_at: new Date().toISOString() });
  } catch {
    throw conflict('This operation was started concurrently.');
  }
  return { id, key, existing: null };
}

function redactRequest(r: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(redact(JSON.stringify(r)));
}

function finishAttempt(app: AppContext, id: string, status: 'succeeded' | 'failed' | 'unknown', response: Record<string, unknown>, error?: string) {
  app.db.update('publication_attempts', id, { status, response_summary: JSON.stringify(redactRequest(response)), error: error ? redact(error).slice(0, 1000) : null, finished_at: new Date().toISOString() });
}

function listingText(l: ListingRow): string {
  return [`TITLE\n${l.title}`, `PRICE\n${(l.price_cents / 100).toFixed(2)} ${l.currency}`, `TAGS\n${l.tags.join(', ')}`, `DESCRIPTION\n${l.description}`].join('\n\n') + '\n';
}

export async function prepareExport(app: AppContext, listingId: string, actor: AuditActor = 'user'): Promise<{ attemptId: string; exportAssetId: string; reused: boolean }> {
  const listing = getListing(app.db, listingId);
  if (listing.status === 'invalid') throw validation('Fix the listing validation issues before exporting.', listing.validation.issues);
  const approval = requireApproval(app, listing);
  const adapter = adapterFor(listing.marketplace);
  const input = adapterInput(app, listing);
  const attempt = startAttempt(app, listing, 'prepare_export', approval, adapter.id, { files: input.files.length, images: input.images.length });
  if (attempt.existing) {
    const prev = JSON.parse(String(attempt.existing.response_summary ?? '{}')) as { exportAssetId?: string };
    if (prev.exportAssetId) {
      try {
        if (app.assets.exists(app.assets.get(prev.exportAssetId))) return { attemptId: attempt.id, exportAssetId: prev.exportAssetId, reused: true };
      } catch {
        // The export's asset row was deleted; reported below.
      }
    }
    throw conflict('An export for this exact approval exists but its file is missing. Re-approve the listing to create a fresh export.');
  }
  try {
    const base = `exports/${adapter.id}/${input.slug}-v${input.versionNo}`;
    const entries: Record<string, Uint8Array> = {};
    for (const f of input.files) entries[`files/${basename(f.rel_path)}`] = app.assets.read(f);
    input.images.forEach((img, i) => (entries[`images/${String(i + 1).padStart(2, '0')}.png`] = app.assets.read(img)));
    const listingJson = { marketplace: adapter.id, title: listing.title, description: listing.description, tags: listing.tags, price: listing.price_cents / 100, currency: listing.currency, attributes: listing.attributes, files: Object.keys(entries).filter((k) => k.startsWith('files/')), images: Object.keys(entries).filter((k) => k.startsWith('images/')), approval: { id: approval.id, decidedAt: approval.decided_at, fingerprint: approval.fingerprint } };
    entries['listing.json'] = strToU8(JSON.stringify(listingJson, null, 2));
    entries['listing.txt'] = strToU8(listingText(listing));
    entries['PUBLISHING_STEPS.md'] = strToU8([`# Publish "${listing.title}" on ${adapter.displayName}`, '', `> ${adapter.notes}`, '', ...adapter.publishingSteps(input).map((s, i) => `${i + 1}. ${s}`), '', '_Marketplace screens change over time; follow the current wording in the marketplace if it differs._', ''].join('\n'));
    if (adapter.id === 'generic') entries['catalog.csv'] = strToU8(toCsv([['title', 'description', 'price', 'currency', 'tags', 'files'], [listing.title, listing.description, (listing.price_cents / 100).toFixed(2), listing.currency, listing.tags.join(';'), listingJson.files.join(';')]]));
    const zip = zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, [v, { mtime: new Date('2000-01-01T00:00:00Z') }]])) as never);
    const asset = app.assets.write(`${base}.zip`, zip, { productId: listing.product_id, versionId: listing.version_id, kind: 'export_zip', role: 'export', mime: 'application/zip', provenance: { generator: 'export-package@1', marketplace: adapter.id, approvalId: approval.id } });
    finishAttempt(app, attempt.id, 'succeeded', { exportAssetId: asset.id, entries: Object.keys(entries) });
    if (!['published_manual', 'published_verified'].includes(listing.status)) app.db.update('listings', listing.id, { status: 'export_prepared', updated_at: new Date().toISOString() });
    audit(app.db, actor, 'publication.export_prepared', 'listing', listing.id, { marketplace: adapter.id, assetId: asset.id });
    return { attemptId: attempt.id, exportAssetId: asset.id, reused: false };
  } catch (err) {
    finishAttempt(app, attempt.id, 'failed', {}, errorMessage(err));
    throw err;
  }
}

function notSupported(adapterName: string, notes: string): AppError {
  return new AppError('publishing_not_supported', `${adapterName} direct publishing is not available. ${notes} Use the export package and then record the publication.`, { httpStatus: 409 });
}

export async function publishListing(app: AppContext, listingId: string, actor: AuditActor = 'user'): Promise<{ status: string; externalUrl: string | null }> {
  const listing = getListing(app.db, listingId);
  const adapter = adapterForApp(app, listing.marketplace);
  if (!adapter.capabilities.publish || !adapter.publish) throw notSupported(adapter.displayName, adapter.notes);
  // An adapter not yet confirmed against a live account only runs when the operator has opted in.
  if (adapter.verification !== 'verified' && !(adapter.id === 'gumroad' && app.settings.get('marketplaces').gumroad.autoPublishEnabled)) {
    throw new AppError('publishing_not_enabled', `${adapter.displayName} direct publishing is off. Turn it on in Settings → Marketplaces → ${adapter.displayName} → "Auto publish enabled", or use the export package and record the publication.`, { httpStatus: 409 });
  }
  if (listing.status === 'needs_reconciliation') throw conflict('Reconcile the previous attempt before publishing again.');
  if (app.db.get('SELECT 1 FROM external_listings WHERE listing_id = ?', listing.id)) throw conflict('This listing is already published; use update instead.');
  const approval = requireApproval(app, listing);
  const input = adapterInput(app, listing);
  const attempt = startAttempt(app, listing, 'publish', approval, adapter.id, { title: listing.title, files: input.files.length });
  if (attempt.existing) return { status: 'already_published', externalUrl: null };
  try {
    const res = await adapter.publish(input);
    const now = new Date().toISOString();
    app.db.tx(() => {
      app.db.insert('external_listings', { id: newId('ext'), listing_id: listing.id, marketplace: adapter.id, external_id: res.externalId, external_url: res.externalUrl, verification: 'api_verified', state: res.state, last_reconciled_at: now, created_at: now, updated_at: now });
      app.db.update('listings', listing.id, { status: 'published_verified', updated_at: now });
      finishAttempt(app, attempt.id, 'succeeded', { externalId: res.externalId, externalUrl: res.externalUrl, state: res.state });
    });
    audit(app.db, actor, 'publication.published', 'listing', listing.id, { marketplace: adapter.id, externalId: res.externalId });
    return { status: 'published_verified', externalUrl: res.externalUrl };
  } catch (err) {
    if (err instanceof OutcomeUnknownError) {
      finishAttempt(app, attempt.id, 'unknown', {}, err.message);
      app.db.update('listings', listing.id, { status: 'needs_reconciliation', updated_at: new Date().toISOString() });
      audit(app.db, actor, 'publication.outcome_unknown', 'listing', listing.id, { marketplace: adapter.id });
      throw conflict(`The publish request may or may not have succeeded (${err.message}). The listing is marked "needs reconciliation"; it will not be retried automatically.`);
    }
    finishAttempt(app, attempt.id, 'failed', {}, errorMessage(err));
    app.db.update('listings', listing.id, { status: 'failed', updated_at: new Date().toISOString() });
    throw err;
  }
}

function validateExternalUrl(marketplace: string, url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw validation('Enter the full listing URL, starting with https://');
  }
  if (u.protocol !== 'https:') throw validation('The listing URL must start with https://');
  const hosts = adapterFor(marketplace).urlHosts;
  if (hosts && !hosts.test(u.hostname)) throw validation(`That URL is not an address on ${adapterFor(marketplace).displayName}`);
}

export function recordManualPublication(app: AppContext, listingId: string, input: { externalUrl: string; externalId?: string }, actor: AuditActor = 'user'): ListingRow {
  const listing = getListing(app.db, listingId);
  validateExternalUrl(listing.marketplace, input.externalUrl);
  const approval = requireApproval(app, listing);
  const recorded = app.db.get<{ external_url: string }>('SELECT external_url FROM external_listings WHERE listing_id = ?', listing.id);
  if (recorded && recorded.external_url !== input.externalUrl) throw conflict(`This listing is already recorded as published at ${recorded.external_url}.`);
  const externalId = (input.externalId?.trim() || input.externalUrl.match(/\/listing\/(\d+)/)?.[1] || input.externalUrl).slice(0, 300);
  const clash = app.db.get<{ listing_id: string }>('SELECT listing_id FROM external_listings WHERE marketplace = ? AND external_id = ?', listing.marketplace, externalId);
  if (clash && clash.listing_id !== listing.id) throw conflict('That external listing is already recorded for a different product listing.');
  const attempt = startAttempt(app, listing, 'record_manual', approval, listing.marketplace, { externalUrl: input.externalUrl });
  if (attempt.existing) return getListing(app.db, listingId);
  const now = new Date().toISOString();
  app.db.tx(() => {
    if (!clash) app.db.insert('external_listings', { id: newId('ext'), listing_id: listing.id, marketplace: listing.marketplace, external_id: externalId, external_url: input.externalUrl, verification: 'manual_unverified', state: 'unknown', created_at: now, updated_at: now });
    app.db.update('listings', listing.id, { status: 'published_manual', updated_at: now });
    finishAttempt(app, attempt.id, 'succeeded', { externalId, externalUrl: input.externalUrl, verification: 'manual_unverified' });
  });
  audit(app.db, actor, 'publication.recorded_manual', 'listing', listing.id, { url: input.externalUrl });
  return getListing(app.db, listingId);
}

export function reconcileListing(app: AppContext, listingId: string, resolution: { outcome: 'published' | 'not_published'; externalUrl?: string; externalId?: string }, actor: AuditActor = 'user'): ListingRow {
  const listing = getListing(app.db, listingId);
  const unknown = app.db.all<{ id: string; operation: string }>("SELECT id, operation FROM publication_attempts WHERE listing_id = ? AND status = 'unknown'", listingId);
  if (!unknown.length) throw conflict('Nothing to reconcile for this listing.');
  const now = new Date().toISOString();
  if (resolution.outcome === 'published') {
    if (!resolution.externalUrl) throw validation('Provide the live listing URL to confirm it was published.');
    validateExternalUrl(listing.marketplace, resolution.externalUrl);
    const externalId = resolution.externalId?.trim() || resolution.externalUrl;
    app.db.tx(() => {
      if (!app.db.get('SELECT 1 FROM external_listings WHERE listing_id = ?', listing.id)) {
        app.db.insert('external_listings', { id: newId('ext'), listing_id: listing.id, marketplace: listing.marketplace, external_id: externalId, external_url: resolution.externalUrl, verification: 'manual_unverified', state: 'unknown', created_at: now, updated_at: now });
      }
      for (const a of unknown) finishAttempt(app, a.id, 'succeeded', { reconciledBy: actor, externalUrl: resolution.externalUrl });
      app.db.update('listings', listing.id, { status: 'published_manual', updated_at: now });
    });
  } else {
    app.db.tx(() => {
      for (const a of unknown) finishAttempt(app, a.id, 'failed', { reconciledBy: actor }, 'Operator confirmed the listing was not published');
      app.db.update('listings', listing.id, { status: 'ready', updated_at: now });
    });
  }
  audit(app.db, actor, 'publication.reconciled', 'listing', listing.id, { outcome: resolution.outcome, attempts: unknown.length });
  return getListing(app.db, listingId);
}

export function publicationStatus(app: AppContext, listingId: string) {
  const listing = getListing(app.db, listingId);
  const adapter = adapterForApp(app, listing.marketplace);
  const directPublishOn = !!adapter.capabilities.publish && (adapter.verification === 'verified' || (adapter.id === 'gumroad' && app.settings.get('marketplaces').gumroad.autoPublishEnabled));
  return {
    listing,
    adapter: { id: adapter.id, name: adapter.displayName, verification: adapter.verification, capabilities: adapter.capabilities, notes: adapter.notes, directPublishOn },
    approval: activeApproval(app, listing),
    external: app.db.all('SELECT * FROM external_listings WHERE listing_id = ?', listingId),
    attempts: app.db.all('SELECT id, operation, adapter, status, error, started_at, finished_at, response_summary FROM publication_attempts WHERE listing_id = ? ORDER BY started_at DESC', listingId),
  };
}
