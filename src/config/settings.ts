import { z } from 'zod';
import type { Db } from '../db/sqlite.ts';
import { validation } from '../core/errors.ts';

const effort = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);

export const ListingRulesSchema = z.object({
  titleMin: z.number().int().min(1).default(10),
  titleMax: z.number().int().min(10),
  descriptionMin: z.number().int().min(0).default(150),
  descriptionMax: z.number().int().min(100).default(10000),
  tagsMin: z.number().int().min(0).default(0),
  tagsMax: z.number().int().min(0),
  tagMaxLen: z.number().int().min(1),
  imagesMin: z.number().int().min(0),
  imagesMax: z.number().int().min(1),
  filesMax: z.number().int().min(1),
  fileMaxBytes: z.number().int().min(1),
  priceMinCents: z.number().int().min(0),
  unverifiedRules: z.array(z.string()).default([]),
});
export type ListingRules = z.infer<typeof ListingRulesSchema>;

const MB = 1024 * 1024;

const DEFAULT_PRICES: Record<string, number> = {
  'monthly-calendar': 499, 'weekly-planner': 599, 'daily-planner': 499, 'habit-tracker': 349,
  'todo-checklist': 299, 'cleaning-schedule': 349, 'home-inventory': 399, 'budget-planner': 599,
  'invoice-template': 499, 'guided-journal': 599, 'goal-planner': 449, 'mandala-coloring': 399,
  'maze-activity': 349, 'word-search': 349, 'illustrated-coloring': 449, bundle: 1299,
};

const DEFAULT_BLOCKED_TERMS = [
  'disney', 'marvel', 'pixar', 'pokemon', 'pokémon', 'harry potter', 'hogwarts', 'star wars', 'barbie',
  'hello kitty', 'sanrio', 'taylor swift', 'nfl', 'nba', 'mlb', 'nhl', 'nike', 'adidas', 'coca-cola', 'lego',
  'minecraft', 'fortnite', 'roblox', 'peppa pig', 'bluey', 'paw patrol', 'sesame street', 'super mario',
  'nintendo', 'snoopy', 'hello-kitty', 'cricut', 'stanley cup', 'sanrio', 'olympic', 'super bowl',
];

const LICENSE_PERSONAL = `PERSONAL USE LICENSE

Thank you for your purchase from {{shopName}}.

You may: print this product as many times as you like for your own personal, non-commercial use.
You may not: resell, share, redistribute, or claim this product (or any modified version of it) as your own;
sell printed copies; or use it in products for sale.

All designs are copyright {{year}} {{shopName}}. Fonts are licensed under the SIL Open Font License.`;

