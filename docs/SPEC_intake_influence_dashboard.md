# Spec: Intake sorting, using imports on a retry, influence from past work, honest dashboard

Status: DRAFT for owner review. Written 2026-11-12 from reading the code on `main` @ f5d9152.
Rules that apply to all of it (CONSTITUTION.md wins): nothing is approved/rejected/published by the app; AI only suggests, a person accepts; unknown stays blank; new migration numbers only (next is 020, never edit 001-019); smallest change per PR; branch `hermes/<topic>`, PR, owner merges.

Legend: [VERIFIED] = read in code/API today. [CLAIM] = owner's report, not yet reproduced. [OPEN] = needs an owner answer before building.

---

## 0. Correction to my earlier dashboard work (read first)

[VERIFIED] `GET /api/dashboard` returns only: counts, jobs, batches, providers, marketplaces, nextRun, recentRuns, cost30, worker. It has NO `research` and NO `analytics` key.
So the two cards I added to `web/src/pages/Dashboard.tsx` ("Ideas to try", "Recent traction") read fields that do not exist and always show their empty state. I reported them as done; they are not. Also the rule "an idea clears only after made + passed + approved + in the packaging queue" is not implemented anywhere. Section 4 fixes this properly. The renamed stat tiles and the collapsible sidebar are real.

---

## 1. Sorting incoming uploads (any page)

### Current behaviour
- [VERIFIED] `web/src/imageCatcher.tsx`: a picture dropped on any page calls `importPictures(items, {})`, so it lands with no tags, in the Imports "To sort" pile. Nothing looks at it.
- [VERIFIED] Sorting today = hand-typed tags (`Imports.tsx` TagInput/BulkTagger). No classification of any kind. Server dedupes exact duplicates by hash only (`importReferenceImage`).
- [VERIFIED] The catcher accepts pictures only. A dropped `.txt`/`.md`/`.csv`, or dropped text, gets "No picture found". Text examples can only be added by typing/pasting on the Imports page.
- [VERIFIED] Already on the owner's parked list: "AI tag suggestions on imports". This spec un-parks it.

### Wanted
1. Every drop, from any page, goes to an **Inbox** with a visible count in the left menu and a toast "N added, Sort now".
2. A **sorter** proposes: tags, subject/theme, style, aspect (portrait/landscape/square), and "looks like" product type (coloring page, planner page, pattern, text).
3. DECIDED by owner 2026-11-12: nothing is auto-applied. Suggestions arrive **pre-filled in the edit boxes** (tags, theme, style, product type) as pending chips, visually distinct from saved ones. The owner ticks/removes chips and presses Save; only then is anything written. Unsaved suggestions stay open in the Inbox.
4. Text drops (files or pasted) are accepted app-wide and sorted into a field (title / description / tags / page_text / other).

### Design
Pass A, deterministic, free, always on:
- Tokens from filename, `sourceTool`, prompt text, `notes` ("Imported from <url>") matched against the existing tag vocabulary (`listTags`) and theme/category/audience names.
- Aspect from `width_px`/`height_px`. Near-duplicate hint (perceptual hash) beyond the existing exact-hash check.
- Text: line count, length, comma density -> field guess (comma list = tags, short single lines = titles, long paragraph = description/page_text).
- Each suggestion carries a confidence 0-1, used only to order and shade the chips, never to apply anything. No auto-apply threshold setting is needed.

Pass B, optional, AI vision, suggestion only:
- Reuse the picture-reading AI (NVIDIA `meta/llama-3.2-90b-vision-instruct`; proven to answer in the 2026-11-11 live test). Counts against the daily AI limit in Settings. Skipped with a visible reason when no key/limit hit. Never blocks the import.

Data (migration `020_intake_sorting.sql`): add to `reference_items`: `sort_status TEXT CHECK IN ('inbox','sorted','skipped') DEFAULT 'inbox'`, `sort_confidence REAL`. New table `reference_suggestions(id, reference_id, kind {tag,theme,style,product_type,field}, value, confidence, source {rule,ai}, state {open,accepted,dismissed}, created_at)`. Existing rows backfill to `sorted` if they have tags, else `inbox`.

