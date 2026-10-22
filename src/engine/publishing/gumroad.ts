import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppContext } from '../../app/context.ts';
import { AppError } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import { adapterFor, gumroadAdapter, OutcomeUnknownError, type AdapterInput, type MarketplaceAdapter, type PublishResult } from './adapters.ts';

/*
 * Gumroad API v2 client. Endpoints, payload shapes and the upload flow follow Gumroad's own
 * open-source CLI (github.com/antiwork/gumroad-cli v0.5.0, internal/api, internal/upload,
 * internal/cmd/products) because the HTML API docs at gumroad.com/api render client-side only:
 *   - base https://api.gumroad.com/v2, header "Authorization: Bearer <token>"
 *   - errors: HTTP 4xx/5xx, or HTTP 200 with {"success": false, "message": "..."}
 *   - files: POST /files/presign (form: filename, file_size) → {upload_id, key, parts[{part_number, presigned_url}]};
 *            PUT each 100 MB part to its presigned_url, keep the ETag header;
 *            POST /files/complete (JSON {upload_id, key, parts[{part_number, etag}]}) → {file_url}
 *   - POST /products (JSON) with name, native_type, price (cents), description (HTML), tags,
 *            files[{id, url, display_name}] and rich_content embedding those files → {product:{id,...}}
 *   - PUT /products/:id/enable publishes; GET /products/:id → {product:{short_url, published,...}}
 *   - GET /sales?after=YYYY-MM-DD&page_key=... → {sales:[...], next_page_key}
 * Cover images are not settable through this API (the CLI has no option for them either),
 * so they are added in Gumroad by hand if wanted.
 */

const PART_SIZE = 100 * 1024 * 1024;

export interface GumroadConfig {
  baseUrl: string;
  timeoutMs: number;
}

export class GumroadError extends AppError {
  readonly status: number;
  constructor(status: number, message: string) {
    const transient = status === 0 || status === 408 || status === 409 || status === 429 || status >= 500;
    super('gumroad_error', `Gumroad: ${message}`, { httpStatus: 502, errorClass: transient ? 'transient' : 'permanent' });
    this.status = status;
  }
}

function friendly(status: number, message: string): string {
  if (status === 401) return 'the access token was rejected. Create a new one in Gumroad → Settings → Advanced → Applications and save it in Settings → Integrations.';
  if (status === 403) return `access denied${message ? ` (${message})` : ''}. Check that the token can edit products.`;
  if (status === 429) return 'Gumroad is rate-limiting requests; try again in a few minutes.';
  return message || `HTTP ${status}`;
}

export class GumroadClient {
  private getToken: () => Promise<string | null>;
  private cfg: () => GumroadConfig;

