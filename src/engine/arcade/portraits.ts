import { existsSync, rmSync, statSync } from 'node:fs';
import type { AppContext } from '../../app/context.ts';
import { notFound, validation } from '../../core/errors.ts';
import { sniffImage } from '../references/images.ts';
import { CHARACTERS } from './service.ts';

// Custom character portraits: the owner's own images, shown instead of the built-in pixel art.
// One file per character under arcade/portraits/. Removing it brings the pixel art back.

export const MAX_PORTRAIT_BYTES = 3 * 1024 * 1024;
const EXTS = ['png', 'jpg', 'webp', 'gif'] as const;

function relFor(characterId: string, ext: string): string {
  return `arcade/portraits/${characterId}.${ext}`;
}

function assertCharacter(characterId: string): void {
  if (!CHARACTERS.some((c) => c.id === characterId)) throw notFound('Character', characterId);
}

/** The stored portrait for a character, if there is one. */
export function portraitFor(app: AppContext, characterId: string): { rel: string; mime: string; version: number } | null {
  for (const ext of EXTS) {
    const rel = relFor(characterId, ext);
    const abs = app.assets.resolve(rel);
    if (existsSync(abs)) {
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return { rel, mime, version: Math.floor(statSync(abs).mtimeMs) };
    }
  }
  return null;
}

/** URL the web app uses for a character's portrait, or null. The version changes when the image is replaced. */
export function portraitUrl(app: AppContext, characterId: string): string | null {
  const p = portraitFor(app, characterId);
  return p ? `/api/arcade/characters/${characterId}/portrait?v=${p.version}` : null;
}

export function setPortrait(app: AppContext, characterId: string, data: Buffer): void {
  assertCharacter(characterId);
  if (data.length > MAX_PORTRAIT_BYTES) throw validation(`Portrait is too large (max ${MAX_PORTRAIT_BYTES / 1024 / 1024} MB)`);
  // Judged by the bytes, never the file name.
  const info = sniffImage(data);
  if (!info) throw validation('That file is not a PNG, JPEG, WebP or GIF image');
  if (info.widthPx < 32 || info.heightPx < 32) throw validation('Portrait is too small (at least 32 x 32 pixels)');
  clearPortrait(app, characterId);
  app.assets.writeRaw(relFor(characterId, info.ext), data);
}

export function clearPortrait(app: AppContext, characterId: string): void {
  assertCharacter(characterId);
  for (const ext of EXTS) rmSync(app.assets.resolve(relFor(characterId, ext)), { force: true });
}
