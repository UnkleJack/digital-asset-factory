import type { AppContext } from '../../app/context.ts';
import { newId } from '../../core/ids.ts';
import { AppError, notFound, validation } from '../../core/errors.ts';
import { hasProductType } from '../producttypes/registry.ts';
import { CHARACTERS } from './service.ts';

// HAPPY DAFFY worlds, spec milestone 2.
// - A world is a project with ordered milestones; every task sits in one milestone and is assigned
//   to one character (spec H12 option 1, the spec's recommendation).
// - Locked rule: a character sees and enters a world only while it has an open task there.
// - Worlds are ranked by the effort left in their next milestone, smallest first (spec D2 / H7
//   option 3: effort ranks, task count is shown separately). Effort is the owner's own estimate,
//   required on every task, so there is no made-up fallback for unestimated tasks.

export const DIFFICULTIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
/** Every status except COMPLETE counts as open work. */
export const OPEN_STATUSES: readonly TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'BLOCKED'];
export const CUSTOM_TASK_TYPE = 'custom';

export interface WorldRow { id: string; name: string; description: string; status: 'active' | 'archived'; created_at: string; updated_at: string }
export interface MilestoneRow { id: string; world_id: string; name: string; sequence: number; status: 'open' | 'completed'; completed_at: string | null; created_at: string }
export interface TaskRow {
  id: string; world_id: string; milestone_id: string; character_id: string; title: string; description: string;
  task_type: string; difficulty: Difficulty; status: TaskStatus; estimated_effort: number; remaining_effort: number;
  created_at: string; updated_at: string; completed_at: string | null;
}

const notEligible = (message: string) => new AppError('not_eligible', message, { httpStatus: 403 });
const OPEN_SQL = `('OPEN','IN_PROGRESS','BLOCKED')`;

function checkCharacter(id: string): void {
  if (!CHARACTERS.some((c) => c.id === id)) throw validation(`Unknown character "${id}"`, [{ field: 'characterId', message: 'Pick IDE, AI CHATBOT or DAF.' }]);
}
function checkTaskType(t: string): void {
  if (t !== CUSTOM_TASK_TYPE && !hasProductType(t)) throw validation(`Unknown task type "${t}"`, [{ field: 'taskType', message: 'Pick a product type or "custom".' }]);
}

function getWorld(app: AppContext, id: string): WorldRow {
  const w = app.db.get<WorldRow>('SELECT * FROM worlds WHERE id = ?', id);
  if (!w) throw notFound('World', id);
  return w;
}
function getTask(app: AppContext, id: string): TaskRow {
  const t = app.db.get<TaskRow>('SELECT * FROM world_tasks WHERE id = ?', id);
  if (!t) throw notFound('Task', id);
  return t;
}
function milestonesOf(app: AppContext, worldId: string): MilestoneRow[] {
  return app.db.all<MilestoneRow>('SELECT * FROM world_milestones WHERE world_id = ? ORDER BY sequence', worldId);
}

/** The next milestone is the lowest-sequence milestone that is still open. */
function nextMilestone(app: AppContext, worldId: string): MilestoneRow | null {
  return app.db.get<MilestoneRow>("SELECT * FROM world_milestones WHERE world_id = ? AND status = 'open' ORDER BY sequence LIMIT 1", worldId) ?? null;
}

/** Work left and progress toward one milestone, in effort points, counting every character's tasks. */
function milestoneWork(app: AppContext, milestoneId: string) {
  const r = app.db.get<{ est: number | null; rem: number | null; total: number; done: number }>(
    `SELECT sum(estimated_effort) AS est, sum(CASE WHEN status = 'COMPLETE' THEN 0 ELSE remaining_effort END) AS rem,
            count(*) AS total, sum(CASE WHEN status = 'COMPLETE' THEN 1 ELSE 0 END) AS done
     FROM world_tasks WHERE milestone_id = ?`, milestoneId)!;
  const estimated = r.est ?? 0;
  const remaining = r.rem ?? 0;
  return {
    estimatedEffort: estimated,
    remainingEffort: remaining,
    /** 0..1, completed effort over total effort. 0 when the milestone has no tasks yet. */
    progress: estimated > 0 ? Math.max(0, Math.min(1, (estimated - remaining) / estimated)) : 0,
    tasks: r.total,
    tasksDone: r.done ?? 0,
  };
}

/** A milestone is completed when it has tasks and all of them are COMPLETE; reopening a task reopens it. */
function refreshMilestone(app: AppContext, milestoneId: string, now: string): void {
  const m = app.db.get<{ total: number; open: number }>(`SELECT count(*) AS total, sum(CASE WHEN status IN ${OPEN_SQL} THEN 1 ELSE 0 END) AS open FROM world_tasks WHERE milestone_id = ?`, milestoneId)!;
  const complete = m.total > 0 && (m.open ?? 0) === 0;
  app.db.run(
    `UPDATE world_milestones SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN coalesce(completed_at, ?) ELSE NULL END WHERE id = ?`,
    complete ? 'completed' : 'open', complete ? 'completed' : 'open', now, milestoneId,
  );
}

