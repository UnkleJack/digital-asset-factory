import { z } from 'zod';
import { html } from '../rendering/html.ts';
import { page, header, monthGrid, miniMonth, lines, box, checklist, timeBlocks, monthCells, ornament } from '../rendering/components.ts';
import { MONTH_NAMES, WEEKDAY_NAMES, daysInMonth, parseYmd, addDaysUtc, ymd } from '../../core/time.ts';
import { US_FEDERAL_HOLIDAYS, WEEKLY_FOCUS_PROMPTS, DAILY_FOCUS_PROMPTS } from './library.ts';
import { AI_SYSTEM_BASE, audienceLine, themeLine, revisionClause, shuffle, type ProductTypeDefinition, type QaFinding, type TypeContext } from './types.ts';
import { coverPage, stdFooter, baseHints, PRINT_USAGE } from './common.ts';

const ymdString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

function monthSeq(year: number, startMonth: number, count: number): { year: number; month0: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const m = startMonth - 1 + i;
    return { year: year + Math.floor(m / 12), month0: m % 12 };
  });
}

function holidaysFor(year: number, month0: number, mode: 'none' | 'us-federal'): Record<number, string> {
  if (mode === 'none') return {};
  const all = US_FEDERAL_HOLIDAYS(year);
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(all)) {
    const [m, d] = k.split('-').map(Number);
    if (m === month0) out[d] = v;
  }
  return out;
}

function verifyMonthCells(year: number, month0: number, weekStart: 0 | 1): string | null {
  const cells = monthCells(year, month0, weekStart);
  const days = cells.filter((c): c is number => c !== null);
  const expected = daysInMonth(year, month0);
  if (days.length !== expected || days[0] !== 1 || days[days.length - 1] !== expected) return `${MONTH_NAMES[month0]} ${year}: ${days.length} days, expected ${expected}`;
  const offset = cells.indexOf(1);
  const realDow = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  if ((offset + weekStart) % 7 !== realDow) return `${MONTH_NAMES[month0]} ${year}: first day placed under the wrong weekday`;
  return null;
}

// ---------------------------------------------------------------- monthly calendar

const CalParams = z.object({
  year: z.number().int().min(2020).max(2100),
  startMonth: z.number().int().min(1).max(12).default(1),
  months: z.number().int().min(1).max(24).default(12),
  weekStart: z.union([z.literal(0), z.literal(1)]).default(0),
  holidays: z.enum(['none', 'us-federal']).default('none'),
  cover: z.boolean().default(true),
  notesPanel: z.boolean().default(true),
});
type CalP = z.infer<typeof CalParams>;
const CalContent = z.object({
  coverSubtitle: z.string().min(3).max(90),
  monthIntentions: z.array(z.string().min(3).max(80)).min(1).max(24),
});
type CalC = z.infer<typeof CalContent>;