API: `GET /api/references/inbox`, `POST /api/references/:id/suggestions/:sid/{accept,dismiss}`, `POST /api/references/sort` (run Pass A/B on given ids), `POST /api/references/texts/file`.
UI: Inbox view on Imports (accept-all / accept-one / dismiss, keyboard friendly), menu badge, catcher toast with link.

### Acceptance
- Drop 5 images with mixed filenames on the Dashboard page -> inbox shows 5 with suggestions in under 2 s with no AI key configured.
- Drop a `.txt` of 30 lines on any page -> 30 text examples, field guessed, all in Inbox.
- Opening an inbox item's edit box shows the suggested tags/theme/style already filled in as pending chips; nothing is stored until Save. Saving writes tags via the existing `tagReferences` (so the 20-tag cap and normalisation still apply).
- Zero rows are written to `reference_tags` by the sorter itself (test: run the sorter, assert tag table unchanged).
- No suggestion is created for an item already `sorted` unless asked.
- Tests: rule sorter table tests; catcher accepts text; migration test; AI pass skipped cleanly when unconfigured.

---

## 1b. Reviewing each import, adding notes, and letting those signals shape what gets made

### Current behaviour
- [VERIFIED] The image library can show one preview at a time, inline, by toggling a row (`Imports.tsx` ImageLibrary `preview` state). There is no way to step through pictures one by one (no next/previous, no large view, no keyboard).
- [VERIFIED] The data already has a per-item `notes` column (`reference_items.notes`, 2000 chars) and `PATCH /api/references/:id` accepts `notes` and `label`. The UI never offers it: `EditItem` only edits "Made with", prompt and tags. Worse, the importer writes `Imported from <url>` into that same `notes` field (`imageImport.ts:148`), so a note box would collide with provenance. [VERIFIED]
- [VERIFIED] **Nothing about an import reaches the AI that makes products.** `generation/service.ts:76` builds the prompt from `learningBrief` + `styleExamplesBrief`, and `styleExamplesBrief` reads only `kind = 'text'` rows marked "use as example" (`references/examples.ts:35`). Live: 514 images, 0 text, so this brief is empty today. An image's tags, prompt, "made with" and notes are never sent anywhere. Images only matter when the owner turns them into an `imported-coloring` product, where the picture itself is printed.

### Wanted
1. A **Review** mode on Imports: a large single-image view with Previous/Next (arrow keys), the tags/theme/style pre-filled boxes from section 1, and a notes box. Optional "Inbox only" so a full pass over new drops is quick.
2. Per-image **notes** that I write, kept separate from provenance, with a simple signal: `like` (more like this), `avoid` (never like this), or neutral. Notes are append-only with timestamps, same shape as `review_notes`, so earlier thinking is not lost.
3. Those signals feed **future generation**: text and listing AI see relevant notes/likes/avoids; the retry panel (section 2) can attach specific images; the "ideas from my work" generator (section 3) reads them.

### Design
- Migration `021_import_review.sql`: `reference_notes(id, reference_id, signal {like,avoid,none}, notes, created_at)` (append-only; latest signal per image wins). Keep `reference_items.notes` as provenance only and show it read-only as "Where it came from".
- API: `GET/POST /api/references/:id/notes`; `GET /api/references?...&signal=like`.
- UI: Review view (route `/imports/review?...`, filters = group/tag/Inbox/signal), reuses `TagInput` and the suggestion chips from section 1; Save and Next in one key.
- New `referenceBrief(app, purpose, context)` in `src/engine/references/` appended in `generation/service.ts:76` next to the two existing briefs:
  - AI text calls cannot see pictures, so the brief carries words only: the owner's note, tags, "made with", prompt, and like/avoid. Hard size cap (like the 2000-char cap in `examples.ts`).
  - Selection is by relevance, never "everything": images explicitly attached to this version (section 2) first, then like/avoid items whose tags match the product's theme/category/audience, newest first, max N (N is a Settings value, left unset until the owner sets it).
  - `avoid` items render as "Avoid: ..." lines so the AI is told what not to repeat; likes as "Aim for the feel of: ...".
- Optional, on demand only (never bulk, 514 images would burn the daily AI limit): "Describe this picture" button using the picture-reading AI; the description is stored as a suggestion the owner edits and saves, so the AI never writes straight into notes.
- Audit-log every note (`audit()`), consistent with `notes.added`.

