import { Db } from '../src/db/sqlite.ts';
import { migrate } from '../src/db/migrate.ts';
import { resolvePaths } from '../src/config/paths.ts';
import { acquireLock } from '../src/ops/lock.ts';
import { createBackup } from '../src/ops/backup.ts';
import { AssetStore } from '../src/storage/assetStore.ts';
import { planTidy, applyTidy } from '../src/ops/tidyFolders.ts';

// npm run tidy-folders            -> shows what would move, changes nothing
// npm run tidy-folders -- --apply -> backs up, then moves folders and updates the database

const apply = process.argv.includes('--apply');
const paths = resolvePaths();
// Hold the app's lock while moving, so the app cannot start (and write files) halfway through.
let release: () => void = () => {};
if (apply) {
  try {
    release = acquireLock(paths.dataDir);
  } catch (err) {
    console.error(`${(err as Error).message}\nQuit the app, then run this again.`);
    process.exit(1);
  }
}

const db = new Db(paths.dbFile);
try {
  const upToDate = db.all<{ name: string }>('PRAGMA table_info(product_versions)').some((c) => c.name === 'asset_dir');
  if (!upToDate) {
    if (!apply) throw new Error('The database is from an older version of the app. Run  npm run migrate  (or start the app once), then try again.');
    migrate(db, paths.backupsDir);
  }
  const assets = new AssetStore(paths.assetsDir, db);
  const plan = planTidy(db, assets);
  if (!plan.moves.length) console.log('Nothing to move: every product already has a readable folder.');
  for (const m of plan.moves) console.log(`${m.from}\n  -> ${m.to}  (${m.files} files, "${m.title}")`);
  if (plan.unknownFolders.length) {
    console.log(`\nThese old folders have no record in the database and are left alone (check them yourself):`);
    for (const f of plan.unknownFolders) console.log(`  ${f}`);
  }
  if (!apply) {
    if (plan.moves.length) console.log(`\n${plan.moves.length} folder(s) would move. Nothing was changed. To do it: quit the app, then run  npm run tidy-folders -- --apply`);
  } else if (plan.moves.length) {
    console.log('\nBacking up the database and every file first…');
    const backup = createBackup(db, paths);
    console.log(`Backup created: ${backup.name} (${(backup.bytes / 1048576).toFixed(1)} MB). Restore with  npm run restore -- ${backup.name}`);
    const r = applyTidy(db, assets, plan);
    console.log(`\nMoved ${r.moved.length} folder(s).`);
    if (r.removedEmptyFolders.length) console.log(`Removed ${r.removedEmptyFolders.length} empty old folder(s).`);
    for (const f of r.failed) console.log(`NOT moved: ${f.move.from} -> ${f.move.to}: ${f.error}`);
    if (r.failed.length) process.exitCode = 1;
  }
} catch (err) {
  console.error(`Tidy failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  db.close();
  release();
}
