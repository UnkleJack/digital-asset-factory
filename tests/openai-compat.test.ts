// Covers the alternative free-tier text providers (OpenRouter, Groq, NVIDIA NIM, Cerebras,
// Together AI) that all speak the same OpenAI-compatible /chat/completions shape, and the
// router that lets Settings → Generation → Text provider switch between all of them plus
// Anthropic without anything else in the app knowing which one is active.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { OpenAICompatibleTextProvider, RoutedTextProvider, AnthropicTextProvider, type TextProvider, type AiTextProviderId } from '../src/engine/generation/providers.ts';
import { structuredCall, generateContent } from '../src/engine/generation/service.ts';
import { ProviderError } from '../src/core/errors.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { bootstrap } from '../src/app/bootstrap.ts';
import { productType } from '../src/engine/producttypes/registry.ts';
import { mockServer, anthropicMessage } from './mockServers.ts';
import { tempDir, makeContext } from './helpers.ts';
import type { Settings } from '../src/config/settings.ts';

const KEY = 'test-openrouter-key-1234567890';
const Schema = z.object({ title: z.string(), items: z.array(z.string()).min(2) });

function cfg(url: string, over: Partial<Settings['generation']['openrouter']> = {}): Settings['generation']['openrouter'] {
  return { model: 'meta-llama/llama-3.3-70b-instruct:free', baseUrl: url, timeoutMs: 5000, maxRetries: 0, ...over };
}

function chatCompletion(content: string, extra: Record<string, unknown> = {}) {
  return { id: 'chatcmpl_test', model: 'meta-llama/llama-3.3-70b-instruct:free', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 300, completion_tokens: 120 }, ...extra };
}

const servers: { close(): Promise<void> }[] = [];
after(async () => { for (const s of servers) await s.close(); });

test('OpenAI-compatible provider (OpenRouter/Groq/NVIDIA/Cerebras/Together) returns validated structured output with usage', async () => {
  const srv = await mockServer(() => ({ json: chatCompletion(JSON.stringify({ title: 'Hi', items: ['a', 'b'] })) }));
  servers.push(srv);
  const p = new OpenAICompatibleTextProvider('openrouter', async () => KEY, () => cfg(srv.url));
  const r = await p.generateStructured({ schema: Schema, system: 'sys', prompt: 'make a list' });
  assert.deepEqual(r.data, { title: 'Hi', items: ['a', 'b'] });
  assert.equal(r.usage.inputTokens, 300);
  assert.equal(r.usage.outputTokens, 120);
  assert.equal(r.model, 'meta-llama/llama-3.3-70b-instruct:free');
  const call = srv.calls[0];
  assert.equal(call.path, '/chat/completions');
  assert.equal(call.headers.authorization, `Bearer ${KEY}`);
  assert.equal(call.body.model, 'meta-llama/llama-3.3-70b-instruct:free');
  assert.equal(call.body.response_format.type, 'json_object');
  assert.match(call.body.messages[0].content, /JSON Schema/);
  assert.match(call.body.messages[0].content, /"title"/, 'the Zod schema is spelled out for the model since json_schema mode is not assumed');
});

test('a ```json code fence around the response is stripped before parsing', async () => {
  const srv = await mockServer(() => ({ json: chatCompletion('```json\n' + JSON.stringify({ title: 'Hi', items: ['a', 'b'] }) + '\n```') }));
  servers.push(srv);
  const p = new OpenAICompatibleTextProvider('groq', async () => KEY, () => cfg(srv.url));
  const r = await p.generateStructured({ schema: Schema, system: 'sys', prompt: 'make a list' });
  assert.deepEqual(r.data, { title: 'Hi', items: ['a', 'b'] });
});

