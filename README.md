# Digital Asset Factory

A local-first application that produces printable digital products (calendars, planners, trackers,
journals, budget and invoice templates, coloring and activity pages, bundles), checks them, prepares
marketplace listings and export packages, and tracks what you publish. Everything runs on your
computer; nothing is published without your approval in **Batch approval**.

What it does today, honestly:

| Area | Status |
|---|---|
| Production of 15 product types (PDF, plus CSV/XLSX where relevant) and bundles | Works offline with the built-in content library |
| AI text — Groq, OpenRouter, Cerebras, Together, NVIDIA, Anthropic, with automatic fallback between them | Built and tested against local stand-in servers; **not yet verified with real keys** |
| AI images (OpenAI) | Built and tested against mock servers; **not yet verified with real keys** |
| QA, packaging, listing drafts, batch approval, export packages | Works |
| Daily production plans (scheduler) | Works while the app is running |
| Gumroad **direct** publishing (opt-in) | Built against Gumroad's own CLI source; **not yet run against a live account** |
| Etsy and other marketplaces | Export package + record the URL (direct posting is on the roadmap) |
| Pack builder with AI title/description suggestions | Works (AI part needs a key) |
| Research digest email (best sellers, competitors, 2 vetted ideas) | Built and tested with stand-ins; **needs a live run with real search keys and Gmail** |
| Sales analytics | Gumroad sales pulled automatically every 6 hours; other marketplaces by CSV import |

