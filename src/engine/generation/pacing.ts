// Spreads AI calls out so free tiers aren't exhausted in a burst: a minimum gap between calls to
// the same provider, a daily call ceiling per provider (counted from generation_runs, so it
// survives restarts), and a cool-down after a provider reports it is rate-limited. A provider that
// is cooling down or at its ceiling is skipped and the next one in the fallback chain is used.

export interface PacingConfig {
  minSecondsBetweenCalls: number;
  dailyCallLimits: Record<string, number>;
  cooldownMinutes: number;
}

export class Pacer {
  private nextAllowed = new Map<string, number>();
  private cooledUntil = new Map<string, number>();
  private cfg: () => PacingConfig;
  private callsToday: (provider: string, sinceIso: string) => number;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;

  constructor(cfg: () => PacingConfig, callsToday: (provider: string, sinceIso: string) => number, now: () => number = Date.now, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {
    this.cfg = cfg;
    this.callsToday = callsToday;
    this.now = now;
    this.sleep = sleep;
  }

  /** Why this provider should be skipped right now, or null if it can be used. */
  blocked(provider: string): string | null {
    const until = this.cooledUntil.get(provider) ?? 0;
    if (until > this.now()) return `cooling down after a rate limit until ${new Date(until).toISOString().slice(11, 16)} UTC`;
    const limit = this.cfg().dailyCallLimits[provider] ?? 0;
    if (limit > 0) {
      const day = new Date(this.now());
      day.setUTCHours(0, 0, 0, 0);
      const used = this.callsToday(provider, day.toISOString());
      if (used >= limit) return `reached today's limit of ${limit} calls set in Settings → Generation → pacing`;
    }
    return null;
  }

  /** Waits for this provider's turn so calls are at least minSecondsBetweenCalls apart. */
  async wait(provider: string): Promise<void> {
    const gap = Math.max(0, this.cfg().minSecondsBetweenCalls) * 1000;
    if (!gap) return;
    const now = this.now();
    const at = Math.max(now, this.nextAllowed.get(provider) ?? 0);
    this.nextAllowed.set(provider, at + gap);
    if (at > now) await this.sleep(at - now);
  }

  /** The provider said "slow down": rest it for the cool-down period. */
  rateLimited(provider: string): void {
    const mins = this.cfg().cooldownMinutes;
    if (mins > 0) this.cooledUntil.set(provider, this.now() + mins * 60_000);
  }

  status(): Record<string, string | null> {
    const ids = new Set([...this.cooledUntil.keys(), ...Object.keys(this.cfg().dailyCallLimits)]);
    return Object.fromEntries([...ids].map((id) => [id, this.blocked(id)]));
  }
}
