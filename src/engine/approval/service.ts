import type { AppContext } from '../../app/context.ts';
import { getProduct, getVersion, listingsForVersion, updateVersion, nameOf } from '../../db/repos.ts';
import { json } from '../../db/sqlite.ts';
import { createVersion } from '../specification/service.ts';
import { startPipeline } from '../../jobs/pipeline.ts';
import { addToBatch, refreshBatch, batchesContaining } from './batches.ts';
import { fingerprintFor, activeApproval } from '../publishing/service.ts';
import { qaReport } from '../qa/service.ts';
import { latestQaResults, openWarnings, warningsCleared } from './warnings.ts';
import { newId } from '../../core/ids.ts';
import { conflict, notFound, validation } from '../../core/errors.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import { onProductFinished } from '../packing/service.ts';

export type Decision = 'approved' | 'rejected' | 'revision_requested' | 'regenerate_requested';

/** Batches, newest first. `open` hides batches that are fully decided, unless a status is chosen. */
export function listBatches(app: AppContext, opts: { status?: string; open?: boolean; limit?: number } = {}) {
  const where = opts.status ? 'WHERE b.status = ?' : opts.open ? "WHERE b.status IN ('collecting','ready_for_review')" : '';
  const args = opts.status ? [opts.status] : [];
  const total = app.db.value<number>(`SELECT count(*) FROM approval_batches b ${where}`, ...args) ?? 0;
  const rows = app.db.all<Record<string, unknown>>(`SELECT b.*, (SELECT count(*) FROM approval_items i WHERE i.batch_id = b.id) AS items,
      (SELECT count(*) FROM approval_items i JOIN product_versions v ON v.id = i.version_id WHERE i.batch_id = b.id AND v.status = 'ready') AS awaiting
    FROM approval_batches b ${where} ORDER BY b.created_at DESC LIMIT ?`, ...args, opts.limit ?? 200);
  return { rows, total };
}

export { latestQaResults, openWarnings, warningsCleared } from './warnings.ts';

export function itemDetail(app: AppContext, itemId: string) {
  const item = app.db.get<{ id: string; batch_id: string; product_id: string; version_id: string; added_at: string }>('SELECT * FROM approval_items WHERE id = ?', itemId);
  if (!item) throw notFound('Batch item', itemId);
  const product = getProduct(app.db, item.product_id);
  const version = getVersion(app.db, item.version_id);
  const assets = app.assets.forVersion(version.id);
  const qa = qaReport(app, version.id);
  const qaResults = latestQaResults(app, version.id);
  const score = product.opportunity_id ? app.db.get<Record<string, unknown>>('SELECT score, confidence, outcome, factors, created_at FROM opportunity_scores WHERE opportunity_id = ? ORDER BY created_at DESC LIMIT 1', product.opportunity_id) : undefined;
  const cost = app.db.get<{ total: number | null; unknown: number; runs: number }>("SELECT sum(cost_usd) AS total, sum(CASE WHEN cost_basis = 'unknown' AND status = 'succeeded' THEN 1 ELSE 0 END) AS unknown, count(*) AS runs FROM generation_runs WHERE version_id = ?", version.id)!;
  const listings = listingsForVersion(app.db, version.id).map((l) => ({ ...l, approval: activeApproval(app, l), fingerprint: fingerprintFor(version.deliverable_hash, l) }));
  const decisions = app.db.all('SELECT id, decision, marketplace, listing_id, notes, decided_by, decided_at, invalidated_at, invalidated_reason FROM approval_decisions WHERE version_id = ? ORDER BY decided_at DESC', version.id);
  const members = product.product_type === 'bundle' ? (json<{ members?: unknown[] }>(app.db.value<string>('SELECT params FROM product_specs WHERE id = ?', version.spec_id), {}).members ?? []) : [];
  return {
    item,
    product: { ...product, category: nameOf(app.db, 'categories', product.category_id), audience: nameOf(app.db, 'audiences', product.audience_id), theme: nameOf(app.db, 'themes', product.theme_id) },
    version: { ...version, content: undefined },
    current: product.current_version_id === version.id,
    previews: assets.filter((a) => a.role === 'preview').map((a) => ({ id: a.id, page: (a.page_index ?? 0) + 1 })),
    listingImages: assets.filter((a) => a.role === 'listing_image').map((a) => a.id),
    files: assets.filter((a) => a.role === 'deliverable').map((a) => ({ id: a.id, name: a.rel_path.split('/').pop(), kind: a.kind, bytes: a.size_bytes, pages: a.page_count })),
    bundleMembers: members,
    qa: { status: version.qa_status, runs: qa.map((r) => ({ id: r.id, kind: r.kind, status: r.status, hard: r.hard_failures, warnings: r.warnings, at: r.started_at })), failures: qaResults.filter((r) => !r.passed && r.severity === 'hard'), warnings: qaResults.filter((r) => !r.passed && r.severity === 'warning') },
    score: score ? { score: score.score, confidence: score.confidence, outcome: score.outcome, factors: json(score.factors, []), at: score.created_at } : null,
    cost: { estimatedUsd: cost.total, runs: cost.runs, unknownCostRuns: cost.unknown, basis: 'Estimated from the price table in Settings; not a provider invoice.' },
    provenance: version.content_provenance,
    listings,
    decisions,
    warningsCleared: warningsCleared(app, version.id),
    acceptedWarnings: app.db.all<{ at: string; details: string }>("SELECT at, details FROM audit_events WHERE action = 'approval.warnings_accepted' AND entity_id = ? ORDER BY at DESC", version.id)
      .map((r) => ({ at: r.at, ...json<{ warnings?: { check: string; message: string }[]; notes?: string }>(r.details, {}) })),
    history: app.db.all('SELECT id, version_no, origin, status, qa_status, change_note, revision_notes, created_at FROM product_versions WHERE product_id = ? ORDER BY version_no DESC', product.id),
  };
}

