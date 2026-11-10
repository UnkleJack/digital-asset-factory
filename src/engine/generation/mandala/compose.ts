/**
 * Mandala ring and medallion composer (2026-10-28 plan, task A3).
 *
 * A mandala is a centre medallion, rings of motifs around it, and an optional border. Every ring repeats one
 * motif wedge with the design's symmetry (or a whole multiple of it, so the design as a whole keeps exact
 * N-fold symmetry). The detail level sets how many rings there are, which symmetries it may pick, how often a
 * ring splits into two thinner sub-rings, and how elaborate the centre and border get.
 *
 * Everything is drawn in a 1000 x 1000 box centred on (500, 500). Line weights are in those units; the product
 * type passes a minimum so that lines never print thinner than its print threshold on the chosen paper.
 */
import { seededRandom } from '../../../core/hash.ts';
import { MOTIFS, MOTIF_SETS, Sketch, polar, type MotifName, type MotifSet } from './motifs.ts';
import { renderWedge } from './symmetry.ts';

export type Detail = 'simple' | 'medium' | 'detailed' | 'intricate';
export const DETAILS: readonly Detail[] = ['simple', 'medium', 'detailed', 'intricate'];
export const SYMMETRIES = [6, 8, 10, 12, 16, 18, 20, 24] as const;
export type Symmetry = (typeof SYMMETRIES)[number];
export type Center = 'rosette' | 'sunburst' | 'star' | 'lotus' | 'void';
export type Border = 'none' | 'rope' | 'ring' | 'scallop';

export interface MandalaSpec {
  detail: Detail;
  symmetry: Symmetry;
  /** Ring count, before any ring splits into sub-rings. */
  rings: number;
  /** 0.6 to 1.4: how tightly motifs are packed around each ring. */
  motifDensity: number;
  center: Center;
  border: Border;
  lineStyle: 'even' | 'tapered';
  motifSet: MotifSet;
  /** Base line weight in the 1000-unit box. */
  strokeWidth: number;
  /** No line is drawn thinner than this (1000-unit box). */
  minStrokeWidth: number;
}

interface DetailProfile {
  rings: number;
  symmetries: readonly Symmetry[];
  subRingChance: number;
  centers: readonly Center[];
  borders: readonly Border[];
  strokeWidth: number;
  centerRadius: readonly [number, number];
}

export const DETAIL_PROFILES: Record<Detail, DetailProfile> = {
  simple: { rings: 3, symmetries: [6, 8], subRingChance: 0, centers: ['rosette', 'void', 'star'], borders: ['none', 'ring'], strokeWidth: 5, centerRadius: [80, 100] },
  medium: { rings: 5, symmetries: [8, 10, 12], subRingChance: 0.2, centers: ['rosette', 'sunburst', 'star', 'lotus'], borders: ['none', 'ring', 'scallop'], strokeWidth: 3.4, centerRadius: [60, 75] },
  detailed: { rings: 7, symmetries: [12, 16, 18], subRingChance: 0.35, centers: ['rosette', 'sunburst', 'star', 'lotus'], borders: ['ring', 'scallop', 'rope'], strokeWidth: 2.4, centerRadius: [54, 64] },
  intricate: { rings: 10, symmetries: [16, 18, 20, 24], subRingChance: 0.5, centers: ['rosette', 'sunburst', 'star', 'lotus'], borders: ['rope', 'scallop', 'ring'], strokeWidth: 1.8, centerRadius: [58, 68] },
};

/** A ring band is only split in two when each half would still be at least this deep (1000-unit box). */
const MIN_SPLIT_DEPTH = 26;
const CENTRE = 500;
const OUTER = 470;
const BORDER_WIDTH = 34;

const pickOf = <T,>(rand: () => number, items: readonly T[]): T => items[Math.floor(rand() * items.length) % items.length];

/** A full spec for a detail level; anything in `overrides` wins. Consumes `rand` in a fixed order. */
export function specFor(detail: Detail, rand: () => number, overrides: Partial<MandalaSpec> = {}): MandalaSpec {
  const p = DETAIL_PROFILES[detail];
  const spec: MandalaSpec = {
    detail,
    symmetry: pickOf(rand, p.symmetries),
    rings: p.rings,
    motifDensity: 0.8 + rand() * 0.4,
    center: pickOf(rand, p.centers),
    border: pickOf(rand, p.borders),
    lineStyle: rand() < 0.5 ? 'even' : 'tapered',
    motifSet: pickOf(rand, Object.keys(MOTIF_SETS) as MotifSet[]),
    strokeWidth: p.strokeWidth,
    minStrokeWidth: 0,
  };
  return { ...spec, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) };
}

