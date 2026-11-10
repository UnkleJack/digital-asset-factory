import type { AppContext } from '../../app/context.ts';
import { portraitUrl } from './portraits.ts';
import { creditState, canStartWork, type CreditState as Credits } from './credits.ts';
import { finishedBoard } from './leaderboards.ts';
import { xpTotals } from './codex.ts';

// The arcade front end ("Asset Foundry") from the UX spec: the cabinet, its characters and their credits.

export type CharacterType = 'IDE' | 'AI_CHATBOT' | 'DAF';

export interface ArcadeCharacter {
  id: string;
  type: CharacterType;
  /** Persona name chosen by the owner. */
  displayName: string;
  /** The suite area this character stands for: IDE, AI CHATBOT or DAF. */
  role: string;
  tagline: string;
  /** Short persona bio for the select screen. */
  bio: string;
  /** What this character's worlds hold. Character choice limits which projects can be seen. */
  scope: string;
  /** EYE, CRAFT, TASTE, PATIENCE. Null until the progression rules (spec D6/H11) are approved. */
  stats: { eye: number | null; craft: number | null; taste: number | null; patience: number | null };
}

// Descriptions come from the owner's answer on 2026-11-03; persona names GAGE (ninja), B.M.O. (robot) and SPARKS (wizard) chosen by the owner. Stat values are deliberately null:
// the spec says not to invent XP or stat values before the progression model is approved.
export const CHARACTERS: readonly ArcadeCharacter[] = [
  {
    id: 'ide',
    type: 'IDE',
    displayName: 'GAGE',
    role: 'IDE',
    tagline: 'The coder',
    bio: 'A ninja who works in the shadows of the code. Gage takes the coding projects, the code-built assets and the tools the factory runs on, and gets in and out clean.',
    scope: 'Coding projects, code-built assets and tool-building tasks.',
    stats: { eye: null, craft: null, taste: null, patience: null },
  },
  {
    id: 'ai-chatbot',
    type: 'AI_CHATBOT',
    displayName: 'B.M.O.',
    role: 'AI CHATBOT',
    tagline: 'The advisor',
    bio: 'A desk robot with a headset: your secretary. Run ideas by B.M.O. and ask for advice. Later, once the factory tracks the numbers, B.M.O. will answer questions about income, money owed and approvals.',
    scope: 'A chat built into the factory for running ideas by, and asking for advice, direction or suggestions.',
    stats: { eye: null, craft: null, taste: null, patience: null },
  },
  {
    id: 'daf',
    type: 'DAF',
    displayName: 'SPARKS',
    role: 'DAF',
    tagline: 'The maker',
    bio: 'A wizard who runs the production floor. Coloring books, planners, journals, mazes: Sparks conjures the whole product line and sends every piece through QA before it ships.',
    scope: 'The production floor, where the work gets done and the assets get made.',
    stats: { eye: null, craft: null, taste: null, patience: null },
  },
];

export interface ArcadeState {
  /** Live provider headroom when a provider reports a limit, otherwise the labelled TEST number (credits.ts). */
  credits: Credits;
  characters: readonly (ArcadeCharacter & { portraitUrl: string | null; xp: number; xpEvents: number })[];
  /** The hi-score banner: the Finished leaderboard's top entries (spec B10). Empty until a pack is finalized; never made up. */
  hiScores: { label: string; score: number }[];
}

export async function arcadeState(app: AppContext): Promise<ArcadeState> {
  const xp = xpTotals(app);
  return {
    credits: await creditState(app),
    characters: CHARACTERS.map((c) => ({ ...c, portraitUrl: portraitUrl(app, c.id), xp: xp[c.id]?.xp ?? 0, xpEvents: xp[c.id]?.events ?? 0 })),
    hiScores: finishedBoard(app).slice(0, 5).map((e) => ({ label: e.title, score: e.items })),
  };
}

/** The Start Gate rule (spec B2, locked): ENTER WORLD works only when N > 0. */
export function canStart(state: Pick<ArcadeState, 'credits'>): boolean {
  return canStartWork(state.credits);
}
