import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, type PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import type { AppContext } from '../app/context.ts';
import { AssetStore } from '../storage/assetStore.ts';
import { sha256, randomSeed } from '../core/hash.ts';
import { productType } from '../engine/producttypes/registry.ts';
import { DesignTokensSchema, FONTS, FONT_IDS, FONT_PAIRINGS, PaperSchema, toGray, type FontId, type Paper } from '../engine/templates/library.ts';
import { designSystemWithFonts, type FontChoice } from '../engine/templates/designSystems.ts';
import { startPipeline } from '../jobs/pipeline.ts';
import { audit } from '../logging/logger.ts';
import { CONTENT_LIBRARY_REVISION } from '../engine/producttypes/library.ts';
import { seededRandom } from '../core/hash.ts';
import { buildContextFromSpec, contentSignature } from '../engine/specification/service.ts';
import type { SpecRow } from '../db/repos.ts';
import { createBatch, addToBatch } from '../engine/approval/batches.ts';
import { newId, idTime } from '../core/ids.ts';

/**
 * Puts products back into an empty or partial database from the files they left on disk.
 *
 * Every finished product folder holds internal/manifest.json, written at packaging time: the product,
 * version, spec (params, paper, seed) and every file with its checksum. That is enough to rebuild the
 * product, spec, version and asset rows with the original ids. What the manifest does not hold:
 *   - the design system (its id pointed into the lost database): the fonts are read back out of the PDF;
 *   - audience and theme (same reason): left empty;
 *   - AI-written content (it lived only in the database): those versions come back view-only.
 * Products whose content comes from the seed (contentProvenance.generator === 'deterministic') are put
 * back to be rebuilt by the normal pipeline, which recreates their content, QA results and listings.
 * Folders without a manifest (a build that stopped part way) come back as failed drafts with their files.
 */

export const RESTORE_NOTE = 'Restored from files on disk after the database was lost';

export interface RestoreFile {
  rel: string;
  kind: string;
  role: 'deliverable' | 'preview' | 'listing_image' | 'internal';
  mime: string;
  bytes: number;
  sha256: string;
  pageIndex: number | null;
  pageCount: number | null;
  widthPt: number | null;
  heightPt: number | null;
  widthPx: number | null;
  heightPx: number | null;
  provenance: Record<string, unknown>;
  /** The manifest recorded a different checksum: the file changed after packaging. */
  changed: boolean;
}

export interface RestoreItem {
  folder: string;
  productId: string;
  versionId: string;
  versionNo: number;
  slug: string;
  title: string;
  productType: string;
  mode: 'rebuild' | 'view_only' | 'unfinished';
  params: Record<string, unknown>;
  paper: Paper;
  seed: number;
  seedKnown: boolean;
  fonts: FontChoice | null;
  /** Fill and stroke colours on the PDF's first page (cover), used to recognise the design system's palette. */
  colors: string[];
  createdAt: string;
  contentProvenance: Record<string, unknown> | null;
  deliverableHash: string | null;
  generationRuns: Record<string, unknown>[];
  files: RestoreFile[];
  /** Files the manifest lists that are not on disk. */
  missing: string[];
  notes: string[];
}

export interface RestorePlan {
  items: RestoreItem[];
  skipped: { folder: string; reason: string }[];
}

interface Manifest {
  product: { id: string; slug: string; title: string; type: string };
  version: { id: string; number: number; origin: string; parent: string | null; createdAt: string };
  specification: { params: Record<string, unknown>; paper: Partial<Paper>; seed: number };
  contentProvenance?: Record<string, unknown>;
  generationRuns?: Record<string, unknown>[];
  files: { path: string; role: string; kind: string; sha256: string; bytes: number; provenance?: Record<string, unknown> }[];
  deliverableHash?: string;
  packagedAt?: string;
}

const PRODUCT_DIR = /^prd_[0-9a-z]+$/;
const VERSION_DIR = /^v(\d+)$/;

