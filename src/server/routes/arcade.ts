import { z } from 'zod';
import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { arcadeState, canStart } from '../../engine/arcade/service.ts';
import {
  DIFFICULTIES, TASK_STATUSES, worldsFor, worldDetailFor, listAllWorlds, worldForBuilder,
  createWorld, updateWorld, addMilestone, addTask, updateTask, deleteTask,
} from '../../engine/arcade/worlds.ts';
import { setPortrait, clearPortrait, portraitFor, MAX_PORTRAIT_BYTES } from '../../engine/arcade/portraits.ts';
import { notFound } from '../../core/errors.ts';
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

  // Custom portraits: the owner's own image for a character, instead of the pixel art.
  const PortraitBody = z.object({ dataBase64: z.string().min(8).max(Math.ceil((MAX_PORTRAIT_BYTES * 4) / 3) + 16) });
  s.get('/api/arcade/characters/:id/portrait', async (req, reply) => {
    const id = (req.params as P).id;
    const p = portraitFor(app, id);
    if (!p) throw notFound('Portrait', id);
    reply.header('Content-Type', p.mime);
    reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    reply.header('Cache-Control', 'private, max-age=300');
    return reply.send(createReadStream(app.assets.resolve(p.rel)));
  });
  s.put('/api/arcade/characters/:id/portrait', async (req) => {
    const b = parse(PortraitBody, req.body, 'portrait');
    setPortrait(app, (req.params as P).id, Buffer.from(b.dataBase64, 'base64'));
    return arcadeState(app).characters.find((c) => c.id === (req.params as P).id);
  });
  s.delete('/api/arcade/characters/:id/portrait', async (req) => {
    clearPortrait(app, (req.params as P).id);
    return { ok: true };
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
