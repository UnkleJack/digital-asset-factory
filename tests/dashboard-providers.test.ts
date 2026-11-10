import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { buildServer } from '../src/server/app.ts';
import { tempDir } from './helpers.ts';

// The Dashboard's Integrations card and the sidebar name the provider that would actually answer,
// not a fixed "Anthropic" / "OpenAI" label.

const PORT = 4398;
const H = { host: `127.0.0.1:${PORT}`, 'x-daf-client': '1', 'content-type': 'application/json' };
let app: App;
let server: FastifyInstance;
const secrets = new MemorySecretStore();

before(async () => {
  app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false, pacing: false });
  server = await buildServer({ app, worker: null, scheduler: null, port: PORT, startedAt: new Date() });
});
after(async () => {
  await server.close();
  await app.close();
});

const dash = async () => (await server.inject({ method: 'GET', url: '/api/dashboard', headers: { host: H.host } })).json().providers;

test('text row names the selected provider and its own model', async () => {
  await secrets.set('nvidia_api_key', 'test-key');
  app.settings.update('generation', { textProvider: 'nvidia' });
  const p = await dash();
  assert.equal(p.text.provider, 'nvidia');
  assert.equal(p.text.selected, 'nvidia');
  assert.equal(p.text.model, app.settings.get('generation').nvidia.model);
  assert.notEqual(p.text.model, app.settings.get('generation').anthropic.model);
});

test('text row names the backup when the selected provider has no key', async () => {
  app.settings.update('generation', { textProvider: 'groq', fallbackOrder: ['nvidia'] });
  const p = await dash();
  assert.equal(p.text.selected, 'groq');
  assert.equal(p.text.provider, 'nvidia');
});

test('image row names the image provider, and none means not configured', async () => {
  app.settings.update('generation', { imageProvider: 'pollinations' });
  let p = await dash();
  assert.equal(p.image.provider, 'pollinations');
  assert.equal(p.image.configured, true);
  app.settings.update('generation', { imageProvider: 'none' });
  p = await dash();
  assert.equal(p.image.configured, false);
});

test('arcade test credits can be changed through the settings API the Settings → Arcade tab uses', async () => {
  const patch = (n: number) => server.inject({ method: 'PATCH', url: '/api/settings/arcade', headers: H, payload: JSON.stringify({ testCredits: n }) });
  assert.equal((await patch(0)).statusCode, 200);
  assert.equal(app.settings.get('arcade').testCredits, 0);
  assert.equal((await patch(100)).statusCode, 422, 'above 99 is refused');
  assert.equal((await patch(7)).statusCode, 200);
  assert.equal(app.settings.get('arcade').testCredits, 7);
});
