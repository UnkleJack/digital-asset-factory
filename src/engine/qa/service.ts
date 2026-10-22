import { basename } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { unzipSync, strFromU8 } from 'fflate';
import type { AppContext } from '../../app/context.ts';
import { productType } from '../producttypes/registry.ts';
import type { ArtworkItem, QaFinding } from '../producttypes/types.ts';
import { versionContext } from '../specification/service.ts';
import { getVersion, listingsForVersion, updateVersion, mapVersion, type VersionRow } from '../../db/repos.ts';
import { paperDimsMm, mmToPt } from '../templates/library.ts';
import { unknownWords, dictionaryAvailable } from './spelling.ts';
import { parseCsv, readWorkbook } from '../producttypes/sheets.ts';
import { pngSize } from '../generation/providers.ts';
import { sha256 } from '../../core/hash.ts';
import { newId } from '../../core/ids.ts';
import { errorMessage } from '../../core/errors.ts';
import type { AssetRecord } from '../../storage/assetStore.ts';
import type { RenderDiagnostics } from '../rendering/renderer.ts';

export type CheckResult = QaFinding;

const PLACEHOLDER = /lorem ipsum|\bTBD\b|\bTODO\b|\[insert|\{\{|\}\}|\bXXX+\b|\bundefined\b|\bNaN\b|\[object Object\]|\bplaceholder\b|your text here/i;

export function findPlaceholders(texts: string[]): string[] {
  return texts.filter((t) => PLACEHOLDER.test(t)).map((t) => t.slice(0, 80));
}

export function findBlockedTerms(texts: string[], terms: string[]): string[] {
  const hay = texts.join('\n').toLowerCase();
  return terms.filter((term) => new RegExp(`(^|[^a-z0-9])${term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i').test(hay));
}

function shingles(texts: string[]): Set<string> {
  const words = texts.join(' ').toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  if (words.length < 3 && words.length) out.add(words.join(' '));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function artworkFromAssets(app: AppContext, assets: AssetRecord[]): ArtworkItem[] {
  return assets
    .filter((a) => (a.kind === 'artwork_svg' || a.kind === 'artwork_png') && app.assets.exists(a))
    .map((a) => ({ name: basename(a.rel_path), kind: a.kind === 'artwork_svg' ? 'svg' : 'png', data: a.kind === 'artwork_svg' ? app.assets.read(a).toString('utf8') : app.assets.read(a), widthPx: a.width_px ?? undefined, heightPx: a.height_px ?? undefined, role: a.role === 'deliverable' ? 'deliverable' : 'source', provenance: a.provenance }));
}

function record(app: AppContext, versionId: string, kind: 'deliverable' | 'release', results: CheckResult[]): { runId: string; status: string; hard: number; warnings: number } {
  const hard = results.filter((r) => !r.passed && r.severity === 'hard').length;
  const warnings = results.filter((r) => !r.passed && r.severity === 'warning').length;
  const status = hard ? 'failed' : warnings ? 'passed_with_warnings' : 'passed';
  const runId = newId('qar');
  const now = new Date().toISOString();
  app.db.tx(() => {
    app.db.insert('qa_runs', { id: runId, version_id: versionId, kind, status, hard_failures: hard, warnings, started_at: now, finished_at: now });
    for (const r of results) app.db.insert('qa_results', { id: newId('qrs'), qa_run_id: runId, check_code: r.code, severity: r.severity, passed: r.passed ? 1 : 0, message: r.message.slice(0, 2000), details: JSON.stringify(r.details ?? {}) });
  });
  refreshQaStatus(app, versionId);
  return { runId, status, hard, warnings };
}

export function refreshQaStatus(app: AppContext, versionId: string): VersionRow['qa_status'] {
  const latest = app.db.all<{ kind: string; status: string }>('SELECT kind, status FROM qa_runs WHERE id IN (SELECT max(id) FROM qa_runs WHERE version_id = ? GROUP BY kind)', versionId);
  let qa: VersionRow['qa_status'] = 'pending';
  if (latest.some((r) => r.status === 'failed' || r.status === 'error')) qa = 'failed';
  else if (latest.length && latest.some((r) => r.status === 'passed_with_warnings')) qa = 'passed_with_warnings';
  else if (latest.length) qa = 'passed';
  const v = getVersion(app.db, versionId);
  const patch: Record<string, unknown> = { qa_status: qa };
  if (qa === 'failed' && ['in_progress', 'ready'].includes(v.status)) patch.status = 'qa_failed';
  updateVersion(app.db, versionId, patch);
  return qa;
}

export async function runDeliverableQa(app: AppContext, versionId: string): Promise<ReturnType<typeof record>> {
  const { version, product, spec, ctx } = versionContext(app, versionId);
  const def = productType(product.product_type);
  const s = app.settings.all();
  const assets = app.assets.forVersion(versionId);
  const results: CheckResult[] = [];
  const add = (code: string, severity: 'hard' | 'warning', passed: boolean, message: string, details?: unknown) => results.push({ code, severity, passed, message, details });

  const missing = assets.filter((a) => !app.assets.exists(a) || sha256(app.assets.read(a)) !== a.sha256).map((a) => a.rel_path);
  add('files_exist', 'hard', missing.length === 0 && assets.length > 0, missing.length ? `${missing.length} file(s) missing or changed on disk` : `${assets.length} files present with matching checksums`, missing);

  const pdfAsset = assets.find((a) => a.kind === 'pdf' && a.role === 'deliverable');
  const expected = version.content ? def.expectedPageCount(ctx, version.content) : 0;
  if (!pdfAsset || !app.assets.exists(pdfAsset)) add('pdf_valid', 'hard', false, 'No deliverable PDF was produced');
  else {
    try {
      const doc = await PDFDocument.load(app.assets.read(pdfAsset));
      const { w, h } = paperDimsMm(spec.paper);
      const [ew, eh] = [mmToPt(w), mmToPt(h)];
      const wrong = doc.getPages().map((p, i) => ({ i, ...p.getSize() })).filter((p) => Math.abs(p.width - ew) > 1.5 || Math.abs(p.height - eh) > 1.5);
      add('pdf_valid', 'hard', doc.getPageCount() === expected && wrong.length === 0, `PDF opens; ${doc.getPageCount()} pages (expected ${expected}); ${wrong.length ? `${wrong.length} pages with wrong size` : `all pages ${spec.paper.size} ${spec.paper.orientation}`}`, { pages: doc.getPageCount(), expected, wrongSizes: wrong.slice(0, 5) });
    } catch (err) {
      add('pdf_valid', 'hard', false, `PDF could not be opened: ${errorMessage(err)}`);
    }
  }

  const diag = version.render_diagnostics as unknown as (RenderDiagnostics & { chromeVersion?: string }) | null;
  if (!diag) add('render_diagnostics', 'hard', false, 'No render diagnostics recorded');
  else {
    add('layout_overflow', 'hard', diag.overflow.length === 0, diag.overflow.length ? `${diag.overflow.length} element(s) have clipped or overflowing content` : 'No clipped or overflowing text', diag.overflow.slice(0, 10));
    const tolPx = (s.qa.marginToleranceMm / 25.4) * 96;
    const margin = diag.outsideMargin.filter((m) => m.byPx > tolPx);
    add('layout_margins', 'hard', margin.length === 0, margin.length ? `${margin.length} element(s) extend past the safe print margin` : 'All content inside the safe print margins', margin.slice(0, 10));
    const fontProblems = [...diag.fontsMissing, ...diag.fontsFailed];
    add('fonts', 'hard', fontProblems.length === 0, fontProblems.length ? `Font problems: ${fontProblems.join(', ')}` : 'All fonts embedded and loaded');
    add('render_errors', 'hard', diag.blockedRequests.length === 0 && diag.consoleErrors.length === 0, diag.blockedRequests.length || diag.consoleErrors.length ? 'The page tried to load external resources or reported errors' : 'No rendering errors or external requests', { blocked: diag.blockedRequests, console: diag.consoleErrors });
  }

  const content = version.content;
  const texts = content ? [product.title, ...def.qaText(content)] : [product.title];
  if (content) {
    try {
      for (const f of def.consistencyChecks?.(ctx, content, artworkFromAssets(app, assets)) ?? []) results.push(f);
    } catch (err) {
      add('content_consistency', 'hard', false, `Consistency check crashed: ${errorMessage(err)}`);
    }
  } else add('content_present', 'hard', false, 'No content was generated');

  const ph = findPlaceholders(texts);
  add('placeholder_content', 'hard', ph.length === 0, ph.length ? `Placeholder text found: ${ph.join(' | ')}` : 'No placeholder text', ph);
  const blocked = findBlockedTerms(texts, s.compliance.blockedTerms);
  add('policy_terms', 'hard', blocked.length === 0, blocked.length ? `Trademark/IP-sensitive terms: ${blocked.join(', ')}` : 'No blocked trademark terms', blocked);
  if (s.qa.spellingEnabled) {
    if (!dictionaryAvailable()) add('spelling', 'warning', true, 'Spelling not checked: no system dictionary available');
    else {
      const unknown = unknownWords(texts, s.qa.spellingAllowlist);
      add('spelling', 'warning', unknown.length === 0, unknown.length ? `Possible misspellings: ${unknown.slice(0, 20).join(', ')}` : 'No unknown words', unknown);
    }
  }

  if (version.content_signature) {
    const dup = app.db.get<{ product_id: string; title: string }>(`SELECT v.product_id, p.title FROM product_versions v JOIN products p ON p.id = v.product_id WHERE v.content_signature = ? AND v.product_id <> ? AND v.status NOT IN ('rejected','failed') LIMIT 1`, version.content_signature, product.id);
    add('duplicate_exact', 'hard', !dup, dup ? `Identical to existing product "${dup.title}"` : 'No identical product exists', dup);
  }
  const mine = shingles(texts.slice(1));
  let best = { score: 0, title: '', productId: '', sameSpec: false };
  const related = new Set(app.db.all<{ id: string }>("SELECT CASE WHEN from_product_id = ? THEN to_product_id ELSE from_product_id END AS id FROM product_relationships WHERE (from_product_id = ? OR to_product_id = ?) AND kind = 'variation_of'", product.id, product.id, product.id).map((r) => r.id));
  const others = app.db.all<Record<string, unknown>>(`SELECT v.*, p.title AS p_title, sp.design_system_id AS o_design, sp.paper AS o_paper, sp.params AS o_params, sp.seed AS o_seed FROM products p JOIN product_versions v ON v.id = p.current_version_id JOIN product_specs sp ON sp.id = v.spec_id WHERE p.product_type = ? AND p.id <> ? AND p.status = 'active' AND v.content IS NOT NULL`, product.product_type, product.id);
  for (const o of others) {
    const ov = mapVersion(o);
    if (related.has(ov.product_id)) continue;
    let score = jaccard(mine, shingles(def.qaText(ov.content)));
    if (def.artwork === 'procedural' && Number(o.o_seed) !== spec.seed) score *= 0.5;
    const sameSpec = o.o_design === spec.design_system_id && String(o.o_paper) === JSON.stringify(spec.paper) && String(o.o_params) === JSON.stringify(spec.params);
    if (score > best.score || (score === best.score && sameSpec)) best = { score, title: String(o.p_title), productId: ov.product_id, sameSpec };
  }
  const ndHard = best.score >= s.qa.nearDuplicateFail && best.sameSpec;
  const ndMsg = best.score >= s.qa.nearDuplicateWarn
    ? `${best.sameSpec ? 'Near-identical' : 'Same text, different design/paper/settings'} (${Math.round(best.score * 100)}% text overlap) as "${best.title}"`
    : best.title ? `Most similar product: "${best.title}" at ${Math.round(best.score * 100)}%` : 'No similar products';
  add('near_duplicate', ndHard ? 'hard' : 'warning', best.score < s.qa.nearDuplicateWarn, ndMsg, best);

  const formatProblems: string[] = [];
  for (const a of assets.filter((x) => app.assets.exists(x))) {
    const buf = app.assets.read(a);
    try {
      if (a.kind === 'csv') {
        const rows = parseCsv(buf.toString('utf8'));
        if (!rows.length || rows.some((r) => r.length !== rows[0].length)) formatProblems.push(`${a.rel_path}: inconsistent CSV columns`);
      } else if (a.kind === 'xlsx') {
        const wb = await readWorkbook(buf);
        if (!wb.worksheets.length) formatProblems.push(`${a.rel_path}: workbook has no sheets`);
      } else if (a.kind === 'artwork_svg') {
        const t = buf.toString('utf8');
        if (!/^<svg[\s>]/.test(t) || !t.trimEnd().endsWith('</svg>') || !/viewBox="[\d.\s-]+"/.test(t) || /<script|on\w+=|href="(?!#)/i.test(t)) formatProblems.push(`${a.rel_path}: not a clean SVG`);
      } else if (a.mime === 'image/png' && !pngSize(buf)) formatProblems.push(`${a.rel_path}: not a valid PNG`);
    } catch (err) {
      formatProblems.push(`${a.rel_path}: ${errorMessage(err)}`);
    }
  }
  add('file_formats', 'hard', formatProblems.length === 0, formatProblems.length ? formatProblems.join('; ') : 'All files open and are valid for their format', formatProblems);

  const provOk = !!version.content_provenance && typeof (version.content_provenance as { generator?: unknown }).generator === 'string';
  const art = assets.filter((a) => a.kind.startsWith('artwork_'));
  const artNoProv = art.filter((a) => typeof a.provenance.generator !== 'string').map((a) => a.rel_path);
  add('provenance', 'hard', provOk && artNoProv.length === 0, provOk && !artNoProv.length ? `Provenance recorded for content and ${art.length} artwork file(s)` : 'Missing provenance metadata', { content: provOk, artwork: artNoProv });

  const aiImages = art.filter((a) => a.kind === 'artwork_png');
  if (aiImages.length) {
    const issues: string[] = [];
    for (const a of aiImages) {
      try {
        const an = await app.renderer.analyzePng(app.assets.read(a));
        if (an.midtoneRatio > s.qa.lineArtMaxMidtoneRatio) issues.push(`${basename(a.rel_path)}: ${Math.round(an.midtoneRatio * 100)}% gray tones (not clean line art)`);
        if (an.colorfulRatio > 0.05) issues.push(`${basename(a.rel_path)}: contains color`);
        const fit = (spec.params as { fit?: string }).fit;
        if (fit === 'fill') {
          const { w } = paperDimsMm(spec.paper);
          const dpi = an.width / ((w - ctx.tokens.marginsMm.left - ctx.tokens.marginsMm.right) / 25.4);
          if (dpi < s.qa.minImageDpi) issues.push(`${basename(a.rel_path)}: about ${Math.round(dpi)} DPI when printed (minimum ${s.qa.minImageDpi})`);
        }
      } catch (err) {
        issues.push(`${basename(a.rel_path)}: could not analyze (${errorMessage(err)})`);
      }
    }
    add('image_quality', 'warning', issues.length === 0, issues.length ? issues.join('; ') : 'Illustrations are clean black-and-white line art at print resolution', issues);
  }

  if (def.id === 'bundle') {
    const members = (spec.params as { members: { versionId: string; title: string }[] }).members;
    const bad: string[] = [];
    for (const m of members) {
      const v = app.db.get<{ qa_status: string; status: string }>('SELECT qa_status, status FROM product_versions WHERE id = ?', m.versionId);
      if (!v || v.qa_status === 'failed' || v.qa_status === 'pending' || ['failed', 'qa_failed', 'rejected'].includes(v.status)) bad.push(m.title);
      const files = app.assets.forVersion(m.versionId, 'deliverable');
      if (!files.length || files.some((f) => !app.assets.exists(f))) bad.push(`${m.title} (files missing)`);
    }
    add('bundle_complete', 'hard', bad.length === 0, bad.length ? `Bundle members not ready: ${[...new Set(bad)].join(', ')}` : `All ${members.length} members passed QA and have files`, bad);
  }

  return record(app, versionId, 'deliverable', results);
}

export async function runReleaseQa(app: AppContext, versionId: string): Promise<ReturnType<typeof record>> {
  const s = app.settings.all();
  const results: CheckResult[] = [];
  const add = (code: string, severity: 'hard' | 'warning', passed: boolean, message: string, details?: unknown) => results.push({ code, severity, passed, message, details });
  const assets = app.assets.forVersion(versionId);
  const zip = assets.find((a) => a.kind === 'package_zip');
  const license = assets.find((a) => a.kind === 'license');
  add('license_present', 'hard', !!license && app.assets.exists(license), license ? 'License file included' : 'No license file');
  if (!zip || !app.assets.exists(zip)) add('package_zip', 'hard', false, 'No customer ZIP package');
  else {
    try {
      const entries = unzipSync(app.assets.read(zip));
      const names = Object.keys(entries);
      const expectedFiles = assets.filter((a) => a.role === 'deliverable' && a.kind !== 'package_zip').map((a) => basename(a.rel_path));
      const missing = expectedFiles.filter((f) => !names.includes(f));
      const manifest = entries['MANIFEST.txt'] ? strFromU8(entries['MANIFEST.txt']) : '';
      const unsafe = names.filter((n) => n.includes('..') || n.startsWith('/'));
      add('package_zip', 'hard', missing.length === 0 && unsafe.length === 0 && !!manifest, missing.length ? `ZIP is missing: ${missing.join(', ')}` : `ZIP opens and contains all ${expectedFiles.length} deliverables`, { names, missing, unsafe });
    } catch (err) {
      add('package_zip', 'hard', false, `ZIP could not be opened: ${errorMessage(err)}`);
    }
  }
  const listings = listingsForVersion(app.db, versionId);
  add('listings_present', 'hard', listings.length > 0, listings.length ? `${listings.length} listing draft(s)` : 'No listing drafts were prepared');
  for (const l of listings) {
    add(`listing_rules:${l.marketplace}`, 'hard', l.validation.issues.length === 0, l.validation.issues.length ? `${l.marketplace}: ${l.validation.issues.map((i) => `${i.field} — ${i.message}`).join('; ')}` : `${l.marketplace}: meets marketplace listing rules`, l.validation);
    const texts = [l.title, l.description, ...l.tags];
    const blocked = findBlockedTerms(texts, s.compliance.blockedTerms);
    add(`listing_policy:${l.marketplace}`, 'hard', blocked.length === 0, blocked.length ? `${l.marketplace}: blocked terms ${blocked.join(', ')}` : `${l.marketplace}: no blocked terms`);
    const ph = findPlaceholders(texts);
    add(`listing_placeholder:${l.marketplace}`, 'hard', ph.length === 0, ph.length ? `${l.marketplace}: placeholder text ${ph.join(' | ')}` : `${l.marketplace}: no placeholder text`);
    if (s.qa.spellingEnabled && dictionaryAvailable()) {
      const unknown = unknownWords(texts, s.qa.spellingAllowlist);
      add(`listing_spelling:${l.marketplace}`, 'warning', unknown.length === 0, unknown.length ? `${l.marketplace}: possible misspellings ${unknown.slice(0, 15).join(', ')}` : `${l.marketplace}: no unknown words`, unknown);
    }
  }
  return record(app, versionId, 'release', results);
}

export function qaReport(app: AppContext, versionId: string) {
  const runs = app.db.all<{ id: string; kind: string; status: string; hard_failures: number; warnings: number; started_at: string }>('SELECT * FROM qa_runs WHERE version_id = ? ORDER BY id DESC', versionId);
  return runs.map((r) => ({ ...r, results: app.db.all('SELECT check_code, severity, passed, message, details FROM qa_results WHERE qa_run_id = ? ORDER BY passed, severity, check_code', r.id) }));
}
