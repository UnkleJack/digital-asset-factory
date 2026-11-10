import type { AppContext } from '../../app/context.ts';
import { AppError, notFound, validation } from '../../core/errors.ts';
import { createProduct } from '../specification/service.ts';
import { startPipeline } from '../../jobs/pipeline.ts';
import { createBatch, addToBatch } from '../approval/batches.ts';
import { hasProductType, productType } from '../producttypes/registry.ts';
import { BRIEF_MAX } from '../producttypes/types.ts';
import { audit } from '../../logging/logger.ts';
import { CUSTOM_TASK_TYPE, updateTask, type TaskRow, type TaskStatus } from './worlds.ts';
import { creditState, canStartWork } from './credits.ts';
import { recordTaskXp } from './codex.ts';

// HAPPY DAFFY milestone 3: the Task Workspace, the screen behind OPEN TASK (spec B7).
// - The work surface comes from the task's module. A product-type task makes its asset with the factory's
//   own pipeline (content, artwork, render, QA, packaging, listings); nothing is copied or re-implemented.
//   The spec forbids a made-up universal workflow, so the arcade asks only for what every type shares
//   (title, design, a note for the AI) and links to the back office for the full controls.
// - A custom task has no module, so its surface is just progress: status and effort left.
// - Each asset made stays linked to its task and world (task_products). A task completes when one of
//   its assets is approved, from the arcade's QA Review or from batch review in the back office.

const notEligible = (message: string) => new AppError('not_eligible', message, { httpStatus: 403 });

function taskFor(app: AppContext, taskId: string, characterId: string): TaskRow {
  const t = app.db.get<TaskRow>('SELECT * FROM world_tasks WHERE id = ?', taskId);
  if (!t) throw notFound('Task', taskId);
  if (t.character_id !== characterId) throw notEligible('That task belongs to another character.');
  const active = app.db.value<string>('SELECT status FROM worlds WHERE id = ?', t.world_id);
  if (active !== 'active') throw notEligible('That world is archived.');
  return t;
}

export interface TaskAsset {
  productId: string;
  title: string;
  productType: string;
  productStatus: string;
  versionId: string | null;
  versionNo: number | null;
  /** The version's own status: in_progress, ready, approved, rejected, failed, qa_failed. */
  status: string | null;
  stage: string | null;
  qaStatus: string | null;
  error: string | null;
  thumb: string | null;
  binned: boolean;
  /** Ready for QA Review: produced, packaged, QA finished, not yet decided. */
  reviewable: boolean;
  /** Production or QA failed: QA Review shows why and offers a new version. */
  failed: boolean;
  createdAt: string;
}

export function assetsForTask(app: AppContext, taskId: string): TaskAsset[] {
  return app.db.all<Record<string, unknown>>(
    `SELECT p.id AS productId, p.title, p.product_type AS productType, p.status AS productStatus, tp.created_at AS createdAt,
            v.id AS versionId, v.version_no AS versionNo, v.status, v.stage, v.qa_status AS qaStatus, v.error,
            (SELECT a.id FROM assets a WHERE a.version_id = v.id AND a.role = 'preview' ORDER BY a.page_index LIMIT 1) AS thumb,
            EXISTS (SELECT 1 FROM arcade_bin b WHERE b.product_id = p.id) AS binned
     FROM task_products tp JOIN products p ON p.id = tp.product_id LEFT JOIN product_versions v ON v.id = p.current_version_id
     WHERE tp.task_id = ? ORDER BY tp.created_at DESC`, taskId,
  ).map((r) => ({
    ...(r as unknown as TaskAsset),
    binned: !!r.binned,
    reviewable: !r.binned && r.status === 'ready' && r.qaStatus !== 'pending' && r.qaStatus !== 'failed',
    failed: !r.binned && (r.status === 'failed' || r.status === 'qa_failed'),
  }));
}

export async function taskWorkspace(app: AppContext, taskId: string, characterId: string) {
  const t = taskFor(app, taskId, characterId);
  const world = app.db.get<{ id: string; name: string }>('SELECT id, name FROM worlds WHERE id = ?', t.world_id)!;
  const milestone = app.db.value<string>('SELECT name FROM world_milestones WHERE id = ?', t.milestone_id) ?? '';
  const isCustom = t.task_type === CUSTOM_TASK_TYPE || !hasProductType(t.task_type);
  const def = isCustom ? null : productType(t.task_type);
  return {
    task: { ...t, milestone },
    world,
    module: isCustom
      ? { kind: 'custom' as const, id: CUSTOM_TASK_TYPE, name: 'Custom task' }
      : { kind: 'product' as const, id: def!.id, name: def!.name, importOnly: def!.importOnly ?? false, briefMax: BRIEF_MAX },
    assets: assetsForTask(app, t.id),
    credits: await creditState(app),
  };
}

