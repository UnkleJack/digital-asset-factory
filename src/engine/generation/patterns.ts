/**
 * Geometric pattern engine (2026-10-28 plan, tasks B1 and B2).
 *
 * Eight families, each a seed-stable generator with a few variants. Every pattern is drawn into a box 1000 units
 * wide and as tall as the page's art area needs, and clipped to that box, so nothing can print outside it.
 *
 * Two modes (locked decision D1):
 * - `coloring`: black lines on white only, with a frame so every edge region is closed. Nothing is filled, except
 *   white where shapes deliberately overlap (scales), so it prints as clean line art.
 * - `print`: decor or wall art. Shapes are filled with the design system's palette and outlined in its ink colour;
 *   `invert` puts light lines on a dark ground. Grayscale paper is honoured because the palette arrives already
 *   converted (applyAudienceAndPaper).
 *
 * Element counts are bounded by the density setting, and every generator stops at MAX_ELEMENTS whatever happens.
 */
import { seededRandom } from '../../core/hash.ts';

export const PATTERN_FAMILIES = ['tessellate', 'girih', 'opart', 'truchet', 'guilloche', 'fractal', 'lace', 'herringbone'] as const;
export type PatternFamily = (typeof PATTERN_FAMILIES)[number];

export const PATTERN_VARIANTS = {
  tessellate: ['triangle', 'hexagon', 'rhombille', 'tetrakis'],
  girih: ['star-and-cross', 'octagon-square'],
  opart: ['waves', 'rings', 'warped-checker'],
  truchet: ['arcs', 'diagonals'],
  guilloche: ['hypotrochoid', 'rose', 'lissajous'],
  fractal: ['sierpinski', 'hilbert', 'carpet'],
  lace: ['scallop', 'flower-of-life', 'quatrefoil'],
  herringbone: ['herringbone', 'chevron', 'basketweave'],
} as const satisfies Record<PatternFamily, readonly string[]>;

export type Density = 'light' | 'medium' | 'dense';
export type PatternMode = 'coloring' | 'print';

/** Hard ceiling on shapes in one pattern (SVG size guard). */
export const MAX_ELEMENTS = 8000;

export interface PatternPalette {
  ink: string;
  paper: string;
  /** Fill colours for print mode, in order of use. */
  fills: string[];
}

export interface PatternOptions {
  family: PatternFamily;
  density: Density;
  mode: PatternMode;
  /** Print mode only: light lines on a dark ground. */
  invert: boolean;
  /** Height of the drawing box; the width is always 1000. */
  height: number;
  palette: PatternPalette;
  /** Line weight in drawing units. */
  strokeWidth: number;
  /** A fixed variant of the family, or undefined to let the seed pick. */
  variant?: string;
}

export interface PatternStats {
  family: PatternFamily;
  variant: string;
  mode: PatternMode;
  width: number;
  height: number;
  elements: number;
  segments: number;
  /** About how big the smallest repeated cell is, in drawing units (what a person colours in). */
  cell: number;
  strokeWidth: number;
  lineColor: string;
  backgroundColor: string;
  /** True when the element cap stopped the generator early. */
  capped: boolean;
}

export interface Pattern {
  svg: string;
  stats: PatternStats;
}

type Pt = [number, number];
const fmt = (x: number) => (Math.round(x * 100) / 100).toString();
/** Remainder that is never negative, so tiles left of or above the box get the same colours as the rest. */
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** WCAG contrast ratio between two #rrggbb colours (1 = identical, 21 = black on white). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Lines drawn in a palette colour must stand out from the ground at least this much; paler ones fall back to the ink. */
export const MIN_LINE_CONTRAST = 3;
const pts = (p: Pt[]) => p.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L');

/** Fill slots: 0 = no fill, 1..n = palette fill n, PAPER = the ground colour (used to paint over, in both modes). */
const PAPER = -1;

