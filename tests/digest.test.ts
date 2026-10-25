// Research digest: search fallback and budget, number verification against sources, the three
// idea passes, email, and the restart-safe schedule. External services are local stand-ins;
// a live run with real keys is still needed to confirm real search results and delivery.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from '../src/app/bootstrap.ts';
import { MemorySecretStore } from '../src/config/secrets.ts';
import { runDigest, isDigestDue, verifyFinding, promoteIdea, getDigestRun } from '../src/engine/digest/service.ts';
import { makeSearcher } from '../src/engine/digest/search.ts';
import type { Mailer, MailMessage } from '../src/engine/digest/email.ts';
import { mockServer, type MockServer } from './mockServers.ts';
import { tempDir } from './helpers.ts';

const servers: MockServer[] = [];
after(async () => { for (const s of servers) await s.close(); });

const chat = (obj: unknown) => ({ json: { id: 'c', model: 'test-model', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(obj) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } } });
const SRC = 'https://example.com/etsy-report';

function aiReply(body: any) {
  const system = String(body.messages?.[0]?.content ?? '');
  const prompt = String(body.messages?.[1]?.content ?? '');
  if (prompt.startsWith('Platform:')) {
    return chat({
      findings: [
        { item: 'Budget planners', detail: 'Top seller sold a lot', number: '12,400 sales', evidence: 'external_estimate', sourceUrls: [SRC] },
        { item: 'Wedding templates', detail: 'Invented claim', number: '$90,000 a month', evidence: 'external_estimate', sourceUrls: [SRC] },
        { item: 'Made-up source', detail: 'Cites a URL not in the results', number: null, evidence: 'external_estimate', sourceUrls: ['https://not-in-results.example'] },
      ],
      gaps: [{ gap: 'No large-print planners for low-vision seniors', whyItMatters: 'Buyers ask for them in reviews', sourceUrls: [SRC] }],
      dataQuality: 'One seller report.',
    });
  }
  if (system.includes('You now propose product lines')) {
    return chat({ candidates: [
      { title: 'Large-print caregiver logbook', pitch: 'Medication, appointment and visit logs in 18pt type for family caregivers', targetBuyer: 'Adult children caring for parents', whyNotGeneric: 'Large print plus caregiver handoff pages', productTypes: ['habit-tracker'] },
      { title: 'Generic planner', pitch: 'A planner for everyone that does everything', targetBuyer: 'Everyone everywhere', whyNotGeneric: 'It is not', productTypes: [] },
      { title: 'Tabletop campaign session sheets', pitch: 'Session prep and NPC trackers for game masters', targetBuyer: 'Game masters running weekly games', whyNotGeneric: 'Few printable GM kits', productTypes: ['todo-checklist'] },
    ] });
  }
  if (system.includes('skeptical buyer')) {
    return chat({ scored: [
      { title: 'Large-print caregiver logbook', monetization: 8, demand: 8, novelty: 7, tasteFit: 6, feasibility: 9, verdict: 'keep', critique: 'Clear buyer, supported by the gap.' },
      { title: 'Generic planner', monetization: 3, demand: 4, novelty: 1, tasteFit: 2, feasibility: 9, verdict: 'cut', critique: 'Saturated and generic.' },
      { title: 'Tabletop campaign session sheets', monetization: 7, demand: 6, novelty: 8, tasteFit: 9, feasibility: 8, verdict: 'keep', critique: 'Passionate niche, little research support.' },
    ] });
  }
  if (system.includes('business proposals')) {
    return chat({ proposals: [
      { title: 'Large-print caregiver logbook', summary: 'A caregiver binder in large print.', targetBuyer: 'Family caregivers', monetization: 'Core binder plus add-on packs', pricePoints: '$7 single, $15 bundle', firstProducts: ['Medication log', 'Visit log'], platforms: ['etsy', 'gumroad'], risks: 'Medical wording must stay general.', evidence: `Gap in ${SRC}`, productType: 'habit-tracker' },
      { title: 'Tabletop campaign session sheets', summary: 'GM session kit.', targetBuyer: 'Game masters', monetization: 'Kits by genre', pricePoints: '$5-$12', firstProducts: ['Session prep sheet'], platforms: ['gumroad'], risks: 'Must avoid branded game names.', evidence: 'Thin: no direct source.', productType: 'todo-checklist' },
    ] });
  }
  return { status: 400, json: { error: { message: `unexpected prompt: ${system.slice(0, 60)}` } } };
}

