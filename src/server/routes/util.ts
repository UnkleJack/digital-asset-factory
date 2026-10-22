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
