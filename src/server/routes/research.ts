import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { createOpportunity, updateOpportunity, getOpportunity, observationsFor, addObservation, importObservationsCsv, suggestOpportunities, KNOWN_METRICS, EVIDENCE_KINDS } from '../../engine/research/service.ts';
import { scoreOpportunity, latestScore, SCORING_RULES } from '../../engine/scoring/service.ts';
import { createProduct } from '../../engine/specification/service.ts';
import { startPipeline } from '../../jobs/pipeline.ts';
import { createBatch, addToBatch } from '../../engine/approval/batches.ts';
import { conflict } from '../../core/errors.ts';
import { int, parse, type Q, type P } from './util.ts';

export function registerResearchRoutes(s: FastifyInstance, { app }: ServerDeps): void {
  s.get('/api/opportunities', async (req) => {
    const q = req.query as Q;
    const rows = app.db.all<{ id: string }>(`SELECT o.id FROM opportunities o ${q.status ? 'WHERE o.status = ?' : "WHERE o.status <> 'archived'"} ORDER BY o.updated_at DESC LIMIT ?`, ...(q.status ? [q.status] : []), int(q.limit, 200, 1, 500));
    return rows.map((r) => {
      const o = getOpportunity(app, r.id);
      const sc = latestScore(app, r.id);
      return { ...o, category: app.db.value('SELECT name FROM categories WHERE id = ?', o.category_id), score: sc ? { score: sc.score, confidence: sc.confidence, outcome: sc.outcome, at: sc.created_at } : null, products: app.db.value<number>('SELECT count(*) FROM products WHERE opportunity_id = ?', r.id) };
    });
  });

  s.post('/api/opportunities', async (req) => ({ id: createOpportunity(app, req.body) }));
  s.get('/api/opportunities/:id', async (req) => {
    const id = (req.params as P).id;
    return {
      opportunity: getOpportunity(app, id),
      observations: observationsFor(app, id),
      scores: app.db.all<Record<string, unknown>>('SELECT * FROM opportunity_scores WHERE opportunity_id = ? ORDER BY id DESC LIMIT 20', id).map((r) => ({ ...r, factors: JSON.parse(String(r.factors)), weights: JSON.parse(String(r.weights)), thresholds: JSON.parse(String(r.thresholds)) })),
      products: app.db.all('SELECT id, title, status, created_at FROM products WHERE opportunity_id = ? ORDER BY created_at DESC', id),
    };
  });
  s.patch('/api/opportunities/:id', async (req) => {
    updateOpportunity(app, (req.params as P).id, req.body);
    return { ok: true };
  });
  s.post('/api/opportunities/:id/score', async (req) => scoreOpportunity(app, (req.params as P).id));
  s.post('/api/opportunities/:id/produce', async (req) => {
    const id = (req.params as P).id;
    const b = parse(z.object({ marketplaces: z.array(z.string()).optional(), designSystemId: z.string().optional(), paper: z.record(z.string(), z.unknown()).optional(), params: z.record(z.string(), z.unknown()).optional() }), req.body, 'production request');
    const o = getOpportunity(app, id);
    if (['rejected', 'archived'].includes(o.status)) throw conflict(`This opportunity is ${o.status}.`);
    const { product, version } = createProduct(app, { productType: o.product_type, title: o.title, audienceId: o.audience_id, themeId: o.theme_id, opportunityId: id, designSystemId: b.designSystemId, paper: b.paper as never, params: b.params });
    const batch = createBatch(app, `Manual — ${product.title}`.slice(0, 120), 'manual');
    addToBatch(app, batch, version.id);
    startPipeline(app, version.id, { marketplaces: b.marketplaces });
    app.db.update('opportunities', id, { status: 'produced', updated_at: new Date().toISOString() });
    return { productId: product.id, versionId: version.id, batchId: batch };
  });
  s.post('/api/opportunities/suggest', async (req) => {
    const b = parse(z.object({ count: z.number().int().min(1).max(10).optional(), focus: z.string().max(300).optional() }), req.body, 'suggestion request');
    return { ids: await suggestOpportunities(app, b) };
  });

  s.get('/api/observations', async (req) => {
    const q = req.query as Q;
    return app.db.all(`SELECT r.*, k.phrase AS keyword, o.title AS opportunity FROM research_observations r LEFT JOIN keywords k ON k.id = r.keyword_id LEFT JOIN opportunities o ON o.id = r.opportunity_id ORDER BY r.created_at DESC LIMIT ?`, int(q.limit, 200, 1, 1000));
  });
  s.post('/api/observations', async (req) => ({ id: addObservation(app, req.body) }));
  s.post('/api/observations/import', async (req) => {
    const b = parse(z.object({ filename: z.string().min(1).max(200), content: z.string().min(1).max(20_000_000), evidenceKind: z.enum(EVIDENCE_KINDS).optional(), source: z.string().max(200).optional() }), req.body, 'import');
    return importObservationsCsv(app, b.filename, b.content, { evidenceKind: b.evidenceKind, source: b.source });
  });
  s.get('/api/imports', async () => app.db.all('SELECT * FROM data_imports ORDER BY created_at DESC LIMIT 50'));
  s.get('/api/scoring/rules', async () => ({ rules: SCORING_RULES, metrics: KNOWN_METRICS, evidenceKinds: EVIDENCE_KINDS, settings: app.settings.get('scoring') }));
}
