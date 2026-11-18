import { z } from 'zod';
import { html, type SafeHtml } from '../rendering/html.ts';
import { page, header, table, checklist, lines, ornament, labelLine } from '../rendering/components.ts';
import { AI_SYSTEM_BASE, audienceLine, themeLine, revisionClause, type ProductTypeDefinition, type QaFinding, type TypeContext } from './types.ts';
import { coverPage, stdFooter, baseHints, PRINT_USAGE, audienceSuffix } from './common.ts';

/*
 * The form and worksheet generator (catalog expansion, owner 2026-11-18): planners, intake forms, worksheets and
 * cards, all drawn from one engine. A definition lists its pages; each page is a stack of sections:
 *   fields     labelled lines to fill in (one or two columns)
 *   lines      a box of ruled writing lines that takes the room left on the page
 *   checklist  tick boxes with items, plus blank ones
 *   prompts    questions, each with a few writing lines
 *   grid       a small table with row and column labels (a week of meals, a budget by category)
 * Pages marked `repeat` are printed as many times as the `copies` setting says (one recipe card per recipe, one
 * client form per client); the others once. Each definition is registered as its own product type.
 *
 * Offline the definition's own words are used. With an AI key the AI may rewrite the cover line, the intro and the
 * words of the checklists and prompts, in the same number; the layout, fields and grids never change.
 */

export type FormSection =
  | { kind: 'fields'; fields: string[]; twoColumn?: boolean; title?: string }
  | { kind: 'lines'; title: string }
  | { kind: 'checklist'; title: string; items: string[]; blank?: number }
  | { kind: 'prompts'; title?: string; prompts: string[]; linesEach?: number }
  | { kind: 'grid'; title?: string; rows: string[]; columns: string[]; firstWidth?: number; /** Fixed text in the cells, row by row (a reference chart); blank when left out. */ cells?: string[][] };

export interface FormPageDef {
  heading: string;
  sections: FormSection[];
  /** Printed `copies` times instead of once. */
  repeat?: boolean;
}

export interface FormDef {
  id: string;
  name: string;
  category: string;
  description: string;
  title: string;
  pages: FormPageDef[];
  /** How many times the repeating pages print. Leave out when no page repeats: the form then has no copies setting. */
  copies?: { default: number; max: number };
  coverSubtitle: string;
  intro: string;
  keywords: string[];
  features: string[];
  priceCents: number;
  design: string;
  aiTopic: string;
}

const Params = z.object({
  copies: z.number().int().min(1).max(60).optional(),
  cover: z.boolean().default(true),
});
type P = z.infer<typeof Params>;

const Content = z.object({
  coverSubtitle: z.string().min(3).max(90),
  intro: z.string().min(10).max(170),
  /** The words of every checklist and prompts section, in the order they appear in the definition. */
  lists: z.array(z.array(z.string().min(2).max(110)).min(1).max(16)).max(24),
});
type C = z.infer<typeof Content>;

/** The checklist and prompts sections of a definition, in order: the parts whose words the AI may rewrite. */
type WordSection = { items: string[]; kind: 'checklist' | 'prompts' };
function wordSections(def: FormDef): WordSection[] {
  return def.pages.flatMap((p) => p.sections.flatMap((s): WordSection[] => (s.kind === 'checklist' ? [{ items: s.items, kind: 'checklist' }] : s.kind === 'prompts' ? [{ items: s.prompts, kind: 'prompts' }] : [])));
}

function section(s: FormSection, words: () => string[], ctx: TypeContext<P>): SafeHtml {
  const title = 'title' in s && s.title ? html`<div class="label">${s.title}</div>` : '';
  switch (s.kind) {
    case 'fields': {
      const cells = s.fields.map((f) => html`<div style="min-width:0">${labelLine(f)}</div>`);
      return html`<div class="col" style="flex:none;gap:1.6mm">${title}<div style="display:grid;grid-template-columns:${s.twoColumn ? '1fr 1fr' : '1fr'};column-gap:6mm;row-gap:1.6mm">${cells}</div></div>`;
    }
    case 'lines':
      return html`<div class="box fill">${title}${lines(0)}</div>`;
    case 'checklist': {
      const items = words();
      return html`<div class="box fill">${title}${checklist(items.map((text) => ({ text })), s.blank ?? 0)}</div>`;
    }
    case 'prompts': {
      const prompts = words();
      const each = s.linesEach ?? 2;
      return html`<div class="col fill" style="gap:2mm">${title}${prompts.map((q) => html`<div class="col" style="flex:1 1 0;min-height:0;gap:.6mm"><div class="prompt">${q}</div><div class="lines fill">${Array.from({ length: each }, () => html`<div class="line"></div>`)}</div></div>`)}</div>`;
    }
    case 'grid': {
      const first = s.firstWidth ?? 22;
      const rest = (100 - first) / s.columns.length;
      const rowMm = Math.max(7, ctx.tokens.baseSizePt * 0.3528 * 2.6);
      return html`<div class="col" style="flex:none;gap:1mm">${title}${table([{ label: '', widthPct: first }, ...s.columns.map((label) => ({ label, widthPct: rest }))], s.rows.map((r, i) => [r, ...(s.cells?.[i] ?? [])]), 0, rowMm)}</div>`;
    }
  }
}

