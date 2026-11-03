# DAF — Audit, Mandala Expansion, Geometric Pattern Art, Ship Path

**Goal:** (1) Precise audit of the Digital Asset Factory at commit `b45a480`; (2) expand the mandala generation engine to real complexity; (3) add a geometric pattern art product family; (4) define the shortest honest path to shipping.

**Architecture:** Local-first single Node process (Fastify + SQLite + headless Chrome) with a product-type plugin registry. New artwork = new generator module + a plugin; the pipeline, QA, packaging, approval, and UI do not change. UI is fully registry-driven — verified: zero hardcoded product-type IDs under `web/`.

**Tech stack:** Node 26 (TS run directly, erasable syntax only), Fastify 5, `node:sqlite`, React 19 + Vite, puppeteer-core + system Chrome, Zod 4, node:test.

---

## LOCKED DECISIONS (2026-10-28, Jack)

| # | Decision |
|---|---|
| D1 | Geometric pattern art serves **both** purposes: **coloring line art** AND **decor / wall-art prints**. → the type gets a `mode: 'coloring' | 'print'` param; QA profile and listing copy branch on it. |
| D2 | **One** product type `geometric-pattern-art` with a `family` param (fastest to ship; easy to split into per-family types later). |
| D3 | **Ship = self-use + portable package** (Workstream C tasks C1–C4 + C3). **Electron/C5 is out of scope.** |

---

## ⚠️ CRITICAL FINDING — `main` IS NOT THE WORKING VERSION

Discovered 2026-10-28 during this audit. **`main` (b45a480) is incomplete; the working version is `main` + `stash@{0}`.**

`stash@{0}` = `"On pass-2-3-implementation: Next"` — 55 files, **+2,525 / −297**, and it **applies cleanly** on `main`.

### Proof

| Evidence | Bare `main` | `main` + `stash@{0}` |
|---|---|---|
| `TEXT_PROVIDER_IDS` | 6 (anthropic, openrouter, groq, nvidia, cerebras, together) | **10** (+ gemini, mistral, github, huggingface) |
| `tests/operations.test.ts` → "cost limit skips AI generation" | **✖ FAIL** (`assert 0 === 3` — budget guard bypassed by the fallback router) | **✔ PASS** |
| Whole `operations.test.ts` | 5 tests fail, then the file **hangs** (never exits) | single test verified passing |
| Test baseline 67/67 (113s) | **not reproducible** | the run that produced it |

The 67/67 baseline in `verification-output/test-run-final.log` was measured **with these uncommitted changes present** (they were the working tree, then stashed). `main` alone has source and tests that no longer agree.

### What the stash contains

- **10 text providers** (+ gemini, mistral, github models, huggingface) with `keysUrl`, secret names, and `.env.example` entries.
- **Windows support**: `start.bat`, `start.ps1` double-click launchers; **DPAPI-encrypted secrets** (`data/secrets.dpapi.json`) replacing the Keychain-only path.
- **Portability, already built**: `scripts/make-portable.ts` + `src/ops/portable.ts` (`makePortablePackage`, `--no-deps`, `--with-data`, `--out`) + generated `PORTABLE-README.txt`. → **this is Workstream C3, already done.**
- **New UI page** `web/src/pages/Packing.tsx` (170 lines).
- **CSS overhaul** (`web/src/styles.css` 433 lines changed) + `Settings.tsx` (+40), `secrets.ts` (+117), `settings.ts` (+70), `scheduler.ts` (+30), `bootstrap.ts` (+14), `server/app.ts` (+22), `launch-app.ts` (+14).
- **Docs**: `GETTING_STARTED.md` (+50), `TASKS.md` (+7), `README.md`.

### Consequence for the plan

**Task C0 (new, must go first): recover the stash.** Everything downstream depends on it.

```bash
cd ~/Projects/digital-asset-factory
git switch -c recover/stashed-build main   # safe: keep main intact
git stash apply --include-untracked stash@{0}
npm install && npm run typecheck && npm test
git add -A && git commit -m "Recover stashed cross-platform + 10-provider build"
```

Then re-audit: Workstreams A (mandala) and B (geometric) are **still to build** — confirmed the stash does *not* touch `procedural.ts`, `activity.ts`, or `producttypes/`. Workstream C collapses to **C0 + C1 + C2 + C4** (C3 already exists in the stash).

---

