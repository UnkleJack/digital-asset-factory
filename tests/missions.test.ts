import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { bootstrap, type App } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { buildServer } from '../src/server/app.ts';
import { createWorker } from '../src/jobs/handlers.ts';
import type { Worker } from '../src/jobs/worker.ts';
import { MISSIONS, parseGuide } from '../src/engine/arcade/missions.ts';
import { tempDir } from './helpers.ts';

// HAPPY DAFFY missions: one per walkthrough chapter, instructions read from the guide, done marks kept.

const PORT = 4397;
const HOST = `127.0.0.1:${PORT}`;
let app: App;
let worker: Worker;
let server: FastifyInstance;

before(async () => {
  app = bootstrap({ dataDir: tempDir(), secrets: new MemorySecretStore(), logConsole: false, pacing: false });
  worker = createWorker(app, {});
  server = await buildServer({ app, worker, scheduler: null, port: PORT, startedAt: new Date() });
});
after(async () => {
  await server.close();
  await worker.stop();
  await app.close();
});

async function call(method: string, url: string, payload?: unknown) {
  const r = await server.inject({ method: method as 'GET', url, headers: { host: HOST, 'x-daf-client': '1', ...(payload !== undefined && { 'content-type': 'application/json' }) }, ...(payload !== undefined && { payload: JSON.stringify(payload) }) });
  return { status: r.statusCode, body: r.json() as any };
}

test('missions: every guide chapter has a mission and every mission finds its chapter', async () => {
  const r = await call('GET', '/api/arcade/missions');
  assert.equal(r.status, 200);
  assert.equal(r.body.guideFound, true);
  assert.equal(r.body.missions.length, MISSIONS.length);
  for (const m of r.body.missions) assert.equal(m.hasInstructions, true, `no guide chapter for mission "${m.title}"`);
  // Owner, 2026-11-09: student product types come first. Built 2026-11-10, but still earned: locked until
  // Product library and Templates are cleared.
  assert.equal(r.body.missions[0].id, 'student-types');
  assert.equal(r.body.missions[0].locked, true);
  assert.deepEqual(r.body.missions[0].needs, ['Product library', 'Templates']);
  assert.equal(MISSIONS.some((m) => m.locked), false, 'nothing is locked as unbuilt any more');
  assert.equal(r.body.missions.filter((m: any) => m.locked).length, 1);
  // The list sends titles only, never the chapter text.
  assert.equal('text' in r.body.missions[0], false);
  assert.deepEqual(r.body.missions.map((m: any) => m.number), MISSIONS.map((_, i) => i + 1));
});

