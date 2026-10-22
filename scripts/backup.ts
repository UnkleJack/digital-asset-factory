import { Db } from '../src/db/sqlite.ts';
import { resolvePaths } from '../src/config/paths.ts';
import { createBackup, listBackups } from '../src/ops/backup.ts';

const paths = resolvePaths();
if (process.argv[2] === '--list') {
  for (const b of listBackups(paths)) console.log(`${b.name}  ${b.products} products, ${b.assets} files, ${(b.bytes / 1048576).toFixed(1)} MB`);
} else {
  const db = new Db(paths.dbFile);
  try {
    const info = createBackup(db, paths);
    console.log(`Backup created: ${info.name} (${info.products} products, ${info.assets} files, ${(info.bytes / 1048576).toFixed(1)} MB)`);
  } finally {
    db.close();
  }
}
