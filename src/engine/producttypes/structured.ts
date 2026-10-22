import { z } from 'zod';
import { html, type SafeHtml } from '../rendering/html.ts';
import { page, header, lines, table, space, ornament } from '../rendering/components.ts';
import { MONTH_NAMES } from '../../core/time.ts';
import { BUDGET_CATEGORIES, habitKey } from './library.ts';
import { AI_SYSTEM_BASE, audienceLine, revisionClause, type ProductTypeDefinition, type QaFinding } from './types.ts';
import { stdFooter, baseHints, PRINT_USAGE, audienceSuffix } from './common.ts';
import { toCsv, newWorkbook, styleHeader, argb, workbookBuffer, sheetName } from './sheets.ts';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ---------------------------------------------------------------- budget planner

const BudgetParams = z.object({
  year: z.number().int().min(2020).max(2100),
  startMonth: z.number().int().min(1).max(12).default(1),
  months: z.number().int().min(1).max(12).default(12),
  currencySymbol: z.string().min(1).max(3).default('$'),
});
type BudgetP = z.infer<typeof BudgetParams>;
const cat = z.array(z.string().min(2).max(28));
const BudgetContent = z.object({
  coverSubtitle: z.string().min(3).max(90),
  income: cat.min(1).max(6),
  fixed: cat.min(2).max(10),
  variable: cat.min(2).max(10),
  savings: cat.min(1).max(6),
  tips: z.array(z.string().min(8).max(110)).min(2).max(5),
});
type BudgetC = z.infer<typeof BudgetContent>;

function monthsOf(p: BudgetP) {
  return Array.from({ length: p.months }, (_, i) => {
    const m = p.startMonth - 1 + i;
    return { y: p.year + Math.floor(m / 12), m0: m % 12 };
  });
}

