import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { enqueue } from '../../jobs/queue.ts';
import { listDigestRuns, getDigestRun, promoteIdea } from '../../engine/digest/service.ts';
import { searchesThisMonth } from '../../engine/digest/search.ts';
import { smtpMailer } from '../../engine/digest/email.ts';
import { errorMessage } from '../../core/errors.ts';
import { int, parse, type Q, type P } from './util.ts';

export function registerDigestRoutes(s: FastifyInstance, { app }: ServerDeps): void {
  s.get('/api/digest', async (req) => {
    const d = app.settings.get('research').digest;
    const lastSent = app.db.value<string>("SELECT email_sent_at FROM digest_runs WHERE status = 'sent' ORDER BY email_sent_at DESC LIMIT 1") ?? null;
    const next = d.enabled ? new Date(Math.max(app.clock.now().getTime(), (d.lastSentAt ? new Date(d.lastSentAt).getTime() : 0) + d.intervalDays * 86_400_000)).toISOString() : null;
    return { runs: listDigestRuns(app, int((req.query as Q).limit, 20, 1, 100)), searchesThisMonth: searchesThisMonth(app), monthlySearchBudget: d.monthlySearchBudget, lastSentAt: lastSent, nextDueAt: next, running: !!app.db.get("SELECT 1 FROM jobs WHERE type = 'research_digest' AND status IN ('queued','running')") };
  });
  s.get('/api/digest/runs/:id', async (req) => getDigestRun(app, (req.params as P).id));
  s.post('/api/digest/run-now', async () => enqueue(app, 'research_digest', { dedupeKey: `digest:manual:${Date.now()}`, payload: { trigger: 'manual' }, maxAttempts: 1 }));
  s.post('/api/digest/runs/:id/promote', async (req) => {
    const { index } = parse(z.object({ index: z.number().int().min(0).max(5) }), req.body, 'idea');
    return { opportunityId: promoteIdea(app, (req.params as P).id, index) };
  });
  // Sends a one-line test message so email setup can be checked without running research.
  s.post('/api/integrations/email/test', async () => {
    const to = app.settings.get('research').digest.recipientEmail;
    try {
      await smtpMailer(app).send({ to, subject: 'Digital Asset Factory: email works', text: 'This is a test from Digital Asset Factory. Research digests will arrive at this address.', html: '<p>This is a test from <b>Digital Asset Factory</b>. Research digests will arrive at this address.</p>' });
      return { ok: true, to };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });
}
