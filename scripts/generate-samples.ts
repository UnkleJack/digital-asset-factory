// Produces one sample of every product type through the real pipeline (content → render → QA →
// package → listings) in a throwaway data folder, then copies the outputs to verification-output/samples.
// Usage: npm run samples [-- <type-id> ...]
import { mkdirSync, mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { bootstrap } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { createProduct, type CreateProductInput } from '../src/engine/specification/service.ts';
import { startPipeline } from '../src/jobs/pipeline.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import { productTypes } from '../src/engine/producttypes/registry.ts';
import { getVersion, listingsForVersion } from '../src/db/repos.ts';
import { qaReport } from '../src/engine/qa/service.ts';
import { createBundle } from '../src/engine/bundling/service.ts';

const outDir = resolve('verification-output/samples');
const dataDir = mkdtempSync(join(tmpdir(), 'daf-samples-'));
const only = process.argv.slice(2);

const app = bootstrap({ dataDir, secrets: new MemorySecretStore(), logConsole: false });
app.settings.update('scheduler', { retryBaseSeconds: 1 });
const worker = createWorker(app);
worker.start();

const idOf = (table: string, name: string) => app.db.value<string>(`SELECT id FROM ${table} WHERE name = ?`, name) ?? undefined;

// A deliberate spread of designs, audiences, themes and paper sizes so the samples cover the template system.
const VARIANTS: Record<string, Omit<CreateProductInput, 'productType'> & { design?: string; audience?: string; theme?: string }> = {
  'monthly-calendar': { design: 'Botanical Sage', theme: 'Botanical', params: { months: 3, holidays: 'us-federal' } },
  'weekly-planner': { design: 'Minimal Mono', audience: 'Students', params: { weeks: 4 } },
  'daily-planner': { design: 'Soft Pastel', audience: 'ADHD-friendly', paper: { size: 'a5' } },
  'habit-tracker': { design: 'Large Print High Contrast', audience: 'Seniors (large print)', params: { months: 2 } },
  'todo-checklist': { design: 'Warm Neutral', audience: 'Busy parents' },
  'cleaning-schedule': { design: 'Warm Neutral', theme: 'Farmhouse' },
  'home-inventory': { design: 'Minimal Mono', paper: { size: 'a4' } },
  'budget-planner': { design: 'Bold Modern', audience: 'Small business owners', params: { months: 3 } },
  'invoice-template': { design: 'Bold Modern', audience: 'Small business owners' },
  'guided-journal': { design: 'Soft Pastel', theme: 'New Year Reset' },
  'goal-planner': { design: 'Bold Modern', theme: 'New Year Reset', paper: { orientation: 'landscape' } },
  'mandala-coloring': { design: 'Minimal Mono', theme: 'Celestial' },
  'maze-activity': { design: 'Kids Bright', audience: 'Kids 4-8', theme: 'Space Adventure' },
  'word-search': { design: 'Kids Bright', audience: 'Kids 4-8', theme: 'Ocean' },
};

async function idle(timeoutMs = 300_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!app.db.value<number>("SELECT count(*) FROM jobs WHERE status IN ('queued','running')")) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Production did not finish in time');
}

interface Row { type: string; title: string; status: string; qa: string; files: string[]; problems: string[]; note?: string }
const rows: Row[] = [];
const produced: string[] = [];

try {
  for (const def of productTypes()) {
    if (def.id === 'bundle' || (only.length && !only.includes(def.id))) continue;
    if (def.artwork === 'ai-image') {
      rows.push({ type: def.id, title: def.name, status: 'skipped', qa: '—', files: [], problems: [], note: 'Needs an image provider (none configured), so it cannot be produced here.' });
      continue;
    }
    const v = VARIANTS[def.id] ?? {};
    const { version, product } = createProduct(app, {
      productType: def.id,
      params: v.params,
      paper: v.paper,
      designSystemId: v.design && idOf('design_systems', v.design),
      audienceId: v.audience ? idOf('audiences', v.audience) : null,
      themeId: v.theme ? idOf('themes', v.theme) : null,
      seed: 20261022,
    });
    startPipeline(app, version.id, { marketplaces: ['etsy', 'gumroad', 'generic'] });
    process.stdout.write(`${def.id} … `);
    await idle();
    rows.push(collect(def.id, product.id, version.id));
    produced.push(product.id);
    console.log(rows.at(-1)!.status);
  }

  if (!only.length || only.includes('bundle')) {
    const members = produced.slice(0, 3);
    const { versionId, productId } = createBundle(app, { title: 'Printable Planning Starter Bundle', productIds: members, marketplaces: ['etsy'] });
    process.stdout.write('bundle … ');
    await idle();
    rows.push(collect('bundle', productId, versionId));
    console.log(rows.at(-1)!.status);
  }
} finally {
  await worker.stop();
  await app.close();
}

function collect(type: string, productId: string, versionId: string): Row {
  const v = getVersion(app.db, versionId);
  const title = app.db.value<string>('SELECT title FROM products WHERE id = ?', productId) ?? type;
  const dir = join(outDir, type);
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  const assets = app.assets.forVersion(versionId);
  for (const a of assets) {
    const keep = a.role === 'deliverable' || a.kind === 'package_zip' || (a.kind === 'preview_png' && (a.page_index ?? 0) < 2) || (a.kind === 'listing_png' && (a.page_index ?? 0) === 0);
    if (!keep) continue;
    const name = a.kind === 'preview_png' ? `preview-page-${(a.page_index ?? 0) + 1}.png` : a.kind === 'listing_png' ? 'listing-image-1.png' : basename(a.rel_path);
    copyFileSync(app.assets.pathOf(a), join(dir, name));
    files.push(name);
  }
  const listings = listingsForVersion(app.db, versionId).map((l) => ({ marketplace: l.marketplace, status: l.status, title: l.title, tags: l.tags, price_cents: l.price_cents, description: l.description, validation: l.validation }));
  writeFileSync(join(dir, 'listings.json'), JSON.stringify(listings, null, 2));
  const qa = qaReport(app, versionId);
  writeFileSync(join(dir, 'qa.json'), JSON.stringify(qa, null, 2));
  files.push('listings.json', 'qa.json');
  const problems = qa.flatMap((r) => (r.results as Array<{ passed: boolean; severity: string; message: string }>).filter((x) => !x.passed).map((x) => `${x.severity}: ${x.message}`));
  return { type, title, status: v.status, qa: v.qa_status, files, problems, ...(v.error && { note: v.error }) };
}

const lines = [
  '# Sample outputs',
  '',
  `Generated ${new Date().toISOString()} by \`npm run samples\` with the built-in content library (no AI provider configured).`,
  'Each folder holds the deliverables, the customer ZIP, the first page previews, one listing image, the listing drafts and the full QA report.',
  '',
  '| Type | Title | Status | QA | Failed checks / warnings |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.type} | ${r.title} | ${r.status} | ${r.qa} | ${r.problems.length ? r.problems.join('<br>') : r.note ?? '—'} |`),
  '',
];
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'README.md'), lines.join('\n'));
console.log(`\nWrote ${rows.length} sample(s) to ${outDir}`);
const bad = rows.filter((r) => r.status !== 'ready' && r.status !== 'skipped');
if (bad.length) {
  console.error(`Not ready: ${bad.map((r) => `${r.type} (${r.status})`).join(', ')}`);
  process.exitCode = 1;
}