export const monthlyCalendar: ProductTypeDefinition<CalP, CalC> = {
  id: 'monthly-calendar',
  name: 'Monthly calendar',
  family: 'printable',
  category: 'Calendars & Planners',
  description: 'Dated month-per-page wall or desk calendar with optional holidays and notes panel.',
  paramsSchema: CalParams,
  contentSchema: CalContent,
  defaultParams: (now) => CalParams.parse({ year: now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear() }),
  defaultTitle: (ctx) => `${ctx.params.year} ${ctx.theme && ctx.theme.name !== 'Minimalist' ? ctx.theme.name + ' ' : ''}Monthly Calendar`,
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'paper', 'weekStart', 'holidays', 'theme'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write content for a printable monthly calendar titled "${ctx.title}".
Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
Months covered, in order: ${monthSeq(ctx.params.year, ctx.params.startMonth, ctx.params.months).map((m) => `${MONTH_NAMES[m.month0]} ${m.year}`).join(', ')}.
Return coverSubtitle (one short line) and monthIntentions: exactly ${ctx.params.months} short monthly intentions (max 70 characters each), one per month in order, each fitting that month's season for a Northern Hemisphere reader.${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx, rand) => {
    const pool = shuffle(rand, WEEKLY_FOCUS_PROMPTS);
    return {
      coverSubtitle: ctx.theme && ctx.theme.name !== 'Minimalist' ? `A ${ctx.theme.name.toLowerCase()} year at a glance` : 'Plan the year one month at a time',
      monthIntentions: Array.from({ length: ctx.params.months }, (_, i) => pool[i % pool.length]),
    };
  },
  render(ctx, content) {
    const p = ctx.params;
    const pages = [];
    if (p.cover) pages.push(coverPage(ctx, ctx.title, content.coverSubtitle, html`<div class="big">${p.year}</div>`));
    const seq = monthSeq(p.year, p.startMonth, p.months);
    const landscape = ctx.paper.orientation === 'landscape';
    seq.forEach((m, i) => {
      const nextM = { year: m.month0 === 11 ? m.year + 1 : m.year, month0: (m.month0 + 1) % 12 };
      const grid = monthGrid(m.year, m.month0, p.weekStart, holidaysFor(m.year, m.month0, p.holidays));
      const side = html`<div class="col" style="width:${landscape ? 48 : 40}mm;flex:none">${miniMonth(nextM.year, nextM.month0, p.weekStart)}${box('Notes', lines(landscape ? 8 : 6))}</div>`;
      const body = p.notesPanel && landscape
        ? html`<div class="row fill">${html`<div class="col grow">${grid}</div>`}${side}</div>`
        : p.notesPanel
          ? html`<div class="col fill">${grid}<div class="row" style="height:28mm;flex:none"><div class="box grow"><div class="label">Notes</div>${lines(3)}</div><div class="box" style="width:44mm;flex:none">${miniMonth(nextM.year, nextM.month0, p.weekStart)}</div></div></div>`
          : html`<div class="col fill">${grid}</div>`;
      pages.push(page(html`${header(`${MONTH_NAMES[m.month0]} ${m.year}`, content.monthIntentions[i] ?? '', ornament(ctx.tokens))}${body}${stdFooter(ctx, ctx.title)}`));
    });
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.months + (ctx.params.cover ? 1 : 0),
  consistencyChecks(ctx, content) {
    const out: QaFinding[] = [];
    const problems = monthSeq(ctx.params.year, ctx.params.startMonth, ctx.params.months).map((m) => verifyMonthCells(m.year, m.month0, ctx.params.weekStart)).filter(Boolean);
    out.push({ code: 'calendar_dates', severity: 'hard', passed: problems.length === 0, message: problems.length ? `Calendar date errors: ${problems.join('; ')}` : 'Every month has the correct days and weekday alignment', details: problems });
    out.push({ code: 'content_count', severity: 'hard', passed: content.monthIntentions.length === ctx.params.months, message: `Monthly intentions: ${content.monthIntentions.length} for ${ctx.params.months} months` });
    const yearInTitle = ctx.title.match(/\b(20\d\d|21\d\d)\b/);
    out.push({ code: 'title_year', severity: 'hard', passed: !yearInTitle || Number(yearInTitle[1]) === ctx.params.year || Number(yearInTitle[1]) === ctx.params.year + Math.floor((ctx.params.startMonth - 1 + ctx.params.months - 1) / 12), message: yearInTitle ? `Title year ${yearInTitle[1]} vs calendar year ${ctx.params.year}` : 'Title has no year' });
    return out;
  },
  qaText: (c) => [c.coverSubtitle, ...c.monthIntentions],
  listingHints: (ctx) => baseHints(ctx, ['calendar', `${ctx.params.year} calendar`, 'monthly calendar', 'wall calendar', 'desk calendar'],
    [`${ctx.params.months} dated monthly pages`, ctx.params.weekStart === 1 ? 'Monday start weeks' : 'Sunday start weeks', ctx.params.holidays === 'us-federal' ? 'US federal holidays marked' : 'Clean dates without holidays', ctx.params.notesPanel ? 'Notes area and next-month preview on every page' : 'Large date boxes'],
    [`1 PDF (${ctx.params.months + (ctx.params.cover ? 1 : 0)} pages)`], PRINT_USAGE),
};

// ---------------------------------------------------------------- weekly planner

const WeekParams = z.object({
  startDate: ymdString,
  weeks: z.number().int().min(1).max(53).default(52),
  weekStart: z.union([z.literal(0), z.literal(1)]).default(1),
  cover: z.boolean().default(true),
});
type WeekP = z.infer<typeof WeekParams>;
const WeekContent = z.object({
  coverSubtitle: z.string().min(3).max(90),
  weeklyFocus: z.array(z.string().min(3).max(80)).min(1).max(53),
});
type WeekC = z.infer<typeof WeekContent>;

function alignedStart(p: WeekP): Date {
  const d = parseYmd(p.startDate);
  const back = (d.getUTCDay() - p.weekStart + 7) % 7;
  return addDaysUtc(d, -back);
}

