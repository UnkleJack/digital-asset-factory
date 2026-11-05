import { applyVerificationCleanup, describePlan, planVerificationCleanup, verificationRoot } from '../src/ops/cleanVerification.ts';

// npm run clean-verification            -> shows which old test folders would be removed, changes nothing
// npm run clean-verification -- --apply -> lists them, then removes them
// (Same pattern as tidy-folders, owner's choice 2026-11-05.)
//
// Only folders directly inside verification-output/ that have not changed for 7 days are removed. The
// folder itself, data/ and everything else are never touched, and a folder a running copy of the app is
// using is skipped. The app also runs the cleanup once a week by itself (Settings → Scheduler →
// cleanVerificationWeekly turns that off).

const apply = process.argv.includes('--apply');
try {
  const plan = planVerificationCleanup(verificationRoot());
  for (const line of describePlan(plan)) console.log(line);
  if (!apply) {
    if (plan.remove.length) console.log(`\n${plan.remove.length} folder(s) would be removed. Nothing was changed. To remove them, run  npm run clean-verification -- --apply`);
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
