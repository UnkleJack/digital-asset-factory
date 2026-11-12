import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lockHolder } from '../src/ops/lock.ts';

test('lockHolder returns null for missing lock file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-test-'));
  assert.equal(lockHolder(dir), null);
});

test('lockHolder returns null for stale pid that is not a node process', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-test-'));
  writeFileSync(join(dir, 'daf.lock'), '999999'); // PID that almost certainly doesn't exist
  assert.equal(lockHolder(dir), null);
});

test('lockHolder returns null for live but unrelated pid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-test-'));
  // Use current process pid but it's our own, so should return null (pid !== process.pid check)
  writeFileSync(join(dir, 'daf.lock'), String(process.pid));
  assert.equal(lockHolder(dir), null);
});

test('lockHolder treats non-node live pid as stale', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-test-'));
  // Use a known system process (launchd = 1) - alive but not our node process
  writeFileSync(join(dir, 'daf.lock'), '1');
  assert.equal(lockHolder(dir), null);
});