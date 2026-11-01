import { resolvePaths } from '../src/config/paths.ts';
import { acquireLock } from '../src/ops/lock.ts';
import { bootstrap } from '../src/app/bootstrap.ts';
import { createBackup } from '../src/ops/backup.ts';
import { planTidy, applyTidy } from '../src/ops/tidyFolders.ts';
import { planRestore, applyRestore, queueRebuilds } from '../src/ops/restoreProducts.ts';

// npm run restore-products            -> shows what would come back, changes nothing
// npm run restore-products -- --apply -> backs up, re-registers the products, gives them readable folders,
//                                        and queues seed-built products to be rebuilt the next time the app runs

const apply = process.argv.includes('--apply');
const paths = resolvePaths();
let release: () => void = () => {};
try {
  release = acquireLock(paths.dataDir);
} catch (err) {
  console.error(`${(err as Error).message}\nQuit the app, then run this again.`);
  process.exit(1);
}

const app = bootstrap({ logConsole: false });
const label = { rebuild: 'comes back and is rebuilt from its seed', view_only: 'comes back view-only (its AI text was in the lost database)', unfinished: 'comes back as an unfinished draft' } as const;
try {
  const plan = await planRestore(app);
  if (!plan.items.length) console.log('Nothing to restore: every product folder is already in the database.');
  for (const it of plan.items) {
    console.log(`\n${it.title}  [${it.productType}]  ${it.folder}`);
    console.log(`  ${label[it.mode]}; ${it.files.length} file(s)${it.missing.length ? `, ${it.missing.length} missing` : ''}`);
    for (const n of it.notes) console.log(`  - ${n}`);
  }
  for (const s of plan.skipped) console.log(`\nSkipped ${s.folder}: ${s.reason}`);
  if (!apply) {
    if (plan.items.length) console.log(`\n${new Set(plan.items.map((i) => i.productId)).size} product(s) (${plan.items.length} version folders) would be restored. Nothing was changed. To do it: quit the app, then run  npm run restore-products -- --apply`);
  } else if (plan.items.length) {
    console.log('\nBacking up the database and every file first…');
    const backup = createBackup(app.db, paths);
    console.log(`Backup created: ${backup.name}. Undo with  npm run restore -- ${backup.name}`);
    const r = applyRestore(app, plan);
    console.log(`\nRestored ${r.restored.length} product(s).`);
    for (const f of r.failed) console.log(`NOT restored: ${f.folder}: ${f.error}`);
    const tidy = applyTidy(app.db, app.assets, planTidy(app.db, app.assets));
    console.log(`Moved ${tidy.moved.length} folder(s) to readable names.`);
    for (const f of tidy.failed) console.log(`NOT moved: ${f.move.from}: ${f.error}`);
    queueRebuilds(app, r);
    const queued = r.restored.filter((x) => x.queued).length;
    if (queued) console.log(`${queued} product(s) will be rebuilt when you next start the app (./start.sh).`);
    if (r.failed.length || tidy.failed.length) process.exitCode = 1;
  }
} catch (err) {
  console.error(`Restore failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await app.close();
  release();
}
