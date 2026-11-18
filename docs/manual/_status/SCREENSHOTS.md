# Screenshots

The manual is visual, but it never shows a fake screen.

## Rules followed

- Every screenshot in `docs/manual/images/` is of the **real interface**, captured on 2026-11-17 from a **throwaway copy** of the app with its own temporary data folder and sample data. None came from your real `data/` folder.
- Every product title in them starts with "Sample". The recorded "publication" and the analytics numbers are made up.
- No API key appears. The copy had no keys (an in-memory key store).
- No callouts or edits were added. Where a chapter needs to point at something it uses words, not drawn arrows.
- Screenshots were taken at 1280 pixels wide. The back office is shown in its dark theme; the arcade is always dark.

## What exists (about 60 files)

| Area | Files |
| --- | --- |
| Back office | dashboard, calendar, calendar-plan-editor, digest, research, research-data, research-scoring, library-list, library-gallery, library-new-product, library-new-product-mandala, library-build-pack, product-overview, product-qa, product-listings, product-qa-failed, product-bundle, product-imported, imports, factory-floor, templates, templates-design-systems, jobs, qa-results, batches, batch-review, batch-review-qa-failed, batch-review-warnings, rework, ai-notes, listings, listing-editor, publishing, analytics, settings-ai, settings-generation, settings-integrations, settings-license, settings-arcade, settings-backups, settings-system, missions |
| Arcade | arcade-hub, arcade-hub-sparks, arcade-hub-bio, arcade-hub-after, arcade-world-detail, arcade-task-workspace, arcade-task-made, arcade-qa-review, arcade-qa-reject, arcade-qa-delete, arcade-qa-approved, arcade-packs, arcade-leaderboards, arcade-codex, arcade-bmo, arcade-bin, arcade-missions, arcade-world-builder, arcade-ticker-editor |

Not every file is used in a chapter; the extras are kept as reference.

## Known limits

- The throwaway copy had **no AI key**, so no screenshot shows AI-written content, a working Test button, or B.M.O. answering. Chapters that need these say so.
- A few arcade screens are captured in their idle state (for example the Bin is empty, Leaderboards has no finished packs).
- Old screenshots in `docs/guide/images/` (45 files) are untouched and still used by the Walkthrough. They predate month tabs, the marketing kit, hold for research and license tiers in some cases.

## Still worth capturing when you have real data

- Settings → AI providers with a key saved and a passing Test.
- A Gumroad direct post (only after it is proven live).
- A product made with a real AI key, side by side with the offline version.
- The research digest email.
- A production plan run in the Calendar.
