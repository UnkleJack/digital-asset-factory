import { basename } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import type { AppContext } from '../../app/context.ts';
import { productType } from '../producttypes/registry.ts';
import { versionContext } from '../specification/service.ts';
import { updateVersion, getProduct } from '../../db/repos.ts';
import type { AssetRecord } from '../../storage/assetStore.ts';
import { html, n } from '../rendering/html.ts';
import { fontFaces, fontStack, documentHtml } from '../rendering/theme.ts';
import { pngDataUri } from '../rendering/components.ts';
import { sha256 } from '../../core/hash.ts';
import { permanent } from '../../core/errors.ts';
import { PAPER_SIZES_MM, type DesignTokens } from '../templates/library.ts';
import type { TypeContext, ListingHints, LicenseTier } from '../producttypes/types.ts';
import { pinImages, pinterestCopy, launchEmail, socialAndVideo, type MarketingInput } from './marketing.ts';

const ZIP_MTIME = new Date('2000-01-01T00:00:00Z');
const PACKAGE_KINDS = new Set(['license', 'instructions', 'package_zip']);
const PAPER_LABEL: Record<keyof typeof PAPER_SIZES_MM, string> = { letter: 'US Letter', a4: 'A4', a5: 'A5', 'half-letter': 'Half Letter', legal: 'US Legal' };

/** The license wording for a tier, from Settings, with the shop name and year filled in. */
export function licenseTextFor(app: AppContext, tier: LicenseTier): { text: string; settingsKey: string } {
  const l = app.settings.get('licensing');
  const g = app.settings.get('general');
  const raw = tier === 'classroom' ? l.classroomLicenseText : tier === 'commercial' ? l.commercialLicenseText : l.licenseText;
  const settingsKey = tier === 'classroom' ? 'licensing.classroomLicenseText' : tier === 'commercial' ? 'licensing.commercialLicenseText' : 'licensing.licenseText';
  return { text: raw.replaceAll('{{shopName}}', g.shopName).replaceAll('{{year}}', String(app.clock.now().getUTCFullYear())), settingsKey };
}

export function deliverableHash(assets: AssetRecord[]): string {
  return sha256(assets.filter((a) => a.role === 'deliverable').map((a) => `${basename(a.rel_path)}:${a.sha256}`).sort().join('\n'));
}

function instructionsText(ctx: TypeContext<unknown>, title: string, hints: ListingHints, files: { name: string; detail: string }[]): string {
  return [
    title, '='.repeat(Math.min(60, title.length)), '',
    "WHAT'S INCLUDED", ...files.map((f) => `- ${f.name}${f.detail ? ` (${f.detail})` : ''}`), '',
    'HOW TO USE', hints.usage, '',
    'PRINTING TIPS',
    `- Pages are sized for ${PAPER_LABEL[ctx.paper.size]} paper (${ctx.paper.orientation}).`,
    '- In the print dialog choose "Actual size" or 100% scale; turn off "Fit to page" for exact margins.',
    '- Colors can look slightly different on screen and on paper depending on your printer.', '',
    'This is a digital download. No physical item is shipped.',
    `See LICENSE.txt for what you may and may not do with these files.`,
    `Thank you for supporting ${ctx.shopName}!`, '',
  ].join('\n');
}

function listingImageCss(t: DesignTokens, fontsDir: string): string {
  return `${fontFaces(fontsDir, [t.fonts.heading, t.fonts.body])}
*{box-sizing:border-box;margin:0;padding:0}
body{width:2000px;height:2000px;overflow:hidden;background:${t.palette.soft};font-family:${fontStack(t.fonts.body)};color:${t.palette.ink}}
.h{font-family:${fontStack(t.fonts.heading)};color:${t.palette.primary};font-weight:700;line-height:1.05}
.badge{display:inline-block;background:${t.palette.primary};color:${t.palette.paper};padding:18px 34px;border-radius:60px;font-weight:700;font-size:40px;letter-spacing:.06em}
.sheet{position:absolute;background:#fff;box-shadow:0 30px 70px rgba(0,0,0,.22);border-radius:6px;overflow:hidden}
.sheet img{display:block;width:100%;height:100%;object-fit:cover}
.li{display:flex;gap:22px;align-items:center;font-size:46px;line-height:1.25}
.li i{display:block;width:22px;height:22px;border-radius:50%;background:${t.palette.accent};flex:none}`;
}

