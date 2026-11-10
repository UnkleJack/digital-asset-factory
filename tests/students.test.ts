import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { productType, productTypes, plannableTypes } from '../src/engine/producttypes/registry.ts';
import { renderProduct } from '../src/engine/rendering/renderProduct.ts';
import { timetableSlots, timetableDays, bookListPages, hhmm, STUDENT_CATEGORY } from '../src/engine/producttypes/students.ts';
import { BUILTIN_CATEGORIES } from '../src/engine/templates/library.ts';
import { PRESETS } from '../src/engine/templates/presets.ts';
import { DEFAULT_PRICES } from '../src/config/settings.ts';
import { makeContext, deterministic, testRenderer, FONTS_DIR } from './helpers.ts';

const renderer = testRenderer();
after(() => renderer.close());

const STUDENT_TYPES = ['assignment-tracker', 'timetable', 'reading-log'] as const;

async function renderStudent(id: string, params: Record<string, unknown>, opts: Parameters<typeof makeContext>[1] = {}) {
  const def = productType(id);
  const ctx = makeContext(def, { ...opts, params: params as never });
  const content = deterministic(def, ctx);
  const out = await renderProduct(def, ctx, content, [], renderer, { fontsDir: FONTS_DIR, previewPages: 1, previewDpi: 48 });
  return { def, ctx, content, out };
}

const CASES: Array<[string, Record<string, unknown>, Parameters<typeof makeContext>[1]]> = [
  ['assignment-tracker', {}, {}],
  ['assignment-tracker', { layout: 'per-subject', showGrade: false, cover: false }, { audience: 'Students', design: 1 }],
  ['assignment-tracker', { pages: 2, rowsPerPage: 30 }, { paper: { size: 'a5' }, audience: 'Kids 4-8', design: 4 }],
  ['assignment-tracker', { subjects: ['Algebra', 'Chemistry', 'World History', 'Literature'], layout: 'per-subject' }, { paper: { orientation: 'landscape' }, audience: 'Seniors (large print)', design: 6 }],
  ['timetable', {}, {}],
  ['timetable', { weeks: 'ab', days: 6, periods: 8, lunchAfter: 4 }, { paper: { size: 'a4' }, design: 3 }],
  ['timetable', { days: 7, periods: 12, periodMinutes: 40, breakMinutes: 5, showTimes: false }, { paper: { size: 'a5' }, audience: 'Kids 4-8', design: 4 }],
  ['timetable', { periods: 3, lunchAfter: 0 }, { paper: { orientation: 'landscape' }, audience: 'Seniors (large print)', design: 6 }],
  ['reading-log', {}, {}],
  ['reading-log', { books: 100, goal: 52, minutesMonths: 1, reviewPages: 1 }, { paper: { size: 'a5' }, design: 5 }],
  ['reading-log', { books: 20, challenge: false, minutesMonths: 0, reviewPages: 2, cover: false }, { audience: 'Kids 4-8', design: 4, paper: { size: 'a4' } }],
  ['reading-log', { books: 12, minutesMonths: 1, reviewPages: 1 }, { paper: { orientation: 'landscape' }, audience: 'Seniors (large print)', design: 6 }],
];

test('student types render on every paper, audience and design tried, with no layout faults, and pass their QA', async () => {
  for (const [id, params, opts] of CASES) {
    const label = `${id} ${JSON.stringify(params)} ${JSON.stringify(opts)}`;
    const { def, ctx, content, out } = await renderStudent(id, params, opts);
    assert.equal(out.doc.pdfPageCount, out.expectedPages, `${label}: pages`);
    assert.deepEqual(out.doc.diagnostics.fontsMissing, [], label);
    assert.deepEqual(out.doc.diagnostics.blockedRequests, [], label);
    assert.deepEqual(out.doc.diagnostics.consoleErrors, [], label);
    assert.deepEqual(out.doc.diagnostics.overflow, [], `${label}: overflow ${JSON.stringify(out.doc.diagnostics.overflow.slice(0, 3))}`);
    assert.deepEqual(out.doc.diagnostics.outsideMargin, [], `${label}: margins ${JSON.stringify(out.doc.diagnostics.outsideMargin.slice(0, 3))}`);
    for (const f of def.consistencyChecks!(ctx, content, []).filter((x) => x.severity === 'hard')) assert.ok(f.passed, `${label} ${f.code}: ${f.message}`);
  }
});

