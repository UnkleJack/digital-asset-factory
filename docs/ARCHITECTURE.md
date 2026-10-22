# Architecture

## 1. Environment evidence (inspected 2026-10-22)

| Item | Observed | Consequence |
|---|---|---|
| OS / CPU | macOS 27.0.1, arm64 (Apple Silicon), 10 cores, 16 GB RAM | Native arm64 builds; ample headroom for 2 parallel Chrome renders |
| Node | v26.10.0 (npm 11.19.1) | Runs `.ts` files directly (type stripping); ships `node:sqlite` |
| SQLite | `node:sqlite` bundles SQLite 3.53.4 (CLI 3.54.0 also present) | No native DB driver needed |
| Chrome | Google Chrome 155 at `/Applications/Google Chrome.app` | `puppeteer-core` drives it; no Chromium download |
| Keychain | `/usr/bin/security` present | OS keychain storage without native modules |
| Spelling dictionary | `/usr/share/dict/words` (235,976 words) | Offline spelling QA |
| Python 3.13, Xcode, Homebrew, Bun 1.4.2 | Present | Not required at runtime |
| AI credentials | No Anthropic/OpenAI key in environment; `ANTHROPIC_BASE_URL` **is** set by the host shell | Provider client sets `baseURL` explicitly so a stray env var cannot redirect traffic; live AI verification needs a user-supplied key |
| Repository | Empty folder, not a git repo | Nothing to preserve; repo initialised on `main` |

## 2. Technology decisions

| Area | Decision | Reason / tradeoff |
|---|---|---|
| Language | TypeScript everywhere | One language for server, engine, UI, desktop |
| Runtime | Node 26, executed directly from `.ts` (erasable syntax only) | No backend build step. Tradeoff: no `enum`/`namespace`/parameter properties; enforced by `erasableSyntaxOnly` in tsconfig |
| Packaging | **Single npm package** with module folders under `src/` | *Changed from the Pass-1 plan's npm workspaces*: Node refuses to strip types from files under `node_modules`, which is where workspace packages are linked; a single package keeps native TS execution and removes build orchestration. Module boundaries are kept by folder + typed interfaces |
| Database | `node:sqlite` (`DatabaseSync`), WAL mode, versioned SQL migrations, typed repositories | *Changed from better-sqlite3*: identical synchronous model with zero native compilation. Tradeoff: API marked stable-but-young; wrapped in `src/db/sqlite.ts` so it can be swapped |
| HTTP | Fastify 5 + `@fastify/static`, bound to `127.0.0.1` | Mature, schema-friendly, light |
| Frontend | React 19 + Vite + react-router, plain CSS design tokens | Fewer moving parts than Tailwind; same build loads in the desktop window |
| PDF | `puppeteer-core` + system Chrome (HTML/CSS → PDF) | Print-quality typography and layout; `pdf-lib` for validation and merging |
| Previews / listing images | Chrome screenshots (PNG) | Avoids a native image library (sharp) |
| Spreadsheets / archives | `exceljs` (XLSX with formulas), `fflate` (ZIP read/write) | Pure JS; QA can re-open what we produce |
| Fonts | `@fontsource/*` OFL fonts (Inter, Lora, Playfair Display, Nunito, Patrick Hand) | Embedded fonts are licensed for commercial redistribution; system fonts are not assumed to be |
| AI text | `@anthropic-ai/sdk`, structured outputs via Zod; default model `claude-opus-5-5` (configurable) | Official SDK, typed errors, retries; Zod validates every response |
| AI images | OpenAI Images REST provider (`gpt-image-1`, configurable) + local procedural SVG provider | Factory never depends on one image provider |
| Jobs | SQLite-backed queue + in-process worker pool | Durable, inspectable, no Redis |
| Scheduler | In-process tick (30 s) with slot-based dedupe and catch-up policy | Needs custom catch-up semantics that cron libraries don't provide |
| Secrets | macOS Keychain via `security` CLI; env-var fallback (`DAF_SECRET_<NAME>`) on other OSes | *Changed from keytar* (archived, native). Values never stored in SQLite, logs or exports |
| Desktop | Chrome app-mode launcher (`npm run app`) + optional Electron shell in `desktop/` (separate install) | Electron adds ~100 MB; kept optional. Electron spawns the same server with system Node |
| Tests | `node --test` (built-in runner) | No test framework dependency |

