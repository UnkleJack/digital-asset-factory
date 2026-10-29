import type { z } from 'zod';
import type { AppContext } from '../../app/context.ts';
import type { ProductTypeDefinition, TypeContext, ArtworkItem, ImageGenerator } from '../producttypes/types.ts';
import { CONTENT_LIBRARY_REVISION } from '../producttypes/library.ts';
import { learningBrief } from './learning.ts';
import { estimateTextCostUsd, estimateImageCostUsd, type Usage, type AiTextProviderId } from './providers.ts';
import { AppError, ProviderError, errorMessage, permanent } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import { seededRandom, sha256 } from '../../core/hash.ts';
import { redact } from '../../logging/logger.ts';

export interface BudgetGuard {
  check(estimateUsd: number | null, what: string): void;
  record(actualUsd: number | null): void;
}

export interface CallTrace {
  versionId?: string | null;
  jobId?: string | null;
  planRunId?: string | null;
  budget?: BudgetGuard;
}

export interface Provenance {
  generator: AiTextProviderId | 'deterministic';
  model?: string;
  promptHash?: string;
  generationRunIds?: string[];
  library?: string;
  seed?: number;
  note?: string;
  servedByFallback?: boolean;
}

function recordRun(app: AppContext, r: { trace: CallTrace; purpose: string; provider: string; model: string | null; promptHash: string | null; settings: Record<string, unknown>; usage: Usage | null; costUsd: number | null; costBasis: string; status: 'succeeded' | 'failed'; error?: string; startedAt: string }): string {
  const id = newId('gen');
  app.db.insert('generation_runs', {
    id,
    version_id: r.trace.versionId ?? null,
    job_id: r.trace.jobId ?? null,
    plan_run_id: r.trace.planRunId ?? null,
    purpose: r.purpose,
    provider: r.provider,
    model: r.model,
    prompt_hash: r.promptHash,
    settings: JSON.stringify(r.settings),
    input_tokens: r.usage?.inputTokens ?? null,
    output_tokens: r.usage?.outputTokens ?? null,
    image_count: r.usage?.images ?? null,
    cost_usd: r.costUsd,
    cost_basis: r.costBasis,
    status: r.status,
    error: r.error ? redact(r.error).slice(0, 1000) : null,
    started_at: r.startedAt,
    finished_at: new Date().toISOString(),
  });
  return id;
}

export type TextMode = { mode: 'ai' } | { mode: 'deterministic'; reason: string };

export async function textMode(app: AppContext): Promise<TextMode> {
  const g = app.settings.get('generation');
  if (g.textProvider === 'deterministic') return { mode: 'deterministic', reason: 'AI text generation is turned off in settings' };
  if (await app.providers.text.isConfigured()) return { mode: 'ai' };
  if (g.unconfiguredPolicy === 'fail') throw new ProviderError(g.textProvider, 'unconfigured', `No ${g.textProvider} API key is configured and the policy is to fail rather than use deterministic content.`);
  return { mode: 'deterministic', reason: 'AI provider not configured; used the built-in content library' };
}

