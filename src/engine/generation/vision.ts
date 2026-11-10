// The picture-reading AI. It looks at a box the owner drew on a page preview (review boxes) and says, in
// words, what is inside it, so the text-only parts of the Factory (the reason check, revision notes, the
// learning brief) can use a visual reference.
//
// It is off until Settings → AI providers names a provider AND a model. No model is assumed to read
// pictures: the owner picks one. Anthropic uses its own Messages API; every other provider uses the same
// OpenAI-compatible /chat/completions shape as text, with the pictures sent as base64 `image_url` parts.
import Anthropic from '@anthropic-ai/sdk';
import type { Settings } from '../../config/settings.ts';
import type { SecretStore } from '../../config/secrets.ts';
import { ProviderError } from '../../core/errors.ts';
import { mapAnthropicError, TEXT_PROVIDER_META, type Usage } from './providers.ts';

export type VisionProviderId = Exclude<Settings['generation']['vision']['provider'], 'off'>;

export type VisionStatus = { ready: true; provider: VisionProviderId; model: string } | { ready: false; why: string };

export interface VisionRequest {
  system: string;
  prompt: string;
  /** PNG pictures, in the order the prompt refers to them. */
  images: Buffer[];
  maxTokens: number;
}

export interface VisionResult {
  text: string;
  usage: Usage;
  model: string;
  provider: VisionProviderId;
}

export interface VisionProvider {
  status(): Promise<VisionStatus>;
  describe(req: VisionRequest): Promise<VisionResult>;
}

export const VISION_LABELS: Record<VisionProviderId, string> = {
  anthropic: 'Anthropic',
  ...(Object.fromEntries(Object.entries(TEXT_PROVIDER_META).map(([id, m]) => [id, m.label])) as Record<Exclude<VisionProviderId, 'anthropic'>, string>),
};

export class SettingsVisionProvider implements VisionProvider {
  private settings: () => Settings['generation'];
  private secrets: SecretStore;

  constructor(settings: () => Settings['generation'], secrets: SecretStore) {
    this.settings = settings;
    this.secrets = secrets;
  }

  private keyName(p: VisionProviderId) {
    return p === 'anthropic' ? 'anthropic_api_key' as const : TEXT_PROVIDER_META[p].secretName;
  }

  async status(): Promise<VisionStatus> {
    const v = this.settings().vision;
    if (v.provider === 'off') return { ready: false, why: 'No picture-reading AI is set up (Settings → AI providers → Picture-reading AI).' };
    if (!v.model) return { ready: false, why: `Type the name of a ${VISION_LABELS[v.provider]} model that can read pictures (Settings → AI providers → Picture-reading AI).` };
    if (!(await this.secrets.get(this.keyName(v.provider)))) return { ready: false, why: `No ${VISION_LABELS[v.provider]} key is saved (Settings → AI providers).` };
    return { ready: true, provider: v.provider, model: v.model };
  }

  async describe(req: VisionRequest): Promise<VisionResult> {
    const s = await this.status();
    if (!s.ready) throw new ProviderError('vision', 'unconfigured', s.why);
    const key = (await this.secrets.get(this.keyName(s.provider)))!;
    return s.provider === 'anthropic' ? this.anthropic(key, s.model, req) : this.compatible(s.provider, key, s.model, req);
  }

  private async anthropic(key: string, model: string, req: VisionRequest): Promise<VisionResult> {
    const cfg = this.settings().anthropic;
    const client = new Anthropic({ apiKey: key, authToken: null, baseURL: cfg.baseUrl, timeout: cfg.timeoutMs, maxRetries: cfg.maxRetries });
    try {
      const res = await client.messages.create({
        model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{
          role: 'user',
          content: [
            ...req.images.map((png) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: png.toString('base64') } })),
            { type: 'text' as const, text: req.prompt },
          ],
        }],
      });
      if (res.stop_reason === 'refusal') throw new ProviderError('anthropic', 'refusal', 'The model declined to look at this picture.');
      const text = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('').trim();
      if (!text) throw new ProviderError('anthropic', 'invalid_output', 'The model said nothing about the picture.');
      return { text, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, images: null }, model: res.model, provider: 'anthropic' };
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }

  private async compatible(id: Exclude<VisionProviderId, 'anthropic'>, key: string, model: string, req: VisionRequest): Promise<VisionResult> {
    const cfg = this.settings()[id];
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens,
          temperature: 0.2,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: [{ type: 'text', text: req.prompt }, ...req.images.map((png) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }))] },
          ],
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError(id, 'timeout', 'The request timed out.', err);
      throw new ProviderError(id, 'connection', 'Could not reach the API (offline, blocked network, or wrong base URL).', err);
    }
    const raw = await res.text();
    let body: { choices?: { message?: { content?: string }; finish_reason?: string }[]; error?: { message?: string } | string; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string } = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      if (res.ok) throw new ProviderError(id, 'invalid_output', 'The API returned a non-JSON response.');
    }
    if (!res.ok) {
      const msg = (typeof body.error === 'string' ? body.error : body.error?.message)?.slice(0, 200) ?? `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new ProviderError(id, 'auth', `Key rejected: ${msg}`);
      if (res.status === 429) throw new ProviderError(id, 'rate_limit', msg);
      if (res.status >= 500) throw new ProviderError(id, 'server', msg);
      // Most often: this model can't take pictures, or the name is wrong.
      throw new ProviderError(id, 'bad_request', `${msg} (check that "${model}" is a model that reads pictures)`);
    }
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) throw new ProviderError(id, 'invalid_output', 'The model said nothing about the picture.');
    return { text, usage: { inputTokens: body.usage?.prompt_tokens ?? null, outputTokens: body.usage?.completion_tokens ?? null, images: null }, model: body.model || model, provider: id };
  }
}
