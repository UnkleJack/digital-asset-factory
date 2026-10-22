import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { productTypes, productType } from '../src/engine/producttypes/registry.ts';
import { renderProduct } from '../src/engine/rendering/renderProduct.ts';
import { mandalaSvg, generateMaze, mazeStats, generateWordSearch } from '../src/engine/generation/procedural.ts';
import { _testVerifyMonth } from '../src/engine/producttypes/dated.ts';
import { readWorkbook, parseCsv, toCsv } from '../src/engine/producttypes/sheets.ts';
import { html } from '../src/engine/rendering/html.ts';
import { seededRandom, sha256 } from '../src/core/hash.ts';
import { makeContext, deterministic, testRenderer, FONTS_DIR } from './helpers.ts';
import type { ArtworkItem } from '../src/engine/producttypes/types.ts';

const renderer = testRenderer();
after(() => renderer.close());

const POINTS = { letter: [612, 792], a4: [595.28, 841.89], a5: [419.53, 595.28] } as const;

async function renderType(id: string, opts: Parameters<typeof makeContext>[1] = {}) {
  const def = productType(id);
  const ctx = makeContext(def, opts);
  const content = deterministic(def, ctx);
  const art: ArtworkItem[] = def.generateArtwork ? await def.generateArtwork(ctx, content, seededRandom(ctx.seed), null) : [];
  const out = await renderProduct(def, ctx, content, art, renderer, { fontsDir: FONTS_DIR, previewPages: 1, previewDpi: 48 });
  return { def, ctx, content, art, out };
}

const SMALL: Record<string, object> = {
  'monthly-calendar': { months: 3 },
  'weekly-planner': { weeks: 3 },
  'habit-tracker': { months: 2 },
  'budget-planner': { months: 2 },
  'guided-journal': { pages: 6 },
  'mandala-coloring': { pages: 2 },
  'maze-activity': { pages: 3 },
  'word-search': { puzzles: 3 },
  'home-inventory': { rooms: ['Kitchen', 'Garage', 'Office'] },
};

for (const def of productTypes().filter((t) => t.artwork !== 'ai-image' && t.id !== 'bundle')) {
  test(`${def.id} renders a valid PDF with the expected pages and no layout faults`, async () => {
    const { ctx, content, art, out } = await renderType(def.id, { params: SMALL[def.id] as never, design: 2 });
    assert.equal(out.doc.pdfPageCount, out.expectedPages, 'page count');
    for (const s of out.doc.pdfPageSizesPt) assert.deepEqual([Math.round(s.w), Math.round(s.h)], [612, 792]);
    assert.deepEqual(out.doc.diagnostics.fontsMissing, [], 'fonts loaded');
    assert.deepEqual(out.doc.diagnostics.fontsFailed, []);
    assert.deepEqual(out.doc.diagnostics.blockedRequests, [], 'no external requests');
    assert.deepEqual(out.doc.diagnostics.consoleErrors, []);
    assert.deepEqual(out.doc.diagnostics.overflow, [], `overflow: ${JSON.stringify(out.doc.diagnostics.overflow.slice(0, 3))}`);
    assert.deepEqual(out.doc.diagnostics.outsideMargin, [], `margins: ${JSON.stringify(out.doc.diagnostics.outsideMargin.slice(0, 3))}`);
    const findings = def.consistencyChecks?.(ctx, content, art) ?? [];
    for (const f of findings.filter((x) => x.severity === 'hard')) assert.ok(f.passed, `${f.code}: ${f.message}`);
  });
}

test('A4, A5 and landscape paper produce correctly sized pages without overflow', async () => {
  for (const [size, orientation] of [['a4', 'portrait'], ['a5', 'portrait'], ['letter', 'landscape']] as const) {
    for (const id of ['monthly-calendar', 'daily-planner', 'budget-planner']) {
      const { out } = await renderType(id, { params: SMALL[id] as never, paper: { size, orientation } });
      const [w, h] = POINTS[size];
      const exp = orientation === 'portrait' ? [w, h] : [h, w];
      for (const s of out.doc.pdfPageSizesPt) assert.ok(Math.abs(s.w - exp[0]) < 1 && Math.abs(s.h - exp[1]) < 1, `${id} ${size} ${orientation} page ${s.w}x${s.h}`);
      assert.deepEqual(out.doc.diagnostics.overflow, [], `${id} ${size} ${orientation} overflow ${JSON.stringify(out.doc.diagnostics.overflow.slice(0, 2))}`);
      assert.deepEqual(out.doc.diagnostics.outsideMargin, [], `${id} ${size} ${orientation} margin ${JSON.stringify(out.doc.diagnostics.outsideMargin.slice(0, 2))}`);
    }
  }
});

