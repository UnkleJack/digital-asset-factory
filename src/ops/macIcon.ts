// The Mac app icon: GAGE, the HAPPY DAFFY ninja (the IDE character), on an arcade-screen tile.
// Drawn here pixel by pixel and written as PNGs inside an .icns file, so no image tools or
// third-party art are needed. The owner picked GAGE for the icon on 2026-11-04.
import { deflateSync, crc32 } from 'node:zlib';

/**
 * GAGE's pixel art, copied from `CharacterSprite` in web/src/arcade/Arcade.tsx (that file is React
 * and can't be imported by a Node script). tests/macApp.test.ts checks the two still match.
 */
export const GAGE_ROWS = [
  '....hh..............',
  '.....hh.............',
  '......gh.kkkkk......',
  '.......gknnnnnk.....',
  '........knnnnnnk....',
  '.......knnnnnnnnk...',
  '.......knnnsssssk...',
  '.......knnnsskesk...',
  '...rrrrknnnnnnnnk...',
  '..rrRrkkknnnnnnk....',
  '.rR..rRkNNnnnnnkk...',
  '......knNnnnnnnnsss.',
  '......knnNnnnnnkss..',
  '......knnnggggggk...',
  '......knnnnnnnnnk...',
  '.......knnnk.knnnk..',
  '.......knnk...knnk..',
  '......knnnk...knnnk.',
  '......kkkkk...kkkkkk',
  '....................',
];
export const GAGE_PALETTE: Record<string, string> = { k: '#0b0d14', n: '#22304f', N: '#3b5384', s: '#d9a066', e: '#a8ff00', r: '#d93a3a', R: '#8c1f1f', g: '#f5c542', h: '#7a5230' };

type RGBA = [number, number, number, number];
const hex = (h: string): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const mix = (a: RGBA, b: RGBA, t: number): RGBA => [0, 1, 2, 3].map((i) => a[i] + (b[i] - a[i]) * t) as RGBA;

/** An RGBA image, 4 bytes per pixel, rows top to bottom. */
export interface Bitmap { size: number; data: Uint8Array }

const BASE = 1024;
// Apple's icon grid: the tile is 824 px wide inside a 1024 canvas, with rounded corners.
const TILE = { x: 100, y: 100, size: 824, radius: 185 };
const SCREEN = { x: 148, y: 148, size: 728, radius: 140 };

/** How much of pixel (px, py) a rounded square covers, from 0 to 1 (4×4 samples for smooth edges). */
function coverage(px: number, py: number, r: { x: number; y: number; size: number; radius: number }): number {
  let hits = 0;
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const x = px + (sx + 0.5) / 4 - r.x;
      const y = py + (sy + 0.5) / 4 - r.y;
      if (x < 0 || y < 0 || x > r.size || y > r.size) continue;
      const cx = Math.min(Math.max(x, r.radius), r.size - r.radius);
      const cy = Math.min(Math.max(y, r.radius), r.size - r.radius);
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r.radius ** 2) hits++;
    }
  }
  return hits / 16;
}

function over(dst: Uint8Array, i: number, c: RGBA, alpha: number): void {
  const a = (c[3] / 255) * alpha;
  if (a <= 0) return;
  const da = dst[i + 3] / 255;
  const out = a + da * (1 - a);
  for (let k = 0; k < 3; k++) dst[i + k] = Math.round((c[k] * a + dst[i + k] * da * (1 - a)) / out);
  dst[i + 3] = Math.round(out * 255);
}

