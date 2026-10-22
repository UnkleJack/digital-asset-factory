# Handoff: Digital Asset Factory

Paste the section under **Prompt** into a new Claude Code session opened in this project folder.
Everything else in this file is reference for you.

---

## Prompt

You are continuing work on **Digital Asset Factory**, a local-first Node/TypeScript app that produces
printable digital products (coloring pages, planners, trackers, budgets, invoices, word searches, bundles),
runs QA on them, prepares marketplace listings and export packages, and records manual publications.
A human approves every batch before anything is exported or published.

**Read first:** `README.md`, `docs/ACCEPTANCE_REPORT.md`, `docs/ARCHITECTURE.md`, `TASKS.md`, and this file.

**Current state**
- Branch `pass-2-3-implementation` at commit `062bd5f` (Pass 2 + Pass 3 work). Pass 1 is `12147fb` on `main`.
- Uncommitted changes add multi-provider AI text generation (OpenRouter, Groq, NVIDIA NIM, Cerebras,
  Together AI alongside Anthropic). These were written by a Sonnet session, **not reviewed by Opus**. Review
  them before committing. Test suite: 67/67 passing; typecheck clean.
- The app runs locally on `127.0.0.1:4317` (`npm start`). It uses an in-memory secret store only when
  `DAF_SECRET_STORE=memory` is set. Normal use stores API keys in the macOS Keychain.
- No real API keys have been tested. AI text and image generation are verified only against mock servers.
  Do not assume live AI works.

**Open requests from the user, in priority order**
1. **"Get a free key" links** next to each AI provider in Settings → AI providers. Links are:
   OpenRouter `https://openrouter.ai/keys`, Groq `https://console.groq.com/keys`,
   NVIDIA `https://build.nvidia.com`, Cerebras `https://cloud.cerebras.ai`,
   Together `https://api.together.ai/settings/api-keys`, Anthropic `https://console.anthropic.com`,
   OpenAI `https://platform.openai.com/api-keys`. Use the `providers` metadata in `src/engine/generation/providers.ts`.
2. **"Text prices (JSON)" box is confusing.** It only estimates cost per token for the cost guard. The user
   does not plan to pay for APIs. Move it under an "Advanced" heading and explain it in one sentence, or hide it.
3. **Product choice is too limited.** The user wants to pick, when creating a product:
   - Content variant (for example, plain color page vs themed coloring picture vs deliverable type).
   - **Font pairing.** Today fonts come from design-system tokens and only 5 fonts exist (`FONT_IDS` in
     `src/engine/templates/library.ts`). Add a font selector to New Product, and consider a font list.
   - **Optional bulk variants at creation**, using the existing `variationAxes` and `POST /api/products/:id/variations`.
   - Custom design systems: the API exists (`POST /api/design-systems`) but there is no UI for it.
4. **Portable use.** The user wants to run this offline, on another computer, and to give a copy to a
   friend. Not built yet. Options to present: git clone plus `npm install` (needs Node 26 and Google Chrome),
   a zipped folder including `node_modules`, or a packaged macOS app (Electron is planned in `desktop/` but
   not built). Recommend one and explain the tradeoffs.
5. **Two radical ideas plus one "you never thought of this" idea** for what gets made or where full packages
   can be exported. The user asked for these and has not received them yet.

**How to work**
- The user is on a Mac. Prefer small, verified changes. Run `npm test` and `npm run typecheck` after each change.
- For UI changes, run the app and check the screen in the browser. Don't ask the user to check manually.
- Do not commit or push unless the user asks. Keep `.claude/` out of git.

---

## Reference

### Move the project into VS Code

The project lives in a folder the app created for this session, which is deleted when the session ends.
Copy it somewhere permanent first:

```bash
mkdir -p ~/Projects
rsync -a --exclude node_modules --exclude verification-output --exclude web/dist "<PROJECT_FOLDER>/" ~/Projects/digital-asset-factory/
cd ~/Projects/digital-asset-factory
npm install
npm test
code .
```

