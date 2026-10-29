import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { AnthropicTextProvider, OpenAIImageProvider } from '../src/engine/generation/providers.ts';
import { structuredCall, generateContent } from '../src/engine/generation/service.ts';
import { ProviderError } from '../src/core/errors.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { bootstrap } from '../src/app/bootstrap.ts';
import { productType } from '../src/engine/producttypes/registry.ts';
import { mockServer, anthropicMessage, lineArtPng } from './mockServers.ts';
import { tempDir, makeContext } from './helpers.ts';
import type { Settings } from '../src/config/settings.ts';

const KEY = 'sk-ant-test-key-1234567890abcdef';
const Schema = z.object({ title: z.string(), items: z.array(z.string()).min(2) });

function anthropicCfg(url: string, over: Partial<Settings['generation']['anthropic']> = {}): Settings['generation']['anthropic'] {
  return { model: 'claude-opus-5-5', effort: 'medium', maxTokens: 2000, timeoutMs: 5000, maxRetries: 0, baseUrl: url, serverFallbacks: true, ...over };
}

const servers: { close(): Promise<void> }[] = [];
after(async () => { for (const s of servers) await s.close(); });

test('Anthropic provider returns validated structured output with usage', async () => {
  const srv = await mockServer(() => ({ json: anthropicMessage(JSON.stringify({ title: 'Hi', items: ['a', 'b'] })) }));
  servers.push(srv);
  const p = new AnthropicTextProvider(async () => KEY, () => anthropicCfg(srv.url));
  const r = await p.generateStructured({ schema: Schema, system: 'sys', prompt: 'make a list' });
  assert.deepEqual(r.data, { title: 'Hi', items: ['a', 'b'] });
  assert.equal(r.usage.inputTokens, 1200);
  const call = srv.calls[0];
  assert.equal(call.body.model, 'claude-opus-5-5');
  assert.equal(call.body.output_config.effort, 'medium');
  assert.equal(call.body.output_config.format.type, 'json_schema');
  assert.equal(call.headers.authorization, `Bearer ${KEY}`, 'SDK 1.x sends API keys as a bearer token');
  assert.equal(call.body.fallbacks, undefined, 'server fallbacks are only sent to api.anthropic.com');
});

test('Anthropic provider maps errors to typed, correctly classified ProviderErrors', async () => {
  const cases: [number | 'timeout' | 'refusal' | 'badjson', string, 'transient' | 'permanent'][] = [
    [429, 'rate_limit', 'transient'], [500, 'server', 'transient'], [529, 'server', 'transient'], [401, 'auth', 'permanent'],
    [400, 'bad_request', 'permanent'], ['timeout', 'timeout', 'transient'], ['refusal', 'refusal', 'permanent'], ['badjson', 'invalid_output', 'transient'],
  ];
  for (const [mode, kind, cls] of cases) {
    const srv = await mockServer(() => {
      if (mode === 'timeout') return { delayMs: 1500, json: anthropicMessage('{}') };
      if (mode === 'refusal') return { json: anthropicMessage('', { content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: 'x' } }) };
      if (mode === 'badjson') return { json: anthropicMessage('{"title": "x", "items": ["only one"]}') };
      return { status: mode, json: { type: 'error', error: { type: 'x', message: `boom ${KEY}` } } };
    });
    servers.push(srv);
    const p = new AnthropicTextProvider(async () => KEY, () => anthropicCfg(srv.url, { timeoutMs: 400 }));
    await assert.rejects(p.generateStructured({ schema: Schema, system: 's', prompt: 'p' }), (e: unknown) => {
      assert.ok(e instanceof ProviderError, `${mode}: ${String(e)}`);
      assert.equal(e.kind, kind, `mode ${mode}`);
      assert.equal(e.errorClass, cls, `mode ${mode}`);
      return true;
    });
  }
});

test('missing credentials are reported as unconfigured without any network call', async () => {
  const srv = await mockServer(() => ({ json: {} }));
  servers.push(srv);
  const p = new AnthropicTextProvider(async () => null, () => anthropicCfg(srv.url));
  assert.equal(await p.isConfigured(), false);
  await assert.rejects(p.generateStructured({ schema: Schema, system: 's', prompt: 'p' }), (e: unknown) => e instanceof ProviderError && e.kind === 'unconfigured');
  assert.equal(srv.calls.length, 0);
});

test('structuredCall re-asks on invalid output a bounded number of times and records every attempt without leaking the key', async () => {
  const srv = await mockServer((_b, i) => ({ json: anthropicMessage(i < 2 ? '{"nope": true}' : JSON.stringify({ title: 'ok', items: ['1', '2'] })) }));
  servers.push(srv);
  const secrets = new MemorySecretStore();
  await secrets.set('anthropic_api_key', KEY);
  const app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false, pacing: false });
  app.settings.update('generation', { textProvider: 'anthropic', fallbackOrder: [] }); // these tests stand in for Anthropic
  app.settings.update('generation', { invalidOutputRetries: 2, anthropic: { baseUrl: srv.url, maxRetries: 0 } });
  const r = await structuredCall(app, { purpose: 'test', schema: Schema, system: 's', prompt: 'p', trace: {} });
  assert.equal(r.data.title, 'ok');
  assert.equal(srv.calls.length, 3);
  const runs = app.db.all<{ status: string; error: string | null; cost_usd: number | null }>('SELECT status, error, cost_usd FROM generation_runs ORDER BY started_at');
  assert.deepEqual(runs.map((x) => x.status), ['failed', 'failed', 'succeeded']);
  assert.ok(runs[2].cost_usd! > 0, 'cost estimated from the price table');
  assert.ok(!JSON.stringify(runs).includes(KEY));

  const srv2 = await mockServer(() => ({ json: anthropicMessage('not json at all') }));
  servers.push(srv2);
  app.settings.update('generation', { invalidOutputRetries: 1, anthropic: { baseUrl: srv2.url } });
  await assert.rejects(structuredCall(app, { purpose: 'test', schema: Schema, system: 's', prompt: 'p', trace: {} }), (e: any) => e.code === 'ai_invalid_output' && e.errorClass === 'permanent');
  assert.equal(srv2.calls.length, 2);
  await app.close();
});