export const budgetPlanner: ProductTypeDefinition<BudgetP, BudgetC> = {
  id: 'budget-planner',
  name: 'Budget planner',
  family: 'structured',
  category: 'Finance & Business',
  description: 'Monthly budget pages, annual overview, and a formula-driven XLSX workbook.',
  paramsSchema: BudgetParams,
  contentSchema: BudgetContent,
  defaultParams: (now) => BudgetParams.parse({ year: now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear() }),
  defaultTitle: (ctx) => `${ctx.params.year} Budget Planner${audienceSuffix(ctx)}`,
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'audience', 'currency'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE + '\n- Do not give personalized investment, tax or legal advice. Tips must be general budgeting organization tips.',
    user: `Write the category structure for a monthly budget planner titled "${ctx.title}". Audience: ${audienceLine(ctx)}.
Return coverSubtitle; income (2-4 categories), fixed (5-8 fixed-cost categories), variable (5-8 variable spending categories), savings (2-4 savings or debt categories) — each category label under 26 characters and relevant to this audience; and tips: 3 or 4 short, general budgeting organization tips.${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx) => {
    const k = habitKey(ctx.audience?.name);
    const c = BUDGET_CATEGORIES[k === 'kids' ? 'general' : k] ?? BUDGET_CATEGORIES.general;
    return { coverSubtitle: 'Give every dollar a job', ...c, tips: ['Fill in planned amounts at the start of the month.', 'Record actual spending weekly, not monthly.', 'Review subscriptions every quarter.'] };
  },
  async render(ctx, content) {
    const s = ctx.params.currencySymbol;
    const sp = space(ctx.paper, ctx.tokens, 40);
    const totalRows = content.income.length + content.fixed.length + content.variable.length + content.savings.length + 8;
    const rowMm = Math.max(5.2, Math.min(9, (sp.bodyHeightMm - 30) / totalRows));
    const cols = [{ label: 'Category', widthPct: 50 }, { label: `Planned ${s}`, widthPct: 25 }, { label: `Actual ${s}`, widthPct: 25 }];
    const section = (title: string, cats: string[]) => html`<div class="col" style="gap:1mm;flex:none"><div class="h3">${title}</div>${table(cols, cats.map((c) => [c, '', '']), 1, rowMm)}</div>`;
    const pages: SafeHtml[] = monthsOf(ctx.params).map(({ y, m0 }) => page(html`${header(`${MONTH_NAMES[m0]} ${y}`, 'Monthly budget', ornament(ctx.tokens))}
      <div class="row fill"><div class="col grow">${section('Income', content.income)}${section('Savings & debt', content.savings)}
        <div class="box soft" style="flex:none"><div class="label">Summary</div>${['Total income', 'Total expenses', 'Total saved', 'Left over'].map((l) => html`<div class="row" style="justify-content:space-between"><span>${l}</span><span>${s} ____________</span></div>`)}</div>
        <div class="box fill"><div class="label">Notes</div>${lines(9)}</div></div>
      <div class="col grow">${section('Fixed expenses', content.fixed)}${section('Variable expenses', content.variable)}</div></div>${stdFooter(ctx, ctx.title)}`));
    const ovRow = Math.max(6, Math.min(12, (sp.bodyHeightMm - 40) / (ctx.params.months + 2)));
    pages.push(page(html`${header(`${ctx.params.year} at a glance`, 'Copy each month\'s totals here', ornament(ctx.tokens))}
      ${table([{ label: 'Month', widthPct: 24 }, { label: `Income ${s}`, widthPct: 19 }, { label: `Expenses ${s}`, widthPct: 19 }, { label: `Saved ${s}`, widthPct: 19 }, { label: `Left ${s}`, widthPct: 19 }], monthsOf(ctx.params).map(({ y, m0 }) => [`${MONTH_NAMES[m0]} ${y}`, '', '', '', '']), 1, ovRow)}
      <div class="box fill"><div class="label">Budgeting tips</div>${content.tips.map((t) => html`<div class="row" style="gap:2mm;align-items:center"><span class="dot"></span><span>${t}</span></div>`)}</div>${stdFooter(ctx, ctx.title)}`));

    const wb = newWorkbook(ctx.title, ctx.shopName);
    const primary = argb(ctx.tokens.palette.primary);
    const fmt = `"${s.replace(/"/g, '')}"#,##0.00`;
    const monthRefs: { name: string; income: string; expenses: string; saved: string }[] = [];
    for (const { y, m0 } of monthsOf(ctx.params)) {
      const name = sheetName(`${MONTH_NAMES[m0].slice(0, 3)} ${y}`);
      const ws = wb.addWorksheet(name);
      ws.columns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }];
      let r = 1;
      const block = (title: string, cats: string[]) => {
        const hdr = ws.getRow(r);
        hdr.values = [title, 'Planned', 'Actual', 'Difference'];
        styleHeader(hdr, primary);
        const first = r + 1;
        cats.forEach((c, i) => {
          const row = first + i;
          ws.getCell(row, 1).value = c;
          ws.getCell(row, 4).value = { formula: `B${row}-C${row}` };
          for (const col of [2, 3, 4]) ws.getCell(row, col).numFmt = fmt;
        });
        const totalRow = first + cats.length;
        ws.getCell(totalRow, 1).value = `Total ${title.toLowerCase()}`;
        ws.getCell(totalRow, 1).font = { bold: true };
        for (const [col, letter] of [[2, 'B'], [3, 'C'], [4, 'D']] as const) {
          ws.getCell(totalRow, col).value = { formula: `SUM(${letter}${first}:${letter}${totalRow - 1})` };
          ws.getCell(totalRow, col).numFmt = fmt;
          ws.getCell(totalRow, col).font = { bold: true };
        }
        r = totalRow + 2;
        return `C${totalRow}`;
      };
      const inc = block('Income', content.income);
      const fix = block('Fixed expenses', content.fixed);
      const vari = block('Variable expenses', content.variable);
      const sav = block('Savings & debt', content.savings);
      ws.getCell(r, 1).value = 'Left over (actual)';
      ws.getCell(r, 1).font = { bold: true };
      ws.getCell(r, 3).value = { formula: `${inc}-${fix}-${vari}-${sav}` };
      ws.getCell(r, 3).numFmt = fmt;
      monthRefs.push({ name, income: inc, expenses: `(${fix}+${vari})`, saved: sav });
    }
    const ov = wb.addWorksheet('Year overview', { properties: { tabColor: { argb: primary } } });
    ov.columns = [{ header: 'Month', width: 18 }, { header: 'Income', width: 16 }, { header: 'Expenses', width: 16 }, { header: 'Saved', width: 16 }, { header: 'Left over', width: 16 }];
    styleHeader(ov.getRow(1), primary);
    monthRefs.forEach((m, i) => {
      const row = i + 2;
      const q = `'${m.name}'!`;
      ov.getCell(row, 1).value = m.name;
      ov.getCell(row, 2).value = { formula: `${q}${m.income}` };
      ov.getCell(row, 3).value = { formula: m.expenses.replace(/C(\d+)/g, `${q}C$1`) };
      ov.getCell(row, 4).value = { formula: `${q}${m.saved}` };
      ov.getCell(row, 5).value = { formula: `B${row}-C${row}-D${row}` };
      for (let c = 2; c <= 5; c++) ov.getCell(row, c).numFmt = fmt;
    });
    const t = monthRefs.length + 2;
    ov.getCell(t, 1).value = 'Total';
    for (const [c, l] of [[2, 'B'], [3, 'C'], [4, 'D'], [5, 'E']] as const) {
      ov.getCell(t, c).value = { formula: `SUM(${l}2:${l}${t - 1})` };
      ov.getCell(t, c).numFmt = fmt;
      ov.getCell(t, c).font = { bold: true };
    }
    const csv = toCsv([['Section', 'Category', 'Planned', 'Actual'], ...content.income.map((c) => ['Income', c, '', '']), ...content.fixed.map((c) => ['Fixed', c, '', '']), ...content.variable.map((c) => ['Variable', c, '', '']), ...content.savings.map((c) => ['Savings & debt', c, '', ''])]);
    return {
      pages,
      extraFiles: [
        { fileName: 'budget-planner.xlsx', kind: 'xlsx', mime: XLSX_MIME, data: await workbookBuffer(wb), role: 'deliverable' },
        { fileName: 'budget-categories.csv', kind: 'csv', mime: 'text/csv', data: csv, role: 'deliverable' },
      ],
    };
  },
  expectedPageCount: (ctx) => ctx.params.months + 1,
  consistencyChecks: (_ctx, c) => {
    const all = [...c.income, ...c.fixed, ...c.variable, ...c.savings].map((x) => x.toLowerCase());
    const d = all.filter((x, i) => all.indexOf(x) !== i);
    return [{ code: 'duplicate_items', severity: 'warning', passed: d.length === 0, message: d.length ? `Categories used twice: ${d.join(', ')}` : 'Categories unique' } satisfies QaFinding];
  },
  qaText: (c) => [c.coverSubtitle, ...c.income, ...c.fixed, ...c.variable, ...c.savings, ...c.tips],
  listingHints: (ctx) => baseHints(ctx, ['budget planner', 'monthly budget', 'budget spreadsheet', 'finance planner', 'expense tracker'],
    [`${ctx.params.months} monthly budget pages`, 'Annual overview page', 'XLSX workbook with automatic totals and year summary', 'Works with Excel, Numbers and Google Sheets'], [`1 PDF (${ctx.params.months + 1} pages)`, '1 XLSX workbook', '1 CSV category list'], `${PRINT_USAGE} Open the XLSX to budget digitally; totals and the year overview fill in automatically.`),
};

