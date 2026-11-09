import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { startPipeline } from '../src/jobs/pipeline.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { aiDisclosure, aiUsageOf, provenanceUsedAi, withAiDisclosure, prepareListings, updateListing, AI_DISCLOSURE_HEADING } from '../src/engine/listing/service.ts';
import { getVersion, listingsForVersion, updateVersion } from '../src/db/repos.ts';
import type { AssetRecord } from '../src/storage/assetStore.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { tempDir, idle } from './helpers.ts';

test('provenance: AI providers count, deterministic and procedural do not, edits keep the original source', () => {
  assert.equal(provenanceUsedAi({ generator: 'anthropic', model: 'x' }), true);
  assert.equal(provenanceUsedAi({ generator: 'openai' }), true);
  assert.equal(provenanceUsedAi({ generator: 'deterministic' }), false);
  assert.equal(provenanceUsedAi({ generator: 'procedural-mandala@1' }), false);
  assert.equal(provenanceUsedAi({ generator: 'user_edit', previous: { generator: 'groq' } }), true);
  assert.equal(provenanceUsedAi({ generator: 'user_edit', previous: { generator: 'deterministic' } }), false);
  assert.equal(provenanceUsedAi({ generator: 'imported', sourceTool: 'unknown' }), false);
  assert.equal(provenanceUsedAi({ generator: 'imported', prompt: 'a mandala' }), true);
  assert.equal(provenanceUsedAi(null), false);
});

test('disclosure level decides what triggers it; listing mockups and listing copy never do', () => {
  assert.equal(aiDisclosure({ text: false, images: false }), null);
  assert.equal(aiDisclosure({ text: true, images: false }), null, 'default level ignores AI-written page text');
  assert.equal(aiDisclosure({ text: true, images: false }, 'art_and_text'), `${AI_DISCLOSURE_HEADING}\nThis item was made with the help of AI tools. AI was used to write the text on the pages.`);
  assert.equal(aiDisclosure({ text: false, images: true }), `${AI_DISCLOSURE_HEADING}\nThis item was made with the help of AI tools. AI was used to create the artwork.`);
  assert.match(aiDisclosure({ text: true, images: true }, 'art_and_text')!, /create the artwork and write the text on the pages\.$/);
  const art = { role: 'source', provenance: { generator: 'openai' } } as unknown as AssetRecord;
  const thumb = { role: 'listing_image', provenance: { generator: 'openai' } } as unknown as AssetRecord;
  assert.deepEqual(aiUsageOf(null, [thumb]), { text: false, images: false }, 'listing mockups are not artwork');
  assert.deepEqual(aiUsageOf(null, [art]), { text: false, images: true });
  const d = aiDisclosure({ text: false, images: true });
  assert.equal(withAiDisclosure('Body', d), `Body\n\n${d}`);
  assert.equal(withAiDisclosure(`Body\n\n${d}`, d), `Body\n\n${d}`, 'never added twice');
  assert.equal(withAiDisclosure('Body', null), 'Body');
});

let app: App;
let worker: Worker;

before(() => {
  app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  app.settings.update('scheduler', { retryBaseSeconds: 1 });
  worker = createWorker(app);
  worker.start();
});

after(async () => {
  await worker.stop();
  await app.close();
});

test('listings: Etsy only, and only at the chosen level; Etsy refuses an edit that drops it', async () => {
  const { version } = createProduct(app, { productType: 'habit-tracker', params: { months: 1 } });
  startPipeline(app, version.id, { marketplaces: ['etsy', 'gumroad'] });
  await idle(app);
  assert.equal(getVersion(app.db, version.id).status, 'ready');
  for (const l of listingsForVersion(app.db, version.id)) assert.ok(!l.description.includes(AI_DISCLOSURE_HEADING), 'deterministic product has no AI line');

  // As if an AI provider had written the page text.
  updateVersion(app.db, version.id, { content_provenance: { generator: 'anthropic', model: 'test' } });
  let listings = await prepareListings(app, version.id, ['etsy', 'gumroad']);
  for (const l of listings) assert.ok(!l.description.includes(AI_DISCLOSURE_HEADING), `${l.marketplace}: default level ignores AI-written text`);

  app.settings.update('marketplaces', { aiDisclosure: 'art_and_text' });
  listings = await prepareListings(app, version.id, ['etsy', 'gumroad']);
  const expected = aiDisclosure({ text: true, images: false }, 'art_and_text')!;
  const etsy = listings.find((l) => l.marketplace === 'etsy')!;
  const gumroad = listings.find((l) => l.marketplace === 'gumroad')!;
  assert.ok(etsy.description.endsWith(expected));
  assert.equal(etsy.attributes.aiDisclosure, expected);
  assert.ok(!gumroad.description.includes(AI_DISCLOSURE_HEADING), 'Gumroad has no such rule');

  const stripped = updateListing(app, etsy.id, { description: etsy.description.replace(expected, '').trim() });
  assert.equal(stripped.status, 'invalid');
  assert.ok(stripped.validation.issues.some((i: { message: string }) => /AI disclosure missing/.test(i.message)));
  assert.equal(updateListing(app, etsy.id, { description: etsy.description }).status, 'ready');
});
