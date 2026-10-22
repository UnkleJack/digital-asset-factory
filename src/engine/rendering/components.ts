import { html, raw, n, type SafeHtml } from './html.ts';
import { paperDimsMm, type DesignTokens, type Paper } from '../templates/library.ts';
import { daysInMonth, MONTH_NAMES, WEEKDAY_NAMES } from '../../core/time.ts';

export const COMPONENT_CSS = `
.ruled{flex:1 1 0;min-height:var(--rule);display:flex;flex-direction:column;overflow:hidden}
.ruled>div{flex:none;height:var(--rule);border-bottom:var(--lw) solid var(--line)}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));flex:1 1 0;min-height:0;border-top:var(--lw) solid var(--line);border-left:var(--lw) solid var(--line)}
.cal>div{border-right:var(--lw) solid var(--line);border-bottom:var(--lw) solid var(--line);padding:1mm 1.2mm;overflow:hidden;min-height:0;display:flex;flex-direction:column;gap:.5mm}
.cal .dow{background:var(--primary);color:var(--paper);font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:calc(var(--base)*.75);text-align:center;padding:1.2mm 0}
.cal .num{font-weight:700;font-size:calc(var(--base)*1.05);color:var(--ink);line-height:1}
.cal .out{background:var(--soft)}
.cal .wkend .num{color:var(--accent)}
.cal .hol{font-size:calc(var(--base)*.62);color:var(--primary);line-height:1.1;font-weight:600}
.mini{display:grid;grid-template-columns:repeat(7,1fr);gap:.4mm;font-size:calc(var(--base)*.62);text-align:center}
.mini b{color:var(--primary);font-weight:700}
.tb{display:flex;flex-direction:column;flex:1 1 0;min-height:0}
.tb>div{flex:1 1 0;display:flex;align-items:flex-end;border-bottom:var(--lw) solid var(--line);min-height:0;overflow:hidden}
.tb .t{width:13mm;flex:none;font-size:calc(var(--base)*.75);color:var(--muted);font-weight:600;padding-bottom:.5mm}
.chk{display:flex;flex-direction:column;flex:1 1 0;min-height:0}
.chk>div{flex:1 1 0;display:flex;align-items:center;gap:2.2mm;border-bottom:var(--lw) solid var(--line);min-height:0;max-height:12mm;overflow:hidden}
.chk .txt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:clip}
.chk .meta{font-size:calc(var(--base)*.72);color:var(--muted);flex:none}
.hab{width:100%;border-collapse:collapse;table-layout:fixed;flex:none}
.hab td,.hab th{border:var(--lw) solid var(--line);text-align:center;padding:0;overflow:hidden;white-space:nowrap}
.hab th{font-size:calc(var(--base)*.58);color:var(--muted);font-weight:600;height:5mm}
.hab td.name{text-align:left;padding:0 1.5mm;font-size:calc(var(--base)*.82);white-space:normal;line-height:1.05}
.hab .wk{background:var(--soft)}
.prompt{font-family:var(--headfont);font-style:italic;color:var(--primary)}
.cover{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6mm;border:calc(var(--lw)*2) solid var(--primary);border-radius:calc(var(--r)*2);padding:10mm}
.big{font-size:calc(var(--base)*4.2);line-height:1;font-weight:700;color:var(--primary)}
`;

export function page(body: SafeHtml | SafeHtml[], extraClass = ''): SafeHtml {
  return html`<section class="page ${extraClass}">${body}</section>`;
}

export function header(title: string, sub?: string, right?: SafeHtml | string): SafeHtml {
  return html`<header class="hdr"><div class="col" style="gap:1mm"><div class="h1">${title}</div>${sub ? html`<div class="sub">${sub}</div>` : ''}</div>${right ? html`<div class="col" style="align-items:flex-end;gap:1mm">${right}</div>` : ''}</header>`;
}

export function footer(left: string, right = ''): SafeHtml {
  return html`<footer class="footer"><span>${left}</span><span>${right}</span></footer>`;
}

export function labelLine(label: string): SafeHtml {
  return html`<div class="line"><span class="label" style="flex:none">${label}</span></div>`;
}

