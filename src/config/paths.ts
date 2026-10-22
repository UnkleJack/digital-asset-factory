import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export interface Paths {
  root: string;
  dataDir: string;
  dbFile: string;
  assetsDir: string;
  logsDir: string;
  backupsDir: string;
  tmpDir: string;
  webDist: string;
  fontsDir: string;
}

export function resolvePaths(dataDir?: string): Paths {
  const data = resolve(dataDir ?? process.env.DAF_DATA_DIR ?? join(PROJECT_ROOT, 'data'));
  const p: Paths = {
    root: PROJECT_ROOT,
    dataDir: data,
    dbFile: join(data, 'daf.sqlite'),
    assetsDir: join(data, 'assets'),
    logsDir: join(data, 'logs'),
    backupsDir: join(data, 'backups'),
    tmpDir: join(data, 'tmp'),
    webDist: join(PROJECT_ROOT, 'web', 'dist'),
    fontsDir: join(PROJECT_ROOT, 'node_modules', '@fontsource'),
  };
  for (const dir of [p.dataDir, p.assetsDir, p.logsDir, p.backupsDir, p.tmpDir]) mkdirSync(dir, { recursive: true });
  return p;
}
