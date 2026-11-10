import { useCallback, useEffect, useRef, useState } from 'react';
import { SUITE_NAME } from '../../src/core/brand.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(message: string, status: number, code: string, details: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  return (await apiFull<T>(path, opts)).data;
}

/** Like api(), plus the list's real size when the server sends one (X-Total-Count), so a page can say "Showing 50 of 412". */
export async function apiFull<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<{ data: T; total: number | null }> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { 'x-daf-client': '1' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError(`The app server is not responding. Is ${SUITE_NAME} still running?`, 0, 'offline', null);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  // Using the app from another computer and the sign-in expired: go to the sign-in page.
  if (res.status === 401 && data?.error?.code === 'login_required') window.location.href = '/login';
  if (!res.ok) throw new ApiError(data?.error?.message ?? `${res.status} ${res.statusText}`, res.status, data?.error?.code ?? 'error', data?.error?.details);
  const total = res.headers.get('x-total-count');
  return { data: data as T, total: total === null ? null : Number(total) };
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const d = Array.isArray(err.details) ? err.details.map((x: any) => (x.field ? `${x.field}: ${x.message}` : x.message ?? JSON.stringify(x))).join('; ') : '';
    return d ? `${err.message} (${d})` : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export const assetUrl = (id: string, download = false) => `/api/assets/${id}/file${download ? '?download=1' : ''}`;
/** A small copy of an image asset, `width` px wide (made once on the server, about a tenth of the full size). */
export const thumbUrl = (id: string, width = 200) => `/api/assets/${id}/thumb?w=${width}`;

export function useApi<T = any>(path: string | null, opts: { poll?: number; keepData?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const seq = useRef(0);
  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    const my = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      const r = await apiFull<T>(path);
      if (my === seq.current) {
        setData(r.data);
        setTotal(r.total);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(errorText(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    // keepData: a "Load more" asks for a longer page; keep showing the rows already there while it loads.
    if (!opts.keepData) setData(null);
    void load(opts.keepData);
  }, [load]);
  useEffect(() => {
    if (!opts.poll || !path) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, opts.poll);
    return () => clearInterval(t);
  }, [opts.poll, path, load]);
  return { data, error, loading, total, reload: () => load(true), setData };
}

/**
 * A list that starts with `pageSize` rows and grows by that much on each "Load more".
 * Polling refreshes only the rows already loaded. `path` must not carry its own `limit`.
 */
export function usePagedApi<T = any>(path: string | null, opts: { pageSize?: number; poll?: number } = {}) {
  const size = opts.pageSize ?? 50;
  const [limit, setLimit] = useState(size);
  const base = useRef(path);
  if (base.current !== path) {
    base.current = path;
    if (limit !== size) setLimit(size);
  }
  const url = path ? `${path}${path.includes('?') ? '&' : '?'}limit=${limit}` : null;
  const st = useApi<T>(url, { poll: opts.poll, keepData: limit > size });
  return { ...st, limit, more: () => setLimit((n) => n + size) };
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