## 3. Process topology

```
┌──────────── one Node process (npm start) ─────────────────────────────┐
│  Fastify HTTP (127.0.0.1:4317)  ── serves web/dist + /api             │
│      │                                                                 │
│  Services (src/engine/*, src/db/repos)  ◄── typed calls ──┐            │
│      │                                                     │           │
│  Job worker pool (src/jobs)  ── claims jobs from SQLite ───┘           │
│  Scheduler tick (src/scheduler) ── creates plan runs + jobs            │
│  Renderer (puppeteer-core) ── launches system Chrome on demand         │
└───────────────────────────────────────────────────────────────────────┘
   data/daf.sqlite   data/assets/**   data/logs/*.jsonl   data/backups/**
   macOS Keychain (service "digital-asset-factory")
```

Browser UI and the desktop window are thin clients over the same `/api`.

## 4. Source layout

```
src/core          domain types, errors, ids, hashing, evidence kinds, product-type contract
src/db            sqlite wrapper, migrations/*.sql, migration runner, repositories
src/storage       asset store (path-safe filesystem access + metadata)
src/config        settings (typed defaults + validation), secrets (keychain)
src/logging       structured logger with secret redaction, audit events
src/engine/*      the production modules (see §6)
src/jobs          queue, worker, job handlers, pipeline orchestration
src/scheduler     production plans, slot computation, catch-up
src/server        Fastify app, security middleware, routes/*
web/              React UI
desktop/          optional Electron shell
scripts/          backup, restore, migrate, launcher
tests/            node:test suites (unit + integration + mock AI server)
```

## 5. Core contracts

### Product type plugin

```ts
interface ProductTypeDefinition<P, C> {
  id: string; name: string; family: 'printable' | 'activity' | 'structured' | 'bundle';
  category: string;
  paramsSchema: ZodType<P>;          // validated product specification parameters
  contentSchema: ZodType<C>;         // validated generated content
  stages: Stage[];                   // which pipeline stages apply
  buildContentPrompt?(spec): PromptSpec;            // AI path
  generateDeterministicContent(spec, rng): C;       // local path
  generateArtwork?(spec, content, ctx): Promise<ArtworkAsset[]>;
  render(spec, content, design, ctx): Promise<RenderOutput>;  // pages + extra files
  qaProfile: QaProfile;              // checks + thresholds + content-consistency validator
  listingHints(spec, content): ListingHints;
}
```

### Provider contracts

```ts
interface TextProvider { id; isConfigured(): Promise<boolean>;
  generateStructured<T>(req: { schema: ZodType<T>; system; prompt; maxTokens; purpose }): Promise<{ data: T; usage: Usage; model: string }>; }
interface ImageProvider { id; isConfigured(): Promise<boolean>;
  generateImage(req: { prompt; size; style }): Promise<{ png: Buffer; usage: Usage; model: string }>; }
```

Errors are normalised to `ProviderError { kind: 'unconfigured' | 'auth' | 'rate_limit' | 'timeout' | 'invalid_output' | 'refusal' | 'server' | 'bad_request', retryable }`.

### Marketplace adapter

```ts
interface MarketplaceAdapter {
  id; displayName; rules: ListingRules;
  verification: 'verified' | 'unverified' | 'not_implemented';
  capabilities: { manualExport: true; connect; createDraft; uploadFiles; publish; update; reconcile };
  buildExport(input): Promise<ExportPackage>;            // always available
  publish?/update?/reconcile?                             // only when implemented + verified
}
```

## 6. Module specifications

Each module: **purpose · data contract · failure behavior · test strategy**.

