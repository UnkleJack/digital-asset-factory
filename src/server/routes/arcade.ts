import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { arcadeState, canStart } from '../../engine/arcade/service.ts';
import {
  DIFFICULTIES, TASK_STATUSES, worldsFor, worldDetailFor, listAllWorlds, worldForBuilder,
  createWorld, updateWorld, addMilestone, addTask, updateTask, deleteTask,
} from '../../engine/arcade/worlds.ts';
import { parse, type P, type Q } from './util.ts';

const Effort = z.number().positive().max(10_000);
const NewWorld = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).optional(),
  milestones: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
});
const WorldPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['active', 'archived']).optional(),
});
const NewTask = z.object({
  milestoneId: z.string().min(3),
  characterId: z.string().min(2),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(4000).optional(),
  taskType: z.string().min(2).max(60),
  difficulty: z.enum(DIFFICULTIES),
  estimatedEffort: Effort,
});
const TaskPatch = z.object({
  characterId: z.string().min(2).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(4000).optional(),
  taskType: z.string().min(2).max(60).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  estimatedEffort: Effort.optional(),
  remainingEffort: z.number().min(0).max(10_000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

const characterOf = (req: { query: unknown }) => parse(z.object({ character: z.string().min(2) }), req.query as Q, 'character').character;

export function registerArcadeRoutes(s: FastifyInstance, { app }: ServerDeps): void {
  s.get('/api/arcade', async () => {
    const state = arcadeState(app);
    return { ...state, startAllowed: canStart(state) };
  });

  // Player side: only worlds where the character has open tasks.
  s.get('/api/arcade/worlds', async (req) => ({ worlds: worldsFor(app, characterOf(req)) }));
  s.get('/api/arcade/worlds/:id', async (req) => worldDetailFor(app, (req.params as P).id, characterOf(req)));

  // World Builder: make and change worlds, milestones and tasks.
  s.get('/api/arcade/builder', async () => ({ worlds: listAllWorlds(app) }));
  s.get('/api/arcade/builder/worlds/:id', async (req) => worldForBuilder(app, (req.params as P).id));
  s.post('/api/arcade/builder/worlds', async (req) => createWorld(app, parse(NewWorld, req.body, 'world')));
  s.patch('/api/arcade/builder/worlds/:id', async (req) => {
    updateWorld(app, (req.params as P).id, parse(WorldPatch, req.body, 'world'));
    return { ok: true };
  });
  s.post('/api/arcade/builder/worlds/:id/milestones', async (req) => addMilestone(app, (req.params as P).id, parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body, 'milestone').name));
  s.post('/api/arcade/builder/worlds/:id/tasks', async (req) => addTask(app, (req.params as P).id, parse(NewTask, req.body, 'task')));
  s.patch('/api/arcade/builder/tasks/:id', async (req) => {
    updateTask(app, (req.params as P).id, parse(TaskPatch, req.body, 'task'));
    return { ok: true };
  });
  s.delete('/api/arcade/builder/tasks/:id', async (req) => {
    deleteTask(app, (req.params as P).id);
    return { ok: true };
  });
}
