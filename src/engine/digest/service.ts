import { z } from 'zod';
import type { AppContext } from '../../app/context.ts';
import { structuredCall, textMode } from '../generation/service.ts';
import { productTypes, hasProductType } from '../producttypes/registry.ts';
import { createOpportunity } from '../research/service.ts';
import { AppError, ProviderError, errorMessage, notFound, validation } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import { audit, type AuditActor } from '../../logging/logger.ts';
import { json } from '../../db/sqlite.ts';
import { makeSearcher, DEFAULT_ENDPOINTS, type SearchEndpoints, type SearchResult } from './search.ts';
import { smtpMailer, type Mailer } from './email.ts';

/*
 * The research digest: (1) what sells on each platform, (2) what tracked competitor shops are
 * doing and where they fall short, (3) two new product ideas that survived three separate AI
 * passes. Web search supplies the evidence; the AI only summarizes what the search results say.
 * Every number the AI reports is checked against the search snippet it cites and is dropped
 * (and the finding downgraded to a hypothesis) if it is not actually there.
 */

const EVIDENCE = ['measured', 'external_estimate', 'model_hypothesis', 'unknown'] as const;

const Finding = z.object({
  item: z.string().min(2).max(200),
  detail: z.string().min(3).max(800),
  number: z.string().max(200).nullable(),
  evidence: z.enum(EVIDENCE),
  sourceUrls: z.array(z.string()).max(5),
});
const Gap = z.object({ gap: z.string().min(3).max(500), whyItMatters: z.string().min(3).max(600), sourceUrls: z.array(z.string()).max(5) });

const PlatformSummary = z.object({ findings: z.array(Finding).max(12), gaps: z.array(Gap).max(8), dataQuality: z.string().max(400) });
const ShopSummary = z.object({ strengths: z.array(Finding).max(8), gaps: z.array(Gap).max(8), dataQuality: z.string().max(400) });

const Candidate = z.object({
  title: z.string().min(4).max(140),
  pitch: z.string().min(3).max(800),
  targetBuyer: z.string().min(3).max(400),
  whyNotGeneric: z.string().min(3).max(600),
  productTypes: z.array(z.string()).max(6),
});
const Candidates = z.object({ candidates: z.array(Candidate).min(2).max(12) });

const Scores = z.object({
  scored: z.array(z.object({
    title: z.string(),
    monetization: z.number().min(0).max(10),
    demand: z.number().min(0).max(10),
    novelty: z.number().min(0).max(10),
    tasteFit: z.number().min(0).max(10),
    feasibility: z.number().min(0).max(10),
    verdict: z.enum(['keep', 'cut']),
    critique: z.string().min(3).max(800),
  })).min(1),
});

const Proposal = z.object({
  title: z.string().min(4).max(140),
  summary: z.string().min(3).max(1000),
  targetBuyer: z.string().min(3).max(500),
  monetization: z.string().min(3).max(800),
  pricePoints: z.string().min(3).max(300),
  firstProducts: z.array(z.string().min(3).max(200)).min(1).max(5),
  platforms: z.array(z.string()).max(6),
  risks: z.string().min(3).max(600),
  evidence: z.string().min(3).max(800),
  productType: z.string(),
});
const Proposals = z.object({ proposals: z.array(Proposal).min(1).max(4) });

export type DigestFinding = z.infer<typeof Finding>;
export type DigestGap = z.infer<typeof Gap>;

export interface DigestOptions {
  trigger?: 'schedule' | 'manual';
  endpoints?: SearchEndpoints;
  mailer?: Mailer;
  actor?: AuditActor;
}

const RULES = `You are a market researcher for a one-person digital-download shop (printables, planners, trackers, coloring pages, templates).
Rules:
- Use ONLY the search results given. Do not use outside knowledge for facts or numbers.
- A "number" (sales count, revenue, review count, price, ranking, percentage) may only be reported if it appears in the cited result's snippet. Copy it exactly as written there, with what it measures. If no snippet states a number, set number to null.
- Every finding and gap must cite the URL(s) of the results it came from, copied exactly.
- evidence: "external_estimate" when a cited snippet states it; "model_hypothesis" when you are inferring beyond the snippets; never "measured" (that is reserved for the shop's own sales data).
- Gaps are concrete things buyers complain about, that sellers do poorly, or that nobody offers. Be specific; no generic advice.
- Never name trademarked characters or brands as product ideas.`;

