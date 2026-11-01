import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Db } from '../db/sqlite.ts';
import { AssetStore } from '../storage/assetStore.ts';
import { sha256 } from '../core/hash.ts';

/**
 * Moves product files from the old layout (products/<product id>/v<n>/...) to readable folders
 * (products/<category>/<product name>_<date>/...) and updates every stored path to match.
 *
 * Only folders the database knows about are moved. File names inside a folder do not change, so
 * deliverable hashes (which use file names, not folders) and therefore approvals stay valid.
 */

export interface TidyMove {
  versionId: string;
  title: string;
  from: string;
  to: string;
  files: number;
}

export interface TidyPlan {
  moves: TidyMove[];
  /** Old-style product folders the database has no record of. Left alone; listed so you can check them. */
  unknownFolders: string[];
}

interface Candidate {
  id: string;
  product_id: string;
  version_no: number;
  title: string;
}

export function planTidy(db: Db, assets: AssetStore): TidyPlan {
  const versions = db.all<Candidate>(
    `SELECT v.id, v.product_id, v.version_no, p.title FROM product_versions v JOIN products p ON p.id = v.product_id
     WHERE v.asset_dir IS NULL ORDER BY v.created_at, v.version_no`,
  );
  const reserved = new Set<string>();
  const moves: TidyMove[] = [];
  const known = new Set<string>();
  for (const v of versions) {
    const from = AssetStore.legacyVersionDir(v.product_id, v.version_no);
    known.add(from);
    const files = db.value<number>('SELECT count(*) FROM assets WHERE version_id = ? AND rel_path LIKE ?', v.id, `${from}/%`) ?? 0;
    if (!files || !existsSync(assets.resolve(from))) continue;
    const to = assets.proposeVersionDir(assets.versionFolderRow(v.id), reserved);
    reserved.add(to);
    moves.push({ versionId: v.id, title: v.title, from, to, files });
  }
  // Versions that already have a readable folder still count as known if their old folder lingers.
  for (const r of db.all<{ product_id: string; version_no: number }>('SELECT product_id, version_no FROM product_versions WHERE asset_dir IS NOT NULL')) {
    known.add(AssetStore.legacyVersionDir(r.product_id, r.version_no));
  }
  const unknownFolders: string[] = [];
  const productsDir = assets.resolve('products');
  if (existsSync(productsDir)) {
    for (const p of readdirSync(productsDir, { withFileTypes: true })) {
      if (!p.isDirectory() || !/^prd_/.test(p.name)) continue;
      for (const v of readdirSync(`${productsDir}/${p.name}`, { withFileTypes: true })) {
        if (!v.isDirectory()) continue;
        const rel = `products/${p.name}/${v.name}`;
        if (!known.has(rel)) unknownFolders.push(rel);
      }
    }
  }
  return { moves, unknownFolders };
}

export interface TidyResult {
  moved: TidyMove[];
  failed: { move: TidyMove; error: string }[];
  removedEmptyFolders: string[];
  unknownFolders: string[];
}

/** Carries out a plan. Each folder is moved, then its paths are updated in one transaction; a failure puts that folder back. */
export function applyTidy(db: Db, assets: AssetStore, plan: TidyPlan): TidyResult {
  const moved: TidyMove[] = [];
  const failed: { move: TidyMove; error: string }[] = [];
  for (const m of plan.moves) {
    const fromAbs = assets.resolve(m.from);
    const toAbs = assets.resolve(m.to);
    try {
      if (existsSync(toAbs)) throw new Error(`${m.to} already exists`);
      mkdirSync(dirname(toAbs), { recursive: true });
      renameSync(fromAbs, toAbs);
    } catch (err) {
      failed.push({ move: m, error: (err as Error).message });
      continue;
    }
    try {
      db.tx(() => {
        db.run('UPDATE assets SET rel_path = ? || substr(rel_path, ?) WHERE version_id = ? AND rel_path LIKE ?', m.to, m.from.length + 1, m.versionId, `${m.from}/%`);
        db.run('UPDATE product_versions SET asset_dir = ? WHERE id = ?', m.to, m.versionId);
        rewriteManifest(db, assets, m);
      });
      moved.push(m);
    } catch (err) {
      try {
        renameSync(toAbs, fromAbs);
      } catch {
        // Leave it; the error below says where the files are.
      }
      failed.push({ move: m, error: `paths not updated, folder put back: ${(err as Error).message}` });
    }
  }
  const removedEmptyFolders: string[] = [];
  for (const m of moved) {
    const productDir = dirname(m.from);
    try {
      if (existsSync(assets.resolve(productDir)) && readdirSync(assets.resolve(productDir)).length === 0) {
        rmdirSync(assets.resolve(productDir));
        removedEmptyFolders.push(productDir);
      }
    } catch {
      // Not empty or not removable: harmless, it stays.
    }
  }
  return { moved, failed, removedEmptyFolders: [...new Set(removedEmptyFolders)], unknownFolders: plan.unknownFolders };
}

/** The packaging manifest lists file paths; point them at the new folder and keep its stored hash in step. */
function rewriteManifest(db: Db, assets: AssetStore, m: TidyMove): void {
  const row = db.get<{ id: string; rel_path: string }>("SELECT id, rel_path FROM assets WHERE version_id = ? AND kind = 'manifest'", m.versionId);
  if (!row) return;
  const abs = assets.resolve(row.rel_path);
  if (!existsSync(abs)) return;
  const text = readFileSync(abs, 'utf8').split(`"${m.from}/`).join(`"${m.to}/`);
  writeFileSync(abs, text);
  const buf = Buffer.from(text, 'utf8');
  db.run('UPDATE assets SET sha256 = ?, size_bytes = ? WHERE id = ?', sha256(buf), buf.byteLength, row.id);
}
