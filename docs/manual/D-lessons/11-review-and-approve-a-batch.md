# Lesson 11: Review and approve a product batch

**Verification:** approve, the QA-failed block, regenerate, hold, the warning gate and a queued rejection were each exercised live (VERIFIED). The AI-checked reject path was NOT (no key).

## Learning objective
Work through a whole batch making the right decision for each item.

## What we are creating
Decisions on a batch of mixed sample products: one good, one with a warning, one failed, one to park.

## What we need
Several finished products in Batch approval. Read [What to check before you approve](../../guide/CHECKING_PRODUCTS.md).

## Steps
1. Open **Batch approval**. Open each batch (a production-plan run makes one batch of many items; each manual product has its own).
2. For each item press **Review**, **Show previews**, and download and read the PDF.
3. Decide:
   - **Good, no flags:** tick the marketplaces you will use, **Approve**.
   - **Yellow warning** (for example the imported product's `listing_spelling`): read it; **Help me with this** (needs a key) or fix; or tick **I accept these warnings** with a note, then Approve.
   - **Red QA failure:** Approve is disabled. Fix it ([Lesson 7](07-run-qa-and-fix-a-problem.md)) or **Regenerate**.
   - **Not sure yet:** **Hold for research** with a note ("Check what the top five sellers charge"). Not a decision.
   - **Wrong:** **Return for revision** or **Reject** with a specific note naming the part and what is wrong.
4. Check the **Notes waiting on the AI** panel is empty (or add a key).

## Expected results (live)
- Approved items show **Approved** in the library and land on the Factory floor.
- The QA-failed item cannot be approved.
- A held item appears under "1 item on hold for research" with **Open** and **Release**, and the batch list says "0 · 1 on hold" awaiting.
- Regenerating (blank note) created v2 and superseded v1.
- A reject note with no working AI waited in line: *"Nothing has changed yet."*

## What to inspect
Your reasons: are they specific? Did you tick only marketplaces you will use?

## Common mistakes
Approving without reading the PDF; vague notes; leaving items on hold forever (they are not decided); rejecting without an AI key.

## Completion criteria
- [ ] Every item has an approval, a hold, a send-back or a reject.
- [ ] No notes waiting on the AI.
- [ ] I can state what a hold does and does not do.

## What I learned
Approval is the one human gate. Warnings need accepting; failures need fixing; holds park without learning.

---
**Previous:** [Lesson 10](10-prepare-a-marketplace-listing.md) · **Next:** [Lesson 12: Export or publish](12-export-or-publish.md) · **Screen:** [Batch approval](../B-screens/12-batch-approval.md)