function resultsBlock(results: SearchResult[]): string {
  return results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`).join('\n\n');
}

function dedupe(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => r.url && !seen.has(r.url) && seen.add(r.url));
}

const digits = (s: string) => (s.match(/\d[\d,.]*/g) ?? []).map((d) => d.replace(/[,.]+$/, '').replace(/,/g, ''));

/**
 * Keeps only real source URLs, and keeps a number only if its digits appear in a cited snippet;
 * otherwise the number is dropped and the finding becomes a hypothesis.
 */
export function verifyFinding<T extends { number?: string | null; evidence?: string; sourceUrls: string[] }>(f: T, results: SearchResult[]): T & { numberVerified: boolean } {
  const byUrl = new Map(results.map((r) => [r.url, r]));
  const urls = f.sourceUrls.filter((u) => byUrl.has(u));
  let number = f.number ?? null;
  let verified = false;
  if (number) {
    const want = digits(number);
    const text = urls.map((u) => `${byUrl.get(u)!.title} ${byUrl.get(u)!.snippet}`).join(' ').replace(/,/g, '');
    verified = want.length > 0 && want.every((d) => text.includes(d));
    if (!verified) number = null;
  }
  const evidence = !urls.length || (f.number && !verified) ? 'model_hypothesis' : f.evidence === 'measured' ? 'external_estimate' : f.evidence;
  return { ...f, sourceUrls: urls, number, evidence, numberVerified: verified };
}

async function researchPlatform(app: AppContext, search: (q: string, n?: number) => Promise<SearchResult[]>, platform: string, perPlatform: number, runIds: string[]) {
  const year = app.clock.now().getUTCFullYear();
  const queries = [
    `best selling digital downloads printables on ${platform} ${year}`,
    `${platform} top sellers digital products sales numbers revenue ${year}`,
    `${platform} buyers complaints digital printables templates what is missing`,
    `${platform} seller income report printables planners ${year}`,
    `trending digital products ${platform} ${year} niches`,
  ].slice(0, perPlatform);
  const results: SearchResult[] = [];
  for (const q of queries) results.push(...(await search(q, 6)));
  const unique = dedupe(results).slice(0, 24);
  if (!unique.length) return { platform, findings: [], gaps: [], dataQuality: 'No search results came back.', sources: 0 };
  const r = await structuredCall(app, {
    purpose: 'digest:platform',
    schema: PlatformSummary,
    system: RULES,
    prompt: `Platform: ${platform}. Summarize what is selling there (products, niches, price points, who is making money and how) and the gaps (where sellers come up short, what buyers want but can't find).\n\nSearch results:\n${resultsBlock(unique)}\n\nAlso say in dataQuality how solid these sources are (official data, seller reports, blogs, marketing pages).`,
    maxTokens: 4000,
    trace: {},
  });
  runIds.push(...(r.provenance.generationRunIds ?? []));
  return {
    platform,
    findings: r.data.findings.map((f) => verifyFinding(f, unique)),
    gaps: r.data.gaps.map((g) => ({ ...g, sourceUrls: g.sourceUrls.filter((u) => unique.some((x) => x.url === u)) })),
    dataQuality: r.data.dataQuality,
    sources: unique.length,
  };
}

