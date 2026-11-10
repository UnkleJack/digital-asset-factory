import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { testRenderer } from './helpers.ts';

const PAGE = '<!doctype html><body style="margin:0;background:#fff"><p>profile test</p></body>';

test('each browser gets its own profile folder, and closing removes it', async () => {
  const a = testRenderer();
  const b = testRenderer();
  try {
    assert.equal(a.profileDir(), null, 'no folder before the browser starts');
    await Promise.all([a.screenshotHtml(PAGE, 200, 100), b.screenshotHtml(PAGE, 200, 100)]);
    const pa = a.profileDir();
    const pb = b.profileDir();
    assert.ok(pa && pb, 'both browsers have a profile folder');
    assert.notEqual(pa, pb, 'the two browsers never share a profile');
    for (const p of [pa, pb]) {
      assert.ok(existsSync(p), `${p} exists while the browser runs`);
      assert.match(basename(p), new RegExp(`^daf-chrome-${process.pid}-`), 'named after this process');
    }
    await a.close();
    assert.equal(existsSync(pa), false, 'closing removes the folder');
    assert.ok(existsSync(pb), 'closing one browser leaves the other alone');
    await a.screenshotHtml(PAGE, 200, 100);
    const pa2 = a.profileDir();
    assert.ok(pa2 && pa2 !== pa, 'a relaunch gets a fresh folder');
  } finally {
    const left = [a.profileDir(), b.profileDir()];
    await a.close();
    await b.close();
    for (const p of left) if (p) assert.equal(existsSync(p), false, `${p} removed`);
  }
});
