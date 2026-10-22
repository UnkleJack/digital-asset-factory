import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db/sqlite.ts';
import { newId } from '../core/ids.ts';

export type Level = 'debug' | 'info' | 'warn' | 'error';
export type Outcome = 'succeeded' | 'failed' | 'skipped' | 'unverified';

export interface LogEntry {
  at: string;
  level: Level;
  msg: string;
  outcome?: Outcome;
  [k: string]: unknown;
}

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const TOKEN_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-(?:proj-)?[A-Za-z0-9_-]{16,}/g,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi,
  /("?(?:x-api-key|api[_-]?key|authorization|access_token|refresh_token)"?\s*[:=]\s*"?)[^"\s,}]{6,}/gi,
];

const knownSecrets = new Set<string>();

export function registerSecretForRedaction(value: string | null | undefined): void {
  if (value && value.length >= 8) knownSecrets.add(value);
}

export function redact(text: string): string {
  let out = text;
  for (const s of knownSecrets) out = out.split(s).join('[REDACTED]');
  for (const re of TOKEN_PATTERNS) {
    out = out.replace(re, (m, prefix?: string) => (typeof prefix === 'string' && m.startsWith(prefix) ? `${prefix}[REDACTED]` : '[REDACTED]'));
  }
  return out;
}

export function redactValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  return JSON.parse(redact(JSON.stringify(value))) as T;
}

export class Logger {
  private dir: string | null;
  private minLevel: number;
  private context: Record<string, unknown>;
  private ring: LogEntry[];
  private toConsole: boolean;

  constructor(opts: { dir: string | null; level?: Level; console?: boolean; context?: Record<string, unknown>; ring?: LogEntry[] }) {
    this.dir = opts.dir;
    this.minLevel = LEVELS[opts.level ?? 'info'];
    this.context = opts.context ?? {};
    this.ring = opts.ring ?? [];
    this.toConsole = opts.console ?? true;
  }

  child(context: Record<string, unknown>): Logger {
    const l = new Logger({ dir: this.dir, console: this.toConsole, context: { ...this.context, ...context }, ring: this.ring });
    l.minLevel = this.minLevel;
    return l;
  }

  recent(limit = 200, level?: Level): LogEntry[] {
    const min = level ? LEVELS[level] : 0;
    return this.ring.filter((e) => LEVELS[e.level] >= min).slice(-limit).reverse();
  }

  private write(level: Level, msg: string, fields: Record<string, unknown> = {}) {
    if (LEVELS[level] < this.minLevel) return;
    const errField = fields.err instanceof Error ? { err: { message: fields.err.message, name: fields.err.name, stack: fields.err.stack } } : {};
    const entry = redactValue({ at: new Date().toISOString(), level, msg, ...this.context, ...fields, ...errField }) as LogEntry;
    this.ring.push(entry);
    if (this.ring.length > 1000) this.ring.splice(0, this.ring.length - 1000);
    const line = JSON.stringify(entry);
    if (this.dir) {
      try {
        appendFileSync(join(this.dir, `app-${entry.at.slice(0, 10)}.jsonl`), line + '\n');
      } catch {
        // Logging must never crash the app.
      }
    }
    if (this.toConsole) {
      const ctx = Object.entries(entry).filter(([k]) => !['at', 'level', 'msg', 'err'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ');
      const out = `${entry.at.slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${entry.msg}${ctx ? '  ' + ctx : ''}`;
      if (level === 'error' || level === 'warn') console.error(out);
      else console.log(out);
    }
  }

  debug(msg: string, f?: Record<string, unknown>) { this.write('debug', msg, f); }
  info(msg: string, f?: Record<string, unknown>) { this.write('info', msg, f); }
  warn(msg: string, f?: Record<string, unknown>) { this.write('warn', msg, f); }
  error(msg: string, f?: Record<string, unknown>) { this.write('error', msg, f); }
}

export type AuditActor = 'user' | 'system' | 'scheduler' | 'worker';

export function audit(db: Db, actor: AuditActor, action: string, entityType: string | null, entityId: string | null, details: Record<string, unknown> = {}): void {
  db.insert('audit_events', {
    id: newId('aud'),
    at: new Date().toISOString(),
    actor,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details: JSON.stringify(redactValue(details)),
  });
}