### Acceptance
- With 3 images given notes + signals, a stand-in-AI generation run for a matching theme shows those lines in the prompt trace; a non-matching theme does not (relevance test); with no notes the prompt is byte-identical to today (regression).
- Review view: Right-arrow moves to the next picture, Save keeps position, 100 images can be reviewed without the page reloading images already seen (thumbnails, full size loaded one at a time as today).
- Provenance (`Imported from ...`) is never overwritten by a note save.

---

## 2. Using imports and my answers on the item being retried

### Current behaviour
- [VERIFIED] Imports can only become a NEW product: `POST /api/references/products` -> `createProductFromReferences` (type `imported-coloring`). There is no way to attach an import to an existing product, a rework item, or a retry.
- [VERIFIED] Text examples are global: up to 8 newest rows, fields chosen by AI-call purpose (`examples.ts`). Per-item selection does not exist.
- [VERIFIED] Rework page holds my notes (`review_notes`), boxes, decisions (`rejected | revision_requested | regenerate_requested`). `createVersion` (specification/service.ts:123) stores `revision_notes` and `change_note` on the new version.
- [VERIFIED] My notes reach the AI only through `learningBrief` (last 12 decisions + up to 15 lessons), appended to EVERY AI call. Not targeted at the item being retried.
- [CLAIM] "no way to take those imports and my answers to change the retried item" is consistent with all of the above. Not yet traced: exactly how `regenerate_requested` builds its prompt from `revision_notes`. Read `src/jobs/pipeline.ts` and `src/jobs/handlers.ts` first.

### Wanted
DECIDED by owner 2026-11-12: "retried item" means BOTH the Rework page (rejected / revision requested / regenerate requested) AND failed production jobs.
On any Rework or failed item, a **"Retry with..."** panel where I:
1. Tick imports (images and text) to use as references for this retry only.
2. Answer a short set of questions about what to change (keep / change / avoid), plus the existing free note and boxes.
3. Press Retry and get a NEW version (existing version rules: old version superseded, approvals invalidated) whose generation is conditioned on exactly those references and answers.

### Design
- Table `version_references(version_id, reference_id, role {style,subject,avoid})` (migration 021 or same as 020 if shipped together).
- Per-version brief: a new `itemBrief(app, versionId)` in `src/engine/generation/` combining (a) ticked references (image notes/prompt/tags; text bodies, clipped like `examples.ts`), (b) my answers, (c) the version's own notes/boxes. Appended AFTER the global `learningBrief`, so item-specific instructions win. Hard size cap like the other briefs.
- For image-based product types, referenced images feed the existing `imported` artwork path rather than only text.
- "Answers" are structured: three optional boxes per retry (Keep / Change / Avoid) stored with the version, shown on the product page and fed to the lessons digest.
- AI note check (`submitWithReason`) still gates refusals exactly as today. Arcade locked rules unchanged (rejection needs 2+ sentence reason; Delete is never a rejection).
- Two paths share one panel and one table [VERIFIED mechanics, design is mine]:
  - Rejected / revise / regenerate: a new version is made through `createVersion` (`specification/service.ts:123`), so references and answers attach to the NEW version.
  - Failed production job: `POST /api/versions/:id/retry` re-runs the failed job on the SAME version (`routes/products.ts:152`; QA failures are refused there and need a new version). So references and answers attach to that version first, then `retryJob` runs; the item brief reads from the version, so both paths work with the same code.
- [OPEN, not verified] Whether a re-run job actually re-reads the version's notes/brief at generation time, or uses content already stored. Read `src/jobs/pipeline.ts` and `handlers.ts` before building.

### Acceptance
- From Rework, tick 2 images + 1 text, fill Keep/Change/Avoid, Retry -> new version exists, `version_references` has 3 rows, generation run trace shows the item brief was sent (assert in a stand-in-AI test).
- Same retry without references behaves exactly as today (regression test).
- Old version stays visible, marked superseded.

---

## 3. Influence and ideas from recent work and uploads

