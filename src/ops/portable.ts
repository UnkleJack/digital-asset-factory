import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync, strToU8, type Zippable } from 'fflate';
import { PROJECT_ROOT, type Paths } from '../config/paths.ts';

export interface PortableOptions {
  /** Include node_modules so the copy runs with no internet (recommended). */
  includeDeps?: boolean;
  /** Include your database and generated files, not just the app. */
  includeData?: boolean;
  /** Where to write the zip. Default: <root>/digital-asset-factory-portable-<date>.zip */
  outPath?: string;
}

export interface PortableResult {
  zipPath: string;
  files: number;
  bytes: number;
  warnings: string[];
}

const SKIP_IN_NODE_MODULES = new Set(['.bin', '.cache', '.vite', '.turbo', '.eslintcache', '.yarn']);
const SKIP_DATA_ENTRIES = new Set(['logs', 'tmp', 'backups']);

function walk(dir: string, into: Zippable, prefix: string, skipTop?: (name: string) => boolean): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (skipTop?.(entry.name)) continue;
    const p = join(dir, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      count += walk(p, into, name);
    } else if (entry.isFile()) {
      into[name] = readFileSync(p);
      count += 1;
    }
    // Symlinks (node_modules/.bin) are skipped: they are machine-specific.
  }
  return count;
}

function portableReadme(withData: boolean): string {
  return `Digital Asset Factory — portable copy
=====================================

This is a complete copy of the app${withData ? ', including the products, listings and settings from the computer it was made on' : ''}.

Start it here
-------------
1. Install Node.js 26 or newer: https://nodejs.org (the LTS "Current" line, version 26+).
2. Have Google Chrome installed (Windows: Microsoft Edge works too).
3. ${withData ? 'Start the app' : 'Start the app (first run creates an empty shop)'}:
   - Windows: double-click start.bat
   - Mac/Linux: run  npm start  in a terminal opened in this folder
   The web interface opens at http://127.0.0.1:4317

Everything stays on this computer. The app never posts anything anywhere without a
human approving it in "Batch approval".

Where your data lives
---------------------
The "data" folder next to this file holds the database, generated products, logs and
backups. To move the whole shop to another computer: quit the app, copy the folder,
and run it there.

API keys (if you use AI providers, search or Gumroad) are stored per machine — in the
macOS Keychain or encrypted for the Windows account — and are never in this package.
Enter them again in Settings → AI providers / Settings → Integrations.

No internet needed to run: dependencies are included, fonts are bundled, and products
are produced offline. Internet is only needed for AI text/images, the research digest
search, email, Gumroad posting, and npm install if you rebuild the web interface.

Made by Digital Asset Factory → npm run portable (Settings → Backups has the same command).
`;
}

export function makePortablePackage(paths: Paths, opts: PortableOptions = {}): PortableResult {
  const root = paths.root;
  const warnings: string[] = [];
  const files: Zippable = {};
  let count = 0;

  // Application code and docs — everything git tracks, minus dev-only files.
  const topFiles = ['package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'TASKS.md', '.env.example', '.nvmrc', 'start.bat', 'start.ps1', 'start.sh'];
  for (const f of topFiles) {
    if (existsSync(join(root, f))) {
      files[f] = readFileSync(join(root, f));
      count += 1;
    }
  }
  for (const dir of ['src', 'scripts', 'tests', 'docs', 'web/src']) {
    count += walk(join(root, dir), files, dir);
  }
  for (const f of ['web/vite.config.ts', 'web/tsconfig.json', 'web/index.html']) {
    if (existsSync(join(root, f))) {
      files[f] = readFileSync(join(root, f));
      count += 1;
    }
  }
  // The built web interface, so `npm run serve` works without a build step.
  if (existsSync(join(root, 'web/dist'))) {
    count += walk(join(root, 'web/dist'), files, 'web/dist');
  } else {
    warnings.push('web/dist was not built — run "npm run build:web" (or "npm start") before packaging, or the copy must build it on first run.');
  }

  if (opts.includeDeps !== false) {
    // Pure-JS dependencies (no native modules by design), so the same zip runs on
    // macOS, Windows and Linux. Only machine-specific cache/bin dirs are skipped.
    const nm = join(root, 'node_modules');
    count += walk(nm, files, 'node_modules', (name) => SKIP_IN_NODE_MODULES.has(name));
  } else {
    warnings.push('node_modules excluded — the copy (or its recipient) must run "npm install" with internet access.');
  }

  if (opts.includeData) {
    // Database plus generated files; logs/tmp/backups are disposable.
    const data = paths.dataDir;
    if (existsSync(paths.dbFile)) {
      files['data/daf.sqlite'] = readFileSync(paths.dbFile);
      count += 1;
    }
    count += walk(join(data, 'assets'), files, 'data/assets');
  }

  files['PORTABLE-README.txt'] = strToU8(portableReadme(!!opts.includeData));
  count += 1;

  const zipped = zipSync(files, { level: 1 });
  const zipPath = opts.outPath ?? join(root, `digital-asset-factory-portable-${new Date().toISOString().slice(0, 10)}.zip`);
  writeFileSync(zipPath, zipped);
  return { zipPath, files: count, bytes: zipped.length, warnings };
}
