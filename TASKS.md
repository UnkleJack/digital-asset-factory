# Task Checklist

Status: `[ ]` todo · `[~]` in progress · `[x]` done and verified (evidence noted) · `[!]` blocked.
"Done" requires the listed verification to have actually been executed.

| ID | Task | Depends on | Status | Verification required / evidence |
|---|---|---|---|---|
| T0.1 | Inspect environment, record evidence | — | [x] | ARCHITECTURE §1 (commands run 2026-10-22) |
| T0.2 | Probe `node:sqlite` + TS stripping | T0.1 | [x] | Probe script printed row + SQLite 3.53.4 |
| T0.3 | Six docs + checklist | T0.1 | [x] | docs/*.md present |
| T0.4 | Initial schema | T0.3 | [x] | `sqlite3 :memory: < 001_initial.sql` OK, 34 tables |
| T1.1 | package.json, tsconfig, scripts, .gitignore | T0 | [ ] | `npm install`, `npm run typecheck` |
| T1.2 | core: ids, errors, hashing, evidence types | T1.1 | [ ] | unit tests |
| T1.3 | db: wrapper, migration runner (backup+checksum), repos | T1.2 | [ ] | migration tests |
| T1.4 | config: settings schema/defaults; keychain secrets | T1.3 | [ ] | tests; secret never returned |
| T1.5 | logging + redaction + audit | T1.3 | [ ] | redaction test |
| T1.6 | AssetStore with path safety | T1.3 | [ ] | traversal tests |
| T2.1 | Seed design systems, audiences, themes, categories, templates | T1 | [ ] | seed test |
| T2.2 | Fonts + HTML/CSS helpers (escaping) | T1 | [ ] | escaping test |
| T2.3 | Chrome renderer: request blocking, layout probe, PDF, PNG | T2.2 | [ ] | render test, pdf-lib page size |
| T3.1 | Product-type plugin registry | T2 | [ ] | registry test |
| T3.2 | Date-based printables (calendar, weekly, daily) | T3.1 | [ ] | render + date consistency tests |
| T3.3 | List/tracker printables (habit, todo, cleaning, inventory, journal, goal) | T3.1 | [ ] | render tests |
| T3.4 | Structured (budget, invoice) incl. XLSX formulas + CSV | T3.1 | [ ] | reopen XLSX, formula values |
| T3.5 | Activity (mandala, maze, word search) procedural | T3.1 | [ ] | determinism + validity tests |
| T3.6 | Illustrated coloring (image provider) | T4 | [ ] | mock provider test |
| T4.1 | Provider abstraction + error normalisation | T1 | [ ] | unit tests |
| T4.2 | Anthropic text provider (SDK, Zod, retries, usage, cost) | T4.1 | [ ] | mock server tests; live = BLOCKED w/o key |
| T4.3 | OpenAI image + procedural image providers | T4.1 | [ ] | mock server tests |
| T4.4 | Deterministic content libraries | T3 | [ ] | content schema validation |
| T5.1 | QA checks + fixtures | T2–T4 | [ ] | pass/fail fixture per check |
| T6.1 | Packaging: license, instructions, ZIP, listing images | T5 | [ ] | ZIP reopened |
| T6.2 | Listing generation + rules validation | T6.1 | [ ] | rule tests |
| T6.3 | Publishing: adapters, export packages, approval fingerprint, idempotency | T6.2 | [ ] | refusal + dedupe tests |
| T7.1 | Job queue (claim/lease/retry/dedupe/recovery) | T1 | [ ] | queue tests |
| T7.2 | Pipeline handlers + product creation, versions, variations, bundles | T7.1, T6 | [ ] | end-to-end pipeline test |
| T8.1 | Research + CSV import + opportunities | T1 | [ ] | import tests |
| T8.2 | Scoring engine | T8.1 | [ ] | scoring tests |
| T8.3 | Scheduler (slots, catch-up, quotas, rotation, budget) | T7, T8.2 | [ ] | injected clock tests |
| T8.4 | Analytics + imports + recommendations | T6, T7 | [ ] | recommendation tests |
| T9.1 | Fastify app, security guards, all routes | T1–T8 | [ ] | HTTP tests |
| T10.1 | Web UI: 13 screens | T9 | [ ] | browser click-through |
| T11.1 | Launcher + optional Electron | T10 | [ ] | launch test |
| T11.2 | README, setup, backup/restore, troubleshooting, example config | T10 | [ ] | follow docs on fresh clone |
| T12.1 | Pass 3: lifecycle, failure injection, security audit, sample inspection | all | [ ] | acceptance report |
