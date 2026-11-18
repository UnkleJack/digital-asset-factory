import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { jaccard } from '../src/engine/qa/service.ts';

/*
 * npm run prompt-inventory
 *
 * Phase 3 of the catalog plan (owner, 2026-11-18): before any prompt-pack product is built, sort through every
 * prompt the owner already has. This only READS the owner's prompt folders; it never changes them, never reads
 * .env or key files, and never calls an AI.
 *
 * It writes two things, both in data/, which is never committed (the repository is public, and prompt titles and
 * which ones copy which are the owner's business):
 *   data/prompt-inventory.md      counts by source and domain, how many were tested or reviewed, and the duplicate
 *                                 groups by title. No prompt text.
 *   data/prompt-inventory.json    one record per prompt (source, id or file, title, domain, marks, a fingerprint).
 *
 * Sources (each skipped with a note when missing). Paths can be changed with PROMPT_SOURCES_HOME.
 */

const HOME = process.env.PROMPT_SOURCES_HOME ?? homedir();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = {
  unifiedDb: join(HOME, 'Projects/active/PromptPimps_Unified/data/prompts.db'),
  unifiedSkills: join(HOME, 'Projects/active/PromptPimps_Unified/data/skills.db'),
  unifiedTemplates: join(HOME, 'Projects/active/PromptPimps_Unified/templates'),
  peLibrary: join(HOME, 'Projects/active/prompt-engineering-library'),
  oldStore: join(HOME, 'Desktop/export-core/Projects/PromptPimps/products'),
  hermesEngine: join(HOME, '.hermes/skills/productivity/prompt-template-engine'),
  templateGenerator: join(HOME, 'Desktop/Template-Generator'),
  promptTester: join(HOME, 'Projects/active/prompt-tester'),
};

interface Item {
  source: string;
  ref: string;
  title: string;
  domain: string;
  kind: string;
  /** Owner's or tooling's marks found with the prompt (status, tier, quality, test score, verified...). */
  marks: Record<string, string | number | null>;
  /** sha256 of the normalised text: the same text in two places gets the same fingerprint. */
  fingerprint: string;
  words: Set<string>;
}

const notes: string[] = [];
const items: Item[] = [];

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fp = (t: string) => createHash('sha256').update(norm(t)).digest('hex').slice(0, 16);
const wordSet = (t: string) => new Set(norm(t).split(' ').filter((w) => w.length > 3));
const titleOf = (md: string, fallback: string) => (md.match(/^#\s+(.+)$/m)?.[1] ?? fallback).replace(/^PE-\d+:\s*/, '').trim();

function add(source: string, ref: string, title: string, domain: string, kind: string, text: string, marks: Item['marks'] = {}) {
  items.push({ source, ref, title: title.slice(0, 160), domain: domain || 'unsorted', kind: kind || 'prompt', marks, fingerprint: fp(text), words: wordSet(text) });
}

function readDb(path: string, label: string, sql: string, row: (r: Record<string, unknown>) => void) {
  if (!existsSync(path)) return notes.push(`${label}: not found at ${path}, skipped.`);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    for (const r of db.prepare(sql).all() as Record<string, unknown>[]) row(r);
  } catch (err) {
    notes.push(`${label}: could not be read (${(err as Error).message}).`);
  } finally {
    db.close();
  }
}

function markdownFiles(dir: string, label: string, match: (f: string) => boolean = (f) => f.endsWith('.md')): { file: string; text: string }[] {
  if (!existsSync(dir)) {
    notes.push(`${label}: not found at ${dir}, skipped.`);
    return [];
  }
  return readdirSync(dir).filter((f) => match(f) && statSync(join(dir, f)).isFile()).map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }));
}

// 1. The PromptPimps store's prompt database: the 672 live prompts with their tiers, scores and review marks.
readDb(SOURCES.unifiedDb, 'PromptPimps prompts.db', 'SELECT uuid, title, domain, function_type, status, tier, price_cents, quality_score, test_score, review_status, prompt_text FROM prompts', (r) =>
  add('PromptPimps store (prompts.db)', String(r.uuid), String(r.title), String(r.domain ?? ''), String(r.function_type ?? ''), String(r.prompt_text ?? ''), {
    status: r.status as string, tier: r.tier as number, priceCents: r.price_cents as number, quality: r.quality_score as number, testScore: (r.test_score as number) ?? null, review: (r.review_status as string) ?? null,
  }));