export async function structuredCall<T>(app: AppContext, req: { purpose: string; schema: z.ZodType<T>; system: string; prompt: string; maxTokens?: number; trace: CallTrace }): Promise<{ data: T; provenance: Provenance }> {
  const g = app.settings.get('generation');
  const provider = app.providers.text;
  const brief = learningBrief(app);
  req.system = req.system + brief;
  const promptHash = sha256(`${req.system}\n---\n${req.prompt}`);
  const maxTokens = req.maxTokens ?? g.anthropic.maxTokens;
  const runIds: string[] = [];
  let lastErr: unknown = null;
  // Price the call at the dearest model it could land on: a backup provider may answer it.
  const models = req.trace.budget ? ((await provider.candidateModels?.()) ?? [provider.model()]) : [];
  for (let attempt = 0; attempt <= g.invalidOutputRetries; attempt++) {
    const estIn = Math.ceil((req.system.length + req.prompt.length) / 3.5);
    if (req.trace.budget) {
      const known = (models.length ? models : [provider.model()]).map((m) => estimateTextCostUsd(m, estIn, Math.min(maxTokens, 4000), g.textPrices).usd).filter((u): u is number => u !== null);
      req.trace.budget.check(known.length ? Math.max(...known) : null, req.purpose);
    }
    const startedAt = new Date().toISOString();
    try {
      const res = await provider.generateStructured({ schema: req.schema, system: req.system, prompt: req.prompt, maxTokens });
      const cost = estimateTextCostUsd(res.model, res.usage.inputTokens, res.usage.outputTokens, g.textPrices);
      req.trace.budget?.record(cost.usd);
      const servedBy = res.provider ?? provider.id;
      runIds.push(recordRun(app, { trace: req.trace, purpose: req.purpose, provider: servedBy, model: res.model, promptHash, settings: { effort: g.anthropic.effort, maxTokens, attempt }, usage: res.usage, costUsd: cost.usd, costBasis: cost.basis, status: 'succeeded', startedAt }));
      return { data: res.data, provenance: { generator: servedBy as AiTextProviderId, model: res.model, promptHash, generationRunIds: runIds, servedByFallback: res.servedByFallback } };
    } catch (err) {
      lastErr = err;
      runIds.push(recordRun(app, { trace: req.trace, purpose: req.purpose, provider: provider.id, model: provider.model(), promptHash, settings: { effort: g.anthropic.effort, maxTokens, attempt }, usage: null, costUsd: null, costBasis: 'unknown', status: 'failed', error: errorMessage(err), startedAt }));
      if (!(err instanceof ProviderError) || err.kind !== 'invalid_output') throw err;
      app.log.warn('AI output invalid; asking again', { purpose: req.purpose, attempt, err: errorMessage(err) });
    }
  }
  throw permanent('ai_invalid_output', `The AI provider returned invalid structured output ${g.invalidOutputRetries + 1} times for ${req.purpose}: ${errorMessage(lastErr)}`);
}

export async function generateContent(app: AppContext, def: ProductTypeDefinition, ctx: TypeContext<unknown>, trace: CallTrace): Promise<{ content: unknown; provenance: Provenance }> {
  const deterministic = (note: string) => {
    const content = def.contentSchema.parse(def.deterministicContent(ctx, seededRandom(ctx.seed)));
    return { content, provenance: { generator: 'deterministic' as const, library: CONTENT_LIBRARY_REVISION, seed: ctx.seed, note } };
  };
  if (!def.aiContent || !def.contentPrompt) return deterministic('This product type uses deterministic content');
  const mode = await textMode(app);
  if (mode.mode === 'deterministic') return deterministic(mode.reason);
  const p = def.contentPrompt(ctx);
  const { data, provenance } = await structuredCall(app, { purpose: `content:${def.id}`, schema: def.contentSchema, system: p.system, prompt: p.user, maxTokens: p.maxTokens, trace });
  return { content: data, provenance };
}

export async function imageGeneratorFor(app: AppContext, trace: CallTrace): Promise<ImageGenerator | null> {
  const g = app.settings.get('generation');
  if (g.imageProvider === 'none') return null;
  const provider = app.providers.image;
  if (!(await provider.isConfigured())) return null;
  return async (prompt, opts) => {
    const est = estimateImageCostUsd(provider.model(), 1, g.imagePricePerImageUsd);
    trace.budget?.check(est.usd, 'image');
    const startedAt = new Date().toISOString();
    const promptHash = sha256(prompt);
    try {
      const res = await provider.generateImage({ prompt, size: opts.size });
      trace.budget?.record(est.usd);
      const runId = recordRun(app, { trace, purpose: 'artwork', provider: provider.id, model: res.model, promptHash, settings: { size: opts.size, quality: g.openai.quality }, usage: res.usage, costUsd: est.usd, costBasis: est.basis, status: 'succeeded', startedAt });
      return { png: res.png, widthPx: res.widthPx, heightPx: res.heightPx, provenance: { generator: provider.id, model: res.model, promptHash, generationRunId: runId } };
    } catch (err) {
      recordRun(app, { trace, purpose: 'artwork', provider: provider.id, model: provider.model(), promptHash, settings: { size: opts.size }, usage: null, costUsd: null, costBasis: 'unknown', status: 'failed', error: errorMessage(err), startedAt });
      throw err;
    }
  };
}

export async function generateArtwork(app: AppContext, def: ProductTypeDefinition, ctx: TypeContext<unknown>, content: unknown, trace: CallTrace): Promise<ArtworkItem[]> {
  if (!def.generateArtwork) return [];
  const imageGen = def.artwork === 'ai-image' ? await imageGeneratorFor(app, trace) : null;
  try {
    return await def.generateArtwork(ctx, content, seededRandom(ctx.seed ^ 0x5bd1e995), imageGen);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw permanent('artwork_failed', `Artwork generation failed: ${errorMessage(err)}`);
  }
}
