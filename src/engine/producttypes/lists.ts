import { z } from 'zod';
import { html, type SafeHtml } from '../rendering/html.ts';
import { page, header, lines, box, checklist, habitGrid, table, chunk, space, ornament } from '../rendering/components.ts';
import { MONTH_NAMES, daysInMonth } from '../../core/time.ts';
import { HABITS, habitKey, CHECKLISTS, CLEANING, INVENTORY_ROOMS, INVENTORY_COLUMNS, JOURNAL_PROMPTS, GOAL_SECTIONS } from './library.ts';
import { AI_SYSTEM_BASE, audienceLine, themeLine, revisionClause, shuffle, type ProductTypeDefinition, type QaFinding, type TypeContext } from './types.ts';
import { coverPage, stdFooter, baseHints, PRINT_USAGE, audienceSuffix } from './common.ts';
import { toCsv, newWorkbook, styleHeader, argb, workbookBuffer, sheetName } from './sheets.ts';

function dupes(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const k = i.trim().toLowerCase();
    if (seen.has(k)) out.push(i);
    seen.add(k);
  }
  return out;
}

function countCheck(code: string, actual: number, min: number, max: number, what: string): QaFinding {
  return { code, severity: 'hard', passed: actual >= min && actual <= max, message: `${what}: ${actual} (allowed ${min}-${max})` };
}

// ---------------------------------------------------------------- habit tracker

const HabitParams = z.object({
  year: z.number().int().min(2020).max(2100),
  startMonth: z.number().int().min(1).max(12).default(1),
  months: z.number().int().min(1).max(12).default(12),
  rows: z.number().int().min(6).max(20).default(14),
});
type HabitP = z.infer<typeof HabitParams>;
const HabitContent = z.object({
  coverSubtitle: z.string().min(3).max(90),
  habits: z.array(z.string().min(3).max(40)).min(5).max(20),
  reflectionPrompt: z.string().min(5).max(90),
});
type HabitC = z.infer<typeof HabitContent>;

