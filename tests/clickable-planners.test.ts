// Clickable planners (owner's pick from the ChatGPT review, 2026-11-17): with "Month tabs" on, every page carries a row
// of tabs that are real links inside the PDF. These tests render real PDFs and count the link annotations in them.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } from 'pdf-lib';
import { productType } from '../src/engine/producttypes/registry.ts';
import { renderProduct } from '../src/engine/rendering/renderProduct.ts';
import { countInternalLinks } from '../src/engine/qa/service.ts';
import { makeContext, deterministic, testRenderer, FONTS_DIR } from './helpers.ts';

const renderer = testRenderer();
after(() => renderer.close());

async function render(id: string, params: object, paper: object = {}) {
  const def = productType(id);
  const ctx = makeContext(def, { params: params as never, paper: paper as never });
  const content = deterministic(def, ctx);
  const out = await renderProduct(def, ctx, content, [], renderer, { fontsDir: FONTS_DIR, previewPages: 1, previewDpi: 48 });
  const links = countInternalLinks(await PDFDocument.load(out.doc.pdf));
  return { def, ctx, content, out, links, expected: def.expectedLinks?.(ctx, content) };
}

/** For each link on one page, the page number (from 1) it jumps to, in the order the links sit on the page. */
function landingPages(doc: PDFDocument, pageIdx: number): number[] {
  const dests = doc.catalog.lookup(PDFName.of('Dests')) as PDFDict;
  const pages = doc.getPages();
  const out: number[] = [];
  const annots = pages[pageIdx].node.Annots()!;
  for (let i = 0; i < annots.size(); i++) {
    const a = doc.context.lookup(annots.get(i)) as PDFDict;
    if (a.get(PDFName.of('Subtype')) !== PDFName.of('Link')) continue;
    let d: unknown = a.get(PDFName.of('Dest'));
    if (d instanceof PDFName || d instanceof PDFString || d instanceof PDFHexString) d = dests.get(PDFName.of((d as PDFName).decodeText()));
    const arr = doc.context.lookup(d as never) as PDFArray;
    const ref = arr.get(0);
    out.push(pages.findIndex((pg) => pg.ref === ref) + 1);
  }
  return out;
}

const clean = (out: Awaited<ReturnType<typeof render>>['out']) => {
  assert.deepEqual(out.doc.diagnostics.overflow, [], `overflow: ${JSON.stringify(out.doc.diagnostics.overflow.slice(0, 3))}`);
  assert.deepEqual(out.doc.diagnostics.outsideMargin, [], `margins: ${JSON.stringify(out.doc.diagnostics.outsideMargin.slice(0, 3))}`);
  assert.deepEqual(out.doc.diagnostics.consoleErrors, []);
  assert.deepEqual(out.doc.diagnostics.blockedRequests, []);
};

test('monthly calendar: one tab per month on every page, each landing on a page', async () => {
  const r = await render('monthly-calendar', { year: 2027, monthTabs: true });
  assert.equal(r.expected, 12 * 13, '12 tabs on 13 pages (cover included)');
  assert.equal(r.links.total, 12 * 13);
  assert.equal(r.links.resolved, r.links.total);
  assert.equal(r.out.doc.pdfPageCount, 13);
  clean(r.out);
  const doc = await PDFDocument.load(r.out.doc.pdf);
  const want = Array.from({ length: 12 }, (_, i) => i + 2); // page 1 is the cover, January is page 2
  assert.deepEqual(landingPages(doc, 0).sort((a, b) => a - b), want, 'cover tabs land on the 12 month pages');
  assert.deepEqual(landingPages(doc, 6).sort((a, b) => a - b), want, 'the same tabs sit on every page');
  assert.deepEqual(landingPages(doc, 0).slice(0, 3), [2, 3, 4], 'in month order, January first');
});

test('weekly planner: tabs for each month that starts inside the planner, jumping to the week holding its first day', async () => {
  const r = await render('weekly-planner', { startDate: '2027-01-01', weeks: 52, monthTabs: true });
  // The first week starts Monday 28 Dec 2026, so December 2026 has no tab; Jan to Dec 2027 do (12), and the last week ends 26 Dec 2027.
  assert.equal(r.expected, 12 * 53);
  assert.equal(r.links.total, r.expected);
  assert.equal(r.links.resolved, r.links.total);
  clean(r.out);
  // Page 1 is the cover, week n is page n + 1. Tab for 1 Jan: the week of 28 Dec holds it, so page 2. 1 Feb 2027 is a Monday, in week 6 (page 7).
  const doc = await PDFDocument.load(r.out.doc.pdf);
  const land = landingPages(doc, 0);
  assert.equal(land[0], 2);
  assert.equal(land[1], 6 + 1);
});

