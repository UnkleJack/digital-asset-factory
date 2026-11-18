# Lesson 2: Create a planner

**Verification:** a weekly planner (12 weeks), a monthly calendar with Month tabs, an undated daily planner and a deliberately dated daily planner were made in a throwaway copy; results read (VERIFIED live).

## Learning objective
Understand how **dates are computed by the app** and how a dated product can fail QA for a setting reason.

## What we are creating
A 12-week weekly planner and a 2027 monthly calendar. They match your briefs *The Semester Sprint Weekly Planner* and *The Botanical Year Calendar* (see [practice briefs](00-the-twelve-practice-briefs.md)); neither exists yet.

## What we need
Nothing but the running app. No AI key (focus lines come from the built-in library).

## Steps
**A. Weekly planner.**
1. New product → **Calendars & Planners** → **Weekly planner**.
2. Title "Sample Weekly Planner". **Start date** 2027-01-04, **Weeks** 12, **Week start** Monday. Press **Create and start production**.

**B. Monthly calendar.**
1. New product → **Calendars & Planners** → **Monthly calendar**. Year 2027, Months 12, **Month tabs** ticked, Holidays none.
2. Create.

**C. See the daily-planner trap (optional).** Make a **Daily planner**, tick **Dated**, Days 5, Create. It will fail QA. That is the point of [Lesson 7](07-run-qa-and-fix-a-problem.md).

## Expected results
Weekly planner: 12 week pages plus a cover, QA passed (live). Calendar: passes with the Month tabs links counted by QA (`pdf_links`).

## What to inspect
- Weekly: do the dates run on week after week? **QA checks only the start day**.
- Calendar: check the holiday labels if you turned holidays on (QA checks dates, not names). Click a month tab in the PDF on screen to confirm it jumps.
- Focus lines: with no AI key they repeat after 22 (weekly) or 12 (monthly intentions).

## Common mistakes
Looking for a "semester" setting (use weeks); expecting a dated daily planner from the form; choosing Sunday start when you meant Monday.

## Completion criteria
- [ ] Both products Ready and QA Passed.
- [ ] I opened the PDFs and checked the dates.
- [ ] I know why a dated daily planner from the form fails.

## What I learned
Dates and holiday tables are always computed by the app; the AI only writes short lines; the form's missing **Start date** field is a real gap.

---
**Previous:** [Lesson 1](01-basic-mandala.md) · **Next:** [Lesson 3: Import outside artwork](03-import-outside-artwork.md) · **Reference:** [Dated planners](../C-product-reference/02-dated-planners.md)
