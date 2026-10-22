import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productTypes } from '../src/engine/producttypes/registry.ts';
import { BUILTIN_THEMES, BUILTIN_AUDIENCES } from '../src/engine/templates/library.ts';
import { unknownWords, isKnown, dictionaryAvailable } from '../src/engine/qa/spelling.ts';
import { findPlaceholders, findBlockedTerms, jaccard } from '../src/engine/qa/service.ts';
import { deterministicCopy, normalizeTags, fitTitle } from '../src/engine/listing/service.ts';
import { SettingsSchema } from '../src/config/settings.ts';
import { makeContext, deterministic } from './helpers.ts';

const defaults = SettingsSchema.parse({});

test('spelling: inflections resolve to dictionary words; real typos are reported', { skip: !dictionaryAvailable() && 'no system dictionary' }, () => {
  for (const w of ['verified', 'planners', 'decluttering', 'happier', 'easily', 'printables', 'downloadable', 'mazes']) assert.ok(isKnown(w, new Set()), w);
  assert.deepEqual(unknownWords(['Plan your weeek with this calendr'], []), ['calendr', 'weeek']);
  assert.deepEqual(unknownWords(['Plan your weeek'], ['weeek']), []);
});

test('built-in copy for every product type, theme and audience has no unknown words', { skip: !dictionaryAvailable() && 'no system dictionary' }, () => {
  const problems: string[] = [];
  const allow = defaults.qa.spellingAllowlist;
  for (const def of productTypes().filter((t) => t.id !== 'bundle')) {
    for (const theme of [undefined, ...BUILTIN_THEMES.map((t) => t.name)]) {
      for (const audience of [undefined, ...BUILTIN_AUDIENCES.map((a) => a.name)]) {
        const ctx = makeContext(def, { theme, audience });
        const content = deterministic(def, ctx);
        const hints = def.listingHints(ctx, content);
        const copy = deterministicCopy(ctx.title, hints, defaults.marketplaces.etsy.rules, def.name);
        const texts = [ctx.title, ...def.qaText(content), copy.title, copy.description, ...copy.tags];
        const unknown = unknownWords(texts, allow);
        if (unknown.length) problems.push(`${def.id}/${theme ?? '-'}/${audience ?? '-'}: ${unknown.join(', ')}`);
        const ph = findPlaceholders(texts);
        if (ph.length) problems.push(`${def.id}/${theme ?? '-'}: placeholder ${ph.join(' | ')}`);
      }
    }
  }
  const words = [...new Set(problems.map((p) => p.split(": ")[1]).flatMap((w) => w.split(", ")))].sort();
  assert.deepEqual(words, [], problems.slice(0, 5).join("\n"));
});

test('placeholder detection', () => {
  assert.deepEqual(findPlaceholders(['A calendar for 2027']), []);
  for (const t of ['Lorem ipsum dolor', 'Title: TODO', 'Hello {{name}}', '[INSERT TITLE]', 'TBD']) assert.ok(findPlaceholders([t]).length > 0, t);
});

test('blocked trademark terms are found case-insensitively on word boundaries', () => {
  const terms = defaults.compliance.blockedTerms;
  assert.ok(findBlockedTerms(['Princess coloring pages, DISNEY style'], terms).length > 0);
  assert.deepEqual(findBlockedTerms(['A dinosaur coloring book'], terms), []);
});

test('jaccard similarity', () => {
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['a', 'b'])), 1);
  assert.equal(jaccard(new Set(['a']), new Set(['b'])), 0);
  assert.equal(jaccard(new Set(), new Set()), 1); // two empty texts count as identical
});

test('listing tags and titles are fitted to marketplace limits', () => {
  const rules = defaults.marketplaces.etsy.rules;
  const r = normalizeTags(['Word Search', 'word search', 'a tag that is far too long for etsy', 'x', ...Array.from({ length: 20 }, (_, i) => `tag ${i}`)], rules);
  assert.ok(r.tags.length <= rules.tagsMax);
  assert.ok(r.tags.every((t) => t.length <= rules.tagMaxLen));
  assert.equal(r.tags.filter((t) => t === 'word search').length, 1);
  assert.ok(r.notes.length > 0);
  assert.ok(fitTitle(['A'.repeat(100), 'B'.repeat(100)], rules.titleMax).length <= rules.titleMax);
});
