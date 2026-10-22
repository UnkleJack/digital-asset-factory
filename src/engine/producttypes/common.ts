import { html, type SafeHtml } from '../rendering/html.ts';
import { page, footer, ornament } from '../rendering/components.ts';
import type { TypeContext, ListingHints } from './types.ts';

export function coverPage(ctx: TypeContext<unknown>, title: string, subtitle: string, detail?: SafeHtml | string): SafeHtml {
  return page(html`<div class="cover">${ornament(ctx.tokens)}<div class="h1" style="font-size:calc(var(--base)*3.2)">${title}</div>${subtitle ? html`<div class="h3" style="color:var(--muted);font-weight:400">${subtitle}</div>` : ''}${detail ?? ''}${ornament(ctx.tokens)}</div>${footer(ctx.shopName, '')}`);
}

export function stdFooter(ctx: TypeContext<unknown>, right = ''): SafeHtml {
  return footer(ctx.shopName, right);
}

/** Audience name fit for titles and tags: parenthetical notes dropped ("Seniors (large print)" → "Seniors"). */
export function audienceLabel(ctx: Pick<TypeContext<unknown>, 'audience'>): string {
  return ctx.audience ? ctx.audience.name.replace(/\s*\([^)]*\)/g, '').trim() : '';
}

/** " for Small Business Owners", or "" for no audience or the general one. */
export function audienceSuffix(ctx: Pick<TypeContext<unknown>, 'audience'>): string {
  if (!ctx.audience || ctx.audience.name === 'General adults') return '';
  return ' for ' + audienceLabel(ctx).replace(/(^|\s)([a-z])/g, (_m, sp: string, c: string) => sp + c.toUpperCase());
}

export function baseHints(ctx: TypeContext<unknown>, typeWords: string[], features: string[], included: string[], usage: string): ListingHints {
  const kw = [...typeWords];
  if (ctx.theme) kw.push(...ctx.theme.keywords.slice(0, 3));
  if (ctx.audience) kw.push(audienceLabel(ctx).toLowerCase());
  kw.push('printable', 'instant download', ctx.paper.size === 'a4' ? 'a4 printable' : ctx.paper.size === 'letter' ? 'us letter' : `${ctx.paper.size} printable`);
  return { keywords: [...new Set(kw.map((k) => k.toLowerCase()))], features, included, usage };
}

export const PRINT_USAGE = 'Download the PDF, open it in any PDF reader, and print at 100% scale (actual size) on your chosen paper. Print as many copies as you need for personal use.';