test('missions: instructions are the chapter text without pictures, links or the next chapter', async () => {
  const r = await call('GET', '/api/arcade/missions/dashboard/instructions');
  assert.equal(r.status, 200);
  assert.equal(r.body.title, 'Dashboard');
  assert.match(r.body.text, /The eight number tiles/);
  assert.doesNotMatch(r.body.text, /!\[/);
  assert.doesNotMatch(r.body.text, /\]\(/);
  assert.doesNotMatch(r.body.text, /Production calendar\n/);
  const arcade = await call('GET', '/api/arcade/missions/happy-daffy/instructions');
  assert.match(arcade.body.text, /THE WORLD BUILDER/);
  assert.doesNotMatch(arcade.body.text, /Things this guide found/);
  assert.equal((await call('GET', '/api/arcade/missions/nope/instructions')).status, 404);
});

test('missions: mark done and undo', async () => {
  assert.equal((await call('PUT', '/api/arcade/missions/library/done')).status, 200);
  assert.equal((await call('PUT', '/api/arcade/missions/library/done')).status, 200);
  let lib = (await call('GET', '/api/arcade/missions')).body.missions.find((m: any) => m.id === 'library');
  assert.equal(lib.done, true);
  assert.ok(lib.completedAt);
  assert.equal((await call('DELETE', '/api/arcade/missions/library/done')).status, 200);
  lib = (await call('GET', '/api/arcade/missions')).body.missions.find((m: any) => m.id === 'library');
  assert.equal(lib.done, false);
  assert.equal((await call('PUT', '/api/arcade/missions/nope/done')).status, 404);
  // A mission still to be earned can't be marked done; its popup is its guide chapter, now that the types exist.
  assert.equal((await call('PUT', '/api/arcade/missions/student-types/done')).status, 422);
  const note = await call('GET', '/api/arcade/missions/student-types/instructions');
  assert.equal(note.body.source, 'docs/guide/WALKTHROUGH.md');
  assert.match(note.body.text, /Assignment tracker/);
  assert.match(note.body.text, /Class timetable/);
  assert.match(note.body.text, /Reading log/);
  assert.doesNotMatch(note.body.text, /NOT BUILT/);
  // It's earned: it lists the missions to clear first, and drops each one as it's cleared.
  const needsOf = async () => (await call('GET', '/api/arcade/missions')).body.missions[0].needs as string[];
  assert.deepEqual(await needsOf(), ['Product library', 'Templates']);
  await call('PUT', '/api/arcade/missions/templates/done');
  assert.deepEqual(await needsOf(), ['Product library']);
  // Clearing both earns it: it unlocks and can be marked done.
  await call('PUT', '/api/arcade/missions/library/done');
  assert.deepEqual(await needsOf(), []);
  assert.equal((await call('GET', '/api/arcade/missions')).body.missions[0].locked, false);
  assert.equal((await call('PUT', '/api/arcade/missions/student-types/done')).status, 200);
  for (const id of ['student-types', 'library', 'templates']) await call('DELETE', `/api/arcade/missions/${id}/done`);
});

test('missions: the Brief mission is cleared by a report, which is also a note for the AI', async () => {
  const brief = (await call('GET', '/api/arcade/missions')).body.missions.find((m: any) => m.id === 'brief');
  assert.ok(brief, 'the Brief mission is on the list');
  assert.equal(brief.report.needsBrief, true);
  assert.deepEqual(brief.parts, []);
  // Right after Product library (owner, 2026-11-10).
  const ids = MISSIONS.map((m) => m.id);
  assert.equal(ids.indexOf('brief'), ids.indexOf('library') + 1);
  // A report mission can't be cleared with MARK DONE.
  assert.equal((await call('PUT', '/api/arcade/missions/brief/done')).status, 422);

  const withBrief = (await call('POST', '/api/products', { productType: 'word-search', params: { puzzles: 2 }, marketplaces: ['etsy'], brief: 'Use only farm animal words.' })).body;
  const without = (await call('POST', '/api/products', { productType: 'word-search', params: { puzzles: 2 }, marketplaces: ['etsy'] })).body;
  // Only products with a Brief are offered.
  const offered = (await call('GET', '/api/arcade/missions/brief/report-products')).body.map((p: any) => p.id);
  assert.ok(offered.includes(withBrief.productId));
  assert.ok(!offered.includes(without.productId));

  const report = 'The words were all farm animals, like I asked.';
  assert.equal((await call('POST', '/api/arcade/missions/brief/report', { productId: without.productId, report })).status, 422, 'no Brief on it');
  assert.equal((await call('POST', '/api/arcade/missions/brief/report', { productId: withBrief.productId, report: 'ok' })).status, 422, 'too short');
  assert.equal((await call('POST', '/api/arcade/missions/brief/report', { productId: 'prd_nope', report })).status, 404);
  const r = await call('POST', '/api/arcade/missions/brief/report', { productId: withBrief.productId, report });
  assert.equal(r.status, 200);
  assert.equal(r.body.done, true);
  const after1 = (await call('GET', '/api/arcade/missions')).body.missions.find((m: any) => m.id === 'brief');
  assert.equal(after1.done, true);
  // The report is a note for the AI on that product's version.
  const note = app.db.get<{ notes: string }>('SELECT notes FROM review_notes WHERE id = ?', r.body.noteId);
  assert.equal(note?.notes, `Mission report (Presets and the Brief box): ${report}`);
  assert.equal(app.db.value('SELECT version_id FROM review_notes WHERE id = ?', r.body.noteId), withBrief.versionId);

  // UNDO puts the mission back; the note for the AI stays.
  assert.equal((await call('DELETE', '/api/arcade/missions/brief/done')).status, 200);
  assert.equal((await call('GET', '/api/arcade/missions')).body.missions.find((m: any) => m.id === 'brief').done, false);
  assert.equal(app.db.value('SELECT count(*) FROM arcade_mission_reports WHERE mission_id = ?', 'brief'), 0);
  assert.ok(app.db.value('SELECT 1 FROM review_notes WHERE id = ?', r.body.noteId));
  // A plain mission has no report.
  assert.equal((await call('POST', '/api/arcade/missions/dashboard/report', { productId: withBrief.productId, report })).status, 422);
});

test('missions: shelf missions have one part per kind and clear when every part has a report', async () => {
  const { PRESETS } = await import('../src/engine/templates/presets.ts');
  const types = new Set((await server.inject({ method: 'GET', url: '/api/product-types', headers: { host: HOST, 'x-daf-client': '1' } })).json().map((t: any) => t.id));
  const shelves = MISSIONS.filter((m) => m.id.startsWith('shelf-'));
  assert.equal(shelves.length, 5);
  for (const m of shelves) for (const p of m.parts ?? []) {
    assert.ok(types.has(p.productType), `${m.id}/${p.id}: unknown type ${p.productType}`);
    if (p.presetId) assert.equal(PRESETS.find((x) => x.id === p.presetId)?.productType, p.productType, `${m.id}/${p.id}: preset of the wrong kind`);
  }
  // The four kinds that had no preset have one now (owner, 2026-11-10).
  for (const t of ['cleaning-schedule', 'home-inventory', 'guided-journal', 'invoice-template']) assert.ok(PRESETS.some((p) => p.productType === t), `no preset for ${t}`);

  const money = (await call('GET', '/api/arcade/missions')).body.missions.find((m: any) => m.id === 'shelf-money');
  assert.equal(money.title, 'Shelf: money sheets');
  assert.deepEqual(money.parts.map((p: any) => p.id), ['budget', 'invoice']);
  assert.equal((await call('PUT', '/api/arcade/missions/shelf-money/done')).status, 422);

  const budget = (await call('POST', '/api/products', { productType: 'budget-planner', marketplaces: ['etsy'] })).body;
  const invoice = (await call('POST', '/api/products', { productType: 'invoice-template', marketplaces: ['etsy'] })).body;
  const offered = (await call('GET', '/api/arcade/missions/shelf-money/report-products?part=budget')).body.map((p: any) => p.id);
  assert.ok(offered.includes(budget.productId));
  assert.ok(!offered.includes(invoice.productId), 'only budget planners for the budget part');
  const report = 'The categories made sense and the totals rows fit.';
  assert.equal((await call('POST', '/api/arcade/missions/shelf-money/report', { productId: budget.productId, report })).status, 422, 'no part named');
  assert.equal((await call('POST', '/api/arcade/missions/shelf-money/report', { partId: 'budget', productId: invoice.productId, report })).status, 422, 'wrong kind');
  const one = await call('POST', '/api/arcade/missions/shelf-money/report', { partId: 'budget', productId: budget.productId, report });
  assert.equal(one.status, 200);
  assert.equal(one.body.done, false, 'one part of two');
  assert.match(app.db.value<string>('SELECT notes FROM review_notes WHERE id = ?', one.body.noteId) ?? '', /^Mission report \(Shelf: money sheets: Budget planner\): /);
  const two = await call('POST', '/api/arcade/missions/shelf-money/report', { partId: 'invoice', productId: invoice.productId, report: 'Clean layout, the terms line read well.' });
  assert.equal(two.body.done, true);
  const after = (await call('GET', '/api/arcade/missions')).body.missions.find((m: any) => m.id === 'shelf-money');
  assert.equal(after.done, true);
  assert.deepEqual(after.parts.map((p: any) => p.done), [true, true]);
  assert.equal(after.parts[0].report.productId, budget.productId);
  await call('DELETE', '/api/arcade/missions/shelf-money/done');
  assert.deepEqual((await call('GET', '/api/arcade/missions')).body.missions.find((m: any) => m.id === 'shelf-money').parts.map((p: any) => p.done), [false, false]);
});

test('parseGuide: numbered chapters end at the next heading; Part 2 keeps its sections', () => {
  const c = parseGuide('# Part 1: Back\n\n## 1. One\nA\n![pic](x.png)\nSee [two](#2-two).\n\n---\n\n## 2. Two\nB\n\n# Part 2: HAPPY DAFFY\n## SECTION\nC\n## MORE\nD\n');
  assert.equal(c.get('One'), 'A\nSee two.');
  assert.equal(c.get('Two'), 'B');
  assert.equal(c.get('HAPPY DAFFY'), '## SECTION\nC\n## MORE\nD');
});
