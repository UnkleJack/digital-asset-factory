// Installs Asset Foundry as a permanent Mac app:
//  1. a LaunchAgent that starts the server at login and restarts it if it stops
//  2. "Asset Foundry.app" in ~/Applications that opens the app window (double-click, Spotlight, Dock)
// Undo with: npm run uninstall:macos
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolvePaths } from '../src/config/paths.ts';

const LABEL = 'com.assetfoundry.server';
const uninstall = process.argv.includes('--uninstall');
const paths = resolvePaths();
const root = paths.root.replace(/\/$/, '');
const home = homedir();
const plistPath = join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
const appDir = join(home, 'Applications', 'Asset Foundry.app');
const uid = String(process.getuid?.() ?? '');
const domain = `gui/${uid}`;

function launchctl(...args: string[]): void {
  try {
    execFileSync('launchctl', args, { stdio: 'ignore' });
  } catch {
    // bootout fails harmlessly when the agent is not loaded yet
  }
}

if (process.platform !== 'darwin') {
  console.error('This installer is for macOS only.');
  process.exit(1);
}

launchctl('bootout', `${domain}/${LABEL}`);

if (uninstall) {
  rmSync(plistPath, { force: true });
  rmSync(appDir, { recursive: true, force: true });
  console.log('Removed the background service and the Asset Foundry app. Your data folder was not touched.');
  process.exit(0);
}

if (!existsSync(join(paths.webDist, 'index.html'))) {
  console.error('The web interface is not built yet. Run "npm start" once, stop it, then run this again.');
  process.exit(1);
}

const node = process.execPath;
mkdirSync(paths.logsDir, { recursive: true });
mkdirSync(join(home, 'Library', 'LaunchAgents'), { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>--env-file-if-exists=.env</string>
    <string>src/main.ts</string>
  </array>
  <key>WorkingDirectory</key><string>${root}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${join(paths.logsDir, 'server-stdout.log')}</string>
  <key>StandardErrorPath</key><string>${join(paths.logsDir, 'server-stdout.log')}</string>
</dict>
</plist>
`;
writeFileSync(plistPath, plist);

// The .app is a thin launcher: it makes sure the server is up, then opens the app window.
mkdirSync(join(appDir, 'Contents', 'MacOS'), { recursive: true });
writeFileSync(
  join(appDir, 'Contents', 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Asset Foundry</string>
  <key>CFBundleDisplayName</key><string>Asset Foundry</string>
  <key>CFBundleIdentifier</key><string>com.assetfoundry.launcher</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
`,
);
const launcher = join(appDir, 'Contents', 'MacOS', 'launch');
writeFileSync(launcher, `#!/bin/sh\ncd "${root}" && exec "${node}" --env-file-if-exists=.env scripts/launch-app.ts\n`);
chmodSync(launcher, 0o755);

launchctl('bootstrap', domain, plistPath);
console.log(`Installed. The server now starts at login and restarts itself if it stops.\nOpen it from ${appDir} (also findable in Spotlight).\nLogs: ${join(paths.logsDir, 'server-stdout.log')}`);
