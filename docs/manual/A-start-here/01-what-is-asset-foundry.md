# 1. What Asset Foundry is

**In this chapter:** what the three names mean, what the app makes, how a product travels from idea to finished file, what the computer does for you and what only you can do.

**Verification:** VERIFIED against the code and a running throwaway copy (2026-11-17). Where something was only read from the code, the text says so.

## The three names

| Name | What it is | Where you meet it |
| --- | --- | --- |
| **Asset Foundry** (short: Foundry) | The whole suite. | The name in the top-left of every screen. |
| **The factory** (Digital Asset Factory, DAF) | The engine. It makes products, checks them, packs them, writes marketplace listings and handles approval and publishing. | The 17 working screens in the left sidebar. People call this "the back office". |
| **HAPPY DAFFY** | A game-style front end over the same factory. It is always written in capitals. | `/arcade`, opened from the first item in the sidebar. |

HAPPY DAFFY sits *beside* the back office. It does not replace it, and both read and write the same products, keys and data. Anything you make in one shows up in the other. The rules behind the names are in [the Constitution](../../../CONSTITUTION.md); if this manual ever disagrees with it, the Constitution wins.

## What it makes

Foundry makes **printable and downloadable digital products**: files that a customer buys once and prints or uses on screen. There are 21 product types:

| Family | Types |
| --- | --- |
| Coloring and activities | Mandala coloring pages, Illustrated coloring pages, Geometric pattern art, Maze activity book, Word search puzzles, Coloring pages from your imported images |
| Dated planners | Monthly calendar, Weekly planner, Daily planner |
| Lists and trackers | Habit tracker, To-do / checklist, Cleaning schedule, Home inventory, Guided journal, Goal planner |
| School and study | Assignment tracker, Class timetable, Reading log |
| Money and documents | Budget planner, Invoice template |
| Packs | Bundle (several approved products sold together) |

Every product is a **PDF** you can print. Some also include extra files such as SVG pictures, PNG pictures, or an Excel workbook. Part C of this manual covers each type in detail.

## How a product travels from idea to finished file

Here is the whole journey. The right-hand column says who does the work.

| # | Stage | What happens | Who does it |
| --- | --- | --- | --- |
| 1 | **Research** | You collect ideas. You can add them by hand, import keyword data, ask the AI for suggestions, or let the weekly Research digest email you ideas. | You (the digest and AI suggestions need keys) |
| 2 | **Opportunity evaluation** | The app turns the evidence you supplied into a score from 0 to 100. Missing data stays "unknown" and lowers the confidence; nothing is invented. | The app calculates, you decide |
| 3 | **Product specification** | The settings for one product: type, title, design, audience, paper size and the type's own settings. | You (New product, or "Produce now" on an idea), or a production plan on a schedule |
| 4 | **Content and artwork** | Text is written by an AI if you have a working key, otherwise by the built-in content library. Some artwork is drawn by the app's own code (mandalas, mazes, patterns), some by an image AI (illustrated coloring), some comes from your imports. | Automatic |
| 5 | **Rendering** | The app turns the pages into a PDF, plus preview pictures, using Google Chrome running invisibly. | Automatic |
| 6 | **QA** (quality assurance) | Automatic checks on the files: page count, paper size, margins, fonts, spelling, duplicates and more. A failed **hard** check blocks approval. A **warning** asks you to look. | Automatic |
| 7 | **Packaging** | The files go into a customer ZIP with a license and instructions. Listing pictures and a marketing kit are made. | Automatic |
| 8 | **Listing preparation** | A draft listing (title, description, tags, price) is written for each marketplace you chose. | Automatic |
| 9 | **Approval** | You review the product and decide. Nothing is published without this. | **You, always** |
| 10 | **Publishing or export** | Foundry builds an export package. You upload it to the marketplace and record the link. Gumroad can also be posted to directly if you switch that on. | You (Gumroad direct posting is optional and not yet proven live) |
| 11 | **Performance tracking** | You type in or import sales numbers. Gumroad sales can be pulled in automatically. | You |

Two rules from the Constitution explain a lot of what you will see: **a person approves before anything is published**, and **nothing is invented**: where a value is unknown, the app shows it as blank or "unavailable" rather than making up a number.

## What is automatic and what needs you

- **Automatic:** content, artwork, rendering, QA, packaging, listing drafts, sorting approved products onto packing carts, and (while the app is open) scheduled production plans.
- **Needs your decision:** which products to make, approving or rejecting, which marketplaces, what to publish, and what a rejection note says.
- **Only while the app is open:** production plans and the weekly clean-up. If the computer is off or asleep, a missed run is recorded and the latest one is caught up when you start the app.

## What AI providers do

An **API** is a way for two programs to talk. Foundry uses APIs to send a request to an **AI provider** (a company that runs AI models) and get text or pictures back. You prove who you are with an **API key**, which works like a password. Keys are stored in the macOS Keychain, never in the database, the logs or the exports.

- **Text AI** writes the words on pages, product ideas, listing copy and suggestions. There are 10 text providers, tried in an order you set. See [Providers and keys](../E-reference/04-providers-and-keys.md).
- **Image AI** draws pictures, and today only Illustrated coloring pages need it.
- **No key at all is fine** for 18 of the 21 types: Foundry uses its built-in content library and says so in each product's provenance. Illustrated coloring needs an image provider. Imported coloring needs your own pictures from Imports. Bundles need approved products to pack.

> **NEEDS OWNER CLARIFICATION (resolved 2026-11-17):** the Constitution used to say all 21 types work offline. That wording is being corrected to the list above.

## What HAPPY DAFFY adds

HAPPY DAFFY lets you do the same work as a game: pick a character, enter a "world" (a project with milestones and tasks), make an asset for a task, and review it. It has three characters, each of which filters which projects you see.

| Character | Role | Covers |
| --- | --- | --- |
| **GAGE** the ninja | IDE | Coding projects and tool-building tasks |
| **B.M.O.** the desk robot | AI chatbot | Advice and ideas; can propose actions that run only when you press YES |
| **SPARKS** the wizard | DAF | The production floor, where assets get made |

Part B covers the arcade screen by screen. The arcade's credit meter shows a **TEST** number until real provider limits are tracked, and several arcade values (XP, bonuses) are blank on purpose until you decide them.

## Where your files live

Everything stays on your computer in the `data/` folder inside the project. It holds the database, every generated file, logs and backups. It is never put in Git, and it is the only copy. Read [Backups and data safety](../E-reference/08-backups-and-data-safety.md) before you build up work you care about.

---

**Next:** [2. First run and navigation](02-first-run-and-navigation.md) · **Related:** [Glossary](../E-reference/01-glossary.md), [Product reference](../C-product-reference/00-overview.md)