export function lines(count: number, cls = 'fill'): SafeHtml {
  if (cls === 'fill') return html`<div class="ruled"></div>`;
  return html`<div class="lines ${cls}">${Array.from({ length: Math.max(1, count) }, () => html`<div class="line"></div>`)}</div>`;
}

export function box(label: string, body: SafeHtml, cls = ''): SafeHtml {
  return html`<div class="box ${cls}"><div class="label">${label}</div>${body}</div>`;
}

export function checklist(items: { text: string; meta?: string }[], blankRows = 0): SafeHtml {
  const rows = [
    ...items.map((i) => html`<div><span class="cb"></span><span class="txt">${i.text}</span>${i.meta ? html`<span class="meta">${i.meta}</span>` : ''}</div>`),
    ...Array.from({ length: blankRows }, () => html`<div><span class="cb"></span><span class="txt"></span></div>`),
  ];
  return html`<div class="chk">${rows}</div>`;
}

export function table(columns: { label: string; widthPct: number }[], rows: string[][], blankRows: number, rowHeightMm: number): SafeHtml {
  const body = [
    ...rows.map((r) => html`<tr style="height:${n(rowHeightMm)}mm">${columns.map((_, i) => html`<td>${r[i] ?? ''}</td>`)}</tr>`),
    ...Array.from({ length: blankRows }, () => html`<tr style="height:${n(rowHeightMm)}mm">${columns.map(() => html`<td></td>`)}</tr>`),
  ];
  return html`<table class="grid"><colgroup>${columns.map((c) => html`<col style="width:${n(c.widthPct)}%">`)}</colgroup><thead><tr>${columns.map((c) => html`<th>${c.label}</th>`)}</tr></thead><tbody>${body}</tbody></table>`;
}

export function weekdayOrder(weekStart: 0 | 1): number[] {
  return weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
}

