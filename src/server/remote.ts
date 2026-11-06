// Hub mode: let another computer (your Windows laptop, say) use this app over the home network or
// Tailscale. Off by default. When on, requests from this computer work as before; requests from
// anywhere else must carry the access token, set as a cookie by the /login page.
//
// Public access (docs/PUBLIC_ACCESS.md): a tunnel such as cloudflared runs on this computer and
// connects from 127.0.0.1, so the socket address alone would make internet visitors look local.
// A request is only local when it comes from this computer AND shows no sign of a tunnel or proxy:
// no forwarding header, and not addressed to one of the public addresses in remote.publicHosts.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { App } from '../app/bootstrap.ts';
import { SUITE_NAME } from '../core/brand.ts';
import { normalizeHost } from '../config/settings.ts';

export const TOKEN_COOKIE = 'daf_token';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const isLoopback = (req: FastifyRequest) => LOOPBACK.has(req.socket.remoteAddress ?? '');

const header = (req: FastifyRequest, name: string): string => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v.join(',') : String(v ?? '')).trim();
};

/** The Host header's name without the port, in lower case. */
export const requestHostName = (req: FastifyRequest): string => normalizeHost(String(req.headers.host ?? ''));

/** True when the request names one of the public addresses, or a proxy has stamped it with the visitor's address. */
export function viaProxy(req: FastifyRequest, publicHosts: readonly string[]): boolean {
  if (req.headers['cf-connecting-ip'] !== undefined || req.headers['x-forwarded-for'] !== undefined) return true;
  return publicHosts.includes(requestHostName(req));
}

/** Who is really asking. Forwarding headers are only believed when the proxy is on this computer;
 * from anywhere else they could be made up to dodge the wrong-token brake. */
export function clientAddress(req: FastifyRequest, publicHosts: readonly string[]): string {
  const socket = req.socket.remoteAddress ?? '?';
  if (!isLoopback(req) || !viaProxy(req, publicHosts)) return socket;
  const cf = header(req, 'cf-connecting-ip');
  if (cf) return cf;
  // Cloudflare adds the visitor to the end of X-Forwarded-For; anything before it came from the visitor and can't be trusted.
  const xff = header(req, 'x-forwarded-for').split(',').map((x) => x.trim()).filter(Boolean);
  return xff.at(-1) ?? 'proxy';
}

/** True when the request reached the proxy over https (so the sign-in cookie can be marked Secure). */
export const arrivedOverHttps = (req: FastifyRequest): boolean => header(req, 'x-forwarded-proto').split(',')[0]!.trim().toLowerCase() === 'https';

