# The twelve practice briefs

You wrote twelve production briefs. **None of them exists as a product yet** (checked 2026-11-17 against the code, the docs and your database's product titles). So each one is a **practice exercise**, not a finished example.

For every brief the box below says what Foundry can and cannot do. Nothing here asks the app for something it lacks. Where a brief asks for more than the app offers, the box says what to do instead and what you would need to change in the app (recommendations are in [Discrepancies](../_status/DISCREPANCIES.md); none are built).

All twelve are exercises with sample data. Make them in your real copy only when you actually want the product.

| # | Brief | Product type | Lesson |
| --- | --- | --- | --- |
| 1 | Celestial Geometry Mandala Collection | Mandala coloring pages | [Lesson 1](01-basic-mandala.md) |
| 2 | Ocean Friends Illustrated Coloring Book | Illustrated coloring pages | [Lesson 4](04-illustrated-coloring-pages.md) |
| 3 | Mission: Space Rescue Maze Pack | Maze activity book | [Lesson 5](05-maze-activity.md) |
| 4 | Ocean Explorer Word Search | Word search puzzles | [Lesson 6](06-word-search.md) |
| 5 | The Botanical Year Calendar | Monthly calendar | [Lesson 2](02-create-a-planner.md) |
| 6 | The Semester Sprint Weekly Planner | Weekly planner | [Lesson 2](02-create-a-planner.md) |
| 7 | Gentle Focus Daily Planner | Daily planner | [Lesson 2](02-create-a-planner.md), [Lesson 7](07-run-qa-and-fix-a-problem.md) |
| 8 | Semester Momentum Habit Tracker | Habit tracker | [Part C](../C-product-reference/03-lists-and-trackers.md) |
| 9 | The 90-Day Academic Goal Planner | Goal planner | [Part C](../C-product-reference/03-lists-and-trackers.md) |
| 10 | The Assignment Launchpad Checklist | Assignment tracker or To-do | [Part C](../C-product-reference/04-school-and-study.md) |
| 11 | Home Inventory and Emergency Reference | Home inventory | [Part C](../C-product-reference/03-lists-and-trackers.md) |
| 12 | Household Budget Control Center | Budget planner | [Part C](../C-product-reference/05-money-and-documents.md) |

---

## 1. Celestial Geometry Mandala Collection

> **What Foundry can and cannot do here.** **Can:** mandalas with Motif set **celestial** (or **geometric**), any Detail, 1 to 30 pages, no AI needed. **Cannot:** use the **Celestial theme** to change the drawings (theme only changes titles and keywords). **Do:** Mandala coloring pages, Motif set celestial, Detail detailed, Pages 12; type the title yourself. If you meant geometric *patterns* rather than mandalas, use Geometric pattern art instead.

## 2. Ocean Friends Illustrated Coloring Book

> **Can:** illustrated coloring pages with theme Ocean (needs an image provider). **Cannot:** be made with no image provider, and offline it has only 6 scenes per theme. **Do:** test an image provider first (Settings → AI providers → Test image provider), then 6 pages. Inspect every picture: QA never sees what is drawn. NOT VERIFIED live.

## 3. Mission: Space Rescue Maze Pack

> **Can:** a maze book with one-solution mazes and an answer key, no AI. **Cannot:** pick up a "space" look (the theme has no effect on mazes). **Do:** type the title "Mission: Space Rescue Maze Pack" yourself; choose difficulty by age.

## 4. Ocean Explorer Word Search

> **Can:** word search with theme Ocean; offline it uses the built-in ocean list of 16 words. **Cannot:** use a topic field from the form. **Do:** set Theme to Ocean. Read every list.

## 5. The Botanical Year Calendar

> **Can:** the monthly calendar defaults to the **Botanical Sage** design. 12 months, optional **Month tabs**, optional US federal holidays. **Cannot:** check holiday *names* in QA. **Do:** Year 2027, Month tabs on; read the holiday labels yourself.

## 6. The Semester Sprint Weekly Planner

> **Can:** a weekly planner starting on any date, 1 to 53 weeks. **Cannot:** use a "semester" setting. **Do:** Start date at your term start, **15** weeks, Monday start; title it yourself. Offline focus lines repeat after 22.

## 7. Gentle Focus Daily Planner

> **Can:** an **undated** daily planner (default), any hours from 4 to 24, 1 to 5 priorities. **Cannot (from the form):** a **dated** one; the form has no start date and it fails QA. **Do:** leave Dated off. Use [Lesson 7](07-run-qa-and-fix-a-problem.md) to see the failure and the fix.

## 8. Semester Momentum Habit Tracker

> **Can:** a habit tracker for 1 to 12 months, 6 to 20 rows. **Cannot:** use a "semester" setting. **Do:** Months **4** or **6**, audience Students. Habits must be yes-or-no.

## 9. The 90-Day Academic Goal Planner

> **Can:** a goals count (1 to 12), a worksheet per goal, a quarterly review. **Cannot:** set 90 days or dates. **NOT CURRENTLY SUPPORTED** as a 90-day product. **Do:** Goal planner with the *Student goal planner* preset; call the quarterly review your 90-day check-in in the listing text yourself. A 90-day layout would need an app change (a recommendation, not built).

## 10. The Assignment Launchpad Checklist

> **Can:** an **Assignment tracker** (logs with due dates and grades) or a **To-do / checklist** (topic list). **Cannot:** be both in one product. **Do:** choose the tracker for ongoing coursework, the checklist for a one-off "start an assignment" sheet (topic "assignment launch").

## 11. Home Inventory and Emergency Reference

> **Can:** room-by-room inventory plus CSV and XLSX. **Cannot:** produce **emergency reference pages** (contacts, shut-off valves, policy numbers). **NOT CURRENTLY SUPPORTED.** **Do:** make the inventory; add emergency information to the listing text or as a separate imported text; a real emergency section would need an app change.

## 12. Household Budget Control Center

> **Can:** a monthly budget plus a year overview and XLSX; audience **Busy parents** gives family-style categories. **Cannot:** produce a "control center" dashboard or a household audience. **Do:** Budget planner, audience Busy parents, 12 months. **Test the XLSX formulas by typing numbers in.**

---
**Next:** [Lesson 1: A basic mandala](01-basic-mandala.md) · **Previous:** [Bundle](../C-product-reference/06-bundle.md)
