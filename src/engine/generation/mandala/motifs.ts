/**
 * Mandala motif library (2026-10-28 plan, task A1).
 *
 * Every motif draws ONE wedge of a ring, in a coordinate system centred on the mandala with the wedge's axis
 * pointing straight up (angle 0 = up, positive angles turn clockwise). A ring of a mandala is that wedge
 * repeated around the centre (see symmetry.ts).
 *
 * - A `mirrored` motif draws only the right half of its wedge (angles 0..half). The symmetry engine reflects it
 *   across the axis to make the left half, which gives true mirror (dihedral) symmetry.
 * - A motif that is not mirrored (rope) draws the whole wedge (angles -half..half) and is only rotated.
 *
 * Motifs are pure: the same band gives the same SVG. They also report how far from the centre they reach
 * (`maxR`, measured on every point and control point, so it is never an underestimate), how many path segments
 * they drew, how close they come to the centre (`minR`), and the closest any point comes to the axis on the left (`minX`), which tests use to prove a
 * mirrored half stays on its own side.
 */

export interface Band {
  /** Inner radius of the ring band. */
  ri: number;
  /** Outer radius of the ring band. */
  ro: number;
  /** Half the wedge's angle, in radians (a ring of N copies has half = PI / N). */
  half: number;
}

export interface MotifDrawing {
  svg: string;
  maxR: number;
  /** Closest any line comes to the centre (circles count their full radius). */
  minR: number;
  segments: number;
  minX: number;
}

export interface Motif {
  name: MotifName;
  mirrored: boolean;
  draw(band: Band): MotifDrawing;
}

export const MOTIF_NAMES = ['petal', 'trefoil', 'arch', 'teardrop', 'diamond', 'chevron', 'fan', 'scale', 'dot-cluster', 'ring-shell', 'sunburst', 'lattice', 'rope', 'wheat'] as const;
export type MotifName = (typeof MOTIF_NAMES)[number];

const fmt = (x: number) => (Math.round(x * 100) / 100).toString();

type Pt = [number, number];

/** A point at radius r and angle t (0 = straight up, clockwise positive). */
export function polar(r: number, t: number): Pt {
  return [r * Math.sin(t), -r * Math.cos(t)];
}

/** Collects SVG elements and keeps the measurements every motif reports. */
export class Sketch {
  private parts: string[] = [];
  private d: string[] = [];
  maxR = 0;
  minR = Infinity;
  segments = 0;
  minX = Infinity;

  private see([x, y]: Pt, extra = 0): string {
    const r = Math.hypot(x, y);
    if (r + extra > this.maxR) this.maxR = r + extra;
    if (r - extra < this.minR) this.minR = r - extra;
    if (x - extra < this.minX) this.minX = x - extra;
    return `${fmt(x)} ${fmt(y)}`;
  }

  M(p: Pt): this {
    this.d.push(`M${this.see(p)}`);
    return this;
  }

  L(p: Pt): this {
    this.d.push(`L${this.see(p)}`);
    this.segments++;
    return this;
  }

  Q(c: Pt, p: Pt): this {
    this.d.push(`Q${this.see(c)} ${this.see(p)}`);
    this.segments++;
    return this;
  }

  C(c1: Pt, c2: Pt, p: Pt): this {
    this.d.push(`C${this.see(c1)} ${this.see(c2)} ${this.see(p)}`);
    this.segments++;
    return this;
  }

  Z(): this {
    this.d.push('Z');
    return this;
  }

  /** Ends the current path. Open line work is drawn without fill so it never hides what lies under it. */
  end(open = false): this {
    if (this.d.length) this.parts.push(`<path d="${this.d.join(' ')}"${open ? ' fill="none"' : ''}/>`);
    this.d = [];
    return this;
  }

  circle(c: Pt, r: number): this {
    this.see(c, r);
    this.parts.push(`<circle cx="${fmt(c[0])}" cy="${fmt(c[1])}" r="${fmt(r)}" fill="none"/>`);
    // A circle is drawn as 4 curve segments by most renderers; count it that way.
    this.segments += 4;
    return this;
  }

