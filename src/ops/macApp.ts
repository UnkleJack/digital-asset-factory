// Builds "Asset Foundry.app": a small Mac app bundle the owner can keep in the Dock. It is not
// Electron (Constitution Art. 4 D3). Inside is a shell script that runs scripts/launch-app.ts with an
// absolute path to Node, because apps started from Finder or the Dock don't get the Terminal's PATH
// (nvm and similar are never loaded there). If anything is missing it shows a Mac alert instead of
// failing silently.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUITE_NAME } from '../core/brand.ts';
import { makeIcns } from './macIcon.ts';

/** The screen the app window opens on. The owner chose the arcade (HAPPY DAFFY) on 2026-11-04. */
export const MAC_APP_OPENS_ON = '/arcade';
/** Internal identifier; keeps the old spelling like the package name and Keychain service (Art. 1.5). */
export const MAC_APP_BUNDLE_ID = 'com.unklejack.digital-asset-factory';
export const MAC_APP_EXECUTABLE = 'asset-foundry';
export const MIN_NODE_MAJOR = 26;

export interface MacAppOptions {
  /** The Asset Foundry folder the app starts (the one with package.json and data/). */
  projectDir: string;
  /** Absolute path of the Node 26 program. */
  nodePath: string;
  /** Folder the .app is written into. */
  outDir: string;
  /** Version shown in Finder's Get Info (from package.json). */
  version: string;
  /** Screen to open, such as /arcade. */
  openPath?: string;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Wraps a value in single quotes for the shell, so spaces, $ and quotes in a path stay literal. */
export const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function infoPlist(o: Pick<MacAppOptions, 'version'>): string {
  const entries: Array<[string, string | boolean]> = [
    ['CFBundleDevelopmentRegion', 'en'],
    ['CFBundleDisplayName', SUITE_NAME],
    ['CFBundleName', SUITE_NAME],
    ['CFBundleExecutable', MAC_APP_EXECUTABLE],
    ['CFBundleIconFile', 'AppIcon'],
    ['CFBundleIdentifier', MAC_APP_BUNDLE_ID],
    ['CFBundleInfoDictionaryVersion', '6.0'],
    ['CFBundlePackageType', 'APPL'],
    ['CFBundleShortVersionString', o.version],
    ['CFBundleVersion', o.version],
    ['LSApplicationCategoryType', 'public.app-category.productivity'],
    ['LSMinimumSystemVersion', '12.0'],
    ['NSHighResolutionCapable', true],
  ];
  const body = entries.map(([k, v]) => `\t<key>${xml(k)}</key>\n\t${typeof v === 'boolean' ? `<${v}/>` : `<string>${xml(v)}</string>`}`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

/** The program inside Contents/MacOS. Plain /bin/bash 3.2, which every Mac has. */
export function launcherScript(o: Pick<MacAppOptions, 'projectDir' | 'nodePath' | 'openPath'>): string {
  const openPath = o.openPath ?? MAC_APP_OPENS_ON;
  return `#!/bin/bash
# ${SUITE_NAME} for the Mac Dock. Made by "npm run make-mac-app"; run that again if Node or the
# project folder moves. Apps opened from Finder or the Dock don't get the Terminal's PATH, so the
# paths below are written in full.
NODE=${shellQuote(o.nodePath)}
PROJECT=${shellQuote(o.projectDir)}
OPEN_PATH=${shellQuote(openPath)}
APP_NAME=${shellQuote(SUITE_NAME)}
LOG="$HOME/Library/Logs/$APP_NAME.log"

mkdir -p "$HOME/Library/Logs" 2>/dev/null
if [ -f "$LOG" ] && [ "$(stat -f%z "$LOG" 2>/dev/null || echo 0)" -gt 1000000 ]; then mv -f "$LOG" "$LOG.old"; fi
log() { printf '%s %s\\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG" 2>/dev/null; }

# A plain Mac alert. Tests set ASSET_FOUNDRY_ALERT_FILE to collect the message instead.
alert() {
  log "ALERT: $1"
  if [ -n "$ASSET_FOUNDRY_ALERT_FILE" ]; then printf '%s\\n' "$1" >> "$ASSET_FOUNDRY_ALERT_FILE"; return; fi
  /usr/bin/osascript - "$APP_NAME" "$1" >/dev/null 2>&1 <<'APPLESCRIPT'
on run argv
  activate
  display alert (item 1 of argv) message (item 2 of argv) as critical buttons {"OK"} default button "OK"
end run
APPLESCRIPT
}

if [ ! -x "$NODE" ]; then
  alert "$APP_NAME can't start because Node.js is no longer at:
$NODE

Install Node.js ${MIN_NODE_MAJOR} or newer, then open Terminal in the $APP_NAME folder and run:
npm run make-mac-app"
  exit 1
fi
MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
if [ -z "$MAJOR" ] || [ "$MAJOR" -lt ${MIN_NODE_MAJOR} ]; then
  alert "$APP_NAME needs Node.js ${MIN_NODE_MAJOR} or newer, but $NODE is version \${MAJOR:-unknown}.

Install Node.js ${MIN_NODE_MAJOR}, then run npm run make-mac-app in the $APP_NAME folder."
  exit 1
fi
if [ ! -f "$PROJECT/scripts/launch-app.ts" ]; then
  alert "$APP_NAME can't find its folder at:
$PROJECT

If you moved or renamed the folder, open Terminal in its new place and run:
npm run make-mac-app"
  exit 1
fi

cd "$PROJECT" || exit 1
log "Starting from $PROJECT"
# Settings in .env are read the same way "npm run app" reads them (only if the file is there).
ENV_FILE=()
if [ -f .env ]; then ENV_FILE=(--env-file=.env); fi
OUT="$("$NODE" "\${ENV_FILE[@]}" scripts/launch-app.ts "$OPEN_PATH" 2>&1)"
STATUS=$?
log "$OUT"
if [ $STATUS -ne 0 ]; then
  alert "$APP_NAME did not start.

$OUT

This message is also saved in $LOG"
  exit 1
fi
exit 0
`;
}

/**
 * A Node path that survives upgrades. Homebrew keeps each version in its own Cellar folder and
 * deletes the old one on "brew upgrade", so a Cellar path is swapped for Homebrew's steady
 * opt/<formula> link when that link exists. Other paths (nvm, the nodejs.org installer) are kept.
 */
export function stableNodePath(execPath: string, exists: (p: string) => boolean = existsSync): string {
  const m = /^(.*)\/Cellar\/(node(?:@\d+)?)\/[^/]+\/bin\/node$/.exec(execPath);
  if (!m) return execPath;
  const steady = `${m[1]}/opt/${m[2]}/bin/node`;
  return exists(steady) ? steady : execPath;
}

export interface MacAppResult { appPath: string; warnings: string[] }

/** Writes the whole bundle, replacing any older copy in outDir. */
export function buildMacApp(o: MacAppOptions): MacAppResult {
  const warnings: string[] = [];
  if (!existsSync(o.nodePath)) throw new Error(`Node.js was not found at ${o.nodePath}.`);
  const version = spawnSync(o.nodePath, ['-p', 'process.versions.node'], { encoding: 'utf8' }).stdout?.trim() ?? '';
  if (!(Number(version.split('.')[0]) >= MIN_NODE_MAJOR)) throw new Error(`${o.nodePath} is Node.js ${version || 'of an unknown version'}; ${SUITE_NAME} needs ${MIN_NODE_MAJOR} or newer.`);
  if (!existsSync(join(o.projectDir, 'scripts', 'launch-app.ts'))) throw new Error(`${o.projectDir} is not the ${SUITE_NAME} folder (scripts/launch-app.ts is missing).`);
  if (!existsSync(join(o.projectDir, 'web', 'dist', 'index.html'))) warnings.push('The web interface is not built yet, so the app will say so when opened. Run "npm start" once (it builds it), or "npm run build:web".');

  const appPath = join(o.outDir, `${SUITE_NAME}.app`);
  rmSync(appPath, { recursive: true, force: true });
  const contents = join(appPath, 'Contents');
  mkdirSync(join(contents, 'MacOS'), { recursive: true });
  mkdirSync(join(contents, 'Resources'), { recursive: true });
  writeFileSync(join(contents, 'Info.plist'), infoPlist(o));
  writeFileSync(join(contents, 'PkgInfo'), 'APPL????');
  const exe = join(contents, 'MacOS', MAC_APP_EXECUTABLE);
  writeFileSync(exe, launcherScript(o));
  chmodSync(exe, 0o755);
  writeFileSync(join(contents, 'Resources', 'AppIcon.icns'), makeIcns());
  return { appPath, warnings };
}
