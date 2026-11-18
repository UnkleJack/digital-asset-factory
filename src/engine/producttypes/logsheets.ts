import { z } from 'zod';
import { html, type SafeHtml } from '../rendering/html.ts';
import { page, header, table, space, ornament, labelLine } from '../rendering/components.ts';
import { AI_SYSTEM_BASE, audienceLine, themeLine, revisionClause, type ProductTypeDefinition, type QaFinding, type TypeContext } from './types.ts';
import { coverPage, stdFooter, baseHints, PRINT_USAGE, audienceSuffix } from './common.ts';
import { toCsv, newWorkbook, styleHeader, argb, workbookBuffer, sheetName } from './sheets.ts';

/*
 * The log-sheet generator (catalog expansion, owner 2026-11-18): one drawing engine behind many product types.
 * A definition says what the sheet is (title, columns, optional fixed row labels and fill-in fields); the engine
 * fits as many writable rows as the paper and design allow, adds a cover and a matching XLSX and CSV, and runs
 * the same QA as every other printable. Each definition is registered as its own product type, so it has its own
 * id, category, price, preset and listing words.
 *
 * Offline the built-in words in the definition are used; with an AI key the AI only rewrites the cover line, the
 * intro and the tips. The columns and row labels are the definition's and never change, so what the owner picked
 * is what prints.
 */

export interface SheetColumn {
  label: string;
  /** Relative width; the engine turns the widths into percentages. */
  width: number;
}

export interface LogSheetDef {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Default product title. */
  title: string;
  /** Short heading printed on every log page. */
  heading: string;
  columns: SheetColumn[];
  /** Labels printed down the first column of every page (days, months, categories). Blank rows follow them. */
  rowLabels?: string[];
  /** Small fill-in lines above the table on every page (e.g. "Month", "Goal"). At most 3. */
  fields?: string[];
  pages: { default: number; max: number };
  /** Built-in words: the cover line, a one-sentence intro and three or four practical tips. */
  coverSubtitle: string;
  intro: string;
  tips: string[];
  /** Search words for the listing, most important first. */
  keywords: string[];
  /** Listing feature lines beyond the ones the engine writes. */
  features: string[];
  priceCents: number;
  design: string;
  /** Words for the AI about what the sheet is for (what to write tips about). */
  aiTopic: string;
}

const Params = z.object({
  pages: z.number().int().min(1).max(60).default(4),
  cover: z.boolean().default(true),
  /** Prints the intro and tips above the first log page. */
  tipsBox: z.boolean().default(true),
});
type P = z.infer<typeof Params>;

const Content = z.object({
  coverSubtitle: z.string().min(3).max(90),
  intro: z.string().min(10).max(170),
  tips: z.array(z.string().min(5).max(95)).min(2).max(4),
});
type C = z.infer<typeof Content>;

/** Smallest row a person can write in, in mm (same rule as the student logs). */
const MIN_ROW_MM = 6.5;
const minRow = (t: { baseSizePt: number }) => Math.max(MIN_ROW_MM, t.baseSizePt * 0.9 * 0.3528 * 1.35 + 2.4);
const reserved = (t: { baseSizePt: number }, extra = 0) => Math.max(34, t.baseSizePt * 3.6) + extra;

/** Height the fill-in fields and the tips box take on a page, in mm. */
function extrasMm(def: LogSheetDef, ctx: TypeContext<P>, first: boolean): number {
  const line = Math.max(8, ctx.tokens.baseSizePt * 0.3528 * 2.4);
  const fields = def.fields?.length ? line + 2 : 0;
  const tips = first && ctx.params.tipsBox ? line * 3.6 + 8 : 0;
  return fields + tips;
}

/** Rows on a log page and their height: every row label plus as many blank rows as fit at a writable size. */
export function logRows(def: LogSheetDef, ctx: TypeContext<P>, first: boolean): { rows: number; rowMm: number; fits: boolean } {
  const sp = space(ctx.paper, ctx.tokens, reserved(ctx.tokens));
  const body = sp.bodyHeightMm - extrasMm(def, ctx, first);
  const min = minRow(ctx.tokens);
  const fit = Math.max(1, Math.floor(body / min) - 1);
  const labels = def.rowLabels?.length ?? 0;
  const rows = Math.max(fit, labels);
  const rowMm = Math.max(min, Math.min(12, body / (rows + 1)));
  return { rows, rowMm, fits: labels <= fit };
}

const columnsPct = (def: LogSheetDef) => {
  const total = def.columns.reduce((a, c) => a + c.width, 0);
  return def.columns.map((c) => ({ label: c.label, widthPct: (c.width / total) * 100 }));
};

function fieldsRow(def: LogSheetDef): SafeHtml | string {
  if (!def.fields?.length) return '';
  return html`<div class="row" style="gap:5mm;flex:none">${def.fields.map((f) => html`<div style="flex:1;min-width:0">${labelLine(f)}</div>`)}</div>`;
}

function tipsBox(content: C): SafeHtml {
  return html`<div class="box soft" style="flex:none"><div>${content.intro}</div>${content.tips.map((t) => html`<div class="row" style="gap:2mm;align-items:center"><span class="dot"></span><span>${t}</span></div>`)}</div>`;
}

