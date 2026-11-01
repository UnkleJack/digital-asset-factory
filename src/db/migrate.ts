import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './sqlite.ts';
import { sha256 } from '../core/hash.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

export interface MigrationResult {
  applied: string[];
  backupFile: string | null;
  /** Records moved because their migration file was given a new number after it ran. */
  renumbered: { from: number; to: number; name: string }[];
}

export function migrate(db: Db, backupDir: string, migrationsDir = MIGRATIONS_DIR): MigrationResult {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`);

  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(migrationsDir, name), 'utf8');
      return { version: Number(name.slice(0, 3)), name, sql, checksum: sha256(sql) };
    });
  const applied = new Map(
    db.all<{ version: number; checksum: string; name: string }>('SELECT version, checksum, name FROM schema_migrations').map((r) => [r.version, r]),
  );

  // A migration file that was renumbered after it ran (e.g. 003_tournaments.sql -> 005_tournaments.sql)
  // is still the same migration: same name after the number, same checksum. Move its record to the new
  // number so the file that now holds the old number is treated as new instead of as a modified file.
  const suffix = (name: string) => name.slice(4);
  const renumbered: { from: number; to: number; name: string }[] = [];
  for (const row of [...applied.values()]) {
    const sameVersion = files.find((f) => f.version === row.version);
    if (sameVersion && sameVersion.checksum === row.checksum) continue;
    const moved = files.find((f) => f.checksum === row.checksum && suffix(f.name) === suffix(row.name) && f.version !== row.version && !applied.has(f.version));
    if (!moved) continue;
    applied.delete(row.version);
    applied.set(moved.version, { ...row, version: moved.version, name: moved.name });
    renumbered.push({ from: row.version, to: moved.version, name: moved.name });
  }

  const pending: typeof files = [];
  for (const file of files) {
    const prior = applied.get(file.version);
    if (prior) {
      if (prior.checksum !== file.checksum) {
        throw new Error(`Migration ${file.name} was modified after being applied (checksum mismatch). Restore the original file or restore a backup.`);
      }
      continue;
    }
    pending.push(file);
  }

  if (pending.length === 0 && renumbered.length === 0) return { applied: [], backupFile: null, renumbered };

  let backupFile: string | null = null;
  const userTables = db.value<number>(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'`) ?? 0;
  if (userTables > 0) {
    mkdirSync(backupDir, { recursive: true });
    backupFile = join(backupDir, `pre-migrate-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
    db.backupTo(backupFile);
  }

  if (renumbered.length > 0) {
    db.tx(() => {
      for (const r of renumbered) db.run('UPDATE schema_migrations SET version = ?, name = ? WHERE version = ?', r.to, r.name, r.from);
    });
  }

  for (const m of pending) {
    db.tx(() => {
      db.exec(m.sql);
      db.run('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)', m.version, m.name, m.checksum, new Date().toISOString());
    });
  }
  return { applied: pending.map((p) => p.name), backupFile, renumbered };
}
