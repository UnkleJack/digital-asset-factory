import type { AppContext } from '../../app/context.ts';
import { newId } from '../../core/ids.ts';
import { validation } from '../../core/errors.ts';
import { CHARACTERS } from './service.ts';

// HAPPY DAFFY milestone 7: XP and the Codex / Quest Log (spec B11, C12, D6).
// Owner's choice, 2026-11-10: the spec's recommendations (H11 option 1): each character has its own XP.
// What earns XP (spec, locked: "XP is earned through exploring the application"):
//   - task       finishing a world task, in its LOW / MEDIUM / HIGH difficulty
//   - tab        learning one tab: marking that screen's mission done while playing a character
//   - cross_tab  learning how two tabs affect each other: doing something in one that shows up in the other
// Each thing is learned once per character (unique subject), so XP is never paid twice.
// Every XP amount is TBD in the spec (D6), so each starts blank in Settings -> arcade.xp. A blank amount
// still records the event (the Codex shows what was learned) but adds no XP. EYE, CRAFT, TASTE and PATIENCE
// have no approved formula (Constitution Art. 9, item G), so they stay blank.

export type XpKind = 'task' | 'tab' | 'cross_tab';

/** How tabs affect each other: each link is learned by doing the first part and seeing it land in the second. */
export const CROSS_TAB_LINKS = [
  { id: 'builder>worlds', label: 'WORLD BUILDER feeds WORLDS', how: 'Give a character a task in the World Builder, then enter that world.' },
  { id: 'workspace>qa', label: 'TASK WORKSPACE feeds QA REVIEW', how: 'Make an asset for a task, then review it.' },
  { id: 'qa>packs', label: 'QA REVIEW feeds PACKS', how: 'Approve an asset; approved assets are what packs are built from.' },
  { id: 'packs>leaderboards', label: 'PACKS feed LEADERBOARDS', how: 'Finalize a ready-to-sell pack; finalized packs make the FINISHED board.' },
] as const;
export type CrossTabId = (typeof CROSS_TAB_LINKS)[number]['id'];

function xpFor(app: AppContext, kind: XpKind, difficulty: string | null): number | null {
  const x = app.settings.get('arcade').xp;
  if (kind === 'tab') return x.tab;
  if (kind === 'cross_tab') return x.crossTab;
  return difficulty === 'LOW' ? x.taskLow : difficulty === 'HIGH' ? x.taskHigh : x.taskMedium;
}

/** Records one learned thing. Returns false when this character already learned it (no double award). */
export function recordXp(app: AppContext, characterId: string, kind: XpKind, subject: string, label: string, difficulty: 'LOW' | 'MEDIUM' | 'HIGH' | null = null): boolean {
  if (!CHARACTERS.some((c) => c.id === characterId)) throw validation(`Unknown character "${characterId}"`);
  if (app.db.get('SELECT 1 FROM xp_events WHERE character_id = ? AND kind = ? AND subject = ?', characterId, kind, subject)) return false;
  app.db.insert('xp_events', { id: newId('xpe'), character_id: characterId, kind, difficulty, subject, label: label.slice(0, 160), xp: xpFor(app, kind, difficulty), created_at: new Date().toISOString() });
  return true;
}

/** A world task finished: XP for its character at the task's difficulty. */
export function recordTaskXp(app: AppContext, taskId: string): void {
  const t = app.db.get<{ character_id: string; title: string; difficulty: 'LOW' | 'MEDIUM' | 'HIGH' }>('SELECT character_id, title, difficulty FROM world_tasks WHERE id = ?', taskId);
  if (t) recordXp(app, t.character_id, 'task', taskId, t.title, t.difficulty);
}

export function recordCrossTab(app: AppContext, characterId: string | null | undefined, link: CrossTabId): void {
  if (!characterId) return;
  const l = CROSS_TAB_LINKS.find((x) => x.id === link)!;
  recordXp(app, characterId, 'cross_tab', link, l.label);
}

export function xpTotals(app: AppContext): Record<string, { xp: number; events: number }> {
  const rows = app.db.all<{ character_id: string; xp: number; events: number }>('SELECT character_id, coalesce(sum(xp), 0) AS xp, count(*) AS events FROM xp_events GROUP BY character_id');
  return Object.fromEntries(rows.map((r) => [r.character_id, { xp: r.xp, events: r.events }]));
}

/** Everything the Codex screen shows for one character. */
export function codexFor(app: AppContext, characterId: string, missions: { id: string; title: string; locked: boolean }[]) {
  const c = CHARACTERS.find((x) => x.id === characterId);
  if (!c) throw validation(`Unknown character "${characterId}"`);
  const events = app.db.all<{ kind: XpKind; difficulty: string | null; subject: string; label: string; xp: number | null; created_at: string }>(
    'SELECT kind, difficulty, subject, label, xp, created_at FROM xp_events WHERE character_id = ? ORDER BY created_at DESC', characterId);
  const x = app.settings.get('arcade').xp;
  const learnedTabs = new Set(events.filter((e) => e.kind === 'tab').map((e) => e.subject));
  const learnedLinks = new Set(events.filter((e) => e.kind === 'cross_tab').map((e) => e.subject));
  const openTasks = app.db.all<{ id: string; title: string; difficulty: string; world: string }>(
    `SELECT t.id, t.title, t.difficulty, w.name AS world FROM world_tasks t JOIN worlds w ON w.id = t.world_id
     WHERE t.character_id = ? AND t.status != 'COMPLETE' AND w.status = 'active' ORDER BY t.created_at`, characterId);
  const tabs = missions.filter((m) => !m.locked);
  return {
    character: { id: c.id, displayName: c.displayName, role: c.role },
    xp: events.reduce((s, e) => s + (e.xp ?? 0), 0),
    /** True while no XP amount has been set: the total is then 0 because nothing is valued yet, not because nothing was done. */
    xpUnset: Object.values(x).every((v) => v === null),
    xpValues: x,
    stats: c.stats,
    quests: {
      done: events.filter((e) => e.kind === 'task').map((e) => ({ title: e.label, difficulty: e.difficulty, xp: e.xp, at: e.created_at })),
      open: openTasks,
    },
    tabs: { learned: tabs.filter((m) => learnedTabs.has(m.id)).map((m) => m.title), total: tabs.length, left: tabs.filter((m) => !learnedTabs.has(m.id)).map((m) => m.title) },
    crossTab: CROSS_TAB_LINKS.map((l) => ({ ...l, learned: learnedLinks.has(l.id) })),
    log: events.slice(0, 40),
  };
}
