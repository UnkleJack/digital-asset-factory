# Implementation Plan

Three passes: **Pass 1** architecture/docs/scaffold · **Pass 2** full implementation with tests as
each subsystem lands · **Pass 3** run the real app, break it, fix it, verify, report.
The live checklist with status and verification evidence is [`TASKS.md`](../TASKS.md).

## Phase order and dependencies (Pass 2)

| Phase | Deliverable | Depends on | Verification |
|---|---|---|---|
| P1 Foundation | package + tsconfig; `core` (ids, errors, hashing, types); `db` (sqlite wrapper, migration runner w/ backup + checksums, repositories); `config` (settings schema + defaults, keychain secrets); `logging` (JSONL + redaction, audit); `storage` (AssetStore) | — | Unit tests: migrations, path safety, redaction, settings validation, secret API never returns values |
| P2 Templates & rendering | design systems, audiences, themes, categories, templates seeded; fonts; HTML helpers; Chrome renderer with request blocking + layout probe; PDF/PNG output | P1 | Render fixture PDFs; check page count/size with pdf-lib |
| P3 Product types | 15 product-type plugins with params/content schemas, deterministic content libraries, renderers, QA profiles; procedural SVG (mandala, maze); XLSX/CSV | P2 | Each type renders in tests; deterministic seed tests |
| P4 Generation | provider abstraction, Anthropic text provider (SDK + Zod), OpenAI image provider, procedural image provider, deterministic text provider, cost estimation, generation runs | P1, P3 | Mock-server tests: success, invalid JSON, 429, 5xx, timeout, refusal, unconfigured |
| P5 QA | all checks from ACCEPTANCE_CRITERIA §E with fixtures | P2–P4 | Pass/fail fixture per check |
| P6 Packaging, listings, publishing | license/instructions, ZIP, listing images; listing generation + rules; adapters (Etsy/Gumroad/generic export); approval fingerprint; idempotent publication service | P5 | Tests incl. refusal without approval, duplicate prevention |
| P7 Jobs & pipeline | queue (claim, lease, heartbeat, retry/backoff, dedupe, recovery), handlers per stage, product creation service, variations, bundles | P3–P6 | Tests: dedupe, retry, interrupted recovery |
| P8 Research, scoring, scheduler, analytics | observations/opportunities/CSV import, scoring engine, plans + slot/catch-up scheduler with quotas/rotation/budget, metrics, imports, recommendations | P7 | Injected-clock scheduler tests, scoring tests, recommendation tests |
| P9 Server API | Fastify app, host/CSRF guards, routes for every module, asset serving with CSP | P1–P8 | HTTP integration tests |
| P10 Web UI | 13 screens + shared components, empty/loading/error states | P9 | Browser click-through in Pass 3 |
| P11 Desktop & DX | Chrome app-mode launcher, optional Electron shell, README, setup/backup/restore/troubleshooting docs, example config | P9–P10 | Launch test |

## Minimum complete release

Defined in [PRODUCT_SPEC §7](PRODUCT_SPEC.md#7-minimum-complete-release-mcr). Everything in
phases P1–P11 belongs to it; Etsy/Gumroad API adapters are explicitly outside it (BLOCKED on
credentials) and replaced by verified export packages.

## Pass 3 procedure

1. Fresh `npm install`, `npm test`, `npm start`.
2. Full lifecycle through the UI/API with real files (ACCEPTANCE_CRITERIA §A–J), including
   restart persistence.
3. Failure injection: mock AI errors, missing credentials, kill during job, duplicate requests,
   edits after approval, corrupt inputs, path traversal, CSRF/Host checks.
4. Generate samples of every product family; open and visually inspect pages.
5. Fix by severity (critical → high → medium), re-run tests, update docs and statuses.

## Known external dependencies

| Dependency | Needed for | Without it |
|---|---|---|
| Anthropic API key | AI text generation (AI-first path) | Deterministic content libraries (policy configurable) |
| OpenAI API key | `illustrated-coloring` | That product type is unavailable; everything else works |
| Etsy developer app + OAuth | Direct Etsy publishing | Verified export packages + manual status recording |
| Gumroad access token | Direct Gumroad publishing (support unconfirmed) | Same as above |
| Google Chrome | PDF/PNG rendering | Rendering jobs fail with a clear "Chrome not found" error; path configurable |
