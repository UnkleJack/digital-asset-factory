import { z } from 'zod';
import { html, type SafeHtml } from '../rendering/html.ts';
import { page, header, lines, table, chunk, space, ornament, weekdayOrder, type Space } from '../rendering/components.ts';
import { WEEKDAY_NAMES } from '../../core/time.ts';
import { SCHOOL_SUBJECTS, schoolKey, ASSIGNMENT_TIPS, TIMETABLE_NOTES, READING_GENRES, READING_REVIEW_PROMPTS, readingKey } from './library.ts';
import { AI_SYSTEM_BASE, audienceLine, themeLine, revisionClause, shuffle, type ProductTypeDefinition, type QaFinding, type TypeContext } from './types.ts';
import { coverPage, stdFooter, baseHints, PRINT_USAGE, audienceSuffix } from './common.ts';

/*
 * Student product types (build list B1, owner 2026-11-09): assignment tracker, timetable, reading log.
 * They follow the list and dated types: AI writes the words when a key is set, the built-in library
 * otherwise, and the layout, dates and times are always worked out by the app.
 */

export const STUDENT_CATEGORY = 'School & Study';

function dupes(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.trim().toLowerCase();
    const d = seen.has(k);
    seen.add(k);
    return d;
  });
}

const countCheck = (code: string, actual: number, min: number, max: number, what: string): QaFinding => ({ code, severity: 'hard', passed: actual >= min && actual <= max, message: `${what}: ${actual} (allowed ${min}-${max})` });
const dupeCheck = (items: string[], what: string): QaFinding => {
  const d = dupes(items);
  return { code: 'duplicate_items', severity: 'warning', passed: d.length === 0, message: d.length ? `Repeated ${what}: ${d.join(', ')}` : `No repeated ${what}` };
};

/** Smallest row a person can write in, in mm. */
const MIN_ROW_MM = 6.5;

/** The smallest row for this design: big enough to write in, and for one line of its table text (large print and kids' designs need more). */
function minRow(tokens: { baseSizePt: number }): number {
  return Math.max(MIN_ROW_MM, tokens.baseSizePt * 0.9 * 0.3528 * 1.35 + 2.4);
}

/** Room for a page's header and footer, in mm: grows with the design's type size (kids' and large-print designs). */
function reserved(tokens: { baseSizePt: number }, extra = 0): number {
  return Math.max(34, tokens.baseSizePt * 3.6) + extra;
}

/** How many table rows of at least `rowMm` fit in `heightMm`, after the header row. */
function rowsThatFit(heightMm: number, rowMm: number): number {
  return Math.max(1, Math.floor(heightMm / rowMm) - 1);
}

/** Row height for `rows` rows in `heightMm` (header row counted), never under `min` and never over 12 mm. */
function rowHeight(heightMm: number, rows: number, min: number): number {
  return Math.max(min, Math.min(12, heightMm / (rows + 1)));
}

// ---------------------------------------------------------------- assignment tracker

const AssignParams = z.object({
  /** combined: one running list for every subject; per-subject: a page for each subject. */
  layout: z.enum(['combined', 'per-subject']).default('combined'),
  /** Log pages for the combined layout (the per-subject layout has one per subject). */
  pages: z.number().int().min(1).max(20).default(4),
  rowsPerPage: z.number().int().min(8).max(30).default(18),
  showGrade: z.boolean().default(true),
  subjects: z.array(z.string().min(2).max(30)).min(3).max(12).optional(),
  cover: z.boolean().default(true),
});
type AssignP = z.infer<typeof AssignParams>;
const AssignContent = z.object({
  coverSubtitle: z.string().min(3).max(90),
  intro: z.string().min(10).max(160),
  subjects: z.array(z.string().min(2).max(30)).min(3).max(12),
  tips: z.array(z.string().min(5).max(90)).min(3).max(6),
});
type AssignC = z.infer<typeof AssignContent>;

