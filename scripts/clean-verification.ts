import { applyVerificationCleanup, describePlan, planVerificationCleanup, verificationRoot } from '../src/ops/cleanVerification.ts';

// npm run clean-verification               -> lists old test folders in verification-output/, then removes them
// npm run clean-verification -- --dry-run  -> only lists what it would remove, changes nothing
//
// Only folders directly inside verification-output/ that have not changed for 7 days are removed. The
// folder itself, data/ and everything else are never touched, and a folder a running copy of the app is
// using is skipped. The app also runs this once a week by itself (Settings → Scheduler →
// cleanVerificationWeekly turns that off).

const dryRun = process.argv.includes('--dry-run');
try {
  const plan = planVerificationCleanup(verificationRoot());
  for (const line of describePlan(plan)) console.log(line);
  if (dryRun) {
    if (plan.remove.length) console.log(`\nDry run: ${plan.remove.length} folder(s) would be removed. Nothing was changed. To remove them, run  npm run clean-verification`);
  } else if (plan.remove.length) {
    const r = applyVerificationCleanup(plan);
    console.log(`\nRemoved ${r.removed.length} folder(s).`);
    for (const f of r.failed) console.log(`NOT removed: ${f.name}: ${f.error}`);
    if (r.failed.length) process.exitCode = 1;
  }
} catch (err) {
  console.error(`Cleanup failed: ${(err as Error).message}`);
  process.exitCode = 1;
}
