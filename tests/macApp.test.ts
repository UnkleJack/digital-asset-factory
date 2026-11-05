// The Mac app bundle (npm run make-mac-app): its Info.plist, the launcher script inside it, the
// GAGE icon, and that the launcher works with Finder's bare PATH and shows an alert when it can't.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildMacApp, infoPlist, launcherScript, shellQuote, stableNodePath, MAC_APP_BUNDLE_ID, MAC_APP_EXECUTABLE, MAC_APP_OPENS_ON } from '../src/ops/macApp.ts';
import { GAGE_ROWS, GAGE_PALETTE, ICNS_ENTRIES, drawIcon, makeIcns, shrink } from '../src/ops/macIcon.ts';
import { SUITE_NAME } from '../src/core/brand.ts';
import { PROJECT_ROOT } from '../src/config/paths.ts';
import { tempDir } from './helpers.ts';

const plistValue = (plist: string, key: string) => new RegExp(`<key>${key}</key>\\s*<(string>([^<]*)</string|true/|false/)>`).exec(plist)?.[2] ?? new RegExp(`<key>${key}</key>\\s*<(true|false)/>`).exec(plist)?.[1];

/** A pretend project folder whose launch-app.ts records how it was run, then succeeds or fails. */
function fakeProject(behaviour: 'ok' | 'fail'): string {
  const dir = join(tempDir(), "My Projects/it's here");
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(
    join(dir, 'scripts', 'launch-app.ts'),
    `import { writeFileSync } from 'node:fs';
writeFileSync('ran.json', JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));
${behaviour === 'ok' ? "console.log('Opened in its own window.');" : "console.error('The app did not start. See /x/data/logs/server-stdout.log.'); process.exit(1);"}
`,
  );
  return dir;
}

