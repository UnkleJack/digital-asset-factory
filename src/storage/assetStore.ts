import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, realpathSync, statSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import type { Db } from '../db/sqlite.ts';
import { json } from '../db/sqlite.ts';
import { newId } from '../core/ids.ts';
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

  static versionDir(productId: string, versionNo: number): string {
    return `products/${safeSegment(productId)}/v${versionNo}`;
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