export const SettingsSchema = z.object({
  general: z.object({
    shopName: z.string().min(1).max(80).default('My Printables Shop'),
    timezone: z.string().default(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
    currency: z.string().length(3).default('USD'),
    // This computer's name when several share the work (production plans can be pinned to one). Empty = the computer's own name.
    machineName: z.string().trim().max(60).default(''),
  }).prefault({}),
  generation: z.object({
    textProvider: z.enum(['anthropic', 'openrouter', 'groq', 'nvidia', 'cerebras', 'together', 'gemini', 'mistral', 'github', 'huggingface', 'deterministic']).default('groq'),
    // Backup providers. Every AI call tries textProvider first, then these in order, moving on
    // when one is rate-limited, down, or has no key — so one capped free tier doesn't stop
    // production. Free-tier providers first; Anthropic last since it's pay-per-use.
    fallbackOrder: z.array(z.enum(['anthropic', 'openrouter', 'groq', 'nvidia', 'cerebras', 'together', 'gemini', 'mistral', 'github', 'huggingface'])).default(['groq', 'gemini', 'openrouter', 'cerebras', 'mistral', 'github', 'huggingface', 'together', 'nvidia', 'anthropic']),
    // Off: a pay-per-use provider (Anthropic) is only used when it is the selected text provider,
    // never as an automatic backup, so a free setup can't start spending when free tiers are capped.
    allowPaidFallback: z.boolean().default(false),
    // Spreads calls out to stay inside free-tier limits. dailyCallLimits: per provider, 0 or absent = no app limit.
    // Defaults sit just under what the free tiers allowed when checked (Groq ~1,000/day per model, OpenRouter free models ~50/day without credit).
    pacing: z.object({
      minSecondsBetweenCalls: z.number().min(0).max(600).default(2),
      dailyCallLimits: z.record(z.string(), z.number().int().min(0).max(1_000_000)).default({ groq: 900, openrouter: 45, gemini: 200, github: 140 }),
      cooldownMinutes: z.number().min(0).max(1440).default(15),
    }).prefault({}),
    imageProvider: z.enum(['openai', 'none']).default('openai'),
    unconfiguredPolicy: z.enum(['deterministic', 'fail']).default('deterministic'),
    invalidOutputRetries: z.number().int().min(0).max(5).default(2),
    anthropic: z.object({
      model: z.string().min(1).default('claude-opus-5-5'),
      effort: effort.default('medium'),
      maxTokens: z.number().int().min(256).max(64000).default(16000),
      timeoutMs: z.number().int().min(5000).max(600000).default(180000),
      maxRetries: z.number().int().min(0).max(6).default(2),
      baseUrl: z.url().default('https://api.anthropic.com'),
      serverFallbacks: z.boolean().default(true),
    }).prefault({}),
    // These five all speak the same OpenAI-compatible /chat/completions API. Each has had a
    // free tier at some point; check the provider's own pricing page, since that can change.
    // The model name is just a setting — swap it for any model the provider serves.
    openrouter: z.object({
      model: z.string().min(1).default('meta-llama/llama-3.3-70b-instruct:free'),
      baseUrl: z.url().default('https://openrouter.ai/api/v1'),
      timeoutMs: z.number().int().min(5000).max(600000).default(180000),
      maxRetries: z.number().int().min(0).max(6).default(2),
    }).prefault({}),
    groq: z.object({
      model: z.string().min(1).default('llama-3.1-70b-versatile'),
      baseUrl: z.url().default('https://api.groq.com/openai/v1'),
      timeoutMs: z.number().int().min(5000).max(600000).default(120000),
      maxRetries: z.number().int().min(0).max(6).default(2),
    }).prefault({}),
    nvidia: z.object({
      model: z.string().min(1).default('meta/llama-3.1-70b-instruct'),
      baseUrl: z.url().default('https://integrate.api.nvidia.com/v1'),
      timeoutMs: z.number().int().min(5000).max(600000).default(180000),
      maxRetries: z.number().int().min(0).max(6).default(2),
    }).prefault({}),
    cerebras: z.object({
      model: z.string().min(1).default('llama-3.3-70b'),
      baseUrl: z.url().default('https://api.cerebras.ai/v1'),
      timeoutMs: z.number().int().min(5000).max(600000).default(120000),
      maxRetries: z.number().int().min(0).max(6).default(2),
    }).prefault({}),
    together: z.object({
      model: z.string().min(1).default('meta-llama/Llama-3.3-70B-Instruct-Turbo-Free'),
      baseUrl: z.url().default('https://api.together.xyz/v1'),
      timeoutMs: z.number().int().min(5000).max(600000).default(180000),
      maxRetries: z.number().int().min(0).max(6).default(2),
    }).prefault({}),
    // Added later; endpoints from each provider's docs, models are editable. Unverified until a real key is tested.
    gemini: z.object({
      model: z.string().min(1).default('gemini-2.5-flash'),
      baseUrl: z.url().default('https://generativelanguage.googleapis.com/v1beta/openai'),
      timeoutMs: z.number().int().min(5000).max(600000).default(180000),
      maxRetries: z.number().int().min(0).max(6).default(2),
    }).prefault({}),
    mistral: z.object({
      model: z.string().min(1).default('mistral-small-latest'),
      baseUrl: z.url().default('https://api.mistral.ai/v1'),
      timeoutMs: z.number().int().min(5000).max(600000).default(180000),
      maxRetries: z.number().int().min(0).max(6).default(2),
    }).prefault({}),
    github: z.object({
      model: z.string().min(1).default('openai/gpt-4.1-mini'),
      baseUrl: z.url().default('https://models.github.ai/inference'),
      timeoutMs: z.number().int().min(5000).max(600000).default(180000),
      maxRetries: z.number().int().min(0).max(6).default(2),
    }).prefault({}),
    huggingface: z.object({
      model: z.string().min(1).default('meta-llama/Llama-3.3-70B-Instruct'),
      baseUrl: z.url().default('https://router.huggingface.co/v1'),
      timeoutMs: z.number().int().min(5000).max(600000).default(180000),
      maxRetries: z.number().int().min(0).max(6).default(2),
    }).prefault({}),
    openai: z.object({
      imageModel: z.string().min(1).default('gpt-image-1'),
      baseUrl: z.url().default('https://api.openai.com/v1'),
      timeoutMs: z.number().int().min(5000).max(600000).default(240000),
      maxRetries: z.number().int().min(0).max(6).default(2),
      quality: z.enum(['low', 'medium', 'high']).default('high'),
    }).prefault({}),
    textPrices: z.record(z.string(), z.object({ inputPerMTok: z.number().min(0), outputPerMTok: z.number().min(0) })).default({
      'claude-opus-5-5': { inputPerMTok: 4, outputPerMTok: 20 },
      'claude-sonnet-5-5': { inputPerMTok: 2, outputPerMTok: 10 },
      'claude-haiku-5-5': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
      'meta-llama/llama-3.3-70b-instruct:free': { inputPerMTok: 0, outputPerMTok: 0 },
      'llama-3.3-70b-versatile': { inputPerMTok: 0, outputPerMTok: 0 },
      'llama-3.3-70b': { inputPerMTok: 0, outputPerMTok: 0 },
      'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': { inputPerMTok: 0, outputPerMTok: 0 },
    }),
    imagePricePerImageUsd: z.record(z.string(), z.number().min(0)).default({}),
  }).prefault({}),
  rendering: z.object({
    // Empty: find Chrome (or Edge) automatically on macOS, Windows or Linux.
    chromePath: z.string().default(''),
    concurrency: z.number().int().min(1).max(6).default(2),
    previewDpi: z.number().int().min(48).max(200).default(150),
    previewPages: z.number().int().min(1).max(20).default(4),
    pageTimeoutMs: z.number().int().min(5000).max(300000).default(90000),
  }).prefault({}),
  qa: z.object({
    nearDuplicateWarn: z.number().min(0).max(1).default(0.8),
    nearDuplicateFail: z.number().min(0).max(1).default(0.97),
    spellingEnabled: z.boolean().default(true),
    spellingAllowlist: z.array(z.string()).default([]),
    minImageDpi: z.number().int().min(72).max(600).default(200),
    lineArtMaxMidtoneRatio: z.number().min(0).max(1).default(0.15),
    marginToleranceMm: z.number().min(0).max(10).default(1),
  }).prefault({}),
  scoring: z.object({
    weights: z.object({
      demand: z.number().min(0).default(0.2),
      competition: z.number().min(0).default(0.15),
      differentiation: z.number().min(0).default(0.15),
      commercial: z.number().min(0).default(0.15),
      productionCost: z.number().min(0).default(0.1),
      bundlePotential: z.number().min(0).default(0.05),
      seasonality: z.number().min(0).default(0.1),
      risk: z.number().min(0).default(0.1),
    }).prefault({}),
    minScore: z.number().min(0).max(100).default(60),
    minConfidence: z.number().min(0).max(1).default(0.35),
  }).prefault({}),
  compliance: z.object({
    blockedTerms: z.array(z.string()).default(DEFAULT_BLOCKED_TERMS),
  }).prefault({}),
  scheduler: z.object({
    enabled: z.boolean().default(true),
    tickSeconds: z.number().int().min(5).max(3600).default(30),
    catchUpWindowHours: z.number().int().min(0).max(24 * 14).default(36),
    jobMaxAttempts: z.number().int().min(1).max(10).default(3),
    retryBaseSeconds: z.number().int().min(1).max(3600).default(15),
    leaseSeconds: z.number().int().min(30).max(3600).default(300),
    concurrency: z.object({
      ai: z.number().int().min(1).max(8).default(2),
      render: z.number().int().min(1).max(6).default(2),
      default: z.number().int().min(1).max(16).default(4),
    }).prefault({}),
  }).prefault({}),
  marketplaces: z.object({
    etsy: z.object({
      enabled: z.boolean().default(true),
      rules: ListingRulesSchema.default({
        titleMin: 10, titleMax: 140, descriptionMin: 150, descriptionMax: 10000, tagsMin: 1, tagsMax: 13, tagMaxLen: 20,
        imagesMin: 1, imagesMax: 10, filesMax: 5, fileMaxBytes: 20 * MB, priceMinCents: 20,
        unverifiedRules: ['imagesMax', 'filesMax', 'fileMaxBytes', 'priceMinCents'],
      }),
    }).prefault({}),
    gumroad: z.object({
      enabled: z.boolean().default(true),
      // Off by default: posting creates real, public products in your Gumroad account.
      autoPublishEnabled: z.boolean().default(false),
      // When on (and autoPublishEnabled is on), approving a batch item posts its Gumroad listing right away.
      autoPublishOnApproval: z.boolean().default(false),
      // Off: products are created as unpublished drafts you switch on yourself in Gumroad.
      publishLive: z.boolean().default(true),
      apiBaseUrl: z.url().default('https://api.gumroad.com/v2'),
      timeoutMs: z.number().int().min(5000).max(600000).default(120000),
      rules: ListingRulesSchema.default({
        titleMin: 5, titleMax: 255, descriptionMin: 150, descriptionMax: 20000, tagsMin: 0, tagsMax: 20, tagMaxLen: 40,
        imagesMin: 1, imagesMax: 10, filesMax: 20, fileMaxBytes: 250 * MB, priceMinCents: 0,
        unverifiedRules: ['titleMax', 'tagsMax', 'tagMaxLen', 'imagesMax', 'filesMax', 'fileMaxBytes', 'priceMinCents'],
      }),
    }).prefault({}),
    generic: z.object({
      enabled: z.boolean().default(true),
      rules: ListingRulesSchema.default({
        titleMin: 5, titleMax: 200, descriptionMin: 50, descriptionMax: 50000, tagsMin: 0, tagsMax: 30, tagMaxLen: 50,
        imagesMin: 0, imagesMax: 30, filesMax: 50, fileMaxBytes: 1024 * MB, priceMinCents: 0, unverifiedRules: [],
      }),
    }).prefault({}),
    defaultPriceCents: z.record(z.string(), z.number().int().min(0)).default(DEFAULT_PRICES),
  }).prefault({}),
  licensing: z.object({
    licenseText: z.string().min(20).default(LICENSE_PERSONAL),
  }).prefault({}),
  analytics: z.object({
    minListingsPerCategory: z.number().int().min(1).default(3),
    minOrdersForSignal: z.number().int().min(1).default(5),
    retireAfterDays: z.number().int().min(7).default(90),
    retireMaxViews: z.number().int().min(0).default(25),
    qaFailureRateAlert: z.number().min(0).max(1).default(0.3),
    rejectionRateAlert: z.number().min(0).max(1).default(0.4),
    // How often recommendations are recomputed and Gumroad sales pulled in (takes effect on restart).
    refreshHours: z.number().int().min(1).max(48).default(6),
  }).prefault({}),
  research: z.object({
    digest: z.object({
      enabled: z.boolean().default(false),
      recipientEmail: z.email().default('daddyritz702@gmail.com'),
      intervalDays: z.number().int().min(1).max(30).default(2),
      // Advanced only after a digest email is confirmed sent, so a crash or the app being off just means the next check catches up.
      lastSentAt: z.string().nullable().default(null),
      platforms: z.array(z.string().min(2).max(40)).max(15).default(['etsy', 'gumroad', 'creative market', 'teachers pay teachers', 'payhip']),
      // What you like and want more of; the idea-vetting pass scores ideas against this.
      tastePreferences: z.string().max(4000).default(''),
      candidateIdeaCount: z.number().int().min(2).max(12).default(8),
      // Web search providers, tried in order; the next one is used when one is out of credit or down.
      // Tavily and Exa have free monthly credit without a card; Brave's free credit needs a card on file.
      searchOrder: z.array(z.enum(['tavily', 'exa', 'brave'])).default(['tavily', 'exa', 'brave']),
      // Hard cap on web searches per calendar month across all providers, to stay inside the free credit.
      monthlySearchBudget: z.number().int().min(10).max(100000).default(900),
      searchesPerPlatform: z.number().int().min(1).max(10).default(3),
    }).prefault({}),
    competitorShops: z.array(z.object({ platform: z.string().min(1).max(40), shopUrl: z.url(), label: z.string().max(80).optional() })).max(30).default([]),
  }).prefault({}),
  packing: z.object({
    // Finished products go to the packer automatically: when they pass QA, or only once you approve them.
    autoFeed: z.boolean().default(true),
    feedOn: z.enum(['qa_passed', 'approved']).default('qa_passed'),
    maxOpenCarts: z.number().int().min(1).max(12).default(6),
    targetSize: z.number().int().min(2).max(20).default(8),
    minSize: z.number().int().min(2).max(20).default(4),
    // How well a product's tags must match a cart's tags (0–1) to join it; the backlog pass uses the relaxed value.
    joinThreshold: z.number().min(0).max(1).default(0.6),
    relaxedThreshold: z.number().min(0).max(1).default(0.35),
    maxCartsPerProduct: z.number().int().min(1).max(6).default(3),
    maxPacksPerProduct: z.number().int().min(1).max(20).default(4),
    maxSameTypePerCart: z.number().int().min(1).max(20).default(3),
    // A product waits this long before going into another pack with mostly the same tags.
    cooldownDays: z.number().int().min(0).max(365).default(30),
    // At a break, carts open longer than this are packed if big enough, or emptied back to the backlog.
    staleHours: z.number().int().min(1).max(24 * 30).default(72),
    // When a cart fills up, build the pack straight away (it still goes through QA and your review).
    autoBuild: z.boolean().default(true),
    marketplaces: z.array(z.enum(['etsy', 'gumroad', 'generic'])).min(1).default(['etsy', 'gumroad']),
  }).prefault({}),
  remote: z.object({
    // Hub mode: other computers on your network (or Tailscale) can open this app with the access token. Restart to apply.
    enabled: z.boolean().default(false),
    bindAddress: z.string().trim().min(2).max(60).default('0.0.0.0'),
  }).prefault({}),
  email: z.object({
    // Gmail's SMTP relay: the Gmail address you send from goes here; its app password is the smtp_password secret.
    smtpUser: z.string().max(200).default(''),
    smtpHost: z.string().min(1).default('smtp.gmail.com'),
    smtpPort: z.number().int().min(1).max(65535).default(465),
    fromName: z.string().min(1).max(80).default('Digital Asset Factory'),
  }).prefault({}),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsKey = keyof Settings;
export const SETTINGS_KEYS = Object.keys(SettingsSchema.shape) as SettingsKey[];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = k in base ? deepMerge(base[k], v) : v;
  return out;
}

export class SettingsService {
  private db: Db;
  private cached: Settings | null = null;

  constructor(db: Db) {
    this.db = db;
  }

  all(): Settings {
    if (this.cached) return this.cached;
    const raw: Record<string, unknown> = {};
    for (const row of this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
      try {
        raw[row.key] = JSON.parse(row.value);
      } catch {
        // A corrupted value falls back to defaults rather than blocking startup.
      }
    }
    const parsed = SettingsSchema.safeParse(raw);
    this.cached = parsed.success ? parsed.data : SettingsSchema.parse({});
    return this.cached;
  }

  get<K extends SettingsKey>(key: K): Settings[K] {
    return this.all()[key];
  }

  update<K extends SettingsKey>(key: K, patch: unknown): Settings[K] {
    if (!SETTINGS_KEYS.includes(key)) throw validation(`Unknown settings section: ${String(key)}`);
    const merged = deepMerge(this.get(key), patch);
    const result = SettingsSchema.shape[key].safeParse(merged);
    if (!result.success) throw validation(`Invalid ${String(key)} settings`, result.error.issues);
    this.db.run(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      key, JSON.stringify(result.data), new Date().toISOString(),
    );
    this.cached = null;
    return result.data as Settings[K];
  }

  reset<K extends SettingsKey>(key: K): Settings[K] {
    this.db.run('DELETE FROM settings WHERE key = ?', key);
    this.cached = null;
    return this.get(key);
  }
}