`<PROJECT_FOLDER>` is this session's working folder. Open it from the file pane in the app, or ask Claude
to tell you the path. Note: `.git` is copied with the folder, so the branch and history come along.

### Repository layout

```
digital-asset-factory/
├── README.md                    setup, daily use, troubleshooting
├── TASKS.md                     task checklist with evidence per task
├── HANDOFF.md                   this file (delete once the repo is set up)
├── .env.example                 optional settings, provider key names
├── .gitignore                   data/, .env, node_modules/, verification-output/, .claude/
├── .nvmrc                       Node version pin
├── package.json / package-lock.json
├── tsconfig.json
├── docs/
│   ├── PRODUCT_SPEC.md          what the product is, lifecycle, categories
│   ├── ARCHITECTURE.md          stack, module map, provider contracts
│   ├── DATA_MODEL.md            tables and provenance
│   ├── SECURITY_AND_PUBLISHING.md
│   ├── ACCEPTANCE_CRITERIA.md   criteria with PASS/PARTIAL/BLOCKED status
│   ├── ACCEPTANCE_REPORT.md     test evidence, defects, limitations
│   └── IMPLEMENTATION_PLAN.md
├── scripts/
│   ├── launch-app.ts            start server and open an app window
│   ├── migrate.ts / backup.ts / restore.ts
│   └── generate-samples.ts      produce one sample of every product type
├── src/                         server, engine and jobs (run directly by Node)
│   ├── main.ts                  entry point: lock, worker, scheduler, HTTP server
│   ├── app/                     bootstrap and app context
│   ├── config/                  paths, settings schema, secret stores
│   ├── core/                    ids, errors, hashing, time, semaphore
│   ├── db/                      SQLite wrapper, migrations, repositories
│   ├── engine/
│   │   ├── research/ scoring/   opportunities and evidence-based scoring
│   │   ├── specification/       product versions and content signatures
│   │   ├── templates/           design systems, audiences, themes, seeds
│   │   ├── producttypes/        15 product types + bundles (plugin registry)
│   │   ├── generation/          AI providers (Anthropic, OpenAI image, 5 OpenAI-compatible text)
│   │   ├── rendering/           HTML/CSS to PDF and PNG via headless Chrome
│   │   ├── qa/                  deliverable and release checks, spelling
│   │   ├── packaging/           ZIP, license, instructions, listing images
│   │   ├── listing/             marketplace copy and rules
│   │   ├── approval/            batches and fingerprint-bound decisions
│   │   ├── publishing/          export packages, manual records, reconciliation
│   │   ├── bundling/            bundles and variations
│   │   └── analytics/           production metrics, sales import, recommendations
│   ├── jobs/                    SQLite job queue, worker, production pipeline
│   ├── scheduler/               production plans and daily runs
│   ├── server/                  Fastify app, guards, routes (products, settings, ...)
│   ├── storage/                 path-safe asset store
│   ├── logging/                 JSONL logs, redaction, audit
│   └── ops/                     backups and single-instance lock
├── web/                         React UI (Vite), built to web/dist
│   ├── src/pages/               13 screens: Dashboard, Calendar, Library, Research,
│   │                            Templates, Jobs, Qa, Batches, Listings, Publishing,
│   │                            Analytics, Settings, ProductDetail
│   ├── src/api.ts / format.ts / ui.tsx / styles.css
│   └── vite.config.ts
└── tests/                       node --test; renders real PDFs with Chrome
    ├── foundation, lifecycle, operations, server, producttypes, providers,
    │   openai-compat, qa          (67 tests total)
    └── helpers.ts / mockServers.ts
```

**Not yet in the repo:** `desktop/` (Electron shell, planned), a portable package script, and `README` sections
for portable/offline use. `.claude/` should be added to `.gitignore` before the first push.

### Suggested first commands in the new repo

```bash
git status
git add -A && git commit -m "Multi-provider AI text generation"   # after review
git remote add origin git@github.com:<you>/digital-asset-factory.git
git push -u origin pass-2-3-implementation
```