async function setup(opts: { tavily: 'ok' | 'out_of_credit'; exa?: boolean } = { tavily: 'ok' }) {
  const ai = await mockServer((b) => aiReply(b));
  const tavily = await mockServer(() => (opts.tavily === 'ok' ? { json: { results: [{ title: 'Etsy budget planner seller report', url: SRC, content: 'One seller passed 12,400 sales of budget planners. Reviews ask for large print versions.' }] } } : { status: 432, json: { detail: { error: 'usage limit exceeded' } } }));
  const exa = await mockServer(() => ({ json: { results: [{ title: 'Exa result', url: SRC, highlights: ['One seller passed 12,400 sales of budget planners.'] }] } }));
  servers.push(ai, tavily, exa);
  const secrets = new MemorySecretStore();
  await secrets.set('groq_api_key', 'groq-test-key-123456');
  await secrets.set('tavily_api_key', 'tvly-test-key-123456');
  if (opts.exa) await secrets.set('exa_api_key', 'exa-test-key-123456');
  const app = bootstrap({ dataDir: tempDir(), secrets, logConsole: false, pacing: false });
  app.settings.update('generation', { textProvider: 'groq', fallbackOrder: [], groq: { baseUrl: ai.url, maxRetries: 0 } });
  app.settings.update('research', { digest: { platforms: ['etsy'], searchesPerPlatform: 2, enabled: true } });
  const sent: MailMessage[] = [];
  const mailer: Mailer = { send: async (m) => { sent.push(m); return { messageId: `<m${sent.length}@test>` }; } };
  return { app, ai, tavily, exa, sent, mailer, endpoints: { tavily: tavily.url, exa: exa.url, brave: 'http://127.0.0.1:9/unused' } };
}

test('a digest researches, keeps only numbers that are in the cited source, runs three idea passes and emails the result', async () => {
  const { app, sent, mailer, endpoints, ai } = await setup();
  const r = await runDigest(app, { endpoints, mailer, trigger: 'manual' });
  assert.equal(r.status, 'sent');
  const run: any = getDigestRun(app, r.runId);
  assert.equal(run.status, 'sent');
  assert.equal(run.search_queries, 2);

  const findings = run.bestsellers[0].findings;
  assert.equal(findings[0].number, '12,400 sales', 'a number present in the snippet is kept');
  assert.equal(findings[0].numberVerified, true);
  assert.equal(findings[1].number, null, 'a number not in the source is dropped');
  assert.equal(findings[1].evidence, 'model_hypothesis');
  assert.deepEqual(findings[2].sourceUrls, [], 'invented URLs are removed');
  assert.equal(findings[2].evidence, 'model_hypothesis');

  assert.equal(run.candidate_ideas.length, 3);
  assert.equal(run.vetted_ideas.find((v: any) => v.title === 'Generic planner').verdict, 'cut');
  assert.deepEqual(run.final_ideas.map((f: any) => f.title).sort(), ['Large-print caregiver logbook', 'Tabletop campaign session sheets']);
  const purposes = app.db.all<{ purpose: string }>('SELECT purpose FROM generation_runs ORDER BY started_at').map((x) => x.purpose);
  assert.deepEqual(purposes, ['digest:platform', 'digest:ideas-generate', 'digest:ideas-vet', 'digest:ideas-refine'], 'the critique is a separate call from the brainstorm');
  assert.ok(ai.calls.length === 4);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'daddyritz702@gmail.com');
  assert.match(sent[0].html, /12,400 sales/);
  assert.doesNotMatch(sent[0].html, /90,000/, 'the unverified number never reaches the email');
  assert.match(sent[0].text, /Large-print caregiver logbook/);
  assert.match(sent[0].subject, /Research digest/);

  assert.ok(app.settings.get('research').digest.lastSentAt, 'the schedule watermark advances only after sending');
  assert.equal(isDigestDue(app), false);

  const oppId = promoteIdea(app, r.runId, 0);
  const opp = app.db.get<{ origin: string; product_type: string }>('SELECT origin, product_type FROM opportunities WHERE id = ?', oppId)!;
  assert.equal(opp.origin, 'ai_suggestion');
  assert.equal(opp.product_type, 'habit-tracker');
  await app.close();
});

