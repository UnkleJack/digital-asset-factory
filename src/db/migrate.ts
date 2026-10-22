import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './sqlite.ts';
import { sha256 } from '../core/hash.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

export interface MigrationResult {
  applied: string[];
  backupFile: string | null;
}

export function migrate(db: Db, backupDir: string, migrationsDir = MIGRATIONS_DIR): MigrationResult {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`);

  const files = readdirSync(migrationsDir).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const applied = new Map(
    db.all<{ version: number; checksum: string; name: string }>('SELECT version, checksum, name FROM schema_migrations').map((r) => [r.version, r]),
  );

  const pending: { version: number; name: string; sql: string; checksum: string }[] = [];
  for (const file of files) {
    const version = Number(file.slice(0, 3));
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const checksum = sha256(sql);
    const prior = applied.get(version);
    if (prior) {
      if (prior.checksum !== checksum) {
        throw new Error(`Migration ${file} was modified after being applied (checksum mismatch). Restore the original file or restore a backup.`);
      }
      continue;
    }
    pending.push({ version, name: file, sql, checksum });
  }

  if (pending.length === 0) return { applied: [], backupFile: null };

  let backupFile: string | null = null;
  const userTables = db.value<number>(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'`) ?? 0;
  if (userTables > 0) {
    mkdirSync(backupDir, { recursive: true });
    backupFile = join(backupDir, `pre-migrate-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
    db.backupTo(backupFile);
  }

  for (const m of pending) {
    db.tx(() => {
      db.exec(m.sql);
      db.run('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)', m.version, m.name, m.checksum, new Date().toISOString());
    });
  }
  return { applied: pending.map((p) => p.name), backupFile };
}
