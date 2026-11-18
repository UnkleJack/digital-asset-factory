# Verification log

One entry per check, newest first. "Code" means read from the source files. "Live" means seen working in a running throwaway copy of the app.

## 2026-11-17 (second pass): manual written and checked live

**How the live checks were made.** A throwaway copy of the app was started (`DAF_DATA_DIR` in a temporary folder, port 4399, an in-memory key store, no `.env`, so no real keys and no real data). The sandbox blocked opening a local port, so that one command ran outside the sandbox. Pages were captured and read with the repo's own `puppeteer-core` and Google Chrome. Products were created through the same API the screens use. **Buttons were clicked for real only in the arcade** and for tabs and pop-ups; most back-office actions were driven through the API.

| Area | Checked | Result |
| --- | --- | --- |
| Every back-office page | Screenshot plus on-screen text | VERIFIED. Dashboard chapter in the old Walkthrough was out of date (tile names). |
| New product form fields | Read the settings drawn for 9 types | VERIFIED. Confirms the form gaps (daily planner start date; assignment-tracker subjects; reading-log goal; word-search topic; cleaning-schedule rooms; home-inventory rooms). |
| Mandala, maze, word search, geometric, imported coloring | Created, ran the pipeline, read files and QA | VERIFIED live. |
| Monthly calendar, weekly planner, daily planner, habit tracker, to-do, cleaning, home inventory, budget, invoice, journal, goal planner, assignment tracker, timetable, reading log | Created and QA read | VERIFIED live (all passed). |
| Dated daily planner without a start date | Created | VERIFIED live: fails `dated_requires_start`; a variation with Dated off passes. |
| Approve, QA-failed block, regenerate, hold, warning gate | Exercised | VERIFIED live. |
| Reject with no AI key | Exercised | VERIFIED live: the note is queued and nothing changes. |
| Import: three pictures, a duplicate, product from imports | Exercised | VERIFIED live. |
| Bundle of four approved products | Exercised, ZIP read | VERIFIED live. |
| Export package, publish refusals, record a manual publication | Exercised | VERIFIED live (no real listing). |
| Analytics manual entries | Exercised | VERIFIED live. |
| Backup (Back up now) | Exercised in the throwaway copy | VERIFIED live (22 products, 416 files). |
| Arcade: Hub, world, task, MAKE IT, SUBMIT FOR QA, APPROVE, DELETE, Packs, Leaderboards, Codex, B.M.O., Missions, Bin, World Builder, ticker editor | Real clicks | VERIFIED live. |
| Illustrated coloring pages | Not run (would call an outside image service) | NOT VERIFIED. |
| Any real AI call, B.M.O. answers, AI World Builder panels, picture-reading AI | Not run | NOT VERIFIED. |
| Gumroad direct posting, research digest, Windows, hub mode, public access | Not run | NOT VERIFIED (never had a live run). |
| Production plan creation and run | Not run | NOT VERIFIED. |
| Edit content, Change design / paper, Make next edition | Not run | NOT VERIFIED (Walkthrough and code only). |
| Restore commands and `--apply` data commands | Deliberately not run | NOT VERIFIED (destructive). |
| Keyboard and controller input in the arcade | Not run | NOT VERIFIED. |
| Spreadsheet formulas | Not tested by typing numbers | NOT VERIFIED (QA does not test them either). |

Not exercised on purpose: anything that touches your real `data/`, your Keychain, a real AI provider, or a real marketplace.

## 2026-11-17 (first pass): Stage 1 audit (read-only)

Checked at the tip of `main` (merge of PR #55). Constitution, README, Getting started, Walkthrough, Checking products and the Prompt library were read. Screens and navigation, Settings tabs, product types (registry loaded and printed), presets, states, QA checks, providers, publishing and operations scripts were read from the code (VERIFIED, code). The state of `data/backups` and the database's product titles were read. None of the 12 briefs exists as a product.