export async function planRestore(app: AppContext): Promise<RestorePlan> {
  const items: RestoreItem[] = [];
  const skipped: { folder: string; reason: string }[] = [];
  const productsDir = app.assets.resolve('products');
  if (!existsSync(productsDir)) return { items, skipped };
  const readManifest = (folder: string): Manifest | null => {
    const path = app.assets.resolve(`${folder}/internal/manifest.json`);
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Manifest) : null;
  };
  // Each candidate folder, grouped by the product it belongs to.
  const byProduct = new Map<string, { folder: string; versionNo: number; manifest: Manifest | null }[]>();
  const add = (productId: string, c: { folder: string; versionNo: number; manifest: Manifest | null }) => byProduct.set(productId, [...(byProduct.get(productId) ?? []), c]);
  for (const p of readdirSync(productsDir, { withFileTypes: true })) {
    if (!p.isDirectory()) continue;
    if (PRODUCT_DIR.test(p.name)) {
      // Old layout: products/<product id>/v<n>. Folders without a manifest can still be recognised from their files.
      for (const v of readdirSync(`${productsDir}/${p.name}`, { withFileTypes: true })) {
        if (!v.isDirectory() || !VERSION_DIR.test(v.name)) continue;
        const folder = `products/${p.name}/${v.name}`;
        try {
          add(p.name, { folder, versionNo: Number(VERSION_DIR.exec(v.name)![1]), manifest: readManifest(folder) });
        } catch (err) {
          skipped.push({ folder, reason: `unreadable manifest: ${(err as Error).message}` });
        }
      }
      continue;
    }
    // Readable layout: products/<category>/<name>_<date>. Only a manifest says which product a folder holds.
    for (const v of readdirSync(`${productsDir}/${p.name}`, { withFileTypes: true })) {
      if (!v.isDirectory()) continue;
      const folder = `products/${p.name}/${v.name}`;
      if (app.db.get('SELECT 1 FROM product_versions WHERE asset_dir = ?', folder)) continue;
      try {
        const m = readManifest(folder);
        if (m) add(m.product.id, { folder, versionNo: m.version.number, manifest: m });
        else skipped.push({ folder, reason: 'no manifest, so there is no record of which product it was' });
      } catch (err) {
        skipped.push({ folder, reason: `unreadable manifest: ${(err as Error).message}` });
      }
    }
  }
  for (const [productId, candidates] of byProduct) {
    if (app.db.get('SELECT 1 FROM products WHERE id = ?', productId)) {
      if (candidates.some((c) => !app.db.get('SELECT 1 FROM assets WHERE rel_path LIKE ?', `${c.folder}/%`))) skipped.push({ folder: candidates[0].folder, reason: 'its product is already in the database' });
      continue;
    }
    candidates.sort((a, b) => a.versionNo - b.versionNo);
    const found: RestoreItem[] = [];
    for (const c of candidates) {
      if (app.db.get('SELECT 1 FROM assets WHERE rel_path LIKE ?', `${c.folder}/%`)) {
        skipped.push({ folder: c.folder, reason: 'its files are already recorded for another product' });
        continue;
      }
      if (found.some((f) => f.versionNo === c.versionNo)) {
        skipped.push({ folder: c.folder, reason: `a second copy of version ${c.versionNo}` });
        continue;
      }
      try {
        found.push(c.manifest ? await fromManifest(app, c.folder, c.manifest) : await fromFiles(app, c.folder, productId, c.versionNo));
      } catch (err) {
        skipped.push({ folder: c.folder, reason: (err as Error).message });
      }
    }
    // Every version of a product shares its title and slug; take them from the newest one.
    const latest = found.at(-1);
    for (const it of found) {
      if (!latest) break;
      it.title = latest.title;
      it.slug = latest.slug;
    }
    for (const it of found) it.notes.push(it.fonts ? `fonts in the PDF: ${FONTS[it.fonts.heading].family} headings, ${FONTS[it.fonts.body].family} body` : 'no known fonts found in the PDF; the default design system will be used');
    items.push(...found);
  }
  const slugs = new Map<string, string>();
  const taken = new Set<string>();
  for (const it of items) {
    const known = slugs.get(it.productId);
    if (known) {
      it.slug = known;
      continue;
    }
    let slug = it.slug;
    for (let i = 2; taken.has(slug) || app.db.get('SELECT 1 FROM products WHERE slug = ?', slug); i++) slug = `${it.slug}-${i}`;
    if (slug !== it.slug) it.notes.push(`slug "${it.slug}" was taken, using "${slug}"`);
    it.slug = slug;
    slugs.set(it.productId, slug);
    taken.add(slug);
  }
  return { items, skipped };
}