test('OpenAI-compatible provider maps errors to typed, correctly classified ProviderErrors', async () => {
  const cases: [number | 'timeout' | 'badjson' | 'empty' | 'cutoff', string, 'transient' | 'permanent'][] = [
    [429, 'rate_limit', 'transient'], [500, 'server', 'transient'], [401, 'auth', 'permanent'], [403, 'auth', 'permanent'],
    [400, 'bad_request', 'permanent'], ['timeout', 'timeout', 'transient'], ['badjson', 'invalid_output', 'transient'],
    ['empty', 'invalid_output', 'transient'], ['cutoff', 'invalid_output', 'transient'],
  ];
  for (const [mode, kind, cls] of cases) {
    const srv = await mockServer(() => {
      if (mode === 'timeout') return { delayMs: 1500, json: chatCompletion('{}') };
      if (mode === 'badjson') return { json: chatCompletion('{"title": "x", "items": ["only one"]}') };
      if (mode === 'empty') return { json: chatCompletion('') };
      if (mode === 'cutoff') return { json: chatCompletion('{"title":', { choices: [{ message: { content: '{"title":' }, finish_reason: 'length' }] }) };
      return { status: mode, json: { error: { message: `boom ${KEY}` } } };
    });
    servers.push(srv);
    const p = new OpenAICompatibleTextProvider('nvidia', async () => KEY, () => cfg(srv.url, { timeoutMs: 400 }));
    await assert.rejects(p.generateStructured({ schema: Schema, system: 's', prompt: 'p' }), (e: unknown) => {
      assert.ok(e instanceof ProviderError, `${mode}: ${String(e)}`);
      assert.equal(e.kind, kind, `mode ${mode}`);
      assert.equal(e.errorClass, cls, `mode ${mode}`);
      assert.equal(e.provider, 'nvidia');
      return true;
    });
  }
});

test('missing credentials are reported as unconfigured without any network call (OpenAI-compatible)', async () => {
  const srv = await mockServer(() => ({ json: {} }));
  servers.push(srv);
  const p = new OpenAICompatibleTextProvider('cerebras', async () => null, () => cfg(srv.url));
  assert.equal(await p.isConfigured(), false);
  await assert.rejects(p.generateStructured({ schema: Schema, system: 's', prompt: 'p' }), (e: unknown) => e instanceof ProviderError && e.kind === 'unconfigured');
  assert.equal(srv.calls.length, 0);
});

test('RoutedTextProvider dispatches by the active provider id and falls back to anthropic for an unknown id', async () => {
  const anthropicSrv = await mockServer(() => ({ json: anthropicMessage(JSON.stringify({ title: 'from anthropic', items: ['a', 'b'] })) }));
  const groqSrv = await mockServer(() => ({ json: chatCompletion(JSON.stringify({ title: 'from groq', items: ['a', 'b'] })) }));
  servers.push(anthropicSrv, groqSrv);
  const anthropic = new AnthropicTextProvider(async () => 'sk-ant-test', () => ({ model: 'claude-opus-5-5', effort: 'medium', maxTokens: 2000, timeoutMs: 5000, maxRetries: 0, baseUrl: anthropicSrv.url, serverFallbacks: true }));
  const groq = new OpenAICompatibleTextProvider('groq', async () => KEY, () => cfg(groqSrv.url));
  let active: AiTextProviderId = 'groq';
  const router = new RoutedTextProvider({ anthropic, groq } as unknown as Record<AiTextProviderId, TextProvider>, () => active);
  assert.equal(router.id, 'groq');
  const r1 = await router.generateStructured({ schema: Schema, system: 's', prompt: 'p' });
  assert.equal(r1.data.title, 'from groq');
  active = 'anthropic';
  assert.equal(router.id, 'anthropic');
  const r2 = await router.generateStructured({ schema: Schema, system: 's', prompt: 'p' });
  assert.equal(r2.data.title, 'from anthropic');
  active = 'cerebras'; // not registered in this test's provider map
  assert.equal(router.id, 'anthropic', 'falls back to anthropic rather than throwing');
});

test('switching Settings → Generation → Text provider changes which API structuredCall and generateContent use, with honest provenance', async () => {
  const srv = await mockServer(() => ({ json: chatCompletion(JSON.stringify({ coverSubtitle: 'Free-tier content', habits: ['Walk', 'Read daily', 'Drink water', 'Stretch', 'Journal'], reflectionPrompt: 'What helped most?' })) }));
  servers.push(srv);
  const secrets = new MemorySecretStore();
  await secrets.set('openrouter_api_key', KEY);
  const app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false, pacing: false });
  app.settings.update('generation', { textProvider: 'openrouter', openrouter: { baseUrl: srv.url } });
  assert.equal(app.providers.text.id, 'openrouter');
  assert.equal(await app.providers.text.isConfigured(), true);

  const def = productType('habit-tracker');
  const r = await generateContent(app, def, makeContext(def, { audience: 'Students' }), {});
  assert.equal(r.provenance.generator, 'openrouter');
  assert.equal(r.provenance.model, 'meta-llama/llama-3.3-70b-instruct:free');
  assert.equal((r.content as any).habits.length, 5);

  const runs = app.db.all<{ provider: string }>('SELECT provider FROM generation_runs ORDER BY started_at');
  assert.ok(runs.every((x) => x.provider === 'openrouter'), 'generation_runs records which backend actually ran, not always anthropic');

  // Switching the active provider changes which backend structuredCall actually calls.
  app.settings.update('generation', { textProvider: 'anthropic', fallbackOrder: [] });
  assert.equal(app.providers.text.id, 'anthropic');
  await assert.rejects(structuredCall(app, { purpose: 'test', schema: Schema, system: 's', prompt: 'p', trace: {} }), (e: unknown) => e instanceof ProviderError && e.kind === 'unconfigured', 'no Anthropic key is configured in this test');
  await app.close();
});

