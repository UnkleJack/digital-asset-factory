import { bootstrap } from './app/bootstrap.ts';
import { lanAddresses } from './server/remote.ts';
import { resolvePaths } from './config/paths.ts';
import { acquireLock } from './ops/lock.ts';
import { createWorker } from './jobs/handlers.ts';
import { enqueue } from './jobs/queue.ts';
import { Scheduler, runProductionPlanJob } from './scheduler/scheduler.ts';
import { generateRecommendations } from './engine/analytics/service.ts';
import { syncGumroadSales } from './engine/publishing/gumroad.ts';
import { runDigest, isDigestDue } from './engine/digest/service.ts';
import { buildServer } from './server/app.ts';
import { SUITE_NAME } from './core/brand.ts';
import { verificationRoot, verificationCleanupDue, planVerificationCleanup, applyVerificationCleanup } from './ops/cleanVerification.ts';
import { processReasonQueue, RETRY_SECONDS } from './engine/approval/reasonQueue.ts';
import { processBoxQueue } from './engine/approval/reviewBoxes.ts';

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
  const remote = app.settings.get('remote');
  const remoteReady = remote.enabled && !!(await app.secrets.get('remote_access_token'));
  if (remote.enabled && !remoteReady) app.log.warn('Remote access is on but no access token exists yet; staying local. Make one in Settings → System.');
  await server.listen({ host: remoteReady ? remote.bindAddress : '127.0.0.1', port });
  if (remoteReady) app.log.info('Remote access is on: other computers can open this app with the access token', { addresses: lanAddresses().map((a) => `http://${a}:${port}`) });
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
// Weekly cleanup of old test folders in verification-output/ (Settings → Scheduler → cleanVerificationWeekly).
// The last run is noted in verification-output/.last-cleanup, so restarts and days off just mean it runs at the next check.
const checkVerificationCleanup = () => {
  try {
    const root = verificationRoot();
    if (!app.settings.get('scheduler').cleanVerificationWeekly || !verificationCleanupDue(root)) return;
    const plan = planVerificationCleanup(root);
    const r = applyVerificationCleanup(plan);
    if (r.removed.length || r.failed.length || plan.skipped.length) {
      app.log.info('Weekly cleanup of old test folders in verification-output', { removed: r.removed, notRemoved: r.failed, leftAlone: plan.skipped });
    }
  } catch (err) {
    app.log.warn('Weekly cleanup of verification-output failed', { err: (err as Error).message });
  }
};
const cleanupTimer = setInterval(checkVerificationCleanup, 3_600_000);
// Review notes that waited because the AI couldn't be reached: every 60 seconds, if the AI is back, check them.
// Boxes drawn on reject notes that wait for the picture-reading AI are tried again on the same beat.
const reasonTimer = setInterval(() => {
  processReasonQueue(app)
    .catch((err) => app.log.warn('Checking waiting review notes failed', { err: (err as Error).message }))
    .then(() => processBoxQueue(app))
    .catch((err) => app.log.warn('Reading waiting review boxes failed', { err: (err as Error).message }));
}, RETRY_SECONDS * 1000);
setTimeout(checkVerificationCleanup, 120_000);
app.log.info(`${SUITE_NAME} is running at http://127.0.0.1:${port}`, { dataDir: paths.dataDir, chrome: app.renderer.available() });
if (!app.renderer.available()) app.log.warn('Google Chrome or Microsoft Edge was not found; rendering jobs will fail until one is installed or Settings → Rendering → Chrome path is set.');

let stopping = false;
let shutdownTimer: ReturnType<typeof setTimeout> | null = null;
const GRACE_MS = 10_000;
async function shutdown(signal: string) {
  if (shutdownTimer) {
    // Second signal: exit immediately.
    clearTimeout(shutdownTimer);
    app.log.warn('Second shutdown signal received; exiting immediately', { signal });
    process.exit(1);
  }
  if (stopping) return;
  stopping = true;
  app.log.info('Shutting down', { signal });
  clearInterval(recTimer);
  clearInterval(digestTimer);
  clearInterval(cleanupTimer);
  clearInterval(reasonTimer);
  scheduler.stop();
  await server.close().catch(() => undefined);
  // Wait for worker to finish up to GRACE_MS, then proceed regardless.
  const workerStopped = worker.stop(GRACE_MS);
  shutdownTimer = setTimeout(() => {
    app.log.warn('Shutdown grace period exceeded; forcing exit');
    process.exit(1);
  }, GRACE_MS);
  try {
    await workerStopped;
  } finally {
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
  }
  await app.close();
  release();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));