### Current behaviour
- [VERIFIED] Research/opportunities are created manually, by CSV, or `ai_suggestion` (`opportunities.origin`). `refresh_recommendations` runs hourly (`main.ts`). Nothing reads recently made products, approvals, rejections or imports to propose new ideas.

### Wanted
A **"Ideas from my own work"** generator: looks at (a) recent approved/rejected products and my notes, (b) recent imports and their tags, (c) what is selling once there is traction data, and proposes new opportunities.

### Design
- New deterministic summariser `recentSignals(app, days)`: counts by theme/type/tag for made, approved, rejected, imported, packed. Pure SQL, no AI.
- Optional AI step (existing `structuredCall`, purpose `research:from-own-work`, labelled AI-origin): turns signals + tags + lessons into up to N opportunity candidates. They enter as `origin='ai_suggestion'`, `status='new'`, never auto-approved.
- Each candidate stores `origin_details` = which signals/imports backed it, so I can see why it was suggested.
- UI: a "From my recent work" button on Research and a card on the Dashboard. Dismiss writes `rejected` (kept, so it is not suggested again).
- Needs the same budget/pacing guard as every AI call.

### Acceptance
- With zero AI key: signals summary still renders; the generate button says why it is unavailable.
- With a key (stand-in in tests): candidates created as `new`, each with `origin_details` populated; re-running does not duplicate (dedupe on title+type).

---

## 3b. Building packs by hand from imported and made work

### Current behaviour (why it "won't let me")
- [VERIFIED live, 2026-11-12] 25 products exist; 0 are approved (13 sit at `ready`, i.e. awaiting review; 11 rejected/failed). The Build-a-pack picker shows only approved + QA-passed products (`web/src/pages/PackBuilder.tsx`, `eligible` filter), so right now it shows "Not enough approved products yet". Nothing is broken: it is empty by rule.
- [VERIFIED] The rule is deliberate and enforced in three places: `createBundle` (`engine/bundling/service.ts:18`, rejects non-approved / un-passed / un-accepted-warnings members), `eligibility()` and `cleared()` in `engine/packing/service.ts:91-110` (the "packaging gate"), and `settings.ts:372` ("Nothing unapproved passes the packaging gate").
- [VERIFIED] Imports can never be pack members: `bundle_items.member_product_id` points at products. The picker never queries `/references`. Live data: 514 imported images, 0 text examples. The only road from an import to a pack today is: Imports -> "Make coloring product" -> pipeline -> batch review -> approve -> pack.
- [VERIFIED] Packing floor carts also reject unapproved items (`POST /api/packing/carts/:id/items` goes through `eligibility`), and a cart holds products only.
- Also true: with 13 products stuck at `ready` and 38 Rework items, the real blocker today is that nothing has been approved yet.

### Wanted
Assemble a pack manually from BOTH finished products and imported pictures, and see everything that exists, not only what already passed the gate.

