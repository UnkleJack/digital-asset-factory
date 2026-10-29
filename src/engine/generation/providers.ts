import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { ProviderError } from '../../core/errors.ts';
import type { Settings } from '../../config/settings.ts';
import type { SecretName } from '../../config/secrets.ts';
import type { Pacer } from './pacing.ts';

export interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
  images: number | null;
}

export interface StructuredRequest<T> {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: Usage;
  model: string;
  servedByFallback: boolean;
  /** Which provider answered, when a router picked one of several. */
  provider?: string;
}

export interface TextProvider {
  readonly id: string;
  isConfigured(): Promise<boolean>;
  model(): string;
  /** Every model a call might be served by (a routed provider's backups included). Defaults to model(). */
  candidateModels?(): Promise<string[]>;
  generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export interface ImageResult {
  png: Buffer;
  widthPx: number;
  heightPx: number;
  usage: Usage;
  model: string;
}

export interface ImageProvider {
  readonly id: string;
  isConfigured(): Promise<boolean>;
  model(): string;
  generateImage(req: { prompt: string; size: 'portrait' | 'square' | 'landscape' }): Promise<ImageResult>;
}

const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export class AnthropicTextProvider implements TextProvider {
  readonly id = 'anthropic';
  private getKey: () => Promise<string | null>;
  private cfg: () => Settings['generation']['anthropic'];

  constructor(getKey: () => Promise<string | null>, cfg: () => Settings['generation']['anthropic']) {
    this.getKey = getKey;
    this.cfg = cfg;
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getKey());
  }