async function fromManifest(app: AppContext, folder: string, m: Manifest): Promise<RestoreItem> {
  const def = productType(m.product.type);
  const legacy = PRODUCT_DIR.test(folder.split('/')[1]);
  if (legacy && folder !== AssetStore.legacyVersionDir(m.product.id, m.version.number)) throw new Error(`manifest is for ${m.product.id} v${m.version.number}, not this folder`);
  const notes: string[] = [];
  const files: RestoreFile[] = [];
  const missing: string[] = [];
  for (const f of m.files) {
    const rel = f.path;
    if (!rel.startsWith(`${folder}/`) || rel === `${folder}/internal/manifest.json`) {
      notes.push(`ignored manifest entry outside this folder: ${rel}`);
      continue;
    }
    if (!existsSync(app.assets.resolve(rel))) {
      missing.push(rel);
      continue;
    }
    files.push(await describe(app, rel, { kind: f.kind, role: f.role as RestoreFile['role'], expectedSha: f.sha256, provenance: f.provenance ?? {} }));
  }
  const manifestRel = `${folder}/internal/manifest.json`;
  files.push(await describe(app, manifestRel, { kind: 'manifest', role: 'internal', provenance: { generator: 'packaging@1' } }));
  if (missing.length) notes.push(`${missing.length} listed file(s) are missing`);
  if (files.some((f) => f.changed)) notes.push(`${files.filter((f) => f.changed).length} file(s) differ from the checksum in the manifest`);
  // Rebuild only what the seed alone reproduces: deterministic text from today's library, and artwork that is
  // either absent or procedural. AI images and imported images cannot be made again, so those stay view-only.
  const deterministic = m.contentProvenance?.generator === 'deterministic';
  const sameLibrary = !m.contentProvenance?.library || m.contentProvenance.library === CONTENT_LIBRARY_REVISION;
  const rebuildable = deterministic && sameLibrary && (def.artwork === 'none' || def.artwork === 'procedural');
  if (deterministic && !sameLibrary) notes.push(`built with ${String(m.contentProvenance?.library)}, the app now has ${CONTENT_LIBRARY_REVISION}: restored view-only so its text is not changed`);
  else if (deterministic && !rebuildable) notes.push(`its ${def.artwork} artwork cannot be made again from the seed: restored view-only`);
  const pdf = files.find((f) => f.kind === 'pdf');
  return {
    folder,
    productId: m.product.id,
    versionId: m.version.id,
    versionNo: m.version.number,
    slug: m.product.slug,
    title: m.product.title,
    productType: def.id,
    mode: rebuildable ? 'rebuild' : 'view_only',
    params: def.paramsSchema.parse(m.specification.params) as Record<string, unknown>,
    paper: PaperSchema.parse(m.specification.paper ?? {}),
    seed: m.specification.seed,
    seedKnown: true,
    fonts: pdf ? await fontsFromPdf(app, pdf.rel) : null,
    colors: pdf ? await coverColors(app, pdf.rel) : [],
    createdAt: m.version.createdAt,
    contentProvenance: m.contentProvenance ?? null,
    deliverableHash: m.deliverableHash ?? null,
    generationRuns: m.generationRuns ?? [],
    files,
    missing,
    notes,
  };
}

