import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import {
  importReferenceImage, importReferenceText, deleteReference, listReferences, listTags, tagReferences, tagsFor,
  normalizeTag, UNTAGGED, MAX_TAGS_PER_ITEM,
} from '../src/engine/references/service.ts';
import { tempDir } from './helpers.ts';

// A 1x1 PNG; a different last byte of the IDAT CRC is not needed because each test uses its own text or a fresh copy.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let app: App;
before(() => { app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false }); });
after(async () => { await app.close(); });

/** The same picture with a different trailing comment, so each one is a new import (not a duplicate). */
const picture = (n: number) => Buffer.concat([PNG, Buffer.from(`test-${n}`)]);
const importedId = (o: ReturnType<typeof importReferenceImage>) => {
  assert.equal(o.status, 'imported', JSON.stringify(o));
  return (o as Extract<typeof o, { status: 'imported' }>).item.id;
};

test('tags are cleaned to lower-case slugs', () => {
  assert.equal(normalizeTag('  Script Fonts! '), 'script-fonts');
  assert.equal(normalizeTag('***'), '');
});

test('tags typed at import time go on the picture, cleaned and without repeats', () => {
  const id = importedId(importReferenceImage(app, { fileName: 'font-sheet.png', data: picture(1), tags: ['Fonts', 'fonts', 'Art', ' '] }));
  assert.deepEqual(tagsFor(app, [id]).get(id), ['art', 'fonts']);
});

test('dropping a picture that is already there adds the new tags to it instead of making a copy', () => {
  const id = importedId(importReferenceImage(app, { fileName: 'a.png', data: picture(2) }));
  const again = importReferenceImage(app, { fileName: 'a-again.png', data: picture(2), tags: ['planners'] });
  assert.equal(again.status, 'duplicate');
  assert.equal((again as Extract<typeof again, { status: 'duplicate' }>).tagsAdded, 1);
  assert.deepEqual(tagsFor(app, [id]).get(id), ['planners']);
});

test('the library can show one group, or only what is still to sort', () => {
  const tagged = importedId(importReferenceImage(app, { fileName: 'b.png', data: picture(3), tags: ['mandala'] }));
  const loose = importedId(importReferenceImage(app, { fileName: 'c.png', data: picture(4) }));
  assert.deepEqual(listReferences(app, 'image', 'mandala').map((r) => r.id), [tagged]);
  const toSort = listReferences(app, 'image', UNTAGGED).map((r) => r.id);
  assert.ok(toSort.includes(loose));
  assert.ok(!toSort.includes(tagged));
});

test('tagging many at once adds and removes, and one item can sit in several groups', () => {
  const a = importedId(importReferenceImage(app, { fileName: 'd.png', data: picture(5), tags: ['fonts'] }));
  const b = importedId(importReferenceImage(app, { fileName: 'e.png', data: picture(6), tags: ['fonts'] }));
  const r = tagReferences(app, { ids: [a, b], add: ['art', 'Wall Art'], remove: ['fonts'] });
  assert.equal(r.changed, 6);
  assert.deepEqual(tagsFor(app, [a]).get(a), ['art', 'wall-art']);
  assert.ok(listReferences(app, 'image', 'art').some((x) => x.id === b));
  assert.ok(listReferences(app, 'image', 'wall-art').some((x) => x.id === b));
  assert.throws(() => tagReferences(app, { ids: [a], add: [' '] }), /at least one tag/);
});

test('an item at the tag limit is reported, not silently cut', () => {
  const id = importedId(importReferenceImage(app, { fileName: 'f.png', data: picture(7) }));
  tagReferences(app, { ids: [id], add: Array.from({ length: MAX_TAGS_PER_ITEM }, (_, i) => `t${i}`) });
  const r = tagReferences(app, { ids: [id], add: ['one-more'] });
  assert.deepEqual(r.full, [id]);
  assert.equal(tagsFor(app, [id]).get(id)?.length, MAX_TAGS_PER_ITEM);
});

test('text examples take tags too, and deleting an item takes its tags with it', () => {
  const o = importReferenceText(app, { field: 'title', text: 'Cozy Autumn Planner Bundle', tags: ['fonts'] });
  assert.equal(o.status, 'imported');
  const id = (o as Extract<typeof o, { status: 'imported' }>).item.id;
  assert.ok(listTags(app, 'text').some((t) => t.tag === 'fonts' && t.count === 1));
  deleteReference(app, id);
  assert.equal(app.db.value('SELECT COUNT(*) FROM reference_tags WHERE reference_id = ?', id), 0);
});
