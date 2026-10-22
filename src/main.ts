import { bootstrap } from './app/bootstrap.ts';
import { resolvePaths } from './config/paths.ts';
import { acquireLock } from './ops/lock.ts';
import { createWorker } from './jobs/handlers.ts';
import { enqueue } from './jobs/queue.ts';
import { Scheduler, runProductionPlanJob } from './scheduler/scheduler.ts';
import { generateRecommendations } from './engine/analytics/service.ts';
import { syncGumroadSales } from './engine/publishing/gumroad.ts';
import { runDigest, isDigestDue } from './engine/digest/service.ts';
import { buildServer } from './server/app.ts';

const port = Number(process.env.DAF_PORT ?? 4317);
const paths = resolvePaths();

let release: () => void;
try {
  release = acquireLock(paths.dataDir);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

let app: ReturnType<typeof bootstrap>;
try {
  app = bootstrap({ logLevel: process.env.DAF_LOG_LEVEL === 'debug' ? 'debug' : 'info' });
} catch (err) {
  console.error(`Could not start: ${(err as Error).message}`);
  release();
  process.exit(1);
}
const worker = createWorker(app, {
  run_production_plan: runProductionPlanJob,
  refresh_recommendations: async (a) => {
    // Pull new Gumroad sales first so the recommendations see them (no-op without a token).
    const sales = await syncGumroadSales(a).catch((err) => (a.log.warn('Gumroad sales sync failed', { err: (err as Error).message }), null));
    return { sales, recommendations: generateRecommendations(a) };
  },
  research_digest: async (a, job) => runDigest(a, { trigger: job.payload.trigger === 'schedule' ? 'schedule' : 'manual', actor: 'scheduler' }),
});
const scheduler = new Scheduler(app);
const devOrigins = process.env.DAF_DEV ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [];
const server = await buildServer({ app, worker, scheduler, port, startedAt: new Date(), devOrigins });

try {
  await server.listen({ host: '127.0.0.1', port });
} catch (err) {
  const code = (err as NodeJS.ErrnoException).code;
  console.error(code === 'EADDRINUSE' ? `Port ${port} is already in use. Another copy may be running, or set DAF_PORT to a free port.` : `Could not start the server: ${(err as Error).message}`);
  await app.close();
  release();
  process.exit(1);
}

worker.start();
scheduler.start();
const refreshHours = app.settings.get('analytics').refreshHours;
const recTimer = setInterval(() => enqueue(app, 'refresh_recommendations', { dedupeKey: `recs:${new Date().toISOString().slice(0, 13)}` }), refreshHours * 3_600_000);
// The digest's due date comes from the stored lastSentAt, so restarts and days the app was off just mean it runs at the next check.
const checkDigest = () => {
  if (isDigestDue(app)) enqueue(app, 'research_digest', { dedupeKey: `digest:${new Date().toISOString().slice(0, 10)}`, payload: { trigger: 'schedule' }, maxAttempts: 2 });
};
const digestTimer = setInterval(checkDigest, 3_600_000);
setTimeout(checkDigest, 60_000);
app.log.info(`Digital Asset Factory is running at http://127.0.0.1:${port}`, { dataDir: paths.dataDir, chrome: app.renderer.available() });
if (!app.renderer.available()) app.log.warn('Google Chrome was not found; rendering jobs will fail until Settings → Rendering → Chrome path is set.');

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  app.log.info('Shutting down', { signal });
  clearInterval(recTimer);
  clearInterval(digestTimer);
  scheduler.stop();
  await server.close().catch(() => undefined);
  await worker.stop(20_000);
  await app.close();
  release();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