export interface BandStats {
  id: string;
  motif: MotifName | 'centre' | 'border';
  ri: number;
  ro: number;
  /** Times the motif's wedge is placed (a whole multiple of the design's symmetry). */
  placements: number;
  mirrored: boolean;
  strokeWidth: number;
  segments: number;
}

export interface MandalaStats {
  symmetry: number;
  detail: Detail;
  motifSet: MotifSet;
  center: Center;
  border: Border;
  lineStyle: 'even' | 'tapered';
  bands: BandStats[];
  /** Farthest any line reaches from the centre, including half its line weight (1000-unit box). */
  maxExtent: number;
  minStrokeWidth: number;
  maxStrokeWidth: number;
  /** The thinnest ring band (1000-unit box). */
  minBandDepth: number;
  /** Path segments drawn on the page, counting every placed copy. */
  segments: number;
}

export interface ComposedMandala {
  svg: string;
  stats: MandalaStats;
}

/** Splits [inner, outer] into `rings` bands of slightly uneven depth. */
function ringRadii(inner: number, outer: number, rings: number, rand: () => number): number[] {
  const w = Array.from({ length: rings }, () => 0.85 + rand() * 0.3);
  const total = w.reduce((a, b) => a + b, 0);
  const out = [inner];
  let acc = 0;
  for (const x of w) {
    acc += x;
    out.push(inner + ((outer - inner) * acc) / total);
  }
  return out;
}

const fmt = (x: number) => (Math.round(x * 100) / 100).toString();
const ringCircle = (r: number) => `<circle r="${fmt(r)}" fill="none"/>`;

