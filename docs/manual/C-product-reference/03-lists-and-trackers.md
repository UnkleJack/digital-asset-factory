# Lists and trackers

Six types. All use text AI with an offline fallback; layout and counts are computed by the app.

**Verification:** all six were made in the throwaway copy and passed QA (VERIFIED live). Form fields were read live for Cleaning schedule, Home inventory and Goal planner; the rest are from the code.

---

## Habit tracker (`habit-tracker`)

**1.** Monthly habit grids with suggested habits and a reflection box. Students, ADHD-friendly, general adults. Price 3.49. Design Soft Pastel.

**2. Settings**

| Setting | Controls | Range, default |
| --- | --- | --- |
| Year | Year | next year |
| Start month | First month | 1 to 12, **1** |
| Months | Months printed (one page each) | 1 to 12, **12** |
| Rows | Habit rows | 6 to 20, **14** |

There is no "semester" setting; use Months. **3. AI or algorithm.** AI writes the cover subtitle, habits and a reflection prompt. Offline the habits come from a library keyed by audience (general, students, parents, business, kids). **4. Files.** PDF only; no cover page.

**5. Inspect.** QA: 5 to your row count of suggested habits (hard), duplicates (warning). **Each habit must be something you can tick yes or no.**

**6. Improve.** Presets *Student habit tracker*, *ADHD-friendly habit tracker* (fewer rows). **7. Example.** Year 2027, months 6, rows 10 (live: passed).

---

## To-do / checklist (`todo-checklist`)

**1.** A topic checklist or blank weekly to-do. Price 2.99. Design Minimal Mono.

**2. Settings:** **Topic** (3 to 60 characters, default "weekly to-do") and **Blank rows per section** (0 to 10, default 2).

**3.** AI writes an intro and 3 to 6 sections of 4 to 9 items. **Offline it matches the topic by substring against 7 built-in checklists**: moving house, travel packing, new baby, holiday preparation, spring cleaning, back to school, new puppy. Any other topic gives a blank four-section sheet (Must do, Should do, Calls and messages, Errands).

**4. Files.** PDF; page count depends on content. **5. Inspect.** QA only flags repeated items (warning). You check sections, their order and that items are real actions. **6.** Preset *Back-to-school checklist*. **7. Example.** Topic "moving house" (live: passed).

---

## Cleaning schedule (`cleaning-schedule`)

**1.** Daily, weekly, monthly and seasonal cleaning by room. Price 3.49. Design Warm Neutral.

**2. Settings.** **None on the form** ("This product type has no settings", confirmed live). The optional **Rooms** (3 to 10) can only come from a preset or the API. **3.** AI writes tasks per room with a frequency (Daily, Weekly, Monthly, Seasonal). Offline: six fixed rooms (Kitchen, Bathroom, Living room, Bedroom, Entryway, Laundry); unknown names are dropped, and fewer than three matches use all six.

**4. Files.** PDF of exactly **3 pages** (daily, weekly, monthly plus seasonal).

**5. Inspect.** QA: daily and weekly tasks both exist (hard); no more than 10 daily tasks (warning). Check the tasks are doable in the time. **6.** Preset *Room-by-room cleaning schedule*. **7. Example.** Defaults (live: passed).

---

## Home inventory (`home-inventory`)

**1.** Room-by-room inventory sheets with a matching spreadsheet. Insurance and moving use. Price 3.99. Design Bold Modern. Family: structured.

**2. Settings.** The form shows only **Rows per room** (8 to 30, default 16, confirmed live). **Rooms** (2 to 12) is optional and not on the form.

**3.** AI writes an intro, a cleaned room list and 3 to 5 tips. Offline: **8** default rooms and 4 tips; the 8 table columns are fixed.

**4. Files (live).** PDF of **9 pages** (1 intro plus 8 rooms), `home-inventory.xlsx` (one sheet per room plus a Summary sheet using COUNTA and SUM), `home-inventory.csv` (header plus a row per room).

**5. Inspect.** QA: duplicate room names (hard) and that the workbook and CSV open. **QA does not recalculate formulas.** Open the XLSX, type made-up numbers and check the Summary totals move; delete them afterwards.

**6. Not supported.** "Emergency reference" pages (contacts, shut-off locations) do not exist: NOT CURRENTLY SUPPORTED. **7. Example.** Preset *Home inventory for insurance*; rows per room 16.

---

## Guided journal (`guided-journal`)

**1.** A prompt journal. Price 5.99. Design Warm Neutral.

**2. Settings**

| Setting | Controls | Range, default |
| --- | --- | --- |
| Pages | Journal pages | 5 to 120, **30** |
| Prompts per page | 1 or 2 | **1** |
| Focus | gratitude, reflection, goals, selfcare, creativity, mixed | **mixed** |
| Cover | Title page | on |

**3.** AI writes one prompt per slot (up to 240). **Offline there are only 10 prompts per focus (50 mixed)**; extra pages become free-writing pages, so 30 pages of a single focus gives 10 prompts. **4. Files.** PDF.

**5. Inspect.** QA: repeated prompts (hard); enough unique prompts (warning). **Read every prompt.** **6.** Preset *Gratitude journal (30 days)*. **7. Example.** Pages 10, focus gratitude (live: passed).

---

## Goal planner (`goal-planner`)

**1.** A goals-at-a-glance page, one worksheet per goal (six fixed sections) and a quarterly review. Price 4.49. Design Botanical Sage.

**2. Settings.** Only **Goals** (1 to 12, default 4, confirmed live). Page count = goals + 2; no cover. **There is no 90-day or date setting**, so "90-day academic goal planner" cannot be made as such; the quarterly review is the closest.

**3.** AI writes the overview header, the six section labels and prompts, and 3 to 6 review questions. Offline: fixed sections and 4 review questions. **4. Files.** PDF.

**5. Inspect.** QA: exactly six worksheet sections (hard). Check the prompts and that review questions are ones you would answer. **6.** Presets *Student goal planner*, *Teacher goal planner*, *Small business goal planner*. **7. Example.** Goals 3 (live: passed).

---
**Previous:** [Dated planners](02-dated-planners.md) · **Next:** [School and study](04-school-and-study.md)
