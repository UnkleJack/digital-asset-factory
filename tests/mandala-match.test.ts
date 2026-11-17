import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { mandalaDesign } from '../src/engine/generation/procedural.ts';
import { DETAILS, SYMMETRIES } from '../src/engine/generation/mandala/compose.ts';
import { readMandala, detailFor, DETAIL_CROSSINGS } from '../src/engine/references/mandalaMatch.ts';
import { importReferenceImage, readMandalaFromReference } from '../src/engine/references/service.ts';
import { tempDir } from './helpers.ts';

/*
 * Reading a mandala picture (engine/references/mandalaMatch.ts): the repeat count and a rough detail level.
 * The arithmetic is tested on pictures made in code; the whole path is tested on the engine's own mandalas
 * drawn by Chrome and, last, on an imported picture.
 */

const SIZE = 256;
let app: App;
before(() => { app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false }); });
after(() => app.close());

/** A grey picture with rings of `n` petals: black lines on white, repeating exactly n times around the centre. */
function petals(n: number): Uint8Array {
  const g = new Uint8Array(SIZE * SIZE).fill(255);
  const c = (SIZE - 1) / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - c, dy = y - c;
      const r = Math.hypot(dx, dy) / c;
      if (r > 0.95) continue;
      const th = Math.atan2(dy, dx);
      const ring = Math.floor(r * 6);
      // Alternate rings: petals that point out, and petals offset by half a turn of the pattern.
      const phase = ring % 2 ? Math.PI / n : 0;
      const wave = Math.cos(n * th + phase);
      const edge = (r * 6) % 1;
      if (wave > 0.55 && edge > 0.2 && edge < 0.85) g[y * SIZE + x] = 0;
    }
  }
  return g;
}

test('a picture drawn in code with N repeats reads as N', () => {
  for (const n of [6, 8, 12, 16, 24]) {
    const r = readMandala(petals(n), SIZE);
    assert.equal(r.symmetry, n, `${n}-fold picture read as ${r.symmetry} (strength ${r.symmetryStrength})`);
    assert.ok(r.symmetryStrength >= 0.55);
    assert.ok(r.lineArt);
  }
});

test('a blank picture, solid black and random speckle give no repeat count', () => {
  assert.equal(readMandala(new Uint8Array(SIZE * SIZE).fill(255), SIZE).symmetry, null);
  const solid = readMandala(new Uint8Array(SIZE * SIZE).fill(0), SIZE);
  assert.equal(solid.symmetry, null);
  assert.equal(solid.detail, null);
  let s = 12345;
  const noise = new Uint8Array(SIZE * SIZE).map(() => ((s = (s * 1103515245 + 12345) & 0x7fffffff) % 100 < 20 ? 0 : 255));
  assert.equal(readMandala(noise, SIZE).symmetry, null, 'speckle has no repeat count');
});

test('the same picture always gives the same reading, and the motif set is never claimed', () => {
  const a = readMandala(petals(12), SIZE);
  assert.deepEqual(readMandala(petals(12), SIZE), a);
  assert.ok(a.notes.some((n) => /motif set/i.test(n)));
  assert.equal(Object.keys(a).includes('motifSet'), false);
});

test('detail levels split at the measured boundaries, in order', () => {
  assert.equal(detailFor(DETAIL_CROSSINGS[0] - 1), 'simple');
  assert.equal(detailFor(DETAIL_CROSSINGS[0]), 'medium');
  assert.equal(detailFor(DETAIL_CROSSINGS[1]), 'detailed');
  assert.equal(detailFor(DETAIL_CROSSINGS[2]), 'intricate');
  assert.ok(DETAIL_CROSSINGS[0] < DETAIL_CROSSINGS[1] && DETAIL_CROSSINGS[1] < DETAIL_CROSSINGS[2]);
});

test("the app's own mandalas, drawn by Chrome, read back with the right repeat count and a detail level within one step", async () => {
  let symOk = 0, total = 0;
  for (let di = 0; di < DETAILS.length; di++) {
    for (const sym of SYMMETRIES) {
      const { svg } = mandalaDesign(di * 101 + sym * 13 + 7, { detail: DETAILS[di], symmetry: sym });
      const { grey } = await app.renderer.greySquare(Buffer.from(svg), 'image/svg+xml', SIZE);
      const r = readMandala(grey, SIZE);
      total++;
      if (r.symmetry === sym) symOk++;
      const got = r.detail ? DETAILS.indexOf(r.detail) : -9;
      assert.ok(Math.abs(got - di) <= 1, `${DETAILS[di]} ${sym}-fold read as detail ${r.detail} (${r.crossings} crossings)`);
    }
  }
  // Measured 94 of 96 on a wider sample; allow a little slack for a different Chrome.
  assert.ok(symOk / total >= 0.85, `repeat count right for ${symOk} of ${total}`);
});

test('an imported picture is read through the library, and nothing is changed or stored', async () => {
  const { svg } = mandalaDesign(2026, { detail: 'medium', symmetry: 12 });
  const png = await app.renderer.toPng(Buffer.from(svg), 'image/svg+xml');
  const out = importReferenceImage(app, { fileName: 'mandala.png', data: png.png, sourceTool: 'test' });
  assert.equal(out.status, 'imported');
  const id = out.status === 'imported' ? out.item.id : '';
  const before = app.db.value<number>('SELECT count(*) FROM reference_items') ?? 0;
  const r = await readMandalaFromReference(app, id);
  assert.equal(r.referenceId, id);
  assert.equal(r.symmetry, 12);
  assert.equal(app.db.value<number>('SELECT count(*) FROM reference_items'), before);
  assert.equal(app.db.value<number>('SELECT count(*) FROM reference_tags') ?? 0, 0, 'reading never tags anything');
  assert.equal(app.db.value<number>('SELECT count(*) FROM products') ?? 0, 0, 'reading never makes a product');
});