test('budget guard stops generation before the call when the cap would be exceeded', async () => {
  const srv = await mockServer(() => ({ json: anthropicMessage(JSON.stringify({ title: 'ok', items: ['1', '2'] })) }));
  servers.push(srv);
  const secrets = new MemorySecretStore();
  await secrets.set('anthropic_api_key', KEY);
  const app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false, pacing: false });
  app.settings.update('generation', { textProvider: 'anthropic', fallbackOrder: [] }); // these tests stand in for Anthropic
  app.settings.update('generation', { anthropic: { baseUrl: srv.url } });
  const budget = { check: () => { throw new ProviderError('budget', 'budget_exceeded', 'cap reached'); }, record: () => undefined };
  await assert.rejects(structuredCall(app, { purpose: 'test', schema: Schema, system: 's', prompt: 'p', trace: { budget } }), (e: any) => e.kind === 'budget_exceeded');
  assert.equal(srv.calls.length, 0);
  await app.close();
});

test('generation policy: deterministic fallback vs fail when AI is unconfigured', async () => {
  const app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  app.settings.update('generation', { textProvider: 'anthropic', fallbackOrder: [] }); // these tests stand in for Anthropic
  const def = productType('habit-tracker');
  const ctx = makeContext(def);
  const r = await generateContent(app, def, ctx, {});
  assert.equal(r.provenance.generator, 'deterministic');
  assert.match(String(r.provenance.note), /not configured/);
  app.settings.update('generation', { unconfiguredPolicy: 'fail' });
  await assert.rejects(generateContent(app, def, ctx, {}), (e: any) => e instanceof ProviderError && e.kind === 'unconfigured');
  await app.close();
});

test('AI content flows through to the product with provenance', async () => {
  const srv = await mockServer(() => ({ json: anthropicMessage(JSON.stringify({ coverSubtitle: 'Tiny steps', habits: ['Walk', 'Read daily', 'Drink water', 'Stretch', 'Journal'], reflectionPrompt: 'What helped most?' })) }));
  servers.push(srv);
  const secrets = new MemorySecretStore();
  await secrets.set('anthropic_api_key', KEY);
  const app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false, pacing: false });
  app.settings.update('generation', { textProvider: 'anthropic', fallbackOrder: [] }); // these tests stand in for Anthropic
  app.settings.update('generation', { anthropic: { baseUrl: srv.url } });
  const def = productType('habit-tracker');
  const r = await generateContent(app, def, makeContext(def, { audience: 'Students' }), {});
  assert.equal(r.provenance.generator, 'anthropic');
  assert.equal(r.provenance.model, 'claude-opus-5-5');
  assert.equal((r.content as any).habits.length, 5);
  assert.match(srv.calls[0].body.messages[0].content, /Students/);
  await app.close();
});

test('OpenAI image provider: success, retry after rate limit, refusal and invalid image', async () => {
  const png = lineArtPng(64, 96);
  const srv = await mockServer((_b, i, path) => {
    if (path.includes('policy')) return { status: 400, json: { error: { code: 'content_policy_violation', message: 'rejected by safety system' } } };
    if (path.includes('garbage')) return { json: { data: [{ b64_json: Buffer.from('not a png').toString('base64') }] } };
    if (i === 0) return { status: 429, json: { error: { message: 'slow down' } } };
    return { json: { data: [{ b64_json: png.toString('base64') }] } };
  });
  servers.push(srv);
  const cfg = (base: string): Settings['generation']['openai'] => ({ imageModel: 'gpt-image-1', baseUrl: base, timeoutMs: 5000, maxRetries: 2, quality: 'high' });
  const noSleep = async () => undefined;
  const ok = await new OpenAIImageProvider(async () => 'sk-openai-test-123456789', () => cfg(srv.url), noSleep).generateImage({ prompt: 'a fox', size: 'portrait' });
  assert.deepEqual([ok.widthPx, ok.heightPx], [64, 96]);
  assert.equal(srv.calls.length, 2, 'retried once after 429');
  assert.equal(srv.calls[1].headers.authorization, 'Bearer sk-openai-test-123456789');
  assert.equal(srv.calls[1].body.size, '1024x1536');
  await assert.rejects(new OpenAIImageProvider(async () => 'sk-openai-test-123456789', () => cfg(`${srv.url}/policy`), noSleep).generateImage({ prompt: 'x', size: 'square' }), (e: any) => e.kind === 'refusal');
  await assert.rejects(new OpenAIImageProvider(async () => 'sk-openai-test-123456789', () => cfg(`${srv.url}/garbage`), noSleep).generateImage({ prompt: 'x', size: 'square' }), (e: any) => e.kind === 'invalid_output');
  await assert.rejects(new OpenAIImageProvider(async () => null, () => cfg(srv.url), noSleep).generateImage({ prompt: 'x', size: 'square' }), (e: any) => e.kind === 'unconfigured');
});
