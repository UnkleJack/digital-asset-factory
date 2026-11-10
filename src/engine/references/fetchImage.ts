import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '../../core/errors.ts';

/*
 * Fetches a picture that was dragged in from a web page (browsers hand over its link, not a file).
 * Only public http(s) addresses, a size cap, a timeout, and the answer must be an image.
 */

export const MAX_FETCH_BYTES = 15 * 1024 * 1024;

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return privateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

const bad = (message: string) => new AppError('bad_request', message, { httpStatus: 400, errorClass: 'permanent' });

async function checkUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw bad('That is not a web address.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw bad('Only http and https links can be fetched.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw bad(`Could not find ${host}.`); });
  if (addrs.some((a) => privateAddress(a.address))) throw bad('Links to this computer or a private network are not fetched.');
  return url;
}

export interface Fetched { bytes: Buffer; contentType: string; fileName: string }

/** Downloads the picture at `raw`, following up to 3 redirects (each one re-checked). */
export async function fetchImage(raw: string, fetcher: typeof fetch = fetch): Promise<Fetched> {
  let url = await checkUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { accept: 'image/*,*/*;q=0.5', 'user-agent': 'Mozilla/5.0 (AssetFoundry image import)' } })
      .catch(() => { throw bad(`Could not reach ${url.hostname}.`); });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await checkUrl(new URL(res.headers.get('location')!, url).toString());
      continue;
    }
    if (!res.ok) throw bad(`${url.hostname} answered ${res.status}.`);
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (contentType && !contentType.startsWith('image/') && contentType !== 'application/octet-stream') throw bad(`That link is a ${contentType} page, not a picture. Try dragging the picture itself, or right-click it and copy the image address.`);
    if (Number(res.headers.get('content-length') ?? 0) > MAX_FETCH_BYTES) throw bad('That picture is larger than 15 MB.');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of res.body ?? []) {
      size += c.length;
      if (size > MAX_FETCH_BYTES) throw bad('That picture is larger than 15 MB.');
      chunks.push(Buffer.from(c));
    }
    const last = decodeURIComponent(url.pathname.split('/').pop() ?? '').replace(/[^\w.\- ]/g, '').slice(0, 120);
    return { bytes: Buffer.concat(chunks), contentType: contentType || 'application/octet-stream', fileName: last || `${url.hostname}-image` };
  }
  throw bad('Too many redirects.');
}
