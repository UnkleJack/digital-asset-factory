# Money and documents

Two "structured" types with spreadsheets. **No financial, tax or legal advice is ever written**; the AI is told not to.

**Verification:** both were made in the throwaway copy and passed QA; form fields read live for the budget planner (VERIFIED). **The spreadsheet formulas were NOT tested by typing numbers** (QA does not test them either).

---

## Budget planner (`budget-planner`)

**1.** A month-by-month budget with a year overview, plus a spreadsheet. Students, parents, small business. Price 5.99. Design Bold Modern.

**2. Settings** (confirmed live: Year, Start month, Months, Currency symbol)

| Setting | Controls | Range, default |
| --- | --- | --- |
| Year | | next year |
| Start month | | 1 to 12, **1** |
| Months | Month pages | 1 to 12, **12** |
| Currency symbol | 1 to 3 characters | **$** |

**3.** AI writes category lists (income, fixed, variable, savings) and 2 to 5 tips, **with no personalised advice**. Offline: 4 sets keyed by audience (general, students, parents, business; kids maps to general) and 3 fixed tips. There is **no cover** and no "household" audience: **Busy parents** is the closest.

**4. Files.** PDF (one page per month plus a "year at a glance" page), `budget-planner.xlsx` (a sheet per month with SUM and difference formulas, plus a Year overview), `budget-categories.csv`.

**5. Inspect.** QA: categories used twice (warning); the workbook opens and has sheets. **Open the XLSX, type a few numbers and confirm the totals and the Year overview move.** Delete the made-up numbers.

**6. Improve.** Preset *Student budget planner*. **7. Example.** Year 2027, audience Busy parents, currency $. ("Household Budget Control Center": no dedicated household or control-center layout exists.)

---

## Invoice template (`invoice-template`)

**1.** A two-page invoice and receipt with a spreadsheet. Small business, freelancers. Price 4.99. Design Bold Modern.

**2. Settings**

| Setting | Controls | Range, default |
| --- | --- | --- |
| Currency symbol | | **$** |
| Tax label | Name of the tax line | 2 to 20 characters, **Sales tax** |
| Line rows | Item rows | 6 to 25, **12** |

**3.** AI writes three short strings (thank-you, terms template, receipt note); offline they are fixed. **4. Files.** PDF of 2 pages (invoice and receipt), `invoice-template.xlsx` (line total, subtotal, tax, total), `invoice-line-items.csv` (header only).

**5. Inspect.** **QA has no checks specific to this type.** Check everything yourself: layout, tax label, line count, currency symbol and the spreadsheet's formulas. **6.** Preset *Small business invoice*. **7. Example.** Tax label "VAT", line rows 10.

---
**Previous:** [School and study](04-school-and-study.md) · **Next:** [Bundle](06-bundle.md)
