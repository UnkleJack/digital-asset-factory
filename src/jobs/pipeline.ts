import { basename } from 'node:path';
import type { AppContext } from '../app/context.ts';
import { productType } from '../engine/producttypes/registry.ts';
import { versionContext, contentSignature } from '../engine/specification/service.ts';
import { generateContent, generateArtwork, type CallTrace } from '../engine/generation/service.ts';
import { renderProduct } from '../engine/rendering/renderProduct.ts';
import { runDeliverableQa, runReleaseQa } from '../engine/qa/service.ts';
import { packageVersion } from '../engine/packaging/service.ts';
import { prepareListings, isMarketplace, MARKETPLACES, type Marketplace } from '../engine/listing/service.ts';
import { refreshBatchesForVersion, batchesContaining } from '../engine/approval/batches.ts';
import { planRunBudget, refreshPlanRun } from '../scheduler/runs.ts';
import { AssetStore, type AssetRecord } from '../storage/assetStore.ts';
import { getVersion, updateVersion } from '../db/repos.ts';
import { enqueue, type JobRow, type JobType } from './queue.ts';
import { permanent } from '../core/errors.ts';
import { onProductFinished } from '../engine/packing/service.ts';
import type { ArtworkItem } from '../engine/producttypes/types.ts';

export const STAGES: JobType[] = ['generate_content', 'generate_artwork', 'render', 'qa', 'package', 'prepare_listings'];

export interface PipelinePayload {
  versionId: string;
  planRunId?: string | null;
  marketplaces?: string[];
}

