# Opening Asset Foundry at daf.promptpimps.com

This guide puts Asset Foundry on the internet at **https://daf.promptpimps.com**, so you can use it from your phone or any computer, anywhere. The app keeps running on your Mac. Nothing is uploaded or copied to a server.

It takes about an hour, most of it waiting for the domain move in Part 1.

## How it works, in one paragraph

A small free program from Cloudflare, called `cloudflared`, runs on your Mac. It makes an outgoing, encrypted connection to Cloudflare. When someone opens `daf.promptpimps.com`, Cloudflare passes the visit down that connection to the app. No ports are opened on your router, and your home address isn't published.

There are **two locks** on the door:

1. **Cloudflare Access** (Part 2). Before anyone reaches your Mac, Cloudflare asks for an email address and sends a one-time code to it. Only your email is allowed.
2. **The app's own access token** (Part 3). After that, the app asks for its access token, the same one used for your other laptop.

The app treats every visit through the tunnel as coming from outside, even though the tunnel runs on the Mac itself. So the token is always asked for. This is checked by `tests/server.test.ts` ("public access").

Why not `www.promptpimps.com/DAF`? Your website is on IONOS hosting, which can't pass part of the site on to your Mac. The app also expects to sit at the top of its own address (`/arcade`, `/login` and so on). A subdomain gives it that.

---

## Part 1: Move the domain's DNS to Cloudflare (free)

DNS is the address book that says where `promptpimps.com` lives. Today IONOS runs it (its name servers end in `ui-dns`). Cloudflare can only make the tunnel if it runs the address book. **Your website and email stay at IONOS.** Only the address book moves.

**Before you start, write down every record.**

1. Sign in to IONOS. Go to **Domains & SSL**, pick `promptpimps.com`, then **DNS**.
2. Take screenshots of the whole list, or copy it into a note. Look for:
   - **A** records: the root (`@`) and `www`, both pointing to `74.208.236.219`. These keep the website working.
   - **MX** records: these deliver your email (for IONOS mail they look like `mx00.ionos.com` and `mx01.ionos.com`).
   - **TXT** records: email checks such as SPF (`v=spf1 ...`), DMARC (`_dmarc`), and any site-verification codes (Google, for example).
   - **CNAME** records: things like `autodiscover` or `_domainkey` for email.
   - Anything else on the list.

**Add the domain to Cloudflare.**

