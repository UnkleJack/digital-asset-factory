# Security Policy

Asset Foundry is a one-person, local-first app, built in public. It runs on the owner's own computer, and it is not offered as a hosted service. The code, the problems and the fixes are all out in the open.

## Supported versions

There are no numbered releases yet (`package.json` says `0.1.0`). Only the latest code on the `main` branch gets security fixes. Older commits and copies made from them do not.

| Version | Supported |
| --- | --- |
| Latest `main` | :white_check_mark: |
| Anything older | :x: |

## Reporting a vulnerability

This project is built in public, so most security problems can be reported in the open.

- **Most problems:** open a normal **issue**. Say what you found, how to reproduce it, and what it could let someone do.
- **A working way in that isn't fixed yet** (for example, a way to get past the sign-in or read saved keys on someone's running copy): use the **Security** tab → **Report a vulnerability** instead. It stays private only until it's fixed. Then the fix and a write-up are published openly, with credit to you if you want it.
- **Either way,** leave out any real API keys, tokens or personal data. If something real was exposed, say what kind of thing it was, not its value.

This is a one-person project, so there is no fixed response time. Every report is read. If it's accepted, it's fixed on `main` and the issue or advisory says so. If it's declined, the reason is written down there.

## What counts

Things worth reporting include:
- a way to read or change the app from another computer without signing in;
- a way around the access-token sign-in;
- a way to make the app reveal saved API keys;
- a way for an imported file to read or write outside the app's own folders.

How the app protects itself today:
- **It listens only on this computer by default** (`127.0.0.1`). Requests addressed to any other host name are refused.
- **Hub mode is off by default.** When it's turned on, other computers must sign in with an access token, and wrong tokens are slowed down.
- **Writes are checked.** Requests that change things must come from the app's own pages: an origin check, plus a client header against cross-site tricks.
- **API keys are kept in the macOS Keychain**, or in DPAPI on Windows. They are never kept in the repository, in `.env` files that get committed, or in imports.
- **The `data/` folder is never committed to git.** It holds the database, products, backups and secrets.

## Out of scope

- Problems that need someone to already control the owner's computer or user account.
- The outside services the app calls, such as AI providers, Etsy and Gumroad. Report those to the service itself.
- Advisories in third-party packages that the app doesn't actually use in a way that can be exploited. These are tracked through Dependabot.