**New here? Start with [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** — every key to get, where to get it, and the daily routine.

See [docs/ACCEPTANCE_REPORT.md](docs/ACCEPTANCE_REPORT.md) for what was verified and how.

## Requirements

- macOS (Apple Silicon or Intel). Linux should work but is untested; Keychain storage is macOS-only.
- **Node.js 26** or newer (`node --version`). The app runs TypeScript directly; there is no build step for the server.
- **Google Chrome** installed in `/Applications` (used headless to render PDFs). Another path can be set in Settings → Rendering.

## Set up

```bash
npm install
```

```bash
npm start
```

`npm start` builds the web interface, applies database migrations, and serves the app at
**http://127.0.0.1:4317**. Data goes to `./data` unless `DAF_DATA_DIR` says otherwise.

To open it in its own window (a Chrome app window with a separate profile):

```bash
npm run app
```

Optional settings live in `.env` (copy [.env.example](.env.example)). API keys go in
**Settings → AI providers**, which stores them in the macOS Keychain — never in `.env`, the
database, logs or exports.

## AI providers

Without any key, the app still produces every non-illustrated product type using its built-in
content library (labelled that way in every product's provenance) — AI is optional.

For AI-written text, pick one provider in **Settings → Generation → Text provider** and add its key
in **Settings → AI providers**:

| Provider | Get a key | Notes |
|---|---|---|
| Anthropic | [console.anthropic.com](https://console.anthropic.com) | Default; paid, highest quality |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | `:free`-suffixed models on their catalog |
| Groq | [console.groq.com/keys](https://console.groq.com/keys) | Fast inference, generous free tier |
| NVIDIA NIM | [build.nvidia.com](https://build.nvidia.com) | Free trial API credits, not permanently free |
| Cerebras | [cloud.cerebras.ai](https://cloud.cerebras.ai) | Free tier, rate-limited |
| Together AI | [api.together.ai/settings/api-keys](https://api.together.ai/settings/api-keys) | `-Free`-suffixed models on their catalog |

Only one text provider is active at a time; you don't need keys for the others. **Free-tier terms,
rate limits and which exact model is free change on each provider's side** — check their pricing
page before relying on it, and use **Settings → AI providers → Test text provider** (makes one real,
possibly billed call) to confirm it actually works before running production. The five
OpenRouter/Groq/NVIDIA/Cerebras/Together entries all speak the same OpenAI-compatible
`/chat/completions` API, so the same code path and model/base-URL settings work for any other
OpenAI-compatible host too — just point the base URL at it.

AI images (for illustrated coloring pages) use OpenAI only, under **Settings → Generation → Image provider**.

## Daily use

1. **Research** — add product ideas with whatever evidence you have (or import a keyword CSV). The
   score only uses evidence you supply; missing data stays “unknown” and lowers confidence.
2. **Production calendar** — create a production plan (time, days, quota, cost limit). While the app
   runs, each scheduled run picks eligible ideas and produces them into a review batch. You can also
   create products directly from **Product library → New product**.
3. **Batch approval** — review previews, QA results and listing text; approve per marketplace,
   send back for revision, regenerate or reject. Editing anything after approval cancels the approval.
4. **Publishing status** — download the export package for an approved listing, publish it yourself
   by following `PUBLISHING_STEPS.md` inside it, then **Record publication** with the live URL.
5. **Analytics** — import your marketplace's sales CSV or enter numbers; recommendations appear when
   there is evidence for them.

Scheduled runs only happen while the app is running. A run missed while the computer was off is
recorded, and the most recent missed run is caught up at start-up (within the catch-up window in Settings).

## Commands

| Command | What it does |
|---|---|
| `npm start` | Build the web UI and start the app |
| `npm run serve` | Start without rebuilding the web UI |
| `npm run app` | Start the app if needed and open it in an app window |
| `npm run dev` + `npm run dev:web` | Development: server restarts on change; Vite UI on :5173 (set `DAF_DEV=1`) |
| `npm test` | Run the automated tests (about 2 minutes; renders real PDFs with Chrome) |
| `npm run typecheck` | Type-check server and web code |
| `npm run samples` | Produce one sample of every product type into `verification-output/samples` |
| `npm run migrate` | Apply database migrations (also done automatically at start-up) |
| `npm run backup` | Snapshot the database and files into `data/backups` (`-- --list` to list) |
| `npm run restore -- <name>` | Restore a backup (quit the app first) |

## Backup and restore

- **Settings → Backups** or `npm run backup` makes a consistent snapshot of the database and every
  generated file. Migrations also back up automatically before changing the schema.
- To restore: quit the app, run `npm run restore` to list backups, then `npm run restore -- <name>`.
  Your current data is moved aside (not deleted); the command prints where.
- To move to another computer, copy the whole data folder (with the app stopped). API keys are not
  in it — enter them again in Settings on the new machine.

## Where things are

```
src/            server, engine and jobs (TypeScript, run directly by Node)
  engine/       research, scoring, product types, rendering, QA, packaging, listings, approval, publishing, analytics
  jobs/         SQLite-backed job queue, worker and the production pipeline
  scheduler/    production plans and daily runs
  server/       local HTTP API (127.0.0.1 only)
web/            React interface (built into web/dist)
tests/          automated tests (node --test)
scripts/        launch, backup, restore, migrate, samples
docs/           specification, architecture, data model, security, acceptance criteria and report
data/           your database, files, logs and backups (git-ignored)
```

## Troubleshooting

| Problem | Fix |
|---|---|
| “Port 4317 is already in use” | Another copy is running — open http://127.0.0.1:4317 — or set `DAF_PORT`. |
| “already running (process N) on this data folder” | Quit the other copy. If it crashed, the lock clears itself once that process is gone. |
| Rendering jobs fail with “Chrome was not found” | Install Google Chrome, or set its path in Settings → Rendering. |
| Products say “built-in content library” | No AI key is configured or the key failed its test; see Settings → AI providers. |
| “Illustrated coloring pages” fail | That type needs an image provider key (Settings → AI providers). |
| A listing says “needs reconciliation” | A publish attempt had an unknown result. Check the marketplace, then use **Reconcile** on Publishing status. |
| Database integrity error at start-up | Restore the latest backup with `npm run restore`. |
| Logs | Settings → Logs & audit, or `data/logs/*.jsonl` (secrets are redacted). |