async function researchShop(app: AppContext, search: (q: string, n?: number) => Promise<SearchResult[]>, shop: { platform: string; shopUrl: string; label?: string }, runIds: string[]) {
  let host = '';
  try { host = new URL(shop.shopUrl).hostname; } catch { /* validated by settings */ }
  const name = shop.label || shop.shopUrl.replace(/\/$/, '').split('/').pop() || shop.shopUrl;
  const results = dedupe([...(await search(`"${name}" ${shop.platform} shop reviews best sellers`, 6)), ...(await search(`${name} ${host} printables`, 6))]).slice(0, 14);
  if (!results.length) return { shop: name, url: shop.shopUrl, platform: shop.platform, strengths: [], gaps: [], dataQuality: 'No search results came back.' };
  const r = await structuredCall(app, {
    purpose: 'digest:competitor',
    schema: ShopSummary,
    system: RULES,
    prompt: `Competitor shop: ${name} on ${shop.platform} (${shop.shopUrl}). From the search results, what are they doing well (best sellers, numbers like review or sales counts if stated, pricing, presentation) and where do they come up short (complaints, missing products, weak spots another seller could fill)?\n\nSearch results:\n${resultsBlock(results)}`,
    maxTokens: 3000,
    trace: {},
  });
  runIds.push(...(r.provenance.generationRunIds ?? []));
  return { shop: name, url: shop.shopUrl, platform: shop.platform, strengths: r.data.strengths.map((f) => verifyFinding(f, results)), gaps: r.data.gaps.map((g) => ({ ...g, sourceUrls: g.sourceUrls.filter((u) => results.some((x) => x.url === u)) })), dataQuality: r.data.dataQuality };
}

/** What the operator has approved and rejected lately, with their reasons — fed to the idea passes. */
function reviewHistory(app: AppContext): string {
  const rows = app.db.all<{ decision: string; notes: string; product_type: string; title: string }>(`SELECT d.decision, d.notes, p.product_type, p.title FROM approval_decisions d JOIN product_versions v ON v.id = d.version_id JOIN products p ON p.id = v.product_id
    WHERE d.decision IN ('approved','rejected','revision_requested') GROUP BY d.version_id, d.decision ORDER BY d.decided_at DESC LIMIT 40`);
  if (!rows.length) return 'No review decisions yet.';
  return rows.map((r) => `- ${r.decision.toUpperCase()}: ${r.title} (${r.product_type})${r.notes ? ` — "${r.notes.slice(0, 200)}"` : ''}`).join('\n');
}