/** A folder with no manifest: the build stopped before packaging. Only coloring-page sets (artwork + PDF) are recognised. */
async function fromFiles(app: AppContext, folder: string, productId: string, versionNo: number): Promise<RestoreItem> {
  const abs = app.assets.resolve(folder);
  const top = readdirSync(abs);
  const pdfName = top.find((f) => f.endsWith('.pdf'));
  if (!pdfName) throw new Error('no manifest and no PDF, nothing to restore');
  const artwork = existsSync(`${abs}/artwork`) ? readdirSync(`${abs}/artwork`).filter((f) => /^mandala-\d+\.svg$/.test(f)).sort() : [];
  if (!artwork.length) throw new Error('no manifest, and the files do not look like a mandala set; restore it by hand');
  const files: RestoreFile[] = [];
  for (const [i, name] of artwork.entries()) files.push(await describe(app, `${folder}/artwork/${name}`, { kind: 'artwork_svg', role: 'deliverable', pageIndex: i, provenance: { generator: 'procedural-mandala@1', restoredWithoutManifest: true } }));
  const pdf = await describe(app, `${folder}/${pdfName}`, { kind: 'pdf', role: 'deliverable', provenance: { generator: 'chrome-pdf', restoredWithoutManifest: true } });
  files.push(pdf);
  const previews = existsSync(`${abs}/previews`) ? readdirSync(`${abs}/previews`).filter((f) => /^page-\d+\.png$/.test(f)).sort() : [];
  for (const [i, name] of previews.entries()) files.push(await describe(app, `${folder}/previews/${name}`, { kind: 'preview_png', role: 'preview', pageIndex: i, provenance: { generator: 'chrome-screenshot', restoredWithoutManifest: true } }));
  const known = new Set(['artwork', 'previews', pdfName]);
  const notes = ['no manifest: the build stopped before packaging, so its seed and exact settings were not saved'];
  const extra = top.filter((f) => !known.has(f));
  if (extra.length) notes.push(`left unrecorded: ${extra.join(', ')}`);
  const slug = pdfName.replace(/\.pdf$/, '');
  const title = slug.replace(/-(\d+)$/, ' $1').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const coverPages = (pdf.pageCount ?? 0) - artwork.length;
  const complexity = /intricate|detailed/i.test(slug) ? 'detailed' : 'medium';
  notes.push(`settings read from the files: ${artwork.length} pages, ${coverPages > 0 ? 'with' : 'no'} cover, complexity "${complexity}" (from the name)`);
  return {
    folder,
    productId,
    versionId: '',
    versionNo,
    slug,
    title,
    productType: 'mandala-coloring',
    mode: 'unfinished',
    params: productType('mandala-coloring').paramsSchema.parse({ pages: artwork.length, complexity, cover: coverPages > 0 }) as Record<string, unknown>,
    paper: paperFromPoints(pdf.widthPt, pdf.heightPt),
    seed: randomSeed(),
    seedKnown: false,
    fonts: await fontsFromPdf(app, pdf.rel),
    colors: await coverColors(app, pdf.rel),
    createdAt: (idTime(productId) ?? statSync(app.assets.resolve(pdf.rel)).mtime).toISOString(),
    contentProvenance: null,
    deliverableHash: null,
    generationRuns: [],
    files,
    missing: [],
    notes,
  };
}

