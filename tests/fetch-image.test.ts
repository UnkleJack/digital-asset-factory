import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchImage } from '../src/engine/references/fetchImage.ts';

// Pictures dragged in from web pages arrive as links; the app fetches them with guard rails.

const PUBLIC = 'http://93.184.216.34';
const reply = (body: BodyInit | null, init: ResponseInit) => async () => new Response(body, init);

test('a public picture link is fetched with its file name', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const f = await fetchImage(`${PUBLIC}/art/cat%20drawing.png?x=1`, reply(png, { status: 200, headers: { 'content-type': 'image/png' } }) as typeof fetch);
  assert.equal(f.fileName, 'cat drawing.png');
  assert.equal(f.contentType, 'image/png');
  assert.deepEqual(f.bytes, png);
});

test('links to this computer or a private network are refused, even after a redirect', async () => {
  for (const u of ['http://127.0.0.1:4317/api/settings', 'http://192.168.1.5/x.png', 'http://[::1]/x.png', 'http://169.254.169.254/latest', 'file:///etc/passwd']) {
    await assert.rejects(fetchImage(u, reply('x', { status: 200 }) as typeof fetch), undefined, u);
  }
  await assert.rejects(fetchImage(`${PUBLIC}/a.png`, reply(null, { status: 302, headers: { location: 'http://10.0.0.2/a.png' } }) as typeof fetch), /private network/);
});

test('a web page instead of a picture gets a clear message', async () => {
  await assert.rejects(fetchImage(`${PUBLIC}/gallery`, reply('<html>', { status: 200, headers: { 'content-type': 'text/html' } }) as typeof fetch), /not a picture/);
});