class Canvas {
  els: string[] = [];
  segments = 0;
  capped = false;
  private lineFills: string[];
  private mode: PatternMode;
  private palette: PatternPalette;
  private ground: string;
  constructor(mode: PatternMode, palette: PatternPalette, ground: string) {
    this.mode = mode;
    this.palette = palette;
    this.ground = ground;
    this.lineFills = palette.fills.filter((f) => contrastRatio(f, ground) >= MIN_LINE_CONTRAST);
  }

  /** A stroke attribute for coloured line work (print mode only), using only colours that stand out from the ground. */
  private stroke(colour?: number): string {
    if (!colour || this.mode !== 'print' || !this.lineFills.length) return '';
    return ` stroke="${this.lineFills[(colour - 1) % this.lineFills.length]}"`;
  }

  get full(): boolean {
    if (this.els.length >= MAX_ELEMENTS) this.capped = true;
    return this.capped;
  }

  private fill(k: number): string {
    if (k === PAPER) return this.mode === 'coloring' ? '#ffffff' : this.ground;
    if (this.mode === 'coloring' || k <= 0) return 'none';
    return this.palette.fills[(k - 1) % this.palette.fills.length];
  }

  private push(el: string, segments: number): void {
    if (this.full) return;
    this.els.push(el);
    this.segments += segments;
  }

  poly(p: Pt[], k = 0): void {
    this.push(`<path d="M${pts(p)}Z" fill="${this.fill(k)}"/>`, p.length);
  }

  line(p: Pt[], opts: { colour?: number } = {}): void {
    this.push(`<path d="M${pts(p)}" fill="none"${this.stroke(opts.colour)}/>`, p.length - 1);
  }

  path(d: string, segments: number, k = 0): void {
    this.push(`<path d="${d}" fill="${this.fill(k)}"/>`, segments);
  }

