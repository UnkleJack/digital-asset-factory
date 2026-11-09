import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { MIGRATIONS_DIR } from '../src/db/migrate.ts';

// The migration runner identifies a migration by its three-digit number alone. Two files with the same
// number (easy to do when two PRs are built side by side) make the second one fail at startup, which
// stops the whole app from opening.
test('every migration file has its own number, with no gaps', () => {
  const numbers = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .map((f) => Number(f.slice(0, 3)))
    .sort((a, b) => a - b);
  assert.equal(new Set(numbers).size, numbers.length, `duplicate migration numbers: ${numbers.join(', ')}`);
  numbers.forEach((n, i) => assert.equal(n, i + 1, `migration numbers must run 1, 2, 3 ... without gaps; found ${n} at position ${i + 1}`));
});
