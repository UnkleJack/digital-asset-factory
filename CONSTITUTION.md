# Constitution of Asset Foundry

This is the canonical record of what Asset Foundry is, where it lives, the rules it runs by, and where it stands. Where any other file, plan, note or chat disagrees with it, this file wins.

**Amending it.** Only the owner (O'Jayme, GitHub `UnkleJack`) changes Articles 1 to 6. Each change is dated in the Amendment log at the bottom. Articles 7 to 9 describe the current state. Whoever merges a change that makes them untrue updates them in the same pull request.

---

## Article 1: Names

Adopted 2026-11-03.

1. **Asset Foundry** is the canonical name of the whole program suite. Short form: **Foundry**.
2. **The factory** is the production engine inside the suite. That covers making, checking, packing and publishing assets. Its full name is **Digital Asset Factory**, short form **DAF**. People say "Foundry" and "factory" interchangeably; in code and docs the suite is Asset Foundry and the engine is the factory.
3. **HAPPY DAFFY** is the name of the arcade game, the cabinet at `/arcade`. It is always written in capitals.
4. **The names live in one file:** `src/core/brand.ts` (`SUITE_NAME`, `SUITE_SHORT_NAME`, `ENGINE_NAME`, `ENGINE_SHORT_NAME`, `ARCADE_GAME_NAME`). Code that shows a name to a person imports it from there. The only places the name is typed out by hand are files that cannot import code: `web/index.html`, the start scripts and the docs. `tests/brand.test.ts` checks the names.
5. **Internal identifiers keep the old spelling, and nobody renames them:**
   - the npm package name `digital-asset-factory`
   - the macOS Keychain service `digital-asset-factory`, which holds the saved API keys
   - the `data/` folder
   - any database migration that has already been applied
   - the GitHub repository `UnkleJack/digital-asset-factory`

   Renaming any of them would lose saved keys, orphan the data, or stop the app from starting.

## Article 2: One source of truth

Adopted 2026-11-03.

1. **GitHub `main` is the master copy of the code.** If it isn't on `main`, it isn't part of Asset Foundry yet.
2. **The Mac folder is the one working copy:** `/Users/jadeddragon/Projects/digital-asset-factory`. It runs the app and gets code only by `git pull` from `main`. It is also the only home of `data/`, which holds the database, product files, backups and secrets. `data/` is never committed to git.
3. **Changes flow one way:** a branch, then a pull request, then a merge to `main`, then `git pull` on the Mac. A branch is temporary. Once its pull request is merged or closed, the branch is deleted.
4. **These are not working copies, and nothing is pulled from them:**
   - `/mnt/project-files/digital-asset-factory/` in the Claude project. It is a snapshot from 2026-11-01 with old docs and about 73 MB of product folders. It is kept only as a partial off-Mac copy of those files until `data/` has a real backup.
   - Claude cloud sessions. They are temporary and get thrown away.
   - `UnkleJack/foundry-sandbox-66f765` and `UnkleJack/foundry-sandbox-d15b61`. These are Azure AI Foundry starter repos and are not part of this project. The owner has said they can be deleted.
   - The archive tags on GitHub (`archive/pass-2-3-implementation`, `archive/recover-stashed-build`). These are history, not something to build on.
5. **Pull after every merge.** After a merge, the Mac runs `git pull`, then `npm ci`, then `./start.sh`.

## Article 3: What the suite is made of

Adopted 2026-11-03.

Asset Foundry has three layers.

| Layer | What it is | Where |
| --- | --- | --- |
| **The factory** (engine) | Makes products, runs QA, packages them, writes listings, handles approvals, publishing, scheduling, research, analytics and imports | `src/` |
| **The back office** | The 17 working screens: Dashboard, Production calendar, Research digest, Research & opportunities, Product library, Imports, Factory floor, Templates, Production jobs, QA results, Batch approval, Marketplace listings, Publishing status, Analytics, Settings, plus Product detail and Batch review | `web/src/pages/` |
| **HAPPY DAFFY** (arcade) | A game-style front end over the same engine. It is for making things, asking AI for advice, and learning every part of the suite by playing it | `web/src/arcade/`, `src/engine/arcade/` |

The arcade sits **beside** the back office and does not replace it. Each links to the other. The design source for the arcade is `docs/ASSET_FOUNDRY_UX_SPEC.md`, the owner's UX spec dated 2026-11-03.

**Characters**, as the owner defined them on 2026-11-03. Picking a character limits which projects you can see.

| Character | Scope |
| --- | --- |
| **IDE** | Coding projects, code-built assets and tool-building tasks |
| **AI CHATBOT** | A chat built into the suite for running ideas past it and getting advice, direction and suggestions. The owner wants it to eventually answer anything about how the business and the software are doing, like a secretary or office manager with specialist staff under it |
| **DAF** | The production floor, where the work gets done and the assets get made |

## Article 4: The product line

Adopted 2026-11-03.

1. **The factory must keep making everything it already makes.** New features must not break or drop a product type.
2. These are the product types registered today (`src/engine/producttypes/`):
   - **Activity:** mandala-coloring, maze-activity, word-search, illustrated-coloring
   - **Dated:** monthly-calendar, weekly-planner, daily-planner
   - **Lists and trackers:** habit-tracker, todo-checklist, cleaning-schedule, home-inventory, guided-journal, goal-planner
   - **Structured:** budget-planner, invoice-template
   - **Other:** imported-coloring (images made in other tools), bundle (packs)
3. **New kinds of asset are added as modules** through the product-type registry. That includes the planned geometric pattern art, the 8-bit and 16-bit sprites, and a Unity pipeline. Nothing gets hardwired to mandalas or to any one type.
4. **Locked decisions from 2026-10-28** (see `docs/plans/2026-10-28-audit-mandala-geometric-ship.md`):
   - **D1.** Geometric pattern art serves both coloring line art and decor or wall-art prints, through a `mode` parameter.
   - **D2.** It is one product type, `geometric-pattern-art`, with a `family` parameter.
   - **D3.** "Shipped" means self-use plus a portable package. An Electron app is out of scope.

## Article 5: Standing rules

Adopted 2026-11-03. Each rule records something the owner decided or something that went wrong before.

1. **A person approves before anything is published.** QA failures block approval, and any material edit cancels an existing approval.
2. **Nothing is invented.** Where a value is unknown or marked TBD in the spec (XP amounts, stat formulas, thresholds, scores), it shows as blank or "unavailable" and is never filled in with made-up numbers. Test data is always labelled as test data.
3. **Ambiguities go to the owner before work starts.** Anything unclear, missing or contradictory gets raised first, never guessed at.
4. **Node 26** is required (`.nvmrc`).
5. **Never run `npm audit fix` or `npm audit fix --force`.** On 2026-11-01 it downgraded `@fastify/static` to an incompatible, vulnerable version. The remaining glob/minimatch warnings have no non-breaking fix and are left alone.
6. **Never renumber or edit a migration that has already been applied.** Add a new number instead. A renumber on 2026-10-29 stopped the app from starting.
7. **Back up before touching data.** `npm run backup` comes before moving, renaming or restoring anything in `data/`. The `tidy-folders` and `restore-products` commands are dry runs unless given `--apply`, and `--apply` backs up first.
8. **Secrets stay out of git and out of imports.** API keys live in the Keychain, or in DPAPI on Windows. A Google OAuth `client_secret` file is never imported.
9. **Arcade rules locked by the spec:**
   - The arcade is always dark.
   - Insert Coin is only a theme button and never changes credits.
   - Credits N are the bottleneck provider's real remaining headroom. Until that is built, the meter shows a test number labelled TEST.
   - Start locks when N = 0.
   - A rejection needs a specific reason of at least two sentences.
   - Delete is never counted as a rejection and never earns credits.
   - The laziness failsafe adds friction but never changes an asset and never scolds.
10. **Asset folders are named after what they are:** `products/<category>/<name>_<date>`, with no `prd_` ids and no `v1` folders.

## Article 6: How work gets done

Adopted 2026-11-03.

1. Every change goes in on a pull request and runs `npm run typecheck` and `npm test` before merging. UI changes are checked in a real browser.
2. Merging to `main` needs the owner's go-ahead.
3. When a pull request changes what Article 8 or 9 says, it updates them in the same pull request.

---

## Article 7: Where things are

| What | Where |
| --- | --- |
| Names | `src/core/brand.ts` |
| Server entry point | `src/main.ts` (Fastify on `127.0.0.1:4317`) |
| Product types | `src/engine/producttypes/` (registry: `registry.ts`) |
| Mandala and other procedural art | `src/engine/generation/procedural.ts` |
| AI providers (10 text, 8 image) and pacing | `src/engine/generation/providers.ts`, `pacing.ts` |
| QA, packaging, listings, approval, publishing | `src/engine/qa/`, `packaging/`, `listing/`, `approval/`, `publishing/` |
| Packs ("factory floor") | `src/engine/packing/` |
| Opportunity sample previews | `src/engine/research/preview.ts` (stored under `research/previews/` in the asset folder) |
| Arcade engine and API | `src/engine/arcade/service.ts`, `src/server/routes/arcade.ts` (`GET /api/arcade`) |
| Arcade screens | `web/src/arcade/` (`Arcade.tsx`, `input.ts`, `arcade.css`) |
| Back-office screens | `web/src/pages/` |
| Settings schema | `src/config/settings.ts` |
| Database migrations | `src/db/migrations/` (001 to 007 and 009 on `main`; 008 is taken by open pull request #13) |
| Tests | `tests/` (`npm test`) |
| Mac Dock app (`npm run make-mac-app`) | `src/ops/macApp.ts` (bundle and launcher), `src/ops/macIcon.ts` (GAGE icon), `scripts/make-mac-app.ts`; built into `dist-mac/` (not in git) |
| Setup and daily use | `README.md`, `docs/GETTING_STARTED.md`, `docs/WINDOWS.md` |
| Architecture and data model | `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md` |
| Arcade UX spec | `docs/ASSET_FOUNDRY_UX_SPEC.md` |
| Factory task log with evidence | `TASKS.md` |
| Factory plan from 2026-10-28 (mandala, geometric, ship path) | `docs/plans/2026-10-28-audit-mandala-geometric-ship.md` |

## Article 8: Current state

As of 2026-11-05, `main` after pull request #15, plus the Mac Dock app (pull request #16).

**Working**
- All 17 product types produce offline with the built-in content library: QA, packaging, listings, batch approval and export packages.
- Imports of outside images and text. Readable product folder names.
- Pack carts and the bundle builder. Production plans, which run while the app is open.
- Portable copy: `npm run portable`.
- Mac Dock app (2026-11-04): `npm run make-mac-app` makes `dist-mac/Asset Foundry.app`, a small app bundle and not Electron. One click starts the app if it isn't running and opens the arcade (`/arcade`, the owner's choice) in its own Chrome window. It records the full path of Node and of this folder when it is made, because the Dock doesn't load the Terminal's PATH, so it must be made again if either moves. If Node or the folder is missing, or the app doesn't start, it shows a Mac alert saying why and where the log is (`~/Library/Logs/Asset Foundry.log`). The icon is GAGE, the ninja, drawn from the arcade's own pixel art. It has been started the way the Dock starts it, but not yet double-clicked from Finder.
- HAPPY DAFFY milestone 1: Insert Coin, Start Gate with the zero-credit lock, Title, Character Select, the cabinet, keyboard, WASD and controller input, and a motion switch.
- HAPPY DAFFY milestone 2a (pull request #10): Worlds the owner builds by hand. The World Builder creates worlds, milestones and tasks. Each task belongs to one character, has a task type (any of the 17 product types except imports, or Custom), a difficulty and effort points the owner sets. The Worlds list shows only worlds where the chosen character has an open task (open, in progress or blocked), sorted by the fewest effort points left before the next milestone. A milestone completes by itself when all its tasks are complete and reopens if one is reopened. World Detail lists that character's open tasks. The Task Workspace behind OPEN TASK is milestone 3.
- HAPPY DAFFY milestones 2b and 2c: AI suggestions and AI-written worlds in the World Builder. NEED AN IDEA? gives clickable world ideas and task ideas that fill the forms. LET THE AI BUILD A WORLD takes a goal, the number of milestones, tasks per milestone, a difficulty mix, optional product types and an optional character, then shows a review screen. Nothing is saved until the owner presses SAVE WORLD, and the owner can remove tasks and milestones first. The owner's rule (2026-11-03): this part is AI-first. With no working AI provider it says so, and it never uses the built-in content library. Totals, ordering, progress and validation stay rule-based. Only tested against a stand-in AI so far, because no real provider key has been tried.
- Backup models at each AI text provider (2026-11-04). Every free-tier text provider has a list of backup models that it tries in order, on the same key, before the app moves on to the next provider. It moves to the next model when a model is retired or unknown, times out, has a server error or refuses. It does not when the key is rejected, the host can't be reached or the key is rate-limited, so backups don't spend more of a capped key. The owner's text setup: NVIDIA first, with Nemotron 3 Ultra (`nvidia/nemotron-3-ultra-550b-a55b`) and MiniMax (`minimaxai/minimax-m3.1-flash`) behind it. Groq is a late backup and never the first one. The old NVIDIA default, `meta/llama-3.1-70b-instruct`, was retired (HTTP 410). Tested against stand-in servers only; no real NVIDIA call has been made with these models yet.
- Sample previews on Research & opportunities (2026-11-04). Each idea can get a picture of what it describes: the first two pages (the cover and the first inside page) of its product type, drawn offline with the idea's title, audience and theme and the built-in sample content. It's free and needs no AI key. Owner's choices: it is made only when the owner presses Make preview (in the opened idea) or Make sample previews (for the whole list), the list shows a small picture on each row, and an AI-drawn picture is a later addition. Every picture is labelled SAMPLE, and the idea's own extras (its differentiation) are not drawn. Previews are kept under `research/previews/` in the asset folder and marked out of date when the idea's title, type, audience or theme changes. Illustrated coloring ideas get no free sample, because their pages need an AI image provider.
- Compact output lists (2026-11-06): every page that lists output uses one shared compact list (`web/src/compact.tsx`) with slim rows, a box of fixed height, the real total and Load more. Pictures load only when Preview is pressed. Lists no longer stop silently at 100 to 300 items. Product library has Gallery (the last 5 types with approved work, 4 of each) and List. Production calendar shows things made today, this week and this month. New **Rework** screen: failed by the machine on top, rejected by you below, each sortable. An item leaves only when Mark fixed is pressed.
- Tests: 149 tests, 147 pass, 2 skipped, 0 fail (run in a cloud session on 2026-11-06).

**Built but not proven live**
- AI text and image providers have only been tested against stand-in servers, never with real keys.
- Gumroad direct posting, the research digest email, Windows and hub mode have also never had a live run.

**Data**
- The Mac's `data/daf.sqlite` was replaced by an empty database on 2026-10-29, so product records were lost. The product folders survived.
- `npm run restore-products` was added on 2026-11-01 to re-register them. Running it on the Mac had not been confirmed as of 2026-11-03, and neither had `npm run tidy-folders`.
- `data/` has no backup off the Mac.

**Not built yet**
- HAPPY DAFFY milestones 3 to 10: Task Workspace, QA Review, Packs, live provider credits, XP and Codex, Leaderboards, the laziness failsafe, and new modules.
- The AI Chatbot itself.
- From the 2026-10-28 plan: the mandala engine expansion (Workstream A), geometric pattern art (Workstream B), and the test-browser isolation fix (C1).

## Article 9: What comes next, and what's undecided

**Next, in order**
1. **On the Mac:** `git pull`, `npm ci`, `npm run backup`, then `npm run restore-products` (dry run), then `-- --apply`. Then try `/arcade`. To get the Dock app, run `npm run make-mac-app`, drag `dist-mac/Asset Foundry.app` into Applications and keep it in the Dock.
2. **Try the AI with the real NVIDIA key.** In Settings → AI providers, press Test text provider and check that Nemotron 3 Ultra (or MiniMax behind it) answers. Then re-run the `prepare_listings` jobs that failed on 2026-11-04, and use NEED AN IDEA? and LET THE AI BUILD A WORLD in the World Builder. Until then they only run against a test stand-in.
3. **HAPPY DAFFY milestone 3, the Task Workspace** (the screen behind OPEN TASK). Its questions are the spec's section H.
4. **Factory upgrades from the 2026-10-28 plan:** mandala engine expansion, then geometric pattern art.
5. **AI-drawn opportunity pictures** (the owner's "later" choice, 2026-11-04): a Draw with AI button beside the free sample preview, once an image provider key works. It costs credits per idea and must be labelled as an AI impression, not the product.

**Undecided**
- **A.** Answered 2026-11-03 and built: both. The owner builds from scratch, and the AI suggests and writes worlds. Possible later additions: more settings to tune, and effort points the AI estimates from past work.
- **B.** The spec's own open questions H1 to H18 (`docs/ASSET_FOUNDRY_UX_SPEC.md`, section H). These include the low-credit threshold, the pack bonus, the vagueness test, the QA checklist, the laziness thresholds and the XP values.
- **C.** What the AI Chatbot can see and do. Questions about income, money owed and tax can't get definite answers until the factory holds that data.
- **D.** An off-Mac backup for `data/`.
- **E.** Characters, settled 2026-11-03. Each is an original pixel design, and the two side characters face the middle. **GAGE**, the ninja, is IDE on the left. **B.M.O.**, the desk robot with a headset (an original design; only the name is borrowed, at the owner's request), is the AI Chatbot in the middle. **SPARKS**, the wizard, is DAF on the right. The names, roles and bios live in `src/engine/arcade/service.ts`. Custom portraits: the owner can upload their own image for any character on the select screen, and it replaces the pixel art until removed (stored under `arcade/portraits/` in the asset folder).

---

## Amendment log

| Date | Change |
| --- | --- |
| 2026-11-03 | Article 1 adopted (Asset Foundry / the factory). |
| 2026-11-03 | Constitution expanded to Articles 1 to 9. HAPPY DAFFY named as the arcade game. One source of truth set: GitHub `main` plus the Mac folder. |
| 2026-11-03 | Articles 8 and 9 updated for milestone 2a (owner-built Worlds) and the character naming question. |
| 2026-11-04 | Articles 8 and 9 updated for backup models per AI text provider and the owner's NVIDIA-first text setup. |
| 2026-11-04 | Articles 7, 8 and 9 updated for sample previews on Research & opportunities. |
| 2026-11-04 | Articles 7, 8 and 9 updated for the Mac Dock app (`npm run make-mac-app`). |
