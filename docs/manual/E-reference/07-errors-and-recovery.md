# Common errors and recovery

**Verification:** messages read from the code. The ones marked ✓ were also seen in the running app.

How to read an error: the app returns a short **code** and a **message**. The message is what you see. Details go to the log (Settings → Logs & audit, or `data/logs/*.jsonl`, with secrets removed).

## Messages by situation

**No AI key**
| Message | Meaning and fix |
| --- | --- |
| "No AI text provider has an API key (Settings → AI providers)." | Add a key |
| "No AI image provider is configured (Settings → AI providers)." | Add an image key |
| "Illustrated coloring pages need an image provider. Configure one in Settings → AI providers." | Same, for that type |
| "Reading your notes needs an AI provider key" | Add a key to use *Read my notes now* |
| Dashboard: "AI text generation is not active ... used the built-in content library" ✓ | Not an error; products still work |

**Key or limit problems**
| Message | Meaning and fix |
| --- | --- |
| "Key rejected: ..." | The key is wrong or expired; re-enter it |
| "The request timed out." / "Could not reach the API" | Network or provider problem; usually retries |
| "skipped: reached today's limit of N calls set in Settings → Generation → pacing" | Provider's daily cap; the next provider answers |
| "skipped: cooling down after a rate limit until HH:MM UTC" | Resting after "too many requests" |
| "AI: None of the N providers could answer. ..." | Every provider failed; read each reason |
| "The model did not return valid JSON." | Retried up to 2 times automatically |
| "Skipped: this production run reached its cost limit" | Raise the plan's limit |

**QA and approval**
| Message | Fix |
| --- | --- |
| "This version cannot be approved: QA status is "failed". Fix or regenerate it first." ✓ | Fix the failing check ([Lesson 7](../D-lessons/07-run-qa-and-fix-a-problem.md)) |
| "This version has N QA warning(s). Fix it, or review it and tick "I accept these warnings" to approve." | Accept or fix |
| "A newer version of this product exists. Review the newest version instead." | Open the newest |
| "This version is still being produced." | Wait |
| "Say why you are rejecting it: which part is wrong and what is wrong with it." | Write a specific reason |
| "The AI can't be reached right now, so your note is waiting in line. Nothing has changed yet." ✓ | Add an AI key, or Drop it |
| "has no valid approval for its current files and listing text. Approve it in Batch approval first." | Re-approve after your edit |
| "has QA warnings you haven't accepted yet." | Accept in review |

**Rendering and files**
| Message | Fix |
| --- | --- |
| "Google Chrome or Microsoft Edge was not found at ..." | Install Chrome or set Settings → Rendering → Chrome path |
| "Rendering failed: ..." | Transient; retried. If it persists, read Production jobs |
| "No deliverable PDF was produced" / "PDF could not be opened" | A render step failed; Retry it |
| "N file(s) missing or changed on disk" | Files were moved or edited outside the app; restore from a backup |

**Starting the app**
| Message | Fix |
| --- | --- |
| "Port 4317 is already in use. Another copy may be running, or set DAF_PORT" | Open `http://127.0.0.1:4317`; or quit the other copy |
| "Asset Foundry is already running (process N) on this data folder." | Close it first |
| "The app server is not responding. Is Asset Foundry still running?" | Restart it |
| "Something went wrong. The details were written to the log" | Check Logs |
| Database integrity error at start-up | Restore the latest backup |

**Publishing**
| Message | Fix |
| --- | --- |
| "Etsy direct publishing is not available ... Use the export package and then record the publication." ✓ | Expected; use export |
| "Gumroad direct publishing is off. Turn it on in Settings → Marketplaces → Gumroad ..." ✓ | Enable it, or export |
| "That URL is not an address on Etsy" ✓ | Paste the real marketplace address |
| "A previous attempt has an unknown outcome. Reconcile it before trying again." | Use **Reconcile** |
| "the access token was rejected" (Gumroad) | New token in Gumroad, save in Integrations |
| "Gmail refused the login" | Use the 16-letter app password |
| "The monthly web-search budget ... is used up" | Raise the cap or wait |

## Recovery procedures
1. **Always back up first** ([Backups](08-backups-and-data-safety.md)).
2. **A product is stuck:** product page, Production steps → Production jobs → read the error → Retry or fix the cause.
3. **A product failed QA:** read the check; fix the setting or regenerate; clear on Rework.
4. **Products vanished from the app but their folders remain** (this happened on 2026-10-29): quit the app; `npm run backup`; `npm run restore-products` (a dry run); then `npm run restore-products -- --apply` (backs up first).
5. **The app will not start after a bad change:** restore the newest backup: quit, `npm run restore`, then `npm run restore -- <backup-name>`. Your current data is moved aside, not deleted.
6. **Never** run `npm audit fix`, edit or renumber an applied migration, or rename the `data/` folder, the Keychain service or the package name (Constitution Article 5).

---
**Previous:** [Publishing and marketplaces](06-publishing-and-marketplaces.md) · **Next:** [Backups and data safety](08-backups-and-data-safety.md)
