# 2. First run and navigation

**In this chapter:** start the app, find your way around the sidebar, learn the controls every screen shares, and learn what each "empty" screen means.

**Verification:** screens captured from a throwaway copy of the app (VERIFIED). Starting the Dock app from Finder is NOT VERIFIED here (the Constitution says it has not yet been double-clicked from Finder).

## What you need first

- A Mac with **Node.js 26** (the project's `.nvmrc` asks for it) and **Google Chrome** in Applications. Chrome is not just for browsing: the app uses it invisibly to turn pages into PDFs.
- The project folder: `/Users/jadeddragon/Projects/digital-asset-factory`.
- No AI key is needed to start. Without one, products use the built-in content library.

## Start the app

There are two ways. Pick one.

**A. From Terminal.**

1. Open Terminal.
2. Run `cd ~/Projects/digital-asset-factory`, then `npm start`.
3. Wait for the line saying Asset Foundry is running at `http://127.0.0.1:4317`. (`127.0.0.1` means "this computer". Nothing outside your Mac can open it.)
4. Open that address in Chrome. Leave the Terminal window open while you work. To stop the app, click the Terminal window and press **Ctrl+C**.

`npm start` rebuilds the web screens first, which takes a little longer. `npm run serve` skips the rebuild.

**B. The Dock app.** `npm run make-mac-app` builds `dist-mac/Asset Foundry.app`. Drag it into Applications and keep it in the Dock. One click starts the app if it is not running and opens the arcade in its own window. If Node or the folder moves, run the command again. If it cannot start, it shows an alert and writes `~/Library/Logs/Asset Foundry.log`.

**What you should see:** the Dashboard, with the Asset Foundry name top-left and an "AI" line under it. With no key it says **AI not configured**. That is normal for a first run.

**If something goes wrong:** see [Errors and recovery](../E-reference/07-errors-and-recovery.md). The usual two are "Port 4317 is already in use" (another copy is already running: just open the address) and "Chrome was not found".

## The sidebar

The left sidebar is your map. A green number beside an item is how many things are waiting there.

| Group | Item | What it is for |
| --- | --- | --- |
| (top) | HAPPY DAFFY arcade | Opens the arcade at `/arcade` |
| | Missions | A checklist that teaches you every screen |
| | Dashboard | Status at a glance |
| | Production calendar | Scheduled plans, what ran, what is due for a new edition |
| **Make** | Research digest | Weekly emailed market research |
| | Research & opportunities | Product ideas and their scores |
| | Product library | Every product; also where you start a new one |
| | Imports | Your own pictures and text examples |
| | Factory floor | Carts that sort approved products into packs |
| | Templates | Product types, design systems, audiences, themes |
| | Production jobs | The background steps, for when something seems stuck |
| | QA results | The automatic checks |
| **Sell** | Batch approval | Where you approve or reject |
| | Rework | Everything that failed or was sent back |
| | Notes for the AI | What you have told the AI, and the repeat problems it learned |
| | Marketplace listings | Listing drafts per marketplace |
| | Publishing status | Export packages and recorded publications |
| | Analytics | Sales numbers and recommendations |
| **System** | Settings & integrations | Keys, options, backups, logs |

Each screen is a chapter in [Part B](../README.md#chapters-planned-structure). There are also two **sub-pages** with no sidebar entry: the **product page** (click any product title) and the **batch review page** (click a batch name).

## Controls every screen shares

- **? Instructions** (round button, bottom-right). Opens that screen's chapter of the older [Walkthrough](../../guide/WALKTHROUGH.md) in a pop-up. It is hidden on Missions and the arcade.
- **Compact lists.** Long lists sit in a box of fixed height. The header shows the true total ("22 products"). A **Load more** button at the bottom shows more rows.
- **Preview / Hide preview.** Pictures load only when you press Preview, one row at a time, so pages stay quick.
- **Show finished ... boxes.** Done work is hidden by default. Tick "Show finished jobs" or "Show closed batches" to see it.
- **Clear view.** On several lists this hides what you have already looked at, without deleting anything.
- **Pills.** Small coloured labels show status: green is fine, yellow is waiting or a warning, red is a failure.
- **Pop-ups.** Forms open in a window. **Cancel** or the **x** closes it without saving. Buttons that delete or archive ask "Are you sure?" first.
- **Dropping pictures anywhere.** Dragging a picture onto any back-office or arcade screen imports it into the image library. Drops into typing boxes are ignored.

## What an empty screen means

A screen with nothing on it is rarely broken. Use this table.

| You see | It means | Do this |
| --- | --- | --- |
| Dashboard: "No untried ideas" / "No traction data" | You have no research ideas and no sales yet. | Nothing is wrong. Add ideas in Research & opportunities when you want them. |
| Product library: "No products here yet" | You have not made anything. | Press **New product**. |
| Batch approval: nothing listed | No finished product is waiting. | Make a product, or tick "Show closed batches". |
| Production jobs: "Nothing running or failed" | All is well. Finished jobs are hidden. | Tick "Show finished jobs" to see history. |
| QA results: "No failures recorded" | No check has failed. | Good news. |
| Calendar: "No production plans yet" | You have not set up automatic production. | Optional. |
| Factory floor: empty carts | Nothing approved has landed here yet. | Approve products in Batch approval. |
| Publishing: "Nothing to publish yet" | No listing exists, or none is approved. | Approve a listing first. |
| Analytics: "No sales data yet" | You have not entered or imported any numbers. | See [Analytics](../B-screens/17-analytics.md). |
| Dashboard banner "AI text generation is not active" | No text AI key works. Products use the built-in library. | Add a key in Settings → AI providers if you want AI-written text. |
| Banner "Google Chrome was not found" | PDFs cannot be made. | Install Chrome or set its path in Settings → Rendering. |
| Header "The app server is not responding" | The app stopped or crashed. | Restart it from Terminal. |

The last two are genuine problems. The rest are the app waiting for you to do something.

---

**Previous:** [1. What Asset Foundry is](01-what-is-asset-foundry.md) · **Next:** [3. Your first product](03-your-first-product.md)
