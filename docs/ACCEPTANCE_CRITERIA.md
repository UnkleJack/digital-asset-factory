# Acceptance Criteria

Statuses (filled in during Pass 3, only from executed evidence — see [ACCEPTANCE_REPORT.md](ACCEPTANCE_REPORT.md) for the evidence behind each):
**PASS** verified by execution · **PARTIAL** some behavior verified, coverage/dependency missing ·
**BLOCKED** cannot be verified because of a named external limitation · **FAIL** tested and
does not meet the criterion · **—** not yet verified.

"Verified" means the behavior was executed and observed (automated test, scripted end-to-end
run, or inspection of real output files). Compilation, code review or documentation never count.

## A. Foundation

| ID | Criterion | Verification | Status |
|---|---|---|---|
| AC-A1 | `npm install && npm start` on a clean checkout starts the app; UI reachable at `http://127.0.0.1:4317` | Fresh-clone run | PASS |
| AC-A2 | Restart preserves products, versions, assets, approvals, listings, jobs, plan runs | Lifecycle run → stop → start → compare API state and files | PASS |
| AC-A3 | Migrations apply automatically, are recorded with checksums, and a backup is taken first | Test + inspect `data/backups` | PASS |
| AC-A4 | A job interrupted by process kill is re-queued on restart and completes exactly once | Kill during render, restart, inspect `job_attempts` | PASS |
| AC-A5 | Structured logs written; secrets redacted | Test injecting a secret into an error | PASS |
| AC-A6 | Backup and restore round-trip reproduces DB rows and asset files | Script test | PASS |

## B. User interface (real persisted data, empty/loading/error states)

| ID | Screen | Criterion | Status |
|---|---|---|---|
| AC-B1 | Dashboard | Counts and lists match DB; provider/adapter status honest | PASS |
| AC-B2 | Production calendar | Plans, scheduled slots, past runs with outcomes | PARTIAL |
| AC-B3 | Product library | Filter by type/status/category; search | PARTIAL |
| AC-B4 | Product details + version history | Versions, assets with previews, QA, listings, provenance, actions | PASS |
| AC-B5 | Research & opportunity queue | Add/import observations, opportunities, score with breakdown | PARTIAL |
| AC-B6 | Template library | Product types, design systems, audiences, themes; create/edit design system | PARTIAL |
| AC-B7 | Production jobs | Queue, attempts, errors, retry/cancel | PARTIAL |
| AC-B8 | QA results | Per-version checks with hard vs warning; filter failures | PASS |
| AC-B9 | Batch approval | Item details per §G; approve/reject/edit/regenerate/revise | PASS |
| AC-B10 | Marketplace listings | View/edit drafts with live rule validation | PARTIAL |
| AC-B11 | Publishing status | Export packages, manual status recording, reconciliation state | PASS |
| AC-B12 | Analytics | Metrics by source kind, CSV import, recommendations accept/dismiss | PARTIAL |
| AC-B13 | Settings & integrations | Providers + secrets (write-only), marketplaces + rules, scoring, scheduler, QA, backups, logs | PARTIAL |
| AC-B14 | No dead navigation, no placeholder screens, no hardcoded metrics | Click-through of every route | PASS |

## C. Generation and rendering

| ID | Criterion | Status |
|---|---|---|
| AC-C1 | Every non-AI-image product type produces a deliverable that opens, has the expected page count and paper size (Letter, A4, A5 tested) and orientation | PASS |
| AC-C2 | Typography, margins, spacing and palette come from the selected design system; grayscale option works | PASS |
| AC-C3 | Mandala and maze SVGs are valid XML with viewBox; same seed → identical output; different seed → different output | PASS |
| AC-C4 | XLSX opens and formulas compute totals (budget, invoice); CSV has consistent columns | PASS |
| AC-C5 | ZIP packages open and contain deliverables, license, instructions | PASS |
| AC-C6 | Variations differ in at least one design/audience/theme/paper/date axis and in rendered output hash | PASS |
| AC-C7 | Rendered pages inspected visually for each product family (screenshots in verification report) | PASS |

## D. AI providers

| ID | Criterion | Status |
|---|---|---|
| AC-D1 | Structured output validated against schema; invalid output retried then failed with clear error (mock server) | PASS |
| AC-D2 | Timeouts, 429 and 5xx handled with bounded retries (mock server) | PASS |
| AC-D3 | Missing credentials reported as "not configured"; generation follows configured policy | PASS |
| AC-D4 | Usage tokens and estimated cost recorded per generation run | PASS |
| AC-D5 | Live Anthropic call succeeds with a real key | BLOCKED (no API key) |
| AC-D6 | Live OpenAI image call succeeds with a real key | BLOCKED (no API key) |
| AC-D7 | Factory still produces all non-illustrated types with no providers configured | PASS |

## E. Quality assurance

| ID | Criterion | Status |
|---|---|---|
| AC-E1 | Checks implemented: files exist, PDF valid + dimensions, overflow/clipping, margins, fonts, render errors, spelling, content consistency, placeholders, exact + near duplicates, file formats, license + provenance, listing rules, bundle completeness, image line-art/resolution | PASS |
| AC-E2 | Each check has a failing fixture test and a passing fixture test | PARTIAL |
| AC-E3 | Hard failure blocks approval and publication server-side | PASS |

## F. Scheduling

| ID | Criterion | Status |
|---|---|---|
| AC-F1 | Daily plan creates products within quota, per-category max and rotation | PASS |
| AC-F2 | Cost limit stops further AI generation in the run and records skipped items | PASS |
| AC-F3 | Restart during a run does not duplicate the run or its jobs | PARTIAL |
| AC-F4 | Missed slot while app was off: latest runs once on start (`catch_up`), older recorded `missed` | PASS |
| AC-F5 | Finished run's products appear in a batch marked ready for review | PASS |

## G. Batch approval

| ID | Criterion | Status |
|---|---|---|
| AC-G1 | Item shows title, category, previews, file/bundle contents, QA, score + evidence quality, marketplace + listing, warnings/policy risks, cost estimate, version history | PASS |
| AC-G2 | Approve / reject / edit / regenerate / return-for-revision all work and are audited | PASS |
| AC-G3 | Approval bound to version + listing + marketplace fingerprint | PASS |
| AC-G4 | Editing listing or content after approval invalidates approval | PASS |

## H. Publishing

| ID | Criterion | Status |
|---|---|---|
| AC-H1 | Export package for Etsy, Gumroad, generic contains files, images, listing text/JSON, instructions; respects rules | PARTIAL |
| AC-H2 | Export or publish without approval is refused | PASS |
| AC-H3 | Repeated publish requests do not create duplicates; unknown outcome requires reconciliation | PASS |
| AC-H4 | Manual publication recorded as `published_manual` and labelled unverified | PASS |
| AC-H5 | Etsy/Gumroad API publishing | BLOCKED |

## I. Analytics

| ID | Criterion | Status |
|---|---|---|
| AC-I1 | Production metrics (time, cost, QA failures, rejection rate) computed from real records | PASS |
| AC-I2 | Sales CSV import and manual entry recorded with source kind; never mixed silently | PASS |
| AC-I3 | Recommendations require minimum evidence, show rationale + sources, never auto-apply | PASS |

## J. Security

| ID | Criterion | Status |
|---|---|---|
| AC-J1 | Secrets absent from DB, logs, exports, API responses, git | PASS |
| AC-J2 | Path traversal attempts rejected | PASS |
| AC-J3 | Cross-origin mutating request without `X-DAF-Client` rejected; bad Host rejected | PASS |
| AC-J4 | AI text containing HTML/script renders as text in PDFs and UI | PASS |
