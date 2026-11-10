import { z } from 'zod';
import { html, raw, n, type SafeHtml } from '../rendering/html.ts';
import { page, header, chunk, pngDataUri, svgDataUri, ornament } from '../rendering/components.ts';
import { fontStack } from '../rendering/theme.ts';
import { mandalaDesign, generateMaze, mazeSvg, mazeStats, generateWordSearch, wordSearchSvg } from '../generation/procedural.ts';
import { WORD_LISTS, wordListKey, COLORING_SUBJECTS, coloringKey } from './library.ts';
import { AI_SYSTEM_BASE, audienceLine, themeLine, revisionClause, shuffle, type ArtworkItem, type ProductTypeDefinition, type QaFinding, type TypeContext } from './types.ts';
import { DETAILS, SYMMETRIES, type Detail } from '../generation/mandala/compose.ts';
import { MOTIF_SETS, type MotifSet } from '../generation/mandala/motifs.ts';
import { paperDimsMm, type Paper } from '../templates/library.ts';
import { coverPage, stdFooter, baseHints, PRINT_USAGE } from './common.ts';
import { ProviderError } from '../../core/errors.ts';

const NAME_A = ['Lotus', 'Sun', 'Star', 'Moon', 'Garden', 'Ocean', 'Petal', 'Crystal', 'Wind', 'Ember', 'Fern', 'River'];
const NAME_B = ['Bloom', 'Wheel', 'Circle', 'Dream', 'Harmony', 'Ripple', 'Crown', 'Spiral', 'Window', 'Lantern', 'Compass', 'Echo'];

// ---------------------------------------------------------------- mandala coloring

const MandalaParams = z.object({
  pages: z.number().int().min(1).max(30).default(10),
  /** simple 3 rings, medium 5, detailed 7, intricate 10 (plus sub-rings, richer centres and borders). */
  detail: z.enum(DETAILS as [Detail, ...Detail[]]).optional(),
  /** How many times the design repeats around its centre; "auto" lets each page pick one that suits the detail level. */
  symmetry: z.union([z.literal('auto'), ...SYMMETRIES.map((n) => z.literal(n))]).default('auto'),
  motifSet: z.enum(Object.keys(MOTIF_SETS) as [MotifSet, ...MotifSet[]]).default('classic'),
  cover: z.boolean().default(true),
  /** The setting before procedural-mandala@2. Still read from older products, and becomes `detail`. */
  complexity: z.enum(['simple', 'medium', 'detailed']).optional(),
}).transform(({ pages, detail, complexity, symmetry, motifSet, cover }) => ({ pages, detail: detail ?? complexity ?? 'medium', symmetry, motifSet, cover }));
type MandalaP = z.infer<typeof MandalaParams>;
const MandalaContent = z.object({ coverSubtitle: z.string().min(3).max(90), pageTitles: z.array(z.string().min(2).max(40)).min(1).max(30) });
type MandalaC = z.infer<typeof MandalaContent>;

/**
 * Print thresholds for mandala line art. Starting values chosen for home inkjet and laser printers, not yet
 * tuned against real prints (plan risk R-2): lines thinner than about 0.2 mm break up, rings thinner than 2 mm
 * are hard to color, and past about 20,000 path segments a page is more texture than shapes.
 */
export const MANDALA_PRINT = { minStrokeMm: 0.2, minBandMm: 2, maxSegments: 20000 } as const;

/**
 * About how wide a mandala prints, in mm: the square that fits inside the margins below the title row and above
 * the footer. Errs small, so stroke and ring checks err on the safe side.
 */
export function mandalaPrintMm(ctx: { paper: Paper; tokens: { marginsMm: { top: number; right: number; bottom: number; left: number } } }): number {
  const { w, h } = paperDimsMm(ctx.paper);
  const m = ctx.tokens.marginsMm;
  return Math.min(w - m.left - m.right, h - m.top - m.bottom - 24);
}

interface MandalaProv {
  generator?: string;
  maxExtent?: number;
  minStrokeWidth?: number;
  minBandDepth?: number;
  segments?: number;
}