test('a model that rejects JSON mode is asked again without response_format, without using up a retry', async () => {
  const srv = await mockServer((body) => body.response_format
    ? { status: 400, json: { error: { message: 'response_format json_object is not supported by this model' } } }
    : { json: chatCompletion(JSON.stringify({ title: 'Hi', items: ['a', 'b'] })) });
  servers.push(srv);
  const p = new OpenAICompatibleTextProvider('openrouter', async () => KEY, () => cfg(srv.url));
  const r = await p.generateStructured({ schema: Schema, system: 'sys', prompt: 'p' });
  assert.deepEqual(r.data, { title: 'Hi', items: ['a', 'b'] });
  assert.equal(srv.calls.length, 2);
  assert.equal(srv.calls[1].body.response_format, undefined);
});

test('every AI key in Settings has a link to where the key is created', async () => {
  const { SECRET_KEY_LINKS } = await import('../src/engine/generation/providers.ts');
  for (const name of ['anthropic_api_key', 'openai_api_key', 'openrouter_api_key', 'groq_api_key', 'nvidia_api_key', 'cerebras_api_key', 'together_api_key', 'gemini_api_key', 'mistral_api_key', 'github_models_token', 'huggingface_token'] as const) {
    assert.match(SECRET_KEY_LINKS[name]?.url ?? '', /^https:\/\//, name);
  }
  assert.equal(SECRET_KEY_LINKS.groq_api_key?.free, true);
  assert.equal(SECRET_KEY_LINKS.anthropic_api_key?.free, false);
});

test('a rate-limited or keyless provider falls through to the next backup, and records which one answered', async () => {
  const limited = await mockServer(() => ({ status: 429, json: { error: { message: 'rate limit reached for today' } } }));
  const ok = await mockServer(() => ({ json: chatCompletion(JSON.stringify({ title: 'from backup', items: ['a', 'b'] }), { model: 'llama-3.3-70b' }) }));
  servers.push(limited, ok);
  const secrets = new MemorySecretStore();
  await secrets.set('groq_api_key', KEY);
  await secrets.set('cerebras_api_key', KEY);
  const app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false, pacing: false });
  // openrouter is selected but has no key; groq is capped; cerebras answers.
  app.settings.update('generation', { textProvider: 'openrouter', fallbackOrder: ['groq', 'cerebras', 'anthropic'], groq: { baseUrl: limited.url, maxRetries: 0 }, cerebras: { baseUrl: ok.url } });
  assert.equal(await app.providers.text.isConfigured(), true, 'configured when any provider in the chain has a key');
  const r = await structuredCall(app, { purpose: 'test', schema: Schema, system: 's', prompt: 'p', trace: {} });
  assert.equal(r.data.title, 'from backup');
  assert.equal(r.provenance.generator, 'cerebras');
  assert.equal(r.provenance.servedByFallback, true);
  assert.equal(limited.calls.length, 1);
  assert.deepEqual(app.db.all<{ provider: string; status: string }>('SELECT provider, status FROM generation_runs').map((x) => x.provider), ['cerebras']);

  // Invalid output is not a reason to switch providers; structuredCall re-asks the same one.
  const bad = await mockServer(() => ({ json: chatCompletion('{"title":"x","items":["only one"]}') }));
  servers.push(bad);
  app.settings.update('generation', { textProvider: 'cerebras', fallbackOrder: ['groq'], cerebras: { baseUrl: bad.url }, invalidOutputRetries: 1 });
  await assert.rejects(structuredCall(app, { purpose: 'test', schema: Schema, system: 's', prompt: 'p', trace: {} }), /invalid structured output/);
  assert.equal(bad.calls.length, 2);
  assert.equal(limited.calls.length, 1, 'the backup was not called for invalid output');
  await app.close();
});

