import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppContext } from '../../app/context.ts';
import { notFound, validation } from '../../core/errors.ts';
import { iso } from '../../core/time.ts';
import { addReviewNote } from '../generation/notes.ts';

// HAPPY DAFFY missions: a list for learning the whole suite, one mission per chapter of the walkthrough
// guide (owner's choice, 2026-11-09). Each mission's instructions are that chapter's text, read straight
// from docs/guide/WALKTHROUGH.md, so the instructions are written once and the popup matches the guide
// as of the last app start.
// The list only sends titles; a chapter's text is fetched when its INSTRUCTIONS popup is opened.

export const GUIDE_REL = 'docs/guide/WALKTHROUGH.md';

export interface MissionDef {
  id: string;
  /** The chapter heading in the guide, without its number. Tests check every one is found. */
  chapter: string;
  /** The screen the mission is about. */
  route: string;
  /**
   * Set while the thing the mission teaches isn't built yet. The mission shows as LOCKED, can't be marked
   * done, and its INSTRUCTIONS popup shows this note instead of a guide chapter. Remove it (and add the
   * guide chapter) once the feature ships.
   */
  locked?: string;
  /** Missions that must be done first: the mission stays locked until they are (it's earned). */
  requires?: readonly string[];
  /**
   * Cleared by a report, not by MARK DONE (owner, 2026-11-10): you try the thing, pick the product you
   * made, and write how it came out. The report is also filed as a note for the AI on that product.
   */
  report?: MissionReportRule;
  /**
   * A multi-part mission: one report per part, each about a product of that part's type. The mission
   * clears when every part has its report. Implies `report`.
   */
  parts?: readonly MissionPartDef[];
}

export interface MissionReportRule {
  /** What the report box asks. */
  ask: string;
  /** The product picked must have a Brief for the AI. */
  needsBrief?: boolean;
}

export interface MissionPartDef {
  id: string;
  title: string;
  /** The product type the part is about: the report must name a product of this type. */
  productType: string;
  /** A preset that fills the New product form for this part, if one exists. */
  presetId?: string;
}

export const REPORT_MIN = 15;
export const REPORT_MAX = 1000;

// Order follows the guide, after any locked missions the owner put first. Ids are fixed so a renamed chapter keeps its done mark (update `chapter` only).
export const MISSIONS: readonly MissionDef[] = [
  // Owner, 2026-11-09: student product types are both a build job and mission #1. Built 2026-11-10 (assignment
  // tracker, timetable, reading log), so it is no longer locked as unbuilt; its instructions are guide chapter 19.
  {
    id: 'student-types',
    chapter: 'Student product types',
    route: '/library',
    // Owner, 2026-11-09: earned, not given. Clear the screens where new types get made first.
    requires: ['library', 'templates'],
  },
  { id: 'arcade-link', chapter: 'HAPPY DAFFY arcade (menu link)', route: '/arcade' },
  { id: 'dashboard', chapter: 'Dashboard', route: '/' },
  { id: 'calendar', chapter: 'Production calendar', route: '/calendar' },
  { id: 'digest', chapter: 'Research digest', route: '/digest' },
  { id: 'research', chapter: 'Research & opportunities', route: '/research' },
  { id: 'library', chapter: 'Product library', route: '/library' },
  // Owner, 2026-11-10: try the Brief box and report back. Cleared by a report, which also feeds the AI.
  {
    id: 'brief',
    chapter: 'Presets and the Brief box',
    route: '/library?new=1',
    report: { ask: 'Which product did you write a Brief for, and how did the wording come out? Did the AI follow it?', needsBrief: true },
  },
  { id: 'imports', chapter: 'Imports', route: '/imports' },
  { id: 'factory-floor', chapter: 'Factory floor', route: '/packing' },
  { id: 'templates', chapter: 'Templates', route: '/templates' },
  { id: 'jobs', chapter: 'Production jobs', route: '/jobs' },
  { id: 'qa', chapter: 'QA results', route: '/qa' },
  { id: 'batches', chapter: 'Batch approval', route: '/batches' },
  { id: 'rework', chapter: 'Rework', route: '/rework' },
  { id: 'ai-notes', chapter: 'Notes for the AI', route: '/ai-notes' },
  { id: 'listings', chapter: 'Marketplace listings', route: '/listings' },
  { id: 'publishing', chapter: 'Publishing status', route: '/publishing' },
  { id: 'analytics', chapter: 'Analytics', route: '/analytics' },
  { id: 'settings', chapter: 'Settings & integrations', route: '/settings' },
  // Part 2 of the guide is one chapter for the whole arcade.
  { id: 'happy-daffy', chapter: 'HAPPY DAFFY', route: '/arcade' },
];