  constructor(getToken: () => Promise<string | null>, cfg: () => GumroadConfig) {
    this.getToken = getToken;
    this.cfg = cfg;
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getToken());
  }

  /**
   * One API call. `ambiguous` marks requests that create something: if one of those times out or
   * the connection drops after sending, Gumroad may have acted, so the caller gets an
   * OutcomeUnknownError instead of an ordinary failure.
   */
  async call<T>(method: string, path: string, opts: { form?: Record<string, string>; json?: unknown; query?: Record<string, string>; ambiguous?: boolean } = {}): Promise<T> {
    const token = await this.getToken();
    if (!token) throw new GumroadError(401, 'no access token is saved (Settings → Integrations → Gumroad).');
    const cfg = this.cfg();
    const url = new URL(`${cfg.baseUrl.replace(/\/$/, '')}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    let body: string | undefined;
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(opts.form).toString();
    }
    let res: Response;
    let text: string;
    try {
      res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(cfg.timeoutMs) });
      text = await res.text();
    } catch (err) {
      const name = (err as Error)?.name;
      const what = name === 'TimeoutError' || name === 'AbortError' ? 'timed out' : 'lost its connection';
      if (opts.ambiguous) throw new OutcomeUnknownError(`the request to Gumroad ${what}; Gumroad may or may not have created the product`);
      throw new GumroadError(0, `the request ${what} (offline, or Gumroad is unreachable).`);
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      if (res.ok) throw new GumroadError(502, 'Gumroad returned a response that is not JSON.');
    }
    const message = typeof parsed.message === 'string' ? parsed.message.slice(0, 300) : '';
    if (!res.ok) {
      if (opts.ambiguous && res.status >= 500) throw new OutcomeUnknownError(`Gumroad answered HTTP ${res.status}; it may or may not have created the product`);
      throw new GumroadError(res.status, friendly(res.status, message));
    }
    if (parsed.success === false) throw new GumroadError(422, message || 'Gumroad rejected the request.');
    return parsed as T;
  }

  /** Uploads one file through Gumroad's presigned multipart flow and returns its file_url. */
  async uploadFile(filename: string, data: Uint8Array): Promise<string> {
    const pre = await this.call<{ upload_id?: string; key?: string; parts?: { part_number: number; presigned_url: string }[] }>('POST', '/files/presign', { form: { filename, file_size: String(data.byteLength) } });
    if (!pre.upload_id || !pre.key || !pre.parts?.length) throw new GumroadError(502, 'the file upload could not be started (incomplete presign response).');
    const cfg = this.cfg();
    const parts: { part_number: number; etag: string }[] = [];
    try {
      for (const p of [...pre.parts].sort((a, b) => a.part_number - b.part_number)) {
        const start = (p.part_number - 1) * PART_SIZE;
        const chunk = data.subarray(start, Math.min(start + PART_SIZE, data.byteLength));
        const put = await fetch(p.presigned_url, { method: 'PUT', body: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength) as unknown as BodyInit, signal: AbortSignal.timeout(cfg.timeoutMs) });
        const etag = put.headers.get('etag')?.replace(/"/g, '');
        if (!put.ok || !etag) throw new GumroadError(put.status || 502, `uploading part ${p.part_number} of ${filename} failed.`);
        parts.push({ part_number: p.part_number, etag });
      }
    } catch (err) {
      await this.call('POST', '/files/abort', { form: { upload_id: pre.upload_id, key: pre.key } }).catch(() => {});
      throw err instanceof GumroadError ? err : new GumroadError(0, `uploading ${filename} failed: ${(err as Error)?.message ?? err}`);
    }
    const done = await this.call<{ file_url?: string }>('POST', '/files/complete', { json: { upload_id: pre.upload_id, key: pre.key, parts } });
    if (!done.file_url) throw new GumroadError(502, `finishing the upload of ${filename} returned no file URL.`);
    return done.file_url;
  }

  async createProduct(input: { name: string; priceCents: number; currency: string; descriptionHtml: string; summary?: string; tags: string[]; files: { url: string; name: string }[] }): Promise<{ id: string; shortUrl: string | null }> {
    const refs = input.files.map((f) => ({ id: `daf-upload-${randomUUID()}`, uid: randomUUID(), ...f }));
    const body: Record<string, unknown> = {
      name: input.name,
      native_type: 'digital',
      price: String(input.priceCents),
      price_currency_type: input.currency.toLowerCase(),
      description: input.descriptionHtml,
      tags: input.tags,
      files: refs.map((r) => ({ id: r.id, url: r.url, display_name: r.name })),
      rich_content: [{ title: 'Page 1', description: { type: 'doc', content: [...refs.map((r) => ({ type: 'fileEmbed', attrs: { id: r.id, uid: r.uid, collapsed: false } })), { type: 'paragraph' }] } }],
    };
    if (input.summary) body.custom_summary = input.summary;
    const res = await this.call<{ product?: { id?: string; short_url?: string } }>('POST', '/products', { json: body, ambiguous: true });
    if (!res.product?.id) throw new OutcomeUnknownError('Gumroad accepted the request but returned no product id');
    return { id: res.product.id, shortUrl: res.product.short_url ?? null };
  }

  async enableProduct(id: string): Promise<void> {
    await this.call('PUT', `/products/${encodeURIComponent(id)}/enable`);
  }

  async getProduct(id: string): Promise<{ id: string; shortUrl: string | null; published: boolean }> {
    const res = await this.call<{ product?: { id: string; short_url?: string; published?: boolean } }>('GET', `/products/${encodeURIComponent(id)}`);
    if (!res.product) throw new GumroadError(404, `product ${id} was not found.`);
    return { id: res.product.id, shortUrl: res.product.short_url ?? null, published: !!res.product.published };
  }

  async user(): Promise<{ name: string | null; email: string | null }> {
    const res = await this.call<{ user?: { name?: string; email?: string } }>('GET', '/user');
    return { name: res.user?.name ?? null, email: res.user?.email ?? null };
  }

  async *sales(after: string): AsyncGenerator<GumroadSale> {
    let pageKey: string | undefined;
    for (let page = 0; page < 200; page++) {
      const res = await this.call<{ sales?: GumroadSale[]; next_page_key?: string }>('GET', '/sales', { query: { after, ...(pageKey && { page_key: pageKey }) } });
      for (const s of res.sales ?? []) yield s;
      if (!res.next_page_key) return;
      pageKey = res.next_page_key;
    }
  }
}

export interface GumroadSale {
  id: string;
  product_id?: string;
  product_name?: string;
  price?: number;
  formatted_total_price?: string;
  created_at?: string;
  refunded?: boolean;
  quantity?: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Listing descriptions are plain text with blank-line paragraphs; Gumroad wants HTML. */
export function descriptionHtml(text: string): string {
  return text.trim().split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

export function gumroadClientFor(app: AppContext): GumroadClient {
  return new GumroadClient(() => app.secrets.get('gumroad_token'), () => {
    const g = app.settings.get('marketplaces').gumroad;
    return { baseUrl: g.apiBaseUrl, timeoutMs: g.timeoutMs };
  });
}

/**
 * The Gumroad adapter bound to this app's token, settings and files. Direct publishing is
 * "unverified" until a real product has been created with a real token and checked in the
 * Gumroad dashboard; until then it only runs when the operator has turned on
 * Settings → Marketplaces → Gumroad → auto publish enabled.
 */
export function boundGumroadAdapter(app: AppContext): MarketplaceAdapter {
  const client = gumroadClientFor(app);
  return {
    ...gumroadAdapter,
    verification: 'unverified',
    capabilities: { manualExport: true, connect: true, publish: true, update: false, reconcile: false },
    notes: 'Direct publishing uses the Gumroad API with your access token: files are uploaded, the product is created with your title, price, tags and description, then published (or left as a draft). Cover images are not settable through the API; add one in Gumroad if you want it. Not yet confirmed against a live account.',
    async publish(input: AdapterInput): Promise<PublishResult> {
      const files: { url: string; name: string }[] = [];
      for (const f of input.files) files.push({ url: await client.uploadFile(basename(f.rel_path), app.assets.read(f)), name: basename(f.rel_path) });
      const l = input.listing;
      const created = await client.createProduct({ name: l.title, priceCents: l.price_cents, currency: l.currency, descriptionHtml: descriptionHtml(l.description), tags: l.tags, files });
      const live = app.settings.get('marketplaces').gumroad.publishLive;
      if (live) await client.enableProduct(created.id);
      let url = created.shortUrl;
      if (!url) url = (await client.getProduct(created.id).catch(() => null))?.shortUrl ?? null;
      return { externalId: created.id, externalUrl: url, state: live ? 'active' : 'draft' };
    },
  };
}

/** The adapter for a marketplace, bound to this app where the adapter needs credentials. */
export function adapterForApp(app: AppContext, id: string): MarketplaceAdapter {
  return id === 'gumroad' ? boundGumroadAdapter(app) : adapterFor(id);
}

/**
 * Pulls Gumroad sales into performance_observations (source_kind 'marketplace_api'), one order row
 * and one revenue row per sale, matched to the product through the recorded Gumroad listing.
 * Sales already imported are skipped (by sale id), so running it repeatedly is safe.
 */
export async function syncGumroadSales(app: AppContext, opts: { sinceDays?: number } = {}): Promise<{ seen: number; imported: number; unmatched: number }> {
  const client = gumroadClientFor(app);
  if (!(await client.isConfigured())) return { seen: 0, imported: 0, unmatched: 0 };
  const since = new Date(app.clock.now().getTime() - (opts.sinceDays ?? 30) * 86_400_000).toISOString().slice(0, 10);
  let seen = 0;
  let imported = 0;
  let unmatched = 0;
  for await (const sale of client.sales(since)) {
    seen++;
    const detail = `gumroad:sale:${sale.id}`;
    if (app.db.get('SELECT 1 FROM performance_observations WHERE source_detail = ?', detail)) continue;
    const ext = sale.product_id ? app.db.get<{ listing_id: string; product_id: string }>("SELECT e.listing_id, l.product_id FROM external_listings e JOIN listings l ON l.id = e.listing_id WHERE e.marketplace = 'gumroad' AND e.external_id = ?", sale.product_id) : undefined;
    if (!ext) {
      unmatched++;
      continue;
    }
    const day = (sale.created_at ?? app.clock.now().toISOString()).slice(0, 10);
    const cents = typeof sale.price === 'number' ? sale.price : Math.round(Number((sale.formatted_total_price ?? '').replace(/[^0-9.]/g, '')) * 100) || 0;
    const now = new Date().toISOString();
    const base = { listing_id: ext.listing_id, product_id: ext.product_id, marketplace: 'gumroad', period_start: day, period_end: day, source_kind: 'marketplace_api', source_detail: detail, created_at: now };
    app.db.tx(() => {
      app.db.insert('performance_observations', { id: newId('prf'), ...base, metric: sale.refunded ? 'refunds' : 'orders', value: 1 });
      if (!sale.refunded) app.db.insert('performance_observations', { id: newId('prf'), ...base, metric: 'revenue_cents', value: cents, source_detail: `${detail}:revenue` });
    });
    imported++;
  }
  return { seen, imported, unmatched };
}
