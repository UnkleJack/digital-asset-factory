import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alive } from './lock.ts';

// Cleanup of old test data in verification-output/ (owner request, 2026-11-05).
// Browser checks run throwaway copies of the app there (their own data folders, TEST worlds and drafts).
// Rules:
// - Only folders directly inside verification-output/ are ever removed. The folder itself, loose files in
//   it, anything reached through a link, and anything outside it (data/ above all) are never touched.
// - A folder counts as old only when nothing inside it changed for MAX_AGE_DAYS days.
// - A folder that a running copy of the app is using right now (its data-folder lock, daf.lock, is held by
//   a live process) is skipped, however old it looks, so a cleanup never breaks a check in progress.

export const VERIFICATION_DIR_NAME = 'verification-output';
export const MAX_AGE_DAYS = 7;
export const LAST_RUN_FILE = '.last-cleanup';
const LOCK_FILE = 'daf.lock';
const LOCK_SEARCH_DEPTH = 4;
const DAY_MS = 86_400_000;

/** The repository's verification-output/ folder. */
export function verificationRoot(): string {
  return fileURLToPath(new URL(`../../${VERIFICATION_DIR_NAME}/`, import.meta.url));
}

export interface CleanupEntry { path: string; name: string; lastChanged: Date; ageDays: number; bytes: number }
export interface CleanupPlan {
  root: string;
  cutoff: Date;
  remove: CleanupEntry[];
  /** Old folders left alone, and why. Recent folders are only counted. */
  skipped: { name: string; reason: string }[];
  recent: number;
}

/** Newest change time and total size of everything in a folder, without following links. */
function scan(dir: string): { newest: number; bytes: number } {
  const st = lstatSync(dir);
  let newest = st.mtimeMs;
  let bytes = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const sub = scan(p);
      newest = Math.max(newest, sub.newest);
      bytes += sub.bytes;
    } else {
      const s = lstatSync(p);
      newest = Math.max(newest, s.mtimeMs);
      bytes += s.size;
    }
  }
  return { newest, bytes };
}

/** A process id from a daf.lock inside the folder whose process is still running, or null. */
export function liveLockIn(dir: string, depth = LOCK_SEARCH_DEPTH): number | null {
  const lock = join(dir, LOCK_FILE);
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8').trim());
    // The app's own process counts too: it may be running on a data folder in here.
    if (Number.isInteger(pid) && pid > 0 && (pid === process.pid || alive(pid))) return pid;
  }
  if (depth <= 0) return null;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const pid = liveLockIn(join(dir, e.name), depth - 1);
    if (pid) return pid;
  }
  return null;
}

function checkRoot(root: string): string {
  const real = realpathSync(root);
  if (basename(real) !== VERIFICATION_DIR_NAME) throw new Error(`Refusing to clean ${real}: only a folder named ${VERIFICATION_DIR_NAME} is cleaned.`);
  return real;
}

/** What a cleanup would remove. Changes nothing. */
export function planVerificationCleanup(root: string, now = new Date(), maxAgeDays = MAX_AGE_DAYS): CleanupPlan {
  const cutoff = new Date(now.getTime() - maxAgeDays * DAY_MS);
  const plan: CleanupPlan = { root, cutoff, remove: [], skipped: [], recent: 0 };
  if (!existsSync(root)) return plan;
  const real = checkRoot(root);
  plan.root = real;
  for (const e of readdirSync(real, { withFileTypes: true })) {
    const p = join(real, e.name);
    if (e.isSymbolicLink()) {
      plan.skipped.push({ name: e.name, reason: 'a link, left alone' });
      continue;
    }
    if (!e.isDirectory()) continue; // loose files (like the last-run note) stay
    const { newest, bytes } = scan(p);
    if (newest > cutoff.getTime()) {
      plan.recent++;
      continue;
    }
    const pid = liveLockIn(p);
    if (pid) {
      plan.skipped.push({ name: e.name, reason: `in use right now by a running copy of the app (process ${pid})` });
      continue;
    }
    plan.remove.push({ path: p, name: e.name, lastChanged: new Date(newest), ageDays: Math.floor((now.getTime() - newest) / DAY_MS), bytes });
  }
  return plan;
}

/** Removes what the plan lists, re-checking each folder first. Records when it ran. */
export function applyVerificationCleanup(plan: CleanupPlan, now = new Date()): { removed: string[]; failed: { name: string; error: string }[] } {
  const removed: string[] = [];
  const failed: { name: string; error: string }[] = [];
  if (!existsSync(plan.root)) return { removed, failed };
  const real = checkRoot(plan.root);
  for (const entry of plan.remove) {
    try {
      // Only a real folder sitting directly inside verification-output/.
      const st = lstatSync(entry.path);
      if (!st.isDirectory() || st.isSymbolicLink() || dirname(resolve(entry.path)) !== real) throw new Error('not a folder directly inside verification-output, left alone');
      // Something may have started using it since the plan was made.
      const pid = liveLockIn(entry.path);
      if (pid) throw new Error(`in use right now (process ${pid}), left alone`);
      if (scan(entry.path).newest > plan.cutoff.getTime()) throw new Error('changed since the plan was made, left alone');
      rmSync(entry.path, { recursive: true });
      removed.push(entry.name);
    } catch (err) {
      failed.push({ name: entry.name, error: (err as Error).message });
    }
  }
  writeFileSync(join(real, LAST_RUN_FILE), now.toISOString());
  return { removed, failed };
}

/** True when the weekly cleanup has not run in the last 7 days (or never). */
export function verificationCleanupDue(root: string, now = new Date(), everyDays = MAX_AGE_DAYS): boolean {
  if (!existsSync(root)) return false;
  const file = join(root, LAST_RUN_FILE);
  if (!existsSync(file)) return true;
  const last = Date.parse(readFileSync(file, 'utf8').trim());
  return !Number.isFinite(last) || now.getTime() - last >= everyDays * DAY_MS;
}

export function describePlan(plan: CleanupPlan): string[] {
  const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
  const lines: string[] = [];
  if (!plan.remove.length) lines.push(`Nothing to remove: no folder in ${VERIFICATION_DIR_NAME}/ has gone ${MAX_AGE_DAYS} days without a change.`);
  else {
    lines.push(`These folders in ${VERIFICATION_DIR_NAME}/ have not changed for ${MAX_AGE_DAYS} days or more:`);
    for (const e of plan.remove) lines.push(`  ${e.name}  (last changed ${e.lastChanged.toISOString().slice(0, 10)}, ${e.ageDays} days ago, ${mb(e.bytes)})`);
  }
  for (const s of plan.skipped) lines.push(`Left alone: ${s.name}: ${s.reason}`);
  if (plan.recent) lines.push(`Kept: ${plan.recent} folder(s) changed in the last ${MAX_AGE_DAYS} days.`);
  return lines;
}