test('timetable: period times are worked out from the school day', () => {
  const def = productType('timetable');
  const p = def.paramsSchema.parse({});
  const slots = timetableSlots(p);
  assert.deepEqual(slots.map((s) => `${s.label} ${hhmm(s.start)}-${hhmm(s.end)}`), [
    'Period 1 08:30-09:20', 'Period 2 09:30-10:20', 'Period 3 10:30-11:20', 'Lunch 11:20-12:00', 'Period 4 12:00-12:50', 'Period 5 13:00-13:50', 'Period 6 14:00-14:50',
  ]);
  assert.deepEqual(timetableDays(p), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  assert.deepEqual(timetableDays(def.paramsSchema.parse({ weekStart: 0, days: 6 })), ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  // Lunch set after the last period: no lunch row, and QA says why.
  const late = def.paramsSchema.parse({ periods: 4, lunchAfter: 4 });
  assert.equal(timetableSlots(late).some((s) => s.kind === 'lunch'), false);
  const ctx = makeContext(def, { params: { periods: 4, lunchAfter: 4 } as never });
  const lunch = def.consistencyChecks!(ctx, deterministic(def, ctx), []).find((f) => f.code === 'lunch_position')!;
  assert.equal(lunch.passed, false);
  assert.match(lunch.message, /only 4 periods/);
  // A day that runs past midnight fails.
  const night = makeContext(def, { params: { startTime: '20:00', periods: 12, periodMinutes: 120 } as never });
  assert.equal(def.consistencyChecks!(night, deterministic(def, night), []).find((f) => f.code === 'timetable_times')!.passed, false);
  assert.equal(def.paramsSchema.safeParse({ startTime: '8:30' }).success, false, '24-hour HH:MM only');
  assert.equal(makeContext(def, { params: { weeks: 'ab' } as never }).title, 'Two-Week Class Timetable');
});

test('reading log: books are numbered once each across pages; the goal and challenge are checked', () => {
  const def = productType('reading-log');
  for (const [books, size] of [[10, 'letter'], [100, 'a5'], [57, 'a4']] as const) {
    const ctx = makeContext(def, { params: { books } as never, paper: { size } });
    const pages = bookListPages(ctx);
    assert.deepEqual(pages.flat(), Array.from({ length: books }, (_, i) => i + 1), `${books} on ${size}`);
    assert.equal(def.consistencyChecks!(ctx, deterministic(def, ctx), []).find((f) => f.code === 'book_rows')!.passed, true);
  }
  const big = makeContext(def, { params: { books: 20, goal: 30 } as never });
  assert.equal(def.consistencyChecks!(big, deterministic(def, big), []).find((f) => f.code === 'goal_fits')!.passed, false);
  const kids = makeContext(def, { audience: 'Kids 4-8' });
  const kc = deterministic(def, kids);
  assert.ok(kc.genres.includes('A picture book') || kc.genres.includes('A fairy tale'), 'kids get kids’ kinds of book');
  assert.equal(kc.reviewPrompts[0], 'What happened in the story?');
  assert.ok(def.listingHints(kids, kc).features.some((f) => /book review pages/.test(f)));
});

test('assignment tracker: subjects you list are kept; rows that would be too small are dropped with a warning', () => {
  const def = productType('assignment-tracker');
  const ctx = makeContext(def, { params: { subjects: ['Algebra', 'Chemistry', 'World History'] } as never });
  const c = deterministic(def, ctx);
  assert.deepEqual(c.subjects, ['Algebra', 'Chemistry', 'World History']);
  assert.ok(def.contentPrompt!(ctx).user.includes('Algebra, Chemistry, World History'), 'the AI is told to keep them');
  assert.equal(def.consistencyChecks!(ctx, { ...c, subjects: ['Math', 'Art', 'Music'] }, []).find((f) => f.code === 'subjects_kept')!.passed, false);
  const small = makeContext(def, { params: { rowsPerPage: 30 } as never, paper: { size: 'a5' } });
  const fit = def.consistencyChecks!(small, deterministic(def, small), []).find((f) => f.code === 'rows_fit')!;
  assert.equal(fit.passed, false);
  assert.match(fit.message, /Only \d+ of the 30 rows fit/);
  const per = makeContext(def, { params: { layout: 'per-subject' } as never });
  const pc = deterministic(def, per);
  assert.equal(def.expectedPageCount(per, pc), 1 + 1 + pc.subjects.length, 'cover, subjects page, a page per subject');
  assert.equal(per.title, 'Subject-by-Subject Assignment Tracker');
  // Kids get a shorter, simpler subject list.
  assert.ok(deterministic(def, makeContext(def, { audience: 'Kids 4-8' })).subjects.includes('Reading'));
});

test('student types are registered at every touch point and use the AI with an offline fallback', () => {
  for (const id of STUDENT_TYPES) {
    const def = productType(id);
    assert.equal(def.category, STUDENT_CATEGORY);
    assert.equal(def.aiContent, true);
    assert.equal(def.artwork, 'none');
    assert.ok(productTypes().includes(def) && plannableTypes().includes(def));
    assert.ok(DEFAULT_PRICES[id] > 0, `${id} has a default price`);
    assert.ok(PRESETS.some((p) => p.productType === id && p.group === 'Students'), `${id} has a Students preset`);
    const ctx = makeContext(def, { audience: 'Students' });
    const prompt = def.contentPrompt!(ctx);
    assert.match(prompt.system, /Never mention brands/);
    assert.ok(prompt.user.includes(ctx.title));
    assert.doesNotThrow(() => deterministic(def, ctx));
  }
  assert.ok(BUILTIN_CATEGORIES.some((c) => c.name === STUDENT_CATEGORY));
});
