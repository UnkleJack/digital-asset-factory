import { SYMMETRIES, DETAILS, type Detail, type Symmetry } from '../generation/mandala/compose.ts';

/**
 * Reading a mandala picture. The mandala engine draws its own shapes, so a picture can't be copied. What can
 * be read off one, without any AI, is how many times it repeats around its centre and roughly how many
 * rings of line it has. Those two numbers are the engine's `symmetry` and `detail` settings, so a picture of
 * yours can set them. The motif set (petals, geometric, ...) can't be measured and is never guessed.
 *
 * Works on the picture's middle square in grey. Everything here is plain arithmetic on pixels, so the same
 * picture always gives the same answer.
 */

export interface MandalaReading {
  /** The repeat count read off the picture (one of the engine's counts), or null when no clear one was found. */
  symmetry: Symmetry | null;
  /** 0 to 1: how much of the picture's ring-by-ring pattern is explained by that repeat count. */
  symmetryStrength: number;
  /** The engine's detail level nearest to the picture, or null when the picture can't be read as line art. */
  detail: Detail | null;
  /** Average number of lines a ray from the centre to the edge crosses. */
  crossings: number;
  /** Share of the picture that is ink (the smaller of dark and light). */
  inkShare: number;
  /** True when the picture is mostly pure black and white, which is what the readings are tuned for. */
  lineArt: boolean;
  /** Plain-words caveats to show beside the result. */
  notes: string[];
}

/**
 * Where one detail level ends and the next begins, in line crossings per ray at 256 px. Fitted to 192 of the
 * engine's own mandalas (4 levels x 8 repeat counts x 6 seeds): the right level 68% of the time and within one
 * level 99% of the time. Detailed and intricate overlap, so this is a rough guess and is shown as one.
 */
export const DETAIL_CROSSINGS: readonly [number, number, number] = [14, 18.2, 22.4];

/** A candidate repeat count counts when it explains at least this much of the ring pattern. */
const MIN_STRENGTH = 0.55;
/** ...and a larger count is preferred over a smaller one only when it explains nearly as much. */
const KEEP_LARGER = 0.85;

function otsu(grey: Uint8Array): number {
  const hist = new Float64Array(256);
  for (const v of grey) hist[v]++;
  const total = grey.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sumB = 0, best = -1, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/** 1 where there is ink, 0 where there is paper. Ink is whichever of dark and light covers less of the picture. */
function inkMap(grey: Uint8Array): { ink: Float32Array; share: number; lineArt: boolean } {
  const t = otsu(grey);
  let dark = 0;
  for (const v of grey) if (v <= t) dark++;
  const inkIsDark = dark <= grey.length / 2;
  const ink = new Float32Array(grey.length);
  let n = 0, extreme = 0;
  for (let i = 0; i < grey.length; i++) {
    const on = inkIsDark ? grey[i] <= t : grey[i] > t;
    if (on) { ink[i] = 1; n++; }
    if (grey[i] < 40 || grey[i] > 215) extreme++;
  }
  return { ink, share: n / grey.length, lineArt: extreme / grey.length >= 0.85 };
}

function bilinear(ink: Float32Array, size: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= size - 1 || y0 >= size - 1) return 0;
  const fx = x - x0, fy = y - y0;
  const i = y0 * size + x0;
  return ink[i] * (1 - fx) * (1 - fy) + ink[i + 1] * fx * (1 - fy) + ink[i + size] * (1 - fx) * fy + ink[i + size + 1] * fx * fy;
}

const ANGLES = 360;
const RINGS = 72;
const RAYS = 180;

/**
 * Power at each whole number of repeats around the circle (1..ANGLES/2), added up over rings from just outside
 * the centre to the edge. A picture that repeats N times has all its power at multiples of N.
 */
