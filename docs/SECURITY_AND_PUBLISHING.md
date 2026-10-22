# Security and Publishing

## 1. Threat model (local single-user app)

| Threat | Mitigation |
|---|---|
| Other machines on the network reach the API | Server binds to `127.0.0.1` only |
| A malicious website in the user's browser calls `http://127.0.0.1:4317` (CSRF) | Mutating requests require header `X-DAF-Client: 1` (forces a CORS preflight that the server never approves); no CORS headers are sent |
| DNS-rebinding | `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`; otherwise 421 |
| Secret leakage | Secrets live in the OS keychain; never in SQLite, logs, exports, manifests, API responses or error messages; logger redacts known secret values and token-shaped strings |
| Path traversal / arbitrary overwrite | All file I/O goes through `AssetStore` (IDs and sanitised slugs only, real-path containment check); files are served by asset id |
| Untrusted AI output | Content is validated by Zod schemas, HTML-escaped when rendered, length-limited; Chrome renders with all non-local network requests blocked; UI never uses raw HTML injection; SVG/HTML assets served with `Content-Security-Policy: default-src 'none'` and `X-Content-Type-Options: nosniff` |
| Unapproved publication | Publishing service enforces approval fingerprint match; there is no code path that publishes without it |
| Duplicate listings from retries | Idempotency keys, `unknown` outcome state, reconciliation before retry |
| Corrupted state after external failure | External calls happen outside DB transactions; local state changes are committed only after the outcome is known; unknown outcomes are recorded as such |

## 2. Credential storage

- macOS: Keychain generic passwords, service `digital-asset-factory`, account = secret name
  (`anthropic_api_key`, `openai_api_key`, `etsy_oauth`, `gumroad_token`). Accessed with
  `/usr/bin/security` using argument arrays (no shell interpolation). Writes go through
  `security -i` with the command sent over **stdin**, so the value never appears in process
  arguments (`ps`); values are restricted to printable non-whitespace ASCII. Reads use
  `find-generic-password -w`.
- Other OSes: environment variables `DAF_SECRET_<NAME>` (read-only), documented as less secure.
- The API exposes only `{ name, configured, source, updatedAt }`. Setting a secret is
  write-only; there is no endpoint that returns a value.
- `.gitignore` excludes `data/`, `.env*`, exports and backups. Backups contain the database and
  assets but no secrets (secrets are not in either).

## 3. Logging and audit

- Logs are JSON lines in `data/logs/` with level, message, context ids (job, product, version,
  plan run) and an `outcome` field distinguishing `succeeded`, `failed`, `skipped` and
  `unverified`.
- Redaction runs on every log record and on every error message stored in the DB.
- `audit_events` records approvals, rejections, revisions, edits, exports, manual publication
  records, settings changes and secret changes (name only).

## 4. Publishing operations

| Operation | Meaning | Requires approval? | Changes remote state? |
|---|---|---|---|
| Generate listing | Create/update a listing draft for a version + marketplace | No | No |
| Prepare export package | Build a folder + ZIP with files, images, listing text, instructions | **Yes** (marketplace-ready package). Internal previews never need approval | No |
| Publish | Create the listing on the marketplace via API | **Yes** | Yes |
| Update listing | Push changes to an existing remote listing | **Yes** (re-approval of the new fingerprint) | Yes |
| Record publication status | Operator records that they published manually (URL/id) or a reconcile updates state | Approval must exist for the version | No |

### Approval rules

1. Approval is recorded per **version × listing × marketplace** with the fingerprint at the
   moment of approval and the approver.
2. A version with a failed hard QA check, or a listing failing marketplace rules, cannot be
   approved (server-side check, not just UI).
3. Any change to deliverables or listing fields changes the fingerprint; the decision is marked
   invalidated with a reason and the item returns to review.
4. Publishing/export re-computes the fingerprint and refuses on mismatch.

### Idempotency and reconciliation

- `idempotency_key = sha256(operation ‖ listing_id ‖ approval_decision_id ‖ fingerprint)`.
- Before a remote call, a `publication_attempts` row with status `started` is inserted; the
  partial unique index makes a concurrent duplicate fail.
- If the remote call outcome cannot be determined (timeout after send, crash), the attempt is set
  to `unknown` and the listing to `needs_reconciliation`. Retrying is refused until a reconcile
  (API lookup, or operator confirmation for manual flows) resolves it.
- For manual flows, the operator confirms publication with the external URL/id; the record is
  `published_manual` with verification `manual_unverified` and is labelled as such everywhere.

## 5. Marketplace integration status (inspected 2026-10-22)

| Marketplace | Export package | API adapter | Evidence |
|---|---|---|---|
| Etsy | **Implemented**: files (PDF/ZIP), listing images, `listing.json`, copy-paste text, step-by-step instructions | `not_implemented` | Etsy Open API v3 official tutorial: create draft with `quantity, title, description, price, who_made, when_made, taxonomy_id`; set `type=download` via `updateListing`; files via `uploadListingFile`; at least one image before `state=active`; OAuth scopes `listings_r`, `listings_w` (+`listings_d` to delete); every request needs `x-api-key`; form-urlencoded bodies. Requires an approved Etsy developer app and OAuth (PKCE) — not available in this environment |
| Gumroad | **Implemented** (same structure, Gumroad-specific steps) | `not_implemented` | Gumroad's own API page did not render during inspection; only third-party mirrors describe a product-create endpoint and `edit_products` scope. Must be verified with a real token before any adapter claims support |
| Generic | **Implemented**: ZIP + CSV catalog row + instructions | n/a | — |

### Listing rules (defaults, editable in Settings → Marketplaces)

| Rule | Etsy default | Gumroad default | Source confidence |
|---|---|---|---|
| Title max length | 140 | 255 | Etsy: multiple seller guides agree; Gumroad: conservative choice |
| Tags | ≤ 13, each ≤ 20 chars | ≤ 20 | Etsy: multiple seller guides agree |
| Images | ≥ 1, ≤ 10 | ≥ 1, ≤ 10 | Etsy minimum 1 confirmed by official API tutorial; max from seller guides |
| Digital files | ≤ 5, each ≤ 20 MB | ≤ 20, each ≤ 250 MB | Not confirmed from official pages during inspection — treat as conservative defaults |
| Prohibited terms | configurable trademark/IP blocklist | same | Operator-maintained |

Rules not confirmed from official sources are flagged in the Settings UI as "verify".

## 6. Adding a verified API adapter (future)

1. Implement `publish`, `update`, `reconcile` in the adapter; capabilities default to false.
2. Store OAuth tokens in the keychain; refresh tokens handled inside the adapter.
3. Verify against a sandbox/test shop or a draft-only flow (never publish live listings to test).
4. Only then set `verification = 'verified'`; the UI shows unverified adapters as export-only.
