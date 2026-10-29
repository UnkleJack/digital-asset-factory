import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../src/engine/rendering/renderer.ts';
import { Logger } from '../src/logging/logger.ts';
import { BUILTIN_DESIGN_SYSTEMS, BUILTIN_AUDIENCES, BUILTIN_THEMES, applyAudienceAndPaper, type Paper } from '../src/engine/templates/library.ts';
import type { ProductTypeDefinition, TypeContext } from '../src/engine/producttypes/types.ts';
import { seededRandom } from '../src/core/hash.ts';
import { resolveChromePath } from '../src/config/chrome.ts';

export const CHROME = resolveChromePath('');
export const FONTS_DIR = fileURLToPath(new URL('../node_modules/@fontsource', import.meta.url));

export function tempDir(prefix = 'daf-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function quietLogger(): Logger {
  return new Logger({ dir: null, console: false });
}

export function testRenderer(): Renderer {
  return new Renderer({ chromePath: CHROME, concurrency: 2, timeoutMs: 60000, log: quietLogger() });
}

export function makeContext<P>(def: ProductTypeDefinition<P>, opts: { params?: Partial<P>; paper?: Partial<Paper>; design?: number; audience?: string; theme?: string; seed?: number } = {}): TypeContext<P> {
  const params = def.paramsSchema.parse({ ...(def.id === 'bundle' ? {} : (def.defaultParams(new Date('2026-10-22T00:00:00Z')) as object)), ...(opts.params ?? {}) }) as P;
  const paper: Paper = { size: 'letter', orientation: 'portrait', grayscale: false, ...(opts.paper ?? {}) };
  const aud = opts.audience ? BUILTIN_AUDIENCES.find((a) => a.name === opts.audience) ?? null : null;
  const th = opts.theme ? BUILTIN_THEMES.find((t) => t.name === opts.theme) ?? null : null;
  const tokens = applyAudienceAndPaper(BUILTIN_DESIGN_SYSTEMS[opts.design ?? 0].tokens, aud?.profile ?? null, paper);
  const base = { params, paper, tokens, audience: aud ? { name: aud.name, profile: aud.profile } : null, theme: th ? { name: th.name, keywords: th.keywords } : null, shopName: 'Test Shop', seed: opts.seed ?? 12345, revisionNotes: '' };
  return { ...base, title: def.defaultTitle(base) };
}

export function deterministic<P, C>(def: ProductTypeDefinition<P, C>, ctx: TypeContext<P>): C {
  return def.contentSchema.parse(def.deterministicContent(ctx, seededRandom(ctx.seed)));
}

export async function idle(a: { db: { value<T>(sql: string): T | undefined; all(sql: string): unknown[] } }, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const busy = a.db.value<number>("SELECT count(*) FROM jobs WHERE status IN ('queued','running')") ?? 0;
    if (!busy) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Jobs did not finish in time: ' + JSON.stringify(a.db.all("SELECT type, status, last_error FROM jobs WHERE status IN ('queued','running')")));
}
