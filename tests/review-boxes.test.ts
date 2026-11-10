// Review boxes: a box drawn on a page preview with a reject or revise note, as a direct visual reference.
// The server cuts the boxed area out itself, the picture-reading AI says what is in it, and that text
// reaches revision notes and the learning brief. A box counts as "which part" in the reason check.
import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { buildServer } from '../src/server/app.ts';
import { createProduct } from '../src/engine/specification/service.ts';
import { createBatch, addToBatch } from '../src/engine/approval/batches.ts';
import { itemDetail } from '../src/engine/approval/service.ts';
import { createBoxes, processBoxQueue, whereOnPage, boxPicture, boxesFor } from '../src/engine/approval/reviewBoxes.ts';
import { checkReason } from '../src/engine/approval/reasonCheck.ts';
import { learningBrief } from '../src/engine/generation/learning.ts';
import { SettingsVisionProvider, type VisionProvider, type VisionRequest } from '../src/engine/generation/vision.ts';
import { decodePng } from '../src/storage/thumbnail.ts';
import { reworkList } from '../src/engine/approval/rework.ts';
import { mockServer, makePng } from './mockServers.ts';
import { tempDir } from './helpers.ts';

let app: App;
beforeEach(() => { app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false }); });
afterEach(async () => { await app.close(); });
const servers: { close(): Promise<void> }[] = [];
after(async () => { for (const s of servers) await s.close(); });

type Providers = App['providers'];
function setProviders(p: Partial<Providers>) {
  (app as unknown as { providers: Providers }).providers = { ...app.providers, ...p };
}

/** Text AI stand-in for the reason check. Records prompts. */
function reasonAi(verdict = { intelligible: true, usable: true, tip: '' }): { system: string; prompt: string }[] {
  const seen: { system: string; prompt: string }[] = [];
  setProviders({
    text: {
      ...app.providers.text, id: 'standin', isConfigured: async () => true, model: () => 'stand-in',
      generateStructured: async (req: { schema: { parse: (x: unknown) => unknown }; system: string; prompt: string }) => {
        seen.push({ system: req.system, prompt: req.prompt });
        return { data: req.schema.parse(verdict), usage: { inputTokens: 1, outputTokens: 1, images: null }, model: 'stand-in', servedByFallback: false };
      },
    } as unknown as Providers['text'],
  });
  return seen;
}

/** Picture-reading AI stand-in. */
function visionAi(answer = 'The mandala lines in the box are broken and fuzzy.', ready = true): VisionRequest[] {
  const seen: VisionRequest[] = [];
  const v: VisionProvider = {
    status: async () => (ready ? { ready: true, provider: 'nvidia', model: 'test-vision' } : { ready: false, why: 'not set up' }),
    describe: async (req) => { seen.push(req); return { text: answer, usage: { inputTokens: 5, outputTokens: 5, images: null }, model: 'test-vision', provider: 'nvidia' }; },
  };
  setProviders({ vision: v });
  return seen;
}

/** A version with one 100x200 grey page preview that has a black block at x 20-39, y 40-79. Ready for review. */
function versionWithPreview(): { itemId: string; versionId: string; previewId: string } {
  const { version, product } = createProduct(app, { productType: 'habit-tracker', params: { months: 1 } });
  app.db.run("UPDATE product_versions SET status = 'ready', qa_status = 'passed' WHERE id = ?", version.id);
  const png = makePng(100, 200, (x, y) => (x >= 20 && x < 40 && y >= 40 && y < 80 ? 0 : 200));
  const a = app.assets.write(`test/${version.id}/page-01.png`, png, { productId: product.id, versionId: version.id, kind: 'preview_png', role: 'preview', mime: 'image/png', pageIndex: 0 });
  const batch = createBatch(app, 'Boxes', 'manual');
  addToBatch(app, batch, version.id);
  return { itemId: app.db.value<string>('SELECT id FROM approval_items WHERE version_id = ?', version.id)!, versionId: version.id, previewId: a.id };
}

async function server(): Promise<{ post: (url: string, body: unknown) => Promise<Awaited<ReturnType<FastifyInstance['inject']>>>; close: () => Promise<void> }> {
  const s: FastifyInstance = await buildServer({ app, worker: null as never, scheduler: null, port: 4399, startedAt: new Date() });
  const H = { host: '127.0.0.1:4399', 'x-daf-client': '1', 'content-type': 'application/json' };
  return { post: (url, body) => s.inject({ method: 'POST', url, headers: H, payload: JSON.stringify(body) }), close: () => s.close() };
}