test('search falls back to the next provider when one is out of credit, and stops at the monthly budget', async () => {
  const { app, endpoints, tavily, exa } = await setup({ tavily: 'out_of_credit', exa: true });
  const s = makeSearcher(app, endpoints);
  const r1 = await s.search('q1');
  assert.equal(r1[0].url, SRC);
  await s.search('q2');
  assert.equal(tavily.calls.length, 1, 'an out-of-credit provider is not retried within the run');
  assert.equal(exa.calls.length, 2);
  assert.equal(exa.calls[0].headers['x-api-key'], 'exa-test-key-123456');

  app.settings.update('research', { digest: { monthlySearchBudget: 10 } });
  app.db.insert('digest_runs', { id: 'dig_old', status: 'sent', trigger: 'schedule', search_queries: 9, created_at: app.clock.now().toISOString() });
  const s2 = makeSearcher(app, endpoints);
  await s2.search('q3');
  await assert.rejects(s2.search('q4'), /monthly web-search budget/);
  await app.close();
});

test('the schedule is due from the stored watermark, survives restarts, and backs off after a failure', async () => {
  const { app, endpoints, mailer } = await setup();
  assert.equal(isDigestDue(app), true, 'never sent → due');
  app.settings.update('research', { digest: { lastSentAt: new Date(Date.now() - 1 * 86_400_000).toISOString() } });
  assert.equal(isDigestDue(app), false, 'sent yesterday with a 2-day interval → not due');
  app.settings.update('research', { digest: { lastSentAt: new Date(Date.now() - 3 * 86_400_000).toISOString() } });
  assert.equal(isDigestDue(app), true, 'overdue after downtime → due once');

  const failing: Mailer = { send: async () => { throw new Error('smtp down'); } };
  await assert.rejects(runDigest(app, { endpoints, mailer: failing, trigger: 'schedule' }), /smtp down/);
  assert.equal(isDigestDue(app), false, 'a failed scheduled run waits before retrying');
  assert.equal(app.db.value("SELECT status FROM digest_runs ORDER BY created_at DESC LIMIT 1"), 'failed');
  assert.ok(new Date(app.settings.get('research').digest.lastSentAt!).getTime() < Date.now() - 2 * 86_400_000, 'watermark unchanged by a failure');
  await runDigest(app, { endpoints, mailer, trigger: 'manual' });
  await app.close();
});

test('verifyFinding: digits must appear in a cited snippet', () => {
  const results = [{ title: 'T', url: 'https://a.example', snippet: 'Shop made $1,250 in March' }];
  assert.equal(verifyFinding({ number: '$1,250', evidence: 'external_estimate', sourceUrls: ['https://a.example'] }, results).numberVerified, true);
  assert.equal(verifyFinding({ number: '$12,500', evidence: 'external_estimate', sourceUrls: ['https://a.example'] }, results).number, null);
  assert.equal(verifyFinding({ number: null, evidence: 'measured', sourceUrls: ['https://a.example'] }, results).evidence, 'external_estimate', 'only the shop’s own data is "measured"');
});