function assignColumns(p: AssignP, withSubject: boolean) {
  const cols = withSubject
    ? p.showGrade ? [['Subject', 18], ['Assignment', 38], ['Set', 11], ['Due', 11], ['Done', 9], ['Grade', 13]] : [['Subject', 20], ['Assignment', 46], ['Set', 12], ['Due', 12], ['Done', 10]]
    : p.showGrade ? [['Assignment', 50], ['Set', 13], ['Due', 13], ['Done', 10], ['Grade', 14]] : [['Assignment', 58], ['Set', 15], ['Due', 15], ['Done', 12]];
  return cols.map(([label, widthPct]) => ({ label: label as string, widthPct: widthPct as number }));
}

/** The rows each log page really gets on this paper: the asked-for number, or fewer if they would be too small to write in. */
function assignRows(ctx: TypeContext<AssignP>): { rows: number; rowMm: number; sp: Space } {
  const sp = space(ctx.paper, ctx.tokens, reserved(ctx.tokens));
  const min = minRow(ctx.tokens);
  const rows = Math.min(ctx.params.rowsPerPage, rowsThatFit(sp.bodyHeightMm, min));
  return { rows, rowMm: rowHeight(sp.bodyHeightMm, rows, min), sp };
}

const logPageCount = (ctx: TypeContext<AssignP>, c: AssignC) => (ctx.params.layout === 'per-subject' ? c.subjects.length : ctx.params.pages);