## PART 1 — AUDIT (commit b45a480, main, merged 2026-10-28)

### 1.1 Verified state

| Fact | Evidence |
|---|---|
| Typecheck clean (server + web) | `npm run typecheck` exit 0 |
| 16 product types registered (15 + bundle) | registry enumerates 16; matches docs |
| 40 DB tables | `sqlite3 data/daf.sqlite .tables` |
| Live server healthy | `/api/health` → `{ok,db,chrome,worker,scheduler}`; `/` → 200 |
| Samples exist for every producible type | `verification-output/samples/` (15 dirs) |
| Historic test baseline | 67 tests / 67 pass / 0 fail, 113.6s (`verification-output/test-run-final.log`) |
| LOC | 14,006 total (src 9,700 · web 2,390 · tests 1,625 · scripts 236) |

### 1.2 Inconsistencies (doc ↔ code ↔ reality)

| # | Severity | Inconsistency | Reality |
|---|---|---|---|
| I-1 | High | `HANDOFF.md` is stale and self-contradicting: claims branch `pass-2-3-implementation` at commit `062bd5f`, "uncommitted changes … add multi-provider AI", "67/67 tests", "not reviewed by Opus". | Merged to `main` at `b45a480`. The multi-provider work **is** committed (`providers.ts`, 445 LOC, 6 text providers + router). `062bd5f` exists in the object DB but is not on any branch. |
| I-2 | High | `HANDOFF.md` "Open requests" §1 (free-key links) and §2 (Text prices JSON → Advanced) are listed as TODO. | **Both already done.** `SECRET_KEY_LINKS` in `providers.ts:139`; `<details class="advanced">` in `Settings.tsx:77`. |
| I-3 | Medium | `HANDOFF.md` §3 "product choice too limited / only 5 fonts exist" + "no font selector in New Product". | **Done.** `FONT_IDS` has 14 fonts; `FONT_PAIRINGS` has 10 pairings; New Product has a full font picker + live font sample (`Library.tsx:190–203`). |
| I-4 | Medium | `ACCEPTANCE_REPORT.md` says 61 tests; `HANDOFF.md` says 67. | 67 is current (verified in baseline log). Report is one pass behind. |
| I-5 | Medium | Docs say `home-inventory` is a "Printable" list/tracker. | Registry tags it `family: 'structured'`, `artwork: 'none'` (imported from `lists.ts`). Cosmetic, but the family drives legend/grouping. |
| I-6 | Low | `package.json` appeared to declare only 5 `@fontsource` fonts. | **False alarm — corrected.** Current `package.json:30–54` declares all 16. My first read was the pre-merge Pass-1 file. |
| I-7 | Low | `BUILTIN_CATEGORIES` (8, seeded via `templates/seed.ts`) is a *separate* list from the categories the UI derives from product types (`Library.tsx:122`). | Two sources of truth. A new type's category shows in New Product automatically but not in the seeded categories table until added. |
| I-8 | Low | `DEFAULT_PRICES` (settings.ts:26) has exactly the 16 current type IDs. | A new type with no entry silently falls back to **499¢** (`listing/service.ts:120` `?? 499`) — a wrong price, not an error. Must be added per new type. |

### 1.3 Bottlenecks

- **B-1 Rendering is the cost centre.** Headless Chrome per page, `concurrency: 2` default. Tests take 113s for 67 tests; `npm run samples` renders 16 products. This machine's disk is pathologically slow (see memory), so render throughput is the throughput of the whole app.
- **B-2 `node --test --test-concurrency=1`** runs 12 files serially; one slow file delays everything. No per-file parallelism.
- **B-3 No test-time Chrome isolation.** `renderer.ts:111–121` launches with `pipe: true` + temp profile, no explicit `--user-data-dir`. Running tests while the app is running (or running two test suites) thrashes CPU/disk and does not terminate promptly. Observed live: two concurrent `npm test` runs + a live server → **hang past 28 min** vs. 113s baseline.
- **B-4 Scheduler only runs while the app is open** (by design, documented). Nothing produces overnight if the laptop sleeps.
- **B-5 Mandala generator is shallow** (see Part 2) — the specific bottleneck the user wants addressed.

### 1.4 Blockers (external — cannot be closed by code)