export function newAccessToken(): string {
  return randomBytes(24).toString('base64url');
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function cookieToken(req: FastifyRequest): string | null {
  const raw = String(req.headers.cookie ?? '');
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === TOKEN_COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Addresses another computer can use to reach this one (LAN and Tailscale 100.x). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

export class RemoteGate {
  private app: App;
  private token: string | null = null;
  private failures = new Map<string, { n: number; at: number }>();

  constructor(app: App) {
    this.app = app;
  }

  get enabled(): boolean {
    return this.app.settings.get('remote').enabled;
  }

  get publicHosts(): readonly string[] {
    return this.app.settings.get('remote').publicHosts;
  }

  /** From this computer, with no tunnel or proxy in between. Only these requests skip the access token. */
  isLocal(req: FastifyRequest): boolean {
    return isLoopback(req) && !viaProxy(req, this.publicHosts);
  }

  clientAddress(req: FastifyRequest): string {
    return clientAddress(req, this.publicHosts);
  }

  async load(): Promise<void> {
    this.token = await this.app.secrets.get('remote_access_token');
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  hasToken(): boolean {
    return !!this.token;
  }

  valid(candidate: string | null | undefined): boolean {
    return !!this.token && !!candidate && sameToken(candidate, this.token);
  }

  /** Simple brute-force brake: 10 wrong tokens per address per 10 minutes. */
  tooManyFailures(ip: string): boolean {
    const f = this.failures.get(ip);
    return !!f && f.n >= 10 && Date.now() - f.at < 600_000;
  }

  failed(ip: string): void {
    const f = this.failures.get(ip);
    this.failures.set(ip, f && Date.now() - f.at < 600_000 ? { n: f.n + 1, at: f.at } : { n: 1, at: Date.now() });
  }

  /** True when the request may go on; otherwise the reply has been sent. */
  check(req: FastifyRequest, reply: FastifyReply): boolean {
    if (this.isLocal(req)) return true;
    if (!this.enabled || !this.token) {
      reply.code(403).send({ error: { code: 'remote_off', message: 'Remote access is turned off on this computer.' } });
      return false;
    }
    const path = req.url.split('?')[0]!;
    if (path === '/login' || path === '/api/login') return true;
    if (this.valid(cookieToken(req)) || this.valid(String(req.headers['x-daf-token'] ?? ''))) return true;
    if (req.method === 'GET' && !path.startsWith('/api/')) reply.redirect('/login', 303);
    else reply.code(401).send({ error: { code: 'login_required', message: 'Sign in with the access token first.' } });
    return false;
  }
}

const LOGIN_PAGE = (msg = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · ${SUITE_NAME}</title>
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#15100b;color:#eadfca;font:16px system-ui,sans-serif}
form{width:min(380px,calc(100vw - 32px));padding:28px;border:1px solid #6b5228;border-radius:6px;background:#211810}h1{margin:0 0 6px;font-size:22px;color:#d6a54e}
p{color:#b9a98b;font-size:14px}input{box-sizing:border-box;width:100%;padding:10px;margin:8px 0 14px;border:1px solid #6b5228;border-radius:4px;background:#120d08;color:inherit;font:inherit}
button{width:100%;padding:10px;border:1px solid #d6a54e;border-radius:4px;background:#d6a54e;color:#1b1209;font-weight:700;font-size:15px;cursor:pointer}.err{color:#ff8a7a}</style></head>
<body><form method="post" action="/api/login"><h1>${SUITE_NAME}</h1><p>This app is running on another computer. Enter the access token shown in Settings → System on that computer.</p>
${msg ? `<p class="err">${msg}</p>` : ''}<label>Access token<input name="token" type="password" autocomplete="current-password" required autofocus></label><button>Sign in</button></form></body></html>`;

export function registerRemoteRoutes(server: FastifyInstance, app: App, gate: RemoteGate): void {
  server.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))));
  server.get('/login', async (_req, reply) => reply.type('text/html').send(LOGIN_PAGE()));
  server.post('/api/login', async (req, reply) => {
    const ip = gate.clientAddress(req);
    if (gate.tooManyFailures(ip)) return reply.code(429).type('text/html').send(LOGIN_PAGE('Too many wrong tokens. Wait 10 minutes.'));
    const token = String((req.body as Record<string, unknown> | null)?.token ?? '').trim();
    if (!gate.valid(token)) {
      gate.failed(ip);
      app.log.warn('Remote sign-in failed', { ip });
      return reply.code(401).type('text/html').send(LOGIN_PAGE('That token is not right.'));
    }
    app.log.info('Remote sign-in', { ip });
    reply.header('Set-Cookie', `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}${arrivedOverHttps(req) ? '; Secure' : ''}`);
    return reply.redirect('/', 303);
  });
  server.get('/api/remote', async () => ({ enabled: gate.enabled, hasToken: gate.hasToken(), addresses: lanAddresses(), port: Number(process.env.DAF_PORT ?? 4317), bindAddress: app.settings.get('remote').bindAddress, publicHosts: gate.publicHosts }));
  // Generates a new token (the old one stops working) and shows it once.
  server.post('/api/remote/token', async (req, reply) => {
    if (!gate.isLocal(req)) return reply.code(403).send({ error: { code: 'local_only', message: 'A new token can only be made on the computer running the app.' } });
    const token = newAccessToken();
    await app.secrets.set('remote_access_token', token);
    gate.setToken(token);
    return { token };
  });
}
