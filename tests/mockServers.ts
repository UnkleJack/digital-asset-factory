import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { deflateSync } from 'node:zlib';

export interface MockReply {
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  raw?: string;
  delayMs?: number;
}

export interface MockServer {
  url: string;
  calls: { path: string; headers: IncomingMessage['headers']; body: any }[];
  close(): Promise<void>;
}

export async function mockServer(handler: (body: any, callIndex: number, path: string) => MockReply): Promise<MockServer> {
  const calls: MockServer['calls'] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', async () => {
      let body: unknown = null;
      try {
        body = JSON.parse(data);
      } catch {
        body = data;
      }
      calls.push({ path: req.url ?? '', headers: req.headers, body });
      const reply = handler(body, calls.length - 1, req.url ?? '');
      if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
      if (res.destroyed) return;
      res.writeHead(reply.status ?? 200, { 'content-type': 'application/json', ...(reply.headers ?? {}) });
      res.end(reply.raw ?? JSON.stringify(reply.json ?? {}));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}

export function anthropicMessage(text: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 800 },
    ...extra,
  };
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function makePng(width: number, height: number, draw: (x: number, y: number) => number): Buffer {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = draw(x, y);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function lineArtPng(w = 256, h = 384): Buffer {
  return makePng(w, h, (x, y) => ((x % 32 < 3 || y % 48 < 3) ? 0 : 255));
}

export function grayPng(w = 256, h = 384): Buffer {
  return makePng(w, h, () => 140);
}
