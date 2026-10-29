# Getting started with Digital Asset Factory

This guide assumes you have never opened the app before. Follow it top to bottom once; after that, the daily routine at the end is all you need.

Everything runs on your own computer (Mac or Windows 11). Nothing is posted anywhere until you approve it. On Windows, read [WINDOWS.md](WINDOWS.md) first for the install steps.

---

## 1. What the app does

1. **Makes products**: printable PDFs (planners, trackers, budgets, invoices, coloring pages, word searches, mazes), with spreadsheets where they help.
2. **Checks them** (QA): page sizes, margins, spelling, duplicates, banned brand names.
3. **Writes listings** for each marketplace (title, description, tags, price, preview images).
4. **Waits for you** in *Batch approval*. You approve or reject each item, and say why when you reject.
5. **Publishes**: posts straight to Gumroad (once you turn that on), or builds a ready-to-upload package for every other marketplace.
6. **Watches the market**: every couple of days it emails you what's selling, what your competitors do well and badly, and two new product ideas that survived three rounds of critique.

---

## 2. Start the app

On Windows, double-click `start.bat` instead (see [WINDOWS.md](WINDOWS.md)). On a Mac, open **Terminal**, then:

```bash
cd ~/Projects/digital-asset-factory
npm start
```

When it says `Digital Asset Factory is running at http://127.0.0.1:4317`, open that address in Chrome. Leave the Terminal window open while you use the app. To stop it, click the Terminal window and press `Ctrl+C`.

You need Google Chrome (or, on Windows, Microsoft Edge, which is already installed) — the app uses it to make the PDFs and finds it automatically.

---

## 3. Get your keys (about 30 minutes, all free)

Keys are like passwords that let the app use other services. In the app they go in **Settings**. Each key field has a **"Get a free key ↗"** link that opens the right page.

Paste a key, press **Save**. Keys are stored in your Mac's Keychain and never shown again.

### 3a. AI (writes the text) — Settings → AI providers

Get **at least two**, so if one hits its daily limit the other takes over automatically.

| Provider | Where | Notes |
|---|---|---|
| **Groq** (start here) | console.groq.com/keys | Free. Around 1,000 requests a day per model at the time of writing. |
| **Google Gemini** | aistudio.google.com/apikey | Free tier on the Flash models (Pro models moved to paid in 2026). |
| **OpenRouter** | openrouter.ai/keys | Free models, no card. About 50 free calls a day without credit. |
| Cerebras | cloud.cerebras.ai | May ask for a card to unlock free credit. |
| Mistral | console.mistral.ai/api-keys | Had a free tier; reports from 2026 say terms changed. Check at signup. |
| GitHub Models | github.com → Settings → Developer settings → Fine-grained tokens, permission **Models: read** | Free daily allowance with any GitHub account. |
| Hugging Face | huggingface.co/settings/tokens | Small free monthly credit. |
| Together AI | api.together.ai/settings/api-keys | May now need a small credit purchase. |
| NVIDIA | build.nvidia.com | Free trial credits. |
| Anthropic | console.anthropic.com | **Paid.** Never used as an automatic backup unless you turn on "Allow paid fallback". |

The four added in this update (Gemini, Mistral, GitHub Models, Hugging Face) have not been tested with real keys yet: press **Test text provider** after adding each one.

Then press **Test text provider**. "Working" means it's ready.

*How the backup works:* every AI task tries your first choice (Settings → Generation → Text provider), then the providers in **Fallback order**. A provider that's rate-limited, down, or has no key is skipped. Free limits are set by the providers and change over time.

*Staying inside free limits (Settings → Generation → pacing):* calls to the same provider are spaced at least 2 seconds apart; each provider has a **daily call limit** (Groq 900, Gemini 200, GitHub 140, OpenRouter 45 to start — just under their free allowances); and a provider that says "slow down" is rested for 15 minutes. When one is resting or at its limit, the next one in the order is used. The app does **not** rotate several accounts or keys for the same provider to get around limits: that breaks most providers' terms and can get the accounts banned.

### 3b. Web search (for the research digest) — Settings → Integrations

Get **Tavily** and **Exa**; both are free with no credit card.

- **Tavily**: app.tavily.com → sign up → copy the key (starts with `tvly-`). About 1,000 free searches a month.
- **Exa**: dashboard.exa.ai/api-keys → sign up → create a key. Free monthly credit.
- Brave Search (optional): free credit, but needs a card on file.

The app also has its own **monthly search cap** (Digest page), so it can never run past the free credit.

> DuckDuckGo has no real public search API (only an "instant answer" box), and Google's search API is closed to new users, so they aren't used.

### 3c. Email (so the digest reaches your inbox) — Settings → Integrations