const DETAIL_WORD: Record<Detail, string> = { simple: 'Easy ', medium: '', detailed: 'Detailed ', intricate: 'Intricate ' };

export const mandalaColoring: ProductTypeDefinition<MandalaP, MandalaC> = {
  id: 'mandala-coloring',
  name: 'Mandala coloring pages',
  family: 'activity',
  category: 'Coloring Pages',
  description: 'Procedurally generated, seed-reproducible mandala line art: 14 motifs, mirror symmetry, four detail levels.',
  paramsSchema: MandalaParams,
  contentSchema: MandalaContent,
  defaultParams: () => MandalaParams.parse({}),
  defaultTitle: (ctx) => `${DETAIL_WORD[ctx.params.detail]}${ctx.params.motifSet === 'classic' ? '' : ctx.params.motifSet[0].toUpperCase() + ctx.params.motifSet.slice(1) + ' '}Mandala Coloring Pages`,
  aiContent: false,
  artwork: 'procedural',
  variationAxes: ['detail', 'symmetry', 'motifSet', 'seed', 'paper'],
  deterministicContent: (ctx, rand) => {
    const a = shuffle(rand, NAME_A), b = shuffle(rand, NAME_B);
    return {
      coverSubtitle: `${ctx.params.pages} original designs to color`,
      pageTitles: Array.from({ length: ctx.params.pages }, (_, i) => `${a[i % a.length]} ${b[(i + Math.floor(i / b.length)) % b.length]}`),
    };
  },
  async generateArtwork(ctx) {
    // The thinnest line allowed, in the 1000-unit drawing box, so no line prints under the threshold on this paper.
    const minStrokeWidth = (MANDALA_PRINT.minStrokeMm * 1000) / mandalaPrintMm(ctx);
    return Array.from({ length: ctx.params.pages }, (_, i) => {
      const seed = ctx.seed + i * 7919;
      const { svg, stats } = mandalaDesign(seed, { detail: ctx.params.detail, symmetry: ctx.params.symmetry === 'auto' ? undefined : ctx.params.symmetry, motifSet: ctx.params.motifSet, minStrokeWidth });
      return {
        name: `mandala-${String(i + 1).padStart(2, '0')}.svg`,
        kind: 'svg' as const,
        data: svg,
        role: 'deliverable' as const,
        provenance: {
          generator: 'procedural-mandala@2', seed, detail: stats.detail, symmetry: stats.symmetry, motifSet: stats.motifSet, center: stats.center, border: stats.border, lineStyle: stats.lineStyle,
          motifs: [...new Set(stats.bands.map((b) => b.motif))], maxExtent: stats.maxExtent, minStrokeWidth: stats.minStrokeWidth, minBandDepth: stats.minBandDepth, segments: stats.segments,
        },
      };
    });
  },
  render(ctx, content, art) {
    const pages: SafeHtml[] = [];
    if (ctx.params.cover) pages.push(coverPage(ctx, ctx.title, content.coverSubtitle, html`<div style="width:70mm;height:70mm"><img src="${svgDataUri(String(art[0]?.data ?? ''))}" style="width:100%;height:100%"></div>`));
    art.forEach((a, i) => pages.push(page(html`<div class="row" style="justify-content:space-between;align-items:baseline;flex:none"><span class="h3">${content.pageTitles[i] ?? ''}</span><span class="small">${i + 1}</span></div><div class="art"><img src="${svgDataUri(String(a.data))}"></div>${stdFooter(ctx, '')}`)));
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.pages + (ctx.params.cover ? 1 : 0),
  consistencyChecks: (ctx, c, art) => mandalaChecks(ctx, art, c.pageTitles.length),
  qaText: (c) => [c.coverSubtitle, ...c.pageTitles],
  listingHints: (ctx) => baseHints(ctx, ['mandala coloring pages', 'adult coloring pages', 'coloring book printable', 'mindfulness coloring', ...(ctx.params.motifSet === 'classic' ? [] : [`${ctx.params.motifSet} mandala`])],
    [`${ctx.params.pages} unique mandala designs`, `${ctx.params.detail} detail level`, ctx.params.symmetry === 'auto' ? 'Mirror-symmetric designs' : `${ctx.params.symmetry}-fold mirror symmetry`, 'Crisp vector line art', 'SVG files included for digital coloring and cutting machines'], [`1 PDF (${ctx.params.pages + (ctx.params.cover ? 1 : 0)} pages)`, `${ctx.params.pages} SVG files`], PRINT_USAGE),
};

/** Plugin-level QA for mandala pages (plan task A5). Designs from the first generator (@1) carry no measurements and are counted, not measured. */
export function mandalaChecks(ctx: TypeContext<MandalaP>, art: ArtworkItem[], titles: number): QaFinding[] {
  const mm = mandalaPrintMm(ctx);
  const toMm = (units: number) => (units * mm) / 1000;
  const measured = art.filter((a) => typeof (a.provenance as MandalaProv).maxExtent === 'number');
  const older = art.length - measured.length;
  const olderNote = older ? ` (${older} older design(s) from procedural-mandala@1 not measured)` : '';
  const prov = (a: ArtworkItem) => a.provenance as MandalaProv;

  const outside = measured.filter((a) => (prov(a).maxExtent ?? 0) > 500 || !/viewBox="0 0 1000 1000"/.test(String(a.data))).map((a) => a.name);
  const thin = measured.filter((a) => toMm(prov(a).minStrokeWidth ?? 0) + 1e-9 < MANDALA_PRINT.minStrokeMm).map((a) => `${a.name} (${toMm(prov(a).minStrokeWidth ?? 0).toFixed(2)} mm)`);
  const dense = measured.filter((a) => (prov(a).segments ?? 0) > MANDALA_PRINT.maxSegments || toMm(prov(a).minBandDepth ?? 0) < MANDALA_PRINT.minBandMm)
    .map((a) => `${a.name} (${prov(a).segments} segments, thinnest ring ${toMm(prov(a).minBandDepth ?? 0).toFixed(1)} mm)`);
  const colours = art.filter((a) => a.kind === 'svg').flatMap((a) => [...String(a.data).matchAll(/\b(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1].toLowerCase()).filter((v) => !['#ffffff', '#000000', 'none'].includes(v)).map((v) => `${a.name}: ${v}`));
  const broken = art.filter((a) => a.kind === 'svg').flatMap((a) => {
    const svg = String(a.data);
    const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    return [...new Set([...svg.matchAll(/\bhref="#([^"]+)"/g)].map((m) => m[1]))].filter((id) => !ids.has(id)).map((id) => `${a.name}: #${id}`);
  });
  const lowest = measured.length ? Math.min(...measured.map((a) => toMm(prov(a).minStrokeWidth ?? 0))) : null;
  return [
    { code: 'artwork_count', severity: 'hard', passed: art.length === ctx.params.pages, message: `${art.length} designs for ${ctx.params.pages} pages` },
    { code: 'content_count', severity: 'hard', passed: titles >= ctx.params.pages, message: `${titles} titles` },
    { code: 'mandala_viewbox', severity: 'hard', passed: outside.length === 0, message: outside.length ? `Lines reach past the drawing box: ${outside.join(', ')}` : `Every line stays inside the 1000 x 1000 drawing box${olderNote}`, details: outside },
    { code: 'mandala_min_stroke', severity: 'hard', passed: thin.length === 0, message: thin.length ? `Lines thinner than ${MANDALA_PRINT.minStrokeMm} mm when printed: ${thin.join(', ')}` : `Thinnest line about ${lowest === null ? '?' : lowest.toFixed(2)} mm when printed ${mm.toFixed(0)} mm wide (minimum ${MANDALA_PRINT.minStrokeMm} mm)${olderNote}`, details: { printWidthMm: Math.round(mm), thin } },
    { code: 'mandala_density', severity: 'warning', passed: dense.length === 0, message: dense.length ? `Possibly too packed to color: ${dense.join(', ')} (limits ${MANDALA_PRINT.maxSegments} segments, rings at least ${MANDALA_PRINT.minBandMm} mm)` : `Every design is within ${MANDALA_PRINT.maxSegments} path segments with rings at least ${MANDALA_PRINT.minBandMm} mm deep when printed${olderNote}`, details: dense },
    { code: 'mandala_line_art', severity: 'hard', passed: colours.length === 0 && broken.length === 0, message: colours.length || broken.length ? `Not clean line art: ${[...colours.slice(0, 5), ...broken.slice(0, 5).map((b) => `missing shape ${b}`)].join(', ')}` : 'Black lines on white only, and every repeated shape is defined', details: { colours, broken } },
  ];
}

// ---------------------------------------------------------------- maze activity

const MazeParams = z.object({
  pages: z.number().int().min(1).max(30).default(10),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  solutions: z.boolean().default(true),
});
type MazeP = z.infer<typeof MazeParams>;
const MazeContent = z.object({ instructions: z.string().min(5).max(120), pageTitles: z.array(z.string().min(2).max(40)).min(1).max(30) });
type MazeC = z.infer<typeof MazeContent>;
const MAZE_SIZE = { easy: [10, 13], medium: [16, 21], hard: [24, 32] } as const;

export const mazeActivity: ProductTypeDefinition<MazeP, MazeC> = {
  id: 'maze-activity',
  name: 'Maze activity book',
  family: 'activity',
  category: 'Kids Activities',
  description: 'Solvable perfect mazes with answer keys.',
  paramsSchema: MazeParams,
  contentSchema: MazeContent,
  defaultParams: () => MazeParams.parse({}),
  defaultTitle: (ctx) => `${ctx.params.difficulty[0].toUpperCase() + ctx.params.difficulty.slice(1)} Maze Puzzles`,
  aiContent: false,
  artwork: 'procedural',
  variationAxes: ['difficulty', 'seed', 'design'],
  deterministicContent: (ctx) => ({ instructions: 'Start at the top arrow and find your way to the bottom arrow.', pageTitles: Array.from({ length: ctx.params.pages }, (_, i) => `Maze ${i + 1}`) }),
  async generateArtwork(ctx) {
    const [c, r] = MAZE_SIZE[ctx.params.difficulty];
    const out: ArtworkItem[] = [];
    for (let i = 0; i < ctx.params.pages; i++) {
      const seed = ctx.seed + i * 104729;
      const m = generateMaze(c, r, seed);
      const style = { stroke: ctx.tokens.palette.ink, accent: ctx.tokens.palette.accent, strokeWidth: ctx.params.difficulty === 'hard' ? 2 : 3 };
      out.push({ name: `maze-${i + 1}.svg`, kind: 'svg', data: mazeSvg(m, style), role: 'source', provenance: { generator: 'procedural-maze@1', seed, cols: c, rows: r, ...mazeStats(m) } });
      out.push({ name: `maze-${i + 1}-solution.svg`, kind: 'svg', data: mazeSvg(m, { ...style, solution: true }), role: 'source', provenance: { generator: 'procedural-maze@1', seed, solution: true } });
    }
    return out;
  },
  render(ctx, content, art) {
    const mazes = art.filter((a) => !a.name.includes('solution'));
    const sols = art.filter((a) => a.name.includes('solution'));
    const pages: SafeHtml[] = mazes.map((a, i) => page(html`${header(content.pageTitles[i] ?? `Maze ${i + 1}`, content.instructions, ornament(ctx.tokens))}<div class="art"><img src="${svgDataUri(String(a.data))}"></div>${stdFooter(ctx, ctx.title)}`));
    if (ctx.params.solutions) {
      chunk(sols, 4).forEach((group, gi) => pages.push(page(html`${header('Answer key', `Solutions ${gi * 4 + 1}–${gi * 4 + group.length}`)}<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:4mm;flex:1;min-height:0">${group.map((a, k) => html`<div class="col" style="min-height:0;gap:1mm"><span class="label">${content.pageTitles[gi * 4 + k] ?? ''}</span><div class="art"><img src="${svgDataUri(String(a.data))}"></div></div>`)}</div>${stdFooter(ctx, ctx.title)}`)));
    }
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.pages + (ctx.params.solutions ? Math.ceil(ctx.params.pages / 4) : 0),
  consistencyChecks: (ctx, _c, art) => {
    const bad = art.filter((a) => !a.name.includes('solution') && !(a.provenance.perfect && a.provenance.solvable)).map((a) => a.name);
    return [
      { code: 'maze_solvable', severity: 'hard', passed: bad.length === 0, message: bad.length ? `Not perfect/solvable: ${bad.join(', ')}` : 'Every maze is a perfect maze with exactly one solution' },
      { code: 'artwork_count', severity: 'hard', passed: art.length === ctx.params.pages * 2, message: `${art.length / 2} mazes for ${ctx.params.pages} pages` },
    ];
  },
  qaText: (c) => [c.instructions, ...c.pageTitles],
  listingHints: (ctx) => baseHints(ctx, ['maze puzzles', 'kids activity pages', 'printable mazes', 'brain games'],
    [`${ctx.params.pages} ${ctx.params.difficulty} mazes`, 'Every maze verified to have exactly one solution', ctx.params.solutions ? 'Answer key included' : 'No answer key'], ['1 PDF'], PRINT_USAGE),
};

// ---------------------------------------------------------------- word search

const WsParams = z.object({
  puzzles: z.number().int().min(1).max(30).default(8),
  gridSize: z.number().int().min(8).max(20).default(14),
  wordsPerPuzzle: z.number().int().min(5).max(16).default(12),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  topic: z.string().min(3).max(40).optional(),
  solutions: z.boolean().default(true),
});
type WsP = z.infer<typeof WsParams>;
const WsContent = z.object({
  coverSubtitle: z.string().min(3).max(90),
  puzzles: z.array(z.object({ title: z.string().min(2).max(40), words: z.array(z.string().regex(/^[A-Za-z]{3,20}$/)).min(5).max(16) })).min(1).max(30),
});
type WsC = z.infer<typeof WsContent>;

function wsSeed(seed: number, i: number) {
  return seed + i * 15485863;
}

export const wordSearch: ProductTypeDefinition<WsP, WsC> = {
  id: 'word-search',
  name: 'Word search puzzles',
  family: 'activity',
  category: 'Kids Activities',
  description: 'Themed word search puzzles with answer keys.',
  paramsSchema: WsParams,
  contentSchema: WsContent,
  defaultParams: () => WsParams.parse({}),
  defaultTitle: (ctx) => `${ctx.params.topic ? ctx.params.topic.replace(/\b\w/g, (m) => m.toUpperCase()) + ' ' : ctx.theme && ctx.theme.name !== 'Minimalist' ? ctx.theme.name + ' ' : ''}Word Search Puzzles`,
  aiContent: true,
  artwork: 'none',
  variationAxes: ['topic', 'difficulty', 'design', 'audience'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE + '\n- Words must be single English words, letters A-Z only, no spaces or hyphens.',
    user: `Create word lists for a word search book titled "${ctx.title}"${ctx.params.topic ? ` about "${ctx.params.topic}"` : ''}.
Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
Return coverSubtitle and puzzles: exactly ${ctx.params.puzzles} puzzles, each with a short sub-topic title and exactly ${ctx.params.wordsPerPuzzle} distinct words of 3 to ${Math.min(ctx.params.gridSize, 12)} letters, uppercase, age-appropriate, no proper nouns or brand names. Avoid repeating words across puzzles.${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx, rand) => {
    const first = wordListKey(ctx.theme?.name, ctx.params.topic);
    const keys = [first, ...shuffle(rand, Object.keys(WORD_LISTS).filter((k) => k !== first))];
    return {
      coverSubtitle: `${ctx.params.puzzles} puzzles to find and circle`,
      puzzles: Array.from({ length: ctx.params.puzzles }, (_, i) => {
        const k = keys[i % keys.length];
        const words = shuffle(rand, WORD_LISTS[k].filter((w) => w.length <= Math.min(ctx.params.gridSize, 12))).slice(0, ctx.params.wordsPerPuzzle);
        return { title: k[0].toUpperCase() + k.slice(1) + (i >= keys.length ? ` ${Math.floor(i / keys.length) + 1}` : ''), words };
      }),
    };
  },
  render(ctx, content) {
    const ff = fontStack(ctx.tokens.fonts.body);
    const built = content.puzzles.map((p, i) => generateWordSearch(p.words, ctx.params.gridSize, ctx.params.difficulty, wsSeed(ctx.seed, i)));
    const pages: SafeHtml[] = built.map((ws, i) => page(html`${header(content.puzzles[i].title, 'Find and circle every word', ornament(ctx.tokens))}
      <div class="art" style="flex:3 1 0">${raw(wordSearchSvg(ws, { solution: false, ink: ctx.tokens.palette.ink, accent: ctx.tokens.palette.accent, fontFamily: ff }))}</div>
      <div class="box soft" style="flex:none"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5mm 4mm">${ws.placements.map((p) => html`<div class="row" style="gap:2mm;align-items:center"><span class="cb"></span><span>${p.word}</span></div>`)}</div></div>${stdFooter(ctx, `Puzzle ${i + 1}`)}`));
    if (ctx.params.solutions) {
      chunk(built.map((b, i) => ({ b, i })), 2).forEach((group) => pages.push(page(html`${header('Answer key', group.map((g) => content.puzzles[g.i].title).join(' · '))}<div class="col fill">${group.map((g) => html`<div class="col grow" style="gap:1mm"><span class="label">${content.puzzles[g.i].title}</span><div class="art">${raw(wordSearchSvg(g.b, { solution: true, ink: ctx.tokens.palette.ink, accent: ctx.tokens.palette.accent, fontFamily: ff }))}</div></div>`)}</div>${stdFooter(ctx, ctx.title)}`)));
    }
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.puzzles + (ctx.params.solutions ? Math.ceil(ctx.params.puzzles / 2) : 0),
  consistencyChecks: (ctx, c) => {
    const findings: QaFinding[] = [];
    const unplaced: string[] = [];
    c.puzzles.forEach((p, i) => unplaced.push(...generateWordSearch(p.words, ctx.params.gridSize, ctx.params.difficulty, wsSeed(ctx.seed, i)).unplaced.map((w) => `${p.title}: ${w}`)));
    findings.push({ code: 'words_placed', severity: 'hard', passed: unplaced.length === 0, message: unplaced.length ? `Words that could not be placed: ${unplaced.join(', ')}` : 'Every word is placed in its grid', details: unplaced });
    const tooLong = c.puzzles.flatMap((p) => p.words.filter((w) => w.length > ctx.params.gridSize));
    findings.push({ code: 'word_length', severity: 'hard', passed: tooLong.length === 0, message: tooLong.length ? `Longer than the grid: ${tooLong.join(', ')}` : 'All words fit the grid' });
    findings.push({ code: 'content_count', severity: 'hard', passed: c.puzzles.length === ctx.params.puzzles, message: `${c.puzzles.length} puzzles for ${ctx.params.puzzles}` });
    return findings;
  },
  qaText: (c) => [c.coverSubtitle, ...c.puzzles.flatMap((p) => [p.title, ...p.words.map((w) => w.toLowerCase())])],
  listingHints: (ctx) => baseHints(ctx, ['word search', 'word search printable', 'kids activity', 'classroom activity', 'puzzle book'],
    [`${ctx.params.puzzles} themed puzzles`, `${ctx.params.gridSize}x${ctx.params.gridSize} grids`, `${ctx.params.difficulty} difficulty`, ctx.params.solutions ? 'Answer keys included' : 'No answer keys'], ['1 PDF'], PRINT_USAGE),
};

// ---------------------------------------------------------------- illustrated coloring (AI images)

const IllParams = z.object({
  pages: z.number().int().min(1).max(20).default(6),
  fit: z.enum(['sharp', 'fill']).default('sharp'),
  cover: z.boolean().default(true),
});
type IllP = z.infer<typeof IllParams>;
const IllContent = z.object({ coverSubtitle: z.string().min(3).max(90), subjects: z.array(z.string().min(5).max(90)).min(1).max(20) });
type IllC = z.infer<typeof IllContent>;

export const illustratedColoring: ProductTypeDefinition<IllP, IllC> = {
  id: 'illustrated-coloring',
  name: 'Illustrated coloring pages',
  family: 'activity',
  category: 'Coloring Pages',
  description: 'AI-illustrated line-art coloring pages (requires an image provider).',
  paramsSchema: IllParams,
  contentSchema: IllContent,
  defaultParams: () => IllParams.parse({}),
  defaultTitle: (ctx) => `${ctx.theme && ctx.theme.name !== 'Minimalist' ? ctx.theme.name + ' ' : ''}Coloring Pages`,
  aiContent: true,
  artwork: 'ai-image',
  variationAxes: ['theme', 'audience'],
  contentPrompt: (ctx) => ({
    system: AI_SYSTEM_BASE,
    user: `Plan a coloring page set titled "${ctx.title}". Audience: ${audienceLine(ctx)}. Theme: ${themeLine(ctx)}.
Return coverSubtitle and subjects: exactly ${ctx.params.pages} distinct scene descriptions (under 80 characters each) that work as simple black-and-white line art, with no text, no logos, and no copyrighted characters.${revisionClause(ctx)}`,
  }),
  deterministicContent: (ctx, rand) => ({ coverSubtitle: `${ctx.params.pages} pages to color`, subjects: shuffle(rand, COLORING_SUBJECTS[coloringKey(ctx.theme?.name)]).slice(0, ctx.params.pages) }),
  async generateArtwork(ctx, content, _rand, imageGen) {
    if (!imageGen) throw new ProviderError('image', 'unconfigured', 'Illustrated coloring pages need an image provider. Configure one in Settings → AI providers.');
    const kid = ctx.audience?.profile.readingLevel === 'early-reader';
    const out: ArtworkItem[] = [];
    for (const [i, subject] of content.subjects.slice(0, ctx.params.pages).entries()) {
      const prompt = `Black and white coloring book page, clean line art of ${subject}. ${kid ? 'Thick bold outlines, large simple shapes, for young children.' : 'Fine clean outlines with moderate detail.'} Pure white background, black lines only, no shading, no gray tones, no color, no text, no letters, no border, centered composition with margin around the subject.`;
      const img = await imageGen(prompt, { size: 'portrait' });
      out.push({ name: `coloring-${String(i + 1).padStart(2, '0')}.png`, kind: 'png', data: img.png, widthPx: img.widthPx, heightPx: img.heightPx, role: 'deliverable', provenance: { ...img.provenance, subject, prompt } });
    }
    return out;
  },
  render(ctx, content, art) {
    const pages: SafeHtml[] = [];
    if (ctx.params.cover && art[0]) pages.push(coverPage(ctx, ctx.title, content.coverSubtitle, html`<div style="width:60mm;height:80mm" class="art"><img src="${pngDataUri(art[0].data as Buffer)}"></div>`));
    for (const a of art) {
      const style = ctx.params.fit === 'sharp' && a.widthPx && a.heightPx ? `max-width:${n((a.widthPx / 200) * 25.4)}mm;max-height:${n((a.heightPx / 200) * 25.4)}mm` : '';
      pages.push(page(html`<div class="art"><img src="${pngDataUri(a.data as Buffer)}" style="${style}"></div>${stdFooter(ctx, '')}`));
    }
    return { pages };
  },
  expectedPageCount: (ctx) => ctx.params.pages + (ctx.params.cover ? 1 : 0),
  consistencyChecks: (ctx, _c, art) => [{ code: 'artwork_count', severity: 'hard', passed: art.length === ctx.params.pages, message: `${art.length} illustrations for ${ctx.params.pages} pages` }],
  qaText: (c) => [c.coverSubtitle, ...c.subjects],
  listingHints: (ctx) => baseHints(ctx, ['coloring pages', 'printable coloring', 'coloring sheets', 'kids coloring'],
    [`${ctx.params.pages} illustrated pages`, 'Black-and-white line art', 'PNG files included for digital coloring'], ['1 PDF', `${ctx.params.pages} PNG files`], PRINT_USAGE),
};
