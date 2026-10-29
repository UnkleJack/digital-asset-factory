import type { FastifyInstance } from 'fastify';
import type { App } from '../../app/bootstrap.ts';
import { AppError } from '../../core/errors.ts';

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
}