import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  OpenAIImageProvider,
  TogetherImageProvider,
  HuggingFaceImageProvider,
  PollinationsImageProvider,
  RoutedImageProvider,
  ImagePacer,
  imageSize,
  type ImageProvider,
  type ImageResult,
} from '../src/engine/generation/providers.ts';
import { ProviderError } from '../src/core/errors.ts';
import { mockServer, lineArtPng } from './mockServers.ts';
import { tempDir, makeContext } from './helpers.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { bootstrap } from '../src/app/bootstrap.ts';
import { productType } from '../src/engine/producttypes/registry.ts';
import { imageGeneratorFor } from '../src/engine/generation/service.ts';
import { ImageTournament, type TournamentModel } from '../src/engine/generation/tournament.ts';

const servers: { close(): Promise<void> }[] = [];
after(async () => {
  for (const s of servers) await s.close();
});

const testPng = lineArtPng(256, 256);

function makeFakeJpeg(width = 120, height = 80): Buffer {
  const buf = Buffer.alloc(30);
  buf[0] = 0xff;
  buf[1] = 0xd8; // SOI
  buf[2] = 0xff;
  buf[3] = 0xc0; // SOF0
  buf.writeUInt16BE(17, 4); // length
  buf[6] = 8; // precision
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  buf[11] = 3; // components
  buf[28] = 0xff;
  buf[29] = 0xd9; // EOI
  return buf;
}

test('imageSize parses PNG, JPEG, and rejects garbage', () => {
  const pngDims = imageSize(testPng);
  assert.deepEqual(pngDims, { width: 256, height: 256 });

  const fakeJpg = makeFakeJpeg(320, 240);
  const jpgDims = imageSize(fakeJpg);
  assert.deepEqual(jpgDims, { width: 320, height: 240 });

  assert.equal(imageSize(Buffer.from('not an image at all')), null);
  assert.equal(imageSize(Buffer.alloc(10)), null);
});

test('TogetherImageProvider: handles b64_json, url, and errors', async () => {
  const srv = await mockServer((_body, i, path) => {
    if (path.includes('rate-limit')) return { status: 429, json: { error: { message: 'Too many requests' } } };
    if (path.includes('auth-fail')) return { status: 401, json: { error: { message: 'Invalid token' } } };
    if (path.includes('url-mode')) return { json: { data: [{ url: `${srv.url}/download-img` }] } };
    if (path.includes('download-img')) return { headers: { 'content-type': 'image/png' }, raw: testPng };
    return { json: { data: [{ b64_json: testPng.toString('base64') }] } };
  });
  servers.push(srv);

  const cfg = (url: string) => ({
    model: 'black-forest-labs/FLUX.1-schnell-Free',
    baseUrl: url,
    timeoutMs: 5000,
    maxRetries: 0,
  });

  const p = new TogetherImageProvider(async () => 'together-key-123', () => cfg(srv.url), async () => {});
  const res = await p.generateImage({ prompt: 'A coloring book page of a castle', size: 'square' });
  assert.equal(res.widthPx, 256);
  assert.equal(res.heightPx, 256);
  assert.equal(res.model, 'black-forest-labs/FLUX.1-schnell-Free');

  // Rate limit error classification
  const pRate = new TogetherImageProvider(async () => 'together-key-123', () => cfg(`${srv.url}/rate-limit`), async () => {});
  await assert.rejects(pRate.generateImage({ prompt: 'test', size: 'square' }), (e: any) => e instanceof ProviderError && e.kind === 'rate_limit');

  // Unconfigured without key
  const pUnconf = new TogetherImageProvider(async () => null, () => cfg(srv.url), async () => {});
  assert.equal(await pUnconf.isConfigured(), false);
  await assert.rejects(pUnconf.generateImage({ prompt: 'test', size: 'square' }), (e: any) => e.kind === 'unconfigured');
});

test('HuggingFaceImageProvider: generates images from raw bytes and handles rate limits', async () => {
  const srv = await mockServer((_body, _i, path) => {
    if (path.includes('rate-limit')) return { status: 429, json: { error: 'Rate limit exceeded' } };
    if (path.includes('unauthorized')) return { status: 403, json: { error: 'Invalid token' } };
    return { headers: { 'content-type': 'image/png' }, raw: testPng };
  });
  servers.push(srv);

  const cfg = (url: string) => ({
    model: 'black-forest-labs/FLUX.1-schnell',
    baseUrl: url,
    timeoutMs: 5000,
    maxRetries: 0,
  });

  const p = new HuggingFaceImageProvider(async () => 'hf_test_token', () => cfg(srv.url), async () => {});
  const res = await p.generateImage({ prompt: 'Forest animal coloring page', size: 'portrait' });
  assert.equal(res.widthPx, 256);
  assert.equal(res.heightPx, 256);

  const pRate = new HuggingFaceImageProvider(async () => 'hf_test_token', () => cfg(`${srv.url}/rate-limit`), async () => {});
  await assert.rejects(pRate.generateImage({ prompt: 'test', size: 'portrait' }), (e: any) => e.kind === 'rate_limit');
});

test('PollinationsImageProvider: always configured, free fallback without keys', async () => {
  const srv = await mockServer(() => ({
    headers: { 'content-type': 'image/png' },
    raw: testPng,
  }));
  servers.push(srv);

  const p = new PollinationsImageProvider(() => ({
    model: 'flux',
    baseUrl: srv.url,
    timeoutMs: 5000,
    maxRetries: 0,
  }), async () => {});

  assert.equal(await p.isConfigured(), true);
  const res = await p.generateImage({ prompt: 'Zen garden line art', size: 'landscape' });
  assert.equal(res.widthPx, 256);
  assert.equal(res.heightPx, 256);
  assert.equal(res.model, 'flux');
});

test('RoutedImageProvider: cascading fallback on 429 rate limit to free providers', async () => {
  // Provider A (OpenAI) returns 429 rate limit
  // Provider B (Together AI) returns 429 rate limit
  // Provider C (Pollinations) succeeds
  let openAiCalls = 0;
  let togetherCalls = 0;
  let pollinationsCalls = 0;

  const mockOpenAI: ImageProvider = {
    id: 'openai',
    isConfigured: async () => true,
    model: () => 'gpt-image-1',
    generateImage: async () => {
      openAiCalls++;
      throw new ProviderError('openai', 'rate_limit', 'Rate limit reached: 0 RPM remaining');
    },
  };

  const mockTogether: ImageProvider = {
    id: 'together',
    isConfigured: async () => true,
    model: () => 'black-forest-labs/FLUX.1-schnell-Free',
    generateImage: async () => {
      togetherCalls++;
      throw new ProviderError('together', 'rate_limit', 'Together free limit reached');
    },
  };

  const mockPollinations: ImageProvider = {
    id: 'pollinations',
    isConfigured: async () => true,
    model: () => 'flux',
    generateImage: async () => {
      pollinationsCalls++;
      return {
        png: testPng,
        widthPx: 256,
        heightPx: 256,
        usage: { inputTokens: null, outputTokens: null, images: 1 },
        model: 'flux',
      };
    },
  };

  const fallbackEvents: { from: string; err: any }[] = [];
  const pacer = new ImagePacer();

  const router = new RoutedImageProvider(
    { openai: mockOpenAI, together: mockTogether, pollinations: mockPollinations },
    () => 'openai',
    () => ['together', 'pollinations'],
    (from, err) => fallbackEvents.push({ from, err }),
    () => true,
    pacer,
  );

  const result = await router.generateImage({ prompt: 'Mandala line art', size: 'square' });

  assert.equal(openAiCalls, 1, 'Tried primary provider once');
  assert.equal(togetherCalls, 1, 'Tried secondary backup provider once');
  assert.equal(pollinationsCalls, 1, 'Fell through to Pollinations which succeeded');
  assert.equal(result.provider, 'pollinations');
  assert.equal(result.servedByFallback, true);
  assert.equal(fallbackEvents.length, 2, 'Logged 2 fallback transitions');
});

test('RoutedImageProvider: Pacer cooldown skips rate-limited provider on subsequent calls', async () => {
  let openAiAttempts = 0;
  let backupAttempts = 0;

  const mockOpenAI: ImageProvider = {
    id: 'openai',
    isConfigured: async () => true,
    model: () => 'gpt-image-1',
    generateImage: async () => {
      openAiAttempts++;
      throw new ProviderError('openai', 'rate_limit', 'Too many requests');
    },
  };

  const mockBackup: ImageProvider = {
    id: 'pollinations',
    isConfigured: async () => true,
    model: () => 'flux',
    generateImage: async () => {
      backupAttempts++;
      return {
        png: testPng,
        widthPx: 256,
        heightPx: 256,
        usage: { inputTokens: null, outputTokens: null, images: 1 },
        model: 'flux',
      };
    },
  };

  const pacer = new ImagePacer();
  const router = new RoutedImageProvider(
    { openai: mockOpenAI, pollinations: mockBackup },
    () => 'openai',
    () => ['pollinations'],
    () => {},
    () => true,
    pacer,
  );

  // Call 1: Hits OpenAI -> 429 -> Paced -> Falls back to Pollinations
  const r1 = await router.generateImage({ prompt: 'Page 1', size: 'square' });
  assert.equal(r1.provider, 'pollinations');
  assert.equal(openAiAttempts, 1);
  assert.equal(backupAttempts, 1);

  // Call 2: OpenAI is in cooldown! Router must skip it immediately without attempting it!
  const r2 = await router.generateImage({ prompt: 'Page 2', size: 'square' });
  assert.equal(r2.provider, 'pollinations');
  assert.equal(openAiAttempts, 1, 'OpenAI was NOT called again because Pacer cooldown blocked it');
  assert.equal(backupAttempts, 2);
});

test('RoutedImageProvider: Paid fallback protection respects allowPaidFallback setting', async () => {
  const mockFreePrimary: ImageProvider = {
    id: 'gemini',
    isConfigured: async () => true,
    model: () => 'gemini-free',
    generateImage: async () => { throw new ProviderError('gemini', 'rate_limit', 'Free quota reached'); },
  };

  const mockPaidBackup: ImageProvider = {
    id: 'openai',
    isConfigured: async () => true,
    model: () => 'gpt-image-1',
    generateImage: async () => ({
      png: testPng,
      widthPx: 256,
      heightPx: 256,
      usage: { inputTokens: null, outputTokens: null, images: 1 },
      model: 'gpt-image-1',
    }),
  };

  // With allowPaidFallback: false -> paid backup must be excluded
  const strictRouter = new RoutedImageProvider(
    { gemini: mockFreePrimary, openai: mockPaidBackup },
    () => 'gemini',
    () => ['openai'],
    () => {},
    () => false,
  );
  assert.deepEqual(strictRouter.chain().map((p) => p.id), ['gemini'], 'OpenAI omitted from chain because it is paid');
  await assert.rejects(strictRouter.generateImage({ prompt: 'test', size: 'square' }));

  // With allowPaidFallback: true -> paid backup allowed
  const lenientRouter = new RoutedImageProvider(
    { gemini: mockFreePrimary, openai: mockPaidBackup },
    () => 'gemini',
    () => ['openai'],
    () => {},
    () => true,
  );
  assert.deepEqual(lenientRouter.chain().map((p) => p.id), ['gemini', 'openai']);
  const res = await lenientRouter.generateImage({ prompt: 'test', size: 'square' });
  assert.equal(res.provider, 'openai');
});

test('Stress Test: High-concurrency generation (50 concurrent calls) with randomized rate limits', async () => {
  let primaryHits = 0;
  let secondaryHits = 0;
  let tertiaryHits = 0;

  // Primary fails 60% of the time with 429
  const flakyPrimary: ImageProvider = {
    id: 'together',
    isConfigured: async () => true,
    model: () => 'FLUX-Free',
    generateImage: async () => {
      primaryHits++;
      if (Math.random() < 0.6) {
        throw new ProviderError('together', 'rate_limit', 'Rate limited');
      }
      return { png: testPng, widthPx: 256, heightPx: 256, usage: { inputTokens: null, outputTokens: null, images: 1 }, model: 'FLUX-Free' };
    },
  };

  // Secondary fails 40% of the time with 429
  const flakySecondary: ImageProvider = {
    id: 'huggingface',
    isConfigured: async () => true,
    model: () => 'FLUX-schnell',
    generateImage: async () => {
      secondaryHits++;
      if (Math.random() < 0.4) {
        throw new ProviderError('huggingface', 'rate_limit', 'HF Rate limit');
      }
      return { png: testPng, widthPx: 256, heightPx: 256, usage: { inputTokens: null, outputTokens: null, images: 1 }, model: 'FLUX-schnell' };
    },
  };

  // Tertiary is rock-solid Pollinations: 100% success rate
  const solidTertiary: ImageProvider = {
    id: 'pollinations',
    isConfigured: async () => true,
    model: () => 'flux',
    generateImage: async () => {
      tertiaryHits++;
      return { png: testPng, widthPx: 256, heightPx: 256, usage: { inputTokens: null, outputTokens: null, images: 1 }, model: 'flux' };
    },
  };

  const router = new RoutedImageProvider(
    { together: flakyPrimary, huggingface: flakySecondary, pollinations: solidTertiary },
    () => 'together',
    () => ['huggingface', 'pollinations'],
    () => {},
    () => true,
  );

  // Launch 50 concurrent requests
  const promises = Array.from({ length: 50 }, (_, i) =>
    router.generateImage({ prompt: `Stress test item #${i + 1}`, size: 'square' })
  );

  const results = await Promise.all(promises);

  assert.equal(results.length, 50, 'All 50 images succeeded');
  for (const r of results) {
    assert.ok(r.png && r.png.length > 0, 'Returned valid PNG buffer');
    assert.ok(['together', 'huggingface', 'pollinations'].includes(r.provider!), 'Valid provider attribution');
  }

  assert.ok(primaryHits > 0, 'Primary provider took traffic');
  assert.ok(secondaryHits > 0 || tertiaryHits > 0, 'Fallbacks caught traffic when primary was rate limited');
});

