import { DatabaseSync, type StatementSync, type SQLInputValue } from 'node:sqlite';

export type Row = Record<string, unknown>;

const IDENT = /^[a-z_][a-z0-9_]*$/;

function toParam(v: unknown): SQLInputValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v;
  if (v instanceof Uint8Array) return v;
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
}

function assertIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Invalid SQL identifier: ${name}`);
  return name;
}

export class Db {
  readonly raw: DatabaseSync;
  readonly path: string;
  private cache = new Map<string, StatementSync>();
  private depth = 0;

  constructor(path: string) {
    this.path = path;
    this.raw = new DatabaseSync(path);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  }

  private stmt(sql: string): StatementSync {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  run(sql: string, ...params: unknown[]): { changes: number } {
    const r = this.stmt(sql).run(...params.map(toParam));
    return { changes: Number(r.changes) };
  }

  get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
    return this.stmt(sql).get(...params.map(toParam)) as T | undefined;
  }

  all<T = Row>(sql: string, ...params: unknown[]): T[] {
    return this.stmt(sql).all(...params.map(toParam)) as T[];
  }

  value<T = unknown>(sql: string, ...params: unknown[]): T | undefined {
    const row = this.get<Row>(sql, ...params);
    if (!row) return undefined;
    return Object.values(row)[0] as T;
  }

  insert(table: string, row: Row): void {
    const keys = Object.keys(row).filter((k) => row[k] !== undefined).map(assertIdent);
    const sql = `INSERT INTO ${assertIdent(table)} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    this.run(sql, ...keys.map((k) => row[k]));
  }

  update(table: string, id: string, patch: Row, idColumn = 'id'): number {
    const keys = Object.keys(patch).filter((k) => patch[k] !== undefined).map(assertIdent);
    if (keys.length === 0) return 0;
    const sql = `UPDATE ${assertIdent(table)} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${assertIdent(idColumn)} = ?`;
    return this.run(sql, ...keys.map((k) => patch[k]), id).changes;
  }

  tx<T>(fn: () => T): T {
    const sp = `sp_${this.depth}`;
    if (this.depth === 0) this.raw.exec('BEGIN IMMEDIATE');
    else this.raw.exec(`SAVEPOINT ${sp}`);
    this.depth++;
    try {
      const result = fn();
      if (result instanceof Promise) throw new Error('Db.tx callback must be synchronous');
      this.depth--;
      if (this.depth === 0) this.raw.exec('COMMIT');
      else this.raw.exec(`RELEASE ${sp}`);
      return result;
    } catch (err) {
      this.depth--;
      if (this.depth === 0) this.raw.exec('ROLLBACK');
      else this.raw.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw err;
    }
  }

  backupTo(file: string): void {
    this.raw.prepare('VACUUM INTO ?').run(file);
  }

  close(): void {
    this.cache.clear();
    if (this.raw.isOpen) this.raw.close();
  }
}

export function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
