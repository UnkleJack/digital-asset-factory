import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function lockHolder(dataDir: string): number | null {
  const file = join(dataDir, 'daf.lock');
  if (!existsSync(file)) return null;
  const pid = Number(readFileSync(file, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 && pid !== process.pid && alive(pid) ? pid : null;
}

export function acquireLock(dataDir: string): () => void {
  const holder = lockHolder(dataDir);
  if (holder) throw new Error(`Digital Asset Factory is already running (process ${holder}) on this data folder. Close it first, or open http://127.0.0.1:4317.`);
  const file = join(dataDir, 'daf.lock');
  writeFileSync(file, String(process.pid));
  return () => {
    try {
      if (existsSync(file) && readFileSync(file, 'utf8').trim() === String(process.pid)) rmSync(file);
    } catch {
      // Lock removal is best effort on shutdown.
    }
  };
}
