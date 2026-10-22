import { resolvePaths } from '../src/config/paths.ts';
import { listBackups, restoreBackup } from '../src/ops/backup.ts';
import { lockHolder } from '../src/ops/lock.ts';

const paths = resolvePaths();
const name = process.argv[2];
if (!name) {
  console.log('Usage: npm run restore -- <backup-name>\n\nAvailable backups:');
  for (const b of listBackups(paths)) console.log(`  ${b.name}  (${b.products} products, ${b.assets} files)`);
  process.exit(0);
}
const holder = lockHolder(paths.dataDir);
if (holder) {
  console.error(`The app is running (process ${holder}). Quit it before restoring.`);
  process.exit(1);
}
try {
  const r = restoreBackup(paths, name);
  console.log(`Restored ${r.restored}. Your previous data was moved (not deleted) to:\n  ${r.previousDataMovedTo}`);
} catch (err) {
  console.error(`Restore failed: ${(err as Error).message}`);
  process.exit(1);
}
