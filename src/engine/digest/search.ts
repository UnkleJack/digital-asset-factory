import type { AppContext } from '../../app/context.ts';
import { AppError } from '../../core/errors.ts';

/*
 * Web search for the research digest. Three providers with free monthly credit, tried in the
 * order set in Settings → Research (research.digest.searchOrder); when one is out of credit,
 * rate-limited, down or has no key, the next one is used.
 *   Tavily: POST https://api.tavily.com/search, "Authorization: Bearer <key>", {query, max_results, search_depth:'basic'} → {results[{title,url,content}]}; 1 credit per basic search, 1,000 free/month, no card.
 *   Exa:    POST https://api.exa.ai/search, "x-api-key: <key>", {query, numResults, type:'auto', contents:{highlights}} → {results[{title,url,highlights[],publishedDate}]}; free monthly credit, no card.
 *   Brave:  GET https://api.search.brave.com/res/v1/web/search?q=&count=, "X-Subscription-Token: <key>" → {web:{results[{title,url,description}]}}; about $5/month free credit, card required.
 * (Checked against each provider's docs in October 2026; free allowances change, so the
 * monthly budget below is a hard ceiling regardless of what a provider allows.)
 */

export type SearchProviderId = 'tavily' | 'exa' | 'brave';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;
}

export class SearchError extends AppError {
  readonly provider: string;
  readonly status: number;
  constructor(provider: string, status: number, message: string) {
    super('search_error', `${provider}: ${message}`, { httpStatus: 502, errorClass: status === 429 || status >= 500 || status === 0 ? 'transient' : 'permanent' });
    this.provider = provider;
    this.status = status;
  }
}

export interface SearchEndpoints {
  tavily: string;
  exa: string;
  brave: string;
}

export const DEFAULT_ENDPOINTS: SearchEndpoints = {
  tavily: 'https://api.tavily.com/search',
  exa: 'https://api.exa.ai/search',
  brave: 'https://api.search.brave.com/res/v1/web/search',
};

const SECRET: Record<SearchProviderId, 'tavily_api_key' | 'exa_api_key' | 'brave_search_api_key'> = { tavily: 'tavily_api_key', exa: 'exa_api_key', brave: 'brave_search_api_key' };

async function request(provider: string, url: string, init: RequestInit, timeoutMs: number): Promise<any> {
  let res: Response;
  let text: string;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    text = await res.text();
  } catch {
    throw new SearchError(provider, 0, 'the request failed or timed out.');
  }
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    if (res.ok) throw new SearchError(provider, 502, 'the response was not JSON.');
  }
  if (!res.ok) {
    const msg = String(body?.detail?.error ?? body?.error?.detail ?? body?.error?.message ?? body?.error ?? body?.message ?? `HTTP ${res.status}`).slice(0, 200);
    // Out of credit is reported as 402/432/429 depending on the provider; all mean "try the next one".
    throw new SearchError(provider, res.status === 402 || res.status === 432 ? 429 : res.status, msg);
  }
  return body;
}

export async function searchOnce(provider: SearchProviderId, key: string, query: string, count: number, endpoints: SearchEndpoints = DEFAULT_ENDPOINTS, timeoutMs = 30_000): Promise<SearchResult[]> {
  const clip = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (provider === 'tavily') {
    const body = await request('Tavily', endpoints.tavily, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, max_results: count, search_depth: 'basic' }) }, timeoutMs);
    return (body.results ?? []).map((r: any) => ({ title: clip(r.title), url: String(r.url ?? ''), snippet: clip(r.content), published: r.published_date }));
  }
  if (provider === 'exa') {
    const body = await request('Exa', endpoints.exa, { method: 'POST', headers: { 'x-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, numResults: count, type: 'auto', contents: { highlights: { maxCharacters: 500 } } }) }, timeoutMs);
    return (body.results ?? []).map((r: any) => ({ title: clip(r.title), url: String(r.url ?? ''), snippet: clip((r.highlights ?? []).join(' … ') || r.text || r.summary), published: r.publishedDate }));
  }
  const u = new URL(endpoints.brave);
  u.searchParams.set('q', query);
  u.searchParams.set('count', String(count));
  const body = await request('Brave', u.toString(), { headers: { 'X-Subscription-Token': key, Accept: 'application/json' } }, timeoutMs);
  return (body.web?.results ?? []).map((r: any) => ({ title: clip(r.title), url: String(r.url ?? ''), snippet: clip(r.description), published: r.age }));
}

/** Searches this calendar month, counted from digest runs plus any in progress. */
export function searchesThisMonth(app: AppContext, extra = 0): number {
  const month = app.clock.now().toISOString().slice(0, 7);
  return (app.db.value<number>("SELECT COALESCE(SUM(search_queries), 0) FROM digest_runs WHERE substr(created_at, 1, 7) = ?", month) ?? 0) + extra;
}

/**
 * A searcher for one digest run: tries the configured providers in order, skips ones without a
 * key or that fail, and refuses to go past the monthly budget. `used` counts searches made.
 */
export function makeSearcher(app: AppContext, endpoints: SearchEndpoints = DEFAULT_ENDPOINTS) {
  const cfg = app.settings.get('research').digest;
  const dead = new Set<SearchProviderId>();
  const state = { used: 0, providerUsed: {} as Record<string, number>, errors: [] as string[] };
  async function search(query: string, count = 8): Promise<SearchResult[]> {
    if (searchesThisMonth(app, state.used) >= cfg.monthlySearchBudget) throw new AppError('search_budget', `The monthly web-search budget (${cfg.monthlySearchBudget}) is used up; raise it in Settings → Research or wait for next month.`, { httpStatus: 429, errorClass: 'permanent' });
    let configured = 0;
    for (const p of cfg.searchOrder) {
      if (dead.has(p)) continue;
      const key = await app.secrets.get(SECRET[p]);
      if (!key) continue;
      configured++;
      try {
        state.used++;
        const r = await searchOnce(p, key, query, count, endpoints);
        state.providerUsed[p] = (state.providerUsed[p] ?? 0) + 1;
        return r;
      } catch (err) {
        state.errors.push((err as Error).message);
        // Bad key or out of credit: stop using this provider for the rest of the run.
        if (err instanceof SearchError && (err.status === 401 || err.status === 403 || err.status === 429)) dead.add(p);
        app.log.warn('Web search failed; trying the next provider', { provider: p, err: (err as Error).message });
      }
    }
    if (!configured) throw new AppError('search_unconfigured', 'No web-search key is saved. Add a Tavily or Exa key (free, no card) in Settings → Integrations.', { httpStatus: 424, errorClass: 'permanent' });
    throw new AppError('search_failed', `Every web-search provider failed: ${state.errors.slice(-3).join(' | ')}`, { httpStatus: 502, errorClass: 'transient' });
  }
  return { search, state };
}