test('a paid provider is never an automatic backup unless allowed, and budgets price the dearest backup', async () => {
  const limited = await mockServer(() => ({ status: 429, json: { error: { message: 'rate limit reached for today' } } }));
  const paid = await mockServer(() => ({ json: anthropicMessage(JSON.stringify({ title: 'paid', items: ['a', 'b'] })) }));
  servers.push(limited, paid);
  const secrets = new MemorySecretStore();
  await secrets.set('groq_api_key', KEY);
  await secrets.set('anthropic_api_key', 'sk-ant-test-paid-123456');
  const app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false, pacing: false });
  app.settings.update('generation', { textProvider: 'groq', fallbackOrder: ['anthropic'], groq: { baseUrl: limited.url, maxRetries: 0 }, anthropic: { baseUrl: paid.url, maxRetries: 0 } });
  await assert.rejects(structuredCall(app, { purpose: 'test', schema: Schema, system: 's', prompt: 'p', trace: {} }), /rate limit/);
  assert.equal(paid.calls.length, 0, 'Anthropic was not used as a backup');

  app.settings.update('generation', { allowPaidFallback: true });
  const checks: (number | null)[] = [];
  const budget = { check: (usd: number | null) => { checks.push(usd); if ((usd ?? 0) > 0) throw new ProviderError('budget', 'budget_exceeded', 'cost limit'); }, record: () => {} };
  await assert.rejects(structuredCall(app, { purpose: 'test', schema: Schema, system: 's', prompt: 'p', trace: { budget } }), /cost limit/);
  assert.ok((checks[0] ?? 0) > 0, 'the estimate uses the paid backup\'s price, not the free first choice');
  assert.equal(limited.calls.length, 1, 'a $0 budget stops the call before any provider is asked');
  assert.equal(paid.calls.length, 0);
  await app.close();
});

test('pacing: a provider at its daily limit or cooling down after a rate limit is skipped; calls are spaced out', async () => {
  const { Pacer } = await import('../src/engine/generation/pacing.ts');
  let t = Date.parse('2026-10-24T10:00:00Z');
  const slept: number[] = [];
  const counts: Record<string, number> = { groq: 0 };
  const cfg = { minSecondsBetweenCalls: 2, dailyCallLimits: { groq: 3 } as Record<string, number>, cooldownMinutes: 15 };
  const pacer = new Pacer(() => cfg, (p, since) => { assert.equal(since, '2026-10-24T00:00:00.000Z'); return counts[p] ?? 0; }, () => t, async (ms) => { slept.push(ms); });
  await pacer.wait('groq');
  await pacer.wait('groq');
  await pacer.wait('cerebras');
  assert.deepEqual(slept, [2000], 'second groq call waits 2s; another provider does not');
  counts.groq = 3;
  assert.match(pacer.blocked('groq')!, /today's limit of 3/);
  assert.equal(pacer.blocked('cerebras'), null);
  pacer.rateLimited('cerebras');
  assert.match(pacer.blocked('cerebras')!, /cooling down/);
  t += 16 * 60_000;
  assert.equal(pacer.blocked('cerebras'), null, 'cool-down ends');

  // Through the router: Groq is at its limit, so Cerebras answers without Groq being called.
  const groqSrv = await mockServer(() => ({ json: chatCompletion(JSON.stringify({ title: 'groq', items: ['a', 'b'] })) }));
  const cerebrasSrv = await mockServer(() => ({ json: chatCompletion(JSON.stringify({ title: 'cerebras', items: ['a', 'b'] })) }));
  servers.push(groqSrv, cerebrasSrv);
  const secrets = new MemorySecretStore();
  await secrets.set('groq_api_key', KEY);
  await secrets.set('cerebras_api_key', KEY);
  const app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false });
  app.settings.update('generation', { textProvider: 'groq', fallbackOrder: ['cerebras'], groq: { baseUrl: groqSrv.url }, cerebras: { baseUrl: cerebrasSrv.url }, pacing: { minSecondsBetweenCalls: 0, dailyCallLimits: { groq: 1 } } });
  assert.equal((await structuredCall(app, { purpose: 'test', schema: Schema, system: 's', prompt: 'p', trace: {} })).data.title, 'groq');
  assert.equal((await structuredCall(app, { purpose: 'test', schema: Schema, system: 's', prompt: 'p', trace: {} })).data.title, 'cerebras');
  assert.equal(groqSrv.calls.length, 1);
  await app.close();
});
