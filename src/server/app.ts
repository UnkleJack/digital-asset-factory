import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { App } from '../app/bootstrap.ts';
import type { Worker } from '../jobs/worker.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import { AppError } from '../core/errors.ts';
import { redact } from '../logging/logger.ts';
import { registerProductRoutes } from './routes/products.ts';
import { registerResearchRoutes } from './routes/research.ts';
import { registerOperationsRoutes } from './routes/operations.ts';
import { registerPublishingRoutes } from './routes/publishing.ts';
import { registerSettingsRoutes } from './routes/settings.ts';
import { registerAnalyticsRoutes } from './routes/analytics.ts';
import { registerDigestRoutes } from './routes/digest.ts';
import { registerPackingRoutes } from './routes/packing.ts';
import { RemoteGate, registerRemoteRoutes, isLoopback } from './remote.ts';

export interface ServerDeps {
  app: App;
  worker: Worker | null;
  scheduler: Scheduler | null;
  port: number;
  startedAt: Date;
  devOrigins?: string[];
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const APP_CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const { app, port } = deps;
  const server = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 });
  server.removeContentTypeParser('application/json');
  server.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = String(body ?? '').trim();
    if (!text) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch {
      done(Object.assign(new Error('The request body is not valid JSON'), { statusCode: 400, code: 'bad_json' }), undefined);
    }
  });
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(deps.devOrigins ?? [])]);

  const gate = new RemoteGate(app);
  await gate.load();

  server.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const host = String(req.headers.host ?? '');
    // From another computer (hub mode) the Host is this machine's network name; the access token protects it instead.
    const remote = !isLoopback(req);
    if (remote) {
      if (!gate.check(req, reply)) return reply;
    } else if (!allowedHosts.has(host) && !(deps.devOrigins?.length && /^(127\.0\.0\.1|localhost):\d+$/.test(host))) {
      return reply.code(421).send({ error: { code: 'bad_host', message: 'Requests must be addressed to the local app.' } });
    }
    if (req.url.startsWith('/api/') && MUTATING.has(req.method)) {
      const origin = req.headers.origin;
      const sameOrigin = (o: string) => allowedOrigins.has(o) || (remote && o === `http://${host}`);
      if (req.url.split('?')[0] === '/api/login') {
        if (origin && !sameOrigin(origin)) return reply.code(403).send({ error: { code: 'bad_origin', message: 'Cross-origin requests are not allowed.' } });
        return;
      }
      if (req.headers['x-daf-client'] !== '1') return reply.code(403).send({ error: { code: 'csrf', message: 'Missing client header.' } });
      if (origin && !sameOrigin(origin)) return reply.code(403).send({ error: { code: 'bad_origin', message: 'Cross-origin requests are not allowed.' } });
    }
  });
  registerRemoteRoutes(server, app, gate);

  server.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    if (!reply.hasHeader('Content-Security-Policy')) reply.header('Content-Security-Policy', req.url.startsWith('/api/') ? "default-src 'none'; frame-ancestors 'none'" : APP_CSP);
    if (req.url.startsWith('/api/') && !reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  server.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.httpStatus).send({ error: { code: err.code, message: redact(err.message), details: err.details } });
    }
    const e = err as { statusCode?: number; validation?: unknown; message?: string; code?: string };
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: { code: e.code ?? 'bad_request', message: redact(e.message ?? 'Bad request') } });
    app.log.error('Unhandled request error', { method: req.method, url: req.url, err });
    return reply.code(500).send({ error: { code: 'internal_error', message: 'Something went wrong. The details were written to the log (Settings → Logs).' } });
  });

  server.get('/api/health', async () => ({
    ok: true,
    startedAt: deps.startedAt.toISOString(),
    db: app.db.value<string>('PRAGMA quick_check') === 'ok',
    chrome: app.renderer.available(),
    worker: deps.worker?.stats() ?? null,
    scheduler: !!deps.scheduler,
  }));

  registerProductRoutes(server, deps);
  registerResearchRoutes(server, deps);
  registerOperationsRoutes(server, deps);
  registerPublishingRoutes(server, deps);
  registerSettingsRoutes(server, deps);
  registerAnalyticsRoutes(server, deps);
  registerDigestRoutes(server, deps);
  registerPackingRoutes(server, deps);

  server.all('/api/*', async (_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Unknown API endpoint' } }));

  const dist = app.paths.webDist;
  if (existsSync(join(dist, 'index.html'))) {
    // wildcard: true resolves files per request, so a rebuilt web/dist is served without a restart.
    await server.register(fastifyStatic, { root: dist, prefix: '/', wildcard: true, index: ['index.html'] });
    server.setNotFoundHandler((req, reply) => {
      // Only page routes fall back to the app shell; a missing file must stay a 404, not HTML with the wrong type.
      const path = req.url.split('?')[0]!;
      if (req.method === 'GET' && !path.startsWith('/api/') && !path.startsWith('/assets/') && !/\.[a-z0-9]+$/i.test(path)) return reply.type('text/html').sendFile('index.html');
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
    });
  } else {
    server.get('/', async (_req, reply) => reply.type('text/html').send('<!doctype html><meta charset="utf-8"><title>Digital Asset Factory</title><body style="font-family:system-ui;padding:40px"><h1>Digital Asset Factory</h1><p>The web interface has not been built yet. Run <code>npm run build:web</code> (or use <code>npm start</code>, which builds it) and reload.</p><p>The API is available at <a href="/api/health">/api/health</a>.</p></body>'));
  }
  return server;
}