  done(): MotifDrawing {
    this.end();
    return { svg: this.parts.join(''), maxR: this.maxR, minR: this.minR === Infinity ? 0 : this.minR, segments: this.segments, minX: this.minX === Infinity ? 0 : this.minX };
  }
}

/** A closed leaf from radius r0 to r1 along angle t, bulging w radians each side. */
function leaf(s: Sketch, r0: number, r1: number, t: number, w: number): void {
  const m = (r0 + r1) / 2;
  s.M(polar(r0, t)).Q(polar(m, t - w), polar(r1, t)).Q(polar(m, t + w), polar(r0, t)).Z().end();
}

/** The right half of a leaf lying on the axis: from r0 out to r1, bulging w radians to the right. */
function halfLeaf(s: Sketch, r0: number, r1: number, w: number): void {
  s.M(polar(r0, 0)).Q(polar((r0 + r1) / 2, w), polar(r1, 0)).end(true);
}

/** Largest circle radius at polar (r, t) that stays in the band and on the right of the axis. */
function fitCircle(b: Band, r: number, t: number, want: number): number {
  const fromAxis = r * Math.sin(t);
  return Math.max(0.5, Math.min(want, (r - b.ri) * 0.9, (b.ro - r) * 0.9, fromAxis * 0.9));
}