test('large-print audience and every design system render without layout faults', async () => {
  for (let design = 0; design < 7; design++) {
    const { out } = await renderType('habit-tracker', { params: { months: 1 } as never, design, audience: 'Seniors (large print)' });
    assert.deepEqual(out.doc.diagnostics.overflow, [], `design ${design}`);
    assert.deepEqual(out.doc.diagnostics.outsideMargin, [], `design ${design}`);
  }
});

test('layout probe detects text that overflows a fixed box', async () => {
  const def = productType('todo-checklist');
  const ctx = makeContext(def);
  const long = 'x'.repeat(400);
  const out = await renderProduct({ ...def, render: () => ({ pages: [html`<section class="page"><div class="box" style="height:10mm;width:30mm">${long} ${long}</div></section>`] }), expectedPageCount: () => 1 }, ctx, deterministic(def, ctx), [], renderer, { fontsDir: FONTS_DIR, previewPages: 0, previewDpi: 48 });
  assert.ok(out.doc.diagnostics.overflow.length > 0);
});

test('AI-style text containing markup is rendered as text, never executed', async () => {
  const def = productType('todo-checklist');
  const ctx = makeContext(def);
  const content = { intro: '<img src=x onerror=alert(1)><script>document.body.innerHTML="pwned"</script>', sections: [{ title: '<b>bold?</b>', items: ['<iframe src="https://example.com">'] }, { title: 'Two', items: [] }] };
  const out = await renderProduct(def, ctx, def.contentSchema.parse(content), [], renderer, { fontsDir: FONTS_DIR, previewPages: 0, previewDpi: 48 });
  assert.deepEqual(out.doc.diagnostics.blockedRequests, []);
  assert.equal(out.doc.pdfPageCount, 1);
});

test('calendar month grids are correct for every month across leap and non-leap years', () => {
  for (const year of [2027, 2028, 2100]) for (let m = 0; m < 12; m++) for (const ws of [0, 1] as const) assert.equal(_testVerifyMonth(year, m, ws), null);
});

test('procedural generators are deterministic per seed and valid', () => {
  assert.equal(sha256(mandalaSvg(7, 'medium')), sha256(mandalaSvg(7, 'medium')));
  assert.notEqual(sha256(mandalaSvg(7, 'medium')), sha256(mandalaSvg(8, 'medium')));
  assert.match(mandalaSvg(1, 'detailed'), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1000 1000"/);
  for (const seed of [1, 2, 3, 99]) {
    const st = mazeStats(generateMaze(24, 32, seed));
    assert.ok(st.perfect && st.solvable, `maze ${seed}`);
  }
  const ws = generateWordSearch(['WHALE', 'CORAL', 'SHARK', 'OCTOPUS', 'DOLPHIN'], 10, 'hard', 5);
  assert.deepEqual(ws.unplaced, []);
  for (const p of ws.placements) assert.equal(p.cells.map(([x, y]) => ws.grid[y][x]).join(''), p.word);
});

test('structured outputs: XLSX formulas and CSV round-trip', async () => {
  const { out } = await renderType('budget-planner', { params: { months: 2 } as never });
  const xlsx = out.extraFiles.find((f) => f.kind === 'xlsx')!;
  const wb = await readWorkbook(xlsx.data as Buffer);
  assert.equal(wb.worksheets.length, 3);
  const formulas: string[] = [];
  wb.worksheets[0].eachRow((row) => row.eachCell((c) => { if (c.formula) formulas.push(c.formula); }));
  assert.ok(formulas.some((f) => f.startsWith('SUM(')), 'monthly totals use SUM');
  const csv = out.extraFiles.find((f) => f.kind === 'csv')!;
  const rows = parseCsv(String(csv.data));
  assert.ok(rows.length > 5 && rows.every((r) => r.length === 4));
  assert.equal(parseCsv(toCsv([['=HYPERLINK("x")', 'a,b', 'q"uote']]))[0][0], `'=HYPERLINK("x")`, 'formula injection neutralized');
});

test('variations along design and paper axes produce different deliverables', async () => {
  const a = await renderType('habit-tracker', { params: { months: 1 } as never, design: 0 });
  const b = await renderType('habit-tracker', { params: { months: 1 } as never, design: 3 });
  const c = await renderType('habit-tracker', { params: { months: 1 } as never, design: 0, paper: { size: 'a4' } });
  const hashes = new Set([a, b, c].map((r) => sha256(r.out.doc.previews[0])));
  assert.equal(hashes.size, 3);
});
