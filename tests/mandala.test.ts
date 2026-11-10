import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { productType } from '../src/engine/producttypes/registry.ts';
import { renderProduct } from '../src/engine/rendering/renderProduct.ts';
import { mandalaSvg, mandalaDesign } from '../src/engine/generation/procedural.ts';
import { MOTIFS, MOTIF_NAMES, MOTIF_SETS } from '../src/engine/generation/mandala/motifs.ts';
import { rotationAngles, renderWedge, placedAngles } from '../src/engine/generation/mandala/symmetry.ts';
import { DETAILS, SYMMETRIES, DETAIL_PROFILES } from '../src/engine/generation/mandala/compose.ts';
import { mandalaChecks, mandalaPrintMm, MANDALA_PRINT } from '../src/engine/producttypes/activity.ts';
import { seededRandom, sha256 } from '../src/core/hash.ts';
import { makeContext, deterministic, testRenderer, FONTS_DIR } from './helpers.ts';
import type { ArtworkItem } from '../src/engine/producttypes/types.ts';

const renderer = testRenderer();
after(() => renderer.close());

test('A1: the motif library has at least 12 motifs, each well-formed and inside its ring band', () => {
  assert.ok(MOTIF_NAMES.length >= 12, `${MOTIF_NAMES.length} motifs`);
  for (const set of Object.values(MOTIF_SETS)) for (const m of set) assert.ok(MOTIF_NAMES.includes(m), `${m} is a known motif`);
  for (const name of MOTIF_NAMES) {
    for (const band of [{ ri: 60, ro: 95, half: Math.PI / 8 }, { ri: 300, ro: 340, half: Math.PI / 48 }]) {
      const d = MOTIFS[name].draw(band);
      assert.ok(d.svg.length > 0 && d.segments > 0, `${name} draws something`);
      assert.match(d.svg, /^(<(path|circle) [^<>]*\/>)+$/, `${name} is a list of self-closed SVG shapes`);
      assert.doesNotMatch(d.svg, /NaN|Infinity|undefined/, `${name} has only real numbers`);
      assert.ok(d.maxR <= band.ro + 0.5, `${name} reaches ${d.maxR.toFixed(1)}, band ends at ${band.ro}`);
      assert.ok(d.minR >= band.ri - 0.5, `${name} comes in to ${d.minR.toFixed(1)}, band starts at ${band.ri}`);
      // A mirrored motif draws only the right half; its reflection makes the left. Nothing may cross the axis.
      if (MOTIFS[name].mirrored) assert.ok(d.minX >= -0.01, `${name} crosses the axis (x = ${d.minX.toFixed(2)})`);
      assert.equal(d.svg, MOTIFS[name].draw(band).svg, `${name} is pure`);
    }
  }
});

test('A2: symmetry N places copies at exactly j*360/N, and mirrored wedges reflect across the axis', () => {
  for (const n of SYMMETRIES) assert.deepEqual(rotationAngles(n), Array.from({ length: n }, (_, j) => (j * 360) / n));
  const plain = renderWedge('t', '<path d="M0 0"/>', 6, { mirrored: false });
  assert.equal(plain.copies, 6);
  assert.deepEqual(placedAngles(plain.uses, 't'), [0, 60, 120, 180, 240, 300]);
  const mirrored = renderWedge('t', '<path d="M0 0"/>', 8, { mirrored: true });
  assert.equal(mirrored.copies, 16, 'each placement draws the half and its reflection');
  assert.match(mirrored.defs, /<g id="tm"><use href="#t" xlink:href="#t"\/><use href="#t" xlink:href="#t" transform="scale\(-1 1\)"\/><\/g>/);
  assert.deepEqual(placedAngles(mirrored.uses, 'tm'), [0, 45, 90, 135, 180, 225, 270, 315]);

  // In whole designs, every ring repeats a whole multiple of the design's symmetry, evenly spaced.
  for (const symmetry of [6, 12, 24] as const) {
    const { svg, stats } = mandalaDesign(5, { detail: 'detailed', symmetry });
    assert.equal(stats.symmetry, symmetry);
    for (const b of stats.bands.filter((x) => x.motif !== 'centre' && x.motif !== 'border')) {
      assert.equal(b.placements % symmetry, 0, `${b.id} repeats ${b.placements} times`);
      const angles = placedAngles(svg, b.id);
      assert.equal(angles.length, b.placements, `${b.id} placed ${angles.length} times`);
      angles.forEach((a, j) => assert.ok(Math.abs(a - (j * 360) / b.placements) < 0.001, `${b.id} copy ${j} at ${a}`));
    }
  }
});