const DRAW: Record<MotifName, { mirrored: boolean; draw: (s: Sketch, b: Band) => void }> = {
  petal: {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      halfLeaf(s, ri, ro, h * 0.85);
      halfLeaf(s, ri + d * 0.22, ro - d * 0.22, h * 0.42);
    },
  },
  trefoil: {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      halfLeaf(s, ri + d * 0.15, ro - d * 0.04, h * 0.4);
      leaf(s, ri + d * 0.12, ri + d * 0.7, h * 0.62, h * 0.26);
    },
  },
  arch: {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      s.M(polar(ri, h * 0.95)).C(polar(ri + d * 0.7, h * 0.95), polar(ro, h * 0.5), polar(ro, 0)).end(true);
      s.M(polar(ri, h * 0.6)).C(polar(ri + d * 0.45, h * 0.6), polar(ro - d * 0.35, h * 0.3), polar(ro - d * 0.35, 0)).end(true);
      s.circle(polar(ri + d * 0.3, h * 0.25), fitCircle({ ri, ro, half: h }, ri + d * 0.3, h * 0.25, d * 0.09));
    },
  },
  teardrop: {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      s.M(polar(ro, 0)).C(polar(ri + d * 0.55, h * 0.2), polar(ri, h * 0.8), polar(ri, 0)).end(true);
      s.M(polar(ro - d * 0.3, 0)).C(polar(ri + d * 0.45, h * 0.12), polar(ri + d * 0.15, h * 0.45), polar(ri + d * 0.15, 0)).end(true);
    },
  },
  diamond: {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      const m = (ri + ro) / 2;
      s.M(polar(ri, 0)).L(polar(m, h * 0.8)).L(polar(ro, 0)).end(true);
      s.M(polar(ri + d * 0.25, 0)).L(polar(m, h * 0.4)).L(polar(ro - d * 0.25, 0)).end(true);
    },
  },
  chevron: {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      for (let k = 0; k < 3; k++) {
        const base = ri + d * (0.05 + k * 0.3);
        s.M(polar(base, h * 0.92)).L(polar(Math.min(ro, base + d * 0.3), 0)).end(true);
      }
    },
  },
  fan: {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      const hub = ri + d * 0.05;
      for (const a of [0.3, 0.6, 0.9]) s.M(polar(hub, 0)).L(polar(ro - d * 0.05, h * a)).end(true);
      s.M(polar(ro, 0)).Q(polar(ro, h * 0.45), polar(ro - d * 0.05, h * 0.9)).end(true);
    },
  },
  scale: {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      for (const [r0, offset] of [[ri + d * 0.1, 0], [ri + d * 0.5, 0.5]] as const) {
        for (let c = 0; c < 2; c++) {
          const t0 = Math.min(h, (c + offset) * (h / 2));
          const t1 = Math.min(h, (c + 1 + offset) * (h / 2));
          if (t1 - t0 < h * 0.2) continue;
          s.M(polar(r0, t0)).Q(polar(r0 + d * 0.42, (t0 + t1) / 2), polar(r0, t1)).end(true);
        }
      }
    },
  },
  'dot-cluster': {
    mirrored: true,
    draw(s, b) {
      const d = b.ro - b.ri;
      for (const [rf, tf, want] of [[0.5, 0.5, 0.2], [0.22, 0.3, 0.1], [0.8, 0.3, 0.1], [0.5, 0.88, 0.07]] as const) {
        const r = b.ri + d * rf;
        const t = b.half * tf;
        s.circle(polar(r, t), fitCircle(b, r, t, d * want));
      }
    },
  },
  'ring-shell': {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      s.M(polar(ri, 0)).C(polar(ri, h * 0.9), polar(ro, h * 0.9), polar(ro, 0)).end(true);
      s.M(polar(ri, 0)).L(polar(ri + d * 0.55, h * 0.55)).end(true);
      s.M(polar(ri, 0)).L(polar(ro - d * 0.12, h * 0.3)).end(true);
    },
  },
  sunburst: {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      s.M(polar(ri, h * 0.05)).L(polar(ro, h * 0.3)).L(polar(ri + d * 0.15, h * 0.6)).L(polar(ro - d * 0.2, h * 0.95)).end(true);
    },
  },
  lattice: {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const m = (ri + ro) / 2;
      s.M(polar(ri, 0)).L(polar(ro, h)).end(true);
      s.M(polar(ro, 0)).L(polar(ri, h)).end(true);
      s.M(polar(m, 0)).L(polar(ro, h / 2)).end(true);
      s.M(polar(m, 0)).L(polar(ri, h / 2)).end(true);
    },
  },
  rope: {
    mirrored: false,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      const m = (ri + ro) / 2;
      // Two twisted strands, each crossing half the wedge, so neighbouring wedges continue the twist.
      for (const t0 of [-h, 0]) s.M(polar(ri + d * 0.1, t0)).C(polar(m, t0), polar(m, t0 + h), polar(ro - d * 0.1, t0 + h)).end(true);
    },
  },
  wheat: {
    mirrored: true,
    draw(s, { ri, ro, half: h }) {
      const d = ro - ri;
      for (let k = 0; k < 3; k++) {
        const r0 = ri + d * (0.1 + k * 0.27);
        const r1 = Math.min(ro, r0 + d * 0.3);
        const [x0, y0] = polar(r0, h * 0.18);
        const [x1, y1] = polar(r1, h * 0.55);
        const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
        const bulge = Math.hypot(x1 - x0, y1 - y0) * 0.16;
        const [nx, ny] = [-(y1 - y0), x1 - x0].map((v) => v / Math.hypot(x1 - x0, y1 - y0)) as Pt;
        s.M([x0, y0]).Q([mx + nx * bulge, my + ny * bulge], [x1, y1]).Q([mx - nx * bulge, my - ny * bulge], [x0, y0]).Z().end();
      }
    },
  },
};

export const MOTIFS: Record<MotifName, Motif> = Object.fromEntries(
  MOTIF_NAMES.map((name) => [name, {
    name,
    mirrored: DRAW[name].mirrored,
    draw(band: Band): MotifDrawing {
      const s = new Sketch();
      DRAW[name].draw(s, band);
      return s.done();
    },
  }]),
) as Record<MotifName, Motif>;

/** Which motifs each motif set draws from. */
export const MOTIF_SETS = {
  classic: ['petal', 'arch', 'teardrop', 'scale', 'dot-cluster', 'ring-shell', 'rope', 'chevron'],
  botanical: ['petal', 'trefoil', 'teardrop', 'wheat', 'fan', 'scale', 'dot-cluster'],
  geometric: ['diamond', 'chevron', 'lattice', 'sunburst', 'arch', 'dot-cluster', 'rope'],
  celestial: ['sunburst', 'diamond', 'dot-cluster', 'ring-shell', 'chevron', 'teardrop', 'petal'],
} as const satisfies Record<string, readonly MotifName[]>;
export type MotifSet = keyof typeof MOTIF_SETS;