### Design (keeps the approval gate; moves it to where it matters)
1. **Draft packs.** A pack may be assembled from anything (any product status, any import). It is a draft: it cannot be sealed, listed or exported until every member satisfies the existing gate. The gate is not weakened, it just runs at seal time instead of at pick time. Picker rows show a status chip (approved / awaiting review / rejected / import) and a plain reason a row blocks sealing. [DECIDED by owner 2026-11-12: drafts are allowed. The owner said they had not realised what the old rule would do. This amends a locked rule; the exact Constitution wording is below and goes in the build PR.]
2. **Imports as members.** In the picker, a second tab "Imported pictures" (tag filter + the Inbox from section 1). Picking an import offers "Make it a product now": runs the existing `createProductFromReferences` path (type `imported-coloring`) and adds the new product to the draft. It still needs review and approval before the pack can seal. No new product type, no bypass.
3. **One-click from Imports.** Tick imports on the Imports page -> "Add to a pack" (new draft or an existing one).
4. **Visibility.** Draft packs listed on the Packing floor with a "needs N more approvals" line linking straight to those items in Batch approval, so the path to sealing is one click, not a mystery.
5. **Storage: drafts are NOT carts.** [VERIFIED] `pruneUncleared` (`engine/packing/service.ts:418-435`) runs every time the Factory floor loads (`floor()` calls it first) and deletes every non-approved item from open carts and the backlog. A draft kept as a cart would be silently emptied on the next page view. `sealCart` (line 243) also drops ineligible items. And the conveyor feeds carts automatically on approval. So carts stay exactly as they are (approved-only, automatic, pruned), and drafts live in their own tables: migration `022_pack_drafts.sql` -> `pack_drafts(id, name, pitch, note, marketplaces, created_at, updated_at, sealed_bundle_id)` and `pack_draft_items(draft_id, position, product_id NULL, reference_id NULL, added_at)` with a CHECK that at least one of the two ids is set. When an import is promoted to a product ("Make it a product now"), `product_id` is filled in and `reference_id` is kept for provenance.
6. **Sealing a draft** = new `sealDraft()`: for every member run the existing `eligibility()` (same messages as today), refuse with the list of blockers if any fail, otherwise call `createBundle` (`bundling/service.ts:18`, which re-checks approval, QA and warnings, so the gate cannot be bypassed even by a bug in the draft code), mark the draft sealed and link `sealed_bundle_id`. Readiness is derived live from current product state, never stored, so approving an item in Batch approval flips the draft row to "ready" with no extra step.
7. **Everything downstream is untouched:** a draft is not a bundle and not a cart, so it never reaches QA, listing, export, the pack pool, FINALIZE PACK, the 15-item pack bonus, or the arcade packs view (`arcade/packs.ts` reads open carts and bundle products only). Only a sealed draft becomes a bundle product and enters that existing path.
8. **Constitution amendment (to apply in the build PR, not before).** `CONSTITUTION.md` line ~176 currently says: "Packs, carts and bundles take **approved** products only. Products waiting in carts or the backlog that aren't approved get taken out, and come back once approved." Proposed replacement: "Sealed packs (bundles) and automatic carts take **approved** products only; unapproved products are taken out of carts and the backlog and come back once approved. The owner may also assemble a **draft pack** by hand from any product or imported picture; a draft cannot be sealed, listed, exported or counted until every member is approved and has passed QA, and sealing re-runs that check." I have NOT edited the Constitution: it describes what the app does today, and nothing supports drafts yet.

### Acceptance
- With 0 approved products, the picker still lists all 25 products and 514 imports, each with a status chip; the Create button is disabled with the reason "N members not approved yet".
- Picking an import and pressing "Make it a product now" creates a product in batch review and adds it to the draft.
- Sealing a draft that contains any non-approved member is refused server-side with the existing messages (test: attempt via API with a `ready` member -> 422).
- Existing behaviour unchanged for all-approved selections (regression test on `createBundle`).
- Regression: `pruneUncleared` still removes non-approved items from carts and the backlog, and does not touch draft items (test both).
- Loading the Factory floor or Build-a-pack with a draft containing 3 unapproved members leaves the draft intact.
- A draft never appears in the arcade packs view or pool and never earns the pack bonus until sealed, built, approved and finalized.
- Approving the last unapproved member in Batch approval makes the draft's Seal button enable without a reload of the draft itself.

---

## 4. Dashboard: real numbers, untried list, traction

### Honest state
[VERIFIED live numbers today: products 22, awaiting review 13, approved 0, qa failed 3, open opportunities 3, packing backlog 0, rework 38.] The stat tiles are real. Traction data does not exist yet (no published sales; Etsy keys unused; Gumroad not confirmed live).

### 4a. Pipeline tiles (already shipped, extend)
Add: denied/rejected count (from `approval_decisions`), and a 7/30-day made-vs-approved line. Source every number from SQL in `/api/dashboard`; never compute in the browser.

