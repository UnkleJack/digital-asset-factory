# Lesson 4: Create illustrated coloring pages

**Verification: NOT VERIFIED live.** This type needs an image provider. Making it in the throwaway copy would have sent a request to an outside image service, so it was not run. Everything below is from the code, and the lesson says what to confirm first.

## Learning objective
Use an **AI image provider** safely: test it first, make a small batch, and inspect every picture.

## What we are creating
*Ocean Friends Illustrated Coloring Book* (practice brief 2; see [practice briefs](00-the-twelve-practice-briefs.md)). It does not exist yet.

## What we need before starting
- A working **image provider**. Check the Dashboard's **Image AI** row for which provider would answer. The default first choice (OpenAI) is paid; the backup chain also has Gemini, Together, Hugging Face, keyless Pollinations, and paid Replicate, fal and Grok (paid ones are skipped unless **allowPaidFallback** is on).
- Know that **each picture is a billed or rate-limited call** at most providers.

## Steps
1. **Settings → AI providers → Test image provider.** It makes one real call and reports the provider and time. Do not continue unless it works. (It costs one call.)
2. **New product → Coloring Pages → Illustrated coloring pages.** Theme **Ocean**, audience Kids 4-8, **Pages 6**, Fit sharp, Cover on.
3. Create. Watch **Generate artwork**: it is the slow, costly step.
4. When ready, open every page preview.

## Expected results (from the code)
A PDF plus one PNG per page in the ZIP; provenance and estimated cost recorded under **Provenance & cost**. Early-reader audiences request thick lines.

## What to inspect
**Every picture.** QA never sees what is drawn. Look for cropped faces and fins, odd expressions, stray text, the wrong animal. QA only warns on gray tones above 15 percent, color above 5 percent and low DPI (for Fit fill).

## Common mistakes
- **More than 6 pages with no AI scene writer:** offline there are only 6 scenes per theme, so the picture count check would fail (code-derived).
- Skipping the test, then paying for a batch from a misconfigured provider.
- Assuming a free provider gives clean line art.

## Completion criteria
- [ ] Image provider tested before use.
- [ ] 6 pages made; each picture inspected.
- [ ] I read the estimated cost.

## What I learned
Only one type needs an image AI; cost and quality are the owner's checks, not QA's.

---
**Previous:** [Lesson 3](03-import-outside-artwork.md) · **Next:** [Lesson 5: Maze](05-maze-activity.md) · **Reference:** [Providers](../E-reference/04-providers-and-keys.md)