/** Turns a log-sheet definition into a product type. */
export function logSheetType(def: LogSheetDef): ProductTypeDefinition<P, C> {
  if (def.columns.length < 2 || def.columns.length > 8) throw new Error(`${def.id}: a log sheet needs 2 to 8 columns`);
  if ((def.fields?.length ?? 0) > 3) throw new Error(`${def.id}: at most 3 fill-in fields`);
  const pagesSchema = Params.extend({ pages: z.number().int().min(1).max(def.pages.max).default(def.pages.default) });
  const pageCount = (ctx: TypeContext<P>) => (ctx.params.cover ? 1 : 0) + ctx.params.pages;
  return {
    id: def.id,
    name: def.name,
    family: 'printable',
    category: def.category,
    description: def.description,
    paramsSchema: pagesSchema,
    contentSchema: Content,
    defaultParams: () => pagesSchema.parse({}),
    defaultTitle: (ctx) => `${def.title}${audienceSuffix(ctx)}`,
    aiContent: true,
    artwork: 'none',
    defaultPriceCents: def.priceCents,
    defaultDesign: def.design,
    variationAxes: ['design', 'audience', 'theme', 'paper'],
    contentPrompt: (ctx) => ({
      system: AI_SYSTEM_BASE,
      user: `Write the short words for a printable ${def.name.toLowerCase()} titled "${ctx.title}". It is ${def.aiTopic}.
Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
The log columns are fixed: ${def.columns.map((c) => c.label).join(', ')}.
Return coverSubtitle (one short line for the cover, under 85 characters), intro (one sentence on how to use the sheet, under 165 characters) and tips (3 short practical tips, each under 90 characters). No medical, legal, financial or safety guarantees, and no invented facts or numbers.${revisionClause(ctx)}`,
    }),
    deterministicContent: () => ({ coverSubtitle: def.coverSubtitle, intro: def.intro, tips: def.tips.slice(0, 4) }),
    async render(ctx, content) {
      const pages: SafeHtml[] = [];
      if (ctx.params.cover) pages.push(coverPage(ctx, ctx.title, content.coverSubtitle));
      const cols = columnsPct(def);
      for (let i = 0; i < ctx.params.pages; i++) {
        const first = i === 0;
        const { rows, rowMm } = logRows(def, ctx, first);
        const labelled = (def.rowLabels ?? []).map((l) => [l]);
        pages.push(page(html`${header(def.heading, first ? '' : `Page ${i + 1} of ${ctx.params.pages}`, ornament(ctx.tokens))}
          ${first && ctx.params.tipsBox ? tipsBox(content) : ''}${fieldsRow(def)}
          ${table(cols, labelled, rows - labelled.length, rowMm)}${stdFooter(ctx, `Page ${i + 1} of ${ctx.params.pages}`)}`));
      }
      // The same sheet as a spreadsheet: one tab, the columns as headers, the row labels filled in.
      const headers = def.columns.map((c) => c.label);
      const { rows } = logRows(def, ctx, false);
      const total = Math.max(rows * ctx.params.pages, def.rowLabels?.length ?? 0);
      const body = Array.from({ length: total }, (_, r) => headers.map((_h, c) => (c === 0 ? def.rowLabels?.[r % (def.rowLabels?.length || 1)] ?? '' : '')));
      const wb = newWorkbook(ctx.title, ctx.shopName);
      const ws = wb.addWorksheet(sheetName(def.heading));
      ws.columns = def.columns.map((c, i) => ({ header: c.label, key: `c${i}`, width: Math.max(10, Math.round(c.width * 0.9)) }));
      styleHeader(ws.getRow(1), argb(ctx.tokens.palette.primary));
      body.forEach((r, i) => r.forEach((v, c) => { if (v) ws.getCell(i + 2, c + 1).value = v; }));
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      const base = def.id;
      return {
        pages,
        extraFiles: [
          { fileName: `${base}.csv`, kind: 'csv', mime: 'text/csv', data: toCsv([headers, ...body]), role: 'deliverable' },
          { fileName: `${base}.xlsx`, kind: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: await workbookBuffer(wb), role: 'deliverable' },
        ],
      };
    },
    expectedPageCount: (ctx) => pageCount(ctx),
    consistencyChecks: (ctx, c) => {
      const first = logRows(def, ctx, true);
      const rest = logRows(def, ctx, false);
      const findings: QaFinding[] = [
        { code: 'rows_fit', severity: 'hard', passed: first.fits && rest.fits, message: first.fits && rest.fits ? `${first.rows} writable rows on the first page, ${rest.rows} on the others` : `The ${def.rowLabels?.length} row labels don't all fit at a writable size on this paper and design` },
        { code: 'rows_writable', severity: 'warning', passed: first.rows >= 6, message: first.rows >= 6 ? 'Enough rows to write in' : `Only ${first.rows} rows fit on the first page` },
        { code: 'tip_count', severity: 'hard', passed: c.tips.length >= 2 && c.tips.length <= 4, message: `Tips: ${c.tips.length} (allowed 2-4)` },
      ];
      return findings;
    },
    qaText: (c) => [c.coverSubtitle, c.intro, ...c.tips, ...def.columns.map((x) => x.label), ...(def.rowLabels ?? []), ...(def.fields ?? []), def.heading],
    listingHints: (ctx) => baseHints(ctx, def.keywords,
      [`${ctx.params.pages} log page${ctx.params.pages === 1 ? '' : 's'} with columns for ${def.columns.map((c) => c.label.toLowerCase()).join(', ')}`, ...def.features, 'Matching spreadsheet (XLSX and CSV) to fill in on screen'],
      [`1 PDF (${pageCount(ctx)} pages)`, '1 XLSX workbook', '1 CSV file'],
      `${PRINT_USAGE} Open the XLSX in Excel, Numbers or Google Sheets to keep the log on screen.`),
  };
}
