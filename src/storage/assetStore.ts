import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, realpathSync, statSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import type { Db } from '../db/sqlite.ts';
import { json } from '../db/sqlite.ts';
import { newId, slugify } from '../core/ids.ts';
import { sha256 } from '../core/hash.ts';
import { validation, notFound } from '../core/errors.ts';

export type AssetRole = 'deliverable' | 'preview' | 'listing_image' | 'source' | 'internal' | 'export';

export interface AssetRecord {
  id: string;
  product_id: string | null;
  version_id: string | null;
  kind: string;
  role: AssetRole;
  rel_path: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  page_count: number | null;
  page_index: number | null;
  width_pt: number | null;
  height_pt: number | null;
  width_px: number | null;
  height_px: number | null;
  provenance: Record<string, unknown>;
  created_at: string;
}

export interface AssetMeta {
  productId?: string | null;
  versionId?: string | null;
  kind: string;
  role: AssetRole;
  mime: string;
  pageCount?: number;
  pageIndex?: number;
  widthPt?: number;
  heightPt?: number;
  widthPx?: number;
  heightPx?: number;
  provenance?: Record<string, unknown>;
}

export interface VersionFolderRow {
  id: string;
  version_no: number;
  created_at: string;
  asset_dir: string | null;
  product_id: string;
  slug: string;
  product_type: string;
  category: string | null;
}

/** The calendar day (on this computer's clock) of a timestamp, as YYYY-MM-DD. */
export function localDay(at: string | Date): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  const t = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/;

export function safeSegment(s: string): string {
  if (!SEGMENT.test(s) || s.includes('..')) throw validation(`Unsafe path segment: ${JSON.stringify(s)}`);
  return s;
}

export function rowToAsset(r: Record<string, unknown>): AssetRecord {
  return { ...(r as unknown as AssetRecord), provenance: json(r.provenance, {}) };
}

export class AssetStore {
  readonly root: string;
  private db: Db;

  constructor(root: string, db: Db) {
    mkdirSync(root, { recursive: true });
    this.root = realpathSync(root);
    this.db = db;
  }

  resolve(rel: string): string {
    if (typeof rel !== 'string' || rel.length === 0 || rel.includes('\0')) throw validation('Invalid asset path');
    if (isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) throw validation('Absolute asset paths are not allowed');
    const norm = normalize(rel);
    if (norm.split(/[\\/]/).some((p) => p === '..')) throw validation('Parent-directory segments are not allowed');
    const abs = join(this.root, norm);
    const relBack = relative(this.root, abs);
    if (relBack.startsWith('..') || isAbsolute(relBack)) throw validation('Asset path escapes the asset root');
    let probe = dirname(abs);
    while (!existsSync(probe) && probe.length > this.root.length) probe = dirname(probe);
    const realProbe = realpathSync(probe);
    if (realProbe !== this.root && !realProbe.startsWith(this.root + sep)) throw validation('Asset path escapes the asset root via a link');
    return abs;
  }

  /** The folder layout used before readable names: products/<product id>/v<version number>. */
  static legacyVersionDir(productId: string, versionNo: number): string {
    return `products/${safeSegment(productId)}/v${versionNo}`;
  }

  /**
   * The readable folder for a version's files, e.g. products/coloring-pages/intricate-mandala-coloring-pages_2026-10-28.
   * Chosen once (the first time it is asked for) and stored on the version, so every stage writes to the same place.
   */
  versionDir(versionId: string): string {
    const row = this.versionFolderRow(versionId);
    if (row.asset_dir) return row.asset_dir;
    for (let attempt = 0; attempt < 5; attempt++) {
      const dir = this.proposeVersionDir(row);
      try {
        this.db.run('UPDATE product_versions SET asset_dir = ? WHERE id = ? AND asset_dir IS NULL', dir, versionId);
      } catch {
        continue; // Another version took this name in the meantime; pick the next free one.
      }
      const stored = this.db.value<string>('SELECT asset_dir FROM product_versions WHERE id = ?', versionId);
      if (stored) return stored;
    }
    throw validation('Could not choose a folder for this version');
  }

