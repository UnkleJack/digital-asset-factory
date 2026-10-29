import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { ProviderError } from '../../core/errors.ts';
import type { Settings } from '../../config/settings.ts';
import type { SecretName } from '../../config/secrets.ts';

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
  generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export interface ImageResult {
  png: Buffer;
  widthPx: number;
  heightPx: number;
  usage: Usage;
  model: string;
  provider?: string;
  servedByFallback?: boolean;
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
export const TEXT_PROVIDER_IDS = ['anthropic', 'openrouter', 'groq', 'nvidia', 'cerebras', 'together'] as const;
export type AiTextProviderId = (typeof TEXT_PROVIDER_IDS)[number];

export const TEXT_PROVIDER_META: Record<Exclude<AiTextProviderId, 'anthropic'>, { label: string; secretName: 'openrouter_api_key' | 'groq_api_key' | 'nvidia_api_key' | 'cerebras_api_key' | 'together_api_key'; keysUrl: string }> = {
  openrouter: { label: 'OpenRouter', secretName: 'openrouter_api_key', keysUrl: 'https://openrouter.ai/keys' },
  groq: { label: 'Groq', secretName: 'groq_api_key', keysUrl: 'https://console.groq.com/keys' },
  nvidia: { label: 'NVIDIA NIM', secretName: 'nvidia_api_key', keysUrl: 'https://build.nvidia.com' },
  cerebras: { label: 'Cerebras', secretName: 'cerebras_api_key', keysUrl: 'https://cloud.cerebras.ai' },
  together: { label: 'Together AI', secretName: 'together_api_key', keysUrl: 'https://api.together.ai/settings/api-keys' },
};

/** Where to create each API key, shown next to the key field in Settings → AI providers. `free` marks providers with a free tier. */
export const SECRET_KEY_LINKS: Partial<Record<SecretName, { url: string; free: boolean }>> = {
  anthropic_api_key: { url: 'https://console.anthropic.com', free: false },
  ...Object.fromEntries(Object.values(TEXT_PROVIDER_META).map((m) => [m.secretName, { url: m.keysUrl, free: true }])),
  openai_api_key: { url: 'https://platform.openai.com/api-keys', free: false },
  replicate_api_key: { url: 'https://replicate.com/account/api-tokens', free: true },
  fal_api_key: { url: 'https://fal.ai/dashboard/keys', free: true },
  gemini_api_key: { url: 'https://aistudio.google.com/app/apikey', free: true },
  grok_api_key: { url: 'https://console.x.ai/', free: false },
  huggingface_token: { url: 'https://huggingface.co/settings/tokens', free: true },
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
export class RoutedTextProvider implements TextProvider {
  private providers: Partial<Record<AiTextProviderId, TextProvider>>;
  private activeId: () => AiTextProviderId;
  private fallbackOrder: () => readonly AiTextProviderId[];
  private onFallback: (from: string, err: unknown) => void;

  constructor(
    providers: Partial<Record<AiTextProviderId, TextProvider>>,
    activeId: () => AiTextProviderId,
    fallbackOrder: () => readonly AiTextProviderId[] = () => [],
    onFallback: (from: string, err: unknown) => void = () => {},
  ) {
    this.providers = providers;
    this.activeId = activeId;
    this.fallbackOrder = fallbackOrder;
    this.onFallback = onFallback;
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
      try {
        const res = await p.generateStructured(req);
        return { ...res, provider: res.provider ?? p.id, servedByFallback: res.servedByFallback || p !== this.active() };
      } catch (err) {
        if (err instanceof ProviderError && err.kind === 'invalid_output') throw err;
        lastErr = err;
        this.onFallback(p.id, err);
      }
    }
    if (lastErr) throw lastErr;
    throw new ProviderError(this.activeId(), 'unconfigured', tried ? 'No text provider answered.' : 'No AI text provider has an API key (Settings → AI providers).');
  }

  /** The selected provider, then the backups, each once. */
  chain(): TextProvider[] {
    const ids = [this.activeId(), ...this.fallbackOrder()];
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

export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (!buf || buf.length < 24) return null;
  // PNG: signature 0x89504e47 0x0d0a1a0a
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: 0xff 0xd8
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 8) {
      if (buf[offset] !== 0xff) { offset++; continue; }
      const marker = buf[offset + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }
      if (marker === 0xd9 || marker === 0xda) break;
      const len = buf.readUInt16BE(offset + 2);
      if (len <= 0) break;
      offset += 2 + len;
    }
  }
  // WebP: RIFF ... WEBP
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunkHeader = buf.toString('ascii', 12, 16);
    if (chunkHeader === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunkHeader === 'VP8L') {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
  }
  return null;
}
export const pngSize = imageSize;

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