1. Make a **new Gmail account just for the business** (for example `yourshopname@gmail.com`). This keeps business mail separate and is free.
2. In that account: **Google Account → Security → 2-Step Verification → turn on**.
3. Then open **myaccount.google.com/apppasswords**, create one named "Digital Asset Factory", and copy the 16 letters.
4. In the app: Settings → Integrations → paste the 16 letters into **Gmail app password** → Save. The spaces don't matter.
5. In **Email (research digest)** type the new Gmail address → **Save** → **Send a test email**.

The digest is sent *from* the business Gmail *to* the address on the Digest page (daddyritz702@gmail.com by default).

### 3d. Gumroad (to post products automatically) — Settings → Integrations

1. Log in to Gumroad (create a free account if needed).
2. **Settings → Advanced → Applications**: create an application (any name; for the redirect URI you can use `http://127.0.0.1`), then press **Generate access token**.
3. Paste it into **Gumroad access token** → Save → **Test token**. It should show your account name.
4. Tick **Allow posting products to Gumroad from this app** → Save.
5. Optional: tick **Post automatically when I approve a batch item**.
6. Optional: untick **Publish immediately** to create drafts you switch on yourself in Gumroad.

Gumroad's API can't set cover images, so add one in Gumroad if you want it.

> **Direct Gumroad posting has not yet been tested against a real Gumroad account.** Post one product first, open it in your Gumroad dashboard, and check the title, price, description and files are right before relying on it.

---

## 4. Make your first products

1. **Product library → New product**.
2. Choose **what you're making** (a category), then **which kind** (each card says whether it needs AI or a key).
3. Pick a design system, fonts, audience, theme and paper size. The font sample shows the real fonts.
4. Optional: **Also make variations**, for example the same tracker in 3 font styles, or 4 extra mandala packs with new random patterns.
5. **Create**. Watch it go through the steps on the product page (about a minute each).

**Make it automatic:** **Production calendar → New production plan** makes products on a schedule, for example 3 different types every day at 9am. They wait in Batch approval for you.