async function listingImages(app: AppContext, ctx: TypeContext<unknown>, title: string, hints: ListingHints, previews: AssetRecord[], pageCount: number): Promise<Buffer[]> {
  const t = ctx.tokens;
  const css = listingImageCss(t, app.paths.fontsDir);
  const imgs = previews.map((p) => pngDataUri(app.assets.read(p)));
  const landscape = ctx.paper.orientation === 'landscape';
  const ratio = (() => {
    const [a, b] = PAPER_SIZES_MM[ctx.paper.size];
    return landscape ? a / b : b / a;
  })();
  const sheetW = landscape ? 1000 : 820;
  const sheetH = Math.round(sheetW * ratio);
  const top = Math.round((2000 - sheetH) / 2);
  const hero = html`<div class="sheet" style="left:110px;top:${top + 40}px;width:${sheetW}px;height:${sheetH}px;transform:rotate(-5deg)">${imgs[1] ? html`<img src="${imgs[1]}">` : ''}</div>
    <div class="sheet" style="left:170px;top:${top}px;width:${sheetW}px;height:${sheetH}px;transform:rotate(2deg)"><img src="${imgs[0]}"></div>
    <div style="position:absolute;left:${sheetW + 260}px;right:110px;top:220px;bottom:220px;display:flex;flex-direction:column;justify-content:center;gap:56px">
      <div class="h" style="font-size:${title.length > 40 ? 92 : 112}px">${title}</div>
      <div style="display:flex;flex-direction:column;gap:28px">${hints.features.slice(0, 4).map((f) => html`<div class="li"><i></i><span>${f}</span></div>`)}</div>
      <div><span class="badge">INSTANT DOWNLOAD</span></div>
      <div style="font-size:40px;color:${t.palette.muted}">${pageCount} printable page${pageCount === 1 ? '' : 's'} · ${PAPER_LABEL[ctx.paper.size]}</div>
    </div>`;
  const grid = imgs.slice(0, 6);
  const cols = grid.length <= 2 ? grid.length : grid.length <= 4 ? 2 : 3;
  const rows = Math.ceil(grid.length / cols);
  const cellW = Math.floor((1700 - (cols - 1) * 60) / cols);
  const cellH = Math.floor((1450 - (rows - 1) * 60) / rows);
  const fitW = Math.min(cellW, cellH / ratio);
  const included = html`<div style="position:absolute;inset:110px 150px;display:flex;flex-direction:column;gap:70px">
      <div class="h" style="font-size:96px;text-align:center">What's included</div>
      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:60px;justify-items:center;align-items:center;flex:1">${grid.map((src) => html`<div style="width:${n(fitW, 0)}px;height:${n(fitW * ratio, 0)}px;background:#fff;box-shadow:0 18px 40px rgba(0,0,0,.18);border-radius:6px;overflow:hidden"><img src="${src}" style="width:100%;height:100%;display:block"></div>`)}</div>
      <div style="text-align:center;font-size:44px;color:${t.palette.muted}">${hints.included.join(' · ')}</div></div>`;
  const detail = html`<div style="position:absolute;inset:0;overflow:hidden;background:#fff"><img src="${imgs[0]}" style="position:absolute;left:-${n(1000 * 0.05, 0)}px;top:-80px;width:3000px"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;padding:60px 110px;background:${t.palette.primary};color:${t.palette.paper};display:flex;justify-content:space-between;align-items:center"><span class="h" style="color:${t.palette.paper};font-size:72px">Print-ready detail</span><span style="font-size:44px">${ctx.shopName}</span></div>`;
  const out: Buffer[] = [];
  for (const body of imgs.length ? [hero, included, detail] : []) {
    out.push(await app.renderer.screenshotHtml(documentHtml(css, [body.value], title), 2000, 2000));
  }
  return out;
}