// 2. The skills database's templates (the Workflow Composer's markdown templates).
readDb(SOURCES.unifiedSkills, 'PromptPimps skills.db', 'SELECT id, title, domain, function_type, status, template_grade, content FROM templates', (r) =>
  add('PromptPimps skill templates (skills.db)', `template:${r.id}`, String(r.title), String(r.domain ?? ''), String(r.function_type ?? 'template'), String(r.content ?? ''), {
    status: (r.status as string) ?? null, grade: (r.template_grade as string) ?? null,
  }));

// 3. The PromptPimps templates folder (markdown files).
for (const f of markdownFiles(SOURCES.unifiedTemplates, 'PromptPimps templates folder')) add('PromptPimps templates folder', f.file, titleOf(f.text, basename(f.file, '.md')), '', 'template', f.text);

// 4. The prompt-engineering library: hand-written prompts with a technique and a tested-model note.
for (const f of markdownFiles(SOURCES.peLibrary, 'Prompt engineering library', (x) => /^PE-\d+.*\.md$/.test(x))) {
  const field = (name: string) => f.text.match(new RegExp(`##\\s*${name}\\s*\\n+([^\\n#]+)`, 'i'))?.[1]?.trim() ?? null;
  add('Prompt engineering library', f.file, titleOf(f.text, f.file), field('Category') ?? '', field('Technique') ?? 'prompt', f.text, { modelTested: field('Model Tested'), verified: field('Verified Output') ?? field('Verified') });
}

// 5. The older store's generated product files.
for (const f of markdownFiles(SOURCES.oldStore, 'Old PromptPimps store products')) add('Old PromptPimps store (export-core)', f.file, titleOf(f.text, basename(f.file, '.md')), f.file.split('_')[0] ?? '', 'product', f.text);

// Engines and stores that hold no fixed prompts to count, noted so nothing is silently left out.
if (existsSync(SOURCES.hermesEngine)) notes.push(`Hermes prompt-template-engine (${SOURCES.hermesEngine}) is a generator: it makes new prompts on demand, so it has no fixed list to count.`);
if (existsSync(SOURCES.templateGenerator)) notes.push(`Template-Generator (${SOURCES.templateGenerator}) keeps its templates in MongoDB, which this script does not read.`);
if (existsSync(SOURCES.promptTester)) notes.push(`prompt-tester (${SOURCES.promptTester}) is the testing agent; its tested prompts are not read yet. Once its output format is settled, add it here.`);

// Duplicates: the same text (fingerprint), then near-duplicates (word overlap of 85% or more) across everything.
const exact = new Map<string, Item[]>();
for (const it of items) exact.set(it.fingerprint, [...(exact.get(it.fingerprint) ?? []), it]);
const exactGroups = [...exact.values()].filter((g) => g.length > 1);
const near: [Item, Item, number][] = [];
const firsts = [...exact.values()].map((g) => g[0]!);
for (let i = 0; i < firsts.length; i++) {
  for (let j = i + 1; j < firsts.length; j++) {
    const a = firsts[i]!, b = firsts[j]!;
    if (Math.min(a.words.size, b.words.size) / Math.max(a.words.size, b.words.size, 1) < 0.85) continue;
    const s = jaccard(a.words, b.words);
    if (s >= 0.85) near.push([a, b, s]);
  }
}

// Distinct prompts: exact copies and chains of near-copies merged into one group each (union-find).
const parent = new Map<Item, Item>(firsts.map((f) => [f, f]));
const find = (x: Item): Item => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
for (const [a, b] of near) parent.set(find(a), find(b));
const distinct = new Set(firsts.map(find)).size;
const tilde = (t: string) => t.split(homedir()).join('~');

