import { z } from 'zod';
import { html, type SafeHtml } from '../rendering/html.ts';
import { page, svgDataUri } from '../rendering/components.ts';
import { generatePattern, contrastRatio, PATTERN_FAMILIES, PATTERN_VARIANTS, MAX_ELEMENTS, MIN_LINE_CONTRAST, type PatternFamily } from '../generation/patterns.ts';
import { shuffle, type ArtworkItem, type ProductTypeDefinition, type QaFinding, type TypeContext } from './types.ts';
import { coverPage, stdFooter, baseHints, PRINT_USAGE } from './common.ts';
import { paperDimsMm, type Paper } from '../templates/library.ts';

/*
 * Geometric pattern art (2026-10-28 plan, task B3; locked decisions D1 and D2).
 *
 * One product type with a `family` setting (D2) and a `mode` setting (D1):
 * - coloring: black-on-white line art pages with a page title, for adult coloring books;
 * - print: decor and wall-art prints filled with the design system's colors, the art alone on the page.
 * The QA profile and the listing copy follow the mode.
 */

const FAMILY_LABEL: Record<PatternFamily, string> = {
  tessellate: 'Tessellation', girih: 'Star and Cross', opart: 'Op Art', truchet: 'Truchet Tile', guilloche: 'Guilloche', fractal: 'Fractal', lace: 'Lace', herringbone: 'Herringbone',
};
const FAMILY_KEYWORDS: Record<PatternFamily, string[]> = {
  tessellate: ['tessellation', 'hexagon pattern'], girih: ['star pattern', 'islamic geometric pattern'], opart: ['op art', 'optical illusion art'], truchet: ['truchet tiles', 'maze pattern'],
  guilloche: ['spirograph art', 'guilloche'], fractal: ['fractal art', 'sierpinski'], lace: ['flower of life', 'scallop pattern'], herringbone: ['herringbone pattern', 'chevron pattern'],
};
const NAME_A = ['Prism', 'Facet', 'Mosaic', 'Lattice', 'Tile', 'Weave', 'Ripple', 'Vertex', 'Orbit', 'Grid', 'Spiral', 'Echo'];
const NAME_B = ['Field', 'Garden', 'Study', 'Path', 'Bloom', 'Current', 'Window', 'Rhythm', 'Drift', 'Frame', 'Pulse', 'Harbor'];

const PatternParams = z.object({
  pages: z.number().int().min(1).max(30).default(8),
  /** Which family of patterns. Each page picks one of the family's variants from its seed. */
  family: z.enum(PATTERN_FAMILIES).default('tessellate'),
  /** coloring = black line art to color in; print = wall-art prints in the design system's colors. */
  mode: z.enum(['coloring', 'print']).default('coloring'),
  density: z.enum(['light', 'medium', 'dense']).default('medium'),
  /** Print mode only: light lines on a dark ground. Ignored for coloring pages, which stay black on white. */
  invert: z.boolean().default(false),
  cover: z.boolean().default(true),
});
type PatternP = z.infer<typeof PatternParams>;
const PatternContent = z.object({ coverSubtitle: z.string().min(3).max(90), pageTitles: z.array(z.string().min(2).max(40)).min(1).max(30) });
type PatternC = z.infer<typeof PatternContent>;

/**
 * Print thresholds. Starting values, not yet checked against real prints: lines under 0.2 mm break up on home
 * printers, and coloring cells under 2.5 mm are too small to color. Segments are capped so files stay quick to open.
 */
export const PATTERN_PRINT = { minStrokeMm: 0.2, minColoringCellMm: 2.5, maxSegments: 60000 } as const;

/** The art box on the page, in mm: inside the margins, less the title row and footer on coloring pages. */
export function patternBoxMm(ctx: { paper: Paper; params: { mode: 'coloring' | 'print' }; tokens: { marginsMm: { top: number; right: number; bottom: number; left: number } } }): { w: number; h: number } {
  const { w, h } = paperDimsMm(ctx.paper);
  const m = ctx.tokens.marginsMm;
  return { w: w - m.left - m.right, h: h - m.top - m.bottom - (ctx.params.mode === 'coloring' ? 24 : 2) };
}

const STROKE_MM = { coloring: { light: 0.55, medium: 0.45, dense: 0.35 }, print: { light: 0.35, medium: 0.3, dense: 0.25 } } as const;

interface PatternProv {
  family?: string;
  variant?: string;
  mode?: string;
  width?: number;
  height?: number;
  elements?: number;
  segments?: number;
  cell?: number;
  strokeWidth?: number;
  lineColor?: string;
  backgroundColor?: string;
  capped?: boolean;
}