| # | Blocker | Impact | Can we ship anyway? |
|---|---|---|---|
| BL-1 | No live AI credentials (Anthropic/OpenAI/OpenRouter/Groq/…) | AI text + illustrated coloring unverified against real APIs | **Yes** — 14/15 types produce via built-in content library; AI is optional by design |
| BL-2 | Etsy Open API v3 app approval + OAuth; Gumroad product-create unconfirmed in official docs | Direct marketplace publishing unavailable | **Yes** — export-package + manual record path is the supported, tested path |
| BL-3 | Electron shell (`desktop/`) never built | `npm run app` opens a Chrome app window instead of a true `.app` | **Yes** — Chrome app-mode is functionally equivalent for a single operator |
| BL-4 | Portable/offline distribution (give a copy to a friend) not built | No `package-portable` script, no docs | **Yes for self**, not for a friend until Part 4 Task C3 |

### 1.5 What is genuinely good

1. **Honesty architecture.** Every asset carries provenance (`procedural-mandala@1`, `built-in content library`, provider/model). Scores exclude unknown factors and lower confidence rather than inventing numbers. Publishing is labelled `published_manual — unverified`. This is rare and valuable.
2. **Registry-driven UI.** Adding a product type touches backend files only; the New Product wizard, category chips, type filter, and Templates page all read `/product-types`. Verified zero hardcoded IDs in `web/`.
3. **Human-gated publication.** QA hard-fail blocks approval; approval is fingerprint-bound (hash of files + listing + marketplace); any material edit invalidates approval. Tested.
4. **Crash safety.** SQLite WAL, job lease/heartbeat, interrupt→requeue on startup, single-instance lock, auto-backup before migration, restore CLI. Verified live with `kill -9` mid-render.
5. **Security posture.** Binds `127.0.0.1` only; DNS-rebinding 421; CSRF/missing-client-header 403; path-traversal tests; CSP `script-src 'self'`; secrets in Keychain, write-only via API, redacted from logs, never in exports.
6. **Provider abstraction done right.** 6 text providers behind one interface + `RoutedTextProvider` fallback chain; errors normalised to `ProviderError{kind,retryable}`; cost estimation with explicit `unknown` basis.
7. **Procedural generators are deterministic and seed-reproducible** — the foundation the mandala/geometric work extends. Mazes verified perfect (exactly one solution); word searches verified solvable with blocked-term scanning (`BLOCKED_FILL`).

---

## PART 2 — WORKSTREAM A: Mandala engine expansion

**Target file:** `src/engine/generation/procedural.ts` (`mandalaSvg`, lines 9–70)
**Caller:** `src/engine/producttypes/activity.ts` (`mandalaColoring`, lines 25–68)

### A.0 Current logic (what exists)

```
rings = simple 4 | medium 6 | detailed 9
strokeWidth = 5 | 3.4 | 2.4
C=500, R=470, r0 = 45 + rand()*20
for each ring (outer→inner): pick k from [8,10,12,16] or [16,18,20,24];
  pick ONE of 7 patterns: petal|scallop|circles|spikes|leaf|dots|lattice;
  emit k shapes radially at angle j/k*2π
center: 2 circles
```

**Weaknesses:** purely rotational (no mirror/wedge symmetry); only 7 crude motifs; complexity changes *only* ring count + stroke; no motif library, no sub-rings, no center medallion variety, no outer border, no density/negative-space control; `rand()` consumed in a fixed order so pattern selection correlates with ring index.

### A.1 Proposed approach

Introduce a **wedge-based, symmetry-first mandala model** with a motif library, while keeping the existing `(seed, complexity)` signature working.

### Task A1 — Motif library
- Create: `src/engine/generation/mandala/motifs.ts`
- Each motif is a pure function `(innerR, outerR, halfWidthRad, ...opts) => string` (SVG path/primitive group) drawn for **one wedge**, plus a `mirrored: boolean` flag.
- Motifs (≥12): `petal, trefoil, arch, teardrop, diamond, chevron, fan, scale, dot-cluster, ring-shell, sunburst, lattice, rope, wheat`.
- Test: each motif returns non-empty, well-formed SVG within the wedge's radial band.

### Task A2 — Symmetry engine
- Create: `src/engine/generation/mandala/symmetry.ts`
- `renderWedge(output, symmetryN, { mirrored })`: replicate one authored wedge `symmetryN` times by rotation; when `mirrored`, reflect the wedge first (`transform="scale(-1,1)"` about the axis) for true dihedral symmetry.
- Test: `symmetryN` shapes land at exactly `j*2π/N`; mirrored output is symmetric about the axis.