test('End-to-End: Illustrated Coloring product type generates full artwork batch using fallback router', async () => {
  const secrets = new MemorySecretStore();
  await secrets.set('together_api_key', 'test-together-key');

  const app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false });

  // Mock routed image provider where first provider 429s and backup delivers
  let primaryFails = 0;
  let fallbackSuccesses = 0;

  const mockFlaky: ImageProvider = {
    id: 'openai',
    isConfigured: async () => true,
    model: () => 'dall-e-3',
    generateImage: async () => {
      primaryFails++;
      throw new ProviderError('openai', 'rate_limit', '429 Quota exhausted');
    },
  };

  const mockSolid: ImageProvider = {
    id: 'pollinations',
    isConfigured: async () => true,
    model: () => 'flux',
    generateImage: async () => {
      fallbackSuccesses++;
      return { png: testPng, widthPx: 256, heightPx: 256, usage: { inputTokens: null, outputTokens: null, images: 1 }, model: 'flux' };
    },
  };

  const customRouter = new RoutedImageProvider(
    { openai: mockFlaky, pollinations: mockSolid },
    () => 'openai',
    () => ['pollinations'],
    () => {},
    () => true,
  );

  const illDef = productType('illustrated-coloring');
  const ctx = makeContext(illDef, { params: { pages: 3, cover: true } });
  const content = {
    coverSubtitle: '3 fun pages',
    subjects: ['Playful puppy in grass', 'Cute kitten with yarn', 'Smiling dolphin in waves'],
  };

  // Replace image provider with our router for this test
  app.providers.image = customRouter;

  const imageGen = await imageGeneratorFor(app, {});
  assert.ok(imageGen !== null);
  assert.ok(illDef.generateArtwork);
  assert.ok(illDef.consistencyChecks);

  const art = await illDef.generateArtwork(ctx, content as any, () => 0.5, imageGen);

  assert.equal(art.length, 3, 'All 3 coloring page illustrations generated');
  assert.equal(primaryFails, 3, 'Primary provider hit 3 rate limits');
  assert.equal(fallbackSuccesses, 3, 'Fallback provider generated all 3 pages');

  for (const item of art) {
    assert.equal(item.kind, 'png');
    assert.equal(item.widthPx, 256);
    assert.equal(item.provenance?.provider, 'pollinations');
  }

  // Verify render produces safe HTML pages
  const rendered = await illDef.render(ctx, content as any, art);
  assert.equal(rendered.pages.length, 4, 'Cover + 3 art pages');

  // Verify consistency checks pass
  const checks = illDef.consistencyChecks(ctx, content as any, art);
  assert.ok(checks.every((c) => c.passed), 'Artwork count check passed');

  await app.close();
});

test('ImageTournament: 4-way bracket battle with multi-provider results', async () => {
  const secrets = new MemorySecretStore();
  const app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false });

  // Setup tournaments table in memory SQLite if not already migrated
  app.db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      entries TEXT NOT NULL DEFAULT '[]',
      rankings TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournament_entries (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_label TEXT NOT NULL,
      prompt TEXT NOT NULL,
      result_png BLOB,
      width_px INTEGER,
      height_px INTEGER,
      error TEXT,
      latency_ms INTEGER NOT NULL,
      cost_usd REAL,
      prompt_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const makeMock = (id: string, label: string): TournamentModel => ({
    id,
    label,
    provider: {
      id,
      isConfigured: async () => true,
      model: () => id,
      generateImage: async () => ({
        png: testPng,
        widthPx: 256,
        heightPx: 256,
        usage: { inputTokens: null, outputTokens: null, images: 1 },
        model: id,
      }),
    },
  });

  const models = [
    makeMock('together-flux', 'Together FLUX.1-schnell'),
    makeMock('hf-sdxl', 'Hugging Face SDXL'),
    makeMock('pollinations-flux', 'Pollinations FLUX'),
    makeMock('gemini-image', 'Google Gemini Imagen 3'),
  ];

  const tournament = new ImageTournament(app, models);
  const result = await tournament.run('A futuristic neon cyber pagoda in rainy Tokyo');

  assert.equal(result.entries.length, 4);
  assert.equal(result.rankings.length, 4);
  assert.equal(result.rankings[0].rank, 1);
  assert.equal(result.rankings[3].rank, 4);

  // Check database persistence
  const row = app.db.get<{ id: string; prompt: string }>('SELECT id, prompt FROM tournaments WHERE id = ?', result.id);
  assert.ok(row);
  assert.equal(row.prompt, 'A futuristic neon cyber pagoda in rainy Tokyo');

  const entryRows = app.db.all<{ model_id: string; width_px: number }>('SELECT model_id, width_px FROM tournament_entries WHERE tournament_id = ?', result.id);
  assert.equal(entryRows.length, 4);
  assert.equal(entryRows[0].width_px, 256);

  await app.close();
});