export const geometricPatternArt: ProductTypeDefinition<PatternP, PatternC> = {
  id: 'geometric-pattern-art',
  name: 'Geometric pattern art',
  family: 'printable',
  category: 'Geometric Patterns',
  description: 'Seed-reproducible geometric patterns in 8 families (tessellations, star-and-cross, op art, Truchet, guilloche, fractals, lace, herringbone), as coloring line art or wall-art prints.',
  paramsSchema: PatternParams,
  contentSchema: PatternContent,
  defaultParams: () => PatternParams.parse({}),
  defaultTitle: (ctx) => `Geometric ${FAMILY_LABEL[ctx.params.family]} ${ctx.params.mode === 'coloring' ? 'Coloring Pages' : 'Wall Art Prints'}`,
  aiContent: false,
  artwork: 'procedural',
  variationAxes: ['family', 'mode', 'density', 'seed', 'paper', 'design'],
  deterministicContent: (ctx, rand) => {
    const a = shuffle(rand, NAME_A), b = shuffle(rand, NAME_B);
    return {
      coverSubtitle: ctx.params.mode === 'coloring' ? `${ctx.params.pages} ${FAMILY_LABEL[ctx.params.family].toLowerCase()} patterns to color` : `${ctx.params.pages} printable ${FAMILY_LABEL[ctx.params.family].toLowerCase()} art prints`,
      pageTitles: Array.from({ length: ctx.params.pages }, (_, i) => `${a[i % a.length]} ${b[(i + Math.floor(i / b.length)) % b.length]}`),
    };
  },
  async generateArtwork(ctx) {
    const box = patternBoxMm(ctx);
    const unitsPerMm = 1000 / box.w;
    const strokeWidth = Math.max(STROKE_MM[ctx.params.mode][ctx.params.density], PATTERN_PRINT.minStrokeMm) * unitsPerMm;
    const pal = ctx.tokens.palette;
    const fills = [...new Set([pal.primary, pal.accent, pal.line, pal.soft])].filter((f) => f.toLowerCase() !== pal.paper.toLowerCase());
    // Variants are dealt out in turn from a seed-picked start, so a pack shows every variant of its family.
    const variants = PATTERN_VARIANTS[ctx.params.family];
    const start = ctx.seed % variants.length;
    return Array.from({ length: ctx.params.pages }, (_, i) => {
      const seed = ctx.seed + i * 6151;
      const { svg, stats } = generatePattern(seed, {
        family: ctx.params.family, density: ctx.params.density, mode: ctx.params.mode, invert: ctx.params.invert, height: (1000 * box.h) / box.w,
        palette: { ink: pal.ink, paper: pal.paper, fills: fills.length ? fills : [pal.ink] }, strokeWidth, variant: variants[(start + i) % variants.length],
      });
      return {
        name: `pattern-${String(i + 1).padStart(2, '0')}.svg`,
        kind: 'svg' as const,
        data: svg,
        role: 'deliverable' as const,
        provenance: { generator: 'procedural-pattern@1', seed, ...stats },
      };
    });
  },
  render(ctx, content, art) {
    const pages: SafeHtml[] = [];
    if (ctx.params.cover) pages.push(coverPage(ctx, ctx.title, content.coverSubtitle, html`<div style="width:70mm;height:90mm" class="art"><img src="${svgDataUri(String(art[0]?.data ?? ''))}"></div>`));
    art.forEach((a, i) => {
      if (ctx.params.mode === 'coloring') pages.push(page(html`<div class="row" style="justify-content:space-between;align-items:baseline;flex:none"><span class="h3">${content.pageTitles[i] ?? ''}</span><span class="small">${i + 1}</span></div><div class="art"><img src="${svgDataUri(String(a.data))}"></div>${stdFooter(ctx, '')}`));
      // Wall art is the picture alone: no title or footer printed on the art.
      else pages.push(page(html`<div class="art"><img src="${svgDataUri(String(a.data))}"></div>`));
    });
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.pages + (ctx.params.cover ? 1 : 0),
  consistencyChecks: (ctx, c, art) => patternChecks(ctx, art, c.pageTitles.length),
  qaText: (c) => [c.coverSubtitle, ...c.pageTitles],
  listingHints: (ctx) => {
    const fam = FAMILY_LABEL[ctx.params.family].toLowerCase();
    const files = [`1 PDF (${ctx.params.pages + (ctx.params.cover ? 1 : 0)} pages)`, `${ctx.params.pages} SVG files`];
    if (ctx.params.mode === 'coloring') {
      return baseHints(ctx, ['geometric pattern', 'geometric coloring pages', 'adult coloring pages', 'pattern coloring book', ...FAMILY_KEYWORDS[ctx.params.family]],
        [`${ctx.params.pages} ${fam} patterns to color`, `${ctx.params.density} density`, 'Clean black-and-white line art', 'SVG files included for digital coloring and cutting machines'], files, PRINT_USAGE);
    }
    return baseHints(ctx, ['geometric wall art', 'pattern art print', 'printable wall art', 'geometric print', 'modern wall decor', ...FAMILY_KEYWORDS[ctx.params.family]],
      [`${ctx.params.pages} ${fam} art prints`, ctx.params.invert ? 'Light lines on a dark ground' : 'Printed in the colors shown', 'Vector SVG files that scale to any frame size'], files,
      'Download the PDF and print it at 100% scale (actual size) on matte or photo paper, or open an SVG file to print it larger. Frame it, or trim to fit your frame. For personal use.');
  },
};

/** Plugin-level QA for pattern pages (plan task B3). The profile follows the mode (decision D1). */
export function patternChecks(ctx: TypeContext<PatternP>, art: ArtworkItem[], titles: number): QaFinding[] {
  const box = patternBoxMm(ctx);
  const toMm = (units: number) => (units * box.w) / 1000;
  const prov = (a: ArtworkItem) => a.provenance as PatternProv;
  const invalid: string[] = [];
  for (const a of art) {
    const svg = String(a.data);
    const p = prov(a);
    const problems: string[] = [];
    if (!svg.startsWith('<svg ') || !svg.endsWith('</svg>')) problems.push('not a complete SVG');
    if (!new RegExp(`viewBox="0 0 ${p.width} ${p.height}"`).test(svg) || !(Number(p.width) > 0 && Number(p.height) > 0)) problems.push('drawing box does not match');
    if (!svg.includes('<clipPath id="pclip">') || !svg.includes('clip-path="url(#pclip)"')) problems.push('not clipped to its drawing box');
    if (/NaN|Infinity|undefined/.test(svg)) problems.push('bad numbers');
    const open = (svg.match(/<(svg|g|defs|clipPath)\b/g) ?? []).length;
    const close = (svg.match(/<\/(svg|g|defs|clipPath)>/g) ?? []).length;
    if (open !== close) problems.push('unbalanced tags');
    if (p.family !== ctx.params.family) problems.push(`family ${p.family}, expected ${ctx.params.family}`);
    if (p.mode !== ctx.params.mode) problems.push(`mode ${p.mode}, expected ${ctx.params.mode}`);
    if (problems.length) invalid.push(`${a.name}: ${problems.join(', ')}`);
  }
  const dense = art.filter((a) => (prov(a).elements ?? 0) > MAX_ELEMENTS || prov(a).capped || (prov(a).segments ?? 0) > PATTERN_PRINT.maxSegments || (ctx.params.mode === 'coloring' && toMm(prov(a).cell ?? 0) < PATTERN_PRINT.minColoringCellMm))
    .map((a) => `${a.name} (${prov(a).variant}: ${prov(a).elements} shapes, cells about ${toMm(prov(a).cell ?? 0).toFixed(1)} mm${prov(a).capped ? ', stopped at the shape limit' : ''})`);
  const thin = art.filter((a) => toMm(prov(a).strokeWidth ?? 0) + 1e-9 < PATTERN_PRINT.minStrokeMm).map((a) => a.name);
  const findings: QaFinding[] = [
    { code: 'artwork_count', severity: 'hard', passed: art.length === ctx.params.pages, message: `${art.length} patterns for ${ctx.params.pages} pages` },
    { code: 'content_count', severity: 'hard', passed: titles >= ctx.params.pages, message: `${titles} titles` },
    { code: 'pattern_valid', severity: 'hard', passed: invalid.length === 0, message: invalid.length ? invalid.join('; ') : `Every pattern is a complete SVG clipped to its drawing box, ${ctx.params.family} family`, details: invalid },
    { code: 'pattern_min_stroke', severity: 'hard', passed: thin.length === 0, message: thin.length ? `Lines thinner than ${PATTERN_PRINT.minStrokeMm} mm when printed: ${thin.join(', ')}` : `Lines at least ${PATTERN_PRINT.minStrokeMm} mm when printed ${box.w.toFixed(0)} mm wide` },
    {
      code: 'pattern_density', severity: 'warning', passed: dense.length === 0,
      message: dense.length ? `Possibly too packed: ${dense.join(', ')}` : ctx.params.mode === 'coloring' ? `Every pattern is within the shape limit, with cells at least ${PATTERN_PRINT.minColoringCellMm} mm to color` : 'Every pattern is within the shape limit',
      details: dense,
    },
  ];
  if (ctx.params.mode === 'coloring') {
    const colours = art.flatMap((a) => [...String(a.data).matchAll(/\b(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1].toLowerCase()).filter((v) => !['#ffffff', '#000000', 'none'].includes(v)).map((v) => `${a.name}: ${v}`));
    findings.push({ code: 'pattern_line_art', severity: 'hard', passed: colours.length === 0, message: colours.length ? `Coloring pages must be black lines on white: ${[...new Set(colours)].slice(0, 6).join(', ')}` : 'Black lines on white only', details: colours.slice(0, 20) });
  } else {
    const low = art.filter((a) => contrastRatio(prov(a).lineColor ?? '#000000', prov(a).backgroundColor ?? '#ffffff') < MIN_LINE_CONTRAST)
      .map((a) => `${a.name} (${contrastRatio(prov(a).lineColor ?? '#000000', prov(a).backgroundColor ?? '#ffffff').toFixed(1)}:1)`);
    findings.push({ code: 'pattern_contrast', severity: 'hard', passed: low.length === 0, message: low.length ? `Lines too close to the background color: ${low.join(', ')} (need ${MIN_LINE_CONTRAST}:1)` : `Lines stand out from the background by at least ${MIN_LINE_CONTRAST}:1${ctx.paper.grayscale ? ', in grayscale' : ''}` });
  }
  return findings;
}
