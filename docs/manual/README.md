# Asset Foundry operating manual

This is the owner's working manual for Asset Foundry: how to use it, what each screen is for, how each kind of product is made, and what to do when something goes wrong.

**Status:** complete first edition, written 2026-11-17 against `main` (merge of PR #55). Every chapter ends with a **Verification** line saying what was checked in a running app, what was read only from the code, and what was never run. Read those lines before trusting a detail.

## The three names you will see

- **Asset Foundry** (short: Foundry) is the whole suite.
- **The factory** (Digital Asset Factory, DAF) is the engine: it makes products, checks them, packs them, writes listings and handles approval and publishing. The back-office screens in the left sidebar belong to it.
- **HAPPY DAFFY** is the arcade game at `/arcade`, a second front end on the same factory. It does not replace the back office.

The canonical record of names and rules is [CONSTITUTION.md](../../CONSTITUTION.md). If anything here disagrees with it, the Constitution wins.

## How every claim is labelled

| Label | Meaning |
| --- | --- |
| VERIFIED | Checked against the code, and where it matters in a running copy of the app. |
| PARTIALLY VERIFIED | Some of it was checked. The chapter says what was not. |
| NOT VERIFIED | Written from the code only. Not yet seen working. |
| PLANNED | Designed or promised, but not built. |
| NOT CURRENTLY SUPPORTED | The app cannot do this today. |
| NEEDS OWNER CLARIFICATION | The code, the docs and your intent disagree, and you decide. |

## Start here

1. [What Asset Foundry is](A-start-here/01-what-is-asset-foundry.md)
2. [First run and navigation](A-start-here/02-first-run-and-navigation.md)
3. [Your first product](A-start-here/03-your-first-product.md): a mandala pack that needs no AI key

## Part B: every screen

Each chapter uses the same twelve parts: what it is, why it exists, when to use it, before you begin, the interface, steps, expected results, an example, common mistakes, troubleshooting, what comes next, a completion checklist.

| Group | Chapters |
| --- | --- |
| Overview | [Dashboard](B-screens/01-dashboard.md) · [Production calendar](B-screens/02-production-calendar.md) |
| Make | [Research digest](B-screens/03-research-digest.md) · [Research & opportunities](B-screens/04-research-and-opportunities.md) (opportunity details, research data, scoring) · [Product library](B-screens/05-product-library.md) (New product, Build a pack) · [Product page](B-screens/06-product-page.md) · [Imports](B-screens/07-imports.md) · [Factory floor](B-screens/08-factory-floor.md) · [Templates](B-screens/09-templates.md) · [Production jobs](B-screens/10-production-jobs.md) · [QA results](B-screens/11-qa-results.md) |
| Sell | [Batch approval](B-screens/12-batch-approval.md) (batch review, hold, warning gate) · [Rework](B-screens/13-rework.md) · [Notes for the AI](B-screens/14-notes-for-the-ai.md) · [Marketplace listings](B-screens/15-marketplace-listings.md) · [Publishing status](B-screens/16-publishing-status.md) · [Analytics](B-screens/17-analytics.md) |
| System | [Settings & integrations](B-screens/18-settings-and-integrations.md) · [Missions](B-screens/19-missions.md) |
| HAPPY DAFFY | [Hub, characters and worlds](B-screens/arcade/01-hub-characters-and-worlds.md) · [World detail and Task Workspace](B-screens/arcade/02-world-detail-and-task-workspace.md) · [QA Review and Bin](B-screens/arcade/03-qa-review-and-bin.md) · [World Builder](B-screens/arcade/04-world-builder.md) · [Packs, Leaderboards and Codex](B-screens/arcade/05-packs-leaderboards-and-codex.md) · [B.M.O.](B-screens/arcade/06-bmo.md) |

**Your original screen list, mapped to what exists.** Opportunity Details is a pop-up and Research Data and Scoring are tabs inside Research & opportunities. New Product and Build a Pack are pop-ups inside the Product library. Character Selection and Worlds are zones of the arcade Hub. World Details, Task Workspace, QA Review and World Builder are arcade screens with no URL. "Tasks and Progress" is not a screen: progress shows on Hub cards, World detail, the Codex and the World Builder. Screens missing from your list that exist: Missions, QA Review, Bin, Packs, Leaderboards, Codex and B.M.O.

## Part C: product reference (all 21 types)

[Overview](C-product-reference/00-overview.md) (AI versus algorithm, defaults, presets) · [Activities and coloring](C-product-reference/01-activities-and-coloring.md) · [Dated planners](C-product-reference/02-dated-planners.md) · [Lists and trackers](C-product-reference/03-lists-and-trackers.md) · [School and study](C-product-reference/04-school-and-study.md) · [Money and documents](C-product-reference/05-money-and-documents.md) · [Bundle](C-product-reference/06-bundle.md)

## Part D: lessons

[The twelve practice briefs](D-lessons/00-the-twelve-practice-briefs.md) (what Foundry can and cannot do for each) then:
[1 Basic mandala](D-lessons/01-basic-mandala.md) · [2 A planner](D-lessons/02-create-a-planner.md) · [3 Import outside artwork](D-lessons/03-import-outside-artwork.md) · [4 Illustrated coloring](D-lessons/04-illustrated-coloring-pages.md) · [5 Maze](D-lessons/05-maze-activity.md) · [6 Word search](D-lessons/06-word-search.md) · [7 Run QA and fix a problem](D-lessons/07-run-qa-and-fix-a-problem.md) · [8 Rework](D-lessons/08-rework-an-existing-product.md) · [9 Bundle](D-lessons/09-build-a-bundle.md) · [10 Marketplace listing](D-lessons/10-prepare-a-marketplace-listing.md) · [11 Review a batch](D-lessons/11-review-and-approve-a-batch.md) · [12 Export or publish](D-lessons/12-export-or-publish.md) · [13 Analytics](D-lessons/13-review-analytics.md)

## Part E: reference and troubleshooting

[Glossary](E-reference/01-glossary.md) · [States](E-reference/02-states.md) · [QA checks](E-reference/03-qa-checks.md) · [AI providers and keys](E-reference/04-providers-and-keys.md) · [Files and formats](E-reference/05-files-and-formats.md) · [Publishing and marketplaces](E-reference/06-publishing-and-marketplaces.md) · [Errors and recovery](E-reference/07-errors-and-recovery.md) · [Backups and data safety](E-reference/08-backups-and-data-safety.md)

To search: use your editor's search across `docs/manual/` for a term, a message or a check name. Every term is in the glossary and every message in Errors and recovery.

## Older guides this manual builds on (kept as they are)

- [Walkthrough](../guide/WALKTHROUGH.md): every back-office screen and the arcade, button by button. The app's in-app **? Instructions** pop-up and Missions read this file, so it is not rewritten. **Two parts are out of date** and are listed in [Discrepancies](_status/DISCREPANCIES.md): the Dashboard tile names and the Students presets count.
- [What to check before you approve](../guide/CHECKING_PRODUCTS.md) and the [Prompt library](../guide/PROMPT_LIBRARY.md).
- [Getting started](../GETTING_STARTED.md), [Windows](../WINDOWS.md), [Public access](../PUBLIC_ACCESS.md), [Security and publishing](../SECURITY_AND_PUBLISHING.md).

## Working notes

- [VERIFICATION_LOG](_status/VERIFICATION_LOG.md): what was checked, how and when.
- [DISCREPANCIES](_status/DISCREPANCIES.md): where the docs, the code or the interface disagree, with a recommendation each. Nothing there has been changed in the app.
- [SCREENSHOTS](_status/SCREENSHOTS.md): which screenshots exist and how they were made.

## Rules this manual follows

- It documents the app as it is. It never changes the app, the database or the Constitution without your approval; the one Constitution change here (Article 8's "offline" claim) was yours.
- Screenshots come from a **throwaway copy** of the app with its own temporary data folder and sample data, never your real `data/`. Every product in them starts with "Sample".
- No API keys, tokens or personal email addresses appear in it.
- Before any step that spends AI credits, overwrites files, cancels an approval or publishes something, the chapter says so first.
- The twelve example briefs are practice exercises. None exists as a product yet.