function openTaskCount(app: AppContext, worldId: string, characterId: string): number {
  return app.db.value<number>(`SELECT count(*) FROM world_tasks WHERE world_id = ? AND character_id = ? AND status IN ${OPEN_SQL}`, worldId, characterId) ?? 0;
}

// ---------- Player side: Worlds and World Detail ----------

export interface WorldCard {
  id: string;
  name: string;
  description: string;
  nextMilestone: { id: string; name: string; sequence: number } | null;
  /** Effort points left in the next milestone; the sort key. */
  remainingEffort: number;
  progress: number;
  /** This character's open tasks in the world. */
  tasksLeft: number;
}

/** Worlds the character may see: active, with at least one of its tasks still open. Closest milestone first. */
export function worldsFor(app: AppContext, characterId: string): WorldCard[] {
  checkCharacter(characterId);
  const worlds = app.db.all<WorldRow>(
    `SELECT w.* FROM worlds w WHERE w.status = 'active'
       AND EXISTS (SELECT 1 FROM world_tasks t WHERE t.world_id = w.id AND t.character_id = ? AND t.status IN ${OPEN_SQL})`, characterId);
  const cards = worlds.map((w): WorldCard => {
    const next = nextMilestone(app, w.id);
    const work = next ? milestoneWork(app, next.id) : null;
    return {
      id: w.id,
      name: w.name,
      description: w.description,
      nextMilestone: next ? { id: next.id, name: next.name, sequence: next.sequence } : null,
      remainingEffort: work?.remainingEffort ?? 0,
      progress: work?.progress ?? 0,
      tasksLeft: openTaskCount(app, w.id, characterId),
    };
  });
  return cards.sort((a, b) => a.remainingEffort - b.remainingEffort || a.tasksLeft - b.tasksLeft || a.name.localeCompare(b.name));
}

/** World Detail for one character. Refuses a world the character has no open task in (locked rule). */
export function worldDetailFor(app: AppContext, worldId: string, characterId: string) {
  checkCharacter(characterId);
  const w = getWorld(app, worldId);
  if (w.status !== 'active' || openTaskCount(app, worldId, characterId) === 0) {
    throw notEligible('This character has no open tasks in that world, so it cannot enter it.');
  }
  const card = worldsFor(app, characterId).find((c) => c.id === worldId)!;
  const milestones = milestonesOf(app, worldId);
  const seq = new Map(milestones.map((m) => [m.id, m]));
  const tasks = app.db.all<TaskRow>(`SELECT * FROM world_tasks WHERE world_id = ? AND character_id = ? AND status IN ${OPEN_SQL} ORDER BY created_at`, worldId, characterId)
    .sort((a, b) => (seq.get(a.milestone_id)?.sequence ?? 0) - (seq.get(b.milestone_id)?.sequence ?? 0));
  return {
    world: card,
    milestones: milestones.map((m) => ({ id: m.id, name: m.name, sequence: m.sequence, status: m.status, ...milestoneWork(app, m.id) })),
    tasks: tasks.map((t) => ({ ...t, milestone: seq.get(t.milestone_id)?.name ?? '' })),
  };
}

// ---------- Builder side: make worlds, milestones and tasks ----------

export function listAllWorlds(app: AppContext) {
  return app.db.all<WorldRow>('SELECT * FROM worlds ORDER BY status, updated_at DESC').map((w) => {
    const counts = app.db.get<{ total: number; open: number }>(`SELECT count(*) AS total, sum(CASE WHEN status IN ${OPEN_SQL} THEN 1 ELSE 0 END) AS open FROM world_tasks WHERE world_id = ?`, w.id)!;
    const next = nextMilestone(app, w.id);
    return { ...w, tasks: counts.total, openTasks: counts.open ?? 0, milestones: milestonesOf(app, w.id).length, nextMilestone: next?.name ?? null };
  });
}

export function worldForBuilder(app: AppContext, worldId: string) {
  const w = getWorld(app, worldId);
  const milestones = milestonesOf(app, worldId).map((m) => ({
    ...m,
    ...milestoneWork(app, m.id),
    taskList: app.db.all<TaskRow>('SELECT * FROM world_tasks WHERE milestone_id = ? ORDER BY created_at', m.id),
  }));
  return { world: w, milestones };
}

export function createWorld(app: AppContext, input: { name: string; description?: string; milestones?: string[] }): { id: string } {
  const name = input.name.trim();
  if (!name) throw validation('Give the world a name.', [{ field: 'name', message: 'Required' }]);
  const now = new Date().toISOString();
  const id = newId('wld');
  app.db.tx(() => {
    app.db.insert('worlds', { id, name, description: (input.description ?? '').trim(), status: 'active', created_at: now, updated_at: now });
    (input.milestones ?? []).map((m) => m.trim()).filter(Boolean).forEach((m, i) => {
      app.db.insert('world_milestones', { id: newId('wms'), world_id: id, name: m, sequence: i + 1, status: 'open', created_at: now });
    });
  });
  return { id };
}

