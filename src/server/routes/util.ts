import { validation } from '../../core/errors.ts';
import type { z } from 'zod';

export function int(v: unknown, def: number, min = 0, max = 1000): number {
  const n = Number(v);
  if (v === undefined || v === '' || !Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length ? v : undefined;
}

export function parse<T>(schema: z.ZodType<T>, body: unknown, what = 'request'): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw validation(`Invalid ${what}`, r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  return r.data;
}

export type Q = Record<string, string | undefined>;
export type P = Record<string, string>;

/** Largest page a list endpoint returns. Pages grow by "Load more", so this is a safety ceiling, not a page size. */
export const LIST_MAX = 5000;

/** Reports how many rows a list has in total, so a page can say "Showing 50 of 412" without changing its JSON shape. */
export function totalHeader(reply: { header: (k: string, v: string) => unknown }, total: number | null | undefined): void {
  reply.header('X-Total-Count', String(total ?? 0));
}
