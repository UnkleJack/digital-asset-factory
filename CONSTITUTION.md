# Constitution of Asset Foundry

This is the canonical record of what Asset Foundry is, where it lives, the rules it runs by, and where it stands. Where any other file, plan, note or chat disagrees with it, this file wins.

**Amending it.** Only the owner (GitHub `UnkleJack`) changes Articles 1 to 6. Each change is dated in the Amendment log at the bottom. Articles 7 to 9 describe the current state. Whoever merges a change that makes them untrue updates them in the same pull request.

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
| Mandala and other procedural art | `src/engine/generation/procedural.ts`; the mandala engine is `src/engine/generation/mandala/` (`motifs.ts` motif library, `symmetry.ts` symmetry engine, `compose.ts` rings, centre and border) |
| AI providers (10 text, 8 image) and pacing | `src/engine/generation/providers.ts`, `pacing.ts` |
| QA, packaging, listings, approval, publishing | `src/engine/qa/`, `packaging/`, `listing/`, `approval/`, `publishing/` |
| Packs ("factory floor") | `src/engine/packing/` |
| Opportunity sample previews | `src/engine/research/preview.ts` (stored under `research/previews/` in the asset folder) |
| Arcade engine and API | `src/engine/arcade/` (`service.ts` characters, `credits.ts` live credits and the earned-credit ledger, `workspace.ts` Task Workspace, `review.ts` QA Review and Bin, `packs.ts`, `leaderboards.ts`, `codex.ts` XP, `failsafe.ts`, `bmo.ts` B.M.O., `worlds.ts`, `suggest.ts` AI suggestions and TIDY MY NOTES, `drafts.ts` World Builder drafts, `ticker.ts` hub stats), `src/server/routes/arcade.ts` (`/api/arcade/...`) |
| Arcade screens | `web/src/arcade/` (`Arcade.tsx` cabinet and Hub, `Play.tsx` Task Workspace, QA Review, Bin, Packs, Leaderboards, Codex and B.M.O., `Worlds.tsx`, `Ai.tsx`, `Ticker.tsx`, `input.ts`, `arcade.css`) |
| Back-office screens | `web/src/pages/` |
| Settings schema | `src/config/settings.ts` |
| Hub mode and public access (the access-token sign-in, who counts as local) | `src/server/remote.ts`, used by `src/server/app.ts`; owner guide `docs/PUBLIC_ACCESS.md` |
| Database migrations | `src/db/migrations/` (001 to 010; 008 is World Builder drafts, from pull request #13, 009 is rework marks, and 010 is notes for the AI, from pull request #19) |
| Tests | `tests/` (`npm test`) |
| Mac Dock app (`npm run make-mac-app`) | `src/ops/macApp.ts` (bundle and launcher), `src/ops/macIcon.ts` (GAGE icon), `scripts/make-mac-app.ts`; built into `dist-mac/` (not in git) |
| Security policy (how to report a problem privately) | `SECURITY.md` |
| Setup and daily use | `README.md`, `docs/GETTING_STARTED.md`, `docs/WINDOWS.md`, `docs/PUBLIC_ACCESS.md` (opening the app at `daf.promptpimps.com`) |
| Architecture and data model | `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md` |
| Arcade UX spec | `docs/ASSET_FOUNDRY_UX_SPEC.md` |
| Factory task log with evidence | `TASKS.md` |
| Factory plan from 2026-10-28 (mandala, geometric, ship path) | `docs/plans/2026-10-28-audit-mandala-geometric-ship.md` |

## Article 8: Current state

As of 2026-11-06: `main` after pull requests #12 (backup AI models), #13 (the Hub, the stats ticker, World Builder drafts, smarter AI help and the test-data cleanup), #15 (sample previews), #16 (the Mac Dock app), #18 (compact lists and Rework) and #19 (warning gate and notes for the AI), plus public access on branch `claude/public-access` (not merged yet).

**Working**
- All 17 product types produce offline with the built-in content library: QA, packaging, listings, batch approval and export packages.
- Imports of outside images and text. Readable product folder names.
- Pack carts and the bundle builder. Production plans, which run while the app is open.
- Portable copy: `npm run portable`.
- Mac Dock app (2026-11-04): `npm run make-mac-app` makes `dist-mac/Asset Foundry.app`, a small app bundle and not Electron. One click starts the app if it isn't running and opens the arcade (`/arcade`, the owner's choice) in its own Chrome window. It records the full path of Node and of this folder when it is made, because the Dock doesn't load the Terminal's PATH, so it must be made again if either moves. If Node or the folder is missing, or the app doesn't start, it shows a Mac alert saying why and where the log is (`~/Library/Logs/Asset Foundry.log`). The icon is GAGE, the ninja, drawn from the arcade's own pixel art. It has been started the way the Dock starts it, but not yet double-clicked from Finder.
- HAPPY DAFFY milestone 1: the cabinet, the zero-credit lock, keyboard, WASD and controller input, and a motion switch.
- **The Hub** (owner's change, 2026-11-05; branch `claude/arcade-start-flow`).
  - Insert Coin, Start Gate, Title, Character Select and Worlds are one opening screen. It holds the character picker, the chosen character's worlds and a stats area (a ticker plus a STATS button). Opening `/arcade` to a world is now 1 click, down from 6.
  - A ◀ HUB button in the cabinet header returns to it from anywhere. The last character played is remembered on the computer.
  - Locked rules kept. Insert Coin is cabinet flair and never changes credits. At 0 credits ENTER WORLD is locked and the Hub says why; entering a world counts as the "start" (Art. 5.9), a reading the owner approved with the plan. The character picker, World Builder and STATS stay usable at 0.
  - The spec is amended to match (`docs/ASSET_FOUNDRY_UX_SPEC.md`, section A note, E1, E5, E7, milestone 1).
- **Stats ticker on the Hub** (2026-11-05).
  - Shows the stats the owner picks, in order, from a list of every stat the factory can report (47 today: Arcade, Production, AI, Listings per shop, and Sales per metric and source). EDIT TICKER changes the list, saved in Settings (`arcade.tickerStats`).
  - Anything about the outside world with nothing recorded shows NO DATA, never a made-up 0. Sales sources are never added together; estimates are labelled.
  - STATS opens the back-office Analytics page until an arcade stats page exists.
- **World Builder drafts** (2026-11-05).
  - What the AI writes (a whole world, or tidied notes) is stored as a draft, so leaving the page while the AI works loses nothing. Drafts are listed as writing, ready or failed, with REVIEW and DISCARD.
  - SAVE WORLD is still the only thing that creates a world, and a saved draft leaves the list. A draft still being written when the app stops is marked failed on the next start.
- **Smarter AI help in the World Builder** (2026-11-05).
  - BUILD ON WHAT I HAVE and SHOW ME UNEXPLORED GROUND sit beside SUGGEST WORLDS. They give the AI a summary built only from real rows: existing worlds, product types used and never used, idle characters, and recorded orders by source.
  - TIDY MY NOTES turns a brain dump into a fixed structure (goal, scope, milestones and tasks, must and must-not, done when), with anything unclear listed as questions for the owner. It is told not to add facts.
  - The owner sees the original beside the tidy version. The tidy text can be edited and handed to LET THE AI BUILD A WORLD.
- HAPPY DAFFY milestone 2a (pull request #10): Worlds the owner builds by hand. The World Builder creates worlds, milestones and tasks. Each task belongs to one character, has a task type (any of the 17 product types except imports, or Custom), a difficulty and effort points the owner sets. The Worlds list shows only worlds where the chosen character has an open task (open, in progress or blocked), sorted by the fewest effort points left before the next milestone. A milestone completes by itself when all its tasks are complete and reopens if one is reopened. World Detail lists that character's open tasks.
- HAPPY DAFFY milestones 2b and 2c: AI suggestions and AI-written worlds in the World Builder. NEED AN IDEA? gives clickable world ideas and task ideas that fill the forms. LET THE AI BUILD A WORLD takes a goal, the number of milestones, tasks per milestone, a difficulty mix, optional product types and an optional character, then shows a review screen. Nothing is saved until the owner presses SAVE WORLD, and the owner can remove tasks and milestones first. The owner's rule (2026-11-03): this part is AI-first. With no working AI provider it says so, and it never uses the built-in content library. Totals, ordering, progress and validation stay rule-based. Only tested against a stand-in AI so far, because no real provider key has been tried.
- Backup models at each AI text provider (2026-11-04). Every free-tier text provider has a list of backup models that it tries in order, on the same key, before the app moves on to the next provider. It moves to the next model when a model is retired or unknown, times out, has a server error or refuses. It does not when the key is rejected, the host can't be reached or the key is rate-limited, so backups don't spend more of a capped key. The owner's text setup: NVIDIA first, with Nemotron 3 Ultra (`nvidia/nemotron-3-ultra-550b-a55b`) and MiniMax (`minimaxai/minimax-m3.1-flash`) behind it. Groq is a late backup and never the first one. The old NVIDIA default, `meta/llama-3.1-70b-instruct`, was retired (HTTP 410). **First live success, 2026-11-05:** with the owner's real NVIDIA key, Nemotron 3 Ultra wrote a whole world in the World Builder in 76 seconds. MiniMax as the backup has not been seen answering live yet.
- Sample previews on Research & opportunities (2026-11-04). Each idea can get a picture of what it describes: the first two pages (the cover and the first inside page) of its product type, drawn offline with the idea's title, audience and theme and the built-in sample content. It's free and needs no AI key. Owner's choices: it is made only when the owner presses Make preview (in the opened idea) or Make sample previews (for the whole list), the list shows a small picture on each row, and an AI-drawn picture is a later addition. Every picture is labelled SAMPLE, and the idea's own extras (its differentiation) are not drawn. Previews are kept under `research/previews/` in the asset folder and marked out of date when the idea's title, type, audience or theme changes. Illustrated coloring ideas get no free sample, because their pages need an AI image provider.
- Compact output lists (2026-11-06): every page that lists output uses one shared compact list (`web/src/compact.tsx`) with slim rows, a box of fixed height, the real total and Load more. Pictures load only when Preview is pressed. Lists no longer stop silently at 100 to 300 items. Product library has Gallery (the last 5 types with approved work, 4 of each) and List. Production calendar shows things made today, this week and this month. New **Rework** screen: failed by the machine on top, rejected by you below, each sortable. An item leaves only when Mark fixed is pressed.
- Warning gate (2026-11-06): a version with open QA warnings (yellow flags) can't be approved until the owner ticks "I accept these warnings" in batch review. The note is optional and is kept in the audit log, not in the decision notes that feed prompts. Each warning has an optional "Help me with this" AI button, which only suggests a fix and needs an AI key. Packs, carts and bundles take **approved** products only. Products waiting in carts or the backlog that aren't approved get taken out, and come back once approved. The old `packing.feedOn` setting is ignored and hidden. Items approved before the gate that carry unaccepted warnings keep their approval, but they are held back from packing, bundling and export/publishing until accepted. Batch approval lists them at the top.
- Notes for the AI (2026-11-06): every review note is kept in one list on a new **Notes for the AI** screen. That covers reject, send back, regenerate, approve and accepted-warning notes, plus notes added with "Add note" on Rework. After every 10 new notes, or when "Read my notes now" is pressed, the AI reads them all and writes a list of repeat problems. That list goes into every AI prompt ahead of the 12 most recent notes. You can edit, pin, delete or add lessons; the AI only replaces its own unpinned ones. Reading needs an AI key. Migration 010.
- **Walkthrough guide** (owner request, 2026-11-06): `docs/guide/WALKTHROUGH.md` covers every back-office screen in sidebar order and the HAPPY DAFFY arcade (written in the game's voice), button by button, with a "Your day" routine up front and screenshots in `docs/guide/images/` taken from a test copy with sample data. When a screen changes, update its chapter in the same pull request.
- **HAPPY DAFFY missions** (owner request, 2026-11-09): a MISSIONS tab in the arcade, and a **Missions** page in the back-office sidebar (owner: "both sides"), list one mission per walkthrough chapter (18 back-office chapters plus Part 2, the arcade). INSTRUCTIONS opens that chapter as a text popup read straight from `docs/guide/WALKTHROUGH.md`, so the instructions are written once and the screen doesn't have to load. This reverses the 2026-11-06 "written guide only, no in-app help panel" call, with the owner's go-ahead. GO opens the screen; MARK DONE and UNDO keep a done mark per mission (migration 012). Every back-office screen also has a **? Instructions** button that opens its own guide chapter in the same pop-up (owner, 2026-11-09). Missions earn no XP, because the XP rules aren't decided. Mission #1, student product types, is shown LOCKED until those types are built (build list in `TASKS.md`, B1), and then has to be earned by clearing the Product library and Templates missions (owner's choice).
- **Public access** (owner request, 2026-11-06; not merged yet). The app can be opened at `https://daf.promptpimps.com` through a Cloudflare Tunnel (`cloudflared` on the Mac, forwarding to `127.0.0.1:4317`). The owner's steps are in `docs/PUBLIC_ACCESS.md`.
  - The tunnel connects from the Mac itself, so the app no longer trusts the connection's address alone. A request counts as local only when it comes from this computer, carries no `CF-Connecting-IP` or `X-Forwarded-For` header, and isn't addressed to a public address. Everything else needs the access token, and only works while hub mode is on with a token made.
  - Public addresses are listed in Settings → System (**Public web address**, saved as `remote.publicHosts`, empty by default). `https://` writes are accepted only from a listed address. The sign-in cookie is marked Secure when the visit came over https.
  - The wrong-token brake counts each visitor by `CF-Connecting-IP`, never the tunnel's 127.0.0.1. Those headers are only believed when the tunnel is on the Mac, so a home-network computer can't make them up to dodge the brake. A new access token still can only be made on the Mac, never through the tunnel.
  - A new tick box, **Only through the web address**, sets `remote.bindAddress` to `127.0.0.1` so the home-network door stays shut while the tunnel works.
  - The guide recommends Cloudflare Access (an emailed one-time code, the owner's email only) as a second lock. It rules out cloudflared's `httpHostHeader` trick.
- Parked, not to be forgotten: a tool for drawing a box on a page preview in reject/revise notes. It waits for an AI model that can look at pictures, because today's app AI reads text only.
- **Cleanup of old test data** (owner request, 2026-11-05).
  - `npm run clean-verification` lists folders inside `verification-output/` (the throwaway copies used for browser checks) that have not changed for 7 days. `-- --apply` removes them. This is the same pattern as `tidy-folders`, chosen by the owner.
  - It never removes `verification-output/` itself, loose files or links, and never touches anything outside it, `data/` above all. It skips any folder a running copy of the app is using, and checks again just before deleting.
  - The app runs it once a week while open. Turn that off in Settings → Scheduler → `cleanVerificationWeekly`. The last run is noted in `verification-output/.last-cleanup`.
- **HAPPY DAFFY milestones 3 to 9 and B.M.O.** (owner's go-ahead, 2026-11-10: "finish the rest of that list"; every open spec question answered with the spec's own recommendation). Migration 015.
  - **Task Workspace** (OPEN TASK). A product-type task makes its asset through the factory's own pipeline and keeps it linked to the task and world. A custom task is moved along by hand. Approving the asset, here or in the back office, completes the task.
  - **QA Review.** The checklist is the factory's own QA checks. APPROVE and REJECT go through the same approval as batch review. A rejection needs 2+ sentences and passes the AI reason check; every 5 qualifying rejections earn +1 credit. DELETE goes to the Bin or, after typing DELETE, is permanent; it never counts as a rejection or earns credits. The Bin restores. Every decision is recorded with how long it took.
  - **Packs.** The factory floor's carts and bundles. FINALIZE PACK (ready-to-sell packs only, can't be undone) puts a pack in the pool. A pack qualifies at 15+ items. The pack bonus amount is TBD, so none is paid until it is set.
  - **Credits.** N is the AI calls left today at the provider with the least room, from the daily limits in Settings → Generation → pacing and the call log. A provider resting after a rate limit counts as 0. Providers with no daily limit can't be counted. When no provider has a limit the meter shows the Settings test number, still labelled TEST. Earned credits are a separate number and never add to N. At N = 0 no new AI work starts; work already made is kept.
  - **Codex.** XP per character for finishing world tasks (by difficulty), clearing a mission while playing (a tab learned) and four cross-tab links. Every XP amount starts blank (Settings → arcade → xp); events are recorded either way. EYE, CRAFT, TASTE and PATIENCE stay blank (item G).
  - **Leaderboards.** FINISHED (QA'd + finalized + in the pool), REJECTED WELL (qualifying rejections, counted per character), one board per product type, and LAST 3 SHIPPED. The Hub's hi-score banner shows real finished packs.
  - **Laziness failsafe.** Weighted signals (approval streak, fast review, empty note, copied reason) and four cumulative stages (shuffled queue, swapped buttons, name one thing wrong, 5-second approve hold). Every weight and threshold starts blank, so it is off until the owner sets them. It never changes an asset and never scolds.
  - **B.M.O.** Chat that answers from real rows only and can propose up to three actions (make a world, add a task, start a product). Nothing runs until the owner presses YES on that card. Needs a working AI provider; the chat is not saved.
  - Tested in `tests/arcade-play.test.ts` with the real pipeline and a stand-in AI for reason checks and B.M.O. **Not yet tried live** with the owner's NVIDIA key.
- **Mandala engine** (2026-10-28 plan, Workstream A; built 2026-11-10). Mandala pages are drawn by a new engine, `procedural-mandala@2`:
  - 14 motifs (petal, trefoil, arch, teardrop, diamond, chevron, fan, scale, dot cluster, ring shell, sunburst, lattice, rope, wheat). Each ring repeats one motif around the centre; most motifs are drawn as a half and mirrored, so designs have true mirror symmetry.
  - New settings: **detail** (simple, medium, detailed, intricate: 3, 5, 7 or 10 rings, with sub-rings, centres and borders getting richer as detail goes up), **symmetry** (auto, or 6, 8, 10, 12, 16, 18, 20 or 24) and **motif set** (classic, botanical, geometric, celestial). Older products made with the old `complexity` setting still open and remake; it is read as `detail`. A remade older product gets new designs, because the same seed now draws a different picture.
  - Each repeated shape is stored once in the SVG and reused, so even an intricate design stays under about 40 KB (the largest of 600 test designs was 38 KB).
  - Lines are thickened when needed so none prints under 0.2 mm on the chosen paper. New QA checks: everything inside the drawing box, minimum line width, density (warning: over 20,000 path segments or rings under 2 mm), and clean black-on-white line art with no missing shapes. These limits are starting values, not yet checked against real prints.
  - Tested in `tests/mandala.test.ts`.
- **Test-browser isolation** (2026-10-28 plan, C1; built 2026-11-10). Every Chrome the app or a test run starts gets its own empty profile folder in the temp folder, named `daf-chrome-<process id>-…`, and the folder is removed when that Chrome closes or the process exits. So `npm test` can run while the app is open without the two sharing a profile. They still share the processor and disk, so tests are slower while the app renders. Puppeteer already gave each launch a temporary profile before this change; the app now makes and removes the folder itself, so the separation no longer depends on the library's default. Tested in `tests/renderer-isolation.test.ts`.
- Tests: 168 tests, 168 pass, 0 skipped, 0 fail (branch `claude/arcade-start-flow` with `main` merged in, run on the Mac, 2026-11-06).

**Built but not proven live**
- Of the AI providers, only NVIDIA text has worked with a real key (2026-11-05). On 2026-11-04 and 2026-11-05 the log showed the others failing:
  - OpenAI images: out of credits.
  - Hugging Face: could not be reached, or wanted pre-paid credits.
  - OpenRouter: its key was rejected (missing).
  - Groq: its Llama model was not found.
- Untested live: the rest of the providers, and the new TIDY MY NOTES and suggestion modes, which have only run against a stand-in AI.
- Gumroad direct posting, the research digest email, Windows, hub mode and public access at `daf.promptpimps.com` have also never had a live run. Public access needs the owner's DNS move and Cloudflare set-up first.

**Data**
- The Mac's `data/daf.sqlite` was replaced by an empty database on 2026-10-29, so product records were lost. The product folders survived.
- `npm run restore-products` was added on 2026-11-01 to re-register them. Running it on the Mac had not been confirmed as of 2026-11-03, and neither had `npm run tidy-folders`.
- `data/` has no backup off the Mac.

**Not built yet**
- HAPPY DAFFY milestone 10: new modules (8-bit and 16-bit sprites, Unity pipeline).
- A coding agent behind GAGE (item F).
- From the 2026-10-28 plan: geometric pattern art (Workstream B).

## Article 9: What comes next, and what's undecided

**Next, in order**
1. **On the Mac:** `git pull`, `npm ci`, `npm run backup`, then `npm run restore-products` (dry run), then `-- --apply`. Then try `/arcade`. To get the Dock app, run `npm run make-mac-app`, drag `dist-mac/Asset Foundry.app` into Applications and keep it in the Dock.
2. **Public access, if wanted** (owner request, 2026-11-06). After the pull request is reviewed and merged, follow `docs/PUBLIC_ACCESS.md`: move `promptpimps.com` DNS to Cloudflare (copying every IONOS record first), add the Cloudflare Access lock, enter `daf.promptpimps.com` in Settings → System, then start `cloudflared`. Try it from a phone on mobile data. The Mac must be awake with the app running.
3. **Try the new AI help with the real NVIDIA key.** LET THE AI BUILD A WORLD already worked live on 2026-11-05. Still to try live:
   - TIDY MY NOTES, BUILD ON WHAT I HAVE and SHOW ME UNEXPLORED GROUND.
   - Starting a world, leaving the page and finding the draft waiting.
   - Re-running the `prepare_listings` jobs that failed on 2026-11-04.
3. **A guide in each area** (owner request, 2026-11-05). A HOW THIS WORKS button on each arcade area opens a short guide for just that screen, describing only what exists (Art. 5.2). The owner reviews the wording. Order: Hub, World Detail, World Builder (including the AI parts).
4. **Play HAPPY DAFFY milestones 3 to 9 with real data**, then set the values the spec leaves open (Settings → arcade: XP amounts, pack bonus, low-credit warning, failsafe weights and thresholds) and the daily limit for NVIDIA under pacing if the credit meter should go live.
5. **Factory upgrades from the 2026-10-28 plan:** geometric pattern art. Then print a few mandala pages at each detail level on A5 and letter, and tune the mandala print limits if the lines or rings look wrong.
6. **AI-drawn opportunity pictures** (the owner's "later" choice, 2026-11-04): a Draw with AI button beside the free sample preview, once an image provider key works. It costs credits per idea and must be labelled as an AI impression, not the product.

**Undecided**
- **A.** Answered 2026-11-03 and built: both. The owner builds from scratch, and the AI suggests and writes worlds. Possible later additions: more settings to tune, and effort points the AI estimates from past work.
- **B.** Answered 2026-11-10: use the spec's own recommendation for each of H1 to H18. The numbers the spec calls TBD start blank in Settings → arcade and do nothing until the owner sets them. The spec's open questions H1 to H18 (`docs/ASSET_FOUNDRY_UX_SPEC.md`, section H). These include the low-credit threshold, the pack bonus, the vagueness test, the QA checklist, the laziness thresholds and the XP values.
- **C.** Answered 2026-11-10: B.M.O. is an advisor that can act. It sees a summary of real rows and can propose making a world, adding a task or starting a product; each runs only on the owner's YES. Still open: what the AI Chatbot can see and do beyond that. Questions about income, money owed and tax can't get definite answers until the factory holds that data.
- **D.** An off-Mac backup for `data/`.
- **E.** Characters, settled 2026-11-03. Each is an original pixel design, and the two side characters face the middle. **GAGE**, the ninja, is IDE on the left. **B.M.O.**, the desk robot with a headset (an original design; only the name is borrowed, at the owner's request), is the AI Chatbot in the middle. **SPARKS**, the wizard, is DAF on the right. The names, roles and bios live in `src/engine/arcade/service.ts`. Custom portraits: the owner can upload their own image for any character on the Hub (under BIO, PORTRAIT & STATS), and it replaces the pixel art until removed (stored under `arcade/portraits/` in the asset folder). A character's job in the app today is to filter: picking one shows only worlds with tasks assigned to it. No AI runs behind any character yet.
- **F. A coding agent behind GAGE** (owner's idea, 2026-11-05, placeholder only). GAGE could become a real coding agent for the owner. Nothing is designed. What it would run on and what it could touch are both undecided, and today's AI providers only exchange text, with no access to files or tools.
- **G. What EYE, CRAFT, TASTE and PATIENCE mean.** The spec names the four character stats but never defines them, and their formulas are open (spec section H). They stay blank until decided.
- **H. The arcade stats page** (owner request, 2026-11-05). This would cover analytics, earnings and performance across live Etsy and Gumroad products and future platforms. Until it exists, STATS opens the back-office Analytics page, and the Hub ticker shows the stats the owner picks.
- **I. A whole-machine tracking system** (owner's idea, 2026-11-05, back burner). Instead of the four spec stats, a system within the system that keeps track of everything about the whole machine. Idea only: nothing is designed, and the owner wants to finish exploring what exists first.

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
| 2026-11-05 | Articles 7, 8 and 9 updated for the Hub, the stats ticker, World Builder drafts, smarter AI help and the first live NVIDIA success. Undecided items F to I added. The UX spec is amended for the Hub, with the owner's approval. |
| 2026-11-06 | Articles 7, 8 and 9 updated for public access at `daf.promptpimps.com` (Cloudflare Tunnel, `remote.publicHosts`, `docs/PUBLIC_ACCESS.md`). Pull request #13 recorded as merged. |