test('A3: detail levels set ring count, symmetry range and centre; designs are deterministic and stay in the box', () => {
  assert.deepEqual(DETAILS.map((d) => DETAIL_PROFILES[d].rings), [3, 5, 7, 10]);
  for (const detail of DETAILS) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const a = mandalaDesign(seed, { detail });
      assert.equal(a.svg, mandalaDesign(seed, { detail }).svg, 'same seed, same design');
      assert.ok(DETAIL_PROFILES[detail].symmetries.includes(a.stats.symmetry as never), `${detail} picked symmetry ${a.stats.symmetry}`);
      assert.ok(a.stats.maxExtent <= 500, `${detail}/${seed} reaches ${a.stats.maxExtent}`);
      assert.ok(a.stats.bands.filter((b) => b.motif !== 'centre' && b.motif !== 'border').length >= DETAIL_PROFILES[detail].rings);
      assert.match(a.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1000 1000"/);
      assert.ok(a.svg.includes('<defs>') && a.svg.includes('<use '), 'repeated motifs are defined once and reused');
    }
    assert.notEqual(sha256(mandalaDesign(1, { detail }).svg), sha256(mandalaDesign(2, { detail }).svg), 'different seeds differ');
  }
  // The intricate level is much busier than simple, but reuse keeps the file small.
  const simple = mandalaDesign(9, { detail: 'simple' }).stats.segments;
  const intricate = mandalaDesign(9, { detail: 'intricate' });
  assert.ok(intricate.stats.segments > simple * 3, `${intricate.stats.segments} vs ${simple}`);
  assert.ok(intricate.svg.length < 60_000, `intricate SVG is ${intricate.svg.length} bytes`);
  // The original entry point still works and is the composer underneath.
  assert.equal(mandalaSvg(7, 'medium'), mandalaDesign(7, { detail: 'medium' }).svg);
  // Motif sets limit the motifs used.
  const geo = mandalaDesign(3, { detail: 'detailed', motifSet: 'geometric' });
  for (const b of geo.stats.bands) if (b.motif !== 'centre' && b.motif !== 'border' && !['c0', 'c1'].includes(b.id.replace(/m$/, ''))) assert.ok((MOTIF_SETS.geometric as readonly string[]).includes(b.motif), b.motif);
});

async function renderMandala(params: Record<string, unknown>, opts: Parameters<typeof makeContext>[1] = {}) {
  const def = productType('mandala-coloring');
  const ctx = makeContext(def, { ...opts, params: params as never });
  const content = deterministic(def, ctx);
  const art = await def.generateArtwork!(ctx, content, seededRandom(ctx.seed), null);
  const out = await renderProduct(def, ctx, content, art, renderer, { fontsDir: FONTS_DIR, previewPages: 1, previewDpi: 48 });
  return { def, ctx, content, art, out };
}

test('A4/A6: every detail level makes a valid PDF that passes the mandala QA, with @2 provenance', async () => {
  for (const detail of DETAILS) {
    const { def, ctx, content, art, out } = await renderMandala({ pages: 1, cover: false, detail, motifSet: detail === 'intricate' ? 'celestial' : 'classic' }, { seed: 400 + DETAILS.indexOf(detail) });
    assert.equal(out.doc.pdfPageCount, 1, `${detail} page count`);
    assert.deepEqual(out.doc.diagnostics.overflow, []);
    assert.deepEqual(out.doc.diagnostics.outsideMargin, []);
    assert.deepEqual(out.doc.diagnostics.consoleErrors, []);
    assert.equal(art[0].provenance.generator, 'procedural-mandala@2');
    assert.equal(art[0].provenance.detail, detail);
    for (const k of ['symmetry', 'motifSet', 'maxExtent', 'minStrokeWidth', 'segments']) assert.ok(k in art[0].provenance, `provenance has ${k}`);
    const findings = def.consistencyChecks!(ctx, content, art);
    for (const code of ['mandala_viewbox', 'mandala_min_stroke', 'mandala_density', 'mandala_line_art']) {
      const f = findings.find((x) => x.code === code);
      assert.ok(f?.passed, `${detail} ${code}: ${f?.message}`);
    }
  }
});