function nextStage(stage: JobType): JobType | null {
  const i = STAGES.indexOf(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

export function enqueueStage(app: AppContext, stage: JobType, p: PipelinePayload): string {
  const v = getVersion(app.db, p.versionId);
  return enqueue(app, stage, { dedupeKey: `${stage}:${p.versionId}`, payload: { ...p }, priority: 50 + STAGES.indexOf(stage), productId: v.product_id, versionId: p.versionId, planRunId: p.planRunId ?? null }).id;
}

export function startPipeline(app: AppContext, versionId: string, opts: { planRunId?: string | null; marketplaces?: string[]; from?: JobType } = {}): string {
  const v = getVersion(app.db, versionId);
  const def = productType(app.db.value<string>('SELECT product_type FROM products WHERE id = ?', v.product_id) ?? '');
  const from = opts.from ?? (!v.content ? 'generate_content' : def.generateArtwork ? 'generate_artwork' : 'render');
  updateVersion(app.db, versionId, { status: 'in_progress', error: null });
  return enqueueStage(app, from, { versionId, planRunId: opts.planRunId ?? null, marketplaces: opts.marketplaces });
}

function trace(job: JobRow, app: AppContext): CallTrace {
  const planRunId = (job.payload as unknown as PipelinePayload).planRunId ?? null;
  return { versionId: job.version_id, jobId: job.id, planRunId, budget: planRunId ? planRunBudget(app, planRunId) : undefined };
}

function loadArtwork(app: AppContext, versionId: string): ArtworkItem[] {
  return app.assets.forVersion(versionId)
    .filter((a) => a.kind === 'artwork_svg' || a.kind === 'artwork_png')
    .sort((a, b) => (a.page_index ?? 0) - (b.page_index ?? 0))
    .map((a: AssetRecord) => ({ name: basename(a.rel_path), kind: a.kind === 'artwork_svg' ? 'svg' : 'png', data: a.kind === 'artwork_svg' ? app.assets.read(a).toString('utf8') : app.assets.read(a), widthPx: a.width_px ?? undefined, heightPx: a.height_px ?? undefined, role: a.role === 'deliverable' ? 'deliverable' : 'source', provenance: a.provenance }));
}

export async function runStage(app: AppContext, job: JobRow): Promise<unknown> {
  const p = job.payload as unknown as PipelinePayload;
  const versionId = p.versionId;
  const v = getVersion(app.db, versionId);
  if (['superseded', 'rejected'].includes(v.status)) return { skipped: `version is ${v.status}` };
  const { version, product, spec, ctx } = versionContext(app, versionId);
  const def = productType(product.product_type);
  const dir = AssetStore.versionDir(product.id, version.version_no);
  let result: unknown = null;
  let stop = false;

  switch (job.type) {
    case 'generate_content': {
      if (version.content) {
        result = { skipped: 'content already present' };
        break;
      }
      const { content, provenance } = await generateContent(app, def, ctx, trace(job, app));
      updateVersion(app.db, versionId, { content, content_provenance: provenance, content_signature: contentSignature(def.id, spec, content), stage: 'content_generated' });
      result = { generator: provenance.generator };
      break;
    }
    case 'generate_artwork': {
      if (!version.content) throw permanent('no_content', 'Content must be generated before artwork');
      if (version.content_signature === null) updateVersion(app.db, versionId, { content_signature: contentSignature(def.id, spec, version.content) });
      if (!def.generateArtwork) {
        result = { skipped: 'no artwork stage for this product type' };
        break;
      }
      app.assets.removeVersionRole(versionId, ['source']);
      for (const a of app.assets.forVersion(versionId, 'deliverable')) if (a.kind.startsWith('artwork_')) app.db.run('DELETE FROM assets WHERE id = ?', a.id);
      const art = await generateArtwork(app, def, ctx, version.content, trace(job, app));
      art.forEach((item, i) => {
        const folder = item.role === 'deliverable' ? 'artwork' : 'source';
        app.assets.write(`${dir}/${folder}/${item.name}`, item.data, { productId: product.id, versionId, kind: item.kind === 'svg' ? 'artwork_svg' : 'artwork_png', role: item.role, mime: item.kind === 'svg' ? 'image/svg+xml' : 'image/png', widthPx: item.widthPx, heightPx: item.heightPx, pageIndex: i, provenance: item.provenance });
      });
      updateVersion(app.db, versionId, { stage: 'artwork_generated' });
      result = { artwork: art.length };
      break;
    }
    case 'render': {
      if (!version.content) throw permanent('no_content', 'Content must exist before rendering');
      const s = app.settings.get('rendering');
      const art = loadArtwork(app, versionId);
      const out = await renderProduct(def, ctx, version.content, art, app.renderer, { fontsDir: app.paths.fontsDir, previewPages: s.previewPages, previewDpi: s.previewDpi });
      app.assets.removeVersionRole(versionId, ['preview']);
      for (const a of app.assets.forVersion(versionId, 'deliverable')) if (!a.kind.startsWith('artwork_')) app.db.run('DELETE FROM assets WHERE id = ?', a.id);
      app.assets.write(`${dir}/${product.slug}.pdf`, out.doc.pdf, { productId: product.id, versionId, kind: 'pdf', role: 'deliverable', mime: 'application/pdf', pageCount: out.doc.pdfPageCount, widthPt: out.doc.pdfPageSizesPt[0]?.w, heightPt: out.doc.pdfPageSizesPt[0]?.h, provenance: { generator: 'chrome-pdf', chrome: out.doc.chromeVersion, designSystemId: spec.design_system_id } });
      out.doc.previews.forEach((png, i) => app.assets.write(`${dir}/previews/page-${String(i + 1).padStart(2, '0')}.png`, png, { productId: product.id, versionId, kind: 'preview_png', role: 'preview', mime: 'image/png', pageIndex: i, provenance: { generator: 'chrome-screenshot', dpi: s.previewDpi } }));
      for (const f of out.extraFiles) app.assets.write(`${dir}/${f.fileName}`, f.data, { productId: product.id, versionId, kind: f.kind, role: f.role, mime: f.mime, provenance: { generator: f.kind === 'xlsx' ? 'exceljs' : 'csv-writer', productType: def.id } });
      updateVersion(app.db, versionId, { stage: 'rendered', render_diagnostics: { ...out.doc.diagnostics, chromeVersion: out.doc.chromeVersion, pdfPageSizesPt: out.doc.pdfPageSizesPt.slice(0, 3), expectedPages: out.expectedPages } });
      result = { pages: out.doc.pdfPageCount, expected: out.expectedPages };
      break;
    }
    case 'qa': {
      const r = await runDeliverableQa(app, versionId);
      updateVersion(app.db, versionId, { stage: 'qa_checked' });
      if (r.status === 'failed') {
        updateVersion(app.db, versionId, { status: 'qa_failed', error: `${r.hard} hard QA failure(s)` });
        stop = true;
      }
      result = r;
      break;
    }
    case 'package':
      result = await packageVersion(app, versionId);
      break;
    case 'prepare_listings': {
      const wanted = (p.marketplaces ?? []).filter(isMarketplace);
      const enabled = MARKETPLACES.filter((m) => app.settings.get('marketplaces')[m].enabled);
      const markets: Marketplace[] = wanted.length ? wanted : enabled.filter((m) => m !== 'generic');
      const listings = await prepareListings(app, versionId, markets.length ? markets : enabled, trace(job, app));
      const qa = await runReleaseQa(app, versionId);
      const latest = getVersion(app.db, versionId);
      updateVersion(app.db, versionId, { stage: 'ready_for_review', status: latest.qa_status === 'failed' ? 'qa_failed' : 'ready', error: latest.qa_status === 'failed' ? 'Release checks failed' : null });
      result = { listings: listings.map((l) => ({ marketplace: l.marketplace, status: l.status })), qa: qa.status };
      break;
    }
    default:
      throw permanent('unknown_stage', `Unknown pipeline stage ${job.type}`);
  }

  const next = stop ? null : nextStage(job.type);
  if (next) enqueueStage(app, next, p);
  else onPipelineEnded(app, versionId, p.planRunId ?? null);
  return result;
}

export function onPipelineEnded(app: AppContext, versionId: string, planRunId: string | null): void {
  refreshBatchesForVersion(app, versionId);
  onProductFinished(app, versionId, 'qa_passed');
  const runs = new Set<string>();
  if (planRunId) runs.add(planRunId);
  for (const b of batchesContaining(app, versionId)) {
    const r = app.db.value<string>('SELECT id FROM plan_runs WHERE batch_id = ?', b);
    if (r) runs.add(r);
  }
  for (const r of runs) refreshPlanRun(app, r);
}

export function onStageFailedFinal(app: AppContext, job: JobRow, message: string): void {
  if (!job.version_id) return;
  const v = getVersion(app.db, job.version_id);
  if (['superseded', 'rejected', 'approved'].includes(v.status)) return;
  updateVersion(app.db, job.version_id, { status: 'failed', error: `${job.type}: ${message}`.slice(0, 1000) });
  onPipelineEnded(app, job.version_id, (job.payload as unknown as PipelinePayload).planRunId ?? null);
}
