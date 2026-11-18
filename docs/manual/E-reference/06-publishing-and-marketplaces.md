# Publishing and marketplaces

**Verification:** read from the code and the live Publishing status page (VERIFIED). Gumroad direct posting: NOT VERIFIED live.

## The marketplaces

| Marketplace | Direct posting? | What you do |
| --- | --- | --- |
| **Etsy** | **No.** Not built (needs an approved Etsy API app, OAuth and a real-shop check). The two Etsy keys in Settings are unused. | Export package, post it yourself, **Record publication** |
| **Gumroad** | A real API client exists, **never confirmed against a live account**, **off by default** | Either direct posting (after enabling) or export plus record |
| **Generic / other shop** | No. Export-only | Export ZIP with a `catalog.csv` row |

Others on the roadmap (Payhip, Whop, Sellfy, Shopify, Creative Market, Teachers Pay Teachers, Ko-fi, Podia, Bonanza) all work today only through the export package. Notion, Kindle Direct Publishing, Shopify and translations are deferred (Constitution item K).

## Gumroad direct publishing
Switches (Settings → Integrations → Gumroad, also in Marketplaces): **Allow posting products to Gumroad from this app** (off by default), **Post automatically when I approve a batch item** (off), **Publish immediately** (on; off makes drafts). Each file is uploaded, then the product is created with title, price, tags and description, then enabled. Cover images cannot be set through the API. Test the token with **Test token** (read-only). **Pull sales now** imports the last 90 days of sales into Analytics, once per sale id.

## The approval gate
Export, publish and record all need a valid, non-withdrawn approval whose fingerprint (a hash of the files, listing text and marketplace) matches now, **and** any QA warnings accepted. Otherwise: *"has no valid approval for its current files and listing text. Approve it in Batch approval first."*

## Unknown outcomes
A timeout or server error while creating a Gumroad product sets the listing to **Needs reconciliation** and is **never retried automatically**. You check the marketplace, then **It IS live** (with the address) or **It was NOT published**. This makes duplicates impossible.

## Listing rules and fees
Default Etsy rules: title 10 to 140 characters; description at least 150; 13 tags of at most 20 characters; 1 to 10 images; 5 files of at most 20 MB; minimum price 20 cents. Some could not be confirmed from Etsy's pages (you can edit them).

**What you keep** = price minus the marketplace's own fees:
- **Etsy:** 20-cent listing fee (shown separately), 6.5 percent transaction fee, payment processing 3 percent plus 25 cents. (A $5.99 listing: $5.17, 86 percent.)
- **Gumroad:** two figures: your own link (10 percent plus 50 cents) and Gumroad Discover (30 percent).
- **Generic:** only if you set fee numbers.
Not included: advertising, tax, refunds, currency conversion, your production cost. USD only; other currencies show "not available". Numbers were read from the marketplaces' pages on 2026-11-17; **only you can confirm they still match**.

## License tiers
Each product is **personal** (the original), **classroom** or **commercial**. The download's `LICENSE.txt` and the listing note follow it. Classroom and commercial wording is an **unreviewed draft** written by Claude; QA warns (`license_draft`) until you edit it in Settings → License text. What "commercial" lets a buyer do is your decision (Constitution item J); a lawyer's read is worth it before many sales.

## Marketing kit
Three Pinterest pins, pin copy, a launch email and social captions with a 20-second video script, built from the product's real contents with no AI and no claims about sales or reviews. Internal; never in the download.

## Yearly refresh
Approved dated products (monthly calendar, weekly planner, dated daily planner) appear on the Production calendar when their dates end within 90 days. **Make next edition** moves the dates on by exactly what they covered (once per product); **Never expires** stops the reminder.

---
**Previous:** [Files and formats](05-files-and-formats.md) · **Next:** [Errors and recovery](07-errors-and-recovery.md)
