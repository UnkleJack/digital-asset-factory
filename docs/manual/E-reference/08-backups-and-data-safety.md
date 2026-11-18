# Backups and data safety

**Verification:** commands read from `package.json` and `scripts/`; a backup was made live in a throwaway copy (22 products, 416 files, about 46 MB); the state of your real backups was read from the file system (VERIFIED). **A real restore was not run** (restores are destructive and were never run in this pass).

## The one thing to know
`data/` holds your database, every product file, logs and backups. It is **never in Git**. **Nothing backs it up off the Mac** (Constitution, Undecided D). The Constitution's rule: **back up before touching data**.

## What a backup contains
`data/backups/backup-<time>/` with `daf.sqlite` (the database), `assets/` (every generated file) and `backup.json` (counts and size). **API keys are not included** (they live in the Keychain), so enter them again on a new machine.

## When backups happen
- **By hand:** Settings → Backups → **Back up now**, or `npm run backup` (`-- --list` to list).
- **Automatically:** a database-only `pre-migrate-<time>.sqlite` before any schema change; and a full backup before `tidy-folders --apply` and `restore-products --apply`.
- **Not scheduled.** There is no automatic full backup in the code.

## The state of your real backups (2026-11-17)
The newest full backup was `backup-2026-11-11` and held **21 products**; the database held **35**. About 14 products were not in any full backup. **Run `npm run backup` now and again before any recovery work, and weekly.**

## Restore
1. Quit the app.
2. `npm run restore` (lists backups), then `npm run restore -- <backup-name>`.
3. Your current data is moved to `data/pre-restore-<time>/`, not deleted. The backup is integrity-checked first. The command refuses to run while the app is open.

## Other data commands (dry run unless told otherwise)

| Command | What it does | Safety |
| --- | --- | --- |
| `npm run restore-products` | Re-registers product folders missing from the database | Dry run; `-- --apply` backs up first, needs the app closed, puts items in a batch "Restored products" |
| `npm run tidy-folders` | Renames old `prd_.../v1` folders to readable names | Dry run; `-- --apply` backs up first |
| `npm run clean-verification` | Removes old throwaway folders inside `verification-output/` (unchanged for 7 days) | Dry run; `-- --apply`; never touches `data/`; the app also runs it weekly |
| `npm run portable` | Zips a portable copy | Data excluded by default |
| `npm run migrate` | Applies pending migrations (also automatic) | Backs up first |
| `npm run samples` | One sample of each type in a temp folder | Safe |

## Data-safety practices
1. Back up before: moving, renaming or restoring anything in `data/`; upgrading; running `--apply`.
2. Keep `data/` out of iCloud, Dropbox or OneDrive while the app runs; the database can be damaged.
3. Copy `data/backups` to an external drive or cloud storage you control. This is the off-Mac copy that does not exist yet.
4. Keep API keys out of git, notes and chats. Never import a Google OAuth `client_secret` file.
5. To test or screenshot, use a **throwaway copy** with its own data folder (`DAF_DATA_DIR`), as this manual did.
6. Pull only from `main` onto the Mac (`git pull`, `npm ci`, then start). The Mac folder is the only working copy.

---
**Previous:** [Errors and recovery](07-errors-and-recovery.md) · **Back:** [Manual home](../README.md)
