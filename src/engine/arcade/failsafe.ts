import type { AppContext } from '../../app/context.ts';

// HAPPY DAFFY milestone 9: the laziness failsafe (spec D5, C10, G3, H10). Owner's choice, 2026-11-10: the
// spec's recommendation (H10 option 2): weighted signals add to one score, and the score sets a friction stage.
//
// Signals, each only counted once its threshold AND weight are set in Settings -> arcade.failsafe:
//   streak  this approval makes a run of `streakLength` approvals in a row
//   fast    the review took less than `fastReviewSeconds`
//   empty   an approval with no WHAT I LIKED note
//   copied  a rejection reason at least `copiedReasonSimilarity` alike to an earlier reason
// A careful review (no signal at all) lowers the score by `cooldownPerCarefulReview` (genuine effort cools it).
// Friction stages are cumulative, starting at the scores in `stageThresholds`:
//   1 the review queue is shuffled   2 APPROVE and REJECT swap places   3 "name one thing wrong" before approving
//   4 APPROVE must be held for 5 seconds (locked at 5 by default)
// Every number is TBD in the spec, so with the defaults the failsafe is off: no score, no friction.
// Locked rules kept: it never changes an asset or its QA, and its wording never scolds.

export const FRICTION = ['NONE', 'SHUFFLED ORDER', 'BUTTONS MOVE', 'NAME ONE THING WRONG', 'HOLD TO APPROVE'] as const;

export interface Friction {
  stage: number;
  score: number;
  /** False while no stage threshold is set: the failsafe is off. */
  enabled: boolean;
  shuffle: boolean;
  swapButtons: boolean;
  nameOneThingWrong: boolean;
  holdSeconds: number | null;
}

export function laziness(app: AppContext): number {
  return app.db.value<number>('SELECT score FROM laziness_state WHERE id = 1') ?? 0;
}

export function frictionNow(app: AppContext): Friction {
  const f = app.settings.get('arcade').failsafe;
  const score = laziness(app);
  const thresholds = [...f.stageThresholds].sort((a, b) => a - b);
  const stage = thresholds.filter((t) => score >= t).length;
  return {
    stage, score, enabled: thresholds.length > 0,
    shuffle: stage >= 1, swapButtons: stage >= 2, nameOneThingWrong: stage >= 3, holdSeconds: stage >= 4 ? f.approveHoldSeconds : null,
  };
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/\p{L}{3,}/gu) ?? []);
}
/** Word-overlap likeness, 0..1 (Jaccard). Enough to catch a pasted reason; it never reads the asset. */
export function likeness(a: string, b: string): number {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

export interface ReviewSignals { streak: boolean; fast: boolean; empty: boolean; copied: boolean }

export function signalsFor(app: AppContext, r: { outcome: 'APPROVE' | 'REJECT'; durationMs: number; likedNote: string; reason: string }): ReviewSignals {
  const f = app.settings.get('arcade').failsafe;
  let streak = false;
  if (r.outcome === 'APPROVE' && f.streakLength !== null) {
    const recent = app.db.all<{ outcome: string }>("SELECT outcome FROM arcade_reviews WHERE outcome IN ('APPROVE','REJECT') ORDER BY decided_at DESC LIMIT ?", f.streakLength - 1);
    streak = recent.length === f.streakLength - 1 && recent.every((x) => x.outcome === 'APPROVE');
  }
  const fast = f.fastReviewSeconds !== null && r.durationMs < f.fastReviewSeconds * 1000;
  const empty = r.outcome === 'APPROVE' && !r.likedNote.trim();
  let copied = false;
  if (r.outcome === 'REJECT' && f.copiedReasonSimilarity !== null) {
    const earlier = app.db.all<{ reason: string }>("SELECT reason FROM arcade_reviews WHERE outcome = 'REJECT' AND reason != '' ORDER BY decided_at DESC LIMIT 50");
    copied = earlier.some((e) => likeness(e.reason, r.reason) >= f.copiedReasonSimilarity!);
  }
  return { streak, fast, empty, copied };
}

/** After a review: add the weights of its signals to the score, or cool it down after a careful review. */
export function updateLaziness(app: AppContext, s: ReviewSignals): number {
  const f = app.settings.get('arcade').failsafe;
  const w = f.weights;
  const add = (s.streak ? w.streak ?? 0 : 0) + (s.fast ? w.fast ?? 0 : 0) + (s.empty ? w.empty ?? 0 : 0) + (s.copied ? w.copied ?? 0 : 0);
  const any = s.streak || s.fast || s.empty || s.copied;
  let score = laziness(app);
  if (add > 0) score += add;
  else if (!any && f.cooldownPerCarefulReview !== null) score = Math.max(0, score - f.cooldownPerCarefulReview);
  app.db.run('INSERT INTO laziness_state (id, score, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at', score, new Date().toISOString());
  return score;
}