/** The full-size 1024 × 1024 icon. */
export function drawIcon(): Bitmap {
  const data = new Uint8Array(BASE * BASE * 4);
  const frameTop = hex('#2a2a2e');
  const frameBottom = hex('#151517');
  const gold = hex('#f5c542');
  const screenTop = hex('#123f4a');
  const screenBottom = hex('#04161b');
  const glow = hex('#5ef0ff');

  for (let y = 0; y < BASE; y++) {
    for (let x = 0; x < BASE; x++) {
      const i = (y * BASE + x) * 4;
      const tile = coverage(x, y, TILE);
      if (tile === 0) continue;
      // Cabinet frame with a thin gold edge just inside it.
      over(data, i, mix(frameTop, frameBottom, (y - TILE.y) / TILE.size), tile);
      const rim = coverage(x, y, { x: SCREEN.x - 10, y: SCREEN.y - 10, size: SCREEN.size + 20, radius: SCREEN.radius + 10 });
      if (rim > 0) over(data, i, gold, rim);
      const screen = coverage(x, y, SCREEN);
      if (screen > 0) {
        // The screen: dark teal, lit from the middle, with faint scanlines.
        const d = Math.hypot(x - 512, y - 470) / 520;
        let c = mix(screenTop, screenBottom, (y - SCREEN.y) / SCREEN.size);
        c = mix(c, glow, Math.max(0, 0.5 - d * 0.5));
        if (y % 12 < 3) c = mix(c, [0, 0, 0, 255], 0.18);
        over(data, i, c, screen);
      }
    }
  }

  // GAGE, centred on the screen, with a soft drop shadow.
  const cell = 32;
  const cols = GAGE_ROWS[0].length;
  const filled = GAGE_ROWS.flatMap((row, y) => [...row].map((ch, x) => (GAGE_PALETTE[ch] ? { x, y } : null))).filter((p) => p !== null);
  const minX = Math.min(...filled.map((p) => p.x));
  const maxX = Math.max(...filled.map((p) => p.x));
  const minY = Math.min(...filled.map((p) => p.y));
  const maxY = Math.max(...filled.map((p) => p.y));
  const ox = Math.round(512 - ((maxX - minX + 1) * cell) / 2) - minX * cell;
  const oy = Math.round(512 - ((maxY - minY + 1) * cell) / 2) - minY * cell;
  const paint = (dx: number, dy: number, colour: (ch: string) => RGBA | null, alpha: number) => {
    GAGE_ROWS.forEach((row, gy) => {
      for (let gx = 0; gx < cols; gx++) {
        const c = colour(row[gx]);
        if (!c) continue;
        for (let y = oy + gy * cell + dy; y < oy + (gy + 1) * cell + dy; y++) {
          for (let x = ox + gx * cell + dx; x < ox + (gx + 1) * cell + dx; x++) over(data, (y * BASE + x) * 4, c, alpha);
        }
      }
    });
  };
  paint(14, 18, (ch) => (GAGE_PALETTE[ch] ? [0, 0, 0, 255] : null), 0.45);
  paint(0, 0, (ch) => (GAGE_PALETTE[ch] ? hex(GAGE_PALETTE[ch]) : null), 1);
  return { size: BASE, data };
}

/** Shrinks an image by a whole-number factor, averaging each block of pixels (alpha-weighted). */
export function shrink(src: Bitmap, size: number): Bitmap {
  const f = src.size / size;
  if (!Number.isInteger(f) || f < 1) throw new Error(`Can only shrink ${src.size} px by a whole number, not to ${size} px.`);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = y * f; sy < (y + 1) * f; sy++) {
        for (let sx = x * f; sx < (x + 1) * f; sx++) {
          const i = (sy * src.size + sx) * 4;
          const w = src.data[i + 3];
          r += src.data[i] * w; g += src.data[i + 1] * w; b += src.data[i + 2] * w; a += w;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) { data[o] = Math.round(r / a); data[o + 1] = Math.round(g / a); data[o + 2] = Math.round(b / a); }
      data[o + 3] = Math.round(a / (f * f));
    }
  }
  return { size, data };
}

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

/** A plain 8-bit RGBA PNG. */
export function encodePng(img: Bitmap): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.size, 0);
  ihdr.writeUInt32BE(img.size, 4);
  ihdr[8] = 8; // bits per channel
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc(img.size * (img.size * 4 + 1));
  for (let y = 0; y < img.size; y++) {
    rows[y * (img.size * 4 + 1)] = 0; // no filter
    rows.set(img.data.subarray(y * img.size * 4, (y + 1) * img.size * 4), y * (img.size * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', new Uint8Array())]);
}

/** The icon sizes macOS looks for in an .icns file, by entry type (the @2x ones are for Retina screens). */
export const ICNS_ENTRIES: Array<{ type: string; size: number }> = [
  { type: 'icp4', size: 16 },
  { type: 'icp5', size: 32 },
  { type: 'ic11', size: 32 },
  { type: 'icp6', size: 64 },
  { type: 'ic12', size: 64 },
  { type: 'ic07', size: 128 },
  { type: 'ic08', size: 256 },
  { type: 'ic13', size: 256 },
  { type: 'ic09', size: 512 },
  { type: 'ic14', size: 512 },
  { type: 'ic10', size: 1024 },
];

/** The whole .icns file: a header, then one PNG per size. */
export function makeIcns(img: Bitmap = drawIcon()): Buffer {
  const pngs = new Map<number, Buffer>();
  const parts = ICNS_ENTRIES.map(({ type, size }) => {
    if (!pngs.has(size)) pngs.set(size, encodePng(size === img.size ? img : shrink(img, size)));
    const png = pngs.get(size)!;
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}
