import { spawn } from 'node:child_process';
import { existsSync, openSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePaths } from '../src/config/paths.ts';
import { resolveChromePath } from '../src/config/chrome.ts';

const port = Number(process.env.DAF_PORT ?? 4317);
const url = `http://127.0.0.1:${port}`;
const root = fileURLToPath(new URL('../', import.meta.url));
const paths = resolvePaths();

async function healthy(): Promise<boolean> {
  try {
    const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

if (!(await healthy())) {
  if (!existsSync(join(paths.webDist, 'index.html'))) {
    console.error('The web interface is not built yet. Run "npm start" once (it builds the UI), then use "npm run app".');
    process.exit(1);
  }
  const log = openSync(join(paths.logsDir, 'server-stdout.log'), 'a');
  const child = spawn(process.execPath, [join(root, 'src', 'main.ts')], { cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env });
  child.unref();
  for (let i = 0; i < 60 && !(await healthy()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await healthy())) {
    console.error(`The app did not start. See ${join(paths.logsDir, 'server-stdout.log')}.`);
    process.exit(1);
  }
}

// Open in its own window with Chrome/Edge if installed (macOS, Windows, Linux), else the default browser.
const chrome = resolveChromePath(process.env.DAF_CHROME_PATH ?? '');
if (chrome && existsSync(chrome)) {
  const profile = join(paths.dataDir, 'chrome-app-profile');
  mkdirSync(profile, { recursive: true });
  spawn(chrome, [`--app=${url}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check'], { detached: true, stdio: 'ignore' }).unref();
  console.log(`Opened Digital Asset Factory in its own window (${url}).`);
} else {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // Opening a browser is a convenience; the address below always works.
  }
  console.log(`Digital Asset Factory is running. Open ${url} in your browser.`);
}
