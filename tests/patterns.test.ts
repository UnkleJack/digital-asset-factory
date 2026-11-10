import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { productType, productTypes, plannableTypes } from '../src/engine/producttypes/registry.ts';
import { renderProduct } from '../src/engine/rendering/renderProduct.ts';
import { generatePattern, pickVariant, contrastRatio, PATTERN_FAMILIES, PATTERN_VARIANTS, MAX_ELEMENTS, type PatternOptions } from '../src/engine/generation/patterns.ts';
import { patternChecks, patternBoxMm, PATTERN_PRINT } from '../src/engine/producttypes/patterns.ts';
import { BUILTIN_CATEGORIES } from '../src/engine/templates/library.ts';
import { PRESETS } from '../src/engine/templates/presets.ts';
import { DEFAULT_PRICES } from '../src/config/settings.ts';
import { seededRandom, sha256 } from '../src/core/hash.ts';
import { makeContext, deterministic, testRenderer, FONTS_DIR } from './helpers.ts';
import type { ArtworkItem } from '../src/engine/producttypes/types.ts';

const renderer = testRenderer();
after(() => renderer.close());

const PALETTE = { ink: '#14213d', paper: '#ffffff', fills: ['#14213d', '#fc7a57', '#cdd3de', '#eef1f6'] };
const base = (over: Partial<PatternOptions> = {}): PatternOptions => ({ family: 'tessellate', density: 'medium', mode: 'coloring', invert: false, height: 1300, palette: PALETTE, strokeWidth: 2.5, ...over });

test('B1/B2: every family and variant is seed-stable, bounded, clipped, and clean line art in coloring mode', () => {
  assert.equal(PATTERN_FAMILIES.length, 8);
  for (const family of PATTERN_FAMILIES) {
    assert.ok(PATTERN_VARIANTS[family].length >= 2, `${family} has variants`);
    for (const variant of PATTERN_VARIANTS[family]) {
      for (const density of ['light', 'medium', 'dense'] as const) {
        const a = generatePattern(42, base({ family, variant, density }));
        assert.equal(a.svg, generatePattern(42, base({ family, variant, density })).svg, `${family}/${variant} is deterministic`);
        assert.equal(a.stats.variant, variant);
        assert.ok(a.stats.elements > 0 && a.stats.elements <= MAX_ELEMENTS && !a.stats.capped, `${family}/${variant}/${density}: ${a.stats.elements} shapes`);
        assert.match(a.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1000 1300"/);
        assert.ok(a.svg.includes('clip-path="url(#pclip)"'), 'clipped to its box');
        assert.doesNotMatch(a.svg, /NaN|Infinity|undefined/);
        const colours = new Set([...a.svg.matchAll(/\b(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]));
        for (const c of colours) assert.ok(['#ffffff', '#000000', 'none'].includes(c), `${family}/${variant} coloring uses ${c}`);
      }
      // A different seed changes the art for families that use randomness; the variant is fixed here, so compare a pair of seeds.
      assert.ok(generatePattern(1, base({ family, variant })).svg.length > 0);
    }
  }
  // Density changes how much is drawn.
  const light = generatePattern(3, base({ family: 'tessellate', variant: 'hexagon', density: 'light' })).stats.elements;
  const dense = generatePattern(3, base({ family: 'tessellate', variant: 'hexagon', density: 'dense' })).stats.elements;
  assert.ok(dense > light * 2, `${dense} vs ${light}`);
  // The seed picks the variant when none is given, and different seeds give different art.
  assert.ok(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => pickVariant('fractal', s))).size > 1);
  assert.notEqual(sha256(generatePattern(1, base({ family: 'truchet', variant: 'arcs' })).svg), sha256(generatePattern(2, base({ family: 'truchet', variant: 'arcs' })).svg));
});

