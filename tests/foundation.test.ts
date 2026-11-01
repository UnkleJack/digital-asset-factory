import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Db } from '../src/db/sqlite.ts';
import { migrate, MIGRATIONS_DIR } from '../src/db/migrate.ts';
import { SettingsService } from '../src/config/settings.ts';
import { AssetStore } from '../src/storage/assetStore.ts';
import { redact, registerSecretForRedaction, Logger } from '../src/logging/logger.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { newId, slugify } from '../src/core/ids.ts';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'daf-test-'));
}

function freshDb() {
  const dir = tempDir();
  const db = new Db(join(dir, 'test.sqlite'));
  migrate(db, join(dir, 'backups'));
  return { db, dir };
}

test('migrations apply once, record checksums, and back up before later migrations', () => {
  const dir = tempDir();
  const migDir = join(dir, 'migs');
  mkdirSync(migDir);
  for (const f of readdirSync(MIGRATIONS_DIR)) copyFileSync(join(MIGRATIONS_DIR, f), join(migDir, f));
  const db = new Db(join(dir, 'a.sqlite'));
  const first = migrate(db, join(dir, 'backups'), migDir);
  assert.ok(first.applied.length >= 1);
  assert.equal(first.backupFile, null, 'empty database needs no backup');
  assert.deepEqual(migrate(db, join(dir, 'backups'), migDir).applied, []);

  writeFileSync(join(migDir, '999_extra.sql'), 'CREATE TABLE extra_t (id TEXT PRIMARY KEY);');
  const second = migrate(db, join(dir, 'backups'), migDir);
  assert.deepEqual(second.applied, ['999_extra.sql']);
  assert.ok(second.backupFile && readdirSync(join(dir, 'backups')).length === 1);

  writeFileSync(join(migDir, '999_extra.sql'), 'CREATE TABLE extra_t (id TEXT PRIMARY KEY, x TEXT);');
  assert.throws(() => migrate(db, join(dir, 'backups'), migDir), /checksum mismatch/);
});

test('a migration file renumbered after it ran is followed to its new number, not treated as modified', () => {
  const dir = tempDir();
  const migDir = join(dir, 'migs');
  mkdirSync(migDir);
  const tournaments = 'CREATE TABLE tourney_t (id TEXT PRIMARY KEY);';
  writeFileSync(join(migDir, '001_initial.sql'), 'CREATE TABLE base_t (id TEXT PRIMARY KEY);');
  writeFileSync(join(migDir, '002_tournaments.sql'), tournaments);
  const db = new Db(join(dir, 'a.sqlite'));
  migrate(db, join(dir, 'backups'), migDir);

  // The same file moves to 004, and two other migrations take 002 and 003.
  rmSync(join(migDir, '002_tournaments.sql'));
  writeFileSync(join(migDir, '002_packing.sql'), 'CREATE TABLE packing_t (id TEXT PRIMARY KEY);');
  writeFileSync(join(migDir, '003_spread.sql'), 'ALTER TABLE base_t ADD COLUMN x TEXT;');
  writeFileSync(join(migDir, '004_tournaments.sql'), tournaments);

  const r = migrate(db, join(dir, 'backups'), migDir);
  assert.deepEqual(r.renumbered, [{ from: 2, to: 4, name: '004_tournaments.sql' }]);
  assert.deepEqual(r.applied, ['002_packing.sql', '003_spread.sql']);
  assert.ok(r.backupFile, 'backs up before changing a database that has tables');
  assert.deepEqual(
    db.all<{ version: number; name: string }>('SELECT version, name FROM schema_migrations ORDER BY version').map((m) => `${m.version}:${m.name}`),
    ['1:001_initial.sql', '2:002_packing.sql', '3:003_spread.sql', '4:004_tournaments.sql'],
  );
  assert.deepEqual(migrate(db, join(dir, 'backups'), migDir).applied, []);

  // A renumbered file whose contents also changed is still refused.
  const db2 = new Db(join(dir, 'b.sqlite'));
  const migDir2 = join(dir, 'migs2');
  mkdirSync(migDir2);
  writeFileSync(join(migDir2, '001_tournaments.sql'), tournaments);
  migrate(db2, join(dir, 'backups2'), migDir2);
  rmSync(join(migDir2, '001_tournaments.sql'));
  writeFileSync(join(migDir2, '001_packing.sql'), 'CREATE TABLE packing_t (id TEXT PRIMARY KEY);');
  writeFileSync(join(migDir2, '002_tournaments.sql'), tournaments + ' -- edited');
  assert.throws(() => migrate(db2, join(dir, 'backups2'), migDir2), /checksum mismatch/);

  // An edited file left at its old number is still refused, even if an unchanged copy sits at another number.
  const db3 = new Db(join(dir, 'c.sqlite'));
  const migDir3 = join(dir, 'migs3');
  mkdirSync(migDir3);
  writeFileSync(join(migDir3, '001_tournaments.sql'), tournaments);
  migrate(db3, join(dir, 'backups3'), migDir3);
  writeFileSync(join(migDir3, '001_tournaments.sql'), tournaments + ' -- edited');
  writeFileSync(join(migDir3, '002_tournaments.sql'), tournaments);
  assert.throws(() => migrate(db3, join(dir, 'backups3'), migDir3), /checksum mismatch/);
  db3.close();
  db.close();
  db2.close();
});

