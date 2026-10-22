# Task Checklist

Status: `[ ]` todo · `[~]` in progress · `[x]` done and verified (evidence noted) · `[!]` blocked.
"Done" requires the listed verification to have actually been executed.

| ID | Task | Depends on | Status | Verification required / evidence |
|---|---|---|---|---|
| T0.1 | Inspect environment, record evidence | — | [x] | ARCHITECTURE §1 (commands run 2026-10-22) |
| T0.2 | Probe `node:sqlite` + TS stripping | T0.1 | [x] | Probe script printed row + SQLite 3.53.4 |
| T0.3 | Six docs + checklist | T0.1 | [x] | docs/*.md present |
| T0.4 | Initial schema | T0.3 | [x] | `sqlite3 :memory: < 001_initial.sql` OK, 34 tables |
| T1.1 | package.json, tsconfig, scripts, .gitignore | T0 | [x] | `npm install`, `npm run typecheck` — npm install + typecheck clean; fresh-copy install (AC-A1) |
| T1.2 | core: ids, errors, hashing, evidence types | T1.1 | [x] | unit tests — foundation tests |
| T1.3 | db: wrapper, migration runner (backup+checksum), repos | T1.2 | [x] | migration tests — migration + savepoint tests |
| T1.4 | config: settings schema/defaults; keychain secrets | T1.3 | [~] | tests; secret never returned — settings + memory/env secret tests; Keychain store not exercised live |
| T1.5 | logging + redaction + audit | T1.3 | [x] | redaction test — redaction test; canary search |
| T1.6 | AssetStore with path safety | T1.3 | [x] | traversal tests — traversal/symlink tests; live traversal requests 403/404 |
| T2.1 | Seed design systems, audiences, themes, categories, templates | T1 | [x] | seed test — seeded 54 rows on fresh install |
| T2.2 | Fonts + HTML/CSS helpers (escaping) | T1 | [x] | escaping test — markup-escaping test |
| T2.3 | Chrome renderer: request blocking, layout probe, PDF, PNG | T2.2 | [x] | render test, pdf-lib page size — render tests; offline + CSP; probe |
| T3.1 | Product-type plugin registry | T2 | [x] | registry test — registry used by all tests |
| T3.2 | Date-based printables (calendar, weekly, daily) | T3.1 | [x] | render + date consistency tests — render + month-grid tests; samples |
| T3.3 | List/tracker printables (habit, todo, cleaning, inventory, journal, goal) | T3.1 | [x] | render tests — render tests; samples |
| T3.4 | Structured (budget, invoice) incl. XLSX formulas + CSV | T3.1 | [x] | reopen XLSX, formula values — XLSX formula + CSV round-trip test |
| T3.5 | Activity (mandala, maze, word search) procedural | T3.1 | [x] | determinism + validity tests — determinism/validity tests |
| T3.6 | Illustrated coloring (image provider) | T4 | [~] | mock provider test — mock image provider test only; live BLOCKED (no key) |
| T4.1 | Provider abstraction + error normalisation | T1 | [x] | unit tests — provider tests |
| T4.2 | Anthropic text provider (SDK, Zod, retries, usage, cost) | T4.1 | [~] | mock server tests; live = BLOCKED w/o key — mock server tests pass; live call BLOCKED (no key) |
| T4.3 | OpenAI image + procedural image providers | T4.1 | [x] | mock server tests — mock server tests |
| T4.4 | Deterministic content libraries | T3 | [x] | content schema validation — all types produced with no provider |
| T5.1 | QA checks + fixtures | T2–T4 | [~] | pass/fail fixture per check — checks run on real output; fixtures for most checks, not all (AC-E2) |
| T6.1 | Packaging: license, instructions, ZIP, listing images | T5 | [x] | ZIP reopened — ZIPs reopened in tests; export inspected |
| T6.2 | Listing generation + rules validation | T6.1 | [x] | rule tests — listing limit tests |
| T6.3 | Publishing: adapters, export packages, approval fingerprint, idempotency | T6.2 | [x] | refusal + dedupe tests — refusal, fingerprint, idempotency tests + live run |
| T7.1 | Job queue (claim/lease/retry/dedupe/recovery) | T1 | [x] | queue tests — queue tests; live kill -9 recovery |
| T7.2 | Pipeline handlers + product creation, versions, variations, bundles | T7.1, T6 | [x] | end-to-end pipeline test — lifecycle tests; samples |
| T8.1 | Research + CSV import + opportunities | T1 | [x] | import tests — CSV import test |
| T8.2 | Scoring engine | T8.1 | [x] | scoring tests — scoring test + live 3-case run |
| T8.3 | Scheduler (slots, catch-up, quotas, rotation, budget) | T7, T8.2 | [x] | injected clock tests — injected-clock + DST tests; live plan run |
| T8.4 | Analytics + imports + recommendations | T6, T7 | [x] | recommendation tests — analytics test |
| T9.1 | Fastify app, security guards, all routes | T1–T8 | [x] | HTTP tests — server tests; live security audit |
| T10.1 | Web UI: 13 screens | T9 | [~] | browser click-through — all 13 screens load real data; some forms not clicked (see report) |
| T11.1 | Launcher + optional Electron | T10 | [~] | launch test — launcher done; Electron shell not built |
| T11.2 | README, setup, backup/restore, troubleshooting, example config | T10 | [x] | follow docs on fresh clone — README + .env.example; followed on a fresh copy |
| T12.1 | Pass 3: lifecycle, failure injection, security audit, sample inspection | all | [x] | acceptance report — docs/ACCEPTANCE_REPORT.md |

## Session 2026-10-22 (follow-ups)

| ID | Task | Status | Evidence |
|---|---|---|---|
| F1 | Review multi-provider AI text code; retry without `response_format` when a model rejects JSON mode | [x] | `tests/openai-compat.test.ts` (JSON-mode fallback test) |
| F2 | "Get a free key" / "Get a key (paid)" links next to each AI key (Settings → AI providers) | [x] | `/api/secrets` returns `keyUrl`; screenshot checked |
| F3 | AI price table moved under "Advanced: AI price table" with a one-line explanation | [x] | screenshot checked |
| F4 | New Product: category → kind picker, font pairing / custom fonts, bulk variations at creation | [x] | operations test (fonts + seed/font variations render and pass QA); UI driven in headless Chrome, 3 products created and passed QA |
| F5 | 9 more bundled fonts (OFL/Apache), 10 font pairings, `GET /api/fonts` | [x] | font-file existence test |
| F6 | "New design system" button and name/description editing in Templates → Design systems | [x] | screenshot checked |
| F7 | Portable/offline package | [ ] | options presented, not built |
| F8 | AI fallback chain: every AI call tries the chosen provider, then backups in `generation.fallbackOrder`; provenance records who answered | [x] | `tests/openai-compat.test.ts` fallback test |
| F9 | Real Gumroad posting (presign upload → create → enable) + sales pull, opt-in, auto-post on approval | [~] | `tests/gumroad.test.ts` against Gumroad-shaped local server; **live run with a real token not done** — adapter stays `unverified` |
| F10 | Pack builder: visual grid picker, theme, AI title/description suggestions, pitch flows into listings | [x] | headless-browser check; typecheck |
| F11 | Research digest: Tavily→Exa→Brave search with monthly cap, per-platform + competitor research, numbers checked against cited snippets, 3-pass idea vetting, Gmail SMTP email, restart-safe 2-day schedule | [~] | `tests/digest.test.ts`; **live run with real search keys + Gmail not done** |
| F12 | Settings → Integrations tab, Digest page, "Forge" visual theme, nav icons + hints | [x] | headless-browser screenshots |
| F13 | docs/GETTING_STARTED.md beginner walkthrough + marketplace roadmap | [x] | — |
| F14 | Learning loop (approve/reject reasons shape future generation) | [ ] | reasons already feed the digest idea passes; generation itself not yet |