export function composeMandala(spec: MandalaSpec, rand: () => number): ComposedMandala {
  const N = spec.symmetry;
  const profile = DETAIL_PROFILES[spec.detail];
  const allowed = MOTIF_SETS[spec.motifSet];
  const defs: string[] = [];
  const body: string[] = [];
  const bands: BandStats[] = [];
  let maxR = 0;
  const strokes: number[] = [];

  const outer = spec.border === 'none' ? OUTER : OUTER - BORDER_WIDTH;
  const r0 = profile.centerRadius[0] + rand() * (profile.centerRadius[1] - profile.centerRadius[0]);
  const radii = ringRadii(r0, outer, spec.rings, rand);
  const stroke = (ringIndex: number) => {
    const taper = spec.lineStyle === 'tapered' && spec.rings > 1 ? 0.7 + (0.3 * ringIndex) / (spec.rings - 1) : 1;
    return Math.max(spec.minStrokeWidth, spec.strokeWidth * taper);
  };

  /** Places one motif wedge around the band, `mult` times the design's symmetry. */
  const placeBand = (id: string, motif: MotifName, ri: number, ro: number, sw: number, mult: number, extraTransform = '') => {
    const k = N * mult;
    const m = MOTIFS[motif];
    const drawing = m.draw({ ri, ro, half: Math.PI / k });
    const w = renderWedge(id, drawing.svg, k, { mirrored: m.mirrored });
    defs.push(w.defs);
    body.push(`<g stroke-width="${fmt(sw)}"${extraTransform}>${w.uses}</g>`);
    maxR = Math.max(maxR, drawing.maxR + sw / 2);
    strokes.push(sw);
    bands.push({ id: m.mirrored ? `${id}m` : id, motif, ri, ro, placements: k, mirrored: m.mirrored, strokeWidth: sw, segments: drawing.segments * w.copies });
  };

  /** How many times the symmetry a band should repeat so its cells are roughly as wide as they are deep. */
  const multiple = (ri: number, ro: number, maxMult: number) => {
    const arc = (2 * Math.PI * ((ri + ro) / 2)) / N;
    const target = ((ro - ri) * 1.2) / spec.motifDensity;
    return Math.max(1, Math.min(maxMult, Math.round(arc / target)));
  };

  // ---- rings, inner to outer
  let previous: MotifName | null = null;
  let bandNo = 0;
  for (let i = 0; i < spec.rings; i++) {
    const ringRand = seededRandom((Math.floor(rand() * 2 ** 31) ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
    const [a, b] = [radii[i], radii[i + 1]];
    const sw = stroke(i);
    const split = profile.subRingChance > 0 && b - a >= MIN_SPLIT_DEPTH * 2 && ringRand() < profile.subRingChance;
    const cuts = split ? [a, a + (b - a) * (0.45 + ringRand() * 0.1), b] : [a, b];
    body.push(`<g stroke-width="${fmt(sw)}">${ringCircle(b)}${split ? ringCircle(cuts[1]) : ''}</g>`);
    for (let c = 0; c + 1 < cuts.length; c++) {
      const choices = allowed.filter((x) => x !== previous);
      const motif = pickOf(ringRand, choices.length ? choices : allowed);
      previous = motif;
      placeBand(`w${bandNo++}`, motif, cuts[c], cuts[c + 1], sw, multiple(cuts[c], cuts[c + 1], N >= 16 ? 2 : 3));
    }
  }
  maxR = Math.max(maxR, outer + stroke(spec.rings - 1) / 2);

  // ---- centre medallion
  const csw = stroke(0);
  const centre: string[] = [ringCircle(r0)];
  const centreStats = (segments: number) => bands.push({ id: 'centre', motif: 'centre', ri: 0, ro: r0, placements: N, mirrored: false, strokeWidth: csw, segments });
  if (spec.center === 'void') {
    centre.push(ringCircle(r0 * 0.45));
    centreStats(8);
  } else if (spec.center === 'star') {
    const s = new Sketch();
    for (let j = 0; j < N * 2; j++) {
      const p = polar(j % 2 ? r0 * 0.5 : r0 * 0.92, (j * Math.PI) / N);
      if (j === 0) s.M(p);
      else s.L(p);
    }
    s.Z().end();
    const d = s.done();
    centre.push(d.svg, ringCircle(r0 * 0.28));
    centreStats(d.segments + 8);
  } else {
    body.push(`<g stroke-width="${fmt(csw)}">${centre.join('')}</g>`);
    centre.length = 0;
    const inner = r0 * (spec.center === 'sunburst' ? 0.45 : 0.22);
    if (spec.center === 'rosette') placeBand('c0', 'petal', inner, r0 * 0.94, csw, 1);
    if (spec.center === 'sunburst') placeBand('c0', 'sunburst', inner, r0 * 0.94, csw, 1);
    if (spec.center === 'lotus') {
      placeBand('c0', 'petal', inner, r0 * 0.94, csw, 1);
      placeBand('c1', 'teardrop', inner, r0 * 0.62, csw, 1, ` transform="rotate(${fmt(180 / N)})"`);
    }
    centre.push(ringCircle(inner));
  }
  body.push(`<g stroke-width="${fmt(csw)}">${centre.join('')}</g>`);
  strokes.push(csw);

  // ---- border
  if (spec.border !== 'none') {
    const bsw = stroke(spec.rings - 1);
    const [bi, bo] = [outer + 4, OUTER - 4];
    if (spec.border === 'ring') {
      body.push(`<g stroke-width="${fmt(bsw)}">${ringCircle(bi + 8)}${ringCircle(bo)}</g>`);
      bands.push({ id: 'border', motif: 'border', ri: bi, ro: bo, placements: N, mirrored: false, strokeWidth: bsw, segments: 8 });
    } else if (spec.border === 'rope') {
      body.push(`<g stroke-width="${fmt(bsw)}">${ringCircle(bo)}</g>`);
      placeBand('b0', 'rope', bi, bo, bsw, multiple(bi, bo, 8));
    } else {
      const k = N * multiple(bi, bo, 8);
      const h = Math.PI / k;
      const s = new Sketch();
      s.M(polar(bi, -h)).Q(polar(bo, 0), polar(bi, h)).end(true);
      const d = s.done();
      const w = renderWedge('b0', d.svg, k, { mirrored: false });
      defs.push(w.defs);
      body.push(`<g stroke-width="${fmt(bsw)}">${ringCircle(bo)}${w.uses}</g>`);
      bands.push({ id: 'b0', motif: 'border', ri: bi, ro: bo, placements: k, mirrored: false, strokeWidth: bsw, segments: d.segments * k + 4 });
      maxR = Math.max(maxR, d.maxR + bsw / 2);
    }
    maxR = Math.max(maxR, bo + bsw / 2);
    strokes.push(bsw);
  }

  const ringBands = bands.filter((b) => b.motif !== 'centre' && b.motif !== 'border');
  const circles = (body.join('').match(/<circle /g) ?? []).length;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" xmlns:xlink="http://www.w3.org/1999/xlink" width="1000" height="1000"><rect width="1000" height="1000" fill="#ffffff"/><defs>${defs.join('')}</defs><g transform="translate(${CENTRE} ${CENTRE})" fill="#ffffff" stroke="#000000" stroke-linejoin="round" stroke-linecap="round">${body.join('')}</g></svg>`;
  return {
    svg,
    stats: {
      symmetry: N,
      detail: spec.detail,
      motifSet: spec.motifSet,
      center: spec.center,
      border: spec.border,
      lineStyle: spec.lineStyle,
      bands,
      maxExtent: Math.round(maxR * 100) / 100,
      minStrokeWidth: Math.min(...strokes),
      maxStrokeWidth: Math.max(...strokes),
      minBandDepth: Math.round(Math.min(...ringBands.map((b) => b.ro - b.ri)) * 100) / 100,
      segments: bands.reduce((n, b) => n + b.segments, 0) + circles * 4,
    },
  };
}