const fmtShort = (d: Date) => `${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;

export const weeklyPlanner: ProductTypeDefinition<WeekP, WeekC> = {
  id: 'weekly-planner',
  name: 'Weekly planner',
  family: 'printable',
  category: 'Calendars & Planners',
  description: 'Dated week-per-page planner with daily boxes, priorities and a weekly focus.',
  paramsSchema: WeekParams,
  contentSchema: WeekContent,
  defaultParams: (now) => WeekParams.parse({ startDate: `${now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()}-01-01` }),
  defaultTitle: (ctx) => `${parseYmd(ctx.params.startDate).getUTCFullYear()} Weekly Planner`,
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'paper', 'weekStart', 'audience'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write content for a dated weekly planner titled "${ctx.title}" starting the week of ${ymd(alignedStart(ctx.params))} and covering ${ctx.params.weeks} weeks.
Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
Return coverSubtitle (one short line) and weeklyFocus: exactly ${ctx.params.weeks} distinct short weekly focus lines (max 70 characters), in order, matched to the time of year.${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx, rand) => {
    const pool = shuffle(rand, [...WEEKLY_FOCUS_PROMPTS, ...DAILY_FOCUS_PROMPTS]);
    return { coverSubtitle: 'One week at a time', weeklyFocus: Array.from({ length: ctx.params.weeks }, (_, i) => pool[i % pool.length]) };
  },
  render(ctx, content) {
    const start = alignedStart(ctx.params);
    const pages = [];
    if (ctx.params.cover) pages.push(coverPage(ctx, ctx.title, content.coverSubtitle, html`<div class="big">${start.getUTCFullYear()}</div>`));
    for (let w = 0; w < ctx.params.weeks; w++) {
      const ws = addDaysUtc(start, w * 7);
      const we = addDaysUtc(ws, 6);
      const days = Array.from({ length: 7 }, (_, i) => addDaysUtc(ws, i));
      const dayBox = (d: Date) => html`<div class="box grow" data-date="${ymd(d)}"><div class="row" style="gap:2mm;align-items:baseline"><span class="h3">${WEEKDAY_NAMES[d.getUTCDay()]}</span><span class="small">${fmtShort(d)}</span></div>${lines(3)}</div>`;
      pages.push(page(html`${header(`Week of ${fmtShort(ws)} – ${fmtShort(we)}, ${we.getUTCFullYear()}`, content.weeklyFocus[w] ?? '', ornament(ctx.tokens))}
        <div class="row fill"><div class="col grow">${days.slice(0, 4).map(dayBox)}</div><div class="col grow">${days.slice(4).map(dayBox)}<div class="box grow soft"><div class="label">Top priorities</div>${checklist([], 4)}</div></div></div>${stdFooter(ctx, `Week ${w + 1}`)}`));
    }
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.weeks + (ctx.params.cover ? 1 : 0),
  consistencyChecks(ctx, content) {
    const start = alignedStart(ctx.params);
    const ok = start.getUTCDay() === ctx.params.weekStart;
    return [
      { code: 'week_alignment', severity: 'hard', passed: ok, message: ok ? `Weeks start on ${WEEKDAY_NAMES[ctx.params.weekStart]}` : 'Week start day misaligned' },
      { code: 'content_count', severity: 'hard', passed: content.weeklyFocus.length === ctx.params.weeks, message: `Weekly focus lines: ${content.weeklyFocus.length} for ${ctx.params.weeks} weeks` },
    ];
  },
  qaText: (c) => [c.coverSubtitle, ...c.weeklyFocus],
  listingHints: (ctx) => baseHints(ctx, ['weekly planner', 'dated planner', 'week on one page', 'agenda'],
    [`${ctx.params.weeks} dated weekly spreads`, `Weeks start on ${WEEKDAY_NAMES[ctx.params.weekStart]}`, 'Top priorities box every week', 'Weekly focus prompt'], [`1 PDF (${ctx.params.weeks + (ctx.params.cover ? 1 : 0)} pages)`], PRINT_USAGE),
};

// ---------------------------------------------------------------- daily planner

const DayParams = z.object({
  dated: z.boolean().default(false),
  startDate: ymdString.optional(),
  days: z.number().int().min(1).max(92).default(1),
  startHour: z.number().int().min(4).max(12).default(6),
  endHour: z.number().int().min(14).max(24).default(21),
  hour12: z.boolean().default(true),
  priorities: z.number().int().min(1).max(5).default(3),
});
type DayP = z.infer<typeof DayParams>;
const DayContent = z.object({
  coverSubtitle: z.string().min(3).max(90),
  focusPrompts: z.array(z.string().min(3).max(80)).min(1).max(92),
  sectionTitles: z.object({ priorities: z.string().min(2).max(30), todo: z.string().min(2).max(30), notes: z.string().min(2).max(30), wins: z.string().min(2).max(30) }),
});
type DayC = z.infer<typeof DayContent>;

export const dailyPlanner: ProductTypeDefinition<DayP, DayC> = {
  id: 'daily-planner',
  name: 'Daily planner',
  family: 'printable',
  category: 'Productivity',
  description: 'Time-blocked daily planner pages, dated or undated.',
  paramsSchema: DayParams,
  contentSchema: DayContent,
  defaultParams: () => DayParams.parse({}),
  defaultTitle: (ctx) => (ctx.params.dated ? 'Dated Daily Planner' : 'Undated Daily Planner Page'),
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'paper', 'audience', 'hours'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write content for a printable daily planner titled "${ctx.title}" with ${ctx.params.days} page(s).
Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
Return coverSubtitle, focusPrompts (exactly ${ctx.params.days} distinct one-line daily focus questions, max 70 characters), and sectionTitles with short labels (max 24 characters) for: priorities, todo, notes, wins — worded for this audience.${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx, rand) => {
    const pool = shuffle(rand, DAILY_FOCUS_PROMPTS);
    return {
      coverSubtitle: 'Make today count',
      focusPrompts: Array.from({ length: ctx.params.days }, (_, i) => pool[i % pool.length]),
      sectionTitles: { priorities: 'Top priorities', todo: 'To do', notes: 'Notes', wins: "Today's wins" },
    };
  },
  render(ctx, content) {
    const p = ctx.params;
    const start = p.startDate ? parseYmd(p.startDate) : null;
    const pages = Array.from({ length: p.days }, (_, i) => {
      const d = p.dated && start ? addDaysUtc(start, i) : null;
      const title = d ? `${WEEKDAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}` : 'Daily Plan';
      const right = d ? html`<span class="pill">${d.getUTCFullYear()}</span>` : html`<span class="small">Date ________________</span>`;
      return page(html`${header(title, content.focusPrompts[i] ?? '', right)}
        <div class="row fill">
          <div class="col" style="width:46%;flex:none"><div class="label">Schedule</div>${timeBlocks(p.startHour, p.endHour, p.endHour - p.startHour > 12 ? 60 : 30, p.hour12)}</div>
          <div class="col grow">
            <div class="box soft" style="flex:none"><div class="label">${content.sectionTitles.priorities}</div><div style="height:${p.priorities * 7}mm;display:flex">${checklist([], p.priorities)}</div></div>
            <div class="box grow"><div class="label">${content.sectionTitles.todo}</div>${checklist([], 10)}</div>
            <div class="box" style="height:30mm;flex:none"><div class="label">${content.sectionTitles.notes}</div>${lines(3)}</div>
            <div class="box" style="height:22mm;flex:none"><div class="label">${content.sectionTitles.wins}</div>${lines(2)}</div>
          </div>
        </div>${stdFooter(ctx, p.days > 1 ? `Page ${i + 1}` : '')}`);
    });
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.days,
  consistencyChecks(ctx, content) {
    const datedOk = !ctx.params.dated || !!ctx.params.startDate;
    return [
      { code: 'dated_requires_start', severity: 'hard', passed: datedOk, message: datedOk ? 'Date settings consistent' : 'Dated planner has no start date' },
      { code: 'content_count', severity: 'hard', passed: content.focusPrompts.length >= ctx.params.days, message: `Focus prompts: ${content.focusPrompts.length} for ${ctx.params.days} days` },
      { code: 'hours', severity: 'hard', passed: ctx.params.endHour > ctx.params.startHour + 4, message: `Schedule ${ctx.params.startHour}:00–${ctx.params.endHour}:00` },
    ];
  },
  qaText: (c) => [c.coverSubtitle, ...c.focusPrompts, ...Object.values(c.sectionTitles)],
  listingHints: (ctx) => baseHints(ctx, ['daily planner', 'time blocking', 'to do list', 'daily schedule'],
    [`Hourly schedule ${ctx.params.startHour}:00 to ${ctx.params.endHour}:00`, `${ctx.params.priorities} top-priority slots`, 'To-do, notes and daily wins sections', ctx.params.dated ? 'Dated pages' : 'Undated — reuse every day'], [`1 PDF (${ctx.params.days} page${ctx.params.days > 1 ? 's' : ''})`], PRINT_USAGE),
};

export function _testVerifyMonth(year: number, month0: number, weekStart: 0 | 1): string | null {
  return verifyMonthCells(year, month0, weekStart);
}

export type { TypeContext };