// ---------------------------------------------------------------- invoice template

const InvoiceParams = z.object({
  currencySymbol: z.string().min(1).max(3).default('$'),
  taxLabel: z.string().min(2).max(20).default('Sales tax'),
  lineRows: z.number().int().min(6).max(25).default(12),
});
type InvoiceP = z.infer<typeof InvoiceParams>;
const InvoiceContent = z.object({
  thankYou: z.string().min(5).max(100),
  termsTemplate: z.string().min(10).max(220),
  receiptNote: z.string().min(5).max(120),
});
type InvoiceC = z.infer<typeof InvoiceContent>;

export const invoiceTemplate: ProductTypeDefinition<InvoiceP, InvoiceC> = {
  id: 'invoice-template',
  name: 'Invoice template',
  family: 'structured',
  category: 'Finance & Business',
  description: 'Fillable-style invoice and receipt PDF with a calculating XLSX invoice.',
  paramsSchema: InvoiceParams,
  contentSchema: InvoiceContent,
  defaultParams: () => InvoiceParams.parse({}),
  defaultTitle: () => 'Small Business Invoice Template',
  aiContent: true,
  artwork: 'none',
  variationAxes: ['design', 'currency', 'paper'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE + '\n- Do not give legal or tax advice; payment terms must be a neutral template the buyer edits.',
    user: `Write short template text for an invoice and receipt titled "${ctx.title}". Audience: ${audienceLine(ctx)}.
Return thankYou (a friendly closing line), termsTemplate (a neutral payment-terms template using blanks like "within ___ days"), and receiptNote (one line for the receipt page).${revisionClause(ctx)}`,
  }),
  deterministicContent: () => ({ thankYou: 'Thank you for your business!', termsTemplate: 'Payment is due within ___ days of the invoice date. Please include the invoice number with your payment.', receiptNote: 'Keep this receipt for your records.' }),
  async render(ctx, content) {
    const s = ctx.params.currencySymbol;
    const sp = space(ctx.paper, ctx.tokens, 120);
    const rowMm = Math.max(6, Math.min(9, sp.bodyHeightMm / (ctx.params.lineRows + 1)));
    const field = (l: string) => html`<div class="line" style="min-height:6mm;flex:none"><span class="label" style="flex:none">${l}</span></div>`;
    const party = (l: string) => html`<div class="box grow"><div class="label">${l}</div>${lines(4, '')}</div>`;
    const items = table([{ label: 'Description', widthPct: 52 }, { label: 'Qty', widthPct: 12 }, { label: `Rate ${s}`, widthPct: 18 }, { label: `Amount ${s}`, widthPct: 18 }], [], ctx.params.lineRows, rowMm);
    const totals = html`<div class="col" style="width:70mm;flex:none;gap:1mm;align-self:flex-end">${['Subtotal', `${ctx.params.taxLabel} (___%)`, 'Total due'].map((l, i) => html`<div class="row" style="justify-content:space-between;${i === 2 ? 'font-weight:700;color:var(--primary)' : ''}"><span>${l}</span><span>${s} ______________</span></div>`)}</div>`;
    const invoice = page(html`<header class="hdr"><div class="col" style="gap:1mm"><div class="h1">INVOICE</div><div class="sub">Your business name · address · email</div></div><div class="col" style="width:62mm;gap:1mm">${field('Invoice #')}${field('Date')}${field('Due date')}</div></header>
      <div class="row" style="height:30mm;flex:none">${party('Bill from')}${party('Bill to')}</div>${items}${totals}
      <div class="row" style="flex:none"><div class="box grow"><div class="label">Payment terms</div><div class="small">${content.termsTemplate}</div></div><div class="box grow"><div class="label">Notes</div><div class="small">${content.thankYou}</div></div></div>${stdFooter(ctx, '')}`);
    const receipt = page(html`${header('RECEIPT', content.receiptNote, ornament(ctx.tokens))}<div class="col" style="flex:none;gap:2mm">${['Receipt #', 'Date', 'Received from', 'Amount', 'Payment method', 'For invoice #'].map((l) => field(l))}</div>
      ${table([{ label: 'Description', widthPct: 70 }, { label: `Amount ${s}`, widthPct: 30 }], [], 8, rowMm)}<div class="box fill"><div class="label">Notes</div>${lines(0)}</div><div class="box"><div class="label">Signature</div>${lines(1, 'signature')}</div>${stdFooter(ctx, '')}`);

    const wb = newWorkbook(ctx.title, ctx.shopName);
    const ws = wb.addWorksheet('Invoice');
    const fmt = `"${s.replace(/"/g, '')}"#,##0.00`;
    ws.columns = [{ width: 44 }, { width: 10 }, { width: 14 }, { width: 16 }];
    ws.getCell('A1').value = 'INVOICE';
    ws.getCell('A1').font = { bold: true, size: 20, color: { argb: argb(ctx.tokens.palette.primary) } };
    const labels: [string, string][] = [['A3', 'Invoice #'], ['A4', 'Date'], ['A5', 'Due date'], ['A7', 'Bill to'], ['C3', 'Tax rate (%)']];
    for (const [cell, label] of labels) ws.getCell(cell).value = label;
    ws.getCell('D3').value = 0;
    const head = ws.getRow(10);
    head.values = ['Description', 'Qty', 'Rate', 'Amount'];
    styleHeader(head, argb(ctx.tokens.palette.primary));
    const first = 11;
    const last = first + ctx.params.lineRows - 1;
    for (let r = first; r <= last; r++) {
      ws.getCell(r, 4).value = { formula: `IF(AND(ISNUMBER(B${r}),ISNUMBER(C${r})),B${r}*C${r},0)` };
      for (const c of [3, 4]) ws.getCell(r, c).numFmt = fmt;
    }
    const rows: [string, string][] = [['Subtotal', `SUM(D${first}:D${last})`], [ctx.params.taxLabel, `D${last + 2}*D3/100`], ['Total due', `D${last + 2}+D${last + 3}`]];
    rows.forEach(([l, f], i) => {
      const r = last + 2 + i;
      ws.getCell(r, 3).value = l;
      ws.getCell(r, 4).value = { formula: f };
      ws.getCell(r, 4).numFmt = fmt;
      if (i === 2) ws.getCell(r, 4).font = { bold: true };
    });
    ws.getCell(last + 6, 1).value = content.termsTemplate;
    ws.getCell(last + 7, 1).value = content.thankYou;
    const csv = toCsv([['Description', 'Qty', 'Rate', 'Amount']]);
    return {
      pages: [invoice, receipt],
      extraFiles: [
        { fileName: 'invoice-template.xlsx', kind: 'xlsx', mime: XLSX_MIME, data: await workbookBuffer(wb), role: 'deliverable' },
        { fileName: 'invoice-line-items.csv', kind: 'csv', mime: 'text/csv', data: csv, role: 'deliverable' },
      ],
    };
  },
  expectedPageCount: () => 2,
  qaText: (c) => [c.thankYou, c.termsTemplate, c.receiptNote],
  listingHints: (ctx) => baseHints(ctx, ['invoice template', 'small business invoice', 'receipt template', 'billing form'],
    ['Printable invoice and matching receipt', 'XLSX invoice that calculates line totals, tax and total due', `${ctx.params.lineRows} line-item rows`], ['1 PDF (2 pages)', '1 XLSX invoice', '1 CSV line-item template'], `${PRINT_USAGE} Edit the XLSX invoice in Excel, Numbers or Google Sheets.`),
};