export function batchDetail(app: AppContext, batchId: string) {
  const batch = app.db.get<Record<string, unknown>>('SELECT * FROM approval_batches WHERE id = ?', batchId);
  if (!batch) throw notFound('Batch', batchId);
  const items = app.db.all<{ id: string }>('SELECT id FROM approval_items WHERE batch_id = ? ORDER BY added_at', batchId);
  return { batch, items: items.map((i) => itemDetail(app, i.id)) };
}

export function decide(app: AppContext, itemId: string, input: { decision: Decision; marketplaces?: string[]; notes?: string; acceptWarnings?: boolean; warningNote?: string }, actor: AuditActor = 'user'): { decisionIds: string[]; newVersionId?: string } {
  const item = app.db.get<{ id: string; batch_id: string; product_id: string; version_id: string }>('SELECT * FROM approval_items WHERE id = ?', itemId);
  if (!item) throw notFound('Batch item', itemId);
  const product = getProduct(app.db, item.product_id);
  const version = getVersion(app.db, item.version_id);
  if (product.current_version_id !== version.id) throw conflict('A newer version of this product exists. Review the newest version instead.');
  if (version.status === 'in_progress') throw conflict('This version is still being produced.');
  const notes = (input.notes ?? '').trim().slice(0, 4000);
  const now = new Date().toISOString();
  const ids: string[] = [];

  if (input.decision === 'approved') {
    if (version.qa_status === 'failed' || version.qa_status === 'pending') throw validation(`This version cannot be approved: QA status is "${version.qa_status}". Fix or regenerate it first.`);
    if (!['ready', 'approved'].includes(version.status)) throw validation(`This version cannot be approved while its status is "${version.status}".`);
    if (!version.deliverable_hash) throw validation('This version has not been packaged.');
    // Yellow flags block approval until you look at them and tick "I accept these warnings".
    const warnings = openWarnings(app, version.id);
    const hasWarnings = warnings.length > 0 || version.qa_status === 'passed_with_warnings';
    if (hasWarnings && input.acceptWarnings !== true) throw validation(`This version has ${warnings.length || 'some'} QA warning${warnings.length === 1 ? '' : 's'}. Fix ${warnings.length === 1 ? 'it' : 'them'}, or review ${warnings.length === 1 ? 'it' : 'them'} and tick "I accept these warnings" to approve.`);
    const accepted = hasWarnings ? warnings.map((w) => ({ check: w.check_code, message: w.message })) : undefined;
    const listings = listingsForVersion(app.db, version.id).filter((l) => !input.marketplaces?.length || input.marketplaces.includes(l.marketplace));
    if (!listings.length) throw validation('Choose at least one marketplace listing to approve.');
    const bad = listings.filter((l) => l.status === 'invalid' || l.validation.issues.length);
    if (bad.length) throw validation(`Fix the listing issues first: ${bad.map((l) => `${l.marketplace}: ${l.validation.issues.map((i) => i.field).join(', ')}`).join('; ')}`);
    app.db.tx(() => {
      for (const l of listings) {
        const fp = fingerprintFor(version.deliverable_hash, l);
        if (app.db.get("SELECT 1 FROM approval_decisions WHERE listing_id = ? AND fingerprint = ? AND decision = 'approved' AND invalidated_at IS NULL", l.id, fp)) continue;
        const id = newId('apd');
        app.db.insert('approval_decisions', { id, item_id: item.id, version_id: version.id, listing_id: l.id, marketplace: l.marketplace, decision: 'approved', fingerprint: fp, notes, decided_by: actor, decided_at: now });
        ids.push(id);
      }
      updateVersion(app.db, version.id, { status: 'approved' });
      audit(app.db, actor, 'approval.approved', 'version', version.id, { listings: listings.map((l) => l.id), marketplaces: listings.map((l) => l.marketplace), notes, ...(accepted && { acceptedWarnings: accepted }) });
      // The warning note stays here (not in the decision notes) so it isn't fed into generation prompts as style advice.
      if (accepted) audit(app.db, actor, 'approval.warnings_accepted', 'version', version.id, { warnings: accepted, notes: (input.warningNote ?? '').trim().slice(0, 2000) });
    });
    refreshBatch(app, item.batch_id);
    onProductFinished(app, version.id, 'approved');
    return { decisionIds: ids };
  }

  if (input.decision === 'rejected') {
    // Everything turned away gets a reason, so the Factory can learn from it (owner, 2026-11-09).
    if (notes.length < 3) throw validation('Say why you are rejecting it: which part is wrong and what is wrong with it.');
    const id = newId('apd');
    app.db.tx(() => {
      app.db.insert('approval_decisions', { id, item_id: item.id, version_id: version.id, decision: 'rejected', notes, decided_by: actor, decided_at: now });
      app.db.run("UPDATE approval_decisions SET invalidated_at = ?, invalidated_reason = 'Version rejected' WHERE version_id = ? AND decision = 'approved' AND invalidated_at IS NULL", now, version.id);
      updateVersion(app.db, version.id, { status: 'rejected' });
      audit(app.db, actor, 'approval.rejected', 'version', version.id, { notes });
    });
    refreshBatch(app, item.batch_id);
    return { decisionIds: [id] };
  }

  if (input.decision === 'revision_requested' && notes.length < 3) throw validation('Describe what should change so the next version can address it.');
  const id = newId('apd');
  app.db.insert('approval_decisions', { id, item_id: item.id, version_id: version.id, decision: input.decision, notes, decided_by: actor, decided_at: now });
  const markets = listingsForVersion(app.db, version.id).map((l) => l.marketplace);
  const next = input.decision === 'revision_requested'
    ? createVersion(app, { origin: 'revision', fromVersionId: version.id, revisionNotes: notes, changeNote: 'Returned for revision' }, actor)
    : createVersion(app, { origin: 'regenerate', fromVersionId: version.id, changeNote: notes || 'Regenerated', specChanges: { newSeed: true } }, actor);
  startPipeline(app, next.id, { marketplaces: markets });
  for (const b of new Set([item.batch_id, ...batchesContaining(app, version.id)])) addToBatch(app, b, next.id);
  return { decisionIds: [id], newVersionId: next.id };
}

export function editVersion(app: AppContext, versionId: string, input: { content?: unknown; params?: Record<string, unknown>; paper?: Record<string, unknown>; designSystemId?: string; note?: string }, actor: AuditActor = 'user'): { newVersionId: string } {
  const version = getVersion(app.db, versionId);
  if (version.status === 'in_progress') throw conflict('Wait for the current production to finish before editing.');
  if (input.content === undefined && !input.params && !input.paper && !input.designSystemId) throw validation('Nothing to change.');
  const specChanges = input.params || input.paper || input.designSystemId ? { params: input.params, paper: input.paper as never, designSystemId: input.designSystemId } : undefined;
  const next = createVersion(app, { origin: 'edit', fromVersionId: versionId, changeNote: input.note ?? 'Edited', content: input.content, copyContent: input.content === undefined && !input.params, specChanges }, actor);
  const markets = listingsForVersion(app.db, versionId).map((l) => l.marketplace);
  startPipeline(app, next.id, { marketplaces: markets.length ? markets : undefined });
  for (const b of batchesContaining(app, versionId)) addToBatch(app, b, next.id);
  return { newVersionId: next.id };
}