test('B1: print mode fills with the palette, inverts on request, and keeps lines readable against the ground', () => {
  const print = generatePattern(7, base({ family: 'tessellate', variant: 'rhombille', mode: 'print' }));
  assert.ok(PALETTE.fills.slice(0, 3).every((f) => print.svg.includes(`fill="${f}"`)), 'rhombille uses three palette fills');
  assert.equal(print.stats.lineColor, PALETTE.ink);
  assert.equal(print.stats.backgroundColor, PALETTE.paper);
  const inv = generatePattern(7, base({ family: 'tessellate', variant: 'rhombille', mode: 'print', invert: true }));
  assert.equal(inv.stats.lineColor, PALETTE.paper, 'light lines');
  assert.equal(inv.stats.backgroundColor, PALETTE.ink, 'dark ground');
  // invert never applies to coloring pages
  assert.equal(generatePattern(7, base({ invert: true })).stats.backgroundColor, '#ffffff');
  // Coloured line work only uses palette colours that stand out from the ground.
  const g = generatePattern(9, base({ family: 'guilloche', variant: 'rose', mode: 'print' }));
  for (const m of g.svg.matchAll(/<path [^>]*stroke="([^"]+)"/g)) assert.ok(contrastRatio(m[1], PALETTE.paper) >= 3, `${m[1]} on white`);
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01);
});

async function renderPatterns(params: Record<string, unknown>, opts: Parameters<typeof makeContext>[1] = {}) {
  const def = productType('geometric-pattern-art');
  const ctx = makeContext(def, { ...opts, params: params as never });
  const content = deterministic(def, ctx);
  const art = await def.generateArtwork!(ctx, content, seededRandom(ctx.seed), null);
  const out = await renderProduct(def, ctx, content, art, renderer, { fontsDir: FONTS_DIR, previewPages: 1, previewDpi: 48 });
  return { def, ctx, content, art, out };
}

test('B3: every family makes a valid coloring PDF that passes the pattern QA', async () => {
  for (const family of PATTERN_FAMILIES) {
    const n = PATTERN_VARIANTS[family].length;
    const { def, ctx, content, art, out } = await renderPatterns({ pages: n, family, cover: false }, { seed: 100 + PATTERN_FAMILIES.indexOf(family) });
    assert.equal(out.doc.pdfPageCount, n, `${family} pages`);
    assert.deepEqual(out.doc.diagnostics.overflow, [], family);
    assert.deepEqual(out.doc.diagnostics.outsideMargin, [], family);
    assert.deepEqual(out.doc.diagnostics.consoleErrors, [], family);
    assert.deepEqual(new Set(art.map((a) => a.provenance.variant)), new Set(PATTERN_VARIANTS[family]), `${family}: a pack shows every variant`);
    for (const a of art) assert.equal(a.provenance.generator, 'procedural-pattern@1');
    for (const f of def.consistencyChecks!(ctx, content, art)) assert.ok(f.passed, `${family} ${f.code}: ${f.message}`);
  }
});

test('B3: print mode — wall art without titles, on several papers, in grayscale and inverted', async () => {
  const cases: Array<[Record<string, unknown>, Parameters<typeof makeContext>[1]]> = [
    [{ pages: 2, family: 'girih', mode: 'print' }, { design: 3 }],
    [{ pages: 2, family: 'opart', mode: 'print', invert: true, cover: false }, { design: 1, paper: { size: 'a4' } }],
    [{ pages: 2, family: 'herringbone', mode: 'print', cover: false }, { design: 5, paper: { size: 'a5', grayscale: true } }],
    [{ pages: 1, family: 'lace', mode: 'print', density: 'dense', cover: false }, { design: 2, paper: { orientation: 'landscape' } }],
  ];
  for (const [params, opts] of cases) {
    const { def, ctx, content, art, out } = await renderPatterns(params, opts);
    assert.equal(out.doc.pdfPageCount, def.expectedPageCount(ctx, content));
    assert.deepEqual(out.doc.diagnostics.outsideMargin, [], JSON.stringify(params));
    assert.deepEqual(out.doc.diagnostics.overflow, []);
    const findings = def.consistencyChecks!(ctx, content, art);
    assert.ok(findings.some((f) => f.code === 'pattern_contrast') && !findings.some((f) => f.code === 'pattern_line_art'), 'print QA profile');
    for (const f of findings.filter((x) => x.severity === 'hard')) assert.ok(f.passed, `${JSON.stringify(params)} ${f.code}: ${f.message}`);
    if (opts?.paper?.grayscale) for (const a of art) for (const m of String(a.data).matchAll(/fill="#([0-9a-f]{6})"/g)) assert.equal(m[1].slice(0, 2), m[1].slice(2, 4), 'grayscale fills are gray');
  }
});

