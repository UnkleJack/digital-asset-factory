import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.ts';
import { applyVerificationCleanup, describePlan, LAST_RUN_FILE, planVerificationCleanup, verificationCleanupDue } from '../src/ops/cleanVerification.ts';

// Weekly cleanup of old test folders in verification-output/ (owner request, 2026-11-05).

const DAY = 86_400_000;
const NOW = new Date('2026-11-20T12:00:00Z');

/** Sets the change time of a file or folder and everything inside it to `days` before NOW. */
function age(path: string, days: number): void {
  const st = statSync(path);
  if (st.isDirectory()) for (const name of readdirSync(path)) age(join(path, name), days);
  const t = new Date(NOW.getTime() - days * DAY);
  utimesSync(path, t, t);
}
function file(path: string, body = 'test'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
}

function makeTree() {
  const base = tempDir('daf-clean-');
  const root = join(base, 'verification-output');
  const data = join(base, 'data');
  const outside = join(base, 'outside-folder');
  file(join(data, 'daf.sqlite'));
  file(join(outside, 'keep.txt'));
  file(join(root, 'old-check', 'data', 'daf.sqlite'));
  file(join(root, 'new-check', 'shot.png'));
  // A copy of the app still running on this folder: its lock names this test's own (live) process.
  file(join(root, 'live-check', 'data', 'daf.lock'), String(process.pid));
  // A lock left behind by a copy that is no longer running.
  file(join(root, 'dead-check', 'daf.lock'), '2147483646');
  file(join(root, 'notes.txt'));
  symlinkSync(outside, join(root, 'link-to-outside'));
  for (const p of [data, outside, join(root, 'old-check'), join(root, 'live-check'), join(root, 'dead-check'), join(root, 'notes.txt')]) age(p, 30);
  age(join(root, 'new-check'), 2);
  return { base, root, data, outside };
}

test('dry run: lists the old folders and changes nothing', () => {
  const { root } = makeTree();
  const plan = planVerificationCleanup(root, NOW);
  assert.deepEqual(plan.remove.map((e) => e.name).sort(), ['dead-check', 'old-check'], 'only old folders with no running app are listed');
  assert.match(plan.skipped.find((s) => s.name === 'live-check')!.reason, /in use right now/);
  assert.match(plan.skipped.find((s) => s.name === 'link-to-outside')!.reason, /link/);
  assert.equal(plan.recent, 1);
  assert.ok(describePlan(plan).some((l) => /old-check .*30 days ago/.test(l)), 'the listing says what would go and how old it is');
  for (const name of ['old-check', 'dead-check', 'new-check', 'live-check', 'link-to-outside', 'notes.txt']) assert.ok(existsSync(join(root, name)), `${name} still there`);
  assert.ok(!existsSync(join(root, LAST_RUN_FILE)), 'a dry run is not recorded as a run');
});

test('cleanup removes only old, unused folders inside verification-output, and nothing else', () => {
  const { root, data, outside } = makeTree();
  const r = applyVerificationCleanup(planVerificationCleanup(root, NOW), NOW);
  assert.deepEqual(r.removed.sort(), ['dead-check', 'old-check']);
  assert.deepEqual(r.failed, []);
  assert.ok(existsSync(root), 'verification-output itself stays');
  assert.ok(existsSync(join(root, 'new-check')), 'a recently used folder stays');
  assert.ok(existsSync(join(root, 'live-check', 'data', 'daf.lock')), 'a folder in use stays');
  assert.ok(existsSync(join(root, 'notes.txt')), 'loose files stay');
  assert.ok(existsSync(join(root, 'link-to-outside')), 'links are not followed or removed');
  assert.ok(existsSync(join(outside, 'keep.txt')), 'nothing outside verification-output is touched');
  assert.ok(existsSync(join(data, 'daf.sqlite')), 'data/ is never touched');
  assert.ok(existsSync(join(root, LAST_RUN_FILE)), 'the run is recorded');
});

test('a folder that starts being used after the list was made is left alone', () => {
  const { root } = makeTree();
  const plan = planVerificationCleanup(root, NOW);
  file(join(root, 'old-check', 'data', 'daf.lock'), String(process.pid));
  const r = applyVerificationCleanup(plan, NOW);
  assert.ok(existsSync(join(root, 'old-check')));
  assert.match(r.failed.find((f) => f.name === 'old-check')!.error, /in use right now/);
  assert.deepEqual(r.removed, ['dead-check']);
});

test('only a folder named verification-output is ever cleaned', () => {
  const { data } = makeTree();
  assert.throws(() => planVerificationCleanup(data, NOW), /only a folder named verification-output/);
});

test('the weekly schedule: due when never run, not again for 7 days, then due again', () => {
  const { base, root } = makeTree();
  assert.equal(verificationCleanupDue(root, NOW), true, 'never run yet');
  applyVerificationCleanup(planVerificationCleanup(root, NOW), NOW);
  assert.equal(verificationCleanupDue(root, new Date(NOW.getTime() + 1 * DAY)), false);
  assert.equal(verificationCleanupDue(root, new Date(NOW.getTime() + 7 * DAY)), true);
  assert.equal(verificationCleanupDue(join(base, 'no-such-folder', 'verification-output'), NOW), false, 'nothing to do when the folder does not exist');
});