test('transactions roll back on error, including nested savepoints', () => {
  const { db } = freshDb();
  assert.throws(() =>
    db.tx(() => {
      db.insert('categories', { id: 'c1', name: 'One' });
      db.tx(() => db.insert('categories', { id: 'c2', name: 'Two' }));
      throw new Error('boom');
    }),
  );
  assert.equal(db.value('SELECT count(*) FROM categories'), 0);
  db.tx(() => {
    db.insert('categories', { id: 'c1', name: 'One' });
    try {
      db.tx(() => {
        db.insert('categories', { id: 'c2', name: 'Two' });
        throw new Error('inner');
      });
    } catch {
      // inner savepoint rolled back only
    }
  });
  assert.equal(db.value('SELECT count(*) FROM categories'), 1);
});

test('settings provide defaults, validate updates, and persist', () => {
  const { db } = freshDb();
  const s = new SettingsService(db);
  assert.equal(s.get('generation').anthropic.model, 'claude-opus-5-5');
  assert.equal(s.get('marketplaces').etsy.rules.tagsMax, 13);
  assert.throws(() => s.update('scoring', { minScore: 500 }), /Invalid scoring/);
  s.update('scoring', { minScore: 70 });
  assert.equal(new SettingsService(db).get('scoring').minScore, 70);
  assert.equal(new SettingsService(db).get('scoring').weights.demand, 0.2, 'untouched nested defaults survive a partial update');
});

test('asset store rejects traversal, absolute paths and symlink escapes', () => {
  const { db, dir } = freshDb();
  const store = new AssetStore(join(dir, 'assets'), db);
  const ok = store.write('products/p1/v1/file.txt', 'hello', { kind: 'text', role: 'internal', mime: 'text/plain' });
  assert.equal(ok.size_bytes, 5);
  assert.equal(store.read(ok).toString(), 'hello');
  for (const bad of ['../evil.txt', 'products/../../evil.txt', '/etc/passwd', 'a/\0b']) {
    assert.throws(() => store.write(bad, 'x', { kind: 'text', role: 'internal', mime: 'text/plain' }), /not allowed|escapes|Invalid/);
  }
  const outside = tempDir();
  symlinkSync(outside, join(dir, 'assets', 'link'));
  assert.throws(() => store.write('link/x.txt', 'x', { kind: 'text', role: 'internal', mime: 'text/plain' }), /link/);
});

test('logger and redaction never emit secret values', () => {
  registerSecretForRedaction('sk-test-secret-value-1234567890');
  const out = redact('failed with key sk-test-secret-value-1234567890 and Bearer abcdefghijklmnop and sk-ant-api03-XYZXYZXYZXYZ');
  assert.ok(!out.includes('sk-test-secret-value'));
  assert.ok(!out.includes('abcdefghijklmnop'));
  assert.ok(!out.includes('XYZXYZ'));
  const dir = tempDir();
  const log = new Logger({ dir, console: false });
  log.error('provider failed', { err: new Error('401 for x-api-key: sk-test-secret-value-1234567890') });
  assert.ok(!JSON.stringify(log.recent()).includes('sk-test-secret-value'));
});

test('memory secret store is write-only through status()', async () => {
  const s = new MemorySecretStore();
  await assert.rejects(() => s.set('anthropic_api_key', 'bad value with spaces'));
  await s.set('anthropic_api_key', 'sk-ant-abcdefghijkl');
  const st = await s.status();
  assert.equal(st.find((x) => x.name === 'anthropic_api_key')?.configured, true);
  assert.ok(!JSON.stringify(st).includes('abcdefghijkl'));
});

test('ids are prefixed and sortable; slugify is safe', () => {
  const a = newId('prd');
  const b = newId('prd');
  assert.match(a, /^prd_[0-9a-z]+$/);
  assert.ok(a < b);
  assert.equal(slugify('  Ünïcode Planner 2027!! / ../etc '), 'unicode-planner-2027-etc');
});