export const habitTracker: ProductTypeDefinition<HabitP, HabitC> = {
  id: 'habit-tracker',
  name: 'Habit tracker',
  family: 'printable',
  category: 'Productivity',
  description: 'Monthly habit grids with suggested habits and a reflection box.',
  paramsSchema: HabitParams,
  contentSchema: HabitContent,
  defaultParams: (now) => HabitParams.parse({ year: now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear() }),
  defaultTitle: (ctx) => `${ctx.params.year} Habit Tracker${audienceSuffix(ctx)}`,
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'audience', 'paper'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write content for a monthly habit tracker titled "${ctx.title}".
Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
Return coverSubtitle, habits (between 8 and ${Math.min(ctx.params.rows, 14)} distinct, specific, measurable daily habits, each under 36 characters, realistic and healthy for this audience; no medical claims), and reflectionPrompt (one end-of-month question).${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx, rand) => {
    const pool = HABITS[habitKey(ctx.audience?.name)];
    return { coverSubtitle: 'Small steps, every day', habits: shuffle(rand, pool).slice(0, Math.min(ctx.params.rows - 2, pool.length, 12)), reflectionPrompt: 'Which habit felt easiest this month, and why?' };
  },
  render(ctx, content) {
    const sp = space(ctx.paper, ctx.tokens, 62);
    const minRowMm = ctx.tokens.baseSizePt * 0.82 * 0.3528 * 1.05 * 2 + 1.2;
    const fit = Math.max(content.habits.length, Math.floor((sp.bodyHeightMm - 6) / minRowMm));
    const shown = Math.min(ctx.params.rows, fit);
    const blanks = Math.max(0, shown - content.habits.length);
    const rowMm = Math.max(minRowMm, Math.min(12, (sp.bodyHeightMm - 6) / Math.max(shown, content.habits.length)));
    const nameW = Math.min(40, 28 * Math.max(1, ctx.tokens.baseSizePt / 10));
    const pages = [];
    for (let i = 0; i < ctx.params.months; i++) {
      const m0 = (ctx.params.startMonth - 1 + i) % 12;
      const y = ctx.params.year + Math.floor((ctx.params.startMonth - 1 + i) / 12);
      pages.push(page(html`${header(`${MONTH_NAMES[m0]} ${y}`, 'Habit tracker — shade a box each day you complete the habit', ornament(ctx.tokens))}
        ${habitGrid(content.habits, daysInMonth(y, m0), blanks, rowMm, nameW, sp.widthMm)}
        <div class="box fill"><div class="label">${content.reflectionPrompt}</div>${lines(4)}</div>${stdFooter(ctx, ctx.title)}`));
    }
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.months,
  consistencyChecks: (ctx, c) => [
    countCheck('habit_count', c.habits.length, 5, ctx.params.rows, 'Habits'),
    { code: 'duplicate_items', severity: 'warning', passed: dupes(c.habits).length === 0, message: dupes(c.habits).length ? `Duplicate habits: ${dupes(c.habits).join(', ')}` : 'No duplicate habits' },
  ],
  qaText: (c) => [c.coverSubtitle, ...c.habits, c.reflectionPrompt],
  listingHints: (ctx, c) => baseHints(ctx, ['habit tracker', 'monthly habit tracker', 'routine tracker', 'self care tracker'],
    [`${ctx.params.months} monthly tracking pages`, `${c.habits.length} suggested habits plus blank rows for your own`, 'Monthly reflection box'], [`1 PDF (${ctx.params.months} pages)`], PRINT_USAGE),
};

// ---------------------------------------------------------------- to-do / checklist

const TodoParams = z.object({
  topic: z.string().min(3).max(60).default('weekly to-do'),
  blankRowsPerSection: z.number().int().min(0).max(10).default(2),
});
type TodoP = z.infer<typeof TodoParams>;
const TodoContent = z.object({
  intro: z.string().min(3).max(140),
  sections: z.array(z.object({ title: z.string().min(2).max(40), items: z.array(z.string().min(2).max(60)).max(14) })).min(2).max(10),
});
type TodoC = z.infer<typeof TodoContent>;

function paginateSections(ctx: TypeContext<TodoP>, c: TodoC): { title: string; items: string[]; blanks: number }[][] {
  const sp = space(ctx.paper, ctx.tokens, 34);
  const perPage = Math.max(8, Math.floor(sp.bodyHeightMm / (sp.rowMm + 1.2)));
  const pages: { title: string; items: string[]; blanks: number }[][] = [[]];
  let used = 0;
  for (const s of c.sections) {
    const rows = s.items.length + ctx.params.blankRowsPerSection;
    const cost = rows + 2;
    if (used + cost > perPage && pages[pages.length - 1].length) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push({ title: s.title, items: s.items, blanks: ctx.params.blankRowsPerSection });
    used += cost;
  }
  return pages;
}

export const todoChecklist: ProductTypeDefinition<TodoP, TodoC> = {
  id: 'todo-checklist',
  name: 'To-do / checklist',
  family: 'printable',
  category: 'Productivity',
  description: 'Topic checklists (moving, travel, events) or blank weekly to-do lists.',
  paramsSchema: TodoParams,
  contentSchema: TodoContent,
  defaultParams: () => TodoParams.parse({}),
  defaultTitle: (ctx) => `${ctx.params.topic.replace(/\b\w/g, (m) => m.toUpperCase())} Checklist`,
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'topic', 'paper'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write a practical printable checklist titled "${ctx.title}" on the topic "${ctx.params.topic}".
Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
Return intro (one sentence) and sections: 3 to 6 sections in a logical order (for example by time before an event or by area), each with 4 to 9 concrete, actionable items under 55 characters. Do not repeat items.${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx) => {
    const key = Object.keys(CHECKLISTS).find((k) => ctx.params.topic.toLowerCase().includes(k));
    if (key) return { intro: `Everything for ${key}, in order. Tick items off as you go.`, sections: CHECKLISTS[key].map((s) => ({ title: s.section, items: s.items })) };
    return { intro: 'Write your tasks in each section and tick them off as you go.', sections: [{ title: 'Must do', items: [] }, { title: 'Should do', items: [] }, { title: 'Calls and messages', items: [] }, { title: 'Errands', items: [] }] };
  },
  render(ctx, content) {
    const groups = paginateSections(ctx, content);
    const blank = content.sections.every((s) => s.items.length === 0);
    return {
      pages: groups.map((g, pi) => page(html`${header(ctx.title, pi === 0 ? content.intro : `${ctx.title} (continued)`, ornament(ctx.tokens))}
        <div class="col fill">${g.map((s) => html`<div class="col" style="gap:1mm;flex:${s.items.length + s.blanks + (blank ? 4 : 0)} 1 0;min-height:0"><div class="h3">${s.title}</div>${checklist(s.items.map((t) => ({ text: t })), s.blanks + (blank ? 4 : 0))}</div>`)}</div>
        ${stdFooter(ctx, groups.length > 1 ? `Page ${pi + 1} of ${groups.length}` : '')}`)),
    };
  },
  expectedPageCount: (ctx, c) => paginateSections(ctx, c).length,
  consistencyChecks: (_ctx, c) => {
    const all = c.sections.flatMap((s) => s.items);
    return [{ code: 'duplicate_items', severity: 'warning', passed: dupes(all).length === 0, message: dupes(all).length ? `Repeated items: ${dupes(all).slice(0, 5).join(', ')}` : 'No repeated items' }];
  },
  qaText: (c) => [c.intro, ...c.sections.flatMap((s) => [s.title, ...s.items])],
  listingHints: (ctx, c) => baseHints(ctx, [`${ctx.params.topic} checklist`, 'checklist printable', 'to do list', 'planner insert'],
    [`${c.sections.length} organized sections`, `${c.sections.reduce((a, s) => a + s.items.length, 0)} ready-made items plus blank lines`, 'Tick-box layout'], ['1 PDF'], PRINT_USAGE),
};

// ---------------------------------------------------------------- cleaning schedule

const CleanParams = z.object({ rooms: z.array(z.string().min(2).max(30)).min(3).max(10).optional() });
type CleanP = z.infer<typeof CleanParams>;
const Freq = z.enum(['Daily', 'Weekly', 'Monthly', 'Seasonal']);
const CleanContent = z.object({
  intro: z.string().min(3).max(140),
  rooms: z.array(z.object({ room: z.string().min(2).max(30), tasks: z.array(z.object({ task: z.string().min(3).max(45), freq: Freq })).min(2).max(8) })).min(3).max(10),
});
type CleanC = z.infer<typeof CleanContent>;

function tasksBy(c: CleanC, f: z.infer<typeof Freq>) {
  return c.rooms.flatMap((r) => r.tasks.filter((t) => t.freq === f).map((t) => ({ room: r.room, task: t.task })));
}

export const cleaningSchedule: ProductTypeDefinition<CleanP, CleanC> = {
  id: 'cleaning-schedule',
  name: 'Cleaning schedule',
  family: 'printable',
  category: 'Home Organization',
  description: 'Daily, weekly, monthly and seasonal cleaning checklists by room.',
  paramsSchema: CleanParams,
  contentSchema: CleanContent,
  defaultParams: () => CleanParams.parse({}),
  defaultTitle: (ctx) => `${ctx.theme && ctx.theme.name !== 'Minimalist' ? ctx.theme.name + ' ' : ''}Cleaning Schedule`,
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'audience', 'paper'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write a home cleaning schedule titled "${ctx.title}".
Audience: ${audienceLine(ctx)}.
Rooms: ${(ctx.params.rooms ?? CLEANING.map((r) => r.room)).join(', ')}.
Return intro (one encouraging sentence) and rooms: for each room 4 to 6 tasks (under 42 characters), each with freq one of Daily, Weekly, Monthly, Seasonal. Keep the total Daily tasks at 8 or fewer so the routine is realistic. Do not recommend mixing cleaning chemicals.${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx) => {
    const wanted = ctx.params.rooms?.map((r) => r.toLowerCase());
    const rooms = CLEANING.filter((r) => !wanted || wanted.includes(r.room.toLowerCase()));
    return { intro: 'A little every day keeps the whole home under control.', rooms: (rooms.length >= 3 ? rooms : CLEANING).map((r) => ({ room: r.room, tasks: r.tasks })) };
  },
  render(ctx, content) {
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const daily = tasksBy(content, 'Daily');
    const weekly = tasksBy(content, 'Weekly');
    const monthly = tasksBy(content, 'Monthly');
    const seasonal = tasksBy(content, 'Seasonal');
    const sp = space(ctx.paper, ctx.tokens, 40);
    const grid = (rows: { room: string; task: string }[], cols: string[], title: string, sub: string, nameW: number) => {
      const rowMm = Math.min(12, sp.bodyHeightMm / Math.max(rows.length + 3, 10));
      return page(html`${header(title, sub, ornament(ctx.tokens))}${table([{ label: 'Task', widthPct: nameW }, { label: 'Room', widthPct: 18 }, ...cols.map((c) => ({ label: c, widthPct: (100 - nameW - 18) / cols.length }))], rows.map((r) => [r.task, r.room]), 2, rowMm)}${stdFooter(ctx, ctx.title)}`);
    };
    return {
      pages: [
        grid(daily, days, 'Daily routine', content.intro, 42),
        grid(weekly, ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5'], 'Weekly tasks', 'Tick each week as you finish', 42),
        grid([...monthly, ...seasonal.map((s) => ({ room: s.room, task: `${s.task} (seasonal)` }))], ['Q1', 'Q2', 'Q3', 'Q4'], 'Monthly and seasonal', 'Monthly tasks once a month; seasonal tasks once a quarter', 50),
      ],
    };
  },
  expectedPageCount: () => 3,
  consistencyChecks: (_ctx, c) => {
    const daily = tasksBy(c, 'Daily').length;
    return [
      { code: 'routine_realistic', severity: 'warning', passed: daily <= 10, message: `${daily} daily tasks` },
      { code: 'frequencies_present', severity: 'hard', passed: ['Daily', 'Weekly'].every((f) => tasksBy(c, f as 'Daily').length > 0), message: 'Daily and weekly tasks present' },
    ];
  },
  qaText: (c) => [c.intro, ...c.rooms.flatMap((r) => [r.room, ...r.tasks.map((t) => t.task)])],
  listingHints: (ctx, c) => baseHints(ctx, ['cleaning schedule', 'cleaning checklist', 'chore chart', 'home organization'],
    ['Daily routine with weekday tick boxes', 'Weekly tasks for five weeks', 'Monthly and seasonal deep-clean list', `${c.rooms.length} rooms covered`], ['1 PDF (3 pages)'], PRINT_USAGE),
};

// ---------------------------------------------------------------- home inventory

const InvParams = z.object({ rooms: z.array(z.string().min(2).max(30)).min(2).max(12).optional(), rowsPerRoom: z.number().int().min(8).max(30).default(16) });
type InvP = z.infer<typeof InvParams>;
const InvContent = z.object({
  intro: z.string().min(10).max(300),
  rooms: z.array(z.string().min(2).max(30)).min(2).max(12),
  tips: z.array(z.string().min(5).max(110)).min(2).max(6),
});
type InvC = z.infer<typeof InvContent>;

export const homeInventory: ProductTypeDefinition<InvP, InvC> = {
  id: 'home-inventory',
  name: 'Home inventory',
  family: 'structured',
  category: 'Home Organization',
  description: 'Room-by-room inventory sheets with matching CSV and XLSX workbook.',
  paramsSchema: InvParams,
  contentSchema: InvContent,
  defaultParams: () => InvParams.parse({}),
  defaultTitle: () => 'Home Inventory Log',
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'paper'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write supporting text for a printable home inventory log titled "${ctx.title}".
Rooms to include: ${(ctx.params.rooms ?? INVENTORY_ROOMS).join(', ')}.
Return intro (2 sentences explaining why to keep a home inventory, without legal or insurance guarantees), rooms (the room list, cleaned up, same order), and tips (3 to 5 short practical tips for recording items, e.g. photos, receipts, serial numbers).${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx) => ({
    intro: 'A home inventory makes it easier to track what you own, plan replacements and gather details quickly if something is lost or damaged. Fill in one room at a time.',
    rooms: ctx.params.rooms ?? INVENTORY_ROOMS,
    tips: ['Photograph each item and note where the photo is saved.', 'Keep receipts and warranty cards in one folder.', 'Record serial numbers for electronics and appliances.', 'Review and update the list once a year.'],
  }),
  async render(ctx, content) {
    const cols = INVENTORY_COLUMNS.map((label, i) => ({ label, widthPct: [18, 11, 14, 12, 12, 9, 11, 13][i] }));
    const sp = space(ctx.paper, ctx.tokens, 32);
    const rowMm = Math.max(6, (sp.bodyHeightMm - 8) / (ctx.params.rowsPerRoom + 1));
    const pages: SafeHtml[] = [page(html`${header(ctx.title, 'Keep a record of what you own', ornament(ctx.tokens))}
      <div class="box soft"><div>${content.intro}</div></div>
      <div class="box"><div class="label">Tips</div>${content.tips.map((t) => html`<div class="row" style="gap:2mm;align-items:center"><span class="dot"></span><span>${t}</span></div>`)}</div>
      <div class="box fill"><div class="label">Rooms in this log</div>${checklist(content.rooms.map((r) => ({ text: r })), 0)}</div>${stdFooter(ctx, ctx.title)}`)];
    for (const room of content.rooms) {
      pages.push(page(html`${header(room, 'Home inventory', ornament(ctx.tokens))}${table(cols, [], ctx.params.rowsPerRoom, rowMm)}${stdFooter(ctx, ctx.title)}`));
    }
    const csv = toCsv([INVENTORY_COLUMNS, ...content.rooms.map((r) => ['', r, '', '', '', '', '', ''])]);
    const wb = newWorkbook(ctx.title, ctx.shopName);
    const primary = argb(ctx.tokens.palette.primary);
    for (const room of content.rooms) {
      const ws = wb.addWorksheet(sheetName(room));
      ws.columns = INVENTORY_COLUMNS.map((h, i) => ({ header: h, key: `c${i}`, width: [28, 16, 22, 18, 14, 12, 14, 30][i] }));
      styleHeader(ws.getRow(1), primary);
      ws.getColumn(6).numFmt = '#,##0.00';
      ws.getColumn(5).numFmt = 'yyyy-mm-dd';
      for (let r = 2; r <= ctx.params.rowsPerRoom + 1; r++) ws.getCell(r, 2).value = room;
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }
    const sum = wb.addWorksheet('Summary');
    sum.columns = [{ header: 'Room', key: 'room', width: 28 }, { header: 'Items listed', key: 'n', width: 14 }, { header: 'Total value', key: 'v', width: 16 }];
    styleHeader(sum.getRow(1), primary);
    content.rooms.forEach((room, i) => {
      const ref = `'${sheetName(room).replace(/'/g, "''")}'`;
      sum.getCell(i + 2, 1).value = room;
      sum.getCell(i + 2, 2).value = { formula: `COUNTA(${ref}!A2:A${ctx.params.rowsPerRoom + 1})` };
      sum.getCell(i + 2, 3).value = { formula: `SUM(${ref}!F2:F${ctx.params.rowsPerRoom + 1})` };
      sum.getCell(i + 2, 3).numFmt = '#,##0.00';
    });
    const totalRow = content.rooms.length + 2;
    sum.getCell(totalRow, 1).value = 'Total';
    sum.getCell(totalRow, 1).font = { bold: true };
    sum.getCell(totalRow, 2).value = { formula: `SUM(B2:B${totalRow - 1})` };
    sum.getCell(totalRow, 3).value = { formula: `SUM(C2:C${totalRow - 1})` };
    sum.getCell(totalRow, 3).numFmt = '#,##0.00';
    return {
      pages,
      extraFiles: [
        { fileName: 'home-inventory.csv', kind: 'csv', mime: 'text/csv', data: csv, role: 'deliverable' },
        { fileName: 'home-inventory.xlsx', kind: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: await workbookBuffer(wb), role: 'deliverable' },
      ],
    };
  },
  expectedPageCount: (_ctx, c) => 1 + c.rooms.length,
  consistencyChecks: (_ctx, c) => [{ code: 'duplicate_items', severity: 'hard', passed: dupes(c.rooms).length === 0, message: dupes(c.rooms).length ? `Duplicate rooms: ${dupes(c.rooms).join(', ')}` : 'Room names unique' }],
  qaText: (c) => [c.intro, ...c.rooms, ...c.tips],
  listingHints: (ctx, c) => baseHints(ctx, ['home inventory', 'household inventory', 'inventory spreadsheet', 'moving inventory'],
    [`${c.rooms.length} room sheets`, 'Excel/Sheets workbook with automatic totals', 'CSV for any spreadsheet app'], [`1 PDF (${1 + c.rooms.length} pages)`, '1 XLSX workbook', '1 CSV file'], `${PRINT_USAGE} Open the XLSX in Excel, Numbers or Google Sheets; totals update automatically.`),
};

// ---------------------------------------------------------------- guided journal

const JournalParams = z.object({
  pages: z.number().int().min(5).max(120).default(30),
  promptsPerPage: z.union([z.literal(1), z.literal(2)]).default(1),
  focus: z.enum(['gratitude', 'reflection', 'goals', 'selfcare', 'creativity', 'mixed']).default('mixed'),
  cover: z.boolean().default(true),
});
type JournalP = z.infer<typeof JournalParams>;
const JournalContent = z.object({
  coverSubtitle: z.string().min(3).max(90),
  prompts: z.array(z.string().min(8).max(140)).min(1).max(240),
});
type JournalC = z.infer<typeof JournalContent>;

export const guidedJournal: ProductTypeDefinition<JournalP, JournalC> = {
  id: 'guided-journal',
  name: 'Guided journal',
  family: 'printable',
  category: 'Journals & Worksheets',
  description: 'Prompted journal pages with writing lines.',
  paramsSchema: JournalParams,
  contentSchema: JournalContent,
  defaultParams: () => JournalParams.parse({}),
  defaultTitle: (ctx) => `${ctx.params.focus === 'mixed' ? 'Guided' : ctx.params.focus === 'selfcare' ? 'Self-Care' : ctx.params.focus[0].toUpperCase() + ctx.params.focus.slice(1)} Journal`,
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'focus', 'audience'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write original journal prompts for a printable journal titled "${ctx.title}" with focus "${ctx.params.focus}".
Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
Return coverSubtitle and prompts: exactly ${ctx.params.pages * ctx.params.promptsPerPage} distinct open-ended prompts (each under 120 characters), varied in depth, no two asking the same thing, nothing that requires professional mental-health support.${revisionClause(ctx)}`,
    maxTokens: 16000,
  }),
  deterministicContent: (ctx, rand) => {
    const pool = ctx.params.focus === 'mixed' ? Object.values(JOURNAL_PROMPTS).flat() : JOURNAL_PROMPTS[ctx.params.focus];
    const needed = ctx.params.pages * ctx.params.promptsPerPage;
    return { coverSubtitle: 'A few minutes a day for your thoughts', prompts: shuffle(rand, pool).slice(0, Math.min(needed, pool.length)) };
  },
  render(ctx, content) {
    const pages: SafeHtml[] = [];
    if (ctx.params.cover) pages.push(coverPage(ctx, ctx.title, content.coverSubtitle));
    const per = ctx.params.promptsPerPage;
    for (let i = 0; i < ctx.params.pages; i++) {
      const ps = content.prompts.slice(i * per, i * per + per);
      const body = ps.length
        ? ps.map((p) => html`<div class="col fill" style="gap:2mm"><div class="h2 prompt" style="font-size:calc(var(--base)*1.25)">${p}</div>${lines(per === 1 ? 18 : 8)}</div>`)
        : [html`<div class="col fill" style="gap:2mm"><div class="h2 prompt" style="font-size:calc(var(--base)*1.25)">Free page</div>${lines(20)}</div>`];
      pages.push(page(html`<div class="row" style="justify-content:space-between;align-items:center;flex:none"><span class="label">Date ______________</span>${ornament(ctx.tokens)}</div>${body}${stdFooter(ctx, `${i + 1}`)}`));
    }
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.pages + (ctx.params.cover ? 1 : 0),
  consistencyChecks: (ctx, c) => {
    const needed = ctx.params.pages * ctx.params.promptsPerPage;
    return [
      { code: 'duplicate_items', severity: 'hard', passed: dupes(c.prompts).length === 0, message: dupes(c.prompts).length ? `${dupes(c.prompts).length} repeated prompts` : 'All prompts unique' },
      { code: 'content_count', severity: 'warning', passed: c.prompts.length >= needed, message: c.prompts.length >= needed ? `${c.prompts.length} prompts for ${needed} slots` : `Only ${c.prompts.length} unique prompts for ${needed} slots; remaining pages are free-writing pages` },
    ];
  },
  qaText: (c) => [c.coverSubtitle, ...c.prompts],
  listingHints: (ctx, c) => baseHints(ctx, ['guided journal', 'journal prompts', `${ctx.params.focus} journal`, 'printable journal'],
    [`${Math.min(c.prompts.length, ctx.params.pages * ctx.params.promptsPerPage)} original prompts`, `${ctx.params.pages} lined pages`, 'Date line on every page'], [`1 PDF (${ctx.params.pages + (ctx.params.cover ? 1 : 0)} pages)`], PRINT_USAGE),
};

// ---------------------------------------------------------------- goal planner

const GoalParams = z.object({ goals: z.number().int().min(1).max(12).default(4) });
type GoalP = z.infer<typeof GoalParams>;
const GoalContent = z.object({
  coverSubtitle: z.string().min(3).max(90),
  sections: z.array(z.object({ label: z.string().min(3).max(40), prompt: z.string().min(5).max(100) })).length(6),
  reviewQuestions: z.array(z.string().min(8).max(110)).min(3).max(6),
});
type GoalC = z.infer<typeof GoalContent>;

export const goalPlanner: ProductTypeDefinition<GoalP, GoalC> = {
  id: 'goal-planner',
  name: 'Goal planner',
  family: 'printable',
  category: 'Productivity',
  description: 'Goal overview, one worksheet per goal and a quarterly review.',
  paramsSchema: GoalParams,
  contentSchema: GoalContent,
  defaultParams: () => GoalParams.parse({}),
  defaultTitle: () => 'Goal Setting Planner',
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'audience'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write content for a goal-setting planner titled "${ctx.title}". Audience: ${audienceLine(ctx)}.
Return coverSubtitle; sections: exactly 6 worksheet sections in this order — why the goal matters, how it is measured, milestones, obstacles and plans, weekly actions, reward — each with a short label and a one-line guiding prompt; and reviewQuestions: 4 or 5 quarterly review questions.${revisionClause(ctx)}`,
  }),
  deterministicContent: () => ({
    coverSubtitle: 'Turn big ideas into weekly steps',
    sections: GOAL_SECTIONS.map((s) => ({ label: s.label, prompt: s.prompt })),
    reviewQuestions: ['What progress am I proudest of this quarter?', 'Which goal needs a new plan, and what will change?', 'What took more time than expected?', 'What will I focus on next quarter?'],
  }),
  render(ctx, content) {
    const pages: SafeHtml[] = [];
    pages.push(page(html`${header('Goals at a glance', content.coverSubtitle, ornament(ctx.tokens))}<div class="col fill">${Array.from({ length: ctx.params.goals }, (_, i) => html`<div class="box grow"><div class="label">Goal ${i + 1}</div>${lines(2)}<div class="row small" style="gap:6mm"><span>Target date ____________</span><span class="row" style="gap:1.5mm;align-items:center">Progress ${Array.from({ length: 5 }, () => html`<span class="cb" style="border-radius:50%"></span>`)}</span></div></div>`)}</div>${stdFooter(ctx, ctx.title)}`));
    for (let g = 0; g < ctx.params.goals; g++) {
      pages.push(page(html`${header(`Goal ${g + 1}`, 'My goal: ___________________________________________', ornament(ctx.tokens))}
        <div class="row fill"><div class="col grow">${content.sections.slice(0, 3).map((s) => html`<div class="box grow"><div class="label">${s.label}</div><div class="small">${s.prompt}</div>${lines(4)}</div>`)}</div>
        <div class="col grow">${content.sections.slice(3).map((s) => html`<div class="box grow"><div class="label">${s.label}</div><div class="small">${s.prompt}</div>${lines(4)}</div>`)}</div></div>${stdFooter(ctx, ctx.title)}`));
    }
    pages.push(page(html`${header('Quarterly review', 'Look back, then adjust', ornament(ctx.tokens))}<div class="col fill">${content.reviewQuestions.map((q) => html`<div class="box grow"><div class="label">${q}</div>${lines(3)}</div>`)}</div>${stdFooter(ctx, ctx.title)}`));
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.goals + 2,
  consistencyChecks: (_ctx, c) => [countCheck('section_count', c.sections.length, 6, 6, 'Worksheet sections')],
  qaText: (c) => [c.coverSubtitle, ...c.sections.flatMap((s) => [s.label, s.prompt]), ...c.reviewQuestions],
  listingHints: (ctx) => baseHints(ctx, ['goal planner', 'goal setting worksheet', 'new year goals', 'vision planner'],
    ['Goals-at-a-glance overview', `${ctx.params.goals} goal worksheets with milestones and weekly actions`, 'Quarterly review page'], [`1 PDF (${ctx.params.goals + 2} pages)`], PRINT_USAGE),
};
