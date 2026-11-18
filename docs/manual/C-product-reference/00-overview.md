# Product reference: overview

**Verification:** the 21 types and every setting listed in this part were read from the code by loading the product-type registry (VERIFIED, code). The settings each form draws, and output files and QA lines for 17 of the types, were checked in the running throwaway copy (VERIFIED live, marked where used). The two AI-dependent kinds (illustrated coloring and AI-written text) were NOT run with real AI.

## How the reference is organised
One chapter per family, with a section for every type, all in the same order:

1. What it makes and who buys it
2. Settings (what each controls, range, default, whether it is required)
3. What the AI does, and what the app computes
4. Files produced
5. What to inspect before approving
6. Common problems and how to improve the result
7. Example configuration

| Chapter | Types |
| --- | --- |
| [Activities and coloring](01-activities-and-coloring.md) | Mandala coloring pages, Maze activity book, Word search puzzles, Illustrated coloring pages, Geometric pattern art, Coloring pages from your imports |
| [Dated planners](02-dated-planners.md) | Monthly calendar, Weekly planner, Daily planner |
| [Lists and trackers](03-lists-and-trackers.md) | Habit tracker, To-do / checklist, Cleaning schedule, Home inventory, Guided journal, Goal planner |
| [School and study](04-school-and-study.md) | Assignment tracker, Class timetable, Reading log |
| [Money and documents](05-money-and-documents.md) | Budget planner, Invoice template |
| [Bundle](06-bundle.md) | Bundle (a pack) |
| [Log sheets and forms](07-sheets-and-forms.md) | 29 kinds from the catalog expansion: Food & Cooking, small business (Finance & Business) and Health & Fitness |

## The three ways content is made
Not every type uses AI the same way. This is the most important thing to understand.

| Kind | Meaning | Types |
| --- | --- | --- |
| **Procedural (an algorithm draws it)** | Code produces the artwork from a *seed* (a number that makes the result repeatable). No AI, no cost, same settings plus same seed gives the same pictures. | Mandala, Maze, Geometric pattern art |
| **Text AI with an offline fallback** | An AI writes the words (prompts, habits, tips). With no working key, the built-in content library supplies them. Dates, times, grids and layout are *always* worked out by the app, never by the AI. | All planners, trackers, lists, journals, student types, budget, invoice, word search (word lists), bundle (blurbs) |
| **AI-drawn pictures** | An image AI draws the pictures. Needs an image provider. | Illustrated coloring pages |
| **Your own pictures** | You import the art; the app lays it on pages. | Coloring pages from your imports |

A **seed** also means a variation always looks different: "Make variation" gives the new product a new random seed, so procedural art changes.

**Offline limits.** The built-in library is finite. With no AI key, repetition appears when you ask for more pages than it holds (listed per type). With an AI key the same settings give fresh wording.

## What "required" means here
On the New product form **every setting has a default**, so none is required to press Create. A value is "required" only when the product cannot be made without it: a bundle's members, an imported product's pictures, a dated daily planner's start date. Settings with no default do not appear on the form at all (see the [form gaps](../B-screens/05-product-library.md#the-new-product-window)).

## Settings every type shares
Title, **Design system**, **Fonts**, **Audience**, **Theme**, **Paper size**, **Orientation**, **Ink-saver grayscale**, **License** (Personal, Classroom, Commercial), the three **brief fields**, the free **Brief**, **variations** and **Prepare listings for**. Changing the audience changes the tone, reading level and (offline) which built-in lists are used. The theme changes titles, subtitles, listing keywords and (offline) word lists, but never the shapes of mandalas, mazes or patterns.

## Default prices (Settings → Marketplaces, in cents)
Mandala 399 · Maze 349 · Word search 349 · Illustrated coloring 449 · Geometric pattern art 399 · Imported coloring 499 (fallback, no saved price) · Monthly calendar 499 · Weekly planner 599 · Daily planner 499 · Habit tracker 349 · To-do 299 · Cleaning schedule 349 · Home inventory 399 · Guided journal 599 · Goal planner 449 · Assignment tracker 349 · Timetable 299 · Reading log 349 · Budget planner 599 · Invoice 499 · Bundle 1299. These are starting numbers; the right price is your call.

## The 24 presets
Preset buttons at the top of New product fill the form. Presets exist for 15 of the 21 types; **mandala, maze, word search, illustrated coloring, imported coloring and bundle have none**.

| Group | Presets |
| --- | --- |
| Students | Student habit tracker · Student goal planner · Back-to-school checklist · Student budget planner · Student assignment tracker (page per subject) · Class timetable (Mon-Fri, 6 periods) · Two-week (A/B) class timetable · Student reading log · Kids reading log |
| Teachers | Teacher weekly planner · Teacher goal planner |
| Home and family | Busy parent weekly planner · Family monthly calendar (Sunday start) · Room-by-room cleaning schedule · Home inventory for insurance |
| Work | Small business goal planner · Small business invoice |
| Everyone | ADHD-friendly habit tracker · Monthly calendar (Monday start) · Large-print monthly calendar · Undated daily planner page · Gratitude journal (30 days) · Geometric coloring book · Geometric wall art prints |

A preset carries one Brief string. It does **not** fill the three brief fields or set the license tier.

## Real page counts (checked live, 2026-11-17)

| Product made | PDF pages |
| --- | --- |
| Mandala, 6 designs | 7 (cover + 6) |
| Maze, 4 mazes | 5 (4 + 1 answer page) |
| Word search, 4 puzzles | 6 (4 + 2 answer pages) |
| Geometric pattern art, 4 pages | 5 (cover + 4) |
| Imported coloring, 3 pictures | 4 (cover + 3) |
| Monthly calendar, 12 months | 13 (cover + 12) |
| Weekly planner, 12 weeks | 13 (cover + 12) |
| Daily planner, 5 days | 5 (no cover) |
| Habit tracker, 6 months | 6 (no cover) |
| Home inventory, 8 default rooms | 9 (intro + 8) |
| Budget planner, 12 months | 13 (12 + year overview) |
| Guided journal, 10 pages | 11 (cover + 10) |
| Goal planner, 3 goals | 5 (3 + 2) |
| Class timetable, defaults | 1 |

## Files every product gets
A PDF (the thing customers print), a customer **ZIP** (the deliverables plus `LICENSE.txt`, `HOW-TO-USE.txt`, `MANIFEST.txt`), three 2000 x 2000 listing pictures, and an internal marketing kit (three 1000 x 1500 pins plus three text files). Details: [Files and formats](../E-reference/05-files-and-formats.md).

## Before every approval
Open the PDF and page through it once at a size where you can read the small print. For types with CSV, XLSX or SVG files, open one of each. [What to check before you approve](../../guide/CHECKING_PRODUCTS.md) is the per-kind checklist.

---
**Next:** [Activities and coloring](01-activities-and-coloring.md) · **Previous:** [Arcade: B.M.O.](../B-screens/arcade/06-bmo.md)