const MIME: Record<string, string> = { pdf: 'application/pdf', svg: 'image/svg+xml', png: 'image/png', zip: 'application/zip', txt: 'text/plain', json: 'application/json', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv' };

async function describe(app: AppContext, rel: string, o: { kind: string; role: RestoreFile['role']; expectedSha?: string; pageIndex?: number; provenance: Record<string, unknown> }): Promise<RestoreFile> {
  const buf = readFileSync(app.assets.resolve(rel));
  const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase();
  const sha = sha256(buf);
  const f: RestoreFile = { rel, kind: o.kind, role: o.role, mime: MIME[ext] ?? 'application/octet-stream', bytes: buf.byteLength, sha256: sha, pageIndex: o.pageIndex ?? null, pageCount: null, widthPt: null, heightPt: null, widthPx: null, heightPx: null, provenance: o.provenance, changed: !!o.expectedSha && o.expectedSha !== sha };
  if (ext === 'png' && buf.length > 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
    f.widthPx = buf.readUInt32BE(16);
    f.heightPx = buf.readUInt32BE(20);
  }
  const page = /(?:page|image|mandala)-(\d+)\.(?:png|svg)$/.exec(rel);
  if (page && f.pageIndex === null) f.pageIndex = Number(page[1]) - 1;
  if (ext === 'svg') {
    const vb = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(buf.toString('utf8', 0, 400));
    if (vb) [f.widthPx, f.heightPx] = [Math.round(Number(vb[1])), Math.round(Number(vb[2]))];
  }
  if (ext === 'pdf') {
    const doc = await PDFDocument.load(buf, { updateMetadata: false });
    const size = doc.getPage(0).getSize();
    f.pageCount = doc.getPageCount();
    f.widthPt = size.width;
    f.heightPt = size.height;
  }
  return f;
}

function paperFromPoints(w: number | null, h: number | null): Paper {
  const sizes: [Paper['size'], number, number][] = [['letter', 612, 792], ['a4', 595, 842], ['a5', 420, 595], ['half-letter', 396, 612], ['legal', 612, 1008]];
  const short = Math.min(w ?? 612, h ?? 792);
  const long = Math.max(w ?? 612, h ?? 792);
  const hit = sizes.find(([, s, l]) => Math.abs(s - short) < 3 && Math.abs(l - long) < 3);
  return PaperSchema.parse({ size: hit?.[0] ?? 'letter', orientation: (w ?? 0) > (h ?? 0) ? 'landscape' : 'portrait' });
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Reads the embedded font names (e.g. "ABCDEF+Lora-Bold") and maps them to the app's font ids: bold = heading, regular = body. */
export async function fontsFromPdf(app: AppContext, rel: string): Promise<FontChoice | null> {
  const doc = await PDFDocument.load(readFileSync(app.assets.resolve(rel)), { updateMetadata: false });
  const names: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of('Type')) !== PDFName.of('Font')) continue;
    const base = obj.get(PDFName.of('BaseFont'));
    if (base) names.push(base.toString().replace(/^\//, '').replace(/^[A-Z]{6}\+/, ''));
  }
  return fontsFromNames(names);
}

/** Maps embedded font names such as "Lora-Bold" or "NunitoExtraLight-SemiBold" to heading, body and accent fonts. */
export function fontsFromNames(names: string[]): FontChoice | null {
  const byLength = [...FONT_IDS].sort((a, b) => normalise(FONTS[b].family).length - normalise(FONTS[a].family).length);
  const idOf = (name: string): FontId | null => byLength.find((id) => normalise(name.split('-')[0]).startsWith(normalise(FONTS[id].family))) ?? null;
  const faces = names.map((n) => ({ id: idOf(n), weight: (/-([a-z]+)$/i.exec(n)?.[1] ?? '').toLowerCase() })).filter((f): f is { id: FontId; weight: string } => !!f.id);
  const used = [...new Set(faces.map((f) => f.id))];
  if (!used.length) return null;
  if (used.length === 1) return { ...(FONT_PAIRINGS.find((p) => p.fonts.heading === used[0] && p.fonts.body === used[0])?.fonts ?? { heading: used[0], body: used[0], accent: used[0] }) };
  // A known pairing whose heading and body are both in the PDF is the best evidence of which font did what.
  const pairing = FONT_PAIRINGS.filter((p) => used.includes(p.fonts.heading) && used.includes(p.fonts.body) && p.fonts.heading !== p.fonts.body)
    .sort((a, b) => Number(used.includes(b.fonts.accent)) - Number(used.includes(a.fonts.accent)))[0];
  if (pairing) return { ...pairing.fonts };
  // Otherwise body text is set in regular and semibold, so the body font is the one with those weights;
  // the heading is the other font (bold, or a display face that only has one weight).
  const weightsOf = (id: FontId) => new Set(faces.filter((f) => f.id === id).map((f) => f.weight));
  const body = used.find((id) => weightsOf(id).has('semibold')) ?? used.find((id) => weightsOf(id).has('regular') && FONTS[id].weights.length > 1) ?? used[used.length - 1];
  const heading = used.find((id) => id !== body && weightsOf(id).has('bold')) ?? used.find((id) => id !== body) ?? body;
  const accent = used.find((id) => id !== body && id !== heading) ?? heading;
  return { heading, body, accent };
}

/** The colours drawn on page 1, as #rrggbb. Pure black and white are left out: line art uses them whatever the design. */
export async function coverColors(app: AppContext, rel: string): Promise<string[]> {
  const doc = await PDFDocument.load(readFileSync(app.assets.resolve(rel)), { updateMetadata: false });
  const contents = doc.getPage(0).node.Contents();
  if (!contents) return [];
  const streams = contents instanceof PDFArray ? contents.asArray().map((x) => doc.context.lookup(x)) : [contents];
  let ops = '';
  for (const st of streams) ops += Buffer.from(decodePDFRawStream(st as PDFRawStream).decode()).toString('latin1');
  const out = new Set<string>();
  for (const m of ops.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (?:rg|RG)\b/g)) {
    const hex = `#${[m[1], m[2], m[3]].map((x) => Math.round(Number(x) * 255).toString(16).padStart(2, '0')).join('')}`;
    if (hex !== '#ffffff' && hex !== '#000000') out.add(hex);
  }
  return [...out];
}

/**
 * Picks the built-in look whose palette shows up on the cover (in colour or as grey for grayscale paper),
 * then gives it the fonts found in the PDF. The palette decides; fonts only break ties.
 */