/** Turns a form definition into a product type. */
export function formType(def: FormDef): ProductTypeDefinition<P, C> {
  const repeating = def.pages.some((p) => p.repeat);
  if (repeating !== !!def.copies) throw new Error(`${def.id}: a form with repeating pages needs a copies setting, and one without doesn't`);
  // Only a form with repeating pages shows a copies setting on the New product form.
  const schema = def.copies ? Params.extend({ copies: z.number().int().min(1).max(def.copies.max).default(def.copies.default) }) : Params.omit({ copies: true });
  const copies = (ctx: TypeContext<P>) => ctx.params.copies ?? 1;
  const pageCount = (ctx: TypeContext<P>) => (ctx.params.cover ? 1 : 0) + def.pages.reduce((a, p) => a + (p.repeat ? copies(ctx) : 1), 0);
  const expected = wordSections(def);
  return {
    id: def.id,
    name: def.name,
    family: 'printable',
    category: def.category,
    description: def.description,
    paramsSchema: schema,
    contentSchema: Content,
    defaultParams: () => schema.parse({}),
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
Return coverSubtitle (one cover line under 85 characters), intro (one sentence on how to use it, under 165 characters) and lists: exactly ${expected.length} lists, in this order, each with the same number of entries as the starting list shown, rewritten for this audience and theme (checklist items under 60 characters; prompts are open questions under 100 characters):
${expected.map((e, i) => `${i + 1}. ${e.kind}: ${JSON.stringify(e.items)}`).join('\n') || '(none: return an empty array)'}
No medical, legal, financial or safety guarantees, and no invented facts or numbers.${revisionClause(ctx)}`,
    }),
    deterministicContent: () => ({ coverSubtitle: def.coverSubtitle, intro: def.intro, lists: expected.map((e) => e.items) }),
    render(ctx, content) {
      const out: SafeHtml[] = [];
      if (ctx.params.cover) out.push(coverPage(ctx, ctx.title, content.coverSubtitle, html`<div class="sub" style="max-width:120mm">${content.intro}</div>`));
      let total = 0;
      const all = def.pages.flatMap((p) => Array.from({ length: p.repeat ? copies(ctx) : 1 }, (_, i) => ({ p, i })));
      for (const { p, i } of all) {
        total++;
        let w = 0;
        // Each copy of a page uses the same words; the section counter restarts per definition page.
        const before = def.pages.slice(0, def.pages.indexOf(p)).reduce((a, q) => a + q.sections.filter((s) => s.kind === 'checklist' || s.kind === 'prompts').length, 0);
        const next = () => content.lists[before + w++] ?? [];
        const sub = p.repeat && copies(ctx) > 1 ? `${i + 1} of ${copies(ctx)}` : '';
        out.push(page(html`${header(p.heading, sub, ornament(ctx.tokens))}${p.sections.map((s) => section(s, next, ctx))}${stdFooter(ctx, `${ctx.title} · ${total}`)}`));
      }
      return { pages: out };
    },
    expectedPageCount: (ctx) => pageCount(ctx),
    consistencyChecks: (_ctx, c) => {
      const same = c.lists.length === expected.length && expected.every((e, i) => c.lists[i]?.length === e.items.length);
      const findings: QaFinding[] = [
        { code: 'sections_complete', severity: 'hard', passed: same, message: same ? 'Every checklist and prompt section has its words' : `Expected ${expected.length} word lists sized ${expected.map((e) => e.items.length).join('/')}, got ${c.lists.length} sized ${c.lists.map((l) => l.length).join('/')}` },
      ];
      return findings;
    },
    qaText: (c) => [c.coverSubtitle, c.intro, ...c.lists.flat(), ...def.pages.flatMap((p) => [p.heading, ...p.sections.flatMap((s) => [...('title' in s && s.title ? [s.title] : []), ...(s.kind === 'fields' ? s.fields : s.kind === 'grid' ? [...s.rows, ...s.columns, ...(s.cells ?? []).flat()] : [])])])],
    listingHints: (ctx) => baseHints(ctx, def.keywords,
      [...def.features, repeating ? `${copies(ctx)} fill-in ${def.pages.find((p) => p.repeat)!.heading.toLowerCase()} page${copies(ctx) === 1 ? '' : 's'}` : `${def.pages.length} page${def.pages.length === 1 ? '' : 's'} in a set`],
      [`1 PDF (${pageCount(ctx)} pages)`], PRINT_USAGE),
  };
}
