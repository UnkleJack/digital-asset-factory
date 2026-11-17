# What to check before you approve

QA (chapter 11 of the [walkthrough](WALKTHROUGH.md#11-qa-results)) runs a set of automatic checks on every version. A green QA run means the files are sound. It does not mean the product is good, and for some kinds of product it checks very little. This page lists, kind by kind, what QA really tests and what only your eyes can catch, so you know where to spend your time at review.

It was written from the checks in the code, not from memory. If a check is added or removed, this page needs to change with it.

## How the checks are labelled

- **Hard** checks block approval and publishing when they fail.
- **Warnings** show up at review but don't block anything.

## What QA checks on every product

These run for every kind of product, so the tables below don't repeat them.

- Every file is present and matches its checksum.
- The PDF opens, has the page count and paper size the settings asked for, and (on dated planners with Month tabs) every tab link lands on a real page.
- Nothing is clipped, nothing overflows, and everything sits inside the safe print margin.
- Fonts are embedded, and the page asks for nothing from the internet.
- There's no placeholder text and no blocked trademark or brand terms.
- Spelling (a warning only, and skipped when the computer has no dictionary).
- The product isn't an exact copy of an existing one, and a near copy is flagged.
- CSV, XLSX, SVG and PNG files open and are valid for their format.
- Every piece of content and artwork has a record of where it came from.
- On pictures from an image AI or from your imports: gray tones, color and (for the **fill** setting) print resolution. These are warnings.

Two things sit outside all of that. QA can't tell whether a product is attractive or sells, and it never reads the *meaning* of a page. A word can be spelled correctly and still be the wrong word.

## Kind by kind

| Kind | QA checks it for you | You still need to look at |
| --- | --- | --- |
| **Monthly calendar** | Every month has the right number of days and the right weekday alignment (hard). The year in the title matches the settings (hard). One intention written per month (hard). | The holiday labels, if you turned US federal holidays on. QA checks the dates and not the names. Whether the notes space is big enough to write in. |
| **Weekly planner** | The week starts on the day you chose (hard). One focus line per week (hard). | That the dates run on from the start date week after week. QA checks the start, not each week. Whether the focus lines suit the time of year. |
| **Daily planner** | A dated planner has a start date (hard). One focus prompt per day (hard). The schedule is at least five hours long (hard). | Whether the hours look right on the page. A dated planner needs a start date and goes up to 92 pages. |
| **Habit tracker** | Between 5 and your row count of suggested habits (hard). Duplicate habits (warning). | That each habit is something you can tick yes or no. QA can't judge that. |
| **To-do / checklist** | Repeated items across sections (warning). | The sections and their order. Whether each item is a real action. |
| **Cleaning schedule** | Daily and weekly tasks both exist (hard). No more than 10 daily tasks (warning). | Whether the tasks are really doable in the time. |
| **Home inventory** | Duplicate room names (hard). The workbook and CSV open and are valid. | The workbook totals. QA doesn't recalculate them (see the note on formulas below). |
| **Guided journal** | No repeated prompts (hard). Enough unique prompts for the pages you asked for (warning). | Whether the prompts are good ones. |
| **Goal planner** | Exactly 6 worksheet sections (hard). | The wording of each prompt, and that the quarterly review questions are ones you'd answer. |
| **Budget planner** | Categories used twice (warning). The workbook opens and has sheets. | **The formulas.** QA doesn't recalculate them. Open the XLSX, type a few numbers in and make sure the totals and the year overview move correctly. |
| **Invoice template** | Nothing specific to this kind. Only the checks everything gets. | Everything: the layout, the tax label, the line count, the currency symbol. |
| **Assignment tracker** | Subject count 3 to 12 and tips 3 to 6 (hard). Duplicate subjects (warning). The subjects you listed are the ones printed (warning). All your rows fit at a writable size (warning). | Whether the rows are big enough to write in once printed. |
| **Class timetable** | Periods are in order and the right length, days are right, and the grid fits the page (all hard). Lunch sits where you asked (warning). Subject key count 4 to 12 (hard). | The actual times against your real school day. |
| **Reading log** | Books are numbered 1 to your count with none missing (hard). Challenge genres 6 to 16 and review questions 3 to 6 (hard). The reading goal fits inside the book count (warning). | That the challenge genres suit the age group. |
| **Mandala coloring pages** | The right number of designs, every line inside the drawing box, no line thinner than the printable minimum, pure black-and-white line art (all hard). Possibly too packed to color (warning). | **Open every page.** Look for areas too fiddly to color and for designs that feel the same. Mandalas are drawn by the app, with no AI involved. |
| **Maze activity book** | Every maze is a perfect maze with exactly one solution (hard). The right number of mazes and answer pages (hard). | That the answer page is for the right maze, and that the difficulty suits the age group. |
| **Word search puzzles** | Every word is placed in its grid, and no word is longer than the grid (both hard). The right number of puzzles (hard). | **Read the word lists.** QA proves the words are in the grid. It can't tell whether a word is too hard for the age, or odd for the topic. |
| **Illustrated coloring pages** | The right number of pictures (hard). Gray tones, color and low print resolution (warnings). | **Every picture.** QA never sees what is drawn. Check for cropped faces and fins, odd expressions, stray text and the wrong animal. |
| **Geometric pattern art** | Every pattern is a complete drawing inside its box, lines stand out from the background, and lines are line art and thick enough (all hard). Possibly too dense (warning). | The look of each page, and for **print** mode the colors on your own printer. |
| **Coloring pages from your imports** | The right number of pictures (hard), plus the picture checks above. | Your source images: whether each one made a clean page. |
| **Bundle** | One blurb per member (hard). Every member passed QA and has its files (hard). | Whether the members belong together, and the price. |

## About formulas

The budget planner and home inventory come with XLSX workbooks that have formulas in them. QA confirms the workbook opens and has sheets. It doesn't read the totals. Before you approve either one, open the XLSX, enter a few made-up numbers and watch the totals change. Delete the made-up numbers afterwards.

## Before every approval

Open the finished PDF and page through it once, start to end, at a size where you can read the small print. Then, for any kind that offers a CSV, XLSX or SVG files, open one of each.