### 4b. "Untried ideas" (the rule you stated)
An idea leaves the list only when ALL are true for a product built from it (`products.opportunity_id`):
1. made (a version exists), AND 2. QA passed, AND 3. current version `approved`, AND 4. it is in the packaging queue.
Implement as a derived query, not a manual status flag, so it cannot drift. Everything else stays listed with its furthest stage shown (untried / made / failed QA / awaiting review / approved / not packed).
- DECIDED by owner 2026-11-12: "packaging queue" = what is available on the pack-building / listing page, i.e. the Packing floor (open carts, backlog, built packs) and the Build-a-pack picker. My reading, to confirm in review: a product counts as "in the queue" when it is approved + QA-passed + warnings cleared (the same gate that fills that page) AND it sits in an open cart, the backlog, or a built pack. [VERIFIED] approval feeds the packer automatically: `approval/service.ts:113` calls `onProductFinished`, which places the product (`feedProduct`) when the packing setting `autoFeed` is on (`packing/service.ts:450-457`). So with `autoFeed` on, "approved" and "in queue" happen together; with it off, the idea stays listed until the owner packs it. Implement as the derived query over `pack_cart_items`, `packing_backlog`, `bundle_items`.
- Add `research` block to `/api/dashboard` (top untried + stage). Update `Dashboard.tsx` to match.

### 4c. Traction
- Show only what exists: views/sales/revenue from analytics once recorded; until then the card says "No sales data recorded yet" rather than a fake zero. Add `analytics.recent` to `/api/dashboard` from `engine/analytics/service.ts`.

### 4d. Eye strain
- Offer 2-3 themes (softer dark, warm low-contrast, true light) with a toggle in Settings; do not touch the arcade (always dark, locked). Contrast must stay WCAG AA. [OPEN] pick direction after seeing screenshots.

### 4e. Sidebar toggle
- Make the collapse button larger and higher contrast (you asked; my earlier turn did not complete this). 36-40px target, accent border, label on hover.

### Acceptance
- `/api/dashboard` includes `research` and `analytics`; a test seeds an opportunity through each stage and asserts it leaves the untried list only at stage 4.
- Dashboard shows no card whose data key is missing from the API (add a typecheck-level shared type for the response).

---

## 5. Suggested build order (smallest useful first)
1. 4e + 4b/4c API fix (removes the misleading cards). Packaging-queue meaning is now decided (see 4b).
2. Section 1 Pass A + Inbox with pre-filled suggestion boxes (the pain you hit first).
3. Section 1b Review view + notes (UI and API are cheap; data already half-exists). Feeding notes into generation (`referenceBrief`) is a second, separate PR.
4. Section 2 "Retry with..." for Rework AND failed jobs (biggest value, biggest change; read `pipeline.ts` first).
5. Section 3b draft packs (decided; includes the Constitution amendment in 3b item 8).
6. Section 3 generator.
7. Section 1 Pass B (AI vision) and 4d themes.

Note: the biggest practical unblocker is not code. 13 products are waiting in Batch approval and nothing is approved, so packs, the untried-ideas rule and the "approved" tile are all empty for that one reason.

Migration plan (highest existing is 019): 020 intake sorting, 021 import review notes + version_references, 022 draft packs. Re-list `src/db/migrations` before building; another branch may have taken a number.

## 6. Decided and still open
Decided by owner 2026-11-12: (a) "retried item" = Rework page AND failed jobs; (b) "packaging queue" = what is available on the pack-building/listing page; (c) sorting is suggest-only, pre-filled into the boxes for the owner to select; (d) packs may be assembled as DRAFTS from unapproved products and unconverted imports, with the approval gate enforced at seal time (section 3b).

Still open:
1. Retry answers: are Keep / Change / Avoid the right three boxes, or something else?
2. Should "ideas from my work" run on a schedule, or only when you press the button?
3. Import notes: is like / avoid / neutral the right signal set, or do you want ratings or free tags only?
4. How many import notes may flow into one AI call (the cap N in section 1b)? Left unset on purpose.

## 7. Not verified / not done
- How `regenerate_requested` and a re-run failed job consume `revision_notes` and stored content in the pipeline: not read.
- [VERIFIED live 2026-11-12] `packing.autoFeed` is `true` in Settings, so approval places a product in a cart or the backlog right away; an approved idea leaves the untried list as soon as it is approved (given QA passed).
- `engine/packing/service.ts` read at lines 85-215 and 243-303 and 404-461. Tests covering `pruneUncleared`/`sealCart` were not read; list them with `grep -rn "pruneUncleared\|sealCart" tests/` before changing anything near them.
- The 4 uncommitted modified files in the working tree (bootstrap.ts, context.ts, settings.ts, providers.ts: the local image provider work) are unrelated and not part of this spec.
- Nothing in this document has been built or tested.
