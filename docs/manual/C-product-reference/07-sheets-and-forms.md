# Log sheets and forms (catalog expansion)

**Verification:** every type and setting below was read from the code (`src/engine/producttypes/catalog/`). All 29 render without layout faults in `tests/producttypes.test.ts`, their built-in words pass the spelling check for every theme and audience in `tests/qa.test.ts`, and one log sheet and one form from each family went through the whole pipeline to QA passed with a ready Etsy listing in `tests/catalog.test.ts`. The Food & Cooking category and a weekly meal plan sample were checked in the running throwaway copy. Not yet printed on paper, and the AI wording was not run with a real key.

Added 2026-11-18, the owner's catalog expansion (first three families). Two drawing engines make many kinds of product:

- **Log sheets.** A table with fixed columns, as many writable rows as fit the paper, and sometimes fixed row labels (the days of the week) or fill-in lines above it ("Month", "Goal"). Every log sheet also comes with a matching **XLSX and CSV**, so the buyer can keep the log on screen.
- **Forms.** Pages made of sections: fill-in fields, ruled writing boxes, checklists, questions with lines, and small grids (a week of meals). Pages that repeat (one recipe per page, one client per form) print as many times as **Copies** says.

## 1. What they make and who buys them

| Category | Id | Kind | Engine | Default (range) | Price | Design |
| --- | --- | --- | --- | --- | --- | --- |
| Food & Cooking | `pantry-inventory` | Pantry inventory | Log sheet | 3 log pages (up to 20) | 3.49 | Warm Neutral |
| Food & Cooking | `freezer-inventory` | Freezer and fridge inventory | Log sheet | 2 log pages (up to 20) | 2.99 | Minimal Mono |
| Food & Cooking | `baking-log` | Baking log | Log sheet | 4 log pages (up to 30) | 3.49 | Soft Pastel |
| Food & Cooking | `weekly-meal-plan` | Weekly meal plan | Form | 4 copies (up to 52) | 3.99 | Botanical Sage |
| Food & Cooking | `monthly-meal-plan` | Monthly meal plan | Form | 3 copies (up to 12) | 3.49 | Botanical Sage |
| Food & Cooking | `meal-prep-worksheet` | Meal prep worksheet | Form | 4 copies (up to 52) | 3.49 | Minimal Mono |
| Food & Cooking | `grocery-list` | Grocery list | Form | 4 copies (up to 52) | 2.49 | Soft Pastel |
| Food & Cooking | `recipe-book` | Recipe book (index, sections, recipe pages) | Form | 20 recipe pages (up to 60) | 5.99 | Warm Neutral |
| Food & Cooking | `kitchen-conversions` | Kitchen conversion chart | Form | one page | 2.49 | Bold Modern |
| Finance & Business | `order-tracker` | Order tracker | Log sheet | 6 log pages (up to 40) | 3.49 | Bold Modern |
| Finance & Business | `inventory-tracker` | Stock inventory tracker | Log sheet | 4 log pages (up to 40) | 3.99 | Bold Modern |
| Finance & Business | `sales-log` | Sales log | Log sheet | 6 log pages (up to 40) | 3.49 | Bold Modern |
| Finance & Business | `expense-log` | Expense tracker | Log sheet | 6 log pages (up to 40) | 3.49 | Minimal Mono |
| Finance & Business | `customer-follow-up` | Customer follow-up log | Log sheet | 4 log pages (up to 30) | 2.99 | Minimal Mono |
| Finance & Business | `content-calendar` | Content calendar | Log sheet | 3 log pages (up to 24) | 3.49 | Soft Pastel |
| Finance & Business | `service-menu` | Service menu | Log sheet | 1 page (up to 6) | 2.99 | Botanical Sage |
| Finance & Business | `client-intake-form` | Client intake form | Form | 10 copies (up to 60) | 3.99 | Minimal Mono |
| Finance & Business | `appointment-planner` | Appointment planner | Form | 7 days (up to 60) | 3.49 | Soft Pastel |
| Finance & Business | `project-tracker` | Project tracker | Form | 10 copies (up to 60) | 3.49 | Bold Modern |
| Finance & Business | `business-plan` | One-page business plan (plus first-year goals) | Form | two pages | 4.49 | Botanical Sage |
| Finance & Business | `pricing-worksheet` | Pricing worksheet | Form | 6 copies (up to 40) | 3.49 | Minimal Mono |
| Finance & Business | `business-checklist` | Small business checklist | Form | one page | 2.49 | Bold Modern |
| Health & Fitness | `workout-log` | Workout log | Log sheet | 8 log pages (up to 60) | 3.49 | Bold Modern |
| Health & Fitness | `running-log` | Running and walking log | Log sheet | 6 log pages (up to 52) | 2.99 | Minimal Mono |
| Health & Fitness | `water-tracker` | Water tracker (a week per page) | Log sheet | 4 weeks (up to 52) | 2.49 | Soft Pastel |
| Health & Fitness | `sleep-log` | Sleep log | Log sheet | 4 log pages (up to 52) | 2.49 | Soft Pastel |
| Health & Fitness | `fitness-planner` | Weekly fitness planner | Form | 4 weeks (up to 52) | 3.49 | Bold Modern |
| Health & Fitness | `wellness-journal` | Wellness journal (a page a day) | Form | 30 days (up to 60) | 4.49 | Botanical Sage |
| Health & Fitness | `daily-routine` | Daily routine planner | Form | 14 days (up to 60) | 2.99 | Soft Pastel |

