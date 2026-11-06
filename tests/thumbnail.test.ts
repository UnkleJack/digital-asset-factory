import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawIcon, encodePng as encodeSquare } from '../src/ops/macIcon.ts';
import { decodePng, encodePng, makeThumbnail, resize } from '../src/storage/thumbnail.ts';

// Library thumbnails: small copies of page previews, made without an image library.

test('a large RGBA PNG shrinks to the asked width, keeps its shape and gets much smaller', () => {
  const src = encodeSquare(drawIcon());
  const thumb = makeThumbnail(src, 128);
  assert.ok(thumb);
  const img = decodePng(thumb);
  assert.equal(img?.width, 128);
  assert.equal(img?.height, 128);
  assert.ok(thumb.length < src.length / 4, `thumbnail ${thumb.length} bytes vs original ${src.length}`);
});

test('the shrink averages colours and never enlarges', () => {
  const data = new Uint8Array(4 * 2 * 3);
  data.fill(0, 0, 12); // left half black
  data.fill(255, 12); // right half white
  const img = { width: 4, height: 2, channels: 3 as const, data };
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) data.fill(x < 2 ? 0 : 255, (y * 4 + x) * 3, (y * 4 + x) * 3 + 3);
  const small = resize(img, 2);
  assert.deepEqual([...small.data], [0, 0, 0, 255, 255, 255]);
  assert.equal(resize(img, 10), img);
  const round = decodePng(encodePng(img));
  assert.deepEqual([...round!.data], [...data]);
});

test('files it cannot read give null, so the server falls back to the original', () => {
  assert.equal(makeThumbnail(Buffer.from('not a png'), 100), null);
});

test('the thumb route serves a small cached copy and leaves the original alone', async () => {
  const { bootstrap } = await import('../src/app/bootstrap.ts');
  const { MemorySecretStore } = await import('../src/config/secrets.ts');
  const { buildServer } = await import('../src/server/app.ts');
  const { tempDir } = await import('./helpers.ts');
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  const server = await buildServer({ app, worker: null as never, scheduler: null, port: 4397, startedAt: new Date() });
  try {
    const src = encodeSquare(drawIcon());
    const a = app.assets.write('test/preview.png', src, { kind: 'preview_png', role: 'preview', mime: 'image/png' });
    const headers = { host: '127.0.0.1:4397', 'x-daf-client': '1' };
    const r = await server.inject({ method: 'GET', url: `/api/assets/${a.id}/thumb?w=100`, headers });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['content-type'], 'image/png');
    assert.equal(decodePng(r.rawPayload)?.width, 100);
    assert.ok(existsSync(join(app.paths.tmpDir, 'thumbs', `${a.id}-w100.png`)));
    assert.deepEqual(app.assets.read(app.assets.get(a.id)), src);
    const again = await server.inject({ method: 'GET', url: `/api/assets/${a.id}/thumb?w=100`, headers });
    assert.deepEqual(again.rawPayload, r.rawPayload);
  } finally {
    await server.close();
    await app.close();
  }
});