### Task A3 — Ring/medallion composer
- Create: `src/engine/generation/mandala/compose.ts`
- `composeMandala(spec, rand): string` where
  ```ts
  interface MandalaSpec {
    detail: 'simple'|'medium'|'detailed'|'intricate';
    symmetry: 6|8|10|12|16|18|20|24;
    rings: number;                 // derived from detail, overridable
    motifDensity: number;          // 0.6–1.4
    center: 'rosette'|'sunburst'|'star'|'lotus'|'void';
    border: 'none'|'rope'|'ring'|'scallop';
    lineStyle: 'even'|'tapered';
  }
  ```
- Detail maps to: ring count (3/5/7/10), allowed motifs, `symmetry` range, presence of sub-rings (each ring may split into 2 sub-bands), and border/center elaboration.
- Emit `<defs>` + `<use>` for repeated motifs to keep SVG size sane (currently every shape is inlined; a 24-symmetry × 10-ring detailed mandala would bloat).
- Backward-compat: `mandalaSvg(seed, complexity)` delegates to `composeMandala` with a spec derived from the 3 legacy levels.

### Task A4 — Wire into the product type
- Modify: `src/engine/producttypes/activity.ts` (`MandalaParams`, `generateArtwork`, `consistencyChecks`)
- Extend `MandalaParams` additively:
  ```ts
  detail: z.enum(['simple','medium','detailed','intricate']).default('medium'),
  symmetry: z.union([z.literal('auto'), z.number().int().min(6).max(24)]).default('auto'),
  motifSet: z.enum(['classic','botanical','geometric','celestial']).default('classic'),
  ```
  Keep `complexity` for backward compatibility (map to `detail`).
- Add `variationAxes: ['detail','symmetry','motifSet','seed','paper']`.
- Provenance: bump generator tag to `procedural-mandala@2` and record `{detail, symmetry, motifSet}`.

### Task A5 — QA additions (plugin-level, `consistencyChecks`)
- `mandala_viewbox`: every shape stays within `0..1000`.
- `mandala_min_stroke`: stroke width ≥ print-legible threshold for the paper size.
- `mandala_density`: count of path segments per page within a sane band (catch illegible over-packing).
- Reuse the existing line-art heuristic concept (`qa.lineArtMaxMidtoneRatio`).

### Task A6 — Tests
- Modify: `tests/producttypes.test.ts`
- Assert: determinism per seed; symmetry N produces N-fold placement; every detail level renders a valid PDF; `@2` provenance present; density check passes for `intricate`.

---

## PART 3 — WORKSTREAM B: Geometric pattern art section

**Decision (recommended):** a new **category** `Geometric Patterns` + a new **product type** `geometric-pattern-art` (family `printable`, `artwork: 'procedural'`), backed by a new generator module `src/engine/generation/patterns.ts`. Optionally split into 2–3 types later (`tessellation-coloring`, `op-art-lines`) once the engine is proven.

**Rationale:** the pipeline, QA, packaging, approval, and export are type-agnostic. One well-built engine + one plugin ships the section; more types are then ~30 lines each.

### Task B1 — Pattern engine core
- Create: `src/engine/generation/patterns.ts`
- Shared contract: `(seed: number, opts: PatternOptions, tokens) => string` (SVG). All deterministic via `seededRandom`. All pure black-on-white line art for coloring/print, honouring `tokens.palette.ink` and `grayscale`.

### Task B2 — Pattern families (each a seed-stable generator)
- `tessellate`: triangular / hexagonal / pinwheel / rhombille tiling with per-tile motif.
- `girih`: Islamic star-and-cross (octagon + 8-point star) — pure geometry, high commercial value.
- `opart`: concentric / wavy line fields, moiré-style banding (visible in grayscale).
- `truchet`: random quarter-arc tiles forming flowing curves.
- `guilloche`/`spirograph`: parametric Lissajous/rose curves.
- `fractal`: Sierpinski triangle, space-filling Hilbert curve.
- `lace`/`scallop` lattice and `herringbone`/`chevron` fills.
- Each: `deterministic`, bounded iterations, capped element count (SVG size guard).

