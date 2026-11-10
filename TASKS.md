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
| F15 | Cost guard prices the dearest reachable provider; paid providers are never an automatic backup unless "allow paid fallback" is on | [x] | `tests/openai-compat.test.ts` |
| F16 | Factory floor: tags (many per product), up to 6 carts building packs, backlog re-sorted at breaks, variety pack, auto-build, remix winners, reuse limit + cooldown; tag editor + AI tag suggestions | [x] | `tests/packing.test.ts`; headless-browser check |
| F17 | Pacing: per-provider spacing, daily call limits, cool-down after rate limits; plans get a stable daily start offset and can be pinned to a computer | [x] | `tests/openai-compat.test.ts`, `tests/operations.test.ts` |
| F18 | Windows 11: Chrome/Edge auto-detect, DPAPI-encrypted key storage, start.bat/start.ps1, docs/WINDOWS.md | [~] | `tests/platform.test.ts` (Mac); **first run on a real Windows laptop not done** |
| F19 | Hub mode: other computers use the app over LAN/Tailscale with an access token (login page, HttpOnly cookie, brute-force brake, local-only token creation) | [~] | `tests/server.test.ts`; **live check from a second computer not done** |
| F20 | More free text providers: Gemini, Mistral, GitHub Models, Hugging Face (in the fallback chain) | [~] | config + key links; **no real key tested** |
| F21 | Satellite: a second computer's finished products sent to the hub automatically | [ ] | planned after F19 is proven live |
| F22 | Readable product folders: `products/<category>/<name>_<date>[-n]` instead of `products/<id>/v<n>`; `npm run tidy-folders` moves old ones after a backup | [x] | `tests/references.test.ts` (new layout, tidy keeps hashes valid, unknown folders left alone); **not yet run on the Mac's real data folder** |
| F23 | Imports: outside images (byte-sniffed, duplicate-checked, key files refused) become coloring products; imported text becomes style examples in AI prompts | [x] | `tests/references.test.ts`; Imports screen driven in headless Chrome with 6 real outside images (5 imported, 1 duplicate skipped), product reached Ready |
| F24 | Asset Foundry arcade, spec milestone 1: cabinet frame, Insert Coin (theme only), Start Gate with zero-credit lock, Title with hi-score banner, Character Select (IDE / AI Chatbot / DAF), Worlds placeholder; keyboard, WASD and controller input; reduced-motion switch. Credits are a test number (Settings → `arcade.testCredits`), labelled TEST | [x] | `tests/arcade.test.ts`; whole flow driven by keyboard in headless Chrome at desktop and phone width, zero-credit lock checked; live provider credits are spec milestone 6 |
| F25 | HAPPY DAFFY milestone 2a: Worlds, milestones and tasks the owner builds in the World Builder; Worlds list filtered to worlds where the character has an open task, sorted by least effort left to the next milestone; World Detail; milestones complete and reopen by themselves | [x] | `tests/worlds.test.ts`; World Builder, Worlds list and World Detail driven in headless Chrome with two worlds, no console errors. AI suggestions (2b) and factory-generated worlds (2c) not built |
| F26 | HAPPY DAFFY character portraits: persona names and bios (GAGE, B.M.O., SPARKS) and a custom-portrait slot (own PNG/JPEG/WebP/GIF up to 3 MB per character, checked by its bytes, pixel art returns when removed) | [x] | `tests/arcade.test.ts`; upload and removal driven in headless Chrome, no console errors |
| F27 | HAPPY DAFFY milestones 2b and 2c: AI world ideas and task ideas to click on, and an AI-written world from a goal plus size, difficulty, product types and character, reviewed before saving. AI-first: no AI provider means a clear message, never the built-in library | [~] | `tests/arcade.test.ts` and driven in headless Chrome, both against a stand-in AI; **no real AI key tested** |
| F28 | Backup models at each AI text provider: `backupModels` per provider, tried in order on the same key before the next provider (`shouldTryNextModel` decides which failures move on). Owner's setup: NVIDIA first with Nemotron 3 Ultra, then MiniMax; Groq a late backup. The retired NVIDIA Llama default replaced | [~] | `tests/openai-compat.test.ts` (retired model falls to backup, a rejected key or rate limit stops at one call, router moves on after all models fail, owner defaults); **no real NVIDIA call yet** |
| F29 | Sample previews on Research & opportunities: the first two pages of the idea's product type, drawn offline from the built-in content with its title, audience and theme, labelled SAMPLE. Made on a button press (one idea, or all ideas in the list without an up-to-date one), kept under `research/previews/`, marked out of date after the title, type, audience or theme changes. Small picture on each list row. Illustrated coloring says why it has no free sample. AI-drawn pictures later | [x] | `tests/opportunity-preview.test.ts` (nothing drawn until asked, two real PNGs, no AI call, reused not redrawn, out of date after a title edit, mandala works offline, illustrated coloring refused with a reason); dialog, list and bulk button driven in the in-app browser against a separate test data folder, no console errors |
| F30 | Mac Dock app: `npm run make-mac-app` builds `dist-mac/Asset Foundry.app` (not Electron): a launcher with Node's full path and the folder written in, so it works from Finder or the Dock without the Terminal's PATH; opens the arcade (`/arcade`) in its own window; a Mac alert (never a silent failure) when Node or the folder is missing or the app doesn't start, pointing at the log. Icon: GAGE from the arcade | [x] | `tests/macApp.test.ts` (plist, launcher paths and quoting, bare-PATH run, alerts, bundle layout, icon sizes); `plutil -lint` and `iconutil` accept the bundle; its launcher run with Finder's PATH started the server on a test port with test data and opened Chrome's app window on `/arcade`. **Double-click from Finder/Dock not done by Claude (sandbox blocks `open`)** |
| F31 | HAPPY DAFFY Hub: Insert Coin, Start Gate, Title, Character Select and Worlds merged into one opening screen (player picker, that player's worlds, stats); ◀ HUB in the cabinet header from anywhere; last player remembered on the computer; at 0 credits ENTER WORLD is locked and says why; Insert Coin is flair only. Spec amended | [x] | Browser check on a throwaway copy (port 4318, TEST data): cold load, pick SPARKS, keyboard ↓↓ Enter into a world, ◀ HUB back, 1P START and Esc, 0-credit lock, reload remembers SPARKS, phone width (fixed the character cards spilling past their box), no console errors |
| F32 | Stats ticker on the Hub: owner picks and orders stats from all 47 the factory can report (EDIT TICKER, saved as `arcade.tickerStats`); NO DATA instead of invented numbers; sales sources never added together; STATS opens Analytics | [x] | `tests/arcade.test.ts` (catalog, chosen order, unknown ids dropped, NO DATA, sources apart); browser: edit, reorder, save, reload |
| F33 | World Builder drafts: AI worlds and tidied notes are stored as drafts (writing / ready / failed) so leaving the page loses nothing; REVIEW, DISCARD; SAVE WORLD removes the draft; a draft cut off by a shutdown is marked failed on restart (migration 008) | [~] | `tests/arcade.test.ts` (draft flow, failed draft, discard, restart); browser with TEST drafts; **not yet run live with the real NVIDIA key** |
| F34 | Smarter AI help: BUILD ON WHAT I HAVE and SHOW ME UNEXPLORED GROUND (facts from real rows only); TIDY MY NOTES with original beside the tidy version, questions kept apart, hand-off to LET THE AI BUILD A WORLD | [~] | `tests/arcade.test.ts` against a stand-in AI; browser: no-key message, tidy review and hand-off with a TEST draft; **no live AI run yet** |
| F35 | Cleanup of old test data: `npm run clean-verification` lists folders inside `verification-output/` that have not changed for 7 days, and `-- --apply` removes them (same pattern as `tidy-folders`). Never removes the folder itself, loose files, links, or anything outside it (never `data/`); skips any folder a running copy of the app is using (live `daf.lock`) and re-checks just before deleting. Runs once a week while the app is open (Settings → Scheduler → `cleanVerificationWeekly`; last run noted in `verification-output/.last-cleanup`) | [x] | `tests/cleanVerification.test.ts` (dry run changes nothing; only old unused folders go; in-use, recent, links, loose files, outside and `data/` stay; a folder that becomes busy mid-run stays; wrong folder name refused; weekly due logic); dry run on the worktree kept the in-use test copy |
| F36 | HAPPY DAFFY milestones 3 to 9 and B.M.O.: Task Workspace (OPEN TASK makes a real asset through the pipeline, linked to its task; approval completes the task), QA Review (factory QA as the checklist, 2-sentence + AI-checked rejections, 5 qualifying = +1 earned credit, DELETE to Bin or permanent, review durations), Bin with restore, Packs and pack pool (finalize, 15-item qualification, bonus TBD), live credits from provider daily limits (TEST fallback, earned credits kept apart), Codex XP (amounts blank until set), Leaderboards, laziness failsafe (off until tuned), B.M.O. advisor that acts only on YES. Migration 015 | [~] | `tests/arcade-play.test.ts` (real pipeline, stand-in AI for reason checks and B.M.O.); **browser check and a live run with the real NVIDIA key not done** |

## Factory upgrades (2026-10-28 plan)

Workstreams A, B and C1 of `docs/plans/2026-10-28-audit-mandala-geometric-ship.md`.

| ID | Task | Status | Evidence |
|---|---|---|---|
| A1 | Mandala motif library: 14 motifs drawn one wedge at a time (`src/engine/generation/mandala/motifs.ts`) | [x] | `tests/mandala.test.ts` A1: each motif is well-formed SVG, stays inside its ring band, mirrored halves never cross the axis, pure |
| A2 | Symmetry engine: one wedge defined once, placed N times at j*360/N with `<use>`, mirrored by reflection (`symmetry.ts`) | [x] | `tests/mandala.test.ts` A2: exact angles for every allowed N, mirrored wedge reflects, every ring of real designs repeats a whole multiple of N evenly |
| A3 | Ring and medallion composer: detail levels 3/5/7/10 rings, sub-rings, 5 centres, 4 borders, even or tapered lines (`compose.ts`); `mandalaSvg(seed, complexity)` kept and delegates | [x] | `tests/mandala.test.ts` A3: deterministic per seed, symmetry from the level's range, inside the box, intricate stays under 60 KB |
| A4 | Mandala product type: `detail`, `symmetry`, `motifSet` settings, old `complexity` read as `detail`, variation axes, provenance `procedural-mandala@2` | [x] | `tests/mandala.test.ts` A4 tests; `tests/restore.test.ts` restored settings; every detail level renders a PDF |
| A5 | Mandala QA: `mandala_viewbox`, `mandala_min_stroke`, `mandala_density` (warning), `mandala_line_art` | [x] | `tests/mandala.test.ts` A5: A5 paper keeps lines at or above 0.2 mm; five bad fixtures each caught; @1 designs counted, not failed. **Limits not yet checked against real prints** |
| A6 | Tests | [x] | `tests/mandala.test.ts` (6 tests) |
| C1 | Test-browser isolation: every Chrome launch gets its own profile folder (`daf-chrome-<pid>-…` in the temp folder), removed on close, on a lost browser and at process exit; a relaunch gets a fresh one | [x] | `tests/renderer-isolation.test.ts` (two renderers get different folders named after the process, closing one removes only its folder, relaunch gets a new one, nothing left after close); README `npm test` row and troubleshooting. Not yet timed with the app running on the Mac |

## Build list (owner, 2026-11-09)

Things to build that aren't in the Factory yet. Each one that teaches a new screen or type also gets a HAPPY DAFFY mission, shown as locked until it ships (`src/engine/arcade/missions.ts`).

| ID | Build | Status | Notes |
|---|---|---|---|
| B1 | Student product types | [ ] | Each is a new product type in the registry. Named so far: assignment trackers, timetables, reading logs. The full list isn't decided. Mission #1 "Student product types" unlocks when they exist and the Product library and Templates missions are cleared. |
