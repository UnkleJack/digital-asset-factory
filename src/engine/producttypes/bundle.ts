import { z } from 'zod';
import { html } from '../rendering/html.ts';
import { page, header, ornament } from '../rendering/components.ts';
import { AI_SYSTEM_BASE, audienceLine, revisionClause, type ProductTypeDefinition } from './types.ts';
import { coverPage, stdFooter, baseHints } from './common.ts';

const Member = z.object({
  productId: z.string().min(3),
  versionId: z.string().min(3),
  title: z.string().min(2),
  productType: z.string().min(2),
  pageCount: z.number().int().min(0),
  files: z.array(z.string()).min(1),
});

// pitch: the operator's (or AI-suggested, then edited) one-paragraph description of the pack.
const BundleParams = z.object({ members: z.array(Member).min(2).max(20), pitch: z.string().max(1200).optional() });
type BundleP = z.infer<typeof BundleParams>;
const BundleContent = z.object({
  coverSubtitle: z.string().min(3).max(90),
  blurbs: z.array(z.string().min(5).max(140)).min(2).max(20),
});
type BundleC = z.infer<typeof BundleContent>;

export const bundleType: ProductTypeDefinition<BundleP, BundleC> = {
  id: 'bundle',
  name: 'Bundle',
  family: 'bundle',
  category: 'Bundles',
  description: 'A collection of QA-passed products packaged together with a contents guide.',
  paramsSchema: BundleParams,
  contentSchema: BundleContent,
  defaultParams: () => ({ members: [] }) as unknown as BundleP,
  defaultTitle: (ctx) => `${ctx.params.members.length}-in-1 Printable Bundle`,
  aiContent: true,
  artwork: 'none',
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Write copy for a bundle titled "${ctx.title}". Audience: ${audienceLine(ctx)}.
It contains, in order: ${ctx.params.members.map((m) => `"${m.title}" (${m.pageCount} pages)`).join('; ')}.${ctx.params.pitch ? `\nThe seller describes it as: ${ctx.params.pitch}` : ''}
Return coverSubtitle and blurbs: exactly ${ctx.params.members.length} one-sentence descriptions, one per item in the same order, saying what each is useful for.${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx) => ({
    coverSubtitle: `${ctx.params.members.length} printables in one download`,
    blurbs: ctx.params.members.map((m) => `${m.title}: ${m.pageCount} printable page${m.pageCount === 1 ? '' : 's'}${m.files.length > 1 ? ` plus ${m.files.length - 1} extra file${m.files.length > 2 ? 's' : ''}` : ''}.`),
  }),
  render(ctx, content) {
    const total = ctx.params.members.reduce((a, m) => a + m.pageCount, 0);
    return {
      pages: [
        coverPage(ctx, ctx.title, content.coverSubtitle, html`<div class="pill">${total} pages in total</div>`),
        page(html`${header("What's inside", `${ctx.params.members.length} products`, ornament(ctx.tokens))}<div class="col fill">${ctx.params.members.map((m, i) => html`<div class="box grow"><div class="h3">${i + 1}. ${m.title}</div><div class="small">${content.blurbs[i] ?? ''}</div><div class="small">Files: ${m.files.join(', ')}</div></div>`)}</div>${stdFooter(ctx, ctx.title)}`),
      ],
    };
  },
  expectedPageCount: () => 2,
  consistencyChecks: (ctx, c) => [{ code: 'content_count', severity: 'hard', passed: c.blurbs.length === ctx.params.members.length, message: `${c.blurbs.length} descriptions for ${ctx.params.members.length} items` }],
  qaText: (c) => [c.coverSubtitle, ...c.blurbs],
  listingHints: (ctx) => baseHints(ctx, ['printable bundle', 'planner bundle', 'value bundle'],
    [...(ctx.params.pitch ? [ctx.params.pitch] : []), `${ctx.params.members.length} products in one download`, ...ctx.params.members.slice(0, 5).map((m) => m.title)], ['1 ZIP containing every product', '1 contents guide PDF'], 'Unzip the download, then print each PDF at 100% scale. Spreadsheet files open in Excel, Numbers or Google Sheets.'),
};
