import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { metrics, addPerformance, importPerformanceCsv, generateRecommendations, decideRecommendation } from '../../engine/analytics/service.ts';
import { json } from '../../db/sqlite.ts';
import { parse, type Q, type P } from './util.ts';

export function registerAnalyticsRoutes(s: FastifyInstance, { app }: ServerDeps): void {
  s.get('/api/analytics', async () => metrics(app));
  s.post('/api/analytics/entries', async (req) => ({ id: addPerformance(app, req.body) }));
  s.post('/api/analytics/import', async (req) => {
    const b = parse(z.object({ filename: z.string().min(1).max(200), content: z.string().min(1).max(20_000_000), marketplace: z.enum(['etsy', 'gumroad', 'generic']) }), req.body, 'import');
    return importPerformanceCsv(app, b.filename, b.content, b.marketplace);
  });
  s.get('/api/recommendations', async (req) => {
    const q = req.query as Q;
    return app.db.all<Record<string, unknown>>(`SELECT * FROM recommendations ${q.status ? 'WHERE status = ?' : ''} ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, confidence DESC, created_at DESC LIMIT 100`, ...(q.status ? [q.status] : [])).map((r) => ({ ...r, evidence: json(r.evidence, {}) }));
  });
  s.post('/api/recommendations/refresh', async () => generateRecommendations(app));
  s.post('/api/recommendations/:id/decision', async (req) => {
    const { status } = parse(z.object({ status: z.enum(['accepted', 'dismissed']) }), req.body, 'decision');
    decideRecommendation(app, (req.params as P).id, status);
    return { ok: true };
  });
}
