# Glossary

Alphabetical. Each term is also explained where it first appears. **Verification:** definitions checked against the code and the running app (VERIFIED) unless marked.

**A–C**

- **Approval.** Your recorded decision that one *version* of a product may be exported or published for specific *listings*. Any material edit cancels it. See [States](02-states.md).
- **API.** A way for two programs to talk. Foundry uses APIs to ask AI providers and Gumroad for things. The app's own screens also talk to the app server through an API on `127.0.0.1:4317`.
- **API key.** A secret string that proves who you are to a service. Stored in the macOS Keychain; never in the database, logs or exports.
- **Archive.** Hide a product under "Archived". Reversible with Restore.
- **Audience.** Who a product is for (Students, Kids 4-8...). Steers tone, reading level and offline word lists.
- **Audit trail.** The list of every recorded action (Settings → Logs & audit).
- **Backlog.** On the Factory floor, approved products waiting for a cart.
- **Batch.** A group of products awaiting review. One per production-plan run; one per manually made product.
- **Brief.** Optional wording instructions to the AI (600 characters). Affects text only, and only when an AI key works.
- **Built-in content library.** The offline words and lists the app uses when no AI key works. Labelled that way in provenance.
- **Bundle / pack.** A product made of 2 to 20 approved products.
- **Cart.** A Factory floor collection of products with shared tags; becomes a pack when full.
- **Category.** The shelf a product belongs to (Calendars & Planners...). Read-only.
- **Chrome (headless).** Google Chrome running invisibly to turn pages into PDFs and previews.
- **CSV.** A plain-text table (comma-separated values). Opens in Excel or Numbers.
- **Codex.** The arcade's quest log of what a character learned.

**D–H**

- **Daily call limit.** A cap on AI calls per provider per day (Settings → Generation → pacing) to stay inside free allowances.
- **Dated / undated.** A planner with real printed dates, or generic pages.
- **Deliverable.** A file the customer receives, as opposed to internal files (marketing kit, manifest).
- **Design system.** A set of colours, fonts and layout rules.
- **Deterministic.** Produced by fixed rules with no AI (the built-in library). Also the policy value for "no key".
- **DPI.** Dots per inch; print resolution.
- **Dry run.** A command that shows what it *would* do without doing it. Several data commands are dry runs unless given `--apply`.
- **Evidence kind.** How trustworthy a data point is: measured, external estimate, AI hypothesis, unknown.
- **Export package.** A ZIP built from an approved listing: files, pictures, listing text and step-by-step instructions.
- **Factory floor.** The packing screen (carts and backlog).
- **Fallback.** The next provider or model tried when the first fails.
- **Fingerprint.** A hash of the files and listing text recorded at approval; if it changes, the approval is invalid.
- **Foundry / the factory / DAF / HAPPY DAFFY.** See [chapter 1](../A-start-here/01-what-is-asset-foundry.md).
- **Hard check.** A QA check whose failure blocks approval.
- **Hold for research.** Park a finished item with a note. Not a decision.
- **Hub.** The arcade's opening screen; also "hub mode", where one computer is the main one for others.

**I–N**

- **Idempotency key.** A token that makes a publish request safe to repeat once, so a retry cannot create a duplicate.
- **Import.** Bring in your own pictures or text.
- **Job.** One background step (for example Render). A product's pipeline has six.
- **Keychain.** The macOS password store where API keys live.
- **License tier.** Personal, Classroom or Commercial; chooses the license text in the download.
- **Listing.** A draft of what appears on a marketplace: title, description, tags, price.
- **Manifest.** A file listing every file with a short hash, in the ZIP and internally.
- **Migration.** A numbered database change. Applied ones are never edited or renumbered.
- **Month tabs.** Clickable month links inside a dated PDF.
- **Motif.** A repeating shape in a mandala (14 exist).
- **Needs reconciliation.** A publish attempt with an unknown result, held until you say what happened.

**O–R**

- **Opportunity.** A product idea with evidence and a score.
- **Pacing.** The rules that space out AI calls and rest a provider after a rate limit.
- **Paper size.** Letter, A4, A5 and so on; with orientation.
- **Pipeline.** The ordered steps a product goes through: content, artwork, render, QA, package, listings.
- **Preset.** A button that fills the New product form.
- **Procedural.** Drawn by an algorithm, not an AI.
- **Provenance.** The record of who or what produced each piece of content and file.
- **Provider.** A company that runs AI models (NVIDIA, Gemini...). Text and image providers are separate.
- **QA.** Quality assurance: automatic checks.
- **Rate limit.** A provider saying "too many requests". The provider is rested (default 15 minutes).
- **Record publication.** Tell Foundry you posted a listing yourself, with its address.
- **Render.** Turn pages into a PDF.
- **Rework.** The list of failed or sent-back items.

**S–Z**

- **Seed.** A number that makes procedural art repeatable. A variation gets a new seed.
- **SVG.** A picture made of lines and shapes; stays sharp at any size.
- **Superseded.** A version replaced by a newer one.
- **Tag.** A label on a product or import. Tags decide which packs a product can join.
- **Template.** A reusable product type, design, audience or theme.
- **Transient error.** A passing failure (rate limit, timeout); retried automatically.
- **Variation.** A separate product made from another with one thing changed.
- **Version.** One build of a product. Any edit or regenerate makes a new one; old ones are kept.
- **Warning.** A QA flag that must be fixed or accepted before approval; not a failure.
- **World / milestone / task.** The arcade's project structure.
- **XLSX.** An Excel workbook.

---
**Next:** [States](02-states.md) · **Back:** [Manual home](../README.md)