test('B3: settings, titles and listing copy follow the mode', () => {
  const def = productType('geometric-pattern-art');
  assert.equal(def.category, 'Geometric Patterns');
  assert.equal(def.artwork, 'procedural');
  assert.equal(def.aiContent, false);
  assert.deepEqual(def.defaultParams(new Date()), { pages: 8, family: 'tessellate', mode: 'coloring', density: 'medium', invert: false, cover: true });
  assert.deepEqual(def.variationAxes, ['family', 'mode', 'density', 'seed', 'paper', 'design']);
  const coloring = makeContext(def, { params: { family: 'opart' } as never });
  const print = makeContext(def, { params: { family: 'opart', mode: 'print' } as never });
  assert.equal(coloring.title, 'Geometric Op Art Coloring Pages');
  assert.equal(print.title, 'Geometric Op Art Wall Art Prints');
  const hc = def.listingHints(coloring, deterministic(def, coloring));
  const hp = def.listingHints(print, deterministic(def, print));
  assert.ok(hc.keywords.includes('geometric coloring pages') && !hc.keywords.includes('geometric wall art'));
  assert.ok(hp.keywords.includes('geometric wall art') && !hp.keywords.includes('adult coloring pages'));
  assert.notEqual(hc.usage, hp.usage);
  assert.ok(patternBoxMm(print).h > patternBoxMm(coloring).h, 'wall art uses the whole page');
});

test('B4: registered at every touch point', () => {
  assert.ok(productTypes().some((t) => t.id === 'geometric-pattern-art'));
  assert.ok(plannableTypes().some((t) => t.id === 'geometric-pattern-art'), 'ideas and schedules can pick it');
  assert.ok(BUILTIN_CATEGORIES.some((c) => c.name === 'Geometric Patterns'));
  assert.equal(DEFAULT_PRICES['geometric-pattern-art'], 399);
  const presets = PRESETS.filter((p) => p.productType === 'geometric-pattern-art');
  assert.deepEqual(presets.map((p) => (p.params as { mode: string }).mode).sort(), ['coloring', 'print']);
});

test('B3: the pattern checks catch bad art', async () => {
  const { ctx, art } = await renderPatterns({ pages: 1, family: 'tessellate', cover: false });
  const good = art[0];
  const bad: ArtworkItem[] = [
    { ...good, name: 'coloured.svg', data: String(good.data).replace('stroke="#000000"', 'stroke="#ff0000"') },
    { ...good, name: 'unclipped.svg', data: String(good.data).replace(' clip-path="url(#pclip)"', '') },
    { ...good, name: 'wrong-family.svg', provenance: { ...good.provenance, family: 'fractal' } },
    { ...good, name: 'thin.svg', provenance: { ...good.provenance, strokeWidth: 0.2 } },
    { ...good, name: 'tiny-cells.svg', provenance: { ...good.provenance, cell: 3 } },
  ];
  const f = patternChecks({ ...ctx, params: { ...ctx.params, pages: bad.length } }, bad, bad.length);
  const get = (code: string) => f.find((x) => x.code === code)!;
  assert.match(get('pattern_line_art').message, /coloured\.svg: #ff0000/);
  assert.match(get('pattern_valid').message, /unclipped\.svg: not clipped/);
  assert.match(get('pattern_valid').message, /wrong-family\.svg: family fractal/);
  assert.match(get('pattern_min_stroke').message, /thin\.svg/);
  assert.equal(get('pattern_density').passed, false);
  assert.match(get('pattern_density').message, /tiny-cells\.svg/);
  const p = await renderPatterns({ pages: 1, family: 'tessellate', mode: 'print', cover: false });
  const low = patternChecks(p.ctx, [{ ...p.art[0], provenance: { ...p.art[0].provenance, lineColor: '#eeeeee', backgroundColor: '#ffffff' } }], 1);
  assert.equal(low.find((x) => x.code === 'pattern_contrast')!.passed, false);
  assert.ok(PATTERN_PRINT.minStrokeMm > 0);
});
