import type { Db } from './sqlite.ts';
import { json } from './sqlite.ts';
import { notFound } from '../core/errors.ts';
import type { Paper } from '../engine/templates/library.ts';

export interface ProductRow {
  id: string;
  slug: string;
  title: string;
  product_type: string;
  category_id: string | null;
  audience_id: string | null;
  theme_id: string | null;
  opportunity_id: string | null;
  template_id: string | null;
  status: 'active' | 'archived' | 'retired';
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpecRow {
  id: string;
  product_id: string;
  product_type: string;
  params: Record<string, unknown>;
  design_system_id: string;
  audience_id: string | null;
  theme_id: string | null;
  paper: Paper;
  seed: number;
  created_at: string;
}

export type VersionStatus = 'in_progress' | 'ready' | 'failed' | 'qa_failed' | 'superseded' | 'rejected' | 'approved';
export type VersionStage = 'specified' | 'content_generated' | 'artwork_generated' | 'rendered' | 'qa_checked' | 'packaged' | 'listing_prepared' | 'ready_for_review';

export interface VersionRow {
  id: string;
  product_id: string;
  version_no: number;
  spec_id: string;
  parent_version_id: string | null;
  origin: 'initial' | 'regenerate' | 'revision' | 'edit' | 'variation';
  change_note: string;
  revision_notes: string;
  stage: VersionStage;
  status: VersionStatus;
  content: unknown;
  content_provenance: Record<string, unknown> | null;
  deliverable_hash: string | null;
  qa_status: 'pending' | 'passed' | 'passed_with_warnings' | 'failed';
  content_signature: string | null;
  render_diagnostics: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListingRow {
  id: string;
  product_id: string;
  version_id: string;
  marketplace: string;
  account_id: string | null;
  title: string;
  description: string;
  tags: string[];
  price_cents: number;
  currency: string;
  attributes: Record<string, unknown>;
  image_asset_ids: string[];
  file_asset_ids: string[];
  listing_hash: string;
  provenance: Record<string, unknown>;
  validation: { issues: { field: string; message: string }[]; notes: string[] };
  status: 'draft' | 'invalid' | 'ready' | 'export_prepared' | 'published_manual' | 'published_verified' | 'needs_reconciliation' | 'failed' | 'retired';
  created_at: string;
  updated_at: string;
}

export function mapSpec(r: Record<string, unknown>): SpecRow {
  return { ...(r as unknown as SpecRow), params: json(r.params, {}), paper: json(r.paper, { size: 'letter', orientation: 'portrait', grayscale: false }) };
}

export function mapVersion(r: Record<string, unknown>): VersionRow {
  return {
    ...(r as unknown as VersionRow),
    content: json(r.content, null),
    content_provenance: json(r.content_provenance, null),
    render_diagnostics: json(r.render_diagnostics, null),
  };
}

export function mapListing(r: Record<string, unknown>): ListingRow {
  return {
    ...(r as unknown as ListingRow),
    tags: json(r.tags, []),
    attributes: json(r.attributes, {}),
    image_asset_ids: json(r.image_asset_ids, []),
    file_asset_ids: json(r.file_asset_ids, []),
    provenance: json(r.provenance, {}),
    validation: json(r.validation, { issues: [], notes: [] }),
  };
}

export function getProduct(db: Db, id: string): ProductRow {
  const r = db.get<ProductRow>('SELECT * FROM products WHERE id = ?', id);
  if (!r) throw notFound('Product', id);
  return r;
}

export function getVersion(db: Db, id: string): VersionRow {
  const r = db.get('SELECT * FROM product_versions WHERE id = ?', id);
  if (!r) throw notFound('Version', id);
  return mapVersion(r);
}

export function getSpec(db: Db, id: string): SpecRow {
  const r = db.get('SELECT * FROM product_specs WHERE id = ?', id);
  if (!r) throw notFound('Specification', id);
  return mapSpec(r);
}

export function getListing(db: Db, id: string): ListingRow {
  const r = db.get('SELECT * FROM listings WHERE id = ?', id);
  if (!r) throw notFound('Listing', id);
  return mapListing(r);
}

export function listingsForVersion(db: Db, versionId: string): ListingRow[] {
  return db.all('SELECT * FROM listings WHERE version_id = ? ORDER BY marketplace', versionId).map(mapListing);
}

export function updateVersion(db: Db, id: string, patch: Partial<Record<keyof VersionRow, unknown>>): void {
  const out: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = (k === 'content' || k === 'content_provenance' || k === 'render_diagnostics') && v !== null && typeof v !== 'string' ? JSON.stringify(v) : v;
  }
  db.update('product_versions', id, out);
}

export function nameOf(db: Db, table: 'categories' | 'audiences' | 'themes' | 'design_systems', id: string | null): string | null {
  if (!id) return null;
  return db.value<string>(`SELECT name FROM ${table} WHERE id = ?`, id) ?? null;
}