| # | Module (code) | Purpose | Data contract | Failure behavior | Test strategy |
|---|---|---|---|---|---|
| 1 | Dashboard & status (`server/routes/dashboard`, `web/pages/Dashboard`) | Live production overview | `GET /api/dashboard` → counts by stage, active jobs, batches awaiting review, provider status, recent failures, next scheduled run | Each panel degrades independently; errors shown inline | Integration test asserts counts reflect DB rows |
| 2 | Market research (`engine/research`) | Record observations, keywords, opportunities; CSV import; AI idea suggestions | `research_observations`, `keywords`, `opportunities`; every value has `evidence_kind` | CSV rows with errors reported per row, valid rows kept; AI suggestions stored as `model_hypothesis` only | Unit tests for CSV parsing/validation; evidence-kind enforcement |
| 3 | Opportunity scoring (`engine/scoring`) | Transparent weighted score + confidence | `opportunity_scores` (score, confidence, factor breakdown JSON, weights snapshot, thresholds snapshot) | Missing data → factor `unknown`, excluded and lowers confidence; never invented | Unit tests on weighting, unknown handling, threshold outcomes |
| 4 | Specification (`engine/specification`) | Turn an opportunity (or manual request) into a validated product spec | `product_specs` (type, params JSON validated by plugin schema, design system, audience, theme, paper) | Schema violations rejected with field errors | Unit tests per product type schema |
| 5 | Template library (`engine/templates`) | Design systems, layouts, palettes, typography, audiences, themes, presets | `design_systems`, `templates`, `audiences`, `themes`, `categories` (seeded, editable) | Invalid design tokens rejected; referenced templates cannot be deleted | Unit tests on token validation |
| 6 | Content & artwork generation (`engine/generation`) | Produce content/artwork via providers or deterministic path | Content JSON validated by plugin `contentSchema`; `generation_runs` with provider, model, prompt hash, settings, usage, cost | Invalid model output → retried (bounded) then permanent failure; unconfigured provider → per policy; cost cap → skip | Tests against mock Anthropic/OpenAI HTTP servers: success, invalid JSON, 429, 500, timeout, refusal |
| 7 | Rendering (`engine/rendering`) | HTML/SVG → PDF, PNG previews, listing images | `assets` rows (kind, path, sha256, size, page count, dims) + render diagnostics (overflow, fonts, console errors) | Chrome launch/render failure → transient retry; network requests other than local assets blocked | Integration tests render each type and inspect PDF page count/size |
| 8 | Quality assurance (`engine/qa`) | Automated checks, hard vs. warning | `qa_runs`, `qa_results` (check code, severity, passed, details) | Any failed `hard` check → version `qa_failed`; blocks approval and publication | Unit tests per check with good/bad fixtures |
| 9 | Asset & product library (`db`, `storage`, `server/routes/products`) | Product identity, versions, assets, history | `products`, `product_versions`, `assets`, `product_relationships` | Path traversal rejected; missing files surfaced by QA `files_exist` | Tests for path safety and version history |
| 10 | Bundles & variations (`engine/bundling`) | Compose bundles; generate real variations (design/audience/theme/paper/date axes) | `bundles`, `bundle_items`, `product_relationships(kind=variation_of)` | Bundle with non-passing member → `bundle_complete` QA hard fail | Tests on variation axes differing; bundle completeness |
| 11 | Listing generation (`engine/listing`) | Marketplace-specific listing drafts | `listings` (marketplace, title, description, tags, price, images, files, `listing_hash`) | Validated against `ListingRules`; violations block approval | Unit tests on rule validation |
| 12 | Batch approval (`server/routes/batches`) | Human review of batches | `approval_batches`, `approval_items`, `approval_decisions` (version id, listing id, marketplace, fingerprint) | Approve rejected if QA failed or fingerprint changed | Integration tests: approve, reject, revise, edit-invalidates |
| 13 | Publishing (`engine/publishing`) | Export packages, publish/update/record status, reconciliation | `publication_attempts`, `external_listings` | Publishing without matching approval → `ApprovalRequired`; unknown outcome → `needs_reconciliation`, no blind retry | Tests with a test-only fake adapter for idempotency; export package contents |
| 14 | Calendar & scheduler (`scheduler`) | Daily production plans | `production_plans`, `plan_runs` (unique plan+slot) | Missed slots: latest one runs on startup, older recorded `missed`; budget overrun → remaining items skipped | Tests with injected clock for slots, catch-up, dedupe |
| 15 | Analytics & feedback (`engine/analytics`) | Metrics, imports, recommendations | `performance_observations` (source kind), `recommendations` | Imports validated; recommendations require minimum sample sizes and are never auto-applied | Unit tests on recommendation rules and source separation |
| 16 | Config, security, logs, recovery (`config`, `logging`, `scripts`) | Settings, secrets, logs, audit, backup/restore, startup recovery | `settings`, `audit_events`, JSONL logs, backup folders | Integrity check on start; migration runs in a transaction after an automatic backup | Tests: redaction, secret never in API responses, backup/restore round-trip |

