/**
 * Mandala symmetry engine (2026-10-28 plan, task A2).
 *
 * One authored wedge is defined once in <defs> and placed N times with <use>, each copy turned by j * 360 / N
 * degrees about the centre. A mirrored wedge is the authored half plus its reflection across the wedge's axis
 * (scale(-1 1), since the axis points straight up), which gives true mirror symmetry, not just rotation.
 *
 * Reusing one definition keeps the SVG small: a 24-fold, 10-ring design stores each ring's wedge once instead of
 * repeating every shape 24 or 48 times (risk R-1 in the plan). Both `href` and the older `xlink:href` are written,
 * so older SVG tools that only know the second form still find the shape.
 */

const deg = (x: number) => (Math.round(x * 1000) / 1000).toString();

/** The rotation of each copy, in degrees: exactly j * 360 / N for j = 0..N-1. */
export function rotationAngles(symmetryN: number): number[] {
  if (!Number.isInteger(symmetryN) || symmetryN < 1) throw new Error(`Symmetry must be a whole number of at least 1 (got ${symmetryN})`);
  return Array.from({ length: symmetryN }, (_, j) => (j * 360) / symmetryN);
}

const ref = (id: string) => `href="#${id}" xlink:href="#${id}"`;

export interface WedgeOutput {
  /** Definitions to place inside <defs>. */
  defs: string;
  /** The N placed copies. */
  uses: string;
  /** How many times the authored shapes are drawn on the page (N, or 2N when mirrored). */
  copies: number;
}

/**
 * Replicates one authored wedge `symmetryN` times around the centre. `output` is the wedge's SVG, `id` a unique
 * name for it within the document.
 */
export function renderWedge(id: string, output: string, symmetryN: number, opts: { mirrored: boolean }): WedgeOutput {
  const angles = rotationAngles(symmetryN);
  const wedgeId = opts.mirrored ? `${id}m` : id;
  let defs = `<g id="${id}">${output}</g>`;
  if (opts.mirrored) defs += `<g id="${wedgeId}"><use ${ref(id)}/><use ${ref(id)} transform="scale(-1 1)"/></g>`;
  const uses = angles.map((a) => `<use ${ref(wedgeId)}${a === 0 ? '' : ` transform="rotate(${deg(a)})"`}/>`).join('');
  return { defs, uses, copies: symmetryN * (opts.mirrored ? 2 : 1) };
}

/** Reads back the rotations used for one wedge id, in degrees (0 for the unrotated copy). Used by tests and QA. */
export function placedAngles(svg: string, wedgeId: string): number[] {
  const out: number[] = [];
  const re = new RegExp(`<use href="#${wedgeId.replace(/[-]/g, '\\-')}"[^>]*?(?: transform="rotate\\(([-\\d.]+)\\)")?/>`, 'g');
  for (const m of svg.matchAll(re)) out.push(m[1] ? Number(m[1]) : 0);
  return out;
}
