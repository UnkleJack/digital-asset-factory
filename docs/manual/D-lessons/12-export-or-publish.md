# Lesson 12: Export or publish a finished product

**Verification:** Export package, the two direct-publish refusals, a wrong-site link and Record publication were exercised live (VERIFIED). **Gumroad direct posting was NOT run** and has never been proven against a live account (NOT VERIFIED). No real listing was created.

## Learning objective
Get an approved product onto a marketplace and make Foundry remember it.

## What we are creating
An Etsy export package for the sample mandala pack, and a (sample) recorded publication.

## What we need
An **approved** Etsy listing. No keys for Etsy: it is export-only.

## Steps
1. **Publishing status** → find the Etsy row → **Export package**. A ZIP downloads.
2. Unzip it. You should see `files/`, `images/01.png` to `03.png`, `listing.json`, `listing.txt`, `PUBLISHING_STEPS.md`.
3. Follow `PUBLISHING_STEPS.md` on Etsy (upload photos in order, paste the TITLE, DESCRIPTION and TAGS blocks, choose "Digital files", set the price, upload the file from `files/`, preview, publish).
4. Copy the live listing's address.
5. Back in Publishing status press **Record publication**, paste the address, press **Record**.

**Gumroad direct (optional, unproven).** Settings → Integrations: save a token, **Test token**, tick **Allow posting products to Gumroad from this app**. Then **Publish directly** works. **Post one product first and check it in Gumroad.** Cover images cannot be set through the API.

## Expected results (live)
- Export built the ZIP. Re-pressing reuses the same one.
- **Publish directly** on Etsy: *"Etsy direct publishing is not available... Use the export package and then record the publication."* On Gumroad while off: *"Gumroad direct publishing is off. Turn it on in Settings → Marketplaces → Gumroad..."*
- Recording a non-Etsy address: **"That URL is not an address on Etsy"**. Recording an `etsy.com` address set the listing to **Published (manual, unverified)**; the Dashboard Published tile and Analytics count it.

## What to inspect
The exported listing text matches what you approved. The recorded address is the real one.

## Common mistakes
Forgetting to **Record**; editing the listing after approval (blocks Export); believing "manual, unverified" is confirmed; leaving Gumroad's **Post automatically when I approve** on when you wanted to look first.

## Completion criteria
- [ ] Export downloaded and the steps followed.
- [ ] Publication recorded with the real address.
- [ ] I know which state means "unverified".

## What I learned
Foundry never publishes without an approval for that exact version and listing, never retries an unknown outcome blindly, and records what you tell it.

---
**Previous:** [Lesson 11](11-review-and-approve-a-batch.md) · **Next:** [Lesson 13: Review analytics](13-review-analytics.md) · **Screen:** [Publishing status](../B-screens/16-publishing-status.md)
