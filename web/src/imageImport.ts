// Getting pictures into the image library: from files, from a drag or paste out of a web page, or a pasted
// picture. Shared by the Imports page's drop box and the app-wide drop catcher (imageCatcher.tsx).
import { api, ApiError, errorText } from './api.ts';

export type ImportResult = { name: string; status: 'imported' | 'duplicate' | 'rejected' | 'error'; detail: string };

/** One picture to import: a dropped or chosen file, or one fetched from a dragged web link. */
export type Incoming = { name: string; blob: Blob; madeAt?: number };
/** A picture still to fetch: the links to try in order. */
type Linked = { name: string; links: string[] };
export type Pending = Incoming | Linked;

/** What the owner typed about the pictures on the Imports page. The app-wide catcher leaves these empty. */
export type ImportMeta = { label?: string; sourceTool?: string; prompt?: string };

/** Window event sent after pictures were imported, so an open Imports page can refresh its library. */
export const IMAGES_IMPORTED = 'daf:images-imported';

export const NO_PICTURE = 'No picture found in what was dropped. Try dragging the picture itself, not its page.';

function readBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error ?? new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}

const STORED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Pictures the factory doesn't store as-is (AVIF, BMP, SVG, ICO...) are redrawn by the browser and saved as PNG. */
async function toStorable(item: Incoming): Promise<Incoming> {
  if (!item.blob.type || STORED.includes(item.blob.type)) return item;
  const url = URL.createObjectURL(item.blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 1200, h = img.naturalHeight || 1200;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const png = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
    if (!png) throw new Error('could not convert');
    return { ...item, name: item.name.replace(/\.[A-Za-z0-9]{2,5}$/, '') + '.png', blob: png };
  } catch {
    throw new Error(`This browser can't open ${item.blob.type.replace('image/', '').toUpperCase() || 'this'} pictures, so it can't be imported.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The pictures in a drag or paste from a web page: each <img> in its HTML, else its link list or plain text.
 * Each picture is a list of links to try in order: the largest size the page offers first, then the one shown.
 */
export function linksIn(dt: DataTransfer): string[][] {
  const out: string[][] = [];
  const html = dt.getData('text/html');
  if (html) for (const img of new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? '';
    const set = img.getAttribute('srcset');
    // srcset lists sizes; the last entry is usually the largest.
    const best = set ? set.split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean).pop() : undefined;
    const tries = [...new Set([best, src].filter((x): x is string => !!x))];
    if (tries.length) out.push(tries);
  }
  if (!out.length) for (const line of (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split(/\r?\n/)) {
    const t = line.trim();
    if (/^(https?:|data:image\/)/i.test(t)) out.push([t]);
  }
  return out.slice(0, 50);
}

export const fromFiles = (files: File[]): Incoming[] => files.map((f) => ({ name: f.name, blob: f, madeAt: f.lastModified }));

/**
 * Files when the drag or paste carries them; otherwise the picture links a web page put in it.
 * Must be called straight away in the drop or paste handler: the browser empties the data afterwards.
 */
export function picturesIn(dt: DataTransfer): Pending[] {
  const files = [...dt.files].filter((f) => f.type.startsWith('image/') || !f.type);
  if (files.length) return fromFiles(files);
  return linksIn(dt).map((l) => ({ name: l[0].startsWith('data:') ? 'pasted image' : l[0].split('?')[0].split('/').pop() || l[0], links: l }));
}

async function fetchLink(link: string): Promise<Incoming> {
  if (link.startsWith('data:')) {
    const blob = await (await fetch(link)).blob();
    return { name: `pasted-image.${blob.type.split('/')[1]?.replace('jpeg', 'jpg').replace(/\+.*/, '') || 'png'}`, blob };
  }
  const res = await fetch('/api/references/fetch-image', { method: 'POST', headers: { 'x-daf-client': '1', 'content-type': 'application/json' }, body: JSON.stringify({ url: link }) });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new ApiError(e?.error?.message ?? `Could not fetch the picture (${res.status}).`, res.status, e?.error?.code ?? 'error', null);
  }
  const name = decodeURIComponent(res.headers.get('x-file-name') ?? '') || 'web-image';
  return { name, blob: await res.blob() };
}

/** The first link that gives a picture (a page's "largest size" link sometimes doesn't exist). */
async function fetchFirst(links: string[]): Promise<Incoming & { from: string }> {
  let err: unknown;
  for (const l of links) {
    try { return { ...(await fetchLink(l)), from: l }; } catch (e) { err = e; }
  }
  throw err;
}

/** Imports the pictures one by one, reporting each step, and tells any open Imports page to refresh. */
export async function importPictures(items: Pending[], meta: ImportMeta, onProgress?: (step: string, results: ImportResult[]) => void): Promise<ImportResult[]> {
  const out: ImportResult[] = [];
  for (const [i, it] of items.entries()) {
    onProgress?.(`Importing ${i + 1} of ${items.length}…`, [...out]);
    try {
      const got = 'links' in it ? await fetchFirst(it.links) : null;
      const f = await toStorable(got ?? (it as Incoming));
      const r = await api<any>('/references/images', { body: { fileName: f.name, dataBase64: await readBase64(f.blob), label: meta.label, sourceTool: meta.sourceTool, prompt: meta.prompt, notes: got && !got.from.startsWith('data:') ? `Imported from ${got.from.slice(0, 1900)}` : undefined, madeAt: f.madeAt ? new Date(f.madeAt).toISOString() : undefined } });
      out.push(r.status === 'imported' ? { name: f.name, status: 'imported', detail: `saved as ${r.path}` }
        : r.status === 'duplicate' ? { name: f.name, status: 'duplicate', detail: `same image as ${r.existingPath ?? r.existingLabel}, skipped` }
        : { name: f.name, status: 'rejected', detail: r.reason });
    } catch (e) {
      out.push({ name: it.name, status: 'error', detail: errorText(e) });
    }
    onProgress?.(`Importing ${i + 1} of ${items.length}…`, [...out]);
  }
  window.dispatchEvent(new Event(IMAGES_IMPORTED));
  return out;
}
