import type { ImageProvider, ImageResult } from './providers.ts';
import type { AppContext } from '../../app/context.ts';
import { newId } from '../../core/ids.ts';
import { sha256 } from '../../core/hash.ts';

export interface TournamentModel {
  id: string;
  label: string;
  provider: ImageProvider;
}

export interface TournamentEntry {
  modelId: string;
  modelLabel: string;
  prompt: string;
  result: ImageResult | null;
  error: string | null;
  latencyMs: number;
  costUsd: number | null;
  promptHash: string;
}

export interface TournamentResult {
  id: string;
  prompt: string;
  entries: TournamentEntry[];
  rankings: TournamentRanking[];
  createdAt: string;
}

export interface TournamentRanking {
  rank: 1 | 2 | 3 | 4;
  modelId: string;
  modelLabel: string;
  wins: number;
  losses: number;
}

export interface BattleResult {
  winner: string;
  loser: string;
}

export class ImageTournament {
  private models: TournamentModel[];
  private app: AppContext;

  constructor(app: AppContext, models: TournamentModel[]) {
    this.app = app;
    this.models = models;
  }

  async run(prompt: string, size: 'portrait' | 'square' | 'landscape' = 'square'): Promise<TournamentResult> {
    const promptHash = sha256(prompt);
    const tournamentId = newId('tourney');
    const startedAt = new Date().toISOString();

    this.app.log.info('Starting image tournament', { tournamentId, prompt: prompt.slice(0, 100), models: this.models.map(m => m.id) });

    const entries: TournamentEntry[] = [];

    const genPromises = this.models.map(async (model) => {
      const entryStart = Date.now();
      try {
        const result = await model.provider.generateImage({ prompt, size });
        const latencyMs = Date.now() - entryStart;
        const g = this.app.settings.get('generation');
        const costUsd = this.estimateCost(result.model, g.imagePricePerImageUsd);
        entries.push({
          modelId: model.id,
          modelLabel: model.label,
          prompt,
          result,
          error: null,
          latencyMs,
          costUsd,
          promptHash,
        });
        this.app.log.info('Tournament model succeeded', { tournamentId, model: model.id, latencyMs, costUsd });
      } catch (err) {
        const latencyMs = Date.now() - entryStart;
        const msg = err instanceof Error ? err.message : String(err);
        entries.push({
          modelId: model.id,
          modelLabel: model.label,
          prompt,
          result: null,
          error: msg,
          latencyMs,
          costUsd: null,
          promptHash,
        });
        this.app.log.warn('Tournament model failed', { tournamentId, model: model.id, error: msg });
      }
    });

    await Promise.all(genPromises);

    const successfulEntries = entries.filter(e => e.result !== null);
    if (successfulEntries.length < 2) {
      throw new Error(`Tournament needs at least 2 successful generations, got ${successfulEntries.length}`);
    }

    const rankings = this.runBracket(successfulEntries.map(e => e.modelId));

    const tournament: TournamentResult = {
      id: tournamentId,
      prompt,
      entries,
      rankings,
      createdAt: startedAt,
    };

    await this.persist(tournament);
    return tournament;
  }

  private runBracket(modelIds: string[]): TournamentRanking[] {
    if (modelIds.length !== 4) {
      throw new Error(`DesignArena bracket requires exactly 4 models, got ${modelIds.length}`);
    }

    const [a, b, c, d] = modelIds;

    const battle = (m1: string, m2: string): BattleResult => {
      return { winner: m1, loser: m2 };
    };

    const battle1 = battle(a, b);
    const battle2 = battle(c, d);
    const battle3 = battle(battle1.winner, battle2.winner);
    const battle4 = battle(battle1.loser, battle2.loser);
    const battle5 = battle(battle3.loser, battle4.winner);

    const wins = new Map<string, number>();
    const losses = new Map<string, number>();
    for (const m of modelIds) { wins.set(m, 0); losses.set(m, 0); }

    const record = (w: string, l: string) => {
      wins.set(w, (wins.get(w) ?? 0) + 1);
      losses.set(l, (losses.get(l) ?? 0) + 1);
    };

    record(battle1.winner, battle1.loser);
    record(battle2.winner, battle2.loser);
    record(battle3.winner, battle3.loser);
    record(battle4.winner, battle4.loser);
    record(battle5.winner, battle5.loser);

    const sorted = [...modelIds].sort((x, y) => {
      const wx = wins.get(x) ?? 0;
      const wy = wins.get(y) ?? 0;
      if (wx !== wy) return wy - wx;
      const lx = losses.get(x) ?? 0;
      const ly = losses.get(y) ?? 0;
      return lx - ly;
    });

    return sorted.map((modelId, idx) => ({
      rank: (idx + 1) as 1 | 2 | 3 | 4,
      modelId,
      modelLabel: this.models.find(m => m.id === modelId)?.label ?? modelId,
      wins: wins.get(modelId) ?? 0,
      losses: losses.get(modelId) ?? 0,
    }));
  }

