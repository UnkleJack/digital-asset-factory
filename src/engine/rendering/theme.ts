import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FONTS, type DesignTokens, type FontId, type Paper, paperDimsMm } from '../templates/library.ts';
import { n } from './html.ts';
import { COMPONENT_CSS } from './components.ts';

const fontCache = new Map<string, string>();

function fontDataUri(fontsDir: string, id: FontId, weight: number, style: 'normal' | 'italic'): string {
  const file = join(fontsDir, id, 'files', `${id}-latin-${weight}-${style}.woff2`);
  let b64 = fontCache.get(file);
  if (!b64) {
    b64 = readFileSync(file).toString('base64');
    fontCache.set(file, b64);
  }
  return `data:font/woff2;base64,${b64}`;
}

export function fontFaces(fontsDir: string, ids: FontId[]): string {
  const out: string[] = [];
  for (const id of [...new Set(ids)]) {
    const f = FONTS[id];
    for (const w of f.weights) {
      out.push(`@font-face{font-family:'${f.family}';src:url(${fontDataUri(fontsDir, id, w, 'normal')}) format('woff2');font-weight:${w};font-style:normal;font-display:block}`);
      if (f.italic && w === 400) {
        out.push(`@font-face{font-family:'${f.family}';src:url(${fontDataUri(fontsDir, id, w, 'italic')}) format('woff2');font-weight:${w};font-style:italic;font-display:block}`);
      }
    }
  }
  return out.join('\n');
}

export function fontStack(id: FontId): string {
  return `'${FONTS[id].family}', ${FONTS[id].fallback}`;
}

export function requiredFamilies(t: DesignTokens): string[] {
  return [...new Set([t.fonts.heading, t.fonts.body, t.fonts.accent].map((id) => FONTS[id].family))];
}

export function themeCss(t: DesignTokens, paper: Paper, fontsDir: string): string {
  const { w, h } = paperDimsMm(paper);
  const m = t.marginsMm;
  const b = t.baseSizePt;
  const gap = t.density === 'airy' ? 5 : t.density === 'balanced' ? 3.5 : 2.5;
  const lw = t.lineWeightPt;
  const p = t.palette;
  return `${fontFaces(fontsDir, [t.fonts.heading, t.fonts.body, t.fonts.accent])}
@page{size:${n(w)}mm ${n(h)}mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${p.paper}}
body{font-family:${fontStack(t.fonts.body)};color:${p.ink};font-size:${n(b)}pt;line-height:1.3;-webkit-print-color-adjust:exact;print-color-adjust:exact}
:root{--rule:${t.density === 'airy' ? 8 : t.density === 'balanced' ? 7 : 6.2}mm;--paper:${p.paper};--ink:${p.ink};--muted:${p.muted};--line:${p.line};--primary:${p.primary};--accent:${p.accent};--soft:${p.soft};--lw:${n(lw)}pt;--r:${n(t.radiusPt)}pt;--gap:${gap}mm;--base:${n(b)}pt}
.page{width:${n(w)}mm;height:${n(h)}mm;padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;position:relative;overflow:hidden;display:flex;flex-direction:column;gap:var(--gap);break-after:page;background:var(--paper)}
.page:last-child{break-after:auto}
.hdr{display:flex;align-items:flex-end;justify-content:space-between;gap:4mm;border-bottom:calc(var(--lw)*1.6) solid var(--primary);padding-bottom:2mm;flex:none}
.hdr-c{display:flex;flex-direction:column;align-items:center;text-align:center;gap:1mm;flex:none}
.h1{font-family:${fontStack(t.fonts.heading)};font-size:${n(b * t.headingScale)}pt;line-height:1.05;color:var(--primary);font-weight:700}
.h2{font-family:${fontStack(t.fonts.heading)};font-size:${n(b * 1.5)}pt;line-height:1.1;color:var(--primary);font-weight:600}
.h3{font-size:${n(b * 1.12)}pt;font-weight:600;color:var(--ink)}
.accent{font-family:${fontStack(t.fonts.accent)}}
.sub{color:var(--muted);font-size:${n(b * 0.95)}pt}
.small{font-size:${n(b * 0.8)}pt;color:var(--muted)}
.label{font-size:${n(b * 0.78)}pt;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600}
.box{border:var(--lw) solid var(--line);border-radius:var(--r);padding:2.5mm;display:flex;flex-direction:column;gap:1.5mm;min-height:0;overflow:hidden}
.soft{background:var(--soft);border-color:var(--soft)}
.fill{flex:1 1 0;min-height:0}
.row{display:flex;gap:var(--gap);min-height:0}
.col{display:flex;flex-direction:column;gap:var(--gap);min-height:0;min-width:0}
.grow{flex:1 1 0;min-width:0;min-height:0}
.lines{display:flex;flex-direction:column;min-height:0;overflow:hidden}
.line{flex:1 1 0;border-bottom:var(--lw) solid var(--line);min-height:6mm;display:flex;align-items:flex-end;gap:2mm;padding-bottom:.6mm;overflow:hidden}
.cb{width:${n(b * 0.36)}mm;height:${n(b * 0.36)}mm;border:calc(var(--lw)*1.3) solid var(--primary);border-radius:calc(var(--r)/3);flex:none;display:inline-block}
.dot{width:1.6mm;height:1.6mm;border-radius:50%;background:var(--accent);display:inline-block;flex:none}
table.grid{width:100%;border-collapse:collapse;table-layout:fixed}
table.grid th{font-size:${n(b * 0.8)}pt;font-variant-caps:all-small-caps;letter-spacing:.02em;color:var(--paper);background:var(--primary);font-weight:600;padding:1.2mm 1.5mm;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:clip}
table.grid td{border:var(--lw) solid var(--line);padding:1mm 1.5mm;vertical-align:top;overflow:hidden;font-size:${n(b * 0.9)}pt}
.footer{flex:none;display:flex;justify-content:space-between;font-size:${n(b * 0.68)}pt;color:var(--muted)}
.ornament{color:var(--accent);flex:none;display:inline-flex}
.center{text-align:center;align-items:center;justify-content:center}
.pill{display:inline-block;padding:.6mm 2.5mm;border-radius:20mm;background:var(--soft);color:var(--primary);font-size:${n(b * 0.8)}pt;font-weight:600}
.art{display:flex;align-items:center;justify-content:center;flex:1 1 0;min-height:0;overflow:hidden}
.art svg,.art img{max-width:100%;max-height:100%;display:block}
:root{--headfont:${fontStack(t.fonts.heading)}}
${COMPONENT_CSS}`;
}

export const RENDER_CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:";

export function documentHtml(css: string, pages: string[], title: string): string {
  const safeTitle = title.replace(/[<>&"]/g, '');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${RENDER_CSP}"><title>${safeTitle}</title><style>${css}</style></head><body>${pages.join('\n')}</body></html>`;
}
