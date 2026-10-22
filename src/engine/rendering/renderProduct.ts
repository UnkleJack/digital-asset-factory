import type { ProductTypeDefinition, TypeContext, ArtworkItem, ExtraFile } from '../producttypes/types.ts';
import { themeCss, documentHtml, requiredFamilies } from './theme.ts';
import { paperDimsMm } from '../templates/library.ts';
import type { Renderer, RenderedDocument } from './renderer.ts';
import { permanent } from '../../core/errors.ts';

export interface ProductRender {
  doc: RenderedDocument;
  extraFiles: ExtraFile[];
  expectedPages: number;
}

export async function renderProduct(
  def: ProductTypeDefinition,
  ctx: TypeContext<unknown>,
  content: unknown,
  artwork: ArtworkItem[],
  renderer: Renderer,
  opts: { fontsDir: string; previewPages: number; previewDpi: number },
): Promise<ProductRender> {
  const plan = await def.render(ctx, content, artwork);
  if (!plan.pages.length) throw permanent('render_empty', `${def.name} produced no pages`);
  const css = themeCss(ctx.tokens, ctx.paper, opts.fontsDir);
  const html = documentHtml(css, plan.pages.map((p) => p.value), ctx.title);
  const { w, h } = paperDimsMm(ctx.paper);
  const doc = await renderer.renderDocument({ html, widthMm: w, heightMm: h, previewPages: opts.previewPages, previewDpi: opts.previewDpi, requiredFamilies: requiredFamilies(ctx.tokens) });
  return { doc, extraFiles: plan.extraFiles ?? [], expectedPages: def.expectedPageCount(ctx, content) };
}