export function monthCells(year: number, month0: number, weekStart: 0 | 1): (number | null)[] {
  const first = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const offset = (first - weekStart + 7) % 7;
  const days = daysInMonth(year, month0);
  const cells: (number | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function monthGrid(year: number, month0: number, weekStart: 0 | 1, holidays: Record<number, string> = {}): SafeHtml {
  const cells = monthCells(year, month0, weekStart);
  const rows = cells.length / 7;
  const order = weekdayOrder(weekStart);
  return html`<div class="cal" style="grid-template-rows:auto repeat(${rows},minmax(0,1fr))">
    ${order.map((d) => html`<div class="dow">${WEEKDAY_NAMES[d].slice(0, 3)}</div>`)}
    ${cells.map((d, i) => {
      if (d === null) return html`<div class="out"></div>`;
      const dow = order[i % 7];
      const wk = dow === 0 || dow === 6;
      return html`<div class="${wk ? 'wkend' : ''}" data-day="${d}"><span class="num">${d}</span>${holidays[d] ? html`<span class="hol">${holidays[d]}</span>` : ''}</div>`;
    })}
  </div>`;
}

export function miniMonth(year: number, month0: number, weekStart: 0 | 1): SafeHtml {
  const order = weekdayOrder(weekStart);
  return html`<div class="col" style="gap:1mm"><div class="label">${MONTH_NAMES[month0]} ${year}</div><div class="mini">${order.map((d) => html`<b>${WEEKDAY_NAMES[d][0]}</b>`)}${monthCells(year, month0, weekStart).map((d) => html`<span>${d ?? ''}</span>`)}</div></div>`;
}

export function timeBlocks(startHour: number, endHour: number, stepMinutes: 30 | 60, hour12: boolean): SafeHtml {
  const rows: SafeHtml[] = [];
  for (let m = startHour * 60; m < endHour * 60; m += stepMinutes) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const label = min !== 0 ? '' : hour12 ? `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}` : `${String(h).padStart(2, '0')}:00`;
    rows.push(html`<div><span class="t">${label}</span></div>`);
  }
  return html`<div class="tb">${rows}</div>`;
}

export function habitGrid(habits: string[], days: number, blankRows: number, rowHeightMm: number, nameWidthPct = 28, tableWidthMm = 190): SafeHtml {
  const dayW = (100 - nameWidthPct) / days;
  const dayColMm = (tableWidthMm * dayW) / 100;
  const dayFontPt = Math.min(9, (dayColMm * 0.78) / 1.2 / 0.3528);
  const allRows = [...habits, ...Array.from({ length: blankRows }, () => '')];
  return html`<table class="hab"><colgroup><col style="width:${n(nameWidthPct)}%">${Array.from({ length: days }, () => html`<col style="width:${n(dayW, 3)}%">`)}</colgroup>
    <thead><tr><th style="text-align:left;padding-left:1.5mm">HABIT</th>${Array.from({ length: days }, (_, i) => html`<th style="font-size:${n(dayFontPt)}pt">${i + 1}</th>`)}</tr></thead>
    <tbody>${allRows.map((h) => html`<tr style="height:${n(rowHeightMm)}mm"><td class="name">${h}</td>${Array.from({ length: days }, (_, i) => html`<td class="${(i + 1) % 7 === 0 ? 'wk' : ''}"></td>`)}</tr>`)}</tbody></table>`;
}

const ORNAMENTS: Record<DesignTokens['ornament'], string> = {
  none: '',
  dots: '<svg width="22mm" height="4mm" viewBox="0 0 110 20"><g fill="currentColor"><circle cx="10" cy="10" r="4"/><circle cx="32" cy="10" r="3"/><circle cx="52" cy="10" r="5"/><circle cx="72" cy="10" r="3"/><circle cx="96" cy="10" r="4"/></g></svg>',
  leaf: '<svg width="24mm" height="6mm" viewBox="0 0 120 30"><g fill="none" stroke="currentColor" stroke-width="2"><path d="M5 15 H115"/><path d="M30 15 C35 3 50 3 55 15 C50 27 35 27 30 15Z"/><path d="M65 15 C70 3 85 3 90 15 C85 27 70 27 65 15Z"/></g></svg>',
  stars: '<svg width="22mm" height="6mm" viewBox="0 0 110 30"><g fill="currentColor"><path d="M15 3l3 8h8l-6 5 2 8-7-5-7 5 2-8-6-5h8z"/><path d="M55 6l2.4 6h6l-5 4 2 6-5.4-4-5.4 4 2-6-5-4h6z"/><path d="M95 3l3 8h8l-6 5 2 8-7-5-7 5 2-8-6-5h8z"/></g></svg>',
  waves: '<svg width="24mm" height="5mm" viewBox="0 0 120 24"><path d="M2 12 Q12 2 22 12 T42 12 T62 12 T82 12 T102 12 T118 12" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  geometric: '<svg width="22mm" height="5mm" viewBox="0 0 110 24"><g fill="currentColor"><rect x="4" y="6" width="12" height="12" transform="rotate(45 10 12)"/><rect x="34" y="8" width="42" height="8"/><rect x="94" y="6" width="12" height="12" transform="rotate(45 100 12)"/></g></svg>',
};

export function ornament(t: DesignTokens): SafeHtml {
  const svg = ORNAMENTS[t.ornament];
  return svg ? html`<span class="ornament">${raw(svg)}</span>` : html``;
}

export interface Space {
  widthMm: number;
  heightMm: number;
  bodyHeightMm: number;
  rowMm: number;
}

export function space(paper: Paper, t: DesignTokens, reservedMm = 30): Space {
  const { w, h } = paperDimsMm(paper);
  const m = t.marginsMm;
  const widthMm = w - m.left - m.right;
  const heightMm = h - m.top - m.bottom;
  const rowMm = Math.max(5.5, t.baseSizePt * 0.3528 * (t.density === 'airy' ? 2.5 : t.density === 'balanced' ? 2.2 : 1.95));
  return { widthMm, heightMm, bodyHeightMm: heightMm - reservedMm, rowMm };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const s = Math.max(1, size);
  for (let i = 0; i < items.length; i += s) out.push(items.slice(i, i + s));
  return out.length ? out : [[]];
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

export function pngDataUri(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

export function monthLabel(year: number, month0: number): string {
  return `${MONTH_NAMES[month0]} ${year}`;
}