const REPLICATE_SIZES = { portrait: '1024x1536', square: '1024x1024', landscape: '1536x1024' } as const;

export class ReplicateImageProvider implements ImageProvider {
  readonly id = 'replicate';
  private getKey: () => Promise<string | null>;
  private cfg: () => Settings['generation']['replicate'];
  private sleep: (ms: number) => Promise<void>;

  constructor(getKey: () => Promise<string | null>, cfg: () => Settings['generation']['replicate'], sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
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

  async generateImage(req: { prompt: string; size: 'portrait' | 'square' | 'landscape' }): Promise<ImageResult> {
    const key = await this.getKey();
    if (!key) throw new ProviderError('replicate', 'unconfigured', 'No Replicate API key is configured (Settings → AI providers).');
    const cfg = this.cfg();
    let lastErr: ProviderError | null = null;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(Math.min(60_000, 2000 * 2 ** attempt));
      try {
        return await this.once(key, cfg, req);
      } catch (err) {
        lastErr = err instanceof ProviderError ? err : new ProviderError('replicate', 'server', String(err), err);
        if (lastErr.errorClass !== 'transient' || lastErr.kind === 'invalid_output') break;
      }
    }
    throw lastErr!;
  }

  private async once(key: string, cfg: Settings['generation']['replicate'], req: { prompt: string; size: keyof typeof REPLICATE_SIZES }): Promise<ImageResult> {
    const modelUrl = `https://api.replicate.com/v1/models/${cfg.model}/predictions`;
    let res: Response;
    try {
      res = await fetch(modelUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            prompt: req.prompt,
            aspect_ratio: req.size === 'square' ? '1:1' : req.size === 'portrait' ? '2:3' : '3:2',
            output_format: 'png',
            output_quality: 100,
            ...(cfg.extraInput ?? {}),
          },
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError('replicate', 'timeout', 'The image request timed out.', err);
      throw new ProviderError('replicate', 'connection', 'Could not reach the Replicate API.', err);
    }
    const text = await res.text();
    let body: { id?: string; status?: string; output?: string[]; error?: string; logs?: string } = {};
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw new ProviderError('replicate', 'invalid_output', 'The Replicate API returned a non-JSON response.');
    }
    if (!res.ok) {
      const msg = body.error?.slice(0, 200) ?? `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new ProviderError('replicate', 'auth', `Key rejected: ${msg}`);
      if (res.status === 429) throw new ProviderError('replicate', 'rate_limit', msg);
      if (res.status >= 500) throw new ProviderError('replicate', 'server', msg);
      throw new ProviderError('replicate', 'bad_request', msg);
    }
    if (body.status !== 'succeeded') {
      throw new ProviderError('replicate', 'server', `Prediction ${body.id} status: ${body.status}. Logs: ${body.logs?.slice(0, 500)}`);
    }
    const outputUrl = body.output?.[0];
    if (!outputUrl) throw new ProviderError('replicate', 'invalid_output', 'The prediction succeeded but returned no output URL.');
    let imgRes: Response;
    try {
      imgRes = await fetch(outputUrl, { signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      throw new ProviderError('replicate', 'connection', 'Could not download the generated image.', err);
    }
    const png = Buffer.from(await imgRes.arrayBuffer());
    const dims = pngSize(png);
    if (!dims) throw new ProviderError('replicate', 'invalid_output', 'The returned image is not a valid PNG.');
    return { png, widthPx: dims.width, heightPx: dims.height, usage: { inputTokens: null, outputTokens: null, images: 1 }, model: cfg.model };
  }
}

const FAL_SIZES = { portrait: 'portrait_4:5', square: 'square_hd', landscape: 'landscape_16:9' } as const;

export class FalImageProvider implements ImageProvider {
  readonly id = 'fal';
  private getKey: () => Promise<string | null>;
  private cfg: () => Settings['generation']['fal'];
  private sleep: (ms: number) => Promise<void>;

  constructor(getKey: () => Promise<string | null>, cfg: () => Settings['generation']['fal'], sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
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

  async generateImage(req: { prompt: string; size: 'portrait' | 'square' | 'landscape' }): Promise<ImageResult> {
    const key = await this.getKey();
    if (!key) throw new ProviderError('fal', 'unconfigured', 'No Fal.ai API key is configured (Settings → AI providers).');
    const cfg = this.cfg();
    let lastErr: ProviderError | null = null;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(Math.min(60_000, 2000 * 2 ** attempt));
      try {
        return await this.once(key, cfg, req);
      } catch (err) {
        lastErr = err instanceof ProviderError ? err : new ProviderError('fal', 'server', String(err), err);
        if (lastErr.errorClass !== 'transient' || lastErr.kind === 'invalid_output') break;
      }
    }
    throw lastErr!;
  }

  private async once(key: string, cfg: Settings['generation']['fal'], req: { prompt: string; size: keyof typeof FAL_SIZES }): Promise<ImageResult> {
    const modelUrl = `https://fal.run/fal-ai/${cfg.model}`;
    let res: Response;
    try {
      res = await fetch(modelUrl, {
        method: 'POST',
        headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: req.prompt,
          image_size: FAL_SIZES[req.size],
          num_images: 1,
          enable_safety_checker: false,
          ...(cfg.extraInput ?? {}),
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError('fal', 'timeout', 'The image request timed out.', err);
      throw new ProviderError('fal', 'connection', 'Could not reach the Fal.ai API.', err);
    }
    const text = await res.text();
    let body: { images?: { url: string }[]; error?: { message?: string } } = {};
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw new ProviderError('fal', 'invalid_output', 'The Fal.ai API returned a non-JSON response.');
    }
    if (!res.ok) {
      const msg = body.error?.message?.slice(0, 200) ?? `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new ProviderError('fal', 'auth', `Key rejected: ${msg}`);
      if (res.status === 429) throw new ProviderError('fal', 'rate_limit', msg);
      if (res.status >= 500) throw new ProviderError('fal', 'server', msg);
      throw new ProviderError('fal', 'bad_request', msg);
    }
    const imageUrl = body.images?.[0]?.url;
    if (!imageUrl) throw new ProviderError('fal', 'invalid_output', 'The Fal.ai API response contained no image URL.');
    let imgRes: Response;
    try {
      imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      throw new ProviderError('fal', 'connection', 'Could not download the generated image.', err);
    }
    const png = Buffer.from(await imgRes.arrayBuffer());
    const dims = pngSize(png);
    if (!dims) throw new ProviderError('fal', 'invalid_output', 'The returned image is not a valid PNG.');
    return { png, widthPx: dims.width, heightPx: dims.height, usage: { inputTokens: null, outputTokens: null, images: 1 }, model: cfg.model };
  }
}

const GEMINI_SIZES = { portrait: '1024x1536', square: '1024x1024', landscape: '1536x1024' } as const;

export class GeminiImageProvider implements ImageProvider {
  readonly id = 'gemini';
  private getKey: () => Promise<string | null>;
  private cfg: () => Settings['generation']['gemini'];
  private sleep: (ms: number) => Promise<void>;

  constructor(getKey: () => Promise<string | null>, cfg: () => Settings['generation']['gemini'], sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
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

  async generateImage(req: { prompt: string; size: 'portrait' | 'square' | 'landscape' }): Promise<ImageResult> {
    const key = await this.getKey();
    if (!key) throw new ProviderError('gemini', 'unconfigured', 'No Google AI Studio API key is configured (Settings → AI providers).');
    const cfg = this.cfg();
    let lastErr: ProviderError | null = null;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(Math.min(60_000, 2000 * 2 ** attempt));
      try {
        return await this.once(key, cfg, req);
      } catch (err) {
        lastErr = err instanceof ProviderError ? err : new ProviderError('gemini', 'server', String(err), err);
        if (lastErr.errorClass !== 'transient' || lastErr.kind === 'invalid_output') break;
      }
    }
    throw lastErr!;
  }

  private async once(key: string, cfg: Settings['generation']['gemini'], req: { prompt: string; size: keyof typeof GEMINI_SIZES }): Promise<ImageResult> {
    const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${key}`;
    let res: Response;
    try {
      res = await fetch(modelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
          generationConfig: {
            temperature: cfg.temperature ?? 0.7,
            maxOutputTokens: cfg.maxTokens ?? 8192,
            responseModalities: ['IMAGE'],
          },
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError('gemini', 'timeout', 'The image request timed out.', err);
      throw new ProviderError('gemini', 'connection', 'Could not reach the Google AI Studio API.', err);
    }
    const text = await res.text();
    let body: { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[]; error?: { message?: string; code?: number } } = {};
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw new ProviderError('gemini', 'invalid_output', 'The Google AI Studio API returned a non-JSON response.');
    }
    if (!res.ok) {
      const msg = body.error?.message?.slice(0, 200) ?? `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new ProviderError('gemini', 'auth', `Key rejected: ${msg}`);
      if (res.status === 429) throw new ProviderError('gemini', 'rate_limit', msg);
      if (res.status >= 500) throw new ProviderError('gemini', 'server', msg);
      throw new ProviderError('gemini', 'bad_request', msg);
    }
    const parts = body.candidates?.[0]?.content?.parts;
    const imagePart = parts?.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart?.inlineData?.data) throw new ProviderError('gemini', 'invalid_output', 'The Google AI Studio API response contained no image data.');
    const png = Buffer.from(imagePart.inlineData.data, 'base64');
    const dims = pngSize(png);
    if (!dims) throw new ProviderError('gemini', 'invalid_output', 'The returned image is not a valid PNG.');
    return { png, widthPx: dims.width, heightPx: dims.height, usage: { inputTokens: null, outputTokens: null, images: 1 }, model: cfg.model };
  }
}

const GROK_SIZES = { portrait: '1024x1536', square: '1024x1024', landscape: '1536x1024' } as const;

export class GrokImageProvider implements ImageProvider {
  readonly id = 'grok';
  private getKey: () => Promise<string | null>;
  private cfg: () => Settings['generation']['grok'];
  private sleep: (ms: number) => Promise<void>;

  constructor(getKey: () => Promise<string | null>, cfg: () => Settings['generation']['grok'], sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
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

  async generateImage(req: { prompt: string; size: 'portrait' | 'square' | 'landscape' }): Promise<ImageResult> {
    const key = await this.getKey();
    if (!key) throw new ProviderError('grok', 'unconfigured', 'No xAI API key is configured (Settings → AI providers).');
    const cfg = this.cfg();
    let lastErr: ProviderError | null = null;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(Math.min(60_000, 2000 * 2 ** attempt));
      try {
        return await this.once(key, cfg, req);
      } catch (err) {
        lastErr = err instanceof ProviderError ? err : new ProviderError('grok', 'server', String(err), err);
        if (lastErr.errorClass !== 'transient' || lastErr.kind === 'invalid_output') break;
      }
    }
    throw lastErr!;
  }

  private async once(key: string, cfg: Settings['generation']['grok'], req: { prompt: string; size: keyof typeof GROK_SIZES }): Promise<ImageResult> {
    const modelUrl = `${cfg.baseUrl.replace(/\/$/, '')}/images/generations`;
    let res: Response;
    try {
      res = await fetch(modelUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, prompt: req.prompt, size: GROK_SIZES[req.size], n: 1, response_format: 'b64_json' }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError('grok', 'timeout', 'The image request timed out.', err);
      throw new ProviderError('grok', 'connection', 'Could not reach the xAI API.', err);
    }
    const text = await res.text();
    let body: { data?: { b64_json?: string }[]; error?: { message?: string; code?: string }; usage?: { input_tokens?: number; output_tokens?: number } } = {};
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw new ProviderError('grok', 'invalid_output', 'The xAI API returned a non-JSON response.');
    }
    if (!res.ok) {
      const msg = body.error?.message?.slice(0, 200) ?? `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new ProviderError('grok', 'auth', `Key rejected: ${msg}`);
      if (res.status === 429) throw new ProviderError('grok', 'rate_limit', msg);
      if (res.status >= 500) throw new ProviderError('grok', 'server', msg);
      if (body.error?.code === 'content_policy_violation' || /safety|policy/i.test(msg)) throw new ProviderError('grok', 'refusal', msg);
      throw new ProviderError('grok', 'bad_request', msg);
    }
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new ProviderError('grok', 'invalid_output', 'The xAI API response contained no image data.');
    const png = Buffer.from(b64, 'base64');
    const dims = pngSize(png);
    if (!dims) throw new ProviderError('grok', 'invalid_output', 'The returned image is not a valid PNG.');
    return { png, widthPx: dims.width, heightPx: dims.height, usage: { inputTokens: body.usage?.input_tokens ?? null, outputTokens: body.usage?.output_tokens ?? null, images: 1 }, model: cfg.model };
  }
}

const TOGETHER_SIZES = { portrait: { width: 768, height: 1024 }, square: { width: 1024, height: 1024 }, landscape: { width: 1024, height: 768 } } as const;

export class TogetherImageProvider implements ImageProvider {
  readonly id = 'together';
  private getKey: () => Promise<string | null>;
  private cfg: () => Settings['generation']['togetherImage'];
  private sleep: (ms: number) => Promise<void>;

  constructor(getKey: () => Promise<string | null>, cfg: () => Settings['generation']['togetherImage'], sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
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

  async generateImage(req: { prompt: string; size: 'portrait' | 'square' | 'landscape' }): Promise<ImageResult> {
    const key = await this.getKey();
    if (!key) throw new ProviderError('together', 'unconfigured', 'No Together AI API key is configured (Settings → AI providers).');
    const cfg = this.cfg();
    let lastErr: ProviderError | null = null;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(Math.min(60_000, 2000 * 2 ** attempt));
      try {
        return await this.once(key, cfg, req);
      } catch (err) {
        lastErr = err instanceof ProviderError ? err : new ProviderError('together', 'server', String(err), err);
        if (lastErr.errorClass !== 'transient' || lastErr.kind === 'invalid_output') break;
      }
    }
    throw lastErr!;
  }

  private async once(key: string, cfg: Settings['generation']['togetherImage'], req: { prompt: string; size: keyof typeof TOGETHER_SIZES }): Promise<ImageResult> {
    const modelUrl = `${cfg.baseUrl.replace(/\/$/, '')}/images/generations`;
    const dims = TOGETHER_SIZES[req.size];
    let res: Response;
    try {
      res = await fetch(modelUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          prompt: req.prompt,
          width: dims.width,
          height: dims.height,
          n: 1,
          response_format: 'b64_json',
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError('together', 'timeout', 'The image request timed out.', err);
      throw new ProviderError('together', 'connection', 'Could not reach the Together AI API.', err);
    }
    const text = await res.text();
    let body: { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } } = {};
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw new ProviderError('together', 'invalid_output', 'The Together AI API returned a non-JSON response.');
    }
    if (!res.ok) {
      const msg = body.error?.message?.slice(0, 200) ?? `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new ProviderError('together', 'auth', `Key rejected: ${msg}`);
      if (res.status === 429) throw new ProviderError('together', 'rate_limit', msg);
      if (res.status >= 500) throw new ProviderError('together', 'server', msg);
      throw new ProviderError('together', 'bad_request', msg);
    }
    let png: Buffer | null = null;
    const b64 = body.data?.[0]?.b64_json;
    if (b64) {
      png = Buffer.from(b64, 'base64');
    } else if (body.data?.[0]?.url) {
      const imgRes = await fetch(body.data[0].url);
      png = Buffer.from(await imgRes.arrayBuffer());
    }
    if (!png) throw new ProviderError('together', 'invalid_output', 'The Together AI response contained no image data.');
    const measured = imageSize(png);
    if (!measured) throw new ProviderError('together', 'invalid_output', 'The returned image is not valid.');
    return { png, widthPx: measured.width, heightPx: measured.height, usage: { inputTokens: null, outputTokens: null, images: 1 }, model: cfg.model };
  }
}

export class HuggingFaceImageProvider implements ImageProvider {
  readonly id = 'huggingface';
  private getKey: () => Promise<string | null>;
  private cfg: () => Settings['generation']['huggingfaceImage'];
  private sleep: (ms: number) => Promise<void>;

  constructor(getKey: () => Promise<string | null>, cfg: () => Settings['generation']['huggingfaceImage'], sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
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

  async generateImage(req: { prompt: string; size: 'portrait' | 'square' | 'landscape' }): Promise<ImageResult> {
    const key = await this.getKey();
    if (!key) throw new ProviderError('huggingface', 'unconfigured', 'No Hugging Face token is configured (Settings → AI providers).');
    const cfg = this.cfg();
    let lastErr: ProviderError | null = null;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(Math.min(60_000, 2000 * 2 ** attempt));
      try {
        return await this.once(key, cfg, req);
      } catch (err) {
        lastErr = err instanceof ProviderError ? err : new ProviderError('huggingface', 'server', String(err), err);
        if (lastErr.errorClass !== 'transient' || lastErr.kind === 'invalid_output') break;
      }
    }
    throw lastErr!;
  }

  private async once(key: string, cfg: Settings['generation']['huggingfaceImage'], req: { prompt: string; size: 'portrait' | 'square' | 'landscape' }): Promise<ImageResult> {
    const modelUrl = `${cfg.baseUrl.replace(/\/$/, '')}/${cfg.model}`;
    let res: Response;
    try {
      res = await fetch(modelUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: req.prompt }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError('huggingface', 'timeout', 'The image request timed out.', err);
      throw new ProviderError('huggingface', 'connection', 'Could not reach the Hugging Face API.', err);
    }
    if (!res.ok) {
      const text = await res.text();
      let msg = text.slice(0, 200);
      try { const j = JSON.parse(text); msg = j.error ?? msg; } catch {}
      if (res.status === 401 || res.status === 403) throw new ProviderError('huggingface', 'auth', `Token rejected: ${msg}`);
      if (res.status === 429) throw new ProviderError('huggingface', 'rate_limit', msg);
      if (res.status >= 500) throw new ProviderError('huggingface', 'server', msg);
      throw new ProviderError('huggingface', 'bad_request', msg);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new ProviderError('huggingface', 'invalid_output', 'Hugging Face returned an empty response.');
    const dims = imageSize(buf);
    if (!dims) throw new ProviderError('huggingface', 'invalid_output', 'The returned image format is not valid.');
    return { png: buf, widthPx: dims.width, heightPx: dims.height, usage: { inputTokens: null, outputTokens: null, images: 1 }, model: cfg.model };
  }
}

const POLLINATIONS_SIZES = { portrait: { width: 768, height: 1024 }, square: { width: 1024, height: 1024 }, landscape: { width: 1024, height: 768 } } as const;

export class PollinationsImageProvider implements ImageProvider {
  readonly id = 'pollinations';
  private cfg: () => Settings['generation']['pollinations'];
  private sleep: (ms: number) => Promise<void>;

  constructor(cfg: () => Settings['generation']['pollinations'], sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
    this.cfg = cfg;
    this.sleep = sleep;
  }

  async isConfigured(): Promise<boolean> {
    return true; // 100% free, no key required
  }

  model(): string {
    return this.cfg().model;
  }

  async generateImage(req: { prompt: string; size: 'portrait' | 'square' | 'landscape' }): Promise<ImageResult> {
    const cfg = this.cfg();
    let lastErr: ProviderError | null = null;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(Math.min(60_000, 2000 * 2 ** attempt));
      try {
        return await this.once(cfg, req);
      } catch (err) {
        lastErr = err instanceof ProviderError ? err : new ProviderError('pollinations', 'server', String(err), err);
        if (lastErr.errorClass !== 'transient' || lastErr.kind === 'invalid_output') break;
      }
    }
    throw lastErr!;
  }

  private async once(cfg: Settings['generation']['pollinations'], req: { prompt: string; size: keyof typeof POLLINATIONS_SIZES }): Promise<ImageResult> {
    const dims = POLLINATIONS_SIZES[req.size];
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/prompt/${encodeURIComponent(req.prompt)}?model=${encodeURIComponent(cfg.model)}&width=${dims.width}&height=${dims.height}&nologo=true&seed=${seed}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(cfg.timeoutMs) });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError('pollinations', 'timeout', 'The image request timed out.', err);
      throw new ProviderError('pollinations', 'connection', 'Could not reach Pollinations.ai.', err);
    }
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new ProviderError('pollinations', 'rate_limit', text.slice(0, 200));
      if (res.status >= 500) throw new ProviderError('pollinations', 'server', text.slice(0, 200));
      throw new ProviderError('pollinations', 'bad_request', text.slice(0, 200));
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new ProviderError('pollinations', 'invalid_output', 'Pollinations returned an empty response.');
    const measured = imageSize(buf);
    if (!measured) throw new ProviderError('pollinations', 'invalid_output', 'The returned image format is not valid.');
    return { png: buf, widthPx: measured.width, heightPx: measured.height, usage: { inputTokens: null, outputTokens: null, images: 1 }, model: cfg.model };
  }
}

export const IMAGE_PROVIDER_IDS = [
  'openai', 'gemini', 'together', 'huggingface', 'pollinations', 'replicate', 'fal', 'grok'
] as const;
export type AiImageProviderId = (typeof IMAGE_PROVIDER_IDS)[number];

export const PAID_IMAGE_PROVIDERS: readonly AiImageProviderId[] = ['openai', 'replicate', 'fal', 'grok'];

export class ImagePacer {
  private cooldowns = new Map<string, number>();

  rateLimited(provider: string, cooldownMs = 60_000): void {
    this.cooldowns.set(provider, Date.now() + cooldownMs);
  }

  blocked(provider: string): string | null {
    const until = this.cooldowns.get(provider);
    if (!until) return null;
    if (Date.now() >= until) {
      this.cooldowns.delete(provider);
      return null;
    }
    const secs = Math.ceil((until - Date.now()) / 1000);
    return `rate-limited for another ${secs}s`;
  }
}

export class RoutedImageProvider implements ImageProvider {
  private providers: Partial<Record<AiImageProviderId, ImageProvider>>;
  private activeId: () => AiImageProviderId;
  private fallbackOrder: () => readonly AiImageProviderId[];
  private onFallback: (from: string, err: unknown) => void;
  private allowPaidFallback: () => boolean;
  readonly pacer: ImagePacer | null;

  constructor(
    providers: Partial<Record<AiImageProviderId, ImageProvider>>,
    activeId: () => AiImageProviderId,
    fallbackOrder: () => readonly AiImageProviderId[] = () => [],
    onFallback: (from: string, err: unknown) => void = () => {},
    allowPaidFallback: () => boolean = () => false,
    pacer: ImagePacer | null = null,
  ) {
    this.pacer = pacer;
    this.providers = providers;
    this.activeId = activeId;
    this.fallbackOrder = fallbackOrder;
    this.onFallback = onFallback;
    this.allowPaidFallback = allowPaidFallback;
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

  async generateImage(req: { prompt: string; size: 'portrait' | 'square' | 'landscape' }): Promise<ImageResult> {
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
        const res = await p.generateImage(req);
        return { ...res, provider: res.provider ?? p.id, servedByFallback: res.servedByFallback || p !== this.active() };
      } catch (err) {
        if (err instanceof ProviderError && err.kind === 'invalid_output') throw err;
        if (err instanceof ProviderError && (err.kind === 'rate_limit' || err.kind === 'budget_exceeded')) {
          this.pacer?.rateLimited(p.id);
        }
        lastErr = err;
        this.onFallback(p.id, err);
      }
    }
    if (lastErr) throw lastErr;
    throw new ProviderError(this.activeId(), 'unconfigured', tried ? 'No image provider answered.' : 'No AI image provider is configured (Settings → AI providers).');
  }

  chain(): ImageProvider[] {
    const active = this.activeId();
    const paidOk = this.allowPaidFallback();
    const ids = [active, ...this.fallbackOrder().filter((id) => paidOk || !PAID_IMAGE_PROVIDERS.includes(id))];
    const out: ImageProvider[] = [];
    for (const id of ids) {
      const p = this.providers[id];
      if (p && !out.includes(p)) out.push(p);
    }
    if (!out.length) {
      const p = this.active();
      if (p) out.push(p);
    }
    return out;
  }

  private active(): ImageProvider {
    return this.providers[this.activeId()] ?? this.providers.pollinations ?? this.providers.openai!;
  }
}
