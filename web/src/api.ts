import { useCallback, useEffect, useRef, useState } from 'react';

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
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { 'x-daf-client': '1' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError('The app server is not responding. Is Digital Asset Factory still running?', 0, 'offline', null);
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
  return data as T;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const d = Array.isArray(err.details) ? err.details.map((x: any) => (x.field ? `${x.field}: ${x.message}` : x.message ?? JSON.stringify(x))).join('; ') : '';
    return d ? `${err.message} (${d})` : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export const assetUrl = (id: string, download = false) => `/api/assets/${id}/file${download ? '?download=1' : ''}`;

export function useApi<T = any>(path: string | null, opts: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const seq = useRef(0);
  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    const my = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      const d = await api<T>(path);
      if (my === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(errorText(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);
  useEffect(() => {
    if (!opts.poll || !path) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, opts.poll);
    return () => clearInterval(t);
  }, [opts.poll, path, load]);
  return { data, error, loading, reload: () => load(true), setData };
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