export function updateWorld(app: AppContext, worldId: string, patch: { name?: string; description?: string; status?: 'active' | 'archived' }): void {
  getWorld(app, worldId);
  if (patch.name !== undefined && !patch.name.trim()) throw validation('A world needs a name.', [{ field: 'name', message: 'Required' }]);
  app.db.update('worlds', worldId, { name: patch.name?.trim(), description: patch.description?.trim(), status: patch.status, updated_at: new Date().toISOString() });
}

export function addMilestone(app: AppContext, worldId: string, name: string): { id: string } {
  getWorld(app, worldId);
  if (!name.trim()) throw validation('Give the milestone a name.', [{ field: 'name', message: 'Required' }]);
  const now = new Date().toISOString();
  const id = newId('wms');
  app.db.tx(() => {
    const seq = (app.db.value<number>('SELECT max(sequence) FROM world_milestones WHERE world_id = ?', worldId) ?? 0) + 1;
    app.db.insert('world_milestones', { id, world_id: worldId, name: name.trim(), sequence: seq, status: 'open', created_at: now });
    app.db.update('worlds', worldId, { updated_at: now });
  });
  return { id };
}

export interface NewTask {
  milestoneId: string;
  characterId: string;
  title: string;
  description?: string;
  taskType: string;
  difficulty: Difficulty;
  estimatedEffort: number;
}

export function addTask(app: AppContext, worldId: string, input: NewTask): { id: string } {
  getWorld(app, worldId);
  checkCharacter(input.characterId);
  checkTaskType(input.taskType);
  const m = app.db.get<MilestoneRow>('SELECT * FROM world_milestones WHERE id = ? AND world_id = ?', input.milestoneId, worldId);
  if (!m) throw validation('That milestone is not in this world.', [{ field: 'milestoneId', message: 'Pick one of this world\'s milestones.' }]);
  if (!input.title.trim()) throw validation('Give the task a title.', [{ field: 'title', message: 'Required' }]);
  if (!(input.estimatedEffort > 0)) throw validation('Effort must be more than 0.', [{ field: 'estimatedEffort', message: 'More than 0' }]);
  const now = new Date().toISOString();
  const id = newId('wtk');
  app.db.tx(() => {
    app.db.insert('world_tasks', {
      id, world_id: worldId, milestone_id: m.id, character_id: input.characterId, title: input.title.trim(), description: (input.description ?? '').trim(),
      task_type: input.taskType, difficulty: input.difficulty, status: 'OPEN', estimated_effort: input.estimatedEffort, remaining_effort: input.estimatedEffort,
      created_at: now, updated_at: now,
    });
    refreshMilestone(app, m.id, now);
    app.db.update('worlds', worldId, { updated_at: now });
  });
  return { id };
}

export function updateTask(app: AppContext, taskId: string, patch: Partial<Omit<NewTask, 'milestoneId'>> & { status?: TaskStatus; remainingEffort?: number }): void {
  const t = getTask(app, taskId);
  if (patch.characterId) checkCharacter(patch.characterId);
  if (patch.taskType) checkTaskType(patch.taskType);
  if (patch.title !== undefined && !patch.title.trim()) throw validation('A task needs a title.', [{ field: 'title', message: 'Required' }]);
  const now = new Date().toISOString();
  const estimated = patch.estimatedEffort ?? t.estimated_effort;
  if (!(estimated > 0)) throw validation('Effort must be more than 0.', [{ field: 'estimatedEffort', message: 'More than 0' }]);
  const status = patch.status ?? t.status;
  let remaining = patch.remainingEffort ?? (patch.estimatedEffort !== undefined && t.remaining_effort === t.estimated_effort ? estimated : t.remaining_effort);
  if (remaining < 0) throw validation('Remaining effort cannot be negative.', [{ field: 'remainingEffort', message: '0 or more' }]);
  remaining = Math.min(remaining, estimated);
  let completedAt = t.completed_at;
  if (status === 'COMPLETE') {
    remaining = 0;
    completedAt = t.completed_at ?? now;
  } else {
    completedAt = null;
    // Reopening a finished task puts its full estimate back unless a new remaining value was given.
    if (t.status === 'COMPLETE' && patch.remainingEffort === undefined) remaining = estimated;
  }
  app.db.tx(() => {
    app.db.update('world_tasks', taskId, {
      character_id: patch.characterId, title: patch.title?.trim(), description: patch.description?.trim(), task_type: patch.taskType, difficulty: patch.difficulty,
      estimated_effort: estimated, remaining_effort: remaining, status, completed_at: completedAt, updated_at: now,
    });
    refreshMilestone(app, t.milestone_id, now);
    app.db.update('worlds', t.world_id, { updated_at: now });
  });
}

export function deleteTask(app: AppContext, taskId: string): void {
  const t = getTask(app, taskId);
  const now = new Date().toISOString();
  app.db.tx(() => {
    app.db.run('DELETE FROM world_tasks WHERE id = ?', taskId);
    refreshMilestone(app, t.milestone_id, now);
    app.db.update('worlds', t.world_id, { updated_at: now });
  });
}