function ringPower(ink: Float32Array, size: number): Float64Array {
  const c = (size - 1) / 2;
  const rMax = c * 0.96;
  const cos = new Float64Array(ANGLES), sin = new Float64Array(ANGLES);
  for (let a = 0; a < ANGLES; a++) { cos[a] = Math.cos((2 * Math.PI * a) / ANGLES); sin[a] = Math.sin((2 * Math.PI * a) / ANGLES); }
  const power = new Float64Array(ANGLES / 2 + 1);
  const ring = new Float64Array(ANGLES);
  const kc = new Float64Array(ANGLES), ks = new Float64Array(ANGLES);
  for (let k = 0; k < ANGLES; k++) { kc[k] = cos[k]; ks[k] = sin[k]; }
  for (let i = 0; i < RINGS; i++) {
    const r = rMax * (0.1 + 0.9 * (i / (RINGS - 1)));
    let mean = 0;
    for (let a = 0; a < ANGLES; a++) { ring[a] = bilinear(ink, size, c + r * cos[a], c + r * sin[a]); mean += ring[a]; }
    mean /= ANGLES;
    for (let h = 1; h <= ANGLES / 2; h++) {
      let re = 0, im = 0;
      for (let a = 0; a < ANGLES; a++) {
        const idx = (h * a) % ANGLES;
        const v = ring[a] - mean;
        re += v * kc[idx];
        im += v * ks[idx];
      }
      power[h] += re * re + im * im;
    }
  }
  return power;
}

/** Average number of lines a ray from the centre to the edge crosses. */
function crossingsPerRay(ink: Float32Array, size: number): number {
  const c = (size - 1) / 2;
  const r0 = c * 0.08, r1 = c * 0.98;
  const steps = Math.ceil((r1 - r0) / 0.5);
  let total = 0;
  for (let k = 0; k < RAYS; k++) {
    const a = (2 * Math.PI * k) / RAYS;
    const dx = Math.cos(a), dy = Math.sin(a);
    let prev = false;
    for (let s = 0; s <= steps; s++) {
      const r = r0 + ((r1 - r0) * s) / steps;
      const on = bilinear(ink, size, c + r * dx, c + r * dy) >= 0.5;
      if (on && !prev) total++;
      prev = on;
    }
  }
  return total / RAYS;
}

export function detailFor(crossings: number): Detail {
  const i = crossings < DETAIL_CROSSINGS[0] ? 0 : crossings < DETAIL_CROSSINGS[1] ? 1 : crossings < DETAIL_CROSSINGS[2] ? 2 : 3;
  return DETAILS[i];
}

/** Reads a square, 8-bit grey picture (row by row, `size` x `size`) as a mandala. */
export function readMandala(grey: Uint8Array, size: number): MandalaReading {
  if (grey.length !== size * size) throw new Error(`Expected ${size * size} pixels, got ${grey.length}`);
  const { ink, share, lineArt } = inkMap(grey);
  const notes: string[] = [];
  if (share < 0.01 || share > 0.7) {
    return { symmetry: null, symmetryStrength: 0, detail: null, crossings: 0, inkShare: share, lineArt, notes: ['This picture has almost no line work to read (it is nearly blank or nearly solid).'] };
  }
  const power = ringPower(ink, size);
  const total = power.reduce((a, b) => a + b, 0) || 1;
  const strength = (n: number) => {
    let s = 0;
    for (let m = n; m < power.length; m += n) s += power[m];
    return s / total;
  };
  const scored = SYMMETRIES.map((n) => ({ n, e: strength(n) }));
  const best = Math.max(...scored.map((s) => s.e));
  let symmetry: Symmetry | null = null;
  let symmetryStrength = best;
  if (best >= MIN_STRENGTH) {
    // The largest count that explains nearly as much as the best one: a 12-fold picture also fits 6, but not 24.
    const pick = [...scored].reverse().find((s) => s.e >= best * KEEP_LARGER)!;
    symmetry = pick.n;
    symmetryStrength = pick.e;
  } else {
    notes.push('No clear repeat count was found. The picture may not be centred, may not repeat evenly, or may be a different kind of pattern.');
  }
  const crossings = crossingsPerRay(ink, size);
  let detail: Detail | null = detailFor(crossings);
  if (!lineArt) {
    notes.push('This picture has shading or colour, so the detail level is a rougher guess than it would be for black-and-white line art.');
  }
  if (crossings < 1.5) {
    detail = null;
    notes.push('Too few lines to judge a detail level.');
  }
  notes.push('The motif set (petals, geometric, ...) can\'t be read from a picture, so it is left for you to pick.');
  return { symmetry, symmetryStrength: Math.round(symmetryStrength * 100) / 100, detail, crossings: Math.round(crossings * 10) / 10, inkShare: Math.round(share * 1000) / 1000, lineArt, notes };
}