3. Make a free account at [dash.cloudflare.com](https://dash.cloudflare.com). Choose **Add a domain**, type `promptpimps.com`, and pick the **Free** plan.
4. Cloudflare scans the records it can find and lists them. **Compare that list with your notes, one record at a time.** Add any it missed, using **Add record**. The MX and TXT records are the ones most often missed. If one is missing, email stops working.
5. For the records you copied (website and email), set the cloud icon to **grey ("DNS only")**. That keeps the website and email working exactly as they do today. You can change this later if you want Cloudflare in front of the website too.
6. Cloudflare then shows two name servers, something like `ada.ns.cloudflare.com` and `bob.ns.cloudflare.com`. Keep that page open.

**Point the domain at Cloudflare.**

7. Back in IONOS, go to **Domains & SSL** → `promptpimps.com` → **Name servers**. Choose to use your own (custom) name servers. Replace the `ui-dns` ones with Cloudflare's two, then save.
8. Wait. Cloudflare emails you when the domain is **Active**. Often that's within an hour, but it can take up to a day or two. Your site keeps working while you wait.
9. Once it's active, check that `www.promptpimps.com` still opens, and send yourself a test email to your promptpimps address and check it arrives. If either breaks, a record from step 2 is missing in Cloudflare. Add it.

Don't cancel or change anything else at IONOS. The domain registration and the hosting both stay there.

## Part 2: Put the first lock on (Cloudflare Access)

Do this before the tunnel exists, so the address is never open without it. **This step is strongly recommended.** It means a stranger never even reaches your Mac's sign-in page.

1. In the Cloudflare dashboard, open **Zero Trust**. If it asks you to choose a team name and a plan, pick any team name and the **Free** plan (free for up to 50 people).
2. Go to **Access** → **Applications** → **Add an application** → **Self-hosted**.
3. Name it `Asset Foundry`. For the domain, enter subdomain `daf` and domain `promptpimps.com`.
4. Add a policy:
   - Name: `Only me`
   - Action: **Allow**
   - Include: **Emails**, then type your own email address. Add nobody else.
5. Under login methods, make sure **One-time PIN** is on. It is on by default. Cloudflare emails you a code each time you sign in.
6. Pick how long a sign-in lasts (the session duration, for example 24 hours). Save.

## Part 3: Get the app ready

On the Mac, open Asset Foundry and go to **Settings → System**, to the card **"Use from another computer"**.

1. Tick **Allow other computers (with the access token)**.
2. Press **Make an access token**. Copy it straight into your password manager. It is shown only once. If you already made one for your Windows laptop, it works here too.
3. In **Public web address**, type `daf.promptpimps.com` and press **Save web address**.
4. If you don't use the app from another computer on your home Wi-Fi, also tick **Only through the web address (not from other computers on this Wi-Fi)**. That closes the home-network door, and the tunnel still works.
5. Quit the app and start it again. These settings need a restart.

## Part 4: Install and start the tunnel

Open the **Terminal** app on the Mac and run these one at a time.

1. Install `cloudflared` with Homebrew:

   ```bash
   brew install cloudflared
   ```

2. Sign it in to your Cloudflare account. A browser window opens. Pick `promptpimps.com` and approve.

   ```bash
   cloudflared tunnel login
   ```

3. Make the tunnel. It prints a long tunnel ID and saves a credentials file in `~/.cloudflared/`. Keep that file private.

   ```bash
   cloudflared tunnel create daf
   ```

4. Give the tunnel its address. This adds the `daf` record in Cloudflare for you.

   ```bash
   cloudflared tunnel route dns daf daf.promptpimps.com
   ```

5. Make the settings file. In Terminal, `open -e ~/.cloudflared/config.yml` opens it in TextEdit (if it says the file doesn't exist, run `touch ~/.cloudflared/config.yml` first). Paste this in. Replace `TUNNEL-ID` with the ID from step 3; the file with that name is already in the folder. Then save.

   ```yaml
   tunnel: daf
   credentials-file: /Users/jadeddragon/.cloudflared/TUNNEL-ID.json
   ingress:
     - hostname: daf.promptpimps.com
       service: http://127.0.0.1:4317
     - service: http_status:404
   ```

6. Start it:

   ```bash
   cloudflared tunnel run daf
   ```

   Leave that Terminal window open. Closing it stops the tunnel.

7. Optional: to have the tunnel start by itself every time you log in to the Mac, stop it with Ctrl+C and run:

   ```bash
   cloudflared service install
   ```

### Never do this

- **Don't set "HTTP Host Header"** (`httpHostHeader` in the file, or the same option in the Cloudflare dashboard's tunnel settings) to `127.0.0.1:4317` or `localhost`. It's a common fix suggested online for "421" errors. Older versions of the app would then have shown everything to anyone, with no sign-in. This version still asks for the token because Cloudflare marks every visit, but there is no reason to set it, so leave it alone.
- Don't point the tunnel at the Mac's home-network address (the one starting `192.168.`). Use `http://127.0.0.1:4317` exactly as above.
- Don't switch off the Cloudflare Access policy to "test something". Test with it on.
- Don't share the access token. If you think someone has it, press **Make a new access token**. The old one stops working at once.

## Part 5: Try it

Use your phone with **Wi-Fi turned off**, so you're really coming in from the internet.

1. Open **https://daf.promptpimps.com**.
2. Cloudflare asks for your email and sends a code. Enter it.
3. The Asset Foundry sign-in page appears. Paste the access token.
4. The app opens.

**If the app ever opens without asking for the token, stop the tunnel straight away** (Ctrl+C in its Terminal window, or `cloudflared service uninstall`) and report it. It should never happen.

## When it works, and when it doesn't

The address only works while **all three** of these are true:

- **The Mac is awake.** A sleeping Mac can't answer. To keep it awake while plugged in, go to **System Settings → Battery** (or **Energy**) → **Options** and turn on the option that prevents automatic sleeping on the power adapter when the display is off.
- **Asset Foundry is running** (from the Dock app or `./start.sh`).
- **The tunnel is running** (`cloudflared tunnel run daf`, or the service from Part 4, step 7).

When any of them is off, visitors get a Cloudflare error page. Nothing of yours is shown.

## Turning it off

Any one of these closes the address:

- Untick **Allow other computers** in Settings → System and restart the app. The tunnel then gets "Remote access is turned off" for everything.
- Stop the tunnel (Ctrl+C, or `cloudflared service uninstall`).
- In Cloudflare, delete the `daf` DNS record or the tunnel.