## 7. Pipeline and jobs

- A **product version** moves through stages declared by its product type. Each stage is a job
  (`generate_content`, `generate_artwork`, `render`, `qa`, `package`, `prepare_listings`); on
  success the handler enqueues the next stage. Each job has a `dedupe_key`
  (`<stage>:<versionId>`) with a partial unique index over active jobs, so restarts and
  double-clicks cannot create duplicate work.
- Workers claim jobs atomically (`UPDATE … RETURNING`), heartbeat while running, and record
  every attempt in `job_attempts` with outcome, error class, duration and cost.
- On startup, `running` jobs whose heartbeat is older than the lease are marked `interrupted`
  and re-queued (counts as an attempt).
- Retry policy: transient errors use exponential backoff (base 15 s, ×4, max 3 attempts by
  default); permanent errors fail immediately.
- Concurrency: configurable per job type (render default 2, AI default 2, others 4).

## 8. Asset store

`data/assets/products/<productId>/v<version>/…` plus `data/assets/exports/…`. Files are written
only through `AssetStore`, which (a) builds paths from IDs and sanitised slugs, (b) rejects
absolute paths and `..`, (c) verifies the resolved real path stays inside the root, and (d)
records sha256, size and MIME in the `assets` table. The API serves files **by asset id**, never
by a client-supplied path.

## 9. Rendering pipeline

1. Plugin returns page HTML fragments built with escaped text helpers and design-system CSS.
2. Renderer writes a temporary HTML document referencing local font files and asset images.
3. Chrome loads it with **request interception**: only `file://` URLs inside the font and asset
   roots are allowed; every other request is aborted and recorded as a render error.
4. Before printing, an in-page probe reports overflowing elements, elements outside the safe
   margin box, and fonts that failed to load.
5. `page.pdf()` with the spec's paper size, orientation and zero CSS margins (margins come from
   the design system); previews via `page.screenshot()` per page at 150 DPI.

### Practical limitations (documented, not hidden)

- Chrome PDF output is RGB; CMYK/ICC print profiles are not supported. A grayscale "ink saver"
  option converts the palette instead.
- AI image quality varies; illustrated coloring pages rely on QA line-art heuristics plus human
  review.
- Scheduled jobs cannot run while the app (or the computer) is asleep or off; overdue runs are
  resumed on next start under the catch-up policy.
- Marketplace APIs require approved developer apps and OAuth; until verified, publishing is via
  export packages.
- Gumroad's public API product-creation support could not be confirmed from Gumroad's own
  documentation during inspection; it must be verified with real credentials before an adapter
  claims it.

## 10. Configuration

`settings` table holds JSON values validated by a schema with typed defaults (`src/config`).
Categories: general, paths, generation (providers, models, policy, cost prices), rendering,
QA thresholds, scoring weights/thresholds, scheduler, marketplaces (rules, pricing defaults,
license text), analytics thresholds. Secrets are not settings; see SECURITY_AND_PUBLISHING.md.