test('the server cuts out exactly the boxed area and keeps an outlined copy of the page', () => {
  const { versionId, previewId } = versionWithPreview();
  const [id] = createBoxes(app, versionId, [{ previewId, x: 0.2, y: 0.2, w: 0.2, h: 0.2 }]);
  const crop = decodePng(boxPicture(app, id!, 'crop'))!;
  assert.equal(crop.width, 20);
  assert.equal(crop.height, 40);
  assert.ok(crop.data.every((v) => v === 0), 'the cut-out is only the black block');
  const page = decodePng(boxPicture(app, id!, 'page'))!;
  assert.equal(page.width, 100, 'small pages are not enlarged');
  assert.ok([...Array(page.width * page.height).keys()].some((i) => page.data[i * 3] === 220 && page.data[i * 3 + 1] === 30), 'a red outline is drawn');
  assert.equal(whereOnPage({ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }), 'top left');
  assert.equal(whereOnPage({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }), 'middle');
  assert.equal(whereOnPage({ x: 0.7, y: 0.8, w: 0.2, h: 0.1 }), 'bottom right');
});

test('boxes must be on this version\'s own page previews, and not specks', () => {
  const a = versionWithPreview();
  const b = versionWithPreview();
  assert.throws(() => createBoxes(app, a.versionId, [{ previewId: b.previewId, x: 0.1, y: 0.1, w: 0.2, h: 0.2 }]), /not a page preview of this version/);
  assert.throws(() => createBoxes(app, a.versionId, [{ previewId: a.previewId, x: 0.1, y: 0.1, w: 0.001, h: 0.2 }]), /too small/);
  assert.throws(() => createBoxes(app, a.versionId, Array.from({ length: 7 }, () => ({ previewId: a.previewId, x: 0.1, y: 0.1, w: 0.2, h: 0.2 }))), /at most 6/);
});

test('a box counts as "which part": the reason check is told about it', async () => {
  const seen = reasonAi();
  await checkReason(app, 'too blurry', 'rejected', { boxes: [{ page: 3, where: 'top left' }] });
  assert.match(seen[0]!.system, /A box counts as naming WHICH part/);
  assert.match(seen[0]!.system, /page 3, top left/);
  assert.match(seen[0]!.system, /"bad", "ugly"/, 'notes that say nothing about what is wrong still fail');
  await checkReason(app, 'the title on the cover is too small', 'rejected');
  assert.doesNotMatch(seen[1]!.system, /A box counts/, 'no box, no change to the rule');
});

test('reject with a box: the AI reads it, the decision keeps it, and it reaches the learning brief and Rework', async () => {
  reasonAi();
  const looked = visionAi();
  const { itemId, versionId, previewId } = versionWithPreview();
  const s = await server();
  try {
    const r = await s.post(`/api/batch-items/${itemId}/decision`, { decision: 'rejected', notes: 'too blurry', boxes: [{ previewId, x: 0.2, y: 0.2, w: 0.2, h: 0.2 }] });
    assert.equal(r.statusCode, 200, r.body);
  } finally {
    await s.close();
  }
  assert.equal(looked.length, 1);
  assert.equal(looked[0]!.images.length, 2, 'the outlined page, then the close-up');
  assert.match(looked[0]!.prompt, /too blurry/);
  const d = itemDetail(app, itemId).decisions[0]!;
  assert.equal(d.decision, 'rejected');
  assert.equal(d.boxes.length, 1);
  assert.equal(d.boxes[0]!.visionStatus, 'described');
  assert.match(learningBrief(app), /boxed by the owner: page 1: The mandala lines in the box are broken/);
  assert.equal(reworkList(app).yours[0]!.boxes.length, 1);
  assert.equal(app.db.value("SELECT count(*) FROM generation_runs WHERE purpose = 'approval:box-read' AND status = 'succeeded'"), 1, 'the call is logged for cost tracking');
  assert.equal(boxesFor(app, versionId).length, 1);
});

test('return for revision with a box: what the AI saw goes into the next version\'s notes', async () => {
  reasonAi();
  visionAi('The checkbox row is cut off at the edge.');
  const { itemId, previewId } = versionWithPreview();
  const s = await server();
  let next = '';
  try {
    const r = await s.post(`/api/batch-items/${itemId}/decision`, { decision: 'revision_requested', notes: 'make this fit', boxes: [{ previewId, x: 0.7, y: 0.8, w: 0.2, h: 0.1 }] });
    assert.equal(r.statusCode, 200, r.body);
    next = r.json().newVersionId;
  } finally {
    await s.close();
  }
  const notes = app.db.value<string>('SELECT revision_notes FROM product_versions WHERE id = ?', next)!;
  assert.match(notes, /^make this fit\nBoxed area on page 1 \(bottom right\): The checkbox row is cut off at the edge\.$/);
});

