// npm run make-mac-app: builds "Asset Foundry.app" in dist-mac/ for the Dock.
// Options: --out <folder> to write it somewhere else.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMacApp, stableNodePath, MAC_APP_OPENS_ON } from '../src/ops/macApp.ts';
import { SUITE_NAME } from '../src/core/brand.ts';

if (process.platform !== 'darwin') {
  console.error('This makes a Mac app, so it only runs on a Mac. On Windows, use start.bat.');
  process.exit(1);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = resolve(outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : join(root, 'dist-mac'));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

const nodePath = stableNodePath(process.execPath);

try {
  const { appPath, warnings } = buildMacApp({ projectDir: root.replace(/\/$/, ''), nodePath, outDir, version });
  for (const w of warnings) console.log(`Note: ${w}`);
  console.log(`Made ${appPath}`);
  console.log(`  Starts ${SUITE_NAME} from ${root} with Node ${process.version} (${nodePath}) and opens ${MAC_APP_OPENS_ON}.`);
  console.log('');
  console.log(`To keep it in the Dock: drag "${SUITE_NAME}.app" from that folder into Applications, open it from there once, then drag its Dock icon to where you want it (or right-click it → Options → Keep in Dock).`);
  console.log('If Node or this folder moves later, run "npm run make-mac-app" again and replace the copy in Applications.');
} catch (err) {
  console.error(`Could not make the Mac app: ${(err as Error).message}`);
  process.exit(1);
}
