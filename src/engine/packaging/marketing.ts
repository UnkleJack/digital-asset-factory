import type { AppContext } from '../../app/context.ts';
import type { AssetRecord } from '../../storage/assetStore.ts';
import type { ListingHints, TypeContext } from '../producttypes/types.ts';
import type { DesignTokens } from '../templates/library.ts';
import { html, n } from '../rendering/html.ts';
import { fontFaces, fontStack, documentHtml } from '../rendering/theme.ts';
import { pngDataUri } from '../rendering/components.ts';

/*
 * The marketing kit (owner's pick from the ChatGPT review, 2026-11-17): what a product leaves the factory with besides
 * its files and its three shop images. Three Pinterest pins (1000 x 1500), and three plain-text files: pin copy, a
 * launch email, and short social captions with a 20-second video script.
 *
 * Everything is built from what the product really contains (its features, its included files, its real page
 * previews). Nothing claims popularity, reviews, results or a sale price, because the factory knows none of those.
 * No AI is involved, so the kit is free, repeatable and identical for the same product.
 *
 * These files are kept as role "internal": they are never part of the download the customer gets, so changing them
 * does not change the product's fingerprint or withdraw an approval.
 */

export const PIN_W = 1000;
export const PIN_H = 1500;

export interface MarketingInput {
  title: string;
  shopName: string;
  slug: string;
  features: string[];
  included: string[];
  usage: string;
  keywords: string[];
  pageCount: number;
  paperLabel: string;
  /** How many real page previews exist to show on video shots. */
  previewCount: number;
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const utm = (slug: string, medium: string, campaign: string) => `?utm_source=${medium === 'pin' ? 'pinterest' : medium}&utm_medium=${medium}&utm_campaign=${slug}-${campaign}`;

export function pinterestCopy(m: MarketingInput): string {
  const f = m.features;
  const pins = [
    { title: clip(m.title, 100), body: `${m.title}. ${[f[0], f[1]].filter(Boolean).map(sentence).join(' ')} Instant digital download, ${m.paperLabel}.` },
    { title: clip(f[0] ? `${f[0]} | ${m.title}` : m.title, 100), body: `${f.slice(0, 3).map(sentence).join(' ')} Print it at home as many times as your license allows.` },
    { title: clip(`What is inside: ${m.title}`, 100), body: `${m.included.slice(0, 4).map(sentence).join(' ')} ${m.pageCount ? `${m.pageCount} printable page${m.pageCount === 1 ? '' : 's'}, ` : ''}${m.paperLabel}.` },
  ];
  const lines = [`PINTEREST PIN COPY — ${m.title}`, '', 'Three pins, three angles. Each uses its own image (pin-1.png, pin-2.png, pin-3.png).', 'After you publish, paste the live listing link and add the tracking ending shown for each pin, so your shop stats show which pin brought the visit.', ''];
  pins.forEach((p, i) => {
    lines.push(`PIN ${i + 1}`, `Title (max 100 characters): ${p.title}`, `Description: ${clip(p.body, 500)}`, `Tracking ending to add to your listing link: ${utm(m.slug, 'pin', `pin-${i + 1}`)}`, '');
  });
  lines.push('Search words to work into your board and pin text:', m.keywords.slice(0, 12).join(', '), '');
  return lines.join('\n');
}

export function launchEmail(m: MarketingInput): string {
  return [
    `LAUNCH EMAIL — ${m.title}`,
    '',
    `Subject: New from ${m.shopName}: ${m.title}`,
    `Preview text: ${clip(m.features[0] ?? m.title, 90)}`,
    '',
    'Hi,',
    '',
    `${m.title} is ready. ${m.features[0] ? sentence(m.features[0]) : ''}`.trim(),
    '',
    "What's included:",
    ...m.included.map((i) => `- ${i}`),
    '',
    'What you get:',
    ...m.features.map((f) => `- ${f}`),
    '',
    'How it works:',
    m.usage,
    '',
    `Link: (paste your live listing link here after you publish, ending with ${utm(m.slug, 'email', 'launch')})`,
    '',
    `Thank you for supporting ${m.shopName}.`,
    '',
  ].join('\n');
}

export function socialAndVideo(m: MarketingInput): string {
  const f = m.features;
  const captions = [
    `${m.title}. ${f[0] ? sentence(f[0]) : ''} Instant digital download.`,
    `New in the shop: ${m.title}. ${f.slice(1, 3).map(sentence).join(' ')}`.trim(),
    `A look inside ${m.title}. ${m.pageCount ? `${m.pageCount} printable page${m.pageCount === 1 ? '' : 's'}.` : ''} ${m.paperLabel}.`.replace(/\s+/g, ' '),
  ];
  const shots: string[] = [`Shot 1 (0-3 s): the cover page, full screen. On-screen text: "${clip(m.title, 60)}".`];
  if (m.previewCount > 1) shots.push(`Shot 2 (3-8 s): page 2 of the product, slowly scrolling. On-screen text: "${clip(f[0] ?? 'Inside the product', 60)}".`);
  if (m.previewCount > 2) shots.push(`Shot 3 (8-13 s): page 3, then page 4 if you have it. On-screen text: "${clip(f[1] ?? 'Print and use', 60)}".`);
  shots.push(`Last shot (13-20 s): the shop image with the "instant download" badge. On-screen text: "${m.shopName}".`);
  return [
    `SOCIAL CAPTIONS AND VIDEO SCRIPT — ${m.title}`,
    '',
    'CAPTIONS (Instagram, Facebook; keep each under 200 characters)',
    ...captions.map((c, i) => `${i + 1}. ${clip(c, 200)}`),
    '',
    'SHORT VIDEO, about 20 seconds (Reels, Shorts, TikTok)',
    'Record your screen while you scroll through the real PDF. Show only what the customer gets.',
    ...shots,
    '',
    `Tracking ending for the link in your bio or post: ${utm(m.slug, 'social', 'social')}`,
    '',
  ].join('\n');
}

function pinCss(t: DesignTokens, fontsDir: string): string {
  return `${fontFaces(fontsDir, [t.fonts.heading, t.fonts.body])}
*{box-sizing:border-box;margin:0;padding:0}
body{width:${PIN_W}px;height:${PIN_H}px;overflow:hidden;position:relative;background:${t.palette.soft};font-family:${fontStack(t.fonts.body)};color:${t.palette.ink}}
.h{font-family:${fontStack(t.fonts.heading)};color:${t.palette.primary};font-weight:700;line-height:1.08}
.badge{display:inline-block;background:${t.palette.primary};color:${t.palette.paper};padding:12px 26px;border-radius:40px;font-weight:700;font-size:28px;letter-spacing:.06em}
.sheet{position:absolute;background:#fff;box-shadow:0 20px 50px rgba(0,0,0,.22);border-radius:5px;overflow:hidden}
.sheet img{display:block;width:100%;height:100%;object-fit:cover}
.li{display:flex;gap:16px;align-items:center;font-size:36px;line-height:1.25}
.li i{display:block;width:16px;height:16px;border-radius:50%;background:${t.palette.accent};flex:none}
.foot{position:absolute;left:0;right:0;bottom:0;padding:26px 50px;background:${t.palette.primary};color:${t.palette.paper};font-size:30px;display:flex;justify-content:space-between}`;
}

/** The three pin images, from the product's real page previews. Needs at least one preview; with none there are no pins. */
export async function pinImages(app: AppContext, ctx: TypeContext<unknown>, title: string, hints: ListingHints, previews: AssetRecord[], ratio: number, pageCount: number, paperLabel: string): Promise<Buffer[]> {
  if (!previews.length) return [];
  const imgs = previews.map((p) => pngDataUri(app.assets.read(p)));
  const css = pinCss(ctx.tokens, app.paths.fontsDir);
  const foot = html`<div class="foot"><span>${ctx.shopName}</span><span>${pageCount} page${pageCount === 1 ? '' : 's'} · ${paperLabel}</span></div>`;
  const tsize = title.length > 40 ? 76 : 92;
  const sheetW = Math.min(560, Math.floor(620 / Math.max(ratio, 1)));
  const sheetH = Math.round(sheetW * ratio);
  const a = html`<div style="position:absolute;left:60px;right:60px;top:70px"><div class="h" style="font-size:${tsize}px">${title}</div></div>
    <div class="sheet" style="left:${Math.round((PIN_W - sheetW) / 2 - 80)}px;top:${430 + 30}px;width:${sheetW}px;height:${sheetH}px;transform:rotate(-6deg)">${imgs[1] ? html`<img src="${imgs[1]}">` : ''}</div>
    <div class="sheet" style="left:${Math.round((PIN_W - sheetW) / 2 + 40)}px;top:430px;width:${sheetW}px;height:${sheetH}px;transform:rotate(3deg)"><img src="${imgs[0]}"></div>
    <div style="position:absolute;left:60px;bottom:130px"><span class="badge">INSTANT DOWNLOAD</span></div>${foot}`;
  const feats = hints.features.slice(0, 4);
  const smallW = 420, smallH = Math.round(smallW * ratio);
  const b = html`<div style="position:absolute;left:60px;right:60px;top:70px;display:flex;flex-direction:column;gap:40px">
      <div class="h" style="font-size:${Math.round(tsize * 0.8)}px">${title}</div>
      <div style="display:flex;flex-direction:column;gap:22px">${feats.map((f) => html`<div class="li"><i></i><span>${f}</span></div>`)}</div></div>
    <div class="sheet" style="right:70px;bottom:${150}px;width:${smallW}px;height:${Math.min(smallH, 560)}px;transform:rotate(3deg)"><img src="${imgs[0]}"></div>
    <div style="position:absolute;left:60px;bottom:170px"><span class="badge">INSTANT DOWNLOAD</span></div>${foot}`;
  const grid = imgs.slice(0, 4);
  const cols = grid.length === 1 ? 1 : 2;
  const rows = Math.ceil(grid.length / cols);
  const cellW = Math.floor((PIN_W - 120 - (cols - 1) * 36) / cols);
  const cellH = Math.floor((860 - (rows - 1) * 36) / rows);
  const fitW = Math.min(cellW, Math.floor(cellH / ratio));
  const c = html`<div style="position:absolute;left:60px;right:60px;top:60px;display:flex;flex-direction:column;gap:36px;height:${PIN_H - 200}px">
      <div class="h" style="font-size:78px;text-align:center">What is inside</div>
      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:36px;justify-items:center;align-items:center;flex:1">${grid.map((src) => html`<div style="width:${n(fitW, 0)}px;height:${n(fitW * ratio, 0)}px;background:#fff;box-shadow:0 14px 34px rgba(0,0,0,.18);border-radius:5px;overflow:hidden"><img src="${src}" style="width:100%;height:100%;display:block"></div>`)}</div>
      <div style="text-align:center;font-size:32px;color:${ctx.tokens.palette.muted}">${hints.included.join(' · ')}</div></div>${foot}`;
  const out: Buffer[] = [];
  for (const body of [a, b, c]) out.push(await app.renderer.screenshotHtml(documentHtml(css, [body.value], title), PIN_W, PIN_H));
  return out;
}