function runLauncher(script: string, home: string) {
  const file = join(home, 'launcher.sh');
  writeFileSync(file, script, { mode: 0o755 });
  const alerts = join(home, 'alerts.txt');
  // Finder and the Dock start apps with only the system folders on PATH.
  const r = spawnSync('/bin/bash', [file], { encoding: 'utf8', env: { HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', ASSET_FOUNDRY_ALERT_FILE: alerts } });
  return { status: r.status, alerts: existsSync(alerts) ? readFileSync(alerts, 'utf8') : '', log: existsSync(join(home, 'Library/Logs', `${SUITE_NAME}.log`)) ? readFileSync(join(home, 'Library/Logs', `${SUITE_NAME}.log`), 'utf8') : '' };
}

test('Info.plist names the app from brand.ts and points at the launcher and icon', () => {
  const plist = infoPlist({ version: '0.1.0' });
  assert.equal(plistValue(plist, 'CFBundleName'), SUITE_NAME);
  assert.equal(plistValue(plist, 'CFBundleDisplayName'), SUITE_NAME);
  assert.equal(plistValue(plist, 'CFBundleExecutable'), MAC_APP_EXECUTABLE);
  assert.equal(plistValue(plist, 'CFBundleIconFile'), 'AppIcon');
  assert.equal(plistValue(plist, 'CFBundleIdentifier'), MAC_APP_BUNDLE_ID);
  assert.ok(MAC_APP_BUNDLE_ID.endsWith('digital-asset-factory'), 'internal identifier keeps the old spelling');
  assert.equal(plistValue(plist, 'CFBundlePackageType'), 'APPL');
  assert.equal(plistValue(plist, 'CFBundleShortVersionString'), '0.1.0');
  assert.equal(plistValue(plist, 'NSHighResolutionCapable'), 'true');
  if (process.platform === 'darwin') {
    const dir = tempDir();
    writeFileSync(join(dir, 'Info.plist'), plist);
    assert.equal(spawnSync('/usr/bin/plutil', ['-lint', join(dir, 'Info.plist')]).status, 0, 'plutil accepts the plist');
  }
});

test('the launcher has the Node and project paths written in full, quoted safely, and opens the arcade', () => {
  const script = launcherScript({ nodePath: '/Users/me/.nvm/versions/node/v26.1.0/bin/node', projectDir: "/Users/me/My Projects/it's $HOME" });
  assert.match(script, /^#!\/bin\/bash\n/);
  assert.ok(script.includes("NODE='/Users/me/.nvm/versions/node/v26.1.0/bin/node'"));
  assert.ok(script.includes(`PROJECT=${shellQuote("/Users/me/My Projects/it's $HOME")}`));
  assert.equal(MAC_APP_OPENS_ON, '/arcade', 'the owner chose the arcade on 2026-11-04');
  assert.ok(script.includes("OPEN_PATH='/arcade'"));
  assert.ok(script.includes('scripts/launch-app.ts "$OPEN_PATH"'));
  assert.ok(script.includes('/usr/bin/osascript'), 'failures show a Mac alert');
  assert.equal(spawnSync('/bin/bash', ['-n'], { input: script }).status, 0, 'bash can parse it');
  // The quoting survives a round trip through the shell.
  const echoed = spawnSync('/bin/bash', ['-c', `${script.split('\n').find((l) => l.startsWith('PROJECT='))}; printf %s "$PROJECT"`], { encoding: 'utf8' }).stdout;
  assert.equal(echoed, "/Users/me/My Projects/it's $HOME");
});

test('from the Dock (bare PATH) the launcher runs launch-app.ts with the recorded Node and opens /arcade', () => {
  const project = fakeProject('ok');
  const home = tempDir();
  const r = runLauncher(launcherScript({ nodePath: process.execPath, projectDir: project }), home);
  assert.equal(r.status, 0);
  assert.equal(r.alerts, '');
  const ran = JSON.parse(readFileSync(join(project, 'ran.json'), 'utf8')) as { args: string[]; cwd: string };
  assert.deepEqual(ran.args, ['/arcade']);
  assert.equal(ran.cwd, realpathSync(project));
  assert.match(r.log, /Opened in its own window/);
});

test('the launcher shows an alert, never a silent failure, when Node, the folder or the start-up is missing', () => {
  const home = tempDir();
  const project = fakeProject('ok');
  const noNode = runLauncher(launcherScript({ nodePath: '/nowhere/node', projectDir: project }), home);
  assert.equal(noNode.status, 1);
  assert.match(noNode.alerts, /Node\.js is no longer at:\n\/nowhere\/node/);
  assert.match(noNode.alerts, /npm run make-mac-app/);

  const noFolder = runLauncher(launcherScript({ nodePath: process.execPath, projectDir: '/nowhere/project' }), tempDir());
  assert.equal(noFolder.status, 1);
  assert.match(noFolder.alerts, /can't find its folder at:\n\/nowhere\/project/);

  const oldNode = join(tempDir(), 'node');
  writeFileSync(oldNode, '#!/bin/sh\necho 20\n', { mode: 0o755 });
  const tooOld = runLauncher(launcherScript({ nodePath: oldNode, projectDir: project }), tempDir());
  assert.equal(tooOld.status, 1);
  assert.match(tooOld.alerts, /needs Node\.js 26 or newer, but .* is version 20/);

  const failHome = tempDir();
  const failed = runLauncher(launcherScript({ nodePath: process.execPath, projectDir: fakeProject('fail') }), failHome);
  assert.equal(failed.status, 1);
  assert.match(failed.alerts, /did not start\.\n\nThe app did not start\. See \/x\/data\/logs\/server-stdout\.log\./, 'points at the server log');
  assert.ok(failed.alerts.includes(join(failHome, 'Library/Logs', `${SUITE_NAME}.log`)));
});

test('the bundle is laid out the way macOS expects, with an executable launcher and the icon', () => {
  const out = tempDir();
  const project = fakeProject('ok');
  const { appPath, warnings } = buildMacApp({ projectDir: project, nodePath: process.execPath, outDir: out, version: '0.1.0' });
  assert.equal(appPath, join(out, `${SUITE_NAME}.app`));
  const exe = join(appPath, 'Contents/MacOS', MAC_APP_EXECUTABLE);
  assert.ok(statSync(exe).mode & 0o111, 'launcher is executable');
  assert.ok(readFileSync(exe, 'utf8').includes(`NODE=${shellQuote(process.execPath)}`));
  assert.equal(plistValue(readFileSync(join(appPath, 'Contents/Info.plist'), 'utf8'), 'CFBundleExecutable'), MAC_APP_EXECUTABLE);
  assert.equal(readFileSync(join(appPath, 'Contents/PkgInfo'), 'utf8'), 'APPL????');
  assert.ok(existsSync(join(appPath, 'Contents/Resources/AppIcon.icns')));
  assert.ok(warnings.some((w) => /web interface is not built/.test(w)), 'warns when the UI is not built yet');
  assert.throws(() => buildMacApp({ projectDir: tempDir(), nodePath: process.execPath, outDir: out, version: '0.1.0' }), /is not the Asset Foundry folder/);
  assert.throws(() => buildMacApp({ projectDir: project, nodePath: '/nowhere/node', outDir: out, version: '0.1.0' }), /Node\.js was not found/);
});

test('the icon is GAGE from the arcade, stored as PNGs at every size macOS asks for', () => {
  const arcade = readFileSync(join(PROJECT_ROOT, 'web/src/arcade/Arcade.tsx'), 'utf8');
  for (const row of GAGE_ROWS) assert.ok(arcade.includes(`'${row}'`), `GAGE's pixel art still matches CharacterSprite (row ${row})`);
  for (const colour of Object.values(GAGE_PALETTE)) assert.ok(arcade.includes(colour));

  const icon = drawIcon();
  assert.equal(icon.size, 1024);
  assert.equal(icon.data[3], 0, 'corners are see-through');
  assert.equal(icon.data[(512 * 1024 + 512) * 4 + 3], 255, 'the middle is solid');
  assert.equal(shrink(icon, 16).data.length, 16 * 16 * 4);

  const icns = makeIcns(icon);
  assert.equal(icns.subarray(0, 4).toString('ascii'), 'icns');
  assert.equal(icns.readUInt32BE(4), icns.length);
  let at = 8;
  const seen: string[] = [];
  while (at < icns.length) {
    const type = icns.subarray(at, at + 4).toString('ascii');
    const len = icns.readUInt32BE(at + 4);
    const png = icns.subarray(at + 8, at + len);
    assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47], `${type} holds a PNG`);
    const size = ICNS_ENTRIES.find((e) => e.type === type)!.size;
    assert.equal(png.readUInt32BE(16), size, `${type} is ${size} px wide`);
    seen.push(type);
    at += len;
  }
  assert.deepEqual(seen, ICNS_ENTRIES.map((e) => e.type));
});

test('a Homebrew Node is recorded by its steady link, so "brew upgrade" does not break the app', () => {
  const cellar = '/opt/homebrew/Cellar/node/26.12.1_1/bin/node';
  assert.equal(stableNodePath(cellar, (p) => p === '/opt/homebrew/opt/node/bin/node'), '/opt/homebrew/opt/node/bin/node');
  assert.equal(stableNodePath('/usr/local/Cellar/node@26/26.1.0/bin/node', () => true), '/usr/local/opt/node@26/bin/node');
  assert.equal(stableNodePath(cellar, () => false), cellar, 'kept when the link is missing');
  assert.equal(stableNodePath('/Users/me/.nvm/versions/node/v26.1.0/bin/node', () => true), '/Users/me/.nvm/versions/node/v26.1.0/bin/node');
});
