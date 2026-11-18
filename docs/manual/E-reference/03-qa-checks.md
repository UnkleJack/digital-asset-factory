# QA checks

Every check the app runs. **Hard** blocks approval; **Warning** asks you to look or accept. **Verification:** from the QA code (VERIFIED, code); about two dozen were seen passing, and `dated_requires_start` and `listing_spelling` were seen failing, in the running app.

## Deliverable run (all types)

| Check | Sev | Tests |
| --- | --- | --- |
| `files_exist` | hard | Every file exists with a matching checksum |
| `pdf_valid` | hard | PDF opens, expected page count, every page the right paper size |
| `pdf_links` | hard | Month tabs only: link count matches, each lands on a page |
| `render_diagnostics`, `layout_overflow`, `layout_margins`, `fonts`, `render_errors` | hard | Rendering recorded; no clipped text; inside the safe margin (default tolerance 1 mm); fonts embedded; no outside requests or console errors |
| `content_present`, `content_consistency` | hard | Content exists; the type's own check ran |
| `placeholder_content` | hard | No "lorem ipsum", TBD, TODO, `{{ }}`, `[insert`, undefined, NaN, "your text here" |
| `policy_terms` | hard | No blocked trademark or brand terms |
| `spelling` | warning | Unknown words vs the system dictionary and your allowlist (skipped, with a note, if the Mac has no dictionary) |
| `duplicate_exact` | hard | Not identical to another product |
| `near_duplicate` | warning, hard | Overlap with the same type: warning at 80 percent; hard at 97 percent **and** same design, paper and settings |
| `file_formats` | hard | CSV consistent, XLSX has sheets, SVG clean (no script or outside links), PNG valid |
| `provenance` | hard | Content and artwork carry a source record |
| `image_quality` | warning | AI or imported PNGs: gray midtones at or under 15 percent, no color, at least 200 DPI for Fit fill |
| `bundle_complete` | hard | Bundle: each member passed QA and has files |

## Type-specific checks

| Type | Checks |
| --- | --- |
| Mandala | `mandala_viewbox` hard, `mandala_min_stroke` hard (0.2 mm), `mandala_density` warning, `mandala_line_art` hard |
| Maze | `maze_solvable` hard, `artwork_count` hard |
| Word search | `words_placed` hard, `word_length` hard, `content_count` hard |
| Geometric | `pattern_valid` hard, `pattern_min_stroke` hard, `pattern_density` warning, `pattern_line_art` hard (coloring), `pattern_contrast` hard (print, 3:1) |
| Monthly calendar | `calendar_dates` hard, `title_year` hard, `content_count` hard |
| Weekly planner | `week_alignment` hard, `content_count` |
| Daily planner | `dated_requires_start` hard, `hours` hard, `content_count` |
| Habit tracker | `habit_count` hard (5 to rows), `duplicate_items` warning |
| To-do | `duplicate_items` warning |
| Cleaning schedule | `frequencies_present` hard, `routine_realistic` warning (daily tasks at most 10) |
| Home inventory | `duplicate_items` hard (room names) |
| Guided journal | `duplicate_items` hard, `content_count` warning |
| Goal planner | `section_count` hard (exactly 6) |
| Budget planner | `duplicate_items` warning |
| Invoice | none specific |
| Assignment tracker | `subject_count`, `tip_count`, `rows_fit` warning, `subjects_kept` warning, `duplicate_items` warning |
| Timetable | `timetable_times` hard, `timetable_days` hard, `timetable_fits` hard, `subject_count`, `lunch_position` warning |
| Reading log | `book_rows` hard, `genre_count`, `review_prompt_count`, `goal_fits` warning |

## Release run (package and listings)

| Check | Sev | Tests |
| --- | --- | --- |
| `license_present` | hard | License file is in the package |
| `license_draft` | warning | Classroom or commercial wording is still the unreviewed draft |
| `package_zip` | hard | ZIP opens, holds every deliverable plus MANIFEST, no unsafe paths |
| `listings_present` | hard | At least one listing draft |
| `listing_rules:<marketplace>` | hard | Meets that marketplace's rules |
| `listing_policy:<marketplace>` | hard | No blocked terms in listing text |
| `listing_placeholder:<marketplace>` | hard | No placeholder text in listing |
| `listing_spelling:<marketplace>` | warning | Possible misspellings in listing |

## What QA does not do
It never judges whether a product is attractive, useful or will sell, never reads the *meaning* of a page (a correctly spelled wrong word passes), and never recalculates spreadsheet formulas. See [What to check before you approve](../../guide/CHECKING_PRODUCTS.md).

---
**Previous:** [States](02-states.md) · **Next:** [Providers and keys](04-providers-and-keys.md)