function designSystemFor(app: AppContext, it: RestoreItem): { id: string; note: string; gray: boolean } {
  const builtins = app.db.all<{ id: string; name: string; tokens: string }>('SELECT id, name, tokens FROM design_systems WHERE is_builtin = 1 ORDER BY created_at, name');
  if (!builtins.length) throw new Error('No built-in design systems in the database; start the app once first');
  const colors = new Set(it.colors);
  const score = (t: string) => {
    const tokens = DesignTokensSchema.parse(JSON.parse(t));
    const palette = Object.values(tokens.palette).map((c) => c.toLowerCase());
    const shown = palette.filter((c) => colors.has(c) || colors.has(toGray(c).toLowerCase())).length;
    const f = it.fonts ? (tokens.fonts.heading === it.fonts.heading ? 1 : 0) + (tokens.fonts.body === it.fonts.body ? 1 : 0) : 0;
    return shown * 10 + f;
  };
  const ranked = builtins.map((b) => ({ ...b, score: score(b.tokens) })).sort((a, b) => b.score - a.score);
  const base = ranked[0];
  const basePalette = Object.values(DesignTokensSchema.parse(JSON.parse(base.tokens)).palette).map((c) => c.toLowerCase());
  const gray = !basePalette.some((c) => colors.has(c)) && basePalette.some((c) => colors.has(toGray(c).toLowerCase()));
  const how = base.score >= 20 ? `colours on the cover match "${base.name}"` : `cover colours not recognised, closest look "${base.name}"`;
  if (!it.fonts) return { id: base.id, note: `${how}; fonts not found in the PDF`, gray };
  const id = designSystemWithFonts(app, base.id, it.fonts, 'system');
  const name = app.db.value<string>('SELECT name FROM design_systems WHERE id = ?', id);
  return { id, note: `${how}${gray ? ' (printed in grayscale)' : ''}; design system "${name}"`, gray };
}

export interface RestoreResult {
  restored: { productId: string; versionId: string; title: string; mode: RestoreItem['mode']; queued: boolean }[];
  failed: { folder: string; error: string }[];
  /** The approval batch holding every restored product, so each can be reviewed, approved or regenerated. */
  batchId: string | null;
}

