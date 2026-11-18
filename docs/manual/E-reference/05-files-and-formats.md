# Files and formats

**Verification:** file lists read from real packages made in a throwaway copy (VERIFIED live).

## File types
| Format | What it is | Where used |
| --- | --- | --- |
| **PDF** | The printable pages. Opens anywhere; print at 100 percent scale | Every product |
| **SVG** | A picture of lines and shapes; sharp at any size | Mandala, geometric patterns (delivered); maze (internal) |
| **PNG** | A picture of pixels | Illustrated and imported coloring (delivered); previews, listing images, Pinterest pins (made by the app) |
| **XLSX** | An Excel workbook with formulas | Home inventory, budget planner, invoice |
| **CSV** | A plain text table | Home inventory, budget categories, invoice line items; generic marketplace catalog |
| **ZIP** | One download holding several files | Every product; marketplace exports |
| **TXT / MD** | Plain text | HOW-TO-USE, LICENSE, MANIFEST, PUBLISHING_STEPS, marketing text |

## What a finished product holds
| Role | Files | In the customer's download? |
| --- | --- | --- |
| deliverable | PDF; SVG or PNG art; XLSX and CSV where relevant; HOW-TO-USE.txt; LICENSE.txt; the customer ZIP | Yes |
| preview | Four page previews at 150 DPI | No |
| listing_image | Three 2000 x 2000 PNGs from the previews | No (used for listings) |
| internal | `manifest.json`, three 1000 x 1500 Pinterest pins, `pinterest-copy.txt`, `launch-email.txt`, `social-and-video.txt` | **Never** |
| source | Maze SVGs | No |
| export | Marketplace upload ZIP | n/a |

## Live examples
- **Mandala (6 pages):** 7-page PDF, six SVGs, instructions, license, ZIP.
- **Maze (4 pages):** 5-page PDF only; SVGs internal.
- **Home inventory:** 9-page PDF, XLSX, CSV, ZIP.
- **Imported coloring (3 pictures):** 4-page PDF, three PNGs, ZIP.
- **Pack (4 members):** contents-guide PDF plus one folder per member inside the ZIP.

## Customer ZIP contents
The deliverables, `LICENSE.txt` (personal, classroom or commercial wording from Settings with your shop name and the year), `HOW-TO-USE.txt` (what is included, how to print, printing tips) and `MANIFEST.txt`.

## Export package (per marketplace)
`files/` (the customer ZIP), `images/01.png`..., `listing.json`, `listing.txt` (TITLE, PRICE, TAGS, DESCRIPTION blocks), `PUBLISHING_STEPS.md`, and for Generic a `catalog.csv`. Saved under `data/assets/exports/<marketplace>/`.

## Where files live
`data/assets/products/<category>/<name>_<date>/` for products (for example `coloring-pages/sample-mandala-coloring-pages_2026-11-17`); `data/assets/references/images/` for imports; `data/assets/exports/` for packages. Folder names are readable; a second one the same day gets `-2`. File names inside do not change, so approvals stay valid.

## Import behaviour
Pictures are recognised by content, so a JPEG saved as `.png` is stored correctly; unusual types are saved as PNG. An **exact duplicate is not copied**; its new tags are added to the existing copy. Anything that is not a picture, or is named like a key file (for example `client_secret_...json`), is **refused**. Text examples are split per line and deduplicated.

## Export behaviour
Export needs a valid approval whose fingerprint still matches. Re-exporting the same approval reuses the ZIP. The ZIP is reproducible (fixed timestamps).

---
**Previous:** [Providers and keys](04-providers-and-keys.md) · **Next:** [Publishing and marketplaces](06-publishing-and-marketplaces.md)
