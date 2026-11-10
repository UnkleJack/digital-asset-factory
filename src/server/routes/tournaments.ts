import type { FastifyInstance } from 'fastify';
import type { App } from '../../app/bootstrap.ts';
import { AppError } from '../../core/errors.ts';
import { sha256 } from '../../core/hash.ts';
import { newId } from '../../core/ids.ts';
import type { ReferenceImage } from '../../engine/generation/providers.ts';

export function registerTournamentRoutes(server: FastifyInstance, deps: { app: App }): void {
  const { app } = deps;

  server.post<{ Body: { prompt: string; size?: 'portrait' | 'square' | 'landscape' } }>(
    '/api/tournaments',
    async (req, reply) => {
      const { prompt, size = 'square' } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        throw new AppError('validation_failed', 'Prompt is required and must be a string', { httpStatus: 400 });
      }
      if (prompt.length > 5000) {
        throw new AppError('validation_failed', 'Prompt too long (max 5000 chars)', { httpStatus: 400 });
      }

      const { createTournamentFromSettings } = await import('../../engine/generation/tournament.ts');
      const tournament = await createTournamentFromSettings(app, prompt, size);
      return reply.code(201).send(tournament);
    }
  );

  server.get<{ Querystring: { limit?: string; offset?: string } }>('/api/tournaments', async (req) => {
    const limit = Math.min(Number(req.query?.limit ?? 20), 100);
    const offset = Math.max(Number(req.query?.offset ?? 0), 0);
    const rows = app.db.all<{ id: string; prompt: string; rankings: string; created_at: string }>(
      'SELECT id, prompt, rankings, created_at FROM tournaments ORDER BY created_at DESC LIMIT ? OFFSET ?',
      limit,
      offset,
    );
    return rows.map((r) => ({
      id: r.id,
      prompt: r.prompt,
      rankings: JSON.parse(r.rankings),
      createdAt: r.created_at,
    }));
  });

  server.get('/api/tournaments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = app.db.get<{ id: string; prompt: string; entries: string; rankings: string; created_at: string }>(
      'SELECT id, prompt, entries, rankings, created_at FROM tournaments WHERE id = ?',
      id,
    );
    if (!row) throw new AppError('not_found', 'Tournament not found', { httpStatus: 404 });
    return {
      id: row.id,
      prompt: row.prompt,
      entries: JSON.parse(row.entries),
      rankings: JSON.parse(row.rankings),
      createdAt: row.created_at,
    };
  });

  server.get('/api/tournaments/:id/entries/:entryId/image', async (req, reply) => {
    const { id, entryId } = req.params as { id: string; entryId: string };
    const row = app.db.get<{ result_png: Buffer; mime: string }>(
      'SELECT result_png, \'image/png\' as mime FROM tournament_entries WHERE id = ? AND tournament_id = ?',
      entryId,
      id,
    );
    if (!row || !row.result_png) throw new AppError('not_found', 'Image not found', { httpStatus: 404 });
    return reply.type('image/png').send(row.result_png);
  });

  server.delete('/api/tournaments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = app.db.run('DELETE FROM tournaments WHERE id = ?', id);
    if (result.changes === 0) throw new AppError('not_found', 'Tournament not found', { httpStatus: 404 });
    return reply.code(204).send();
  });

  server.post<{ Body: { prompt: string; size?: 'portrait' | 'square' | 'landscape'; modelIds?: string[] } }>(
    '/api/tournaments/custom',
    async (req, reply) => {
      const { prompt, size = 'square', modelIds } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        throw new AppError('validation_failed', 'Prompt is required and must be a string', { httpStatus: 400 });
      }
      if (prompt.length > 5000) {
        throw new AppError('validation_failed', 'Prompt too long (max 5000 chars)', { httpStatus: 400 });
      }

      const models: { id: string; label: string; provider: any }[] = [];

      const providerMap: Record<string, any> = {
        openai: app.providers.imageOpenAI ?? app.providers.image,
        gemini: app.providers.imageGemini,
        together: app.providers.imageTogether,
        huggingface: app.providers.imageHuggingFace,
        pollinations: app.providers.imagePollinations,
        replicate: app.providers.imageReplicate,
        fal: app.providers.imageFal,
        grok: app.providers.imageGrok,
      };

      const ids = modelIds && modelIds.length >= 2 ? modelIds : ['openai', 'gemini', 'together', 'pollinations'];
      for (const mid of ids.slice(0, 4)) {
        const provider = providerMap[mid];
        if (provider && await provider.isConfigured()) {
          models.push({ id: mid, label: mid, provider });
        }
      }

      if (models.length < 2) {
        throw new AppError('validation_failed', `Need at least 2 configured providers, found ${models.length}`, { httpStatus: 400 });
      }

      const { ImageTournament } = await import('../../engine/generation/tournament.ts');
      const tournament = new ImageTournament(app, models);
      const result = await tournament.run(prompt, size);
      return reply.code(201).send(result);
    }
  );

  // Variations: generate N images from a reference image using the given providers
  server.post<{ Body: { referenceId: string; prompt?: string; count?: number; size?: 'portrait' | 'square' | 'landscape'; modelIds?: string[]; seed?: number } }>(
    '/api/tournaments/variations',
    async (req, reply) => {
      const { referenceId, prompt, count = 5, size = 'square', modelIds, seed } = req.body;
      if (!referenceId) {
        throw new AppError('validation_failed', 'referenceId is required', { httpStatus: 400 });
      }
      if (count < 1 || count > 20) {
        throw new AppError('validation_failed', 'count must be 1-20', { httpStatus: 400 });
      }

      // Load the reference image from the reference library
      const { getReference } = await import('../../engine/references/service.ts');
      const ref = getReference(app, referenceId);
      if (!ref || ref.kind !== 'image' || !ref.rel_path) {
        throw new AppError('not_found', 'Reference image not found', { httpStatus: 404 });
      }
      const { referenceImageAsPng } = await import('../../engine/references/load.ts');
      const refImg = await referenceImageAsPng(app, referenceId);

      const refImage: ReferenceImage = { data: refImg.png, mime: 'image/png' };

      // Default prompt from reference metadata or provided
      const basePrompt = prompt ?? ref.prompt ?? 'variation';

      const models: { id: string; label: string; provider: any }[] = [];

      const providerMap: Record<string, any> = {
        openai: app.providers.imageOpenAI ?? app.providers.image,
        gemini: app.providers.imageGemini,
        together: app.providers.imageTogether,
        huggingface: app.providers.imageHuggingFace,
        pollinations: app.providers.imagePollinations,
        replicate: app.providers.imageReplicate,
        fal: app.providers.imageFal,
        grok: app.providers.imageGrok,
      };

      const defaultIds = ['pollinations', 'gemini', 'together', 'huggingface'];
      const paidProviderIds = new Set(['openai', 'replicate', 'fal', 'grok']);
      const allowPaidFromClient = app.settings?.generation?.allowPaidFallback === true;

      let ids = defaultIds;
      if (modelIds && modelIds.length >= 1) {
        const requestedIds = modelIds.filter((mid) => typeof mid === 'string' && mid in providerMap);
        const requestedPaid = requestedIds.filter((mid) => paidProviderIds.has(mid));
        if (requestedPaid.length > 0 && !allowPaidFromClient) {
          throw new AppError(
            'validation_failed',
            'Paid providers are not allowed for this endpoint',
            { httpStatus: 400 }
          );
        }
        ids = requestedIds;
      }

      for (const mid of ids.slice(0, 4)) {
        const provider = providerMap[mid];
        if (provider && await provider.isConfigured()) {
          models.push({ id: mid, label: mid, provider });
        }
      }

      if (models.length < 1) {
        throw new AppError('validation_failed', `Need at least 1 configured provider, found ${models.length}`, { httpStatus: 400 });
      }

      // Generate `count` images per model (sequential to avoid rate limits)
      const results: any[] = [];
      const referenceImageProviderAllowlist = new Set(['pollinations']);
      for (const m of models) {
        for (let i = 0; i < count; i++) {
          const itemSeed = seed !== undefined ? seed + i : undefined;
          const referenceImageForProvider = refImage && referenceImageProviderAllowlist.has(m.id) ? refImage : undefined;
          try {
            const res = await m.provider.generateImage({
              prompt: basePrompt,
              size,
              referenceImage: referenceImageForProvider,
              seed: itemSeed,
            });
            results.push({
              modelId: m.id,
              modelLabel: m.label,
              index: i + 1,
              result: { png: res.png, widthPx: res.widthPx, heightPx: res.heightPx, model: res.model },
            });
          } catch (e) {
            results.push({
              modelId: m.id,
              modelLabel: m.label,
              index: i + 1,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }

      return reply.code(201).send({
        referenceId,
        basePrompt,
        count,
        results,
      });
    }
  );
}