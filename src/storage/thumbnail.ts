import { crc32, deflateSync, inflateSync } from 'node:zlib';

/*
 * Small copies of page previews for lists and galleries.
 * Previews are full-page PNGs (about 100 KB each); a thumbnail 200 px wide is a fraction of that.
 * Pure Node, so it works the same on macOS and Windows without an image library.
 */

export interface Image { width: number; height: number; channels: 3; data: Uint8Array }

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * Reads an 8-bit, non-interlaced PNG (grey, grey+alpha, RGB or RGBA) into RGB on white.
 * Returns null for anything else (palette, 16-bit, interlaced), and the caller then uses the original.
 */
export function decodePng(buf: Buffer): Image | null {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIGNATURE)) return null;
  let pos = 8;
  let width = 0, height = 0, depth = 0, type = -1, interlace = 0;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = CHANNELS[type];
  if (!bpp || depth !== 8 || interlace !== 0 || !width || !height || width * height > 40_000_000) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  if (raw.length < height * (stride + 1)) return null;
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[out + x - bpp] : 0;
      const b = y > 0 ? px[out - stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[out - stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (filter !== 0) return null;
      px[out + x] = v & 255;
    }
  }
  // Flatten to RGB on white (transparent page edges should look like paper).
  const data = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < width * height; i++, j += 3) {
    const s = i * bpp;
    const grey = bpp <= 2;
    const r = px[s], g = grey ? r : px[s + 1], bl = grey ? r : px[s + 2];
    const alpha = bpp === 2 ? px[s + 1] : bpp === 4 ? px[s + 3] : 255;
    data[j] = Math.round((r * alpha + 255 * (255 - alpha)) / 255);
    data[j + 1] = Math.round((g * alpha + 255 * (255 - alpha)) / 255);
    data[j + 2] = Math.round((bl * alpha + 255 * (255 - alpha)) / 255);
  }
  return { width, height, channels: 3, data };
}

/** Shrinks to `width` px wide (height keeps the shape) by averaging each block of source pixels. Never enlarges. */
export function resize(img: Image, width: number): Image {
  if (width >= img.width) return img;
  const height = Math.max(1, Math.round((img.height * width) / img.width));
  const data = new Uint8Array(width * height * 3);
  const fx = img.width / width, fy = img.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let r = 0, g = 0, b = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * img.width + sx) * 3;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2];
        }
      }
      const n = (y1 - y0) * (x1 - x0), o = (y * width + x) * 3;
      data[o] = Math.round(r / n); data[o + 1] = Math.round(g / n); data[o + 2] = Math.round(b / n);
    }
  }
  return { width, height, channels: 3, data };
}

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

/** An 8-bit RGB PNG. Each row uses the "up" filter, which suits printed pages (long runs of the same colour). */
export function encodePng(img: Image): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = img.width * 3;
  const rows = Buffer.alloc(img.height * (stride + 1));
  for (let y = 0; y < img.height; y++) {
    rows[y * (stride + 1)] = 2;
    for (let x = 0; x < stride; x++) {
      const above = y > 0 ? img.data[(y - 1) * stride + x] : 0;
      rows[y * (stride + 1) + 1 + x] = (img.data[y * stride + x] - above) & 255;
    }
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', new Uint8Array())]);
}

/** A thumbnail `width` px wide, or null when the source can't be read (the caller then sends the original). */
export function makeThumbnail(png: Buffer, width: number): Buffer | null {
  const img = decodePng(png);
  if (!img) return null;
  return encodePng(resize(img, width));
}