  private estimateCost(model: string, prices: Record<string, number>): number | null {
    const p = prices[model];
    return p === undefined ? null : p;
  }

  private async persist(tournament: TournamentResult): Promise<void> {
    this.app.db.insert('tournaments', {
      id: tournament.id,
      prompt: tournament.prompt,
      entries: JSON.stringify(tournament.entries),
      rankings: JSON.stringify(tournament.rankings),
      created_at: tournament.createdAt,
    });

    for (const entry of tournament.entries) {
      this.app.db.insert('tournament_entries', {
        id: newId('tent'),
        tournament_id: tournament.id,
        model_id: entry.modelId,
        model_label: entry.modelLabel,
        prompt: entry.prompt,
        result_png: entry.result?.png ?? null,
        width_px: entry.result?.widthPx ?? null,
        height_px: entry.result?.heightPx ?? null,
        error: entry.error,
        latency_ms: entry.latencyMs,
        cost_usd: entry.costUsd,
        prompt_hash: entry.promptHash,
      });
    }
  }
}

export async function createTournamentFromSettings(app: AppContext, prompt: string, size: 'portrait' | 'square' | 'landscape' = 'square'): Promise<TournamentResult> {
  const g = app.settings.get('generation');
  const models: TournamentModel[] = [];

  const openAiProvider = app.providers.imageOpenAI ?? app.providers.image;
  if (openAiProvider && await openAiProvider.isConfigured()) {
    models.push({ id: 'openai', label: 'OpenAI ' + openAiProvider.model(), provider: openAiProvider });
  }

  const geminiProvider = app.providers.imageGemini;
  if (geminiProvider && await geminiProvider.isConfigured()) {
    models.push({ id: 'gemini', label: 'Gemini Image', provider: geminiProvider });
  }

  const togetherProvider = app.providers.imageTogether;
  if (togetherProvider && await togetherProvider.isConfigured()) {
    models.push({ id: 'together', label: 'Together FLUX', provider: togetherProvider });
  }

  const hfProvider = app.providers.imageHuggingFace;
  if (hfProvider && await hfProvider.isConfigured()) {
    models.push({ id: 'huggingface', label: 'Hugging Face FLUX', provider: hfProvider });
  }

  const pollinationsProvider = app.providers.imagePollinations;
  if (pollinationsProvider && await pollinationsProvider.isConfigured()) {
    models.push({ id: 'pollinations', label: 'Pollinations FLUX', provider: pollinationsProvider });
  }

  const replicateProvider = app.providers.imageReplicate;
  if (replicateProvider && await replicateProvider.isConfigured()) {
    models.push({ id: 'replicate', label: 'Replicate FLUX.2 [pro]', provider: replicateProvider });
  }

  const falProvider = app.providers.imageFal;
  if (falProvider && await falProvider.isConfigured()) {
    models.push({ id: 'fal', label: 'Fal.ai FLUX.2 [pro]', provider: falProvider });
  }

  const grokProvider = app.providers.imageGrok;
  if (grokProvider && await grokProvider.isConfigured()) {
    models.push({ id: 'grok', label: 'Grok Imagine', provider: grokProvider });
  }

  if (models.length < 2) {
    throw new Error(`Need at least 2 configured image providers for tournament, found ${models.length}`);
  }

  const tournament = new ImageTournament(app, models.slice(0, 4));
  return tournament.run(prompt, size);
}