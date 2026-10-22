# Acceptance Report — Pass 3

Date: 2026-10-22 · Machine: macOS 27.0.1 arm64, Node 26.10.0, Chrome 155 · No AI or marketplace credentials were available.

Statuses follow [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md): **PASS** = executed and observed;
**PARTIAL** = some of it executed, the rest named; **BLOCKED** = needs something outside this machine;
**FAIL** = executed and wrong. Nothing below is marked from reading code alone.

## 1. Summary

The application runs as one local process (API, job worker, scheduler, web UI) and produces, checks,
packages and prepares listings for 15 product types plus bundles without any external service.
Human batch approval gates every export and publication, bound to the exact files, listing text and
marketplace. Direct marketplace publishing is deliberately **not** implemented (no verified API
access); the supported path is an export package plus a manually recorded publication, labelled as
unverified everywhere it appears.

| | Count |
|---|---|
| Automated tests | 61 — final run 61/61 passed |
| Product types producing ready, QA-passed output | 14 of 15 (+ bundle); the 15th needs an image API key |
| Acceptance criteria (58) | 44 PASS · 11 PARTIAL · 3 BLOCKED · 0 FAIL |
| Defects found in Pass 3 | 13 found, 13 fixed and re-tested (§6) |

## 2. Acceptance criteria

### A. Foundation
| ID | Status | Evidence |
|---|---|---|
| AC-A1 | PASS | Working tree copied to an empty folder (git-ignored files excluded), `npm install` then `npm start` per README on port 4318: migrated, seeded 54 rows, served the UI; a habit tracker produced there reached Ready. (Copy, not `git clone`, because Pass 2 is uncommitted.) |
| AC-A2 | PASS | The verification instance was restarted repeatedly (graceful and `kill -9`); products, approvals, the export package, recorded publication and plan run were all still shown afterwards in Publishing, Listings and Analytics. |
| AC-A3 | PASS | Test *migrations apply once, record checksums, and back up before later migrations*; fresh install logged `Database migrated applied=["001_initial.sql"]`. |
| AC-A4 | PASS | Test *a job interrupted by a crash is re-queued…*; live: `kill -9` during a 30-page render twice → on restart `Recovered jobs… requeued=1`, render succeeded on attempt 2, the product reached Ready/QA passed, no duplicate jobs. |
| AC-A5 | PASS | Test *logger and redaction never emit secret values*; live canary secret not found in any log file (§5). |
| AC-A6 | PASS | Test *backup via API and offline restore round-trip*; live: a deliberately corrupted DB copy refused to start with a clear message, `npm run restore -- <backup>` restored it (`quick_check` ok, 7 products), old data moved aside. |

### B. User interface (browser walkthrough against the running app, real data)
| ID | Status | Evidence |
|---|---|---|
| AC-B1 Dashboard | PASS | Counts matched the DB (2 products → later 9; 1 approved; 1 "Published — recorded manually (unverified)"; 0 verified); AI shown as "Not active", marketplaces as "Export package + manual publishing". |
| AC-B2 Calendar | PARTIAL | Month view and plan list render. The plan in this run was created and run through the API, not the UI form. |
| AC-B3 Library | PARTIAL | Lists products with previews and statuses; New product dialog used (now with dropdowns for enumerated settings). Search and filters not exercised in the browser. |
| AC-B4 Product details | PASS | Word-search product created in the UI; Overview (files, steps with attempts), QA tab (each check listed) and listings viewed. |
| AC-B5 Research | PARTIAL | Screen renders with its empty state and tabs. Opportunities were created and scored through the API (3 cases, §3). |
| AC-B6 Templates | PARTIAL | All product types with defaults and variation axes shown. Creating/editing a design system not exercised in the browser. |
| AC-B7 Jobs | PARTIAL | 43 jobs with attempts shown, including the recovered and retried renders. Retry was exercised through the API, not the button. |
| AC-B8 QA results | PASS | Failure summary by check and the recent-runs filter render from real runs. |
| AC-B9 Batch approval | PASS | Item view showed category, audience/theme, content source, score, cost, files, history, QA counts and the listing; "Approve for Etsy" recorded the approval. Other decisions covered by lifecycle tests. |
| AC-B10 Listings | PARTIAL | All current listings with price, status and approval render. Editing in the browser not exercised (covered by tests). |
| AC-B11 Publishing | PASS | Recorded a publication in the UI; a non-Etsy URL was rejected with a message; unapproved listing's buttons disabled; result labelled "Recorded manually — not verified by the app". |
| AC-B12 Analytics | PARTIAL | Production metrics, QA rate by type, decisions and the manual-publication count render from real records. CSV import was tested automatically, not through the browser. |
| AC-B13 Settings | PARTIAL | All 14 tabs present; General viewed. Secret write-only behaviour verified through the API and tests, not the form. |
| AC-B14 No dead routes | PASS | All 13 routes loaded with data and no new console errors (after fixing D-2, §6). |

### C. Generation and rendering
| ID | Status | Evidence |
|---|---|---|
| AC-C1 | PASS | `npm run samples`: 14 types + bundle Ready with QA passed; tests render every type and Letter, A4, A5 and landscape. |
| AC-C2 | PASS | Test *large-print audience and every design system render without layout faults*; grayscale option produced a gray-only page (inspected). |
| AC-C3 | PASS | Test *procedural generators are deterministic per seed and valid*. |
| AC-C4 | PASS | Test *structured outputs: XLSX formulas and CSV round-trip*. |
| AC-C5 | PASS | Tests reopen every ZIP; export ZIP listed by `unzip -l` (§7). |
| AC-C6 | PASS | Test *variations along design and paper axes produce different deliverables*. |
| AC-C7 | PASS | Previews of calendar, weekly/daily planner, habit tracker, budget, invoice/receipt, goal planner, maze and word search inspected by eye; two layout/copy defects found and fixed (D-7, D-8). |

### D. AI providers
| ID | Status | Evidence |
|---|---|---|
| AC-D1–D4 | PASS | Provider tests against local mock servers (structured output validation, bounded re-asks, 429/5xx/timeout retries, usage and cost, missing credentials without network calls). |
| AC-D5 | BLOCKED | Needs a real Anthropic API key. |
| AC-D6 | BLOCKED | Needs a real OpenAI API key; therefore *Illustrated coloring pages* was not produced. |
| AC-D7 | PASS | Every non-illustrated type produced with no provider configured, provenance labelled "built-in content library". |

### E. Quality assurance
| ID | Status | Evidence |
|---|---|---|
| AC-E1 | PASS | All listed checks ran on real products (QA tab shows 16 deliverable + 7 release checks for one product). |
| AC-E2 | PARTIAL | Pass/fail fixtures exist for overflow, margins, placeholders, blocked terms, spelling, near-duplicate similarity, listing limits, XLSX/CSV validity, markup escaping and QA-blocks-approval. Not every check has its own failing fixture (e.g. font embedding, ZIP corruption). |
| AC-E3 | PASS | Test *QA failure blocks approval…*; server refuses approval of a hard-failed version. |

### F. Scheduling
| ID | Status | Evidence |
|---|---|---|
| AC-F1 | PASS | Test; live plan run (quota 2) produced only the evidence-backed opportunity, skipping "insufficient evidence" and "policy blocked" ones. |
| AC-F2 | PASS | Test *cost limit skips AI generation before any call and marks the run partial*. |
| AC-F3 | PARTIAL | Slot uniqueness and job dedupe tested; a restart in the middle of a plan run was not performed live. |
| AC-F4 | PASS | Test with injected clock: missed slots recorded, latest caught up once, window respected; DST test. |
| AC-F5 | PASS | Live run created batch "Verification plan — 2026-10-22" ready for review. |

### G. Batch approval
| ID | Status | Evidence |
|---|---|---|
| AC-G1 | PASS | Seen in the browser (AC-B9). |
| AC-G2 | PASS | Lifecycle tests cover approve/reject/revise/regenerate/edit with audit rows; approve done in the UI. |
| AC-G3 | PASS | Fingerprint = hash(files, listing, marketplace); tests. |
| AC-G4 | PASS | Tests: editing listing price or content cancels the approval and blocks export. |

### H. Publishing
| ID | Status | Evidence |
|---|---|---|
| AC-H1 | PARTIAL | Etsy export package inspected: files, 3 images at 2000×2000, `listing.json`, `listing.txt`, `PUBLISHING_STEPS.md`. Gumroad and generic exports are produced by the same code but were not opened in this pass. |
| AC-H2 | PASS | Live: export, record and publish all refused with `approval_required` for an unapproved listing; tests. |
| AC-H3 | PASS | Live: second export returned `reused: true`; recording the same URL twice kept one record, a different URL is refused (new); verified-adapter idempotency and reconciliation tested with a test adapter. |
| AC-H4 | PASS | Live: status `published_manual`, external record `manual_unverified`. |
| AC-H5 | BLOCKED | No verified Etsy/Gumroad API access; adapters return "not available" instead of pretending. |

### I. Analytics
| ID | Status | Evidence |
|---|---|---|
| AC-I1 | PASS | Live Analytics page computed versions, review time, AI cost ($0, none used), failed jobs and QA rate from records. |
| AC-I2 | PASS | Test: CSV import matched to recorded listings; sources reported separately. |
| AC-I3 | PASS | Test: no recommendations without evidence; accept/dismiss never changes anything else. |

### J. Security
| ID | Status | Evidence |
|---|---|---|
| AC-J1 | PASS (with Keychain caveat) | §5 canary search. The macOS Keychain store itself was not exercised (see §8). |
| AC-J2 | PASS | §5 traversal requests all 403/404; asset-store tests. |
| AC-J3 | PASS | §5: bad Host → 421; missing client header, cross-site Origin and `text/plain` form posts → 403. |
| AC-J4 | PASS | Test *AI-style text containing markup is rendered as text, never executed*. |

## 3. End-to-end runs performed against the live app

1. **UI-driven product**: New product → Word search (Kids 4-8, Ocean, Easy) → all 6 stages succeeded in ~2 s → QA → batch → approved for Etsy → export (API) → export reused on repeat → wrong-host URL rejected → publication recorded → shown as unverified.
2. **Research → plan**: three opportunities scored: evidence-backed maze idea 68.3 / confidence 0.72 → *meets threshold*; habit tracker with no evidence → *insufficient evidence*; "Disney princess coloring pages" → *policy blocked*. A plan (quota 2, $0 AI budget) produced only the first and put it in a review batch.
3. **Crash recovery**: `kill -9` mid-render (twice) → restart → interrupted render requeued and completed; stale lock cleared automatically.
4. **Chrome missing**: Chrome path set to a bogus location → render failed permanently (no pointless retries) with "Google Chrome was not found … set Settings → Rendering → Chrome path" → path reset → job retried → product Ready.
5. **Corrupted database**: refused to start with a one-line message and no leftover lock → restored from backup with the CLI.
6. **Fresh install** (AC-A1).
7. **Samples**: `npm run samples` (§7).

## 4. Automated tests

`npm test` runs 61 tests in 9 files (foundation, product types, providers, lifecycle, operations, QA, server).
They render real PDFs with Chrome and use local mock servers for AI providers.
**Final regression run after all Pass 3 fixes: 61 tests, 61 passed, 0 failed** (`verification-output/test-run.log`);
`npm run typecheck` (server + web) exit 0; `npm run samples` exit 0 with every producible type Ready and QA passed.

## 5. Security audit

| Check | Result |
|---|---|
| Listening address | `127.0.0.1:4317` only (`lsof`) |
| DNS rebinding (`Host: evil.example`) | 421 |
| Mutating request without `x-daf-client` / with cross-site `Origin` / as `text/plain` form | 403 / 403 / 403 |
| Path traversal (`..%2f` in asset, static and app routes) | 404/403, nothing served |
| Response headers | CSP (`script-src 'self'`, `frame-ancestors 'none'`), `nosniff`, `X-Frame-Options: DENY`, `no-store` on API |
| Secret canary (fake token stored via API, then backup made) | Not present in the database, WAL, logs, assets, backups, or the secrets/settings/logs/audit/system/dashboard APIs |
| Repository scan for key-like strings | Only obvious fake fixtures in `tests/` (`sk-test-…`); `data/`, `.env`, `verification-output/` are git-ignored |
| Dependencies (`npm audit --omit=dev`) | Was 2 moderate (`uuid` < 11.1.1 via exceljs); pinned `uuid@11.1.1` via `overrides` → 0 vulnerabilities; XLSX tests still pass |
| Generated documents | Rendered under a CSP with no network, offline mode; probe reports any blocked request as a QA failure |

**Disclosed incident (Pass 2):** before a test-helper bug was fixed, one server test sent a single request
with a fake key (`sk-ant-…` test string) to `api.anthropic.com`; it was rejected with 401. No real
credential was involved and nothing was billed. The helper was fixed and tests now never reach the network.

## 6. Defects found in Pass 3 and fixed

| # | Severity | Defect | Fix | Re-test |
|---|---|---|---|---|
| D-1 | High | Ctrl-C exited with code 130 and left `daf.lock`: puppeteer's own SIGINT handler called `process.exit` before graceful shutdown | Disabled puppeteer signal handlers | Graceful stop exits 0, lock removed, Chrome closed |
| D-2 | High | After `npm run build:web` while running, the server answered new `/assets/*` with `index.html` (blank UI) | Static files resolved per request; missing files are 404, not the app shell | Blank page gone; `/assets/nope.css` → 404 JSON; SPA routes still 200 |
| D-3 | High | Hard kill orphaned headless Chrome processes | Chrome launched over a pipe so it exits with the app | After `kill -9`: 0 headless Chrome left (was 4) |
| D-4 | Medium | Corrupt DB → raw stack trace and a stale lock | Clean "Could not start: …" message, lock released, exit 1 | Re-run on corrupted copy |
| D-5 | Medium | Recording a publication twice with a different URL was silently ignored | Now refused with the URL already recorded; button hidden once recorded | New lifecycle assertion |
| D-6 | Medium | Spell check false positives ("download", "verified", "box", "proud", "unzip", …): the macOS word list lacks common words and the `-ied/-ier/-est` forms | Added suffix rules and a vetted word list; new test sweeps all built-in copy × 13 themes × 9 audiences | `tests/qa.test.ts` |
| D-7 | Medium | Titles used raw audience names ("…for Small business owners", "…for Seniors (large print)") | `audienceSuffix()` title-cases and drops parentheticals; tags too | Samples |
| D-8 | Medium | Receipt "Signature" box filled with 14 writing lines | Notes box fills the space; signature gets one line | Visual inspection |
| D-9 | Low | Listing copy "a ready-to-print word search puzzles" | Number-neutral wording | Samples |
| D-10 | Low | "That URL is not a Etsy address" | "not an address on Etsy" | Lifecycle test |
| D-11 | Low | Enumerated settings (holidays, difficulty, week start) were free-text inputs | Dropdowns and numeric bounds from the schema | Seen in New product dialog |
| D-12 | Low | Wide tables squeezed columns to one word per line at narrow widths | Horizontal scroll and a minimum first-column width | Publishing page |
| D-13 | Low | `uuid` advisory | Override to 11.1.1 | `npm audit` 0 |

## 7. Sample files

`verification-output/samples/` (git-ignored; regenerate with `npm run samples`) holds, per type:
the PDF, the customer ZIP, CSV/XLSX where applicable, LICENSE and HOW-TO-USE, the first two page
previews, the first listing image, `listings.json` (Etsy, Gumroad, generic drafts) and the full `qa.json`.
`verification-output/samples/README.md` tabulates status and QA per type.
`verification-output/exports/etsy-export.zip` is the inspected export package.

## 8. Known limitations

- **Live AI (BLOCKED):** no keys for any provider. Text providers (Anthropic, plus OpenRouter/Groq/NVIDIA NIM/Cerebras/Together AI added after this pass, all tested against mock servers) and the OpenAI image provider are untested against real APIs. Illustrated coloring pages cannot be produced until an image-provider key is added.
- **Direct publishing (BLOCKED):** Etsy needs an approved Open API v3 app with OAuth; Gumroad's product-creation endpoint could not be confirmed from official docs. Publishing is manual from the export package.
- **macOS Keychain store not exercised:** all runs used the in-memory store so that nothing was written to your login keychain. To check it yourself: start the app without `DAF_SECRET_STORE`, save a key in Settings, confirm Settings shows it configured and Keychain Access lists a `digital-asset-factory` item, then delete it in Settings.
- **Electron desktop shell not built.** `npm run app` opens the app in its own Chrome app window instead.
- Scheduling runs only while the app is running (by design; stated in the UI).
- Spelling relies on the macOS word list plus an allowlist; unusual words in AI-written copy will appear as warnings, not failures.
- Linux and Windows untested.

## 9. Remaining tasks

1. Add an Anthropic key and run AC-D5 (one product, check provenance and cost); add an OpenAI key and produce illustrated coloring pages (AC-D6).
2. Exercise the Keychain store as described above.
3. Browser-level checks still PARTIAL: plan form, library filters, design-system editor, listing editor, CSV import, settings forms.
4. Open and check Gumroad and generic export packages; restart in the middle of a plan run (AC-F3).
5. Failing fixtures for the remaining QA checks (AC-E2).
6. Etsy adapter once API access is approved — test against a non-public draft, never a live listing.
7. Optional Electron shell.

## 10. Start, back up, restore, daily use

Full instructions are in the [README](../README.md). In short:

```bash
npm install
```
```bash
npm start
```
Open http://127.0.0.1:4317 (or `npm run app` for a window). Back up from Settings → Backups or
`npm run backup`; restore with the app stopped via `npm run restore -- <name>`. Daily flow:
Research → production plan (Calendar) → Batch approval → export package → publish yourself → Record publication → Analytics.
