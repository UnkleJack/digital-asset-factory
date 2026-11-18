# Dated planners

Three types whose **dates are always computed by the app**, never by AI. The AI only writes short focus lines and subtitles. All three have the optional **Month tabs** setting and are eligible for the yearly **new edition** refresh.

**Verification:** all three were made in the throwaway copy and the settings the form draws were read live (VERIFIED). QA line meanings come from the code.

**Month tabs.** A row of month tabs along the top of every page that are *links inside the PDF*: on a tablet or computer you tap a month to jump to it. On paper they are only a month guide. Off by default. QA counts the links in the finished PDF and fails the product if any is missing or lands nowhere. Not built: tablet paper sizes, claims about any particular app, video files.

---

## Monthly calendar (`monthly-calendar`)

**1. What it makes.** A month-per-page wall or desk calendar, optional holidays and a notes panel. Family, teachers, small business. Price 4.99. Design Botanical Sage.

**2. Settings** (form fields confirmed live)

| Setting | Controls | Range, default |
| --- | --- | --- |
| Year | Calendar year | 2020 to 2100, **next year** from September (2027 now) |
| Start month | First month | 1 to 12, **1** |
| Months | How many months | 1 to 24, **12** |
| Week start | Sunday or Monday | **Sunday (0)** |
| Holidays | **none** or **us-federal** | none |
| Cover | Title page | on |
| Notes panel | Notes area on each page | on |
| Month tabs | Clickable tabs | off |

**3. AI or algorithm.** Dates and the US-federal holiday table are always computed. The AI writes the cover subtitle and one intention per month. Offline there are **12** built-in lines, so months 13 to 24 repeat them.

**4. Files.** PDF only (cover plus months).

**5. Inspect.** QA checks each month has the right number of days and weekday alignment, the year in the title matches, and one intention per month (all hard). It checks holiday *dates* but **not the holiday names**, so read them. Check the notes space is big enough to write in.

**6. Improve.** For a Monday-first calendar use the preset *Monthly calendar (Monday start)*; for big print *Large-print monthly calendar*. A title containing a year that differs from the Year setting fails QA.

**7. Example.** Year 2027, 12 months, Sunday start, holidays none, Month tabs on, design Botanical Sage. *("The Botanical Year Calendar": the default design already is Botanical Sage.)* Live: made and passed.

---

## Weekly planner (`weekly-planner`)

**1.** A week-per-page planner with daily boxes, priorities and a weekly focus. Students, parents, teachers. Price 5.99. Design Minimal Mono.

**2. Settings**

| Setting | Controls | Range, default |
| --- | --- | --- |
| Start date | First week (aligned back to the week-start day) | **Jan 1 of next year** |
| Weeks | How many | 1 to **53**, **52** |
| Week start | Sunday or Monday | **Monday (1)** |
| Cover | Title page | on |
| Month tabs | Clickable tabs | off |

**3. AI or algorithm.** AI writes a focus line per week and the cover subtitle. Offline it draws from a pool of **22** prompts, so a 52-week planner repeats lines (QA does not check this for weeks).

**4. Files.** PDF only.

**5. Inspect.** QA checks the planner starts on the chosen week-start day and has a focus line per week (hard). **It checks the start, not every week**, so confirm dates run on week after week. Check the focus lines fit the season.

**6. Improve.** Presets: *Teacher weekly planner*, *Busy parent weekly planner*. There is no "semester" setting: choose a start date and a week count (for example 15 for a term).

**7. Example.** Start 2027-01-04, 12 weeks, Monday start. Live: made and passed.

---

## Daily planner (`daily-planner`)

**1.** Time-blocked daily pages, dated or undated. Price 4.99. Design Soft Pastel.

**2. Settings** (form fields confirmed live: Dated, Days, Start hour, End hour, Hour12, Priorities, Month tabs)

| Setting | Controls | Range, default |
| --- | --- | --- |
| Dated | Print real dates | **off** |
| Start date | First day | **not on the form** |
| Days | Pages | 1 to 92, **1** |
| Start hour / End hour | Schedule span | 4 to 12 / 14 to 24, **6 / 21** |
| Hour12 | 12-hour clock | on |
| Priorities | Priority slots | 1 to 5, **3** |
| Month tabs | Clickable tabs (only when dated) | off |

**3. AI or algorithm.** AI writes the cover subtitle, focus prompts and section titles. Offline: **10** prompts and fixed section titles, so more than 10 days repeats. There is **no cover page**. The schedule step is 30 minutes (60 if the span exceeds 12 hours).

**4. Files.** PDF only (one page per day).

> **Trap, verified live (2026-11-17).** The form lets you tick **Dated** but has no field for **Start date**. A dated daily planner made from the form **fails QA** with `dated_requires_start: Dated planner has no start date`, and the QA-failed banner's advice ("Edit content or Change design") does not fix it. **Fix:** make a **variation** with Dated off (verified: it passes), or use a Weekly planner or Monthly calendar when you need real dates. Recommendation for you: have the form show the start date.

**5. Inspect.** QA checks the schedule is at least five hours (hard: end must exceed start by more than 4), a focus prompt per day (hard) and the start-date rule.

**6. Improve.** Preset *Undated daily planner page*. Keep Days small offline.

**7. Example.** Undated, 1 page, 6 to 21, 3 priorities. ("Gentle Focus Daily Planner": undated is the working version.) Live: made and passed; the dated-no-start variant failed as described.

---
**Previous:** [Activities and coloring](01-activities-and-coloring.md) · **Next:** [Lists and trackers](03-lists-and-trackers.md)