test('no picture-reading AI yet: the box is kept with its place, waits, and is read once one is ready', async () => {
  reasonAi();
  visionAi('x', false);
  const { itemId, previewId } = versionWithPreview();
  const s = await server();
  try {
    assert.equal((await s.post(`/api/batch-items/${itemId}/decision`, { decision: 'rejected', notes: 'the lines are blurry', boxes: [{ previewId, x: 0.2, y: 0.2, w: 0.2, h: 0.2 }] })).statusCode, 200);
  } finally {
    await s.close();
  }
  let box = itemDetail(app, itemId).decisions[0]!.boxes[0]!;
  assert.equal(box.visionStatus, 'waiting');
  assert.equal(box.description, null);
  assert.deepEqual(await processBoxQueue(app), { described: 0, stillWaiting: 0 }, 'not due for a minute');
  app.db.run("UPDATE review_boxes SET next_try_at = '2000-01-01T00:00:00.000Z'");
  assert.deepEqual(await processBoxQueue(app), { described: 0, stillWaiting: 1 });
  visionAi('Fuzzy outer ring.');
  app.db.run("UPDATE review_boxes SET next_try_at = '2000-01-01T00:00:00.000Z'");
  assert.deepEqual(await processBoxQueue(app), { described: 1, stillWaiting: 0 });
  box = itemDetail(app, itemId).decisions[0]!.boxes[0]!;
  assert.equal(box.description, 'Fuzzy outer ring.');
});

test('a refused note leaves nothing behind, boxes included; boxes cannot go with an approval', async () => {
  reasonAi({ intelligible: true, usable: false, tip: 'What is wrong with the boxed part?' });
  visionAi();
  const { itemId, previewId } = versionWithPreview();
  const s = await server();
  try {
    const r = await s.post(`/api/batch-items/${itemId}/decision`, { decision: 'rejected', notes: 'bad', boxes: [{ previewId, x: 0.2, y: 0.2, w: 0.2, h: 0.2 }] });
    assert.equal(r.statusCode, 422);
    assert.equal(app.db.value('SELECT count(*) FROM review_boxes'), 0);
    const a = await s.post(`/api/batch-items/${itemId}/decision`, { decision: 'approved', boxes: [{ previewId, x: 0.2, y: 0.2, w: 0.2, h: 0.2 }] });
    assert.equal(a.statusCode, 422);
    assert.match(a.body, /not an approval/);
  } finally {
    await s.close();
  }
});

test('the picture-reading AI is off until a model is typed, and sends pictures as image_url parts', async () => {
  const secrets = new MemorySecretStore();
  const srv = await mockServer(() => ({ json: { model: 'meta/llama-3.2-90b-vision-instruct', choices: [{ message: { content: 'Red.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 1 } } }));
  servers.push(srv);
  let g = app.settings.get('generation');
  assert.equal(g.vision.provider, 'nvidia', "owner's pick");
  assert.equal(g.vision.model, 'meta/llama-3.2-90b-vision-instruct');
  const v = new SettingsVisionProvider(() => g, secrets);
  assert.match((await v.status() as { why: string }).why, /No NVIDIA NIM key/);
  app.settings.update('generation', { vision: { provider: 'nvidia', model: '' }, nvidia: { ...g.nvidia, baseUrl: srv.url } });
  g = app.settings.get('generation');
  await secrets.set('nvidia_api_key', 'nvapi-test-key-123456');
  assert.match((await v.status() as { why: string }).why, /Type the name/);
  app.settings.update('generation', { vision: { provider: 'nvidia', model: 'meta/llama-3.2-90b-vision-instruct' } });
  g = app.settings.get('generation');
  const png = makePng(4, 4, () => 0);
  const r = await v.describe({ system: 'sys', prompt: 'what is it', images: [png], maxTokens: 20 });
  assert.equal(r.text, 'Red.');
  const body = srv.calls[0]!.body;
  assert.equal(body.model, 'meta/llama-3.2-90b-vision-instruct');
  const parts = body.messages[1].content;
  assert.equal(parts[0].type, 'text');
  assert.equal(parts[1].type, 'image_url');
  assert.equal(parts[1].image_url.url, `data:image/png;base64,${png.toString('base64')}`);
  assert.equal(srv.calls[0]!.headers.authorization, 'Bearer nvapi-test-key-123456');
});
