# States reference

The exact values the app stores. **Verification:** read from the code and migration files (VERIFIED, code); the main ones were also seen in the running app.

## Product
`active` (default), `archived`, `retired`. Retiring also retires non-published listings.

## Version (the production status you see as pills)

| Value | Meaning |
| --- | --- |
| `in_progress` | Being made |
| `ready` | Finished; waiting for review |
| `failed` | A step failed for good after retries |
| `qa_failed` | A hard QA check failed |
| `superseded` | Replaced by a newer version |
| `rejected` | You rejected it; never publishable |
| `approved` | You approved it |

**Origin:** `initial`, `regenerate`, `revision`, `edit`, `variation`. **Stage (free text):** specified, content_generated, artwork_generated, rendered, qa_checked, packaged, listing_prepared, ready_for_review.

## QA status of a version
`pending`, `passed`, `passed_with_warnings`, `failed`. Computed from the newest Deliverable run and Release run: any failed or error gives failed; else any warning gives passed with warnings; else passed.

## QA run and result
Run kind: **Deliverable**, **Release**. Run status: `running`, `passed`, `passed_with_warnings`, `failed`, `error`. Result severity: **`hard`**, **`warning`**. See [QA checks](03-qa-checks.md).

## Production jobs
Status: `queued`, `running`, `succeeded`, `failed`, `cancelled`. Types: `generate_content`, `generate_artwork`, `render`, `qa`, `package`, `prepare_listings`, `run_production_plan`, `refresh_recommendations`, `research_digest`. Attempt outcome: `succeeded`, `failed_transient`, `failed_permanent`, `interrupted`, `cancelled`. Retry only for transient errors: 3 attempts, waits of 15 s, 60 s, 240 s. A restart re-queues interrupted jobs. Cancel works only on queued jobs; Retry only on failed or cancelled ones.

## Approval
Decisions: `approved`, `rejected`, `revision_requested`, `regenerate_requested`. **Hold for research** is *not* a decision (a separate hold record; only counts while the version is `ready`; any decision or Release ends it).

Approval is blocked when QA status is failed or pending; the version is not `ready` or `approved`; it is not packaged; there are warnings you have not accepted; no listing is ticked; a listing is invalid. A decision on a non-current version returns "A newer version of this product exists". Approvals become invalid when the version is rejected or superseded, or when the files or listing text change (fingerprint).

**Batch:** `collecting`, `ready_for_review`, `closed`. **Reason queue (notes waiting for the AI check):** `waiting`, `applied`, `refused`, `failed`, `dismissed`; retries every 60 seconds.

## Listing

| Value | Meaning |
| --- | --- |
| `draft` | Just made |
| `invalid` | Breaks a marketplace rule |
| `ready` | Valid |
| `export_prepared` | Export package built |
| `published_manual` | You recorded a publication ("manual, unverified") |
| `published_verified` | Posted through an API and confirmed |
| `needs_reconciliation` | Publish outcome unknown |
| `failed` | A publish failed |
| `retired` | Product retired |

**Publication attempt:** operation `prepare_export`, `publish`, `update`, `record_manual`, `reconcile`; status `started`, `succeeded`, `failed`, `unknown`. **External listing:** verification `api_verified` or `manual_unverified`; state active, draft, inactive, removed, unknown. **Marketplace account:** only `export_only` is ever set today.

## Production plan run
Trigger: `schedule`, `catch_up`, `manual`. Status: `pending`, `running`, `completed`, `partial`, `failed`, `missed`.

## Packing
Cart: `open`, `built`, `dissolved`; origin `conveyor`, `backlog`, `variety`, `remix`, `manual`. A product is eligible if its current version passed QA, is approved with warnings accepted, the product is active, not a bundle, and under the packs limit.

## Research
Opportunity: `new`, `evaluating`, `approved`, `rejected`, `produced`, `archived`; origin `manual`, `csv_import`, `ai_suggestion`. Score outcome: `meets_threshold`, `below_threshold`, `insufficient_evidence`, `policy_blocked`. Evidence kind: `measured`, `external_estimate`, `model_hypothesis`, `unknown`. Digest run: `running`, `sent`, `failed`.

## Arcade
Task status `OPEN`, `IN_PROGRESS`, `BLOCKED`, `COMPLETE`; difficulty `LOW`, `MEDIUM`, `HIGH`; character `ide`, `ai-chatbot`, `daf`. World draft `writing`, `ready`, `failed`. Review outcome `APPROVE`, `REJECT`, `DELETE_BIN`, `DELETE_PERMANENT`. Credit ledger kinds `rejection_reward`, `pack_bonus`.

---
**Previous:** [Glossary](01-glossary.md) · **Next:** [QA checks](03-qa-checks.md)
