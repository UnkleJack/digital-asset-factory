import { Db } from '../src/db/sqlite.ts';
import { migrate } from '../src/db/migrate.ts';
import { resolvePaths } from '../src/config/paths.ts';

const paths = resolvePaths();
const db = new Db(paths.dbFile);
try {
  const r = migrate(db, paths.backupsDir);
  for (const m of r.renumbered) console.log(`Migration ${String(m.from).padStart(3, '0')} is now ${m.name} (file was renumbered).`);
  console.log(r.applied.length || r.renumbered.length ? `Applied: ${r.applied.join(', ') || 'none'}${r.backupFile ? `\nBackup taken first: ${r.backupFile}` : ''}` : 'Database is up to date.');
} catch (err) {
  console.error(`Migration failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