  /** What versionDir would choose for a version that has no folder yet, skipping names in `reserved`. Stores nothing. */
  proposeVersionDir(row: VersionFolderRow, reserved: ReadonlySet<string> = new Set()): string {
    const base = `products/${safeSegment(slugify(row.category ?? row.product_type))}/${safeSegment(`${row.slug}_${localDay(row.created_at)}`)}`;
    for (let i = 1; ; i++) {
      const dir = i === 1 ? base : `${base}-${i}`;
      if (reserved.has(dir)) continue;
      if (this.db.get('SELECT 1 FROM product_versions WHERE asset_dir = ?', dir)) continue;
      if (existsSync(this.resolve(dir))) continue;
      return dir;
    }
  }

  versionFolderRow(versionId: string): VersionFolderRow {
    const row = this.db.get<VersionFolderRow>(
      `SELECT v.id, v.version_no, v.created_at, v.asset_dir, p.id AS product_id, p.slug, p.product_type, c.name AS category
       FROM product_versions v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE v.id = ?`,
      versionId,
    );
    if (!row) throw notFound('Version', versionId);
    return row;
  }

  write(rel: string, data: Uint8Array | string, meta: AssetMeta): AssetRecord {
    const abs = this.resolve(rel);
    mkdirSync(dirname(abs), { recursive: true });
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, buf);
    renameSync(tmp, abs);
    const record: AssetRecord = {
      id: newId('ast'),
      product_id: meta.productId ?? null,
      version_id: meta.versionId ?? null,
      kind: meta.kind,
      role: meta.role,
      rel_path: rel,
      mime: meta.mime,
      size_bytes: buf.byteLength,
      sha256: sha256(buf),
      page_count: meta.pageCount ?? null,
      page_index: meta.pageIndex ?? null,
      width_pt: meta.widthPt ?? null,
      height_pt: meta.heightPt ?? null,
      width_px: meta.widthPx ?? null,
      height_px: meta.heightPx ?? null,
      provenance: meta.provenance ?? {},
      created_at: new Date().toISOString(),
    };
    this.db.tx(() => {
      this.db.run('DELETE FROM assets WHERE rel_path = ?', rel);
      this.db.insert('assets', { ...record, provenance: JSON.stringify(record.provenance) });
    });
    return record;
  }

  /** Writes a file under the asset root without recording it as a product asset (used by the reference library). */
  writeRaw(rel: string, data: Uint8Array): void {
    const abs = this.resolve(rel);
    mkdirSync(dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, data);
    renameSync(tmp, abs);
  }

  readRaw(rel: string): Buffer {
    return readFileSync(this.resolve(rel));
  }

  /** Removes a file written with writeRaw. Missing files are fine. */
  removeRaw(rel: string): void {
    rmSync(this.resolve(rel), { force: true });
  }

  get(id: string): AssetRecord {
    const row = this.db.get('SELECT * FROM assets WHERE id = ?', id);
    if (!row) throw notFound('Asset', id);
    return rowToAsset(row);
  }

  pathOf(asset: AssetRecord): string {
    return this.resolve(asset.rel_path);
  }

  read(asset: AssetRecord): Buffer {
    return readFileSync(this.pathOf(asset));
  }

  exists(asset: AssetRecord): boolean {
    try {
      return statSync(this.pathOf(asset)).isFile();
    } catch {
      return false;
    }
  }

  forVersion(versionId: string, role?: AssetRole): AssetRecord[] {
    const rows = role
      ? this.db.all('SELECT * FROM assets WHERE version_id = ? AND role = ? ORDER BY kind, page_index, rel_path', versionId, role)
      : this.db.all('SELECT * FROM assets WHERE version_id = ? ORDER BY role, kind, page_index, rel_path', versionId);
    return rows.map(rowToAsset);
  }

  removeVersionRole(versionId: string, roles: AssetRole[]): void {
    for (const a of this.forVersion(versionId)) {
      if (!roles.includes(a.role)) continue;
      try {
        rmSync(this.pathOf(a), { force: true });
      } catch {
        // File already gone; the row is still removed below.
      }
      this.db.run('DELETE FROM assets WHERE id = ?', a.id);
    }
  }
}