async function generateIdeas(app: AppContext, context: string, runIds: string[]) {
  const cfg = app.settings.get('research').digest;
  const types = productTypes().filter((t) => t.id !== 'bundle').map((t) => `${t.id}: ${t.name}`).join('\n');
  const existing = app.db.all<{ title: string }>('SELECT title FROM opportunities ORDER BY created_at DESC LIMIT 50').map((r) => r.title);
  const taste = cfg.tastePreferences.trim() || '(not set yet)';
  const history = reviewHistory(app);

  // Pass 1: wide brainstorm grounded in the research.
  const p1 = await structuredCall(app, {
    purpose: 'digest:ideas-generate',
    schema: Candidates,
    system: `${RULES}\nYou now propose product lines. Ideas must be things people are NOT already flooding the market with, yet clearly connected to real demand in the research. No generic "planner for everyone" ideas.`,
    prompt: `Research findings and gaps:\n${context}\n\nOwner's taste and interests:\n${taste}\n\nOwner's recent review decisions (learn from the reasons):\n${history}\n\nProduct types the shop can make today:\n${types}\n\nAlready considered (do not repeat): ${existing.join('; ') || 'none'}\n\nPropose ${cfg.candidateIdeaCount} distinct candidate product lines. For each: title, pitch, targetBuyer (specific demographic and situation), whyNotGeneric, productTypes (ids from the list that could make it; empty if it needs a new type).`,
    maxTokens: 5000,
    trace: {},
  });
  runIds.push(...(p1.provenance.generationRunIds ?? []));
  const candidates = p1.data.candidates;

  // Pass 2: an independent, harsh critique. A separate call, so the model is not grading its own pitch.
  const p2 = await structuredCall(app, {
    purpose: 'digest:ideas-vet',
    schema: Scores,
    system: `You are a skeptical buyer for a marketplace and an experienced seller. Most ideas are mediocre: score harshly. Cut anything generic, saturated, trademark-risky, hard to make as a printable, or unlikely to earn money. Use the research for demand; if the research does not support demand, say so.`,
    prompt: `Research findings and gaps:\n${context}\n\nOwner's taste: ${taste}\n\nCandidates:\n${candidates.map((c, i) => `${i + 1}. ${c.title} — ${c.pitch} | buyer: ${c.targetBuyer} | why not generic: ${c.whyNotGeneric}`).join('\n')}\n\nScore every candidate 0-10 on monetization, demand (supported by the research?), novelty, tasteFit (owner's taste), feasibility (can a printable/template shop make it well). verdict keep or cut, and a pointed critique. Use each candidate's exact title.`,
    maxTokens: 4000,
    trace: {},
  });
  runIds.push(...(p2.provenance.generationRunIds ?? []));
  const scoreOf = (s: z.infer<typeof Scores>['scored'][number]) => s.monetization * 0.3 + s.demand * 0.25 + s.novelty * 0.2 + s.tasteFit * 0.15 + s.feasibility * 0.1;
  const vetted = p2.data.scored
    .map((s) => ({ ...s, total: Math.round(scoreOf(s) * 10) / 10, candidate: candidates.find((c) => c.title.trim().toLowerCase() === s.title.trim().toLowerCase()) }))
    .filter((s) => s.candidate)
    .sort((a, b) => (a.verdict === b.verdict ? b.total - a.total : a.verdict === 'keep' ? -1 : 1));
  const shortlist = vetted.slice(0, 3);
  if (!shortlist.length) return { candidates, vetted, finals: [] };

  // Pass 3: turn the survivors into full proposals that answer the critique.
  const p3 = await structuredCall(app, {
    purpose: 'digest:ideas-refine',
    schema: Proposals,
    system: `${RULES}\nYou turn vetted ideas into concrete business proposals. Address every critique directly. Be specific about money: price points, bundles, upsells, which platforms.`,
    prompt: `Research findings and gaps:\n${context}\n\nOwner's taste: ${taste}\n\nShortlisted ideas with critiques:\n${shortlist.map((s, i) => `${i + 1}. ${s.title} (score ${s.total}/10) — ${s.candidate!.pitch}\nCritique: ${s.critique}`).join('\n\n')}\n\nFor each: title (keep it), summary, targetBuyer, monetization, pricePoints, firstProducts (the first 3-5 things to make), platforms, risks, evidence (which research findings support demand, with URLs; say plainly if support is thin), productType (one id from: ${productTypes().filter((t) => t.id !== 'bundle').map((t) => t.id).join(', ')}, the closest fit).`,
    maxTokens: 5000,
    trace: {},
  });
  runIds.push(...(p3.provenance.generationRunIds ?? []));
  const finals = p3.data.proposals
    .map((p) => ({ ...p, score: shortlist.find((s) => s.title.trim().toLowerCase() === p.title.trim().toLowerCase())?.total ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  return { candidates, vetted: vetted.map(({ candidate: _c, ...v }) => v), finals };
}

function contextFor(platforms: Awaited<ReturnType<typeof researchPlatform>>[], shops: Awaited<ReturnType<typeof researchShop>>[]): string {
  const lines: string[] = [];
  for (const p of platforms) {
    lines.push(`## ${p.platform}`);
    for (const f of p.findings) lines.push(`- ${f.item}: ${f.detail}${f.number ? ` [${f.number}]` : ''} (${f.sourceUrls[0] ?? 'no source'})`);
    for (const g of p.gaps) lines.push(`- GAP: ${g.gap} — ${g.whyItMatters}`);
  }
  for (const s of shops) {
    lines.push(`## Competitor ${s.shop} (${s.platform})`);
    for (const f of s.strengths) lines.push(`- does well: ${f.item}: ${f.detail}${f.number ? ` [${f.number}]` : ''}`);
    for (const g of s.gaps) lines.push(`- GAP: ${g.gap}`);
  }
  return lines.join('\n').slice(0, 14000);
}

/** Runs one digest end to end and emails it. Throws (after recording the failure) if anything essential fails. */
export async function runDigest(app: AppContext, opts: DigestOptions = {}): Promise<{ runId: string; status: 'sent' }> {
  const cfg = app.settings.get('research');
  const mode = await textMode(app).catch(() => ({ mode: 'deterministic' as const }));
  if (mode.mode !== 'ai') throw new ProviderError(app.settings.get('generation').textProvider, 'unconfigured', 'The research digest needs at least one AI provider key (Settings → AI providers).');
  const runId = newId('dig');
  const started = new Date().toISOString();
  app.db.insert('digest_runs', { id: runId, status: 'running', trigger: opts.trigger ?? 'manual', created_at: started });
  const { search, state } = makeSearcher(app, opts.endpoints ?? DEFAULT_ENDPOINTS);
  const runIds: string[] = [];
  const save = (fields: Record<string, unknown>) => app.db.update('digest_runs', runId, { ...fields, search_queries: state.used, generation_run_ids: JSON.stringify(runIds) });
  try {
    const platforms = [];
    for (const p of cfg.digest.platforms) {
      try {
        platforms.push(await researchPlatform(app, search, p, cfg.digest.searchesPerPlatform, runIds));
      } catch (err) {
        if (err instanceof AppError && ['search_budget', 'search_unconfigured'].includes(err.code)) throw err;
        platforms.push({ platform: p, findings: [], gaps: [], dataQuality: `Research failed: ${errorMessage(err)}`, sources: 0 });
      }
    }
    save({ bestsellers: JSON.stringify(platforms) });
    const shops = [];
    for (const s of cfg.competitorShops.slice(0, 10)) {
      try {
        shops.push(await researchShop(app, search, s, runIds));
      } catch (err) {
        if (err instanceof AppError && err.code === 'search_budget') break;
        shops.push({ shop: s.label ?? s.shopUrl, url: s.shopUrl, platform: s.platform, strengths: [], gaps: [], dataQuality: `Research failed: ${errorMessage(err)}` });
      }
    }
    save({ competitors: JSON.stringify(shops) });
    if (!platforms.some((p) => p.findings.length || p.gaps.length)) throw new AppError('digest_no_data', 'No platform research came back, so ideas were not generated. Check the search keys and the log.', { httpStatus: 502, errorClass: 'transient' });
    const ideas = await generateIdeas(app, contextFor(platforms, shops), runIds);
    save({ candidate_ideas: JSON.stringify(ideas.candidates), vetted_ideas: JSON.stringify(ideas.vetted), final_ideas: JSON.stringify(ideas.finals) });

    const mail = renderDigestEmail({ date: started.slice(0, 10), platforms, shops, finals: ideas.finals, vettedCount: ideas.vetted.length, candidateCount: ideas.candidates.length, searches: state.used });
    const sent = await (opts.mailer ?? smtpMailer(app)).send({ to: cfg.digest.recipientEmail, subject: mail.subject, html: mail.html, text: mail.text });
    const now = new Date().toISOString();
    save({ status: 'sent', email_sent_at: now, email_message_id: sent.messageId, finished_at: now });
    app.settings.update('research', { digest: { lastSentAt: now } });
    audit(app.db, opts.actor ?? 'system', 'digest.sent', 'digest', runId, { searches: state.used, to: cfg.digest.recipientEmail });
    return { runId, status: 'sent' };
  } catch (err) {
    save({ status: 'failed', error: errorMessage(err).slice(0, 2000), finished_at: new Date().toISOString() });
    throw err;
  }
}

export function isDigestDue(app: AppContext): boolean {
  const d = app.settings.get('research').digest;
  if (!d.enabled) return false;
  if (app.db.get("SELECT 1 FROM digest_runs WHERE status = 'running'")) return false;
  // After a failure, wait 6 hours before trying again on schedule, so a broken key doesn't burn search credit every hour.
  const failedSince = new Date(app.clock.now().getTime() - 6 * 3_600_000).toISOString();
  if (app.db.get("SELECT 1 FROM digest_runs WHERE status = 'failed' AND trigger = 'schedule' AND created_at > ?", failedSince)) return false;
  const last = d.lastSentAt ? new Date(d.lastSentAt).getTime() : 0;
  return app.clock.now().getTime() - last >= d.intervalDays * 86_400_000;
}

export function listDigestRuns(app: AppContext, limit = 20) {
  return app.db.all<Record<string, unknown>>('SELECT * FROM digest_runs ORDER BY created_at DESC LIMIT ?', limit).map(mapRun);
}

export function getDigestRun(app: AppContext, id: string) {
  const r = app.db.get<Record<string, unknown>>('SELECT * FROM digest_runs WHERE id = ?', id);
  if (!r) throw notFound('Digest run', id);
  return mapRun(r);
}

function mapRun(r: Record<string, unknown>) {
  return { ...r, bestsellers: json(r.bestsellers, []), competitors: json(r.competitors, []), candidate_ideas: json(r.candidate_ideas, []), vetted_ideas: json(r.vetted_ideas, []), final_ideas: json(r.final_ideas, []), generation_run_ids: json(r.generation_run_ids, []) };
}

/** Saves one of a digest's final ideas as an opportunity in Research, tagged as an AI hypothesis. */
export function promoteIdea(app: AppContext, runId: string, index: number, actor: AuditActor = 'user'): string {
  const run = getDigestRun(app, runId);
  const idea = (run.final_ideas as z.infer<typeof Proposal>[])[index];
  if (!idea) throw validation('No idea at that position in this digest');
  const productType = hasProductType(idea.productType) && idea.productType !== 'bundle' ? idea.productType : 'guided-journal';
  return createOpportunity(app, {
    title: idea.title.slice(0, 140),
    description: `${idea.summary}\n\nBuyer: ${idea.targetBuyer}\nMoney: ${idea.monetization}\nPrices: ${idea.pricePoints}\nFirst products: ${idea.firstProducts.join('; ')}\nRisks: ${idea.risks}`.slice(0, 4000),
    productType,
    differentiationNote: idea.evidence.slice(0, 2000),
    keywords: [],
    inputs: {},
  }, 'ai_suggestion', { digestRunId: runId, generationRunIds: run.generation_run_ids, evidence: 'model_hypothesis' }, actor);
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderDigestEmail(d: { date: string; platforms: any[]; shops: any[]; finals: any[]; vettedCount: number; candidateCount: number; searches: number }): { subject: string; html: string; text: string } {
  const badge = (e: string, verified?: boolean) => (verified ? 'number checked against source' : e === 'external_estimate' ? 'from a cited source' : 'AI inference — not verified');
  const host = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };
  const link = (u: string) => `<a href="${esc(u)}" style="color:#8a5a00">${esc(host(u))}</a>`;
  const safeLinks = (urls: string[]) => urls.filter((u) => /^https?:\/\//.test(u)).map(link).join(', ');
  const h: string[] = [];
  const t: string[] = [];
  h.push(`<div style="font-family:Georgia,serif;max-width:720px;margin:auto;color:#1c1c1c">`);
  h.push(`<h1 style="border-bottom:3px solid #8a5a00">Research digest — ${esc(d.date)}</h1><p style="color:#555">${d.searches} web searches. Numbers are shown only when they appear in the cited source; everything else is labeled.</p>`);
  t.push(`RESEARCH DIGEST — ${d.date}`, `${d.searches} web searches. Numbers appear only when found in the cited source.`, '');

  h.push(`<h2>1. What's selling, and where sellers fall short</h2>`);
  t.push('1. WHAT IS SELLING, AND WHERE SELLERS FALL SHORT');
  for (const p of d.platforms) {
    h.push(`<h3>${esc(p.platform)}</h3><p style="color:#777;font-size:13px">${esc(p.dataQuality)}</p><ul>`);
    t.push('', `## ${p.platform}`, `(${p.dataQuality})`);
    for (const f of p.findings) {
      h.push(`<li><b>${esc(f.item)}</b> — ${esc(f.detail)}${f.number ? ` <b>[${esc(f.number)}]</b>` : ''} <i style="color:#777">(${badge(f.evidence, f.numberVerified)}${f.sourceUrls.length ? `; ${safeLinks(f.sourceUrls)}` : ''})</i></li>`);
      t.push(`- ${f.item}: ${f.detail}${f.number ? ` [${f.number}]` : ''} (${badge(f.evidence, f.numberVerified)}) ${f.sourceUrls.join(' ')}`);
    }
    h.push(`</ul>`);
    if (p.gaps.length) {
      h.push(`<p><b>Gaps to fill:</b></p><ul>${p.gaps.map((g: DigestGap) => `<li>${esc(g.gap)} — ${esc(g.whyItMatters)}${g.sourceUrls.length ? ` <i>(${safeLinks(g.sourceUrls)})</i>` : ''}</li>`).join('')}</ul>`);
      t.push('Gaps:', ...p.gaps.map((g: DigestGap) => `- ${g.gap} — ${g.whyItMatters}`));
    }
  }

  h.push(`<h2>2. Your competitors</h2>`);
  t.push('', '2. YOUR COMPETITORS');
  if (!d.shops.length) {
    h.push(`<p>No competitor shops are listed yet. Add them in the app under Digest → Competitor shops.</p>`);
    t.push('No competitor shops listed yet (Digest → Competitor shops).');
  }
  for (const s of d.shops) {
    h.push(`<h3>${esc(s.shop)} <span style="font-weight:normal;color:#777">(${esc(s.platform)})</span></h3><p style="color:#777;font-size:13px">${esc(s.dataQuality)}</p>`);
    t.push('', `## ${s.shop} (${s.platform}) ${s.url}`);
    if (s.strengths.length) h.push(`<p><b>Doing well:</b></p><ul>${s.strengths.map((f: any) => `<li>${esc(f.item)} — ${esc(f.detail)}${f.number ? ` <b>[${esc(f.number)}]</b>` : ''} <i style="color:#777">(${badge(f.evidence, f.numberVerified)})</i></li>`).join('')}</ul>`);
    if (s.gaps.length) h.push(`<p><b>Where they come up short:</b></p><ul>${s.gaps.map((g: DigestGap) => `<li>${esc(g.gap)} — ${esc(g.whyItMatters)}</li>`).join('')}</ul>`);
    t.push(...s.strengths.map((f: any) => `+ ${f.item}: ${f.detail}`), ...s.gaps.map((g: DigestGap) => `- GAP: ${g.gap}`));
  }

  h.push(`<h2>3. Two ideas worth trying</h2><p style="color:#555">Picked from ${d.candidateCount} candidates after a separate harsh critique (${d.vettedCount} scored) and a refinement pass. These are AI judgments grounded in the research above, not guarantees.</p>`);
  t.push('', '3. TWO IDEAS WORTH TRYING', `From ${d.candidateCount} candidates, critiqued and refined.`);
  if (!d.finals.length) {
    h.push(`<p>No idea survived the critique this time.</p>`);
    t.push('No idea survived the critique this time.');
  }
  d.finals.forEach((f: any, i: number) => {
    h.push(`<div style="border:1px solid #d9c49a;border-radius:6px;padding:12px;margin:12px 0"><h3 style="margin-top:0">${i + 1}. ${esc(f.title)} <span style="color:#8a5a00">(${f.score}/10)</span></h3><p>${esc(f.summary)}</p>
      <p><b>Who buys it:</b> ${esc(f.targetBuyer)}<br><b>How it makes money:</b> ${esc(f.monetization)}<br><b>Prices:</b> ${esc(f.pricePoints)}<br><b>Sell on:</b> ${esc(f.platforms.join(', '))}</p>
      <p><b>Make first:</b></p><ul>${f.firstProducts.map((x: string) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p><b>Risks:</b> ${esc(f.risks)}<br><b>Evidence:</b> ${esc(f.evidence)}</p></div>`);
    t.push('', `${i + 1}. ${f.title} (${f.score}/10)`, f.summary, `Buyer: ${f.targetBuyer}`, `Money: ${f.monetization}`, `Prices: ${f.pricePoints}`, `Sell on: ${f.platforms.join(', ')}`, `Make first: ${f.firstProducts.join('; ')}`, `Risks: ${f.risks}`, `Evidence: ${f.evidence}`);
  });
  h.push(`<p style="color:#777;font-size:12px;margin-top:24px">Sent by Digital Asset Factory. Open the Digest page in the app to save an idea to Research.</p></div>`);
  return { subject: `Research digest ${d.date}: ${d.finals.map((f: any) => f.title).join(' / ') || 'market scan'}`.slice(0, 200), html: h.join('\n'), text: t.join('\n') };
}