**Spread the work out:** make 3–4 plans at different hours instead of one big one (for example 7am planners, 1pm coloring pages, 8pm kids' activities). **Spread the start** (default 15 minutes) makes each plan start at a slightly different time each day so it never hits the AI providers on the exact minute. **Run on computer** pins a plan to one machine when you use two (see section 10).

## 5. Packs: the Factory floor (automatic) and Build a pack (by hand)

**Factory floor** sorts finished products into packs for you:

- Every product carries **tags**: category, type, theme, audience, season, design style, plus any you add (product page → **Tags**, or **✦ Suggest with AI**). One product can carry many tags, so it can go into several packs.
- When a product passes QA it rolls onto the floor. It joins every open **cart** whose tags it matches (up to 3 carts), or starts a new cart. Up to **6 carts** build at once.
- If it fits none and all 6 are in use, it waits in the **backlog**.
- When a cart reaches **8 items** it becomes a pack automatically and goes through QA and Batch approval like any product.
- When nothing is being made (the factory's **break**), the backlog is re-sorted with a looser match. Carts that sat for 3 days are packed if they have at least 4 items, or emptied back to the backlog. Leftovers that match nothing become a **Variety pack**.
- **Remix winners** opens a cart around a tag your best sellers share but have never been packed under, and fills it from the whole library.
- A product goes into at most 4 packs, and waits 30 days before going into another pack with mostly the same tags.

All of these numbers are in **Settings → Packing**. You can also open a cart yourself (**New cart**), **Fill from library**, move backlog items into a cart, **Pack it** early or **Empty** a cart.

**Build a pack by hand:** **Product library → Build a pack**. Click the products you want (only ones that passed QA show), give it a theme, press **Suggest titles & description with AI**, pick a title, edit the description, and **Create pack**.

## 6. Review and approve (every evening)

**Batch approval** shows each item with previews, files and listings.

- **Approve**: it's ready to sell. With auto-posting on, Gumroad listings go up straight away.
- **Reject**, **Request revision** or **Regenerate**: always write *why* (for example "text too small", "colors too dull", "too generic"). Those reasons are fed into the research digest's idea critique today, and are the raw material for the app learning your taste later.

## 7. Publish everywhere else

**Publishing status**: for each approved listing,

- **Gumroad**: **Publish directly** (or it already happened on approval).
- **Etsy and others**: **Export package** downloads a ZIP with the files, images, listing text and step-by-step `PUBLISHING_STEPS.md`. Post it on the marketplace, then **Record publication** and paste the listing URL so the app can track it.

## 8. The research digest

**Research digest** page:

1. Tick **Send a digest automatically**. Every 2 days is the default; you can change it.
2. Choose the platforms to scan (click the chips).
3. Write **your taste**: what you like and what you never want. The critique scores ideas against it.
4. Add the **competitor shops** you're up against (paste their shop URLs).
5. **Run a digest now** to try it. It takes a few minutes.

Each digest has three parts: what's selling on each platform and where sellers fall short; your competitors' strengths and weak spots; and two ideas that survived a brainstorm, a separate harsh critique, and a refinement pass.

**About the numbers:** a number (sales, revenue, reviews) is only shown if it appears in the web page the app found, with a link to that page. Anything the AI inferred is labeled "AI inference". Many platforms don't publish seller sales at all, so some digests will have few hard numbers; that's honest, not a bug.

Press **Save to Research** on an idea you like to turn it into an opportunity you can produce from.

## 9. Sales tracking

- **Gumroad** sales are pulled in automatically every 6 hours (Settings → Integrations → **Pull sales now** to do it immediately).
- **Other marketplaces**: download your sales CSV from the marketplace and import it under **Analytics**.
- **Analytics** shows what sold and when, by product and by source, plus recommendations (produce more of X, retire Y, make a bundle of Z).

## 10. Two computers (Mac + Windows laptop)

Keep **one computer as the hub**: it holds the database, the files and does the production. Never put the data folder in Dropbox, iCloud or OneDrive while the app is running; the database can be damaged.

1. On both computers, install **Tailscale** (tailscale.com/download, free) and sign in with the same account. This lets them reach each other from anywhere, encrypted. (Same Wi-Fi also works without it.)
2. On the hub: **Settings → System → Use from another computer** → **Make an access token**, copy it, tick **Allow other computers**, then quit and restart the app.
3. On the other computer, open one of the addresses shown there (for example `http://100.x.y.z:4317`) in the browser and paste the token. You can now review, pack and publish from that computer while the hub keeps producing.

The other computer can also run its own copy of the app with its own production plans (pin plans to it with **Run on computer**), but its products stay in its own library for now; sending them to the hub automatically is planned next.

---

## Daily routine

| When | What |
|---|---|
| Morning | Nothing. The production plan makes today's products. |
| Evening (10–20 min) | **Batch approval**: approve or reject with reasons. Approved Gumroad items post themselves. Glance at the **Factory floor**: packs that filled up are in Batch approval too. |
| Evening | **Publishing status**: export and post one or two items to another marketplace. |
| Every 2 days | Read the digest email. Save any good idea to Research. |
| Weekly | **Analytics**: import other marketplaces' sales CSVs and read the recommendations. |

---

## Where to sell (the roadmap)

Each marketplace gets direct posting one at a time, and only after the previous one is proven with a real account.

| # | Platform | Kind | Direct posting |
|---|---|---|---|
| 1 | **Gumroad** | Creator storefront | **Built now** (needs a first live check) |
| 2 | Payhip | Creator storefront | Next candidate (has an API) |
| 3 | Etsy | Marketplace with its own buyer traffic | Needs an Etsy developer app + OAuth; planned |
| 4 | Whop | Digital products / communities | Has an API; planned |
| 5 | Sellfy | Creator storefront | To check |
| 6 | Shopify | Your own store ($/month) | Only if you open a store |
| 7 | Creative Market | Design-asset marketplace | No public seller API found; export package |
| 8 | Teachers Pay Teachers | Education marketplace | No public seller API found; export package |
| 9 | Ko-fi Shop | Creator tips + shop | Export package |
| 10 | Podia | Courses + digital downloads | To check |
| 11 | Bonanza | General marketplace | To check |
| 12 | Redbubble / Zazzle / Spoonflower | Print-on-demand (physical goods) | A different model; later |

Every platform already works today through the export package and **Record publication**.

---

## When something goes wrong

- **"No AI provider has an API key"**: add one in Settings → AI providers.
- **AI test fails but a backup answered**: the first provider's key is wrong or it hit its limit; the backup carried on.
- **"Gmail refused the login"**: use the 16-letter app password, not your normal Gmail password, and check the sending address.
- **"monthly web-search budget is used up"**: wait for next month or raise the cap on the Digest page.
- **Gumroad "token was rejected"**: generate a new token in Gumroad and save it again.
- **"needs reconciliation"**: a publish request may or may not have gone through. Check the marketplace, then tell the app on the Publishing page. It never retries blindly, so you can't get duplicates.
- **"skipped: reached today's limit"**: that provider hit its daily call limit; the next one in the order was used. Raise the limit in Settings → Generation → pacing only if the provider's own free allowance is higher.
- **The other computer shows "Remote access is turned off"**: on the hub, tick **Allow other computers**, make sure a token exists, and restart the app.
- Logs: **Settings → Logs & audit**.