export interface Mission {
  id: string;
  number: number;
  title: string;
  route: string;
  done: boolean;
  completedAt: string | null;
  /** False when the guide is missing or this chapter can't be found in it. A locked mission has its note. */
  hasInstructions: boolean;
  /** Not built yet, or still to be earned: can't be marked done. */
  locked: boolean;
  /** Titles of the missions still to clear before this one unlocks. */
  needs: string[];
  /** Cleared by writing a report (per part, if it has parts) instead of MARK DONE. */
  report: { ask: string; needsBrief: boolean } | null;
  parts: MissionPart[];
}

export interface MissionPart {
  id: string;
  title: string;
  productType: string;
  presetId: string | null;
  done: boolean;
  report: MissionReport | null;
}

export interface MissionReport { productId: string; productTitle: string; report: string; at: string }

const PART2_TITLE = 'HAPPY DAFFY';

/** Every chapter of the guide by heading: Part 1's numbered "## N. Title" chapters and Part 2 ("# Part 2: Title"). */
export function parseGuide(md: string): Map<string, string> {
  const chapters = new Map<string, string>();
  const lines = md.split(/\r?\n/);
  let title: string | null = null;
  let body: string[] = [];
  const flush = () => {
    if (title !== null) chapters.set(title, cleanChapter(body));
    title = null;
    body = [];
  };
  for (const line of lines) {
    const numbered = /^## \d+\.\s+(.+?)\s*$/.exec(line);
    const part = /^# Part \d+:\s+(.+?)\s*$/.exec(line);
    if (numbered || part) {
      flush();
      title = (numbered ?? part)![1]!;
      continue;
    }
    // A chapter ends at the next top-level heading, or at the next unnumbered "## " heading. Part 2's
    // sections are "## " headings inside its one chapter, so they don't end it.
    if (/^# /.test(line) || (/^## /.test(line) && title !== null && title !== PART2_TITLE)) {
      flush();
      continue;
    }
    if (title !== null) body.push(line);
  }
  flush();
  return chapters;
}

