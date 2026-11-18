# Discrepancies and recommendations

Places where the documentation, the code or the interface disagree, found while building the manual (2026-11-17). **Nothing in the app was changed.** Items marked **Fixed in this pull request** are documentation corrections. Items marked **Open** are recommendations for you: the manual documents the app as it is.

Severity: **High** can mislead you into a failed or wrong product. **Medium** wastes time. **Low** is cosmetic.

## A. Existing documentation

| # | Where | What was wrong | Sev | Status |
| --- | --- | --- | --- | --- |
| A1 | README.md | Said 19 product types (code: 21) | Medium | **Fixed in this pull request** |
| A2 | README.md | Listed 6 text providers and "images: OpenAI only" (code: 10 and 10) | Medium | **Fixed in this pull request** |
| A3 | GETTING_STARTED.md | Said "Groq (start here)"; your setup is NVIDIA first | Medium | **Fixed in this pull request** (NVIDIA first, Groq a late backup) |
| A4 | GETTING_STARTED.md and `src/config/settings.ts` (about line 412) | A personal Gmail address is written in as the digest's default recipient | Medium | **Open.** Your call: remove it from both. It is a privacy point and part of it is code, so it was not changed. The manual never repeats it. |
| A5 | PRODUCT_SPEC.md | Output formats wrong in places | Low | **Fixed in this pull request** (historical banner added with the correct details) |
| A6 | Walkthrough, Students chapter | Lists 5 Students presets; there are 9 (24 presets in total) | Low | **Open.** You asked that `WALKTHROUGH.md` stay untouched (the in-app help and Missions read its headings), so it was not edited. Update the line when the Walkthrough is next changed. |
| A7 | **Walkthrough, Dashboard chapter** | Lists tiles "Active products, Awaiting review, Published (recorded manually), Published (verified), Failed or QA-failed, Open opportunities" and an Integrations description. The live screen shows **Total products, In production, Pending review, Approved, Published, Failed/Rejected, In packaging queue, Untried ideas**, plus **Ideas to try** and **Recent traction** cards. | Medium | **Open**, same reason as A6. The manual's Dashboard chapter has the correct list. |
| A8 | Walkthrough, arcade part | The Task Workspace, QA Review, Bin, Packs, Leaderboards, Codex and B.M.O. get one paragraph and no screenshots | Medium | **Fixed**: covered by the manual's six arcade chapters with live screenshots |

## B. Constitution wording

| # | Where | What was wrong | Status |
| --- | --- | --- | --- |
| B1 | Article 8, "Working" | Said all 21 product types produce offline | **Fixed, as you approved.** Reworded: every type except illustrated coloring works offline, imported coloring needs your pictures, bundles need approved products. Amendment-log row added. Article 7 now lists `docs/manual/`. |

## C. The app behaves differently from what a screen or guide implies

| # | Where | What happens | Sev | Recommendation (not built) |
| --- | --- | --- | --- | --- |
| C1 | New product form, daily planner | The form shows **Dated** but has no **Start date**. A dated planner from the form fails QA with `dated_requires_start`. **Confirmed live.** The QA-failed banner's advice ("Edit content or Change design") does not fix it. | **High** | Show the start date field when Dated is ticked. Until then the manual says: leave Dated off, or make a variation. |
| C2 | New product form | Optional settings with no default are not drawn. **Confirmed live:** assignment-tracker Subjects, reading-log Goal, word-search Topic, cleaning-schedule Rooms ("This product type has no settings"), home-inventory Rooms. The old Walkthrough documents some as form fields. | **High** | Draw optional settings too. |
| C3 | Illustrated coloring | The banner and the README say it fails without an OpenAI key. The default backup chain includes keyless Pollinations, and the live Dashboard's Image AI row showed **"Pollinations · flux (backup for OpenAI)"** with no keys. So it would try an outside service. Whether the result is usable is unknown. | Medium | Test deliberately before relying on it. Not run here. |
| C4 | Illustrated coloring, offline | Only 6 built-in scenes per theme; more than 6 pages should fail the picture-count check. From the code; not run. | Medium | Confirm live when an image provider is tested. |
| C5 | Arcade Codex | Says to set XP in "Settings → arcade → xp", but that tab only sets test credits. XP, bonus, failsafe and low-credit values have no screen. | Medium | Build the screen when the numbers are decided. |
| C6 | "? Instructions" | Once the Student product types mission unlocks, the button on the Library and product pages opens that chapter instead of "Product library" | Low | Small app fix. |
| C7 | Settings → Generation | The image-provider picker omits `local` and `openrouter`, which the code supports | Low | Match the picker to the code. |
| C8 | Settings → AI providers | Replicate and fal are labelled free in one place and treated as paid backups in another | Low | The manual calls them paid. |
| C9 | Settings | Gumroad switches appear in Marketplaces and in Integrations; the Gumroad error says Marketplaces, the Publishing page says Integrations | Low | Document both places (done). |
| C10 | Marketplace accounts | Only `export_only` is ever set | Low | Document as export-only (done). |
| C11 | Arcade | An unreachable "SOON" tab path exists; STATS opens back-office Analytics | Low | Marked PLANNED. |
| C12 | Templates | Page title "Template library", sidebar "Templates" | Low | Noted in the chapter. |
| C13 | Image provider default | First choice is OpenAI (paid). With no OpenAI key it falls through Gemini, Together, Hugging Face, Pollinations | Medium | Documented in Providers. |
| C14 | Rejecting with no AI key | A **Reject** or **Return for revision** note cannot be checked, so it waits in a queue and the rejection is **not recorded** ("Nothing has changed yet"). Regenerate with a blank note works. **Confirmed live.** | **High** | Consider allowing a clearly specific note to pass the check offline, or saying so on the button. Documented in the Batch approval chapter. |
| C15 | Approval through the API | Approving with an empty marketplace list approved every listing. The screen prevents this (Approve is disabled until a marketplace is ticked). | Low | Make the API refuse an empty list. |
| C16 | Etsy tags | A tag longer than 20 characters is silently dropped from the listing and noted only in QA ("Dropped tag longer than 20 characters"). | Low | Warn in the listing editor. |
| C17 | Imported products | A listing-spelling warning appeared for the word "artwork" (the machine's dictionary lacked it) | Low | Add the word to Settings → QA → spelling allowlist. |

## D. Safety and data

| # | Where | What is wrong | Sev | Recommendation |
| --- | --- | --- | --- | --- |
| D1 | `data/backups` | The newest full backup holds 21 products; the database held 35. Backups are manual only. There is no off-Mac copy. | **High** | `npm run backup` now and weekly; copy `data/backups` off the Mac. A scheduled backup is your call. |
| D2 | `daf-test-agent.ts` | A developer provider tester reading keys from `.env` under generic names. The app itself uses the Keychain. | Low | Not part of normal use; not described in the manual. |

## E. The twelve practice briefs

None exists as a product, so all twelve are practice exercises, each with a "what Foundry can and cannot do here" box in [the practice briefs page](../D-lessons/00-the-twelve-practice-briefs.md), as you asked. Briefs the app cannot deliver as written: the **90-Day Academic Goal Planner** (no 90-day setting) and **Home Inventory and Emergency Reference** (no emergency pages). **Semester** briefs have no semester setting. The **Space Rescue** maze and **Celestial** mandala themes do not change the drawings.

## F. Sandbox note (not an app issue)
While checking live, the Claude Code sandbox blocked opening a local port, so the throwaway app was started outside it, with a temporary data folder and no keys. Setting `sandbox.network.allowLocalBinding: true` in Claude Code's settings would allow this without leaving the sandbox in future.