// The report: counts only, never prompt text.
const count = <K>(xs: K[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<K, number>())].sort((a, b) => b[1] - a[1]);
const lines: string[] = [];
lines.push('# Prompt inventory', '', `Made by \`npm run prompt-inventory\` on ${new Date().toISOString().slice(0, 10)}. Read only: nothing in the prompt folders was changed. No prompt text is in this file; the full list is in \`data/prompt-inventory.json\` next to it. Both stay on the Mac and are never committed.`, '');
lines.push(`**${items.length} prompts and templates** in ${count(items.map((i) => i.source)).length} sources. **${exact.size}** distinct texts after removing exact copies, and about **${distinct}** truly different prompts once near-copies (85%+ the same words, ${near.length} pairs) are merged too. The same prompt often sits in several folders under a different title.`, '');
lines.push('## By source', '', '| Source | Items |', '| --- | --- |', ...count(items.map((i) => i.source)).map(([s, n]) => `| ${s} | ${n} |`), '');
lines.push('## By domain', '', '| Domain | Items |', '| --- | --- |', ...count(items.map((i) => i.domain)).map(([d, n]) => `| ${d} | ${n} |`), '');
const store = items.filter((i) => i.source.startsWith('PromptPimps store'));
if (store.length) {
  const tested = store.filter((i) => i.marks.testScore !== null && i.marks.testScore !== undefined);
  lines.push('## What is already marked (PromptPimps store)', '',
    `- Status: ${count(store.map((i) => String(i.marks.status))).map(([s, n]) => `${s} ${n}`).join(', ')}`,
    `- Has a test score: ${tested.length} of ${store.length}`,
    `- Has a review status: ${store.filter((i) => i.marks.review).length} of ${store.length}`,
    `- Average quality score: ${(store.reduce((a, i) => a + Number(i.marks.quality ?? 0), 0) / store.length).toFixed(1)} (the store's own 0-100 score)`, '');
}
lines.push('## Exact copies', '', exactGroups.length ? `${exactGroups.length} texts appear more than once:` : 'None.', '');
for (const g of exactGroups.slice(0, 60)) lines.push(`- ${g.map((i) => `${i.title} (${i.source})`).join(' = ')}`);
if (exactGroups.length > 60) lines.push(`- …and ${exactGroups.length - 60} more (see the JSON).`);
lines.push('', '## Near-copies', '', near.length ? `${near.length} pairs, most alike first:` : 'None.', '');
for (const [a, b, s] of near.sort((x, y) => y[2] - x[2]).slice(0, 60)) lines.push(`- ${Math.round(s * 100)}%: ${a.title} (${a.source}) ~ ${b.title} (${b.source})`);
if (near.length > 60) lines.push(`- …and ${near.length - 60} more (see the JSON).`);
lines.push('', '## Not counted', '', ...notes.map((n) => `- ${tilde(n)}`), '');
lines.push('## Next', '', '- The owner picks which domains and prompts are worth selling as business prompt packs.', "- Tested prompts from the prompt-testing agent get added as a source once its output format is known.", '- Licences: check each source before selling. The PromptPimps launch plan says its derived templates are Apache 2.0; nothing here checks that.', '');

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data/prompt-inventory.md'), lines.join('\n'));
writeFileSync(join(ROOT, 'data/prompt-inventory.json'), JSON.stringify({
  madeAt: new Date().toISOString(), notes,
  items: items.map(({ words: _w, ...rest }) => rest),
  exactGroups: exactGroups.map((g) => g.map((i) => ({ source: i.source, ref: i.ref, title: i.title }))),
  nearCopies: near.map(([a, b, s]) => ({ similarity: Math.round(s * 100) / 100, a: { source: a.source, ref: a.ref, title: a.title }, b: { source: b.source, ref: b.ref, title: b.title } })),
}, null, 2));
console.log(`${items.length} items from ${count(items.map((i) => i.source)).length} sources; ${exactGroups.length} exact-copy groups; ${near.length} near-copy pairs.`);
console.log('Wrote data/prompt-inventory.md and data/prompt-inventory.json (not committed).');