test('A4: settings — fixed symmetry and motif set are honoured; old "complexity" products still read', async () => {
  const def = productType('mandala-coloring');
  assert.deepEqual(def.paramsSchema.parse({ pages: 2, complexity: 'detailed' }), { pages: 2, detail: 'detailed', symmetry: 'auto', motifSet: 'classic', cover: true });
  assert.equal((def.paramsSchema.parse({ complexity: 'simple', detail: 'intricate' }) as { detail: string }).detail, 'intricate', 'the new setting wins');
  assert.equal(def.paramsSchema.safeParse({ symmetry: 7 }).success, false, 'only the listed symmetries');
  assert.deepEqual(def.variationAxes, ['detail', 'symmetry', 'motifSet', 'seed', 'paper']);
  const ctx = makeContext(def, { params: { pages: 2, symmetry: 10, motifSet: 'botanical' } as never });
  const art = await def.generateArtwork!(ctx, deterministic(def, ctx), seededRandom(1), null);
  for (const a of art) {
    assert.equal(a.provenance.symmetry, 10);
    assert.equal(a.provenance.motifSet, 'botanical');
  }
  assert.equal(ctx.title, 'Botanical Mandala Coloring Pages');
});

test('A5: intricate designs keep lines printable on small paper; the checks catch bad art', async () => {
  // On A5 the drawing prints smaller, so lines are thickened to stay at or above the minimum.
  const small = await renderMandala({ pages: 1, cover: false, detail: 'intricate' }, { paper: { size: 'a5' }, seed: 77 });
  const mm = mandalaPrintMm(small.ctx);
  assert.ok(mm < 140, `A5 prints about ${mm} mm wide`);
  assert.ok(((small.art[0].provenance.minStrokeWidth as number) * mm) / 1000 >= MANDALA_PRINT.minStrokeMm - 1e-9);
  assert.deepEqual(small.out.doc.diagnostics.outsideMargin, []);
  for (const f of small.def.consistencyChecks!(small.ctx, small.content, small.art).filter((x) => x.severity === 'hard')) assert.ok(f.passed, `${f.code}: ${f.message}`);

  const good = small.art[0];
  const bad: ArtworkItem[] = [
    { ...good, name: 'too-wide.svg', provenance: { ...good.provenance, maxExtent: 520 } },
    { ...good, name: 'thin.svg', provenance: { ...good.provenance, minStrokeWidth: 0.5 } },
    { ...good, name: 'packed.svg', provenance: { ...good.provenance, segments: MANDALA_PRINT.maxSegments + 1 } },
    { ...good, name: 'colour.svg', data: String(good.data).replace('stroke="#000000"', 'stroke="#ff0000"') },
    { ...good, name: 'broken.svg', data: String(good.data).replace('id="w0"', 'id="nope"') },
  ];
  const f = mandalaChecks({ ...small.ctx, params: { ...small.ctx.params, pages: bad.length } }, bad, bad.length);
  const failed = (code: string) => f.find((x) => x.code === code)!;
  assert.match(failed('mandala_viewbox').message, /too-wide\.svg/);
  assert.match(failed('mandala_min_stroke').message, /thin\.svg/);
  assert.equal(failed('mandala_density').passed, false);
  assert.match(failed('mandala_density').message, /packed\.svg/);
  assert.match(failed('mandala_line_art').message, /colour\.svg: #ff0000/);
  assert.match(failed('mandala_line_art').message, /missing shape broken\.svg: #w0/);

  // Designs from the first generator carry no measurements: counted, not failed.
  const old = mandalaChecks(small.ctx, [{ ...good, provenance: { generator: 'procedural-mandala@1' } }], 1);
  for (const x of old) assert.ok(x.passed, `${x.code}: ${x.message}`);
  assert.match(old.find((x) => x.code === 'mandala_viewbox')!.message, /1 older design/);
});