  model(): string {
    return this.cfg().model;
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const key = await this.getKey();
    if (!key) throw new ProviderError('anthropic', 'unconfigured', 'No Anthropic API key is configured (Settings → AI providers).');
    const cfg = this.cfg();
    const client = new Anthropic({ apiKey: key, authToken: null, baseURL: cfg.baseUrl, timeout: cfg.timeoutMs, maxRetries: cfg.maxRetries });
    const useFallbacks = cfg.serverFallbacks && FALLBACK_MODELS.has(cfg.model) && new URL(cfg.baseUrl).hostname === 'api.anthropic.com';
    try {
      const res = await client.beta.messages.parse({
        model: cfg.model,
        max_tokens: req.maxTokens ?? cfg.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        output_config: { effort: cfg.effort, format: betaZodOutputFormat(req.schema) },
        ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      });
      if (res.stop_reason === 'refusal') {
        throw new ProviderError('anthropic', 'refusal', `The model declined this request (category: ${res.stop_details?.category ?? 'unspecified'}).`);
      }
      if (res.stop_reason === 'max_tokens') throw new ProviderError('anthropic', 'invalid_output', 'The response was cut off at the max_tokens limit.');
      const checked = req.schema.safeParse(res.parsed_output);
      if (!checked.success) {
        throw new ProviderError('anthropic', 'invalid_output', `Structured output failed validation: ${checked.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      const servedByFallback = (res.usage as { iterations?: { type?: string }[] }).iterations?.some((e) => e.type === 'fallback_message') ?? false;
      return { data: checked.data, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, images: null }, model: res.model, servedByFallback };
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }
}

export function mapAnthropicError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return new ProviderError('anthropic', 'auth', 'The API key was rejected. Check it in Settings → AI providers.', err);
  if (err instanceof Anthropic.RateLimitError) return new ProviderError('anthropic', 'rate_limit', 'Rate limited by the API; the job will retry later.', err);
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError('anthropic', 'timeout', 'The request timed out.', err);
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError('anthropic', 'connection', 'Could not reach the API (offline or blocked network).', err);
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError || err instanceof Anthropic.UnprocessableEntityError) {
    return new ProviderError('anthropic', 'bad_request', `The API rejected the request: ${(err as Error).message.slice(0, 300)}`, err);
  }
  if (err instanceof Anthropic.APIError) {
    const status = (err as { status?: number }).status ?? 0;
    return new ProviderError('anthropic', status >= 500 ? 'server' : 'bad_request', `API error ${status}: ${err.message.slice(0, 200)}`, err);
  }
  if (err instanceof Anthropic.AnthropicError || err instanceof SyntaxError) return new ProviderError('anthropic', 'invalid_output', `Could not parse the model output: ${(err as Error).message.slice(0, 200)}`, err);
  return new ProviderError('anthropic', 'server', (err as Error)?.message ?? String(err), err);
}

/**
 * Other fast-inference providers that speak the same OpenAI-compatible `/chat/completions`
 * shape, each with a free tier as of when this was wired up. All of them are optional
 * alternatives to Anthropic for text generation; "free" model availability and exact names
 * can change on the provider's side, so the model is just a setting, editable in
 * Settings → Generation.
 */
export const TEXT_PROVIDER_IDS = ['anthropic', 'openrouter', 'groq', 'nvidia', 'cerebras', 'together', 'gemini', 'mistral', 'github', 'huggingface'] as const;
export type AiTextProviderId = (typeof TEXT_PROVIDER_IDS)[number];

export const TEXT_PROVIDER_META: Record<Exclude<AiTextProviderId, 'anthropic'>, { label: string; secretName: 'openrouter_api_key' | 'groq_api_key' | 'nvidia_api_key' | 'cerebras_api_key' | 'together_api_key' | 'gemini_api_key' | 'mistral_api_key' | 'github_models_token' | 'huggingface_token'; keysUrl: string }> = {
  openrouter: { label: 'OpenRouter', secretName: 'openrouter_api_key', keysUrl: 'https://openrouter.ai/keys' },
  groq: { label: 'Groq', secretName: 'groq_api_key', keysUrl: 'https://console.groq.com/keys' },
  nvidia: { label: 'NVIDIA NIM', secretName: 'nvidia_api_key', keysUrl: 'https://build.nvidia.com' },
  cerebras: { label: 'Cerebras', secretName: 'cerebras_api_key', keysUrl: 'https://cloud.cerebras.ai' },
  together: { label: 'Together AI', secretName: 'together_api_key', keysUrl: 'https://api.together.ai/settings/api-keys' },
  gemini: { label: 'Google Gemini', secretName: 'gemini_api_key', keysUrl: 'https://aistudio.google.com/apikey' },
  mistral: { label: 'Mistral', secretName: 'mistral_api_key', keysUrl: 'https://console.mistral.ai/api-keys' },
  github: { label: 'GitHub Models', secretName: 'github_models_token', keysUrl: 'https://github.com/settings/personal-access-tokens/new' },
  huggingface: { label: 'Hugging Face', secretName: 'huggingface_token', keysUrl: 'https://huggingface.co/settings/tokens' },
};

/** Where to create each API key, shown next to the key field in Settings → AI providers. `free` marks providers with a free tier. */
export const SECRET_KEY_LINKS: Partial<Record<SecretName, { url: string; free: boolean }>> = {
  anthropic_api_key: { url: 'https://console.anthropic.com', free: false },
  ...Object.fromEntries(Object.values(TEXT_PROVIDER_META).map((m) => [m.secretName, { url: m.keysUrl, free: true }])),
  openai_api_key: { url: 'https://platform.openai.com/api-keys', free: false },
  gumroad_token: { url: 'https://app.gumroad.com/settings/advanced', free: true },
  tavily_api_key: { url: 'https://app.tavily.com', free: true },
  exa_api_key: { url: 'https://dashboard.exa.ai/api-keys', free: true },
  brave_search_api_key: { url: 'https://api-dashboard.search.brave.com', free: true },
  smtp_password: { url: 'https://myaccount.google.com/apppasswords', free: true },
};

export interface OpenAICompatibleConfig {
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

/**
 * A text provider for any OpenAI-compatible `/chat/completions` API (OpenRouter, Groq,
 * NVIDIA NIM, Cerebras, Together AI, ...). Structured output is requested with
 * `response_format: {type:'json_object'}` (the most widely supported mode across these
 * providers) plus the target JSON Schema spelled out in the system prompt; the response is
 * then validated against the real Zod schema, and invalid output is reported the same way
 * as an Anthropic parse failure so the caller's retry-and-reask loop (structuredCall) applies
 * uniformly across providers.
 */
export class OpenAICompatibleTextProvider implements TextProvider {
  readonly id: Exclude<AiTextProviderId, 'anthropic'>;
  private label: string;
  private getKey: () => Promise<string | null>;
  private cfg: () => OpenAICompatibleConfig;
  private sleep: (ms: number) => Promise<void>;

  constructor(id: Exclude<AiTextProviderId, 'anthropic'>, getKey: () => Promise<string | null>, cfg: () => OpenAICompatibleConfig, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
    this.id = id;
    this.label = TEXT_PROVIDER_META[id].label;
    this.getKey = getKey;
    this.cfg = cfg;
    this.sleep = sleep;
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getKey());
  }

  model(): string {
    return this.cfg().model;
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const key = await this.getKey();
    if (!key) throw new ProviderError(this.id, 'unconfigured', `No ${this.label} API key is configured (Settings → AI providers).`);
    const cfg = this.cfg();
    let lastErr: ProviderError | null = null;
    let jsonMode = true;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(Math.min(20_000, 500 * 2 ** attempt));
      try {
        return await this.once(key, cfg, req, jsonMode);
      } catch (err) {
        // Some models served by these providers reject JSON mode outright. The schema is in the
        // prompt anyway, so turn it off and ask again (once; this does not use up a retry).
        if (jsonMode && err instanceof ProviderError && err.kind === 'bad_request' && /response_format|json_object|json mode/i.test(err.message)) {
          jsonMode = false;
          attempt--;
          continue;
        }
        lastErr = err instanceof ProviderError ? err : new ProviderError(this.id, 'server', String(err), err);
        if (lastErr.errorClass !== 'transient' || lastErr.kind === 'invalid_output') break;
      }
    }
    throw lastErr!;
  }

  private async once<T>(key: string, cfg: OpenAICompatibleConfig, req: StructuredRequest<T>, jsonMode: boolean): Promise<StructuredResult<T>> {
    const jsonSchema = z.toJSONSchema(req.schema as z.ZodType, { io: 'input', unrepresentable: 'any' });
    const system = `${req.system}\n\nRespond with ONLY one JSON object (no markdown code fences, no commentary before or after) that strictly matches this JSON Schema:\n${JSON.stringify(jsonSchema)}`;
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: req.prompt }],
          max_tokens: req.maxTokens,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError(this.id, 'timeout', 'The request timed out.', err);
      throw new ProviderError(this.id, 'connection', 'Could not reach the API (offline, blocked network, or wrong base URL).', err);
    }
    const text = await res.text();
    let body: { choices?: { message?: { content?: string }; finish_reason?: string }[]; error?: { message?: string } | string; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string } = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      if (res.ok) throw new ProviderError(this.id, 'invalid_output', 'The API returned a non-JSON response.');
    }
    if (!res.ok) {
      const msg = (typeof body.error === 'string' ? body.error : body.error?.message)?.slice(0, 200) ?? `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new ProviderError(this.id, 'auth', `Key rejected: ${msg}`);
      if (res.status === 429) throw new ProviderError(this.id, 'rate_limit', msg);
      if (res.status >= 500) throw new ProviderError(this.id, 'server', msg);
      throw new ProviderError(this.id, 'bad_request', msg);
    }
    const choice = body.choices?.[0];
    const content = choice?.message?.content;
    if (!content) throw new ProviderError(this.id, 'invalid_output', 'The response had no message content.');
    if (choice?.finish_reason === 'length') throw new ProviderError(this.id, 'invalid_output', 'The response was cut off at the max_tokens limit.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(content));
    } catch {
      throw new ProviderError(this.id, 'invalid_output', 'The model did not return valid JSON.');
    }
    const checked = req.schema.safeParse(parsed);
    if (!checked.success) {
      throw new ProviderError(this.id, 'invalid_output', `Structured output failed validation: ${checked.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    return {
      data: checked.data,
      usage: { inputTokens: body.usage?.prompt_tokens ?? null, outputTokens: body.usage?.completion_tokens ?? null, images: null },
      model: body.model || cfg.model,
      servedByFallback: false,
    };
  }
}

/** Some OpenAI-compatible models wrap JSON mode output in ```json fences despite instructions; strip it. */
function stripCodeFence(s: string): string {
  const m = s.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : s;
}

/**
 * The single `TextProvider` the rest of the app uses. It tries the provider selected in settings
 * first, then the backup providers in `fallbackOrder`, skipping any without a key and moving on
 * when one is rate-limited, down, or rejects the request — so one capped free tier does not stop
 * production. Invalid structured output is not a reason to switch: structuredCall asks the same
 * provider again with the validation error, which fixes most of those.
 * The result says which provider actually answered, so provenance and cost records stay honest.
 */
/** Providers billed per call with no free tier. They are never an automatic backup unless allowed. */
export const PAID_TEXT_PROVIDERS: readonly AiTextProviderId[] = ['anthropic'];

export class RoutedTextProvider implements TextProvider {
  private providers: Partial<Record<AiTextProviderId, TextProvider>>;
  private activeId: () => AiTextProviderId;
  private fallbackOrder: () => readonly AiTextProviderId[];
  private onFallback: (from: string, err: unknown) => void;
  private allowPaidFallback: () => boolean;
  readonly pacer: Pacer | null;

  constructor(
    providers: Partial<Record<AiTextProviderId, TextProvider>>,
    activeId: () => AiTextProviderId,
    fallbackOrder: () => readonly AiTextProviderId[] = () => [],
    onFallback: (from: string, err: unknown) => void = () => {},
    allowPaidFallback: () => boolean = () => false,
    pacer: Pacer | null = null,
  ) {
    this.pacer = pacer;
    this.providers = providers;
    this.activeId = activeId;
    this.fallbackOrder = fallbackOrder;
    this.onFallback = onFallback;
    this.allowPaidFallback = allowPaidFallback;
  }

  /** Models of every configured provider a call could land on, for worst-case cost checks. */
  async candidateModels(): Promise<string[]> {
    const out: string[] = [];
    for (const p of this.chain()) if (await p.isConfigured()) out.push(p.model());
    return out;
  }

  get id(): string {
    return this.active().id;
  }

  model(): string {
    return this.active().model();
  }

  async isConfigured(): Promise<boolean> {
    for (const p of this.chain()) if (await p.isConfigured()) return true;
    return false;
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    let lastErr: unknown = null;
    let tried = 0;
    for (const p of this.chain()) {
      if (!(await p.isConfigured())) continue;
      tried++;
      const held = this.pacer?.blocked(p.id);
      if (held) {
        lastErr = new ProviderError(p.id, 'rate_limit', `skipped: ${held}`);
        this.onFallback(p.id, lastErr);
        continue;
      }
      try {
        await this.pacer?.wait(p.id);
        const res = await p.generateStructured(req);
        return { ...res, provider: res.provider ?? p.id, servedByFallback: res.servedByFallback || p !== this.active() };
      } catch (err) {
        if (err instanceof ProviderError && err.kind === 'invalid_output') throw err;
        if (err instanceof ProviderError && err.kind === 'rate_limit') this.pacer?.rateLimited(p.id);
        lastErr = err;
        this.onFallback(p.id, err);
      }
    }
    if (lastErr) throw lastErr;
    throw new ProviderError(this.activeId(), 'unconfigured', tried ? 'No text provider answered.' : 'No AI text provider has an API key (Settings → AI providers).');
  }

  /** The selected provider, then the backups, each once. */
  chain(): TextProvider[] {
    const active = this.activeId();
    const paidOk = this.allowPaidFallback();
    const ids = [active, ...this.fallbackOrder().filter((id) => paidOk || !PAID_TEXT_PROVIDERS.includes(id))];
    const out: TextProvider[] = [];
    for (const id of ids) {
      const p = this.providers[id];
      if (p && !out.includes(p)) out.push(p);
    }
    if (!out.length) out.push(this.active());
    return out;
  }

  private active(): TextProvider {
    return this.providers[this.activeId()] ?? this.providers.anthropic!;
  }
}

export function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const SIZES = { portrait: '1024x1536', square: '1024x1024', landscape: '1536x1024' } as const;

export class OpenAIImageProvider implements ImageProvider {
  readonly id = 'openai';
  private getKey: () => Promise<string | null>;
  private cfg: () => Settings['generation']['openai'];
  private sleep: (ms: number) => Promise<void>;

  constructor(getKey: () => Promise<string | null>, cfg: () => Settings['generation']['openai'], sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
    this.getKey = getKey;
    this.cfg = cfg;
    this.sleep = sleep;
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getKey());
  }

  model(): string {
    return this.cfg().imageModel;
  }

  async generateImage(req: { prompt: string; size: 'portrait' | 'square' | 'landscape' }): Promise<ImageResult> {
    const key = await this.getKey();
    if (!key) throw new ProviderError('openai', 'unconfigured', 'No OpenAI API key is configured (Settings → AI providers).');
    const cfg = this.cfg();
    let lastErr: ProviderError | null = null;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(Math.min(30_000, 1000 * 2 ** attempt));
      try {
        return await this.once(key, cfg, req);
      } catch (err) {
        lastErr = err instanceof ProviderError ? err : new ProviderError('openai', 'server', String(err), err);
        if (lastErr.errorClass !== 'transient' || lastErr.kind === 'invalid_output') break;
      }
    }
    throw lastErr!;
  }

  private async once(key: string, cfg: Settings['generation']['openai'], req: { prompt: string; size: keyof typeof SIZES }): Promise<ImageResult> {
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.imageModel, prompt: req.prompt, size: SIZES[req.size], quality: cfg.quality, n: 1 }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError('openai', 'timeout', 'The image request timed out.', err);
      throw new ProviderError('openai', 'connection', 'Could not reach the image API.', err);
    }
    const text = await res.text();
    let body: { data?: { b64_json?: string }[]; error?: { message?: string; code?: string }; usage?: { input_tokens?: number; output_tokens?: number } } = {};
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw new ProviderError('openai', 'invalid_output', 'The image API returned a non-JSON response.');
    }
    if (!res.ok) {
      const msg = body.error?.message?.slice(0, 200) ?? `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new ProviderError('openai', 'auth', `Key rejected: ${msg}`);
      if (res.status === 429) throw new ProviderError('openai', 'rate_limit', msg);
      if (res.status >= 500) throw new ProviderError('openai', 'server', msg);
      if (body.error?.code === 'content_policy_violation' || /safety|policy/i.test(msg)) throw new ProviderError('openai', 'refusal', msg);
      throw new ProviderError('openai', 'bad_request', msg);
    }
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new ProviderError('openai', 'invalid_output', 'The image API response contained no image data.');
    const png = Buffer.from(b64, 'base64');
    const dims = pngSize(png);
    if (!dims) throw new ProviderError('openai', 'invalid_output', 'The returned image is not a valid PNG.');
    return { png, widthPx: dims.width, heightPx: dims.height, usage: { inputTokens: body.usage?.input_tokens ?? null, outputTokens: body.usage?.output_tokens ?? null, images: 1 }, model: cfg.imageModel };
  }
}

export function estimateTextCostUsd(model: string, inputTokens: number | null, outputTokens: number | null, prices: Settings['generation']['textPrices']): { usd: number | null; basis: 'estimate_from_price_table' | 'unknown' } {
  const p = prices[model];
  if (!p || inputTokens === null || outputTokens === null) return { usd: null, basis: 'unknown' };
  return { usd: (inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok) / 1_000_000, basis: 'estimate_from_price_table' };
}

export function estimateImageCostUsd(model: string, images: number, prices: Settings['generation']['imagePricePerImageUsd']): { usd: number | null; basis: 'estimate_from_price_table' | 'unknown' } {
  const p = prices[model];
  return p === undefined ? { usd: null, basis: 'unknown' } : { usd: p * images, basis: 'estimate_from_price_table' };
}
