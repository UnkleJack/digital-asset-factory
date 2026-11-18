# AI providers and keys

**Verification:** provider lists, defaults, order, pacing and storage read from the code (VERIFIED, code). **Live status:** per the Constitution, **only NVIDIA text has ever worked with a real key** (2026-11-05). Everything else is NOT VERIFIED live.

## Terms
- **Provider:** a company running AI models. **Text provider** writes words; **image provider** draws pictures. Separate lists.
- **Model:** the specific AI program at a provider (for example `nvidia/nemotron-3-ultra-550b-a55b`).
- **Free tier:** a free allowance, set by the provider and liable to change.
- **Rate limit:** "too many requests". **Pacing** is Foundry's way of staying under limits.
- **Fallback:** if the first choice fails, the next provider is tried. **Backup models** are tried at the *same* provider first.

## Text providers (10, plus `deterministic`)

| Provider | Default model | Key name | Cost |
| --- | --- | --- | --- |
| **nvidia** (default first) | `nvidia/nemotron-3-ultra-550b-a55b`, backup `minimaxai/minimax-m3.1-flash` | `nvidia_api_key` | Free trial credits |
| gemini | `gemini-2.5-flash` | `gemini_api_key` | Free tier |
| openrouter | `meta-llama/llama-3.3-70b-instruct:free` | `openrouter_api_key` | Free models |
| cerebras | `llama-3.3-70b` | `cerebras_api_key` | Free tier |
| mistral | `mistral-small-latest` | `mistral_api_key` | Terms may have changed |
| github | `openai/gpt-4.1-mini` | `github_models_token` | Free daily allowance |
| together | `meta-llama/Llama-3.3-70B-Instruct-Turbo-Free` | `together_api_key` | May need credit |
| groq | `openai/gpt-oss-120b` | `groq_api_key` | Free tier (a **late backup**, never first) |
| huggingface | `meta-llama/Llama-3.3-70B-Instruct` | `huggingface_token` | Small credit |
| anthropic | `claude-opus-5-5` | `anthropic_api_key` | **Paid**; never an automatic backup unless **allowPaidFallback** is on |

Default order: nvidia, gemini, openrouter, cerebras, mistral, github, together, groq, huggingface, anthropic. `deterministic` means the built-in library (no API). The "no key" policy default is **deterministic**; set it to **fail** to stop instead.

## Image providers (10, plus `none`)

| Provider | Default model | Cost |
| --- | --- | --- |
| **openai** (default first) | `gpt-image-1` | **Paid** |
| gemini | `gemini-3-pro-image` | Free tier (price table says about $0.13 an image) |
| together | `FLUX.1-schnell-Free` | Free |
| huggingface | `FLUX.1-schnell` | Needs credits |
| **pollinations** | `flux` | Free, **no key** (always counts as configured) |
| replicate | `flux-1.1-pro` | **Paid** (treated as paid) |
| fal | `flux-pro/v1.1` | **Paid** (treated as paid) |
| grok | `grok-imagine` | **Paid** |
| openrouter | `google/gemini-2.5-flash-image` | Via key |
| local | `sdxl-base-local` at `127.0.0.1:7861` | Free; only if a local server reports a model loaded |

Default order: gemini, together, huggingface, pollinations, openai, replicate, fal, grok, local. **Paid providers are skipped as backups unless allowPaidFallback is on**, though they still run if you pick one as the first choice. (Replicate and fal are labelled free in one place in the app; the code treats them as paid. Treat them as paid.)

## How a request is routed
1. Your chosen provider is tried first, then the fallback order. A provider with no key is skipped silently.
2. A provider cooling down after a rate limit, or past its daily limit (defaults: Groq 900, OpenRouter 45, Gemini 200, GitHub 140), is skipped with a message.
3. At the same provider, a retired or unknown model, a timeout, a server error or a refusal moves to the next *backup model*. A rate limit, rejected key or unreachable host goes straight to the next provider (so backups do not spend a capped key).
4. Bad structured output is retried at the same provider up to 2 times.
5. If all fail: *"AI: None of the N providers could answer. ..."* with a reason for each.

Minimum gap between calls to one provider: 2 seconds; rate-limit rest: 15 minutes (lost on restart). Daily counts survive restarts.

## Keys
Stored in the **macOS Keychain** (service `digital-asset-factory`; the name must never change). Write-only: once saved, never shown. On Windows they are encrypted for your Windows account. A key is 8 to 4096 characters of letters, digits and `. _ ~ + / = : -`. Backups never include keys. In Settings press **Remove** to delete one.

## The Test buttons
**Test text provider**, **Test image provider**, **Test picture-reading AI** each make **one real call**, which can use credit. The picture test sends a red square and passes only if the answer says "red". A test of `deterministic` says there is no API to test.

## Picture-reading AI (Vision)
Used for the boxes you draw on reject notes. Default NVIDIA `meta/llama-3.2-90b-vision-instruct`; never run live.

## Cost
Estimated from the AI price table (Settings → Generation → Advanced), not from invoices. Plans stop when their estimated cost passes the limit.

---
**Previous:** [QA checks](03-qa-checks.md) · **Next:** [Files and formats](05-files-and-formats.md)
