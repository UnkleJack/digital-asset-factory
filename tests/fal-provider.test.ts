import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { FalImageProvider } from '../src/engine/generation/providers.ts';
import { ProviderError } from '../src/core/errors.ts';
import { mockServer, lineArtPng } from './mockServers.ts';

const servers: { close(): Promise<void> }[] = [];
after(async () => {
  for (const s of servers) await s.close();
});

const testPng = lineArtPng(256, 256);

// Error bodies copied from the shapes Fal really sends: the reason is in `detail`, not `error.message`.
const OUT_OF_BALANCE = { detail: 'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.' };

test('FalImageProvider: sends "Key" auth to the configured base URL and returns the image', async () => {
  const srv = await mockServer((_body, _i, path) => {
    if (path.includes('download-img')) return { headers: { 'content-type': 'image/png' }, raw: testPng };
    return { json: { images: [{ url: `${srv.url}/download-img` }] } };
  });
  servers.push(srv);

  const p = new FalImageProvider(async () => 'fal-id:fal-secret', () => ({ model: 'flux/schnell', baseUrl: `${srv.url}/fal-ai/`, timeoutMs: 5000, maxRetries: 0 }), async () => {});
  const res = await p.generateImage({ prompt: 'A coloring page of a castle', size: 'square' });

  assert.equal(res.widthPx, 256);
  assert.equal(res.model, 'flux/schnell');
  const call = srv.calls[0]!;
  assert.equal(call.path, '/fal-ai/flux/schnell', 'base URL is honoured and the trailing slash is not doubled');
  assert.equal(call.headers.authorization, 'Key fal-id:fal-secret', 'Fal uses the "Key" scheme, not "Bearer"');
  assert.equal(call.body.image_size, 'square_hd');
});

test('FalImageProvider: an exhausted balance is out of credit, not a rejected key, and shows Fal\'s reason', async () => {
  const srv = await mockServer((_body, _i, path) => {
    if (path.includes('broke')) return { status: 403, json: OUT_OF_BALANCE };
    if (path.includes('bad-key')) return { status: 401, json: { detail: 'Invalid API key' } };
    if (path.includes('slow-down')) return { status: 429, json: { detail: 'Too many requests' } };
    if (path.includes('invalid')) return { status: 422, json: { detail: [{ loc: ['body', 'prompt'], msg: 'Field required', type: 'missing' }] } };
    return { json: {} };
  });
  servers.push(srv);
  const make = (sub: string) => new FalImageProvider(async () => 'fal-id:fal-secret', () => ({ model: 'm', baseUrl: `${srv.url}/${sub}`, timeoutMs: 5000, maxRetries: 0 }), async () => {});

  await assert.rejects(make('broke').generateImage({ prompt: 'x', size: 'square' }), (e: any) => {
    assert.ok(e instanceof ProviderError);
    assert.equal(e.kind, 'budget_exceeded');
    assert.match(e.message, /Exhausted balance/);
    assert.doesNotMatch(e.message, /Key rejected/);
    return true;
  });
  await assert.rejects(make('bad-key').generateImage({ prompt: 'x', size: 'square' }), (e: any) => e.kind === 'auth' && /Invalid API key/.test(e.message));
  await assert.rejects(make('slow-down').generateImage({ prompt: 'x', size: 'square' }), (e: any) => e.kind === 'rate_limit');
  await assert.rejects(make('invalid').generateImage({ prompt: 'x', size: 'square' }), (e: any) => e.kind === 'bad_request' && /Field required/.test(e.message));
  await assert.rejects(make('empty').generateImage({ prompt: 'x', size: 'square' }), (e: any) => e.kind === 'invalid_output');
});

test('FalImageProvider: no key means unconfigured, with no network call', async () => {
  const p = new FalImageProvider(async () => null, () => ({ model: 'm', baseUrl: 'http://127.0.0.1:9/fal-ai', timeoutMs: 5000, maxRetries: 0 }), async () => {});
  assert.equal(await p.isConfigured(), false);
  await assert.rejects(p.generateImage({ prompt: 'x', size: 'square' }), (e: any) => e.kind === 'unconfigured');
});
