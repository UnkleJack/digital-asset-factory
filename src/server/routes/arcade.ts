import { z } from 'zod';
import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../app.ts';
import { arcadeState, canStart } from '../../engine/arcade/service.ts';
import {
  DIFFICULTIES, TASK_STATUSES, worldsFor, worldDetailFor, listAllWorlds, worldForBuilder,
  createWorld, updateWorld, addMilestone, addTask, updateTask, deleteTask, createWorldFromProposal,
} from '../../engine/arcade/worlds.ts';
import { generateWorld, checkGenerate, suggestWorlds, suggestTasks, tidyNotes, requireAi, DIFFICULTY_MIXES, GENERATE_LIMITS, SUGGEST_MODES, NOTES_MAX } from '../../engine/arcade/suggest.ts';
import { startDraft, getDraft, listDrafts, discardDraft, DRAFT_KINDS } from '../../engine/arcade/drafts.ts';
import { tickerCatalog, tickerValues, chosenTickerStats } from '../../engine/arcade/ticker.ts';
import { setPortrait, clearPortrait, portraitFor, MAX_PORTRAIT_BYTES } from '../../engine/arcade/portraits.ts';
import { listMissions, missionInstructions, setMissionDone } from '../../engine/arcade/missions.ts';
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
const ProposedTask = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(4000).optional(),
  characterId: z.string().min(2),
  taskType: z.string().min(2).max(60),
  difficulty: z.enum(DIFFICULTIES),
  estimatedEffort: Effort,
});
const Proposal = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).optional(),
  milestones: z.array(z.object({ name: z.string().trim().min(1).max(80), tasks: z.array(ProposedTask).max(40) })).min(1).max(30),
});
const GenerateBody = z.object({
  // Room for a tidied set of notes used as the goal.
  goal: z.string().trim().min(1).max(4000),
  milestones: z.number().int().min(GENERATE_LIMITS.milestones.min).max(GENERATE_LIMITS.milestones.max),
  tasksPerMilestone: z.number().int().min(GENERATE_LIMITS.tasksPerMilestone.min).max(GENERATE_LIMITS.tasksPerMilestone.max),
  difficulty: z.enum(DIFFICULTY_MIXES),
  productTypes: z.array(z.string().min(2).max(60)).max(40).optional(),
  characterId: z.string().min(2).nullable().optional(),
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

  // The hub's stats ticker: the owner's chosen stats, and the full list to choose from.
  s.get('/api/arcade/ticker', async (req) => {
    const character = parse(z.object({ character: z.string().min(2).max(40).optional() }), req.query as Q, 'ticker').character ?? null;
    return { items: tickerValues(app, character) };
  });
  s.get('/api/arcade/ticker/catalog', async () => ({ stats: tickerCatalog(), chosen: chosenTickerStats(app) }));

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

  // Missions: one per guide chapter. The list is titles only; a chapter's text loads when its popup opens.
  s.get('/api/arcade/missions', async () => listMissions(app));
  s.get('/api/arcade/missions/:id/instructions', async (req) => missionInstructions(app, (req.params as P).id));
  s.put('/api/arcade/missions/:id/done', async (req) => {
    setMissionDone(app, (req.params as P).id, true);
    return { ok: true };
  });
  s.delete('/api/arcade/missions/:id/done', async (req) => {
    setMissionDone(app, (req.params as P).id, false);
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
  // AI suggestions and AI-written worlds. Nothing is saved as a world until the owner accepts it.
  s.post('/api/arcade/builder/suggest/worlds', async (req) => {
    const b = parse(z.object({ hint: z.string().max(500).optional(), mode: z.enum(SUGGEST_MODES).optional() }), req.body ?? {}, 'suggestion request');
    const r = await suggestWorlds(app, b.hint, b.mode);
    return { suggestions: r.result, model: r.provenance.model ?? null };
  });
  s.post('/api/arcade/builder/suggest/tasks', async (req) => {
    const b = parse(z.object({ worldId: z.string().min(3), milestoneId: z.string().min(3).optional(), hint: z.string().max(500).optional() }), req.body, 'suggestion request');
    const r = await suggestTasks(app, b);
    return { suggestions: r.result, model: r.provenance.model ?? null };
  });
  // Slow AI work (a whole world, tidied notes) runs as a draft: the request returns at once, the answer is
  // stored on the draft, and the page polls it, so leaving the page loses nothing. Problems that can be
  // found before asking the AI (bad settings, no AI provider) still come back at once.
  s.post('/api/arcade/builder/generate', async (req) => {
    const b = parse(GenerateBody, req.body, 'world settings');
    await checkGenerate(app, b);
    const draft = startDraft(app, 'world', b, async () => {
      const r = await generateWorld(app, b);
      return { result: r.result, model: r.provenance.model ?? null };
    });
    return { draft };
  });
  s.post('/api/arcade/builder/tidy', async (req) => {
    const b = parse(z.object({ notes: z.string().trim().min(1).max(NOTES_MAX) }), req.body, 'notes');
    await requireAi(app);
    const draft = startDraft(app, 'notes', b, async () => {
      const r = await tidyNotes(app, b.notes);
      return { result: r.result, model: r.provenance.model ?? null };
    });
    return { draft };
  });
  s.get('/api/arcade/builder/drafts', async (req) => {
    const kind = parse(z.object({ kind: z.enum(DRAFT_KINDS).optional() }), req.query as Q, 'drafts').kind;
    return { drafts: listDrafts(app, kind) };
  });
  s.get('/api/arcade/builder/drafts/:id', async (req) => getDraft(app, (req.params as P).id));
  s.delete('/api/arcade/builder/drafts/:id', async (req) => {
    discardDraft(app, (req.params as P).id);
    return { ok: true };
  });
  s.post('/api/arcade/builder/worlds/from-proposal', async (req) => {
    const b = parse(Proposal.extend({ draftId: z.string().min(3).optional() }), req.body, 'world');
    const saved = createWorldFromProposal(app, b);
    // The draft has become a real world, so it leaves the drafts list.
    if (b.draftId) app.db.run("DELETE FROM world_drafts WHERE id = ? AND kind = 'world'", b.draftId);
    return saved;
  });
}
