import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUITE_NAME, SUITE_SHORT_NAME, ENGINE_NAME, ENGINE_SHORT_NAME, ARCADE_GAME_NAME } from '../src/core/brand.ts';
import { SettingsSchema } from '../src/config/settings.ts';

// CONSTITUTION.md, article 1: the suite is Asset Foundry; the engine is the factory.

test('suite and engine names match the constitution', () => {
  assert.equal(SUITE_NAME, 'Asset Foundry');
  assert.equal(SUITE_SHORT_NAME, 'Foundry');
  assert.equal(ENGINE_NAME, 'Digital Asset Factory');
  assert.equal(ENGINE_SHORT_NAME, 'DAF');
  assert.equal(ARCADE_GAME_NAME, 'HAPPY DAFFY');
  assert.equal(SettingsSchema.parse({}).email.fromName, SUITE_NAME);
  assert.match(readFileSync(new URL('../web/index.html', import.meta.url), 'utf8'), /<title>Asset Foundry<\/title>/);
});

test('internal identifiers keep the old spelling so saved keys and data survive', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string };
  assert.equal(pkg.name, 'digital-asset-factory');
  assert.match(readFileSync(new URL('../src/config/secrets.ts', import.meta.url), 'utf8'), /DAF_KEYCHAIN_SERVICE \|\| 'digital-asset-factory'/);
});
