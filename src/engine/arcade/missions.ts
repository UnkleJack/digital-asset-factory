import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppContext } from '../../app/context.ts';
import { notFound, validation } from '../../core/errors.ts';
import { iso } from '../../core/time.ts';

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
}

// Order follows the guide, after any locked missions the owner put first. Ids are fixed so a renamed chapter keeps its done mark (update `chapter` only).
export const MISSIONS: readonly MissionDef[] = [
  // Owner, 2026-11-09: student product types are both a build job and mission #1, shown now as locked.
  {
    id: 'student-types',
    chapter: 'Student product types',
    route: '/library',
    // Owner, 2026-11-09: earned, not given. Clear the screens where new types get made first.
    requires: ['library', 'templates'],
    locked:
      "LOCKED: NOT BUILT YET.\n\nStudent product types don't exist in the Factory yet, so there's nothing to learn here so far. Building them is item **B1** on the build list in `TASKS.md`.\n\nThe ones named so far are assignment trackers, timetables and reading logs. The full list isn't decided yet.\n\nIt's earned, not given: once those types exist, it unlocks after you clear the **Product library** and **Templates** missions, the screens where new types get made.",
  },
  { id: 'arcade-link', chapter: 'HAPPY DAFFY arcade (menu link)', route: '/arcade' },
  { id: 'dashboard', chapter: 'Dashboard', route: '/' },
  { id: 'calendar', chapter: 'Production calendar', route: '/calendar' },
  { id: 'digest', chapter: 'Research digest', route: '/digest' },
  { id: 'research', chapter: 'Research & opportunities', route: '/research' },
  { id: 'library', chapter: 'Product library', route: '/library' },
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
}

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
    };
    }),
  };
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
  if (done && m.locked) throw validation(`"${m.chapter}" is locked until it's built, so it can't be marked done yet.`);
  if (done) {
    const finished = new Set(app.db.all<{ mission_id: string }>('SELECT mission_id FROM arcade_missions_done').map((r) => r.mission_id));
    const needs = unmet(m, finished);
    if (needs.length) throw validation(`"${m.chapter}" unlocks after you clear: ${needs.join(', ')}.`);
  }
  if (done) app.db.run('INSERT OR IGNORE INTO arcade_missions_done (mission_id, completed_at) VALUES (?, ?)', id, iso());
  else app.db.run('DELETE FROM arcade_missions_done WHERE mission_id = ?', id);
}
