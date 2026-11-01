/**
 * Recognises image files by their bytes (never by their name: a ".png" from an image site is
 * sometimes really a JPEG) and reads their pixel size from the header, without decoding them.
 */

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif';

export interface ImageInfo {
  format: ImageFormat;
  mime: string;
  ext: string;
  widthPx: number;
  heightPx: number;
}

const MIME: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const EXT: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif' };

function info(format: ImageFormat, w: number, h: number): ImageInfo | null {
  return w > 0 && h > 0 ? { format, mime: MIME[format], ext: EXT[format], widthPx: w, heightPx: h } : null;
}

function jpegSize(b: Buffer): { w: number; h: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    // Start-of-frame markers carry the size; C4 (Huffman), C8 and CC (arithmetic) do not.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/** The image's format and size, or null when the bytes are not a PNG, JPEG, WebP or GIF image. */
export function sniffImage(b: Buffer): ImageInfo | null {
  if (b.length < 30) return null;
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return info('png', b.readUInt32BE(16), b.readUInt32BE(20));
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const s = jpegSize(b);
    return s ? info('jpeg', s.w, s.h) : null;
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return info('webp', b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return info('webp', (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    if (chunk === 'VP8X') return info('webp', b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
    return null;
  }
  if (b.toString('ascii', 0, 4) === 'GIF8') return info('gif', b.readUInt16LE(6), b.readUInt16LE(8));
  return null;
}