Food & Cooking and Health & Fitness are new categories. The small-business kinds sit in the existing Finance & Business category, next to the budget planner and invoice.

## 2. Settings
| Setting | Engine | Controls | Range | Default |
| --- | --- | --- | --- | --- |
| Pages | Log sheet | How many log pages | 1 to the kind's maximum | per kind (table above) |
| Cover | Both | A cover page with the title and a one-line subtitle | on/off | on |
| Tips box | Log sheet | The intro and three tips above the first log page | on/off | on |
| Copies | Form | How many times the repeating pages print. Kinds with no repeating page (the conversion chart, business plan, checklist) don't have this setting | 1 to the kind's maximum | per kind |

Everything else (columns, row labels, sections) is fixed by the kind, so what you pick is what prints. Audience, theme, design and paper work as for every product.

## 3. What the AI does, and what the app computes
- **The app always:** the columns, row labels, sections and grids; how many rows fit at a writable size (never under 6.5 mm, bigger for kids' and large-print designs); the spreadsheet; the page count.
- **The AI (with a working key):** rewrites the cover line, the intro, the tips (log sheets), and the words of checklists and questions (forms), keeping the same number of each. It is told: no medical, legal, financial or safety guarantees and no invented facts.
- **Without a key:** the kind's own built-in words, which are plain, generic and fact-free.
- **The kitchen conversion chart** prints fixed numbers worked out from the US unit definitions (1 cup = 236.588 mL, 1 oz = 28.3495 g) and rounded to one decimal place; oven temperatures are rounded to the nearest degree. The AI never changes them.

## 4. Files produced
- **Log sheets:** 1 PDF, 1 XLSX (one tab, the columns as headers, the row labels filled in) and 1 CSV.
- **Forms:** 1 PDF.
- Plus the usual LICENSE.txt, HOW-TO-USE.txt, ZIP and listing images.

## 5. What to inspect before approving
- **Log sheets:** the rows are big enough to write in on your paper. QA warns (`rows_writable`) under 6 rows on the first page, and fails (`rows_fit`) when the fixed row labels don't all fit.
- **Forms:** QA fails (`sections_complete`) if the AI returned the wrong number of checklist items or questions. Check that the questions suit the audience you chose.
- **Health & Fitness:** read the tips and questions once for anything that sounds like medical advice.

## 6. Common problems and how to improve the result
- **Too few rows on A5 or with large print:** fewer, bigger rows are deliberate. Use Letter or A4, or turn the Tips box off to gain rows on the first page.
- **Generic wording offline:** add an AI key, or use the Brief box ("for a home bakery that sells at farmers' markets").

## 7. Example configuration
- **Family meal planner (preset, Kitchen group):** weekly meal plan, 4 copies, Busy parents, Botanical Sage.
- **Maker order book (preset, Small business group):** order tracker, 10 pages, Small business owners, Bold Modern.
- **Gym workout log (preset, Health and fitness group):** workout log, 12 pages, General adults, Bold Modern.
