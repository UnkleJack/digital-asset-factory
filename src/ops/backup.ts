import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../db/sqlite.ts';
import type { Paths } from '../config/paths.ts';
import { validation } from '../core/errors.ts';
import { safeSegment } from '../storage/assetStore.ts';

export interface BackupInfo {
  name: string;
  createdAt: string;
  products: number;
  assets: number;
  bytes: number;
}

function dirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

export function createBackup(db: Db, paths: Paths): BackupInfo {
  const name = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const dir = join(paths.backupsDir, name);
  mkdirSync(dir, { recursive: true });
  db.backupTo(join(dir, 'daf.sqlite'));
  cpSync(paths.assetsDir, join(dir, 'assets'), { recursive: true });
  const info: BackupInfo = {
    name,
    createdAt: new Date().toISOString(),
    products: db.value<number>('SELECT count(*) FROM products') ?? 0,
    assets: db.value<number>('SELECT count(*) FROM assets') ?? 0,
    bytes: 0,
  };
  info.bytes = dirSize(dir);
  writeFileSync(join(dir, 'backup.json'), JSON.stringify(info, null, 2));
  return info;
}

export function listBackups(paths: Paths): BackupInfo[] {
  if (!existsSync(paths.backupsDir)) return [];
  return readdirSync(paths.backupsDir)
    .filter((n) => n.startsWith('backup-') && existsSync(join(paths.backupsDir, n, 'backup.json')))
    .map((n) => JSON.parse(readFileSync(join(paths.backupsDir, n, 'backup.json'), 'utf8')) as BackupInfo)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function restoreBackup(paths: Paths, name: string): { restored: string; previousDataMovedTo: string } {
  safeSegment(name);
  const dir = join(paths.backupsDir, name);
  if (!existsSync(join(dir, 'backup.json')) || !existsSync(join(dir, 'daf.sqlite'))) throw validation(`Backup "${name}" was not found or is incomplete`);
  const check = new DatabaseSync(join(dir, 'daf.sqlite'), { readOnly: true });
  const ok = (check.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
  check.close();
  if (ok !== 'ok') throw validation(`Backup database failed its integrity check: ${ok}`);
  const aside = join(paths.dataDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(aside, { recursive: true });
  for (const f of ['daf.sqlite', 'daf.sqlite-wal', 'daf.sqlite-shm']) if (existsSync(join(paths.dataDir, f))) renameSync(join(paths.dataDir, f), join(aside, f));
  if (existsSync(paths.assetsDir)) renameSync(paths.assetsDir, join(aside, 'assets'));
  cpSync(join(dir, 'daf.sqlite'), paths.dbFile);
  if (existsSync(join(dir, 'assets'))) cpSync(join(dir, 'assets'), paths.assetsDir, { recursive: true });
  else mkdirSync(paths.assetsDir, { recursive: true });
  return { restored: name, previousDataMovedTo: aside };
}