/** Make one asset for a product-type task through the factory pipeline, and link it to the task. */
export async function makeTaskAsset(app: AppContext, taskId: string, characterId: string, input: { title?: string; designSystemId?: string; brief?: string }) {
  const t = taskFor(app, taskId, characterId);
  if (t.status === 'COMPLETE') throw validation('This task is already done. Reopen it in the World Builder to make more for it.');
  if (t.task_type === CUSTOM_TASK_TYPE || !hasProductType(t.task_type)) throw validation('A custom task has no production module. Mark its progress instead.');
  const def = productType(t.task_type);
  if (def.importOnly) throw validation(`${def.name} are made from the Imports screen, from images you imported.`);
  // Spec H18 option 2 (owner, 2026-11-10): at zero credits no new AI work starts; work already made is kept.
  const credits = await creditState(app);
  if (!canStartWork(credits)) throw new AppError('no_credits', 'NO CREDITS LEFT: new production waits until the AI has room again. What you already made is safe.', { httpStatus: 409 });
  const title = (input.title ?? '').trim() || t.title;
  const brief = (input.brief ?? '').trim() || t.description.trim() || undefined;
  const { product, version } = createProduct(app, { productType: def.id, title: title.slice(0, 120), designSystemId: input.designSystemId, brief: brief?.slice(0, BRIEF_MAX) });
  const now = new Date().toISOString();
  app.db.insert('task_products', { task_id: t.id, product_id: product.id, created_at: now });
  const batchId = createBatch(app, `Arcade — ${t.title}`.slice(0, 120), 'manual');
  addToBatch(app, batchId, version.id);
  startPipeline(app, version.id);
  if (t.status === 'OPEN') updateTask(app, t.id, { status: 'IN_PROGRESS' });
  audit(app.db, 'user', 'arcade.asset_made', 'world_task', t.id, { productId: product.id, versionId: version.id });
  return { productId: product.id, versionId: version.id, batchId };
}

/** A custom task's work surface: move it along by hand. */
export async function progressTask(app: AppContext, taskId: string, characterId: string, input: { status?: TaskStatus; remainingEffort?: number }) {
  const t = taskFor(app, taskId, characterId);
  if (input.status === 'COMPLETE' && t.task_type !== CUSTOM_TASK_TYPE && hasProductType(t.task_type)) {
    throw validation('A production task completes when one of its assets is approved in QA Review.');
  }
  updateTask(app, t.id, input);
  if (input.status === 'COMPLETE') recordTaskXp(app, t.id);
  return taskWorkspace(app, t.id, characterId);
}

/**
 * Hook: a version was approved (arcade QA Review or back-office batch review). Every open task that made
 * this product is complete: its asset passed QA and a person approved it (spec B7 completion condition).
 */
export function completeTasksForVersion(app: AppContext, versionId: string): string[] {
  const tasks = app.db.all<{ id: string }>(
    `SELECT t.id FROM task_products tp JOIN world_tasks t ON t.id = tp.task_id JOIN product_versions v ON v.product_id = tp.product_id
     WHERE v.id = ? AND t.status != 'COMPLETE'`, versionId,
  );
  for (const t of tasks) {
    updateTask(app, t.id, { status: 'COMPLETE' });
    recordTaskXp(app, t.id);
  }
  return tasks.map((t) => t.id);
}

/** The task (if any) a product was made for, for QA Review breadcrumbs. */
export function taskOfProduct(app: AppContext, productId: string): { id: string; title: string; description: string; world_id: string; world: string; character_id: string; difficulty: string } | null {
  return app.db.get(
    `SELECT t.id, t.title, t.description, t.world_id, w.name AS world, t.character_id, t.difficulty FROM task_products tp
     JOIN world_tasks t ON t.id = tp.task_id JOIN worlds w ON w.id = t.world_id WHERE tp.product_id = ? ORDER BY tp.created_at DESC LIMIT 1`, productId,
  ) ?? null;
}