export function applyRestore(app: AppContext, plan: RestorePlan): RestoreResult {
  const restored: RestoreResult['restored'] = [];
  const failed: RestoreResult['failed'] = [];
  const byProduct = new Map<string, RestoreItem[]>();
  for (const it of plan.items) byProduct.set(it.productId, [...(byProduct.get(it.productId) ?? []), it]);
  for (const [productId, versions] of byProduct) {
    versions.sort((a, b) => a.versionNo - b.versionNo);
    const latest = versions.at(-1)!;
    try {
      app.db.tx(() => {
        const def = productType(latest.productType);
        const now = new Date().toISOString();
        for (const it of versions) it.versionId ||= newId('ver');
        const categoryId = app.db.value<string>('SELECT id FROM categories WHERE name = ?', def.category) ?? null;
        app.db.insert('products', { id: productId, slug: latest.slug, title: latest.title, product_type: def.id, category_id: categoryId, audience_id: null, theme_id: null, opportunity_id: null, template_id: null, status: 'active', current_version_id: latest.versionId, created_at: versions[0].createdAt, updated_at: now });
        let parent: string | null = null;
        for (const it of versions) {
          const ds = designSystemFor(app, it);
          it.notes.push(ds.note);
          if (it.mode === 'unfinished' && ds.gray) it.paper = { ...it.paper, grayscale: true };
          const specId = newId('spc');
          app.db.insert('product_specs', { id: specId, product_id: productId, product_type: def.id, params: JSON.stringify(it.params), design_system_id: ds.id, audience_id: null, theme_id: null, paper: JSON.stringify(it.paper), seed: it.seed, created_at: it.createdAt });
          // Folders already in the readable layout keep their place; old-layout ones are moved by tidy-folders.
          const assetDir = PRODUCT_DIR.test(it.folder.split('/')[1]) ? null : it.folder;
          const base = { id: it.versionId, product_id: productId, version_no: it.versionNo, spec_id: specId, parent_version_id: parent, origin: parent ? 'regenerate' : 'initial', change_note: RESTORE_NOTE, content_provenance: it.contentProvenance ? JSON.stringify(it.contentProvenance) : null, asset_dir: assetDir, created_at: it.createdAt, updated_at: now };
          if (it !== latest) {
            app.db.insert('product_versions', { ...base, stage: it.mode === 'unfinished' ? 'rendered' : 'packaged', status: 'superseded', qa_status: 'pending', deliverable_hash: it.deliverableHash });
          } else if (it.mode === 'view_only') {
            app.db.insert('product_versions', { ...base, stage: 'packaged', status: 'ready', qa_status: 'pending', deliverable_hash: it.deliverableHash, error: 'Restored view-only: the AI-written text was stored only in the lost database. The files are complete; make a new version to edit or sell it.' });
          } else if (it.mode === 'unfinished') {
            app.db.insert('product_versions', { ...base, stage: 'rendered', status: 'failed', qa_status: 'pending', error: 'Restored from files: this build stopped before its quality check and its seed was not saved. Use Regenerate to make a finished version.' });
          } else {
            // Rebuild the text from the seed here, not in the pipeline: the pipeline would ask an AI provider if
            // one is set up now, and replace what this product originally said.
            const spec: SpecRow = { id: specId, product_id: productId, product_type: def.id, params: it.params, design_system_id: ds.id, audience_id: null, theme_id: null, paper: it.paper, seed: it.seed, created_at: it.createdAt };
            const content = def.contentSchema.parse(def.deterministicContent(buildContextFromSpec(app, spec, it.title), seededRandom(it.seed)));
            app.db.insert('product_versions', { ...base, content: JSON.stringify(content), content_signature: contentSignature(def.id, spec, content), stage: 'content_generated', status: 'in_progress', qa_status: 'pending' });
          }
          for (const f of it.files) {
            app.db.insert('assets', { id: newId('ast'), product_id: productId, version_id: it.versionId, kind: f.kind, role: f.role, rel_path: f.rel, mime: f.mime, size_bytes: f.bytes, sha256: f.sha256, page_count: f.pageCount, page_index: f.pageIndex, width_pt: f.widthPt, height_pt: f.heightPt, width_px: f.widthPx, height_px: f.heightPx, provenance: JSON.stringify(f.provenance), created_at: it.createdAt });
          }
          for (const r of it.generationRuns) {
            const started = String(r.started_at ?? it.createdAt);
            const id = typeof r.id === 'string' && !app.db.get('SELECT 1 FROM generation_runs WHERE id = ?', r.id) ? r.id : newId('gen');
            const basis = ['none', 'estimate_from_price_table', 'unknown'].includes(String(r.cost_basis)) ? r.cost_basis : 'unknown';
            app.db.insert('generation_runs', { id, version_id: it.versionId, purpose: String(r.purpose ?? 'content'), provider: String(r.provider ?? 'unknown'), model: (r.model as string | null) ?? null, input_tokens: (r.input_tokens as number | null) ?? null, output_tokens: (r.output_tokens as number | null) ?? null, image_count: (r.image_count as number | null) ?? null, cost_usd: (r.cost_usd as number | null) ?? null, cost_basis: basis, status: r.status === 'failed' ? 'failed' : 'succeeded', started_at: started, finished_at: started });
          }
          parent = it.versionId;
        }
        audit(app.db, 'system', 'product.restored', 'product', productId, { versions: versions.map((v) => ({ folder: v.folder, mode: v.mode, files: v.files.length, missing: v.missing, notes: v.notes })) });
      });
      restored.push({ productId, versionId: latest.versionId, title: latest.title, mode: latest.mode, queued: false });
    } catch (err) {
      failed.push({ folder: `products/${productId}`, error: (err as Error).message });
    }
  }
  let batchId: string | null = null;
  if (restored.length) {
    batchId = createBatch(app, `Restored products (${new Date().toISOString().slice(0, 10)})`, 'manual');
    for (const r of restored) addToBatch(app, batchId, r.versionId);
  }
  return { restored, failed, batchId };
}

/** Queues the normal pipeline for restored products whose content comes from the seed. Run after any folder moves. */
export function queueRebuilds(app: AppContext, result: RestoreResult): void {
  for (const r of result.restored) {
    if (r.mode !== 'rebuild') continue;
    startPipeline(app, r.versionId);
    r.queued = true;
  }
}
