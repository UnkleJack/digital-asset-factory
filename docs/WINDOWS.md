# Running Digital Asset Factory on Windows 11

The app runs the same on Windows as on a Mac. These steps take about 15 minutes the first time.

> **Not yet tested on a real Windows computer.** The Windows-specific parts (finding Chrome or Edge, storing keys encrypted for your Windows account, the start script) are covered by automated tests on the Mac only. Do the first run below and tell me what you see before relying on it.

## 1. Install what it needs

1. **Node.js 26 or newer**: go to [nodejs.org](https://nodejs.org), download the Windows installer (`.msi`), and run it with the default options.
2. **Google Chrome** (recommended) from [google.com/chrome](https://www.google.com/chrome). If you skip it, the app uses **Microsoft Edge**, which Windows already has.
3. **Get the app folder** onto the laptop: copy the whole `digital-asset-factory` folder (without `node_modules` and `data`) to, for example, `C:\Users\<you>\digital-asset-factory`. Using Git (`git clone`) works too.

## 2. Start it

Double-click **`start.bat`** in the app folder.

- The first time, it installs the parts it needs (a few minutes).
- Then it builds the interface and starts. When the window says `Digital Asset Factory is running at http://127.0.0.1:4317`, open that address in Chrome or Edge.
- Leave that black window open while you use the app. Close it to stop the app.

If Windows asks whether to allow Node.js through the firewall: choose **Private networks** only. (You only need this if another computer will connect to this one.)

Prefer PowerShell? Right-click **`start.ps1`** → **Run with PowerShell**.

## 3. Your keys

Paste keys in **Settings → AI providers** and **Settings → Integrations**, exactly as in the [getting started guide](GETTING_STARTED.md#3-get-your-keys-about-30-minutes-all-free). On Windows they are encrypted so that only your Windows account on this laptop can read them, and stored in `data\secrets.dpapi.json`. Copying that file to another computer does not copy the keys; enter them again there.

## 4. Using it with your Mac

Pick one computer as the **hub** (the one that makes and stores the products, usually the Mac). Follow [section 10 of the guide](GETTING_STARTED.md#10-two-computers-mac--windows-laptop): install Tailscale on both, turn on **Use from another computer** on the hub, and open the hub's address in the laptop's browser.

If the laptop also runs its own copy of the app, give it its own production plans and pin them with **Run on computer** (its name is shown in the plan form), so the two don't make the same thing at the same hour.

## Troubleshooting

| What you see | What to do |
|---|---|
| `'node' is not recognized` | Node.js isn't installed, or the window was open during install. Install it, then close and reopen. |
| `Google Chrome or Microsoft Edge was not found` | Install Chrome, or set **Settings → Rendering → Chrome path** to `chrome.exe` / `msedge.exe`. |
| `Windows secret storage failed` | PowerShell is blocked on this computer (some work laptops). Use environment variables instead: see `.env.example`. |
| `Port 4317 is already in use` | The app is already running in another window, or set `DAF_PORT=4318` in a `.env` file. |