export async function packageVersion(app: AppContext, versionId: string): Promise<{ deliverableHash: string; files: number }> {
  const { version, product, spec, ctx } = versionContext(app, versionId);
  const def = productType(product.product_type);
  if (!version.content) throw permanent('not_rendered', 'Cannot package a version without content');
  const dir = app.assets.versionDir(version.id);
  app.assets.removeVersionRole(versionId, ['listing_image', 'internal']);
  const existing = app.assets.forVersion(versionId, 'deliverable').filter((a) => !PACKAGE_KINDS.has(a.kind));
  const pdf = existing.find((a) => a.kind === 'pdf');
  if (!pdf) throw permanent('not_rendered', 'Cannot package a version without a rendered PDF');
  const hints = def.listingHints(ctx, version.content);
  const tier = spec.license_tier;
  const { text: licenseText, settingsKey } = licenseTextFor(app, tier);
  const license = app.assets.write(`${dir}/LICENSE.txt`, licenseText, { productId: product.id, versionId, kind: 'license', role: 'deliverable', mime: 'text/plain', provenance: { generator: 'license-template', settingsKey, tier } });

  const fileList: { name: string; detail: string; data: Uint8Array; zipPath: string }[] = existing.map((a) => ({
    name: basename(a.rel_path),
    detail: a.kind === 'pdf' ? `${a.page_count} pages` : a.kind === 'xlsx' ? 'spreadsheet' : a.kind === 'csv' ? 'CSV data' : a.kind === 'artwork_svg' ? 'vector artwork' : a.kind === 'artwork_png' ? 'image' : '',
    data: app.assets.read(a),
    zipPath: basename(a.rel_path),
  }));
  if (def.id === 'bundle') {
    for (const m of (spec.params as { members: { versionId: string; productId: string }[] }).members) {
      const mp = getProduct(app.db, m.productId);
      for (const a of app.assets.forVersion(m.versionId, 'deliverable').filter((x) => !PACKAGE_KINDS.has(x.kind))) {
        fileList.push({ name: `${mp.slug}/${basename(a.rel_path)}`, detail: mp.title, data: app.assets.read(a), zipPath: `${mp.slug}/${basename(a.rel_path)}` });
      }
    }
  }
  const instructions = instructionsText(ctx, product.title, hints, [...fileList.map((f) => ({ name: f.name, detail: f.detail })), { name: 'LICENSE.txt', detail: 'usage terms' }]);
  const howTo = app.assets.write(`${dir}/HOW-TO-USE.txt`, instructions, { productId: product.id, versionId, kind: 'instructions', role: 'deliverable', mime: 'text/plain', provenance: { generator: 'instructions-template@1' } });
  const manifestTxt = [`${product.title} — file list`, '', ...fileList.map((f) => `${sha256(f.data).slice(0, 16)}  ${f.zipPath}`), `${license.sha256.slice(0, 16)}  LICENSE.txt`, `${howTo.sha256.slice(0, 16)}  HOW-TO-USE.txt`, ''].join('\n');
  const entries: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const f of fileList) entries[f.zipPath] = [f.data, { mtime: ZIP_MTIME }];
  entries['LICENSE.txt'] = [strToU8(licenseText), { mtime: ZIP_MTIME }];
  entries['HOW-TO-USE.txt'] = [strToU8(instructions), { mtime: ZIP_MTIME }];
  entries['MANIFEST.txt'] = [strToU8(manifestTxt), { mtime: ZIP_MTIME }];
  const zip = zipSync(entries, { level: 6 });
  app.assets.write(`${dir}/${product.slug}.zip`, zip, { productId: product.id, versionId, kind: 'package_zip', role: 'deliverable', mime: 'application/zip', provenance: { generator: 'fflate', entries: Object.keys(entries) } });

  const previews = app.assets.forVersion(versionId, 'preview');
  const images = await listingImages(app, ctx, product.title, hints, previews, pdf.page_count ?? 0);
  images.forEach((png, i) => app.assets.write(`${dir}/listing/image-${i + 1}.png`, png, { productId: product.id, versionId, kind: 'listing_png', role: 'listing_image', mime: 'image/png', widthPx: 2000, heightPx: 2000, pageIndex: i, provenance: { generator: 'listing-image@1', chrome: true, source: 'page previews' } }));

  // The marketing kit: pins and text for promoting the product. Kept as internal files, so it is never part of the download.
  const paperLabel = PAPER_LABEL[ctx.paper.size];
  const marketing: MarketingInput = { title: product.title, shopName: ctx.shopName, slug: product.slug, features: hints.features, included: hints.included, usage: hints.usage, keywords: hints.keywords, pageCount: pdf.page_count ?? 0, paperLabel, previewCount: previews.length };
  const [pa, pb] = PAPER_SIZES_MM[ctx.paper.size];
  const pinRatio = ctx.paper.orientation === 'landscape' ? pa / pb : pb / pa;
  const pins = await pinImages(app, ctx, product.title, hints, previews, pinRatio, pdf.page_count ?? 0, paperLabel);
  pins.forEach((png, i) => app.assets.write(`${dir}/marketing/pin-${i + 1}.png`, png, { productId: product.id, versionId, kind: 'marketing_pin', role: 'internal', mime: 'image/png', widthPx: 1000, heightPx: 1500, pageIndex: i, provenance: { generator: 'marketing-pin@1', chrome: true, source: 'page previews' } }));
  for (const [name, text] of [['pinterest-copy.txt', pinterestCopy(marketing)], ['launch-email.txt', launchEmail(marketing)], ['social-and-video.txt', socialAndVideo(marketing)]] as const) {
    app.assets.write(`${dir}/marketing/${name}`, text, { productId: product.id, versionId, kind: 'marketing_text', role: 'internal', mime: 'text/plain', provenance: { generator: 'marketing-text@1' } });
  }

  const all = app.assets.forVersion(versionId);
  const dh = deliverableHash(all);
  const runs = app.db.all('SELECT id, purpose, provider, model, input_tokens, output_tokens, image_count, cost_usd, cost_basis, status, started_at FROM generation_runs WHERE version_id = ? ORDER BY started_at', versionId);
  const manifest = {
    product: { id: product.id, slug: product.slug, title: product.title, type: product.product_type },
    version: { id: version.id, number: version.version_no, origin: version.origin, parent: version.parent_version_id, createdAt: version.created_at },
    specification: { params: spec.params, paper: spec.paper, designSystemId: spec.design_system_id, audienceId: spec.audience_id, themeId: spec.theme_id, seed: spec.seed, licenseTier: spec.license_tier, brief: spec.brief, briefFields: spec.brief_fields },
    contentProvenance: version.content_provenance,
    renderer: (version.render_diagnostics as { chromeVersion?: string } | null)?.chromeVersion ?? null,
    generationRuns: runs,
    files: all.map((a) => ({ path: a.rel_path, role: a.role, kind: a.kind, sha256: a.sha256, bytes: a.size_bytes, provenance: a.provenance })),
    deliverableHash: dh,
    packagedAt: new Date().toISOString(),
  };
  app.assets.write(`${dir}/internal/manifest.json`, JSON.stringify(manifest, null, 2), { productId: product.id, versionId, kind: 'manifest', role: 'internal', mime: 'application/json', provenance: { generator: 'packaging@1' } });
  updateVersion(app.db, versionId, { deliverable_hash: dh, stage: 'packaged' });
  return { deliverableHash: dh, files: all.length };
}