function cleanChapter(lines: string[]): string {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw
      // Pictures don't fit a quick text popup.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // Links inside the guide become plain text (the popup has no anchors to jump to).
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    if (/^\s*---\s*$/.test(line)) continue;
    if (raw.trim() !== '' && line.trim() === '') continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The guide is read once, when the server starts (the app is restarted after every pull anyway), so no
// request ever touches the disk. Null means the guide isn't in this copy.
let chapters: Map<string, string> | null = null;

/** Reads the guide's chapters. Called once at server start, before any mission route runs. */
export function loadGuide(app: AppContext): void {
  let md: string;
  try {
    md = readFileSync(join(app.paths.root, GUIDE_REL), 'utf8');
  } catch {
    chapters = null;
    return;
  }
  // "Things this guide found" closes Part 2; cut there so it never lands in a popup.
  const end = md.search(/^## Things this guide found/m);
  chapters = parseGuide(end === -1 ? md : md.slice(0, end));
}

export function listMissions(app: AppContext): { missions: Mission[]; guideFound: boolean } {
  const done = new Map(app.db.all<{ mission_id: string; completed_at: string }>('SELECT mission_id, completed_at FROM arcade_missions_done').map((r) => [r.mission_id, r.completed_at]));
  const reports = allReports(app);
  return {
    guideFound: chapters !== null,
    missions: MISSIONS.map((m, i) => {
      const needs = unmet(m, done);
      return {
      id: m.id,
      number: i + 1,
      title: m.chapter,
      route: m.route,
      done: done.has(m.id),
      completedAt: done.get(m.id) ?? null,
      hasInstructions: m.locked ? true : !!chapters?.get(m.chapter),
      locked: !!m.locked || needs.length > 0,
      needs,
      report: rule(m),
      parts: (m.parts ?? []).map((p) => {
        const r = reports.get(`${m.id}\u0000${p.id}`) ?? null;
        return { id: p.id, title: p.title, productType: p.productType, presetId: p.presetId ?? null, done: !!r, report: r };
      }),
    };
    }),
  };
}

function rule(m: MissionDef): { ask: string; needsBrief: boolean } | null {
  if (m.report) return { ask: m.report.ask, needsBrief: !!m.report.needsBrief };
  if (m.parts?.length) return { ask: 'Which product did you make, and how did it come out?', needsBrief: false };
  return null;
}

function allReports(app: AppContext): Map<string, MissionReport> {
  const rows = app.db.all<{ mission_id: string; part_id: string; product_id: string; title: string; report: string; created_at: string }>(
    'SELECT r.mission_id, r.part_id, r.product_id, p.title, r.report, r.created_at FROM arcade_mission_reports r JOIN products p ON p.id = r.product_id',
  );
  return new Map(rows.map((r) => [`${r.mission_id}\u0000${r.part_id}`, { productId: r.product_id, productTitle: r.title, report: r.report, at: r.created_at }]));
}

function unmet(m: MissionDef, done: Map<string, string> | Set<string>): string[] {
  return (m.requires ?? []).filter((id) => !done.has(id)).map((id) => MISSIONS.find((x) => x.id === id)?.chapter ?? id);
}

function mission(id: string): MissionDef {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) throw notFound('Mission', id);
  return m;
}

export function missionInstructions(id: string): { id: string; title: string; text: string; source: string } {
  const m = mission(id);
  if (m.locked) return { id: m.id, title: m.chapter, text: m.locked, source: 'TASKS.md (build list)' };
  const text = chapters?.get(m.chapter);
  if (!text) throw notFound('Instructions for mission', id);
  return { id: m.id, title: m.chapter, text, source: GUIDE_REL };
}

export function setMissionDone(app: AppContext, id: string, done: boolean): void {
  const m = mission(id);
  if (done && rule(m)) throw validation(`"${m.chapter}" is cleared by writing a report on what you made, not by MARK DONE.`);
  if (done) assertUnlocked(app, m);
  if (done) app.db.run('INSERT OR IGNORE INTO arcade_missions_done (mission_id, completed_at) VALUES (?, ?)', id, iso());
  else {
    // UNDO puts a report mission back to the start. The notes it filed for the AI stay: they're feedback.
    app.db.run('DELETE FROM arcade_missions_done WHERE mission_id = ?', id);
    app.db.run('DELETE FROM arcade_mission_reports WHERE mission_id = ?', id);
  }
}

function assertUnlocked(app: AppContext, m: MissionDef): void {
  if (m.locked) throw validation(`"${m.chapter}" is locked until it's built, so it can't be marked done yet.`);
  const finished = new Set(app.db.all<{ mission_id: string }>('SELECT mission_id FROM arcade_missions_done').map((r) => r.mission_id));
  const needs = unmet(m, finished);
  if (needs.length) throw validation(`"${m.chapter}" unlocks after you clear: ${needs.join(', ')}.`);
}

/**
 * A mission report (owner, 2026-11-10): you made something, you say which product and how it came out.
 * Nothing is detected for you; the check is only that the product exists and fits the mission (the
 * right type for a part, a Brief for the brief mission). The report is filed as a note for the AI on
 * the product's current version. The mission clears once every part (or its one report) is in.
 */
export function reportMission(app: AppContext, id: string, input: { partId?: string; productId: string; report: string }): { done: boolean; noteId: string } {
  const m = mission(id);
  const r = rule(m);
  if (!r) throw validation(`"${m.chapter}" is cleared with MARK DONE; it has no report.`);
  assertUnlocked(app, m);
  const text = input.report.trim();
  if (text.length < REPORT_MIN) throw validation(`Write at least ${REPORT_MIN} characters: which product, and how it came out.`);
  if (text.length > REPORT_MAX) throw validation(`Keep the report under ${REPORT_MAX} characters.`);
  let partId = '';
  let part: MissionPartDef | undefined;
  if (m.parts?.length) {
    part = m.parts.find((p) => p.id === input.partId);
    if (!part) throw validation(`Pick which part of "${m.chapter}" this report is for.`);
    partId = part.id;
  }
  const product = app.db.get<{ id: string; title: string; product_type: string; version_id: string | null; brief: string | null }>(
    `SELECT p.id, p.title, p.product_type, p.current_version_id AS version_id, s.brief FROM products p
       LEFT JOIN product_versions v ON v.id = p.current_version_id LEFT JOIN product_specs s ON s.id = v.spec_id WHERE p.id = ?`,
    input.productId,
  );
  if (!product) throw notFound('Product', input.productId);
  if (!product.version_id) throw validation(`"${product.title}" has no version yet, so there's nothing to report on.`);
  if (part && product.product_type !== part.productType) throw validation(`"${product.title}" isn't a ${part.title}. Pick a product of that type.`);
  if (r.needsBrief && !product.brief?.trim()) throw validation(`"${product.title}" has no Brief for the AI. Pick a product you wrote a Brief for.`);
  const label = part ? `${m.chapter}: ${part.title}` : m.chapter;
  const note = addReviewNote(app, product.version_id, `Mission report (${label}): ${text}`);
  app.db.run(
    'INSERT OR REPLACE INTO arcade_mission_reports (mission_id, part_id, product_id, report, note_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    m.id, partId, product.id, text, note.id, iso(),
  );
  const filed = new Set(app.db.all<{ part_id: string }>('SELECT part_id FROM arcade_mission_reports WHERE mission_id = ?', m.id).map((x) => x.part_id));
  const done = m.parts?.length ? m.parts.every((p) => filed.has(p.id)) : true;
  if (done) app.db.run('INSERT OR IGNORE INTO arcade_missions_done (mission_id, completed_at) VALUES (?, ?)', m.id, iso());
  return { done, noteId: note.id };
}

/** The products a report could be about: the right type for a part, or ones with a Brief. Newest first. */
export function reportCandidates(app: AppContext, id: string, partId?: string): { id: string; title: string; productType: string; updatedAt: string }[] {
  const m = mission(id);
  const r = rule(m);
  if (!r) return [];
  const part = m.parts?.find((p) => p.id === partId);
  if (m.parts?.length && !part) throw validation(`Pick which part of "${m.chapter}" this report is for.`);
  const where = ['p.current_version_id IS NOT NULL'];
  const args: unknown[] = [];
  if (part) { where.push('p.product_type = ?'); args.push(part.productType); }
  if (r.needsBrief) where.push("trim(coalesce(s.brief, '')) <> ''");
  return app.db.all<{ id: string; title: string; productType: string; updatedAt: string }>(
    `SELECT p.id, p.title, p.product_type AS productType, p.updated_at AS updatedAt FROM products p
       JOIN product_versions v ON v.id = p.current_version_id JOIN product_specs s ON s.id = v.spec_id
       WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC LIMIT 50`,
    ...args,
  );
}