  circle(cx: number, cy: number, r: number, k = 0, opts: { colour?: number } = {}): void {
    this.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="${this.fill(k)}"${this.stroke(opts.colour)}/>`, 4);
  }
}

const CELL: Record<Density, number> = { light: 110, medium: 76, dense: 54 };

interface Ctx {
  c: Canvas;
  W: number;
  H: number;
  rand: () => number;
  density: Density;
  mode: PatternMode;
}

/** Each generator draws its pattern and returns its typical cell size. */
type Generator = (x: Ctx, variant: string) => number;

const regularPoly = (cx: number, cy: number, r: number, n: number, rot: number): Pt[] => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(rot + (i * 2 * Math.PI) / n), cy + r * Math.sin(rot + (i * 2 * Math.PI) / n)]);
const scaleAbout = (p: Pt[], f: number): Pt[] => {
  const cx = p.reduce((a, q) => a + q[0], 0) / p.length;
  const cy = p.reduce((a, q) => a + q[1], 0) / p.length;
  return p.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]);
};

const tessellate: Generator = ({ c, W, H, rand, density }, variant) => {
  const s = CELL[density];
  const inset = rand() < 0.6;
  if (variant === 'triangle') {
    const h = (s * Math.sqrt(3)) / 2;
    for (let j = -1; j * h < H + h && !c.full; j++) {
      for (let i = -1; i * s < W + s; i++) {
        const x0 = i * s + (j % 2 ? s / 2 : 0);
        const up: Pt[] = [[x0, (j + 1) * h], [x0 + s / 2, j * h], [x0 + s, (j + 1) * h]];
        const down: Pt[] = [[x0 + s / 2, j * h], [x0 + s, (j + 1) * h], [x0 + 1.5 * s, j * h]];
        c.poly(up, 1);
        c.poly(down, 2);
        if (inset) c.poly(scaleAbout(up, 0.45), 3);
      }
    }
    return s * 0.45;
  }
  if (variant === 'tetrakis') {
    for (let j = -1; j * s < H + s && !c.full; j++) {
      for (let i = -1; i * s < W + s; i++) {
        const [x, y] = [i * s, j * s];
        const m: Pt = [x + s / 2, y + s / 2];
        const corners: Pt[] = [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
        corners.forEach((p, q) => c.poly([p, corners[(q + 1) % 4], m], 1 + mod(q + i + j, 2)));
        if (inset) c.circle(m[0], m[1], s * 0.14, 3);
      }
    }
    return s * 0.35;
  }
  // hexagon and rhombille share a hex grid (pointy sides left and right).
  const R = s * 0.62;
  const dx = 1.5 * R;
  const dy = Math.sqrt(3) * R;
  for (let i = -1; i * dx < W + dx && !c.full; i++) {
    for (let j = -1; j * dy < H + dy; j++) {
      const cx = i * dx;
      const cy = j * dy + (i % 2 ? dy / 2 : 0);
      const hex = regularPoly(cx, cy, R, 6, 0);
      if (variant === 'rhombille') {
        for (let k = 0; k < 3; k++) c.poly([[cx, cy], hex[2 * k], hex[2 * k + 1], hex[(2 * k + 2) % 6]], k + 1);
      } else {
        c.poly(hex, 1 + mod(i + 2 * j, 3));
        if (inset) c.poly(regularPoly(cx, cy, R * 0.5, 6, Math.PI / 6), 4);
      }
    }
  }
  return variant === 'rhombille' ? R * 0.8 : R;
};

const girih: Generator = ({ c, W, H, density }, variant) => {
  const s = CELL[density] * 1.5;
  c.poly([[-1, -1], [W + 1, -1], [W + 1, H + 1], [-1, H + 1]], 2);
  for (let i = -1; i * s < W + s && !c.full; i++) {
    for (let j = -1; j * s < H + s; j++) {
      const [cx, cy] = [i * s, j * s];
      if (variant === 'octagon-square') {
        const side = s / (1 + Math.SQRT2);
        const rc = side / (2 * Math.sin(Math.PI / 8));
        c.poly(regularPoly(cx, cy, rc, 8, Math.PI / 8), 1);
        const star: Pt[] = [];
        for (let k = 0; k < 16; k++) star.push([cx + (k % 2 ? rc * 0.42 : rc * 0.8) * Math.cos(Math.PI / 8 + (k * Math.PI) / 8), cy + (k % 2 ? rc * 0.42 : rc * 0.8) * Math.sin(Math.PI / 8 + (k * Math.PI) / 8)]);
        c.poly(star, 3);
      } else {
        const star: Pt[] = [];
        for (let k = 0; k < 16; k++) {
          const r = k % 2 ? (s / 2) * 0.54 : s / 2;
          star.push([cx + r * Math.cos((k * Math.PI) / 8), cy + r * Math.sin((k * Math.PI) / 8)]);
        }
        c.poly(star, 1);
        c.poly(regularPoly(cx, cy, (s / 2) * 0.5, 8, Math.PI / 8), 3);
      }
    }
  }
  return s * 0.25;
};

const opart: Generator = ({ c, W, H, rand, density, mode }, variant) => {
  const gap = (mode === 'coloring' ? CELL[density] * 0.45 : CELL[density] * 0.3);
  const cx = W * (0.3 + rand() * 0.4);
  const cy = H * (0.3 + rand() * 0.4);
  const sigma = Math.min(W, H) * 0.28;
  if (variant === 'rings') {
    const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    const n = Math.ceil(maxR / gap);
    for (let k = n; k >= 1 && !c.full; k--) c.circle(cx, cy, k * gap, k % 2 ? 1 : PAPER);
    // A second, offset set of rings drawn as lines only gives the moire.
    const [ox, oy] = [cx + gap * (2 + rand() * 3), cy - gap * (1 + rand() * 2)];
    for (let k = 1; k <= n && !c.full; k++) c.circle(ox, oy, k * gap, 0, { colour: 2 });
    return gap;
  }
  if (variant === 'warped-checker') {
    const s = gap * 2;
    const warp = ([x, y]: Pt): Pt => {
      const d = Math.hypot(x - cx, y - cy);
      const f = 1 + 0.55 * Math.exp(-(d * d) / (2 * sigma * sigma));
      return [cx + (x - cx) * f, cy + (y - cy) * f];
    };
    const edge = (a: Pt, b: Pt): Pt[] => Array.from({ length: 4 }, (_, t) => warp([a[0] + ((b[0] - a[0]) * t) / 4, a[1] + ((b[1] - a[1]) * t) / 4]));
    for (let i = -2; i * s < W + 2 * s && !c.full; i++) {
      for (let j = -2; j * s < H + 2 * s; j++) {
        const [x, y] = [i * s, j * s];
        const q: Pt[] = [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
        c.poly([...edge(q[0], q[1]), ...edge(q[1], q[2]), ...edge(q[2], q[3]), ...edge(q[3], q[0])], mod(i + j, 2) ? 1 : 0);
      }
    }
    return s * 0.8;
  }
  // waves: horizontal lines pushed apart by a lens around (cx, cy), every other band filled.
  const step = 12.5;
  const lines: Pt[][] = [];
  const wavelength = 180 + rand() * 160;
  const amp = gap * (0.6 + rand() * 0.6);
  for (let y0 = -gap * 2; y0 < H + gap * 2; y0 += gap) {
    const row: Pt[] = [];
    for (let x = -step; x <= W + step; x += step) {
      const bulge = Math.exp(-((x - cx) ** 2 + (y0 - cy) ** 2) / (2 * sigma * sigma));
      row.push([x, y0 + amp * Math.sin((2 * Math.PI * x) / wavelength) + (y0 - cy) * 0.6 * bulge]);
    }
    lines.push(row);
  }
  for (let k = 0; k + 1 < lines.length && !c.full; k++) {
    if (mode === 'print' && k % 2 === 0) c.poly([...lines[k], ...[...lines[k + 1]].reverse()], 1);
    else c.line(lines[k]);
  }
  c.line(lines[lines.length - 1]);
  return gap;
};

const truchet: Generator = ({ c, W, H, rand, density }, variant) => {
  const s = CELL[density];
  const double = rand() < 0.5;
  for (let i = 0; i * s < W && !c.full; i++) {
    for (let j = 0; j * s < H; j++) {
      const [x, y] = [i * s, j * s];
      const flip = rand() < 0.5;
      if (variant === 'diagonals') {
        const a: Pt[] = flip ? [[x, y], [x + s, y], [x, y + s]] : [[x, y], [x + s, y], [x + s, y + s]];
        const b: Pt[] = flip ? [[x + s, y], [x + s, y + s], [x, y + s]] : [[x, y], [x + s, y + s], [x, y + s]];
        c.poly(a, 1);
        c.poly(b, 2);
        if (double) c.poly(scaleAbout(a, 0.4), 3);
        continue;
      }
      const centres: Pt[] = flip ? [[x + s, y], [x, y + s]] : [[x, y], [x + s, y + s]];
      for (const [px, py] of centres) {
        for (const r of double ? [s / 2, s / 4] : [s / 2]) {
          // A quarter circle around the corner, pointing into the cell.
          const sx = px === x ? 1 : -1;
          const sy = py === y ? 1 : -1;
          const sweep = sx * sy > 0 ? 1 : 0;
          const start: Pt = [px + sx * r, py];
          const end: Pt = [px, py + sy * r];
          c.path(`M${fmt(px)} ${fmt(py)} L${fmt(start[0])} ${fmt(start[1])} A${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(end[0])} ${fmt(end[1])}Z`, 3, r === s / 2 ? 1 : 2);
        }
      }
      c.poly([[x, y], [x + s, y], [x + s, y + s], [x, y + s]], 0);
    }
  }
  return double ? s / 4 : s / 2;
};

const guilloche: Generator = ({ c, W, H, rand, density }, variant) => {
  const [cx, cy] = [W / 2, H / 2];
  const R = Math.min(W, H) * 0.46;
  const curves = density === 'light' ? 4 : density === 'medium' ? 7 : 11;
  const N = 720;
  // One set of curve settings per page; each curve is the same shape turned a little further.
  const pairs: Pt[] = [[3, 2], [3, 4], [5, 4], [5, 6]];
  const [la, lb] = pairs[Math.floor(rand() * pairs.length) % pairs.length];
  const roseK = [3, 4, 5, 6, 7][Math.floor(rand() * 5) % 5];
  const hypoK = 5 + Math.floor(rand() * 6);
  const hypoD = 0.6 + rand() * 0.8;
  const lobes = variant === 'lissajous' ? la + lb : variant === 'rose' ? roseK * 2 : hypoK;
  for (let m = 0; m < curves && !c.full; m++) {
    const p: Pt[] = [];
    const phase = (m / curves) * 2 * Math.PI;
    for (let t = 0; t <= N; t++) {
      const u = (t / N) * 2 * Math.PI;
      if (variant === 'lissajous') {
        p.push([cx + W * 0.44 * Math.sin(la * u + phase / 2), cy + H * 0.44 * Math.sin(lb * u)]);
      } else if (variant === 'rose') {
        const r = R * (0.55 + (0.45 * (m + 1)) / curves) * Math.cos(roseK * u);
        p.push([cx + r * Math.cos(u + phase / roseK), cy + r * Math.sin(u + phase / roseK)]);
      } else {
        // Hypotrochoid: a point on a disc rolling inside a circle k times its size; whole numbers make it close up.
        const big = hypoK;
        const x = (big - 1) * Math.cos(u) + hypoD * Math.cos((big - 1) * u);
        const y = (big - 1) * Math.sin(u) - hypoD * Math.sin((big - 1) * u);
        const turn = phase / hypoK;
        const fit = R / (big - 1 + hypoD);
        p.push([cx + (x * Math.cos(turn) - y * Math.sin(turn)) * fit, cy + (x * Math.sin(turn) + y * Math.cos(turn)) * fit]);
      }
    }
    c.line(p, { colour: 1 + (m % 3) });
  }
  // Every rose curve passes through the centre; a plain disc there keeps it from printing as a solid blot.
  if (variant === 'rose') c.circle(cx, cy, R * 0.12, PAPER);
  if (variant !== 'lissajous') c.circle(cx, cy, R * 1.04, 0);
  return (2 * Math.PI * R * 0.6) / (lobes * curves);
};

const fractal: Generator = ({ c, W, H, density }, variant) => {
  const depth = density === 'light' ? 4 : density === 'medium' ? 5 : 6;
  const L = Math.min(W, H) * 0.9;
  const [ox, oy] = [(W - L) / 2, (H - L) / 2];
  if (variant === 'hilbert') {
    const n = 2 ** depth;
    const step = L / n;
    const p: Pt[] = [];
    for (let d = 0; d < n * n; d++) {
      let [x, y, t] = [0, 0, d];
      for (let s = 1; s < n; s *= 2) {
        const rx = 1 & (t / 2);
        const ry = 1 & (t ^ rx);
        if (ry === 0) {
          if (rx === 1) [x, y] = [s - 1 - x, s - 1 - y];
          [x, y] = [y, x];
        }
        x += s * rx;
        y += s * ry;
        t = Math.floor(t / 4);
      }
      p.push([ox + (x + 0.5) * step, oy + (y + 0.5) * step]);
    }
    c.poly([[ox, oy], [ox + L, oy], [ox + L, oy + L], [ox, oy + L]], 2);
    c.line(p, { colour: 1 });
    return step;
  }
  if (variant === 'carpet') {
    // One level shallower than the other fractals: each level divides by 3, so depth 4 already makes 2 mm holes on letter paper.
    const d = depth - 2;
    c.poly([[ox, oy], [ox + L, oy], [ox + L, oy + L], [ox, oy + L]], 1);
    const holes = (x: number, y: number, size: number, level: number) => {
      if (level === 0 || c.full) return;
      const t = size / 3;
      c.poly([[x + t, y + t], [x + 2 * t, y + t], [x + 2 * t, y + 2 * t], [x + t, y + 2 * t]], PAPER);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== 1 || j !== 1) holes(x + i * t, y + j * t, t, level - 1);
    };
    holes(ox, oy, L, d);
    return L / 3 ** d;
  }
  // Sierpinski triangle, as large as fits.
  const side = Math.min(W * 0.92, (H * 0.92 * 2) / Math.sqrt(3));
  const th = (side * Math.sqrt(3)) / 2;
  const [tx, ty] = [(W - side) / 2, (H + th) / 2];
  const tri = (a: Pt, b: Pt, d0: Pt, level: number) => {
    if (c.full) return;
    if (level === 0) return c.poly([a, b, d0], 1);
    const ab: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const bc: Pt = [(b[0] + d0[0]) / 2, (b[1] + d0[1]) / 2];
    const ca: Pt = [(d0[0] + a[0]) / 2, (d0[1] + a[1]) / 2];
    tri(a, ab, ca, level - 1);
    tri(ab, b, bc, level - 1);
    tri(ca, bc, d0, level - 1);
  };
  tri([tx, ty], [tx + side, ty], [tx + side / 2, ty - th], depth);
  return side / 2 ** depth;
};

const lace: Generator = ({ c, W, H, rand, density }, variant) => {
  const s = CELL[density] * (variant === 'flower-of-life' ? 1.3 : 1);
  if (variant === 'scallop') {
    const r = s / 2;
    // Rows from the top down, each circle painted over the row above, so only the scale shapes show.
    for (let j = -1; j * (r * 0.75) < H + r && !c.full; j++) {
      for (let i = -1; i * s < W + s; i++) {
        const cx = i * s + (j % 2 ? r : 0);
        const cy = j * r * 0.75;
        c.circle(cx, cy, r, mod(j, 2) ? 1 : PAPER);
        c.circle(cx, cy, r * 0.55, 0, { colour: 2 });
      }
    }
    return r * 0.6;
  }
  if (variant === 'quatrefoil') {
    for (let i = 0; i * s < W && !c.full; i++) {
      for (let j = 0; j * s < H; j++) {
        const [x, y] = [i * s + s / 2, j * s + s / 2];
        c.poly([[x - s / 2, y - s / 2], [x + s / 2, y - s / 2], [x + s / 2, y + s / 2], [x - s / 2, y + s / 2]], 2);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.circle(x + (dx * s) / 4, y + (dy * s) / 4, s / 4, 1);
        c.circle(x, y, s * 0.1, 3);
      }
    }
    return s / 4;
  }
  // Flower of life: equal circles, each centred on its neighbours' edges.
  const r = s / 2;
  const dy = (r * Math.sqrt(3)) / 2;
  const tint = rand() < 0.5 ? 1 : 2;
  for (let j = -1; j * dy < H + r && !c.full; j++) {
    for (let i = -1; i * r < W + r; i++) {
      c.circle(i * r + (j % 2 ? r / 2 : 0), j * dy, r, 0, { colour: mod(i + j, 2) + tint });
    }
  }
  return r / 2;
};

const herringbone: Generator = ({ c, W, H, density }, variant) => {
  const s = CELL[density];
  if (variant === 'basketweave') {
    for (let i = 0; i * s < W && !c.full; i++) {
      for (let j = 0; j * s < H; j++) {
        const [x, y] = [i * s, j * s];
        for (let k = 0; k < 3; k++) {
          const a = (k * s) / 3;
          const b = ((k + 1) * s) / 3;
          c.poly((i + j) % 2 ? [[x + a, y], [x + b, y], [x + b, y + s], [x + a, y + s]] : [[x, y + a], [x + s, y + a], [x + s, y + b], [x, y + b]], 1 + (k % 2) + ((i + j) % 2) * 2);
        }
      }
    }
    return s / 3;
  }
  if (variant === 'chevron') {
    const amp = s * 0.5;
    const period = s * 1.2;
    const zig = (y0: number): Pt[] => {
      const p: Pt[] = [];
      for (let x = -period; x <= W + period; x += period / 2) p.push([x, y0 + (Math.round(x / (period / 2)) % 2 ? amp : 0)]);
      return p;
    };
    const rows: Pt[][] = [];
    for (let y0 = -s; y0 < H + s; y0 += s * 0.5) rows.push(zig(y0));
    for (let k = 0; k + 1 < rows.length && !c.full; k++) c.poly([...rows[k], ...[...rows[k + 1]].reverse()], 1 + (k % 3));
    return s * 0.5;
  }
  // Herringbone weave: columns of slanted stripes that change direction from one column to the next.
  const cw = s;
  const sh = s * 0.4;
  for (let i = 0; i * cw < W && !c.full; i++) {
    const dir = i % 2 ? -1 : 1;
    for (let j = -3; j * sh < H + 3 * sh; j++) {
      const [x0, x1] = [i * cw, (i + 1) * cw];
      const y = j * sh;
      c.poly([[x0, y], [x1, y + dir * sh], [x1, y + dir * sh + sh], [x0, y + sh]], 1 + mod(j + i, 2));
    }
  }
  return sh;
};

const GENERATORS: Record<PatternFamily, Generator> = { tessellate, girih, opart, truchet, guilloche, fractal, lace, herringbone };

/** The variant a page gets: the given one, or one picked from the seed. */
export function pickVariant(family: PatternFamily, seed: number): string {
  const vs = PATTERN_VARIANTS[family];
  return vs[Math.floor(seededRandom(seed ^ 0x5bd1e995)() * vs.length) % vs.length];
}

export function generatePattern(seed: number, opts: PatternOptions): Pattern {
  const W = 1000;
  const H = Math.max(200, Math.round(opts.height));
  const variant = opts.variant && (PATTERN_VARIANTS[opts.family] as readonly string[]).includes(opts.variant) ? opts.variant : pickVariant(opts.family, seed);
  const inverted = opts.mode === 'print' && opts.invert;
  const lineColor = opts.mode === 'coloring' ? '#000000' : inverted ? opts.palette.paper : opts.palette.ink;
  const ground = opts.mode === 'coloring' ? '#ffffff' : inverted ? opts.palette.ink : opts.palette.paper;
  const c = new Canvas(opts.mode, opts.palette, ground);
  const cell = GENERATORS[opts.family]({ c, W, H, rand: seededRandom(seed), density: opts.density, mode: opts.mode }, variant);
  const frame = opts.mode === 'coloring' ? `<rect x="${fmt(opts.strokeWidth / 2)}" y="${fmt(opts.strokeWidth / 2)}" width="${fmt(W - opts.strokeWidth)}" height="${fmt(H - opts.strokeWidth)}" fill="none"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><clipPath id="pclip"><rect width="${W}" height="${H}"/></clipPath></defs><rect width="${W}" height="${H}" fill="${ground}"/><g clip-path="url(#pclip)" stroke="${lineColor}" stroke-width="${fmt(opts.strokeWidth)}" stroke-linejoin="round" stroke-linecap="round">${c.els.join('')}${frame}</g></svg>`;
  return {
    svg,
    stats: { family: opts.family, variant, mode: opts.mode, width: W, height: H, elements: c.els.length, segments: c.segments, cell: Math.round(cell * 100) / 100, strokeWidth: opts.strokeWidth, lineColor, backgroundColor: ground, capped: c.capped },
  };
}