export const assignmentTracker: ProductTypeDefinition<AssignP, AssignC> = {
  id: 'assignment-tracker',
  name: 'Assignment tracker',
  family: 'printable',
  category: STUDENT_CATEGORY,
  description: 'Homework and assignment log with a subjects page: one running list, or a page per subject.',
  paramsSchema: AssignParams,
  contentSchema: AssignContent,
  defaultParams: () => AssignParams.parse({}),
  defaultTitle: (ctx) => `${ctx.params.layout === 'per-subject' ? 'Subject-by-Subject ' : ''}Assignment Tracker${audienceSuffix(ctx)}`,
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'audience', 'paper', 'layout', 'theme'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write the words for a printable assignment tracker titled "${ctx.title}".
Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
${ctx.params.subjects ? `Subjects (keep these, same order, spelling tidied): ${ctx.params.subjects.join(', ')}.` : 'Pick 6 to 10 common school subjects for this audience.'}
Return coverSubtitle (one short line), intro (one sentence on how to use the tracker), subjects (the subject list, each under 28 characters), and tips (3 to 5 short, practical tips for keeping on top of homework, each under 85 characters; no medical or mental-health claims).${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx) => {
    const k = schoolKey(ctx.audience?.name);
    return {
      coverSubtitle: 'Every assignment, every due date, all in one place',
      intro: 'Write each assignment in on the day it is set, then tick it off when it is handed in.',
      subjects: ctx.params.subjects ?? SCHOOL_SUBJECTS[k].slice(0, k === 'kids' ? 6 : 8),
      tips: ASSIGNMENT_TIPS[k].slice(0, 4),
    };
  },
  render(ctx, content) {
    const pages: SafeHtml[] = [];
    if (ctx.params.cover) pages.push(coverPage(ctx, ctx.title, content.coverSubtitle));
    // The subjects table keeps two blank rows for extra classes; the tips box takes whatever room is left.
    const subjMin = minRow(ctx.tokens);
    pages.push(page(html`${header('My subjects', content.intro, ornament(ctx.tokens))}
      ${table([{ label: 'Subject', widthPct: 30 }, { label: 'Teacher', widthPct: 26 }, { label: 'Room', widthPct: 16 }, { label: 'Notes', widthPct: 28 }], content.subjects.map((s) => [s]), 2, subjMin)}
      <div class="box fill"><div class="label">Tips</div>${content.tips.map((t) => html`<div class="row" style="gap:2mm;align-items:center"><span class="dot"></span><span>${t}</span></div>`)}</div>${stdFooter(ctx, ctx.title)}`));
    const { rows, rowMm } = assignRows(ctx);
    if (ctx.params.layout === 'per-subject') {
      content.subjects.forEach((s) => pages.push(page(html`${header(s, 'Assignments', ornament(ctx.tokens))}${table(assignColumns(ctx.params, false), [], rows, rowMm)}${stdFooter(ctx, ctx.title)}`)));
    } else {
      for (let i = 0; i < ctx.params.pages; i++) pages.push(page(html`${header('Assignments', i === 0 ? 'Write each one in on the day it is set' : '', ornament(ctx.tokens))}${table(assignColumns(ctx.params, true), [], rows, rowMm)}${stdFooter(ctx, `Page ${i + 1} of ${ctx.params.pages}`)}`));
    }
    return { pages };
  },
  expectedPageCount: (ctx, c) => (ctx.params.cover ? 1 : 0) + 1 + logPageCount(ctx, c),
  consistencyChecks: (ctx, c) => {
    const { rows } = assignRows(ctx);
    const findings: QaFinding[] = [
      countCheck('subject_count', c.subjects.length, 3, 12, 'Subjects'),
      countCheck('tip_count', c.tips.length, 3, 6, 'Tips'),
      dupeCheck(c.subjects, 'subjects'),
      { code: 'rows_fit', severity: 'warning', passed: rows === ctx.params.rowsPerPage, message: rows === ctx.params.rowsPerPage ? `${rows} writable rows on every log page` : `Only ${rows} of the ${ctx.params.rowsPerPage} rows fit at a writable size on this paper` },
    ];
    if (ctx.params.subjects) {
      const same = ctx.params.subjects.length === c.subjects.length && ctx.params.subjects.every((s, i) => s.trim().toLowerCase() === c.subjects[i]?.trim().toLowerCase());
      findings.push({ code: 'subjects_kept', severity: 'warning', passed: same, message: same ? 'The subjects you listed are the ones printed' : `Printed subjects differ from the ones you listed: ${c.subjects.join(', ')}` });
    }
    return findings;
  },
  qaText: (c) => [c.coverSubtitle, c.intro, ...c.subjects, ...c.tips],
  listingHints: (ctx, c) => baseHints(ctx, ['assignment tracker', 'homework planner', 'homework tracker', 'student planner', 'school planner'],
    [ctx.params.layout === 'per-subject' ? `A page for each of ${c.subjects.length} subjects` : `${ctx.params.pages} assignment log pages`, 'Set date, due date and a done box for every assignment', ctx.params.showGrade ? 'Grade column to see your progress' : 'Room to note feedback', 'My subjects page for teachers and rooms'],
    [`1 PDF (${(ctx.params.cover ? 1 : 0) + 1 + logPageCount(ctx, c)} pages)`], PRINT_USAGE),
};

// ---------------------------------------------------------------- timetable

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, 24-hour');

const TimeParams = z.object({
  days: z.union([z.literal(5), z.literal(6), z.literal(7)]).default(5),
  weekStart: z.union([z.literal(0), z.literal(1)]).default(1),
  periods: z.number().int().min(3).max(12).default(6),
  startTime: HHMM.default('08:30'),
  periodMinutes: z.number().int().min(20).max(120).default(50),
  /** Minutes between periods (not printed as a row). */
  breakMinutes: z.number().int().min(0).max(30).default(10),
  /** The lunch row comes after this period; 0 means no lunch row. */
  lunchAfter: z.number().int().min(0).max(11).default(3),
  lunchMinutes: z.number().int().min(15).max(90).default(40),
  /** single: one week; ab: a Week A and a Week B page for two-week rotations. */
  weeks: z.enum(['single', 'ab']).default('single'),
  showTimes: z.boolean().default(true),
});
type TimeP = z.infer<typeof TimeParams>;
const TimeContent = z.object({
  subtitle: z.string().min(3).max(90),
  subjects: z.array(z.string().min(2).max(30)).min(4).max(12),
  notesLabel: z.string().min(3).max(60),
});
type TimeC = z.infer<typeof TimeContent>;

