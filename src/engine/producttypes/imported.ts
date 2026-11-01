import { z } from 'zod';
import { html, n, type SafeHtml } from '../rendering/html.ts';
import { page, pngDataUri } from '../rendering/components.ts';
import { coverPage, stdFooter, baseHints, PRINT_USAGE } from './common.ts';
import { permanent } from '../../core/errors.ts';
import type { ArtworkItem, ProductTypeDefinition } from './types.ts';

// ---------------------------------------------------------------- coloring pages from imported images

const ImportedParams = z.object({
  /** Reference library ids, one page each, in this order. */
  references: z.array(z.string().regex(/^ref_[A-Za-z0-9]+$/)).max(40).default([]),
  /** "fill" stretches each image to the page width; "sharp" keeps it at 200 DPI or better (smaller on the page). */
  fit: z.enum(['fill', 'sharp']).default('fill'),
  cover: z.boolean().default(true),
});
type ImportedP = z.infer<typeof ImportedParams>;
const ImportedContent = z.object({ coverSubtitle: z.string().min(3).max(90) });
type ImportedC = z.infer<typeof ImportedContent>;

export const importedColoring: ProductTypeDefinition<ImportedP, ImportedC> = {
  id: 'imported-coloring',
  name: 'Coloring pages from your imported images',
  family: 'activity',
  category: 'Coloring Pages',
  description: 'Coloring pages made from images you imported (Grok, ChatGPT, Gemini, arena.ai and others), one image per page.',
  paramsSchema: ImportedParams,
  contentSchema: ImportedContent,
  defaultParams: () => ImportedParams.parse({}),
  defaultTitle: () => 'Coloring Pages',
  aiContent: false,
  artwork: 'imported',
  importOnly: true,
  deterministicContent: (ctx) => ({ coverSubtitle: `${ctx.params.references.length} ${ctx.params.references.length === 1 ? 'design' : 'designs'} to color` }),
  async generateArtwork(ctx) {
    if (!ctx.params.references.length) throw permanent('no_references', 'This product has no imported images. Make it from the Imports screen.');
    if (!ctx.loadReferenceImage) throw permanent('no_reference_loader', 'Imported images cannot be read here.');
    const out: ArtworkItem[] = [];
    for (const [i, id] of ctx.params.references.entries()) {
      const img = await ctx.loadReferenceImage(id);
      out.push({ name: `page-art-${String(i + 1).padStart(2, '0')}.png`, kind: 'png', data: img.png, widthPx: img.widthPx, heightPx: img.heightPx, role: 'deliverable', provenance: img.provenance });
    }
    return out;
  },
  render(ctx, content, art) {
    const pages: SafeHtml[] = [];
    if (ctx.params.cover && art[0]) pages.push(coverPage(ctx, ctx.title, content.coverSubtitle, html`<div style="width:70mm;height:70mm" class="art"><img src="${pngDataUri(art[0].data as Buffer)}"></div>`));
    for (const a of art) {
      const style = ctx.params.fit === 'sharp' && a.widthPx && a.heightPx ? `max-width:${n((a.widthPx / 200) * 25.4)}mm;max-height:${n((a.heightPx / 200) * 25.4)}mm` : '';
      pages.push(page(html`<div class="art"><img src="${pngDataUri(a.data as Buffer)}" style="${style}"></div>${stdFooter(ctx, '')}`));
    }
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.references.length + (ctx.params.cover ? 1 : 0),
  consistencyChecks: (ctx, _c, art) => [
    { code: 'artwork_count', severity: 'hard', passed: art.length === ctx.params.references.length && art.length > 0, message: `${art.length} images for ${ctx.params.references.length} pages` },
  ],
  qaText: (c) => [c.coverSubtitle],
  listingHints: (ctx) => baseHints(ctx, ['coloring pages', 'printable coloring', 'adult coloring pages', 'coloring sheets'],
    [`${ctx.params.references.length} coloring pages`, 'Black-and-white line art', 'PNG files included for digital coloring'], ['1 PDF', `${ctx.params.references.length} PNG files`], PRINT_USAGE),
};