test('dated daily planner: tabs only for months whose first day is inside it; undated pages get none', async () => {
  const r = await render('daily-planner', { dated: true, startDate: '2027-01-20', days: 40, monthTabs: true });
  // 20 Jan to 28 Feb: only 1 Feb starts inside, so one tab on each of 40 pages.
  assert.equal(r.expected, 40);
  assert.equal(r.links.total, 40);
  assert.equal(r.links.resolved, 40);
  clean(r.out);
  const none = await render('daily-planner', { dated: true, startDate: '2027-02-02', days: 10, monthTabs: true });
  assert.equal(none.expected, 0, 'no month starts inside, so no tabs');
  assert.equal(none.links.total, 0);
  const undated = await render('daily-planner', { dated: false, days: 3, monthTabs: true });
  assert.equal(undated.expected, 0);
  assert.equal(undated.links.total, 0);
});

test('with tabs off the output is the same as before: no links, and nothing asks for a link check', async () => {
  for (const [id, params] of [['monthly-calendar', { year: 2027, months: 3 }], ['weekly-planner', { startDate: '2027-01-01', weeks: 3 }], ['daily-planner', { dated: true, startDate: '2027-01-01', days: 3 }]] as const) {
    const r = await render(id, params);
    assert.equal(r.expected, undefined, id);
    assert.equal(r.links.total, 0, id);
  }
});

test('tabs fit on smaller paper and across 24 months, with no clipped text', async () => {
  const wide = await render('monthly-calendar', { year: 2027, months: 24, monthTabs: true }, { size: 'a5' });
  assert.equal(wide.links.total, 24 * 25);
  assert.equal(wide.links.resolved, wide.links.total);
  clean(wide.out);
  const land = await render('monthly-calendar', { year: 2027, months: 12, monthTabs: true }, { orientation: 'landscape' });
  assert.equal(land.links.total, 12 * 13);
  clean(land.out);
});

test('the listing only mentions tabs when the product has them, and says nothing about any app', async () => {
  const on = await render('monthly-calendar', { year: 2027, months: 3, monthTabs: true });
  const off = await render('monthly-calendar', { year: 2027, months: 3 });
  const feats = (r: typeof on) => r.def.listingHints(r.ctx, r.content).features;
  assert.ok(feats(on).some((f) => /Clickable month tabs/.test(f)));
  assert.ok(!feats(off).some((f) => /tabs/i.test(f)));
  assert.ok(!feats(on).some((f) => /goodnotes|notability|ipad|apple|android/i.test(f)), 'no claims about specific apps');
});

test('every paper size and orientation: links all present and nothing clipped', async () => {
  const bad: string[] = [];
  const cases = [
    ['monthly-calendar', { year: 2027, months: 3, startMonth: 11, monthTabs: true }, ['portrait', 'landscape']],
    ['weekly-planner', { startDate: '2027-01-01', weeks: 6, monthTabs: true }, ['portrait', 'landscape']],
    // Landscape daily pages on A5 and half letter already overflow without tabs (a layout problem older than tabs), so only portrait here.
    ['daily-planner', { dated: true, startDate: '2027-01-30', days: 4, monthTabs: true }, ['portrait']],
  ] as const;
  for (const [id, params, orientations] of cases) {
    for (const size of ['letter', 'a4', 'a5', 'half-letter', 'legal']) {
      for (const orientation of orientations) {
        const r = await render(id, params, { size, orientation });
        const tag = `${id} ${size} ${orientation}`;
        if (r.links.total !== r.expected || r.links.resolved !== r.links.total) bad.push(`${tag}: ${r.links.total} links, ${r.links.resolved} land, expected ${r.expected}`);
        if (r.out.doc.diagnostics.overflow.length || r.out.doc.diagnostics.outsideMargin.length) bad.push(`${tag}: clipped or outside the margin`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
