import { z } from 'zod';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { SETTINGS_KEYS, type SettingsKey } from '../../config/settings.ts';
import { assertSecretName, SECRET_NAMES } from '../../config/secrets.ts';
import { structuredCall } from '../../engine/generation/service.ts';
import { createBackup, listBackups } from '../../ops/backup.ts';
import { validation } from '../../core/errors.ts';
import { errorMessage } from '../../core/errors.ts';
import { audit, type Level } from '../../logging/logger.ts';
import { pngSize, SECRET_KEY_LINKS } from '../../engine/generation/providers.ts';
import { int, parse, type Q, type P } from './util.ts';

export function registerSettingsRoutes(s: FastifyInstance, { app }: ServerDeps): void {
  s.get('/api/settings', async () => ({ settings: app.settings.all(), sections: SETTINGS_KEYS }));
  s.patch('/api/settings/:section', async (req) => {
    const section = (req.params as P).section as SettingsKey;
    if (!SETTINGS_KEYS.includes(section)) throw validation(`Unknown settings section ${section}`);
    const value = app.settings.update(section, req.body);
    audit(app.db, 'user', 'settings.updated', 'settings', section, { keys: Object.keys((req.body as object) ?? {}) });
    if (section === 'rendering') await app.rebuildRenderer();
    return value;
  });
  s.post('/api/settings/:section/reset', async (req) => {
    const section = (req.params as P).section as SettingsKey;
    if (!SETTINGS_KEYS.includes(section)) throw validation(`Unknown settings section ${section}`);
    const value = app.settings.reset(section);
    audit(app.db, 'user', 'settings.reset', 'settings', section, {});
    if (section === 'rendering') await app.rebuildRenderer();
    return value;
  });

  s.get('/api/secrets', async () => ({
    store: app.secrets.kind,
    secrets: (await app.secrets.status()).map((x) => ({ ...x, keyUrl: SECRET_KEY_LINKS[x.name]?.url ?? null, keyIsFree: SECRET_KEY_LINKS[x.name]?.free ?? false })),
  }));
  s.put('/api/secrets/:name', async (req) => {
    const name = (req.params as P).name;
    assertSecretName(name);
    const { value } = parse(z.object({ value: z.string().trim().min(8).max(4096) }), req.body, 'secret');
    // Google shows app passwords in four groups of four letters; the spaces aren't part of it.
    await app.secrets.set(name, name === 'smtp_password' ? value.replace(/\s+/g, '') : value);
    audit(app.db, 'user', 'secret.set', 'secret', name, {});
    return { name, configured: true };
  });
  s.delete('/api/secrets/:name', async (req) => {
    const name = (req.params as P).name;
    assertSecretName(name);
    await app.secrets.delete(name);
    audit(app.db, 'user', 'secret.deleted', 'secret', name, {});
    return { name, configured: false };
  });

  s.post('/api/providers/test', async (req) => {
    const { provider } = parse(z.object({ provider: z.enum(['text', 'image']) }), req.body, 'provider test');
    const started = Date.now();
    try {
      if (provider === 'text') {
        const selected = app.settings.get('generation').textProvider;
        if (selected === 'deterministic') return { ok: false, provider: selected, ms: 0, error: 'Text generation is set to "deterministic" in Settings → Generation; there is no API to test. Pick a provider there first.' };
        const r = await structuredCall(app, { purpose: 'provider-test', schema: z.object({ ok: z.boolean(), word: z.string() }), system: 'Reply with the requested JSON only.', prompt: 'Return ok=true and word="ready".', maxTokens: 2000, trace: {} });
        const servedBy = r.provenance.generator;
        audit(app.db, 'user', 'provider.tested', 'provider', servedBy, { ok: true, selected });
        return { ok: true, provider: servedBy, model: r.provenance.model, ...(servedBy !== selected && { warning: `${selected} did not answer; the backup provider ${servedBy} did. Check the ${selected} key or its limits.` }), ms: Date.now() - started, note: 'A real API call was made and its structured output validated.' };
      }
      const img = await app.providers.image.generateImage({ prompt: 'A simple black outline of a circle on a white background, coloring book line art.', size: 'square' });
      audit(app.db, 'user', 'provider.tested', 'provider', 'openai', { ok: true });
      return { ok: true, provider: 'openai', model: img.model, ms: Date.now() - started, dims: pngSize(img.png), note: 'A real image was generated and validated as PNG.' };
    } catch (err) {
      audit(app.db, 'user', 'provider.tested', 'provider', provider, { ok: false });
      return { ok: false, provider, ms: Date.now() - started, error: errorMessage(err) };
    }
  });

  s.get('/api/logs', async (req) => {
    const q = req.query as Q;
    const level = (['debug', 'info', 'warn', 'error'].includes(q.level ?? '') ? q.level : undefined) as Level | undefined;
    const recent = app.log.recent(int(q.limit, 200, 1, 1000), level);
    if (recent.length || q.file !== '1') return { source: 'memory', entries: recent };
    const files = existsSync(app.paths.logsDir) ? readdirSync(app.paths.logsDir).filter((f) => f.endsWith('.jsonl')).sort().reverse() : [];
    const lines = files.length ? readFileSync(join(app.paths.logsDir, files[0]), 'utf8').trim().split('\n').slice(-int(q.limit, 200, 1, 1000)).reverse() : [];
    return { source: files[0] ?? null, entries: lines.map((l) => { try { return JSON.parse(l); } catch { return { msg: l }; } }) };
  });
  s.get('/api/audit', async (req) => {
    const q = req.query as Q;
    return app.db.all(`SELECT * FROM audit_events ${q.entityId ? 'WHERE entity_id = ?' : ''} ORDER BY at DESC LIMIT ?`, ...(q.entityId ? [q.entityId] : []), int(q.limit, 200, 1, 1000));
  });

  s.get('/api/backups', async () => listBackups(app.paths));
  s.post('/api/backups', async () => {
    const info = createBackup(app.db, app.paths);
    audit(app.db, 'user', 'backup.created', 'backup', info.name, { bytes: info.bytes });
    return info;
  });

  s.get('/api/system', async () => ({
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    dataDir: app.paths.dataDir,
    secretStore: app.secrets.kind,
    secretNames: SECRET_NAMES,
    chrome: { path: app.settings.get('rendering').chromePath, available: app.renderer.available() },
    schema: app.db.all('SELECT version, name, applied_at FROM schema_migrations ORDER BY version'),
    counts: { products: app.db.value('SELECT count(*) FROM products'), assets: app.db.value('SELECT count(*) FROM assets'), jobs: app.db.value('SELECT count(*) FROM jobs') },
  }));
}
