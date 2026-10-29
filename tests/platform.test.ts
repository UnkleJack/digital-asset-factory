// macOS + Windows support: finding Chrome/Edge on each OS, the Windows DPAPI secret store (with a
// stand-in cipher here — the real PowerShell/DPAPI path needs a first run on Windows), and machine names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { chromeCandidates, resolveChromePath } from '../src/config/chrome.ts';
import { DpapiSecretStore, type Protector } from '../src/config/secrets.ts';
import { machineName } from '../src/config/machine.ts';
import { tempDir } from './helpers.ts';

test('Chrome is found on Windows (Chrome first, then Edge), macOS and Linux; a configured path always wins', () => {
  const env = { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' };
  const win = chromeCandidates('win32', env);
  assert.ok(win[0].endsWith(join('Google', 'Chrome', 'Application', 'chrome.exe')));
  assert.ok(win.some((p) => p.endsWith('msedge.exe')));
  const edgeOnly = (p: string) => p.endsWith('msedge.exe') && p.includes('(x86)');
  assert.ok(resolveChromePath('', edgeOnly, 'win32', env).endsWith('msedge.exe'), 'falls back to Edge when Chrome is missing');
  assert.equal(resolveChromePath('', () => false, 'darwin', {}), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.equal(resolveChromePath('/opt/my/chrome', () => false, 'linux', {}), '/opt/my/chrome');
  assert.ok(chromeCandidates('linux', {}).includes('/usr/bin/chromium'));
});

test('Windows secret store keeps keys encrypted in the data folder, never in plain text', async () => {
  const dir = tempDir();
  const fake: Protector = { protect: async (p) => Buffer.from(`enc:${[...p].reverse().join('')}`).toString('base64'), unprotect: async (c) => [...Buffer.from(c, 'base64').toString().slice(4)].reverse().join('') };
  const store = new DpapiSecretStore(dir, fake);
  await store.set('groq_api_key', 'gsk_test_secret_value_123');
  const file = join(dir, 'secrets.dpapi.json');
  assert.ok(existsSync(file));
  assert.doesNotMatch(readFileSync(file, 'utf8'), /gsk_test_secret_value_123/);
  assert.equal(await new DpapiSecretStore(dir, fake).get('groq_api_key'), 'gsk_test_secret_value_123', 'survives a restart');
  assert.equal((await store.status()).find((s) => s.name === 'groq_api_key')?.source, 'dpapi');
  await store.delete('groq_api_key');
  assert.equal(await new DpapiSecretStore(dir, fake).get('groq_api_key'), null);
  await assert.rejects(store.set('groq_api_key', 'short'), /8-4096/);
});

test('machine name comes from the setting, else the computer name', () => {
  const settings = (name: string) => ({ settings: { get: () => ({ machineName: name }) } }) as never;
  assert.equal(machineName(settings('studio-mac')), 'studio-mac');
  assert.ok(machineName(settings('')).length > 0);
});