export interface Slot {
  kind: 'period' | 'lunch';
  label: string;
  start: number;
  end: number;
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** The school day's rows with their times, worked out from the settings. A lunch row placed after the last period is left out. */
export function timetableSlots(p: TimeP): Slot[] {
  const out: Slot[] = [];
  let t = toMin(p.startTime);
  for (let i = 1; i <= p.periods; i++) {
    out.push({ kind: 'period', label: `Period ${i}`, start: t, end: t + p.periodMinutes });
    t += p.periodMinutes;
    if (i === p.lunchAfter && i < p.periods) {
      out.push({ kind: 'lunch', label: 'Lunch', start: t, end: t + p.lunchMinutes });
      t += p.lunchMinutes;
    } else if (i < p.periods) t += p.breakMinutes;
  }
  return out;
}

export function timetableDays(p: TimeP): string[] {
  return weekdayOrder(p.weekStart).slice(0, p.days).map((d) => WEEKDAY_NAMES[d]);
}

export interface TimetableLayout {
  rowMm: number;
  lunchMm: number;
  keyRowMm: number;
  /** The subjects key and notes go on a page of their own because the day leaves no room under it. */
  keyOwnPage: boolean;
  /** Times sit beside the period number instead of under it, to save height. */
  timesInline: boolean;
  /** Every row fits at a writable size. */
  fits: boolean;
  neededMm: number;
  availableMm: number;
}

/** Works out how the timetable fits the page, trying the roomiest layout first. */
export function timetableLayout(ctx: TypeContext<TimeP>, c: TimeC): TimetableLayout {
  const slots = timetableSlots(ctx.params);
  const sp = space(ctx.paper, ctx.tokens, reserved(ctx.tokens, 6));
  const min = minRow(ctx.tokens);
  const timeLine = ctx.tokens.baseSizePt * 0.8 * 0.3528 * 1.3;
  const keyMm = (c.subjects.length + 1) * min + 10;
  const rows = slots.length + 1;
  const tries: Array<{ keyOwnPage: boolean; timesInline: boolean }> = [
    { keyOwnPage: false, timesInline: false }, { keyOwnPage: false, timesInline: true }, { keyOwnPage: true, timesInline: false }, { keyOwnPage: true, timesInline: true },
  ];
  for (const t of tries) {
    const periodMin = ctx.params.showTimes && !t.timesInline ? min + timeLine : min;
    const available = sp.bodyHeightMm - (t.keyOwnPage ? 0 : keyMm);
    if (rows * periodMin <= available || t === tries[tries.length - 1]) {
      const rowMm = Math.max(periodMin, Math.min(22, available / rows));
      return { rowMm, lunchMm: Math.max(periodMin, rowMm * 0.6), keyRowMm: min, ...t, fits: rows * periodMin <= available, neededMm: rows * periodMin, availableMm: available };
    }
  }
  throw new Error('unreachable');
}

export const timetable: ProductTypeDefinition<TimeP, TimeC> = {
  id: 'timetable',
  name: 'Class timetable',
  family: 'printable',
  category: STUDENT_CATEGORY,
  description: 'Weekly class timetable with period times worked out from your school day, a lunch row and a subjects key; one week or Week A and B.',
  paramsSchema: TimeParams,
  contentSchema: TimeContent,
  defaultParams: () => TimeParams.parse({}),
  defaultTitle: (ctx) => `${ctx.params.weeks === 'ab' ? 'Two-Week ' : ''}Class Timetable${audienceSuffix(ctx)}`,
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'paper', 'days', 'weeks', 'weekStart', 'audience'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write the words for a printable class timetable titled "${ctx.title}".
Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
Return subtitle (one short line), subjects (6 to 10 common school subjects for this audience, each under 28 characters, for the key where students add their teacher and room), and notesLabel (a short label for the notes box, under 55 characters, e.g. what to bring).${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx) => {
    const k = schoolKey(ctx.audience?.name);
    return { subtitle: 'Write each class in its box', subjects: SCHOOL_SUBJECTS[k].slice(0, k === 'kids' ? 8 : 10), notesLabel: TIMETABLE_NOTES[k] };
  },
  render(ctx, content) {
    const slots = timetableSlots(ctx.params);
    const days = timetableDays(ctx.params);
    const L = timetableLayout(ctx, content);
    const firstW = L.timesInline ? 30 : ctx.params.showTimes ? 20 : 12;
    const cols = [{ label: '', widthPct: firstW }, ...days.map((d) => ({ label: ctx.params.days === 7 ? d.slice(0, 3) : d, widthPct: (100 - firstW) / days.length }))];
    const when = (sl: Slot) => (!ctx.params.showTimes ? '' : L.timesInline ? html` <span class="small">${hhmm(sl.start)}–${hhmm(sl.end)}</span>` : html`<div class="small">${hhmm(sl.start)}–${hhmm(sl.end)}</div>`);
    const grid = html`<table class="grid"><colgroup>${cols.map((c) => html`<col style="width:${c.widthPct}%">`)}</colgroup><thead><tr>${cols.map((c) => html`<th>${c.label}</th>`)}</tr></thead><tbody>${slots.map((sl) => sl.kind === 'lunch'
      ? html`<tr style="height:${L.lunchMm.toFixed(2)}mm"><td><b>Lunch</b>${when(sl)}</td><td colspan="${days.length}" style="background:var(--soft)"></td></tr>`
      : html`<tr style="height:${L.rowMm.toFixed(2)}mm"><td><b>${sl.label.replace('Period ', '')}</b>${when(sl)}</td>${days.map(() => html`<td></td>`)}</tr>`)}</tbody></table>`;
    const keyAndNotes = html`<div class="row fill" style="gap:3mm"><div class="col" style="flex:3 1 0;min-width:0">${table([{ label: 'Subject', widthPct: 34 }, { label: 'Teacher', widthPct: 33 }, { label: 'Room', widthPct: 33 }], content.subjects.map((x) => [x]), 0, L.keyRowMm)}</div><div class="box" style="flex:2 1 0"><div class="label">${content.notesLabel}</div>${lines(4)}</div></div>`;
    const weekPages = ctx.params.weeks === 'ab' ? ['Week A', 'Week B'] : [''];
    const pages = weekPages.map((w) => page(html`${header(w ? `${ctx.title}: ${w}` : ctx.title, content.subtitle, ornament(ctx.tokens))}${grid}${L.keyOwnPage ? '' : keyAndNotes}${stdFooter(ctx, w)}`));
    // When the day has too many rows for the key to fit under it, the key and notes get a page of their own.
    if (L.keyOwnPage) pages.push(page(html`${header('Subjects and teachers', content.notesLabel, ornament(ctx.tokens))}${keyAndNotes}${stdFooter(ctx, ctx.title)}`));
    return { pages };
  },
  expectedPageCount: (ctx, c) => (ctx.params.weeks === 'ab' ? 2 : 1) + (timetableLayout(ctx, c).keyOwnPage ? 1 : 0),
  consistencyChecks: (ctx, c) => {
    const slots = timetableSlots(ctx.params);
    const days = timetableDays(ctx.params);
    const periods = slots.filter((s) => s.kind === 'period');
    const ordered = slots.every((s, i) => s.end > s.start && (i === 0 || s.start >= slots[i - 1].end));
    const sameLength = periods.every((s) => s.end - s.start === ctx.params.periodMinutes);
    const endOfDay = slots[slots.length - 1].end;
    const lunchShown = slots.some((s) => s.kind === 'lunch');
    const wantLunch = ctx.params.lunchAfter > 0;
    return [
      { code: 'timetable_times', severity: 'hard', passed: ordered && sameLength && periods.length === ctx.params.periods && endOfDay <= 24 * 60, message: ordered && sameLength && endOfDay <= 24 * 60 ? `${periods.length} periods from ${hhmm(slots[0].start)} to ${endOfDay > 24 * 60 ? 'after midnight' : hhmm(endOfDay)}, in order, none overlapping` : `Period times are out of order, overlap or run past midnight (day ends ${Math.floor(endOfDay / 60)}:${String(endOfDay % 60).padStart(2, '0')})` },
      { code: 'timetable_days', severity: 'hard', passed: days.length === ctx.params.days && new Set(days).size === days.length && days[0] === WEEKDAY_NAMES[ctx.params.weekStart], message: `Days: ${days.join(', ')}` },
      { code: 'lunch_position', severity: 'warning', passed: !wantLunch || lunchShown, message: !wantLunch ? 'No lunch row asked for' : lunchShown ? `Lunch after period ${ctx.params.lunchAfter}` : `Lunch is set after period ${ctx.params.lunchAfter}, but there are only ${ctx.params.periods} periods, so no lunch row is printed` },
      (() => {
        const L = timetableLayout(ctx, c);
        return { code: 'timetable_fits', severity: 'hard' as const, passed: L.fits, message: L.fits ? `Every row fits at a writable size${L.keyOwnPage ? '; the subjects key has its own page' : ''}` : `The day needs about ${Math.round(L.neededMm)} mm but the page has ${Math.round(L.availableMm)} mm: use bigger paper, fewer periods or turn off the times` };
      })(),
      countCheck('subject_count', c.subjects.length, 4, 12, 'Subjects in the key'),
      dupeCheck(c.subjects, 'subjects'),
    ];
  },
  qaText: (c) => [c.subtitle, ...c.subjects, c.notesLabel],
  listingHints: (ctx) => baseHints(ctx, ['class timetable', 'school timetable', 'class schedule printable', 'student timetable', 'school schedule'],
    [`${ctx.params.days}-day week, ${ctx.params.periods} periods${ctx.params.showTimes ? ' with times' : ''}`, ctx.params.weeks === 'ab' ? 'Week A and Week B pages for two-week rotations' : 'One page for the whole week', 'Subjects key with teacher and room', 'Notes box'],
    [`1 PDF (${ctx.params.weeks === 'ab' ? 2 : 1} page${ctx.params.weeks === 'ab' ? 's' : ''})`], PRINT_USAGE),
};

// ---------------------------------------------------------------- reading log

const ReadParams = z.object({
  /** Numbered rows in the book list. */
  books: z.number().int().min(10).max(100).default(30),
  /** A reading goal printed on the book list, or none. */
  goal: z.number().int().min(1).max(200).optional(),
  challenge: z.boolean().default(true),
  /** Months of daily reading-minutes pages (undated: write the month in). */
  minutesMonths: z.number().int().min(0).max(12).default(3),
  reviewPages: z.number().int().min(0).max(20).default(4),
  cover: z.boolean().default(true),
});
type ReadP = z.infer<typeof ReadParams>;
const ReadContent = z.object({
  coverSubtitle: z.string().min(3).max(90),
  genres: z.array(z.string().min(3).max(40)).min(6).max(16),
  reviewPrompts: z.array(z.string().min(5).max(90)).min(3).max(6),
});
type ReadC = z.infer<typeof ReadContent>;

/** The book list split into pages; each entry is the row numbers on that page. */
export function bookListPages(ctx: TypeContext<ReadP>): number[][] {
  const sp = space(ctx.paper, ctx.tokens, reserved(ctx.tokens));
  const perPage = Math.max(5, Math.min(25, rowsThatFit(sp.bodyHeightMm, Math.max(7.5, minRow(ctx.tokens)))));
  return chunk(Array.from({ length: ctx.params.books }, (_, i) => i + 1), perPage);
}

const readingPageCount = (ctx: TypeContext<ReadP>) => (ctx.params.cover ? 1 : 0) + bookListPages(ctx).length + (ctx.params.challenge ? 1 : 0) + ctx.params.minutesMonths + ctx.params.reviewPages;

export const readingLog: ProductTypeDefinition<ReadP, ReadC> = {
  id: 'reading-log',
  name: 'Reading log',
  family: 'printable',
  category: STUDENT_CATEGORY,
  description: 'Numbered book list, genre reading challenge, monthly reading-minutes pages and book review pages.',
  paramsSchema: ReadParams,
  contentSchema: ReadContent,
  defaultParams: () => ReadParams.parse({}),
  defaultTitle: (ctx) => `${ctx.theme && ctx.theme.name !== 'Minimalist' ? ctx.theme.name + ' ' : ''}Reading Log${audienceSuffix(ctx)}`,
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'audience', 'paper', 'theme'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write the words for a printable reading log titled "${ctx.title}".
Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
Return coverSubtitle (one short line), genres (8 to 12 kinds of book for a reading challenge, each under 38 characters, e.g. "A mystery"; no book titles, authors or series), and reviewPrompts (4 or 5 questions for a one-page book review, each under 85 characters, suited to the audience's reading level).${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx, rand) => {
    const k = readingKey(ctx.audience?.name);
    return { coverSubtitle: 'Every book I read', genres: shuffle(rand, READING_GENRES[k]).slice(0, k === 'kids' ? 8 : 12), reviewPrompts: READING_REVIEW_PROMPTS[k].slice(0, k === 'kids' ? 4 : 5) };
  },
  render(ctx, content) {
    const pages: SafeHtml[] = [];
    if (ctx.params.cover) pages.push(coverPage(ctx, ctx.title, content.coverSubtitle, ctx.params.goal ? html`<div class="h3">My goal: ${ctx.params.goal} books</div>` : undefined));
    const listPages = bookListPages(ctx);
    const sp = space(ctx.paper, ctx.tokens, reserved(ctx.tokens));
    const rowMm = Math.max(7.5, minRow(ctx.tokens), Math.min(12, sp.bodyHeightMm / (Math.max(...listPages.map((p) => p.length)) + 1)));
    const cols = [{ label: '#', widthPct: 6 }, { label: 'Title', widthPct: 34 }, { label: 'Author', widthPct: 22 }, { label: 'Genre', widthPct: 14 }, { label: 'Done', widthPct: 12 }, { label: 'Stars', widthPct: 12 }];
    listPages.forEach((nums, i) => pages.push(page(html`${header('Books I read', i === 0 ? (ctx.params.goal ? `Goal: ${ctx.params.goal} books. Rate each one out of 5 stars.` : 'Rate each one out of 5 stars.') : `Books ${nums[0]}–${nums[nums.length - 1]}`, ornament(ctx.tokens))}${table(cols, nums.map((n) => [String(n)]), 0, rowMm)}${stdFooter(ctx, ctx.title)}`)));
    if (ctx.params.challenge) {
      const csp = space(ctx.paper, ctx.tokens, reserved(ctx.tokens, 6));
      pages.push(page(html`${header('Reading challenge', 'Read one of each, and write in the book you chose', ornament(ctx.tokens))}${table([{ label: 'Read…', widthPct: 38 }, { label: 'Book I chose', widthPct: 47 }, { label: 'Done', widthPct: 15 }], content.genres.map((g) => [g]), 0, rowHeight(csp.bodyHeightMm, content.genres.length, minRow(ctx.tokens)))}${stdFooter(ctx, ctx.title)}`));
    }
    const msp = space(ctx.paper, ctx.tokens, reserved(ctx.tokens, 6));
    const mRow = rowHeight(msp.bodyHeightMm, 16, minRow(ctx.tokens));
    const minutesCols = [{ label: 'Day', widthPct: 16 }, { label: 'Minutes', widthPct: 28 }, { label: 'What I read', widthPct: 56 }];
    for (let m = 0; m < ctx.params.minutesMonths; m++) {
      pages.push(page(html`${header('Reading minutes', 'Month: ________________   Total minutes: ________', ornament(ctx.tokens))}<div class="row fill" style="gap:3mm;align-items:flex-start"><div class="grow">${table(minutesCols, Array.from({ length: 16 }, (_, d) => [String(d + 1)]), 0, mRow)}</div><div class="grow">${table(minutesCols, Array.from({ length: 15 }, (_, d) => [String(d + 17)]), 0, mRow)}</div></div>${stdFooter(ctx, ctx.title)}`));
    }
    // Small or landscape pages leave room for one row of boxes above the questions; tall pages get the dates row too.
    const roomy = ctx.paper.orientation === 'portrait' && !['a5', 'half-letter'].includes(ctx.paper.size);
    for (let r = 0; r < ctx.params.reviewPages; r++) {
      pages.push(page(html`${header('Book review', 'One page for one book', ornament(ctx.tokens))}
        <div class="row" style="gap:3mm;flex:none"><div class="box" style="flex:5 1 0"><div class="label">Title</div></div><div class="box" style="flex:3 1 0"><div class="label">Author</div></div><div class="box" style="flex:2 1 0"><div class="label">Stars (of 5)</div></div></div>
        ${roomy ? html`<div class="row" style="gap:3mm;flex:none"><div class="box grow"><div class="label">Started</div></div><div class="box grow"><div class="label">Finished</div></div></div>` : ''}
        <div class="col fill">${content.reviewPrompts.map((q) => html`<div class="box grow"><div class="label">${q}</div>${lines(3)}</div>`)}</div>${stdFooter(ctx, `Review ${r + 1}`)}`));
    }
    return { pages };
  },
  expectedPageCount: (ctx) => readingPageCount(ctx),
  consistencyChecks: (ctx, c) => {
    const listed = bookListPages(ctx).flat();
    const numbered = listed.length === ctx.params.books && listed.every((n, i) => n === i + 1);
    const findings: QaFinding[] = [
      { code: 'book_rows', severity: 'hard', passed: numbered, message: numbered ? `Books numbered 1 to ${ctx.params.books} across ${bookListPages(ctx).length} page(s)` : `Book list numbering is broken (${listed.length} rows for ${ctx.params.books} books)` },
      countCheck('genre_count', c.genres.length, 6, 16, 'Challenge genres'),
      countCheck('review_prompt_count', c.reviewPrompts.length, 3, 6, 'Review questions'),
      dupeCheck([...c.genres, ...c.reviewPrompts], 'genres or questions'),
    ];
    if (ctx.params.goal) findings.push({ code: 'goal_fits', severity: 'warning', passed: ctx.params.goal <= ctx.params.books, message: ctx.params.goal <= ctx.params.books ? `Room for the goal of ${ctx.params.goal} books` : `The goal is ${ctx.params.goal} books but the list has ${ctx.params.books} rows` });
    return findings;
  },
  qaText: (c) => [c.coverSubtitle, ...c.genres, ...c.reviewPrompts],
  listingHints: (ctx, c) => baseHints(ctx, ['reading log', 'reading tracker', 'book log', 'reading journal', 'book tracker'],
    [`Numbered list for ${ctx.params.books} books with star ratings`, ...(ctx.params.challenge ? [`Reading challenge with ${c.genres.length} kinds of book`] : []), ...(ctx.params.minutesMonths ? [`${ctx.params.minutesMonths} monthly reading-minutes pages`] : []), ...(ctx.params.reviewPages ? [`${ctx.params.reviewPages} book review pages`] : [])],
    [`1 PDF (${readingPageCount(ctx)} pages)`], PRINT_USAGE),
};