### Task B3 — Product type plugin
- Create: `src/engine/producttypes/patterns.ts`
- `params`: `{ pages, family: enum(...), density: 'light'|'medium'|'dense', invert: boolean, cover: boolean, symmetry?: number }`
- `contentSchema`: `{ coverSubtitle, pageTitles }` (deterministic names, like mandala — no AI needed).
- `generateArtwork`: one SVG per page (`deliverable`), seed `ctx.seed + i*<prime>`.
- `render`: cover + one full-bleed art page per SVG (mirror `mandalaColoring.render`).
- `consistencyChecks`: `artwork_count`, `pattern_valid` (SVG parses, within viewBox), `pattern_density`.
- `listingHints`: keywords (`geometric pattern`, `adult coloring pages`, `pattern art print`, `geometric wall art`, `tessellation coloring`), included files (PDF + SVG set).
- `variationAxes`: `['family','density','seed','paper']`.

### Task B4 — Registration & touch points (all verified from code)
1. `src/engine/producttypes/registry.ts` — add import + entry in `ALL` (line 10–13).
2. `src/config/settings.ts` — add `'geometric-pattern-art'` to `DEFAULT_PRICES` (line 26) — **required**, else it silently prices at 499¢ (I-8).
3. `src/engine/templates/library.ts` — add `'Geometric Patterns'` to `BUILTIN_CATEGORIES` (line 132) (I-7).
4. No `web/` change — UI is registry-driven (verified).
5. `tests/producttypes.test.ts` — the `for (const def of productTypes()…)` loop picks it up automatically (line 39).

### Task B5 — Docs
- Update `docs/PRODUCT_SPEC.md` §3 table (add both new types) and §7 MCR list.
- Update `README.md` "What it does today" table.

---

## PART 4 — WORKSTREAM C: Ship path (today, honest)

| Task | What | Effort | Unblocks |
|---|---|---|---|
| C1 | **Fix test thrash (B-3):** give the renderer a unique `--user-data-dir` per browser instance; document "stop the app before `npm test`". | S | Trustworthy CI/test runs |
| C2 | **Refresh stale docs (I-1..I-4):** rewrite `HANDOFF.md` (or delete it and fold into README), update `ACCEPTANCE_REPORT.md` count 61→67. | S | Not shipping stale lies |
| C3 | **Portable package:** `scripts/package-portable.ts` → zip app + `node_modules` (or document `git clone + npm install`), + `docs/PORTABLE.md`. Answers HANDOFF §4. | M | Sending a copy to a friend |
| C4 | **Add `CONSTITUTION.md`** (the frozen/extension surface + amendment process) + a `npm run constitution-check` guard. | S | Safe future edits |
| C5 | **Optional Electron shell** (`desktop/`) for a real `.app` + double-click launch. | L | Native feel |
| C6 | Re-run `npm run samples` and the full suite after A/B land; refresh `verification-output`. | S | Evidence |

**External blockers stay blocked** (BL-1..BL-3) — they need real keys / API approval / build time, not code. None of them prevents *self-hosting and using* DAF today.

### Ship definition (today)
- **Ship = `main` is the working app, one-command start, docs match reality, portable copy defined, tests green.**
- **Not ship = live-AI verification, marketplace auto-publish, Electron.** Those are honestly labelled as not-implemented in the UI.

---

## Verification (every task)

```bash
npm run typecheck          # exit 0
npm test                   # expect 67+ pass, ~2 min, NO other DAF process running
npm run samples            # every producible type → ready, QA passed
```
Manual: open `http://127.0.0.1:4317` → New product → Coloring Pages → mandala (intricate) → preview → QA tab; New product → Geometric Patterns → each family → preview.

## Risks / tradeoffs / open questions

- **R-1 SVG size:** `<use>`/`<defs>` reuse is required or detailed mandalas bloat the PDF. Milestone: measure PDF page size before/after.
- **R-2 Density vs. legibility:** "more complex" must not mean "unprintable at A5". The density QA check is the guard; thresholds need tuning against real prints.
- **R-3 Grayscale:** op-art and dense line fields must remain legible in the ink-saver grayscale path (`applyAudienceAndPaper`).
- **Q-1 (needs Jack):** Should geometric patterns be **coloring line art**, **decor/wall-art prints**, or **both**? Affects QA profile and listing copy.
- **Q-2 (needs Jack):** One `geometric-pattern-art` type with a `family` param, or separate types per pattern family (better marketplace SEO, more plugins)?
- **Q-3 (needs Jack):** "Ship in full today" — self-use ship (C1–C4, ~half day) or includes portable/Electron (C3/C5)?
