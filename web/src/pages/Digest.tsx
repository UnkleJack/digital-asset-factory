import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, errorText, useApi } from '../api.ts';
import { ActionButton, Async, Card, Empty, PageHead, Pill, useToast } from '../ui.tsx';
import { ago, fmtDate } from '../format.ts';

const PLATFORM_SUGGESTIONS = ['etsy', 'gumroad', 'creative market', 'teachers pay teachers', 'payhip', 'sellfy', 'shopify stores', 'amazon kdp', 'redbubble', 'zazzle', 'canva templates', 'ko-fi'];

export function Digest() {
  const st = useApi<any>('/digest', { poll: 10000 });
  const settings = useApi<any>('/settings');
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="page">
      <PageHead title="Research digest" sub="Every few days the app searches the web for what's selling, checks the competitor shops you list, puts new product ideas through three rounds of critique, and emails you the result." actions={<ActionButton className="primary" onClick={async () => { await api('/digest/run-now', { body: {} }); toast('Digest started — it takes a few minutes'); st.reload(); }}>Run a digest now</ActionButton>} />
      <Async state={st}>{(d) => (
        <div className="grid g3" style={{ marginBottom: 14 }}>
          <Card title="Schedule"><div className="kv"><span>Last emailed</span><span>{d.lastSentAt ? `${fmtDate(d.lastSentAt)} (${ago(d.lastSentAt)})` : 'never'}</span><span>Next due</span><span>{d.nextDueAt ? fmtDate(d.nextDueAt) : 'turned off'}</span><span>Running now</span><span>{d.running ? <Pill value="running" text="Yes" /> : 'No'}</span></div></Card>
          <Card title="Search budget"><div className="kv"><span>This month</span><span>{d.searchesThisMonth} of {d.monthlySearchBudget} searches</span></div><p className="small muted">A hard cap so the free search credit is never exceeded. Each digest uses about {3} searches per platform plus 2 per competitor shop.</p></Card>
          <Card title="Before the first run"><p className="small" style={{ margin: 0 }}>Needs: one AI key (<Link to="/settings?tab=ai">AI providers</Link>), a Tavily or Exa search key and the Gmail address + app password (<Link to="/settings?tab=integrations">Integrations</Link>). Use "Send a test email" there first.</p></Card>
        </div>
      )}</Async>
      <div className="grid g2">
        <Async state={settings}>{(s) => <DigestSettings value={s.settings.research} onSaved={() => { settings.reload(); st.reload(); }} />}</Async>
        <Card title="Past digests">
          <Async state={st}>{(d) => d.runs.length === 0 ? <Empty title="No digests yet">Run one now, or turn on the schedule.</Empty> : (
            <div className="stack">{d.runs.map((r: any) => (
              <div key={r.id} className="digest-run">
                <div className="spread"><span><b>{fmtDate(r.created_at)}</b> <span className="small muted">{r.trigger} · {r.search_queries} searches</span></span><span className="row"><Pill value={r.status === 'sent' ? 'ready' : r.status === 'failed' ? 'failed' : 'running'} text={r.status} /><button className="small" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'Open'}</button></span></div>
                {r.error && <div className="small" style={{ color: 'var(--bad)' }}>{r.error}</div>}
                {open === r.id && <RunDetail run={r} />}
              </div>
            ))}</div>
          )}</Async>
        </Card>
      </div>
    </div>
  );
}

function DigestSettings({ value, onSaved }: { value: any; onSaved: () => void }) {
  const [v, setV] = useState<any>(value);
  const [shop, setShop] = useState({ platform: 'etsy', shopUrl: '', label: '' });
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => setV(value), [value]);
  const d = v.digest;
  const set = (patch: any) => setV({ ...v, digest: { ...d, ...patch } });
  const save = async (next = v) => {
    setErr(null);
    try { await api('/settings/research', { method: 'PATCH', body: next }); toast('Saved'); onSaved(); } catch (e) { setErr(errorText(e)); }
  };
  return (
    <Card title="What to research" actions={<button className="primary small" onClick={() => save()}>Save</button>}>
      <div className="stack">
        <label className="check"><input type="checkbox" checked={d.enabled} onChange={(e) => set({ enabled: e.target.checked })} />Send a digest automatically</label>
        <div className="form">
          <label className="f">Every (days)<input type="number" min={1} max={30} value={d.intervalDays} onChange={(e) => set({ intervalDays: Number(e.target.value) || 2 })} /></label>
          <label className="f">Send to<input type="email" value={d.recipientEmail} onChange={(e) => set({ recipientEmail: e.target.value })} /></label>
          <label className="f">Ideas to brainstorm before critique<input type="number" min={2} max={12} value={d.candidateIdeaCount} onChange={(e) => set({ candidateIdeaCount: Number(e.target.value) || 8 })} /></label>
          <label className="f">Searches per platform<input type="number" min={1} max={5} value={d.searchesPerPlatform} onChange={(e) => set({ searchesPerPlatform: Number(e.target.value) || 3 })} /></label>
          <label className="f">Monthly search cap<input type="number" min={10} value={d.monthlySearchBudget} onChange={(e) => set({ monthlySearchBudget: Number(e.target.value) || 900 })} /></label>
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Platforms to scan (click to add or remove)</div>
          <div className="chips">{[...new Set([...PLATFORM_SUGGESTIONS, ...d.platforms])].map((p) => <button key={p} className={`chip${d.platforms.includes(p) ? ' on' : ''}`} onClick={() => set({ platforms: d.platforms.includes(p) ? d.platforms.filter((x: string) => x !== p) : [...d.platforms, p].slice(0, 15) })}>{p}</button>)}</div>
        </div>
        <label className="f">Your taste — what you like, want more of, or never want (the critique scores ideas against this)<textarea rows={4} value={d.tastePreferences} placeholder="e.g. I love retro gaming, dark fantasy and practical tools for parents. No baby-shower stuff." onChange={(e) => set({ tastePreferences: e.target.value })} /></label>
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Competitor shops to watch</div>
          {v.competitorShops.length === 0 && <p className="small muted" style={{ margin: 0 }}>None yet. Add the shops you compete with most directly.</p>}
          {v.competitorShops.map((s: any, i: number) => <div key={i} className="spread small"><span><b>{s.label || s.shopUrl}</b> <span className="muted">({s.platform}) {s.shopUrl}</span></span><button className="small danger" onClick={() => save({ ...v, competitorShops: v.competitorShops.filter((_: any, j: number) => j !== i) })}>Remove</button></div>)}
          <div className="row" style={{ marginTop: 6 }}>
            <input placeholder="Platform" value={shop.platform} onChange={(e) => setShop({ ...shop, platform: e.target.value })} style={{ width: 110 }} />
            <input placeholder="https://www.etsy.com/shop/..." value={shop.shopUrl} onChange={(e) => setShop({ ...shop, shopUrl: e.target.value })} style={{ flex: 1 }} />
            <input placeholder="Name (optional)" value={shop.label} onChange={(e) => setShop({ ...shop, label: e.target.value })} style={{ width: 140 }} />
            <button className="small" disabled={!/^https?:\/\//.test(shop.shopUrl)} onClick={() => { save({ ...v, competitorShops: [...v.competitorShops, { platform: shop.platform, shopUrl: shop.shopUrl, ...(shop.label && { label: shop.label }) }] }); setShop({ ...shop, shopUrl: '', label: '' }); }}>Add</button>
          </div>
        </div>
        {err && <div className="err">{err}</div>}
      </div>
    </Card>
  );
}

const ev = (f: any) => (f.numberVerified ? <Pill value="ready" text="number checked" /> : f.evidence === 'external_estimate' ? <Pill value="closed" text="cited" /> : <Pill value="pending" text="AI inference" />);

function RunDetail({ run }: { run: any }) {
  const toast = useToast();
  return (
    <div className="stack" style={{ marginTop: 8 }}>
      <h3>1. What's selling</h3>
      {run.bestsellers.map((p: any) => (
        <div key={p.platform}><b>{p.platform}</b> <span className="small muted">{p.dataQuality}</span>
          <ul className="small">{p.findings.map((f: any, i: number) => <li key={i}>{f.item} — {f.detail}{f.number && <b> [{f.number}]</b>} {ev(f)} {f.sourceUrls.map((u: string) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"> source↗</a>)}</li>)}</ul>
          {p.gaps.length > 0 && <ul className="small">{p.gaps.map((g: any, i: number) => <li key={i}><b>Gap:</b> {g.gap} — {g.whyItMatters}</li>)}</ul>}
        </div>
      ))}
      <h3>2. Competitors</h3>
      {run.competitors.length === 0 ? <p className="small muted">No competitor shops were listed.</p> : run.competitors.map((s: any) => (
        <div key={s.url}><b>{s.shop}</b> <span className="small muted">({s.platform})</span>
          <ul className="small">{s.strengths.map((f: any, i: number) => <li key={i}>+ {f.item} — {f.detail}{f.number && <b> [{f.number}]</b>} {ev(f)}</li>)}{s.gaps.map((g: any, i: number) => <li key={`g${i}`}>− {g.gap}</li>)}</ul>
        </div>
      ))}
      <h3>3. Ideas ({run.candidate_ideas.length} brainstormed → {run.vetted_ideas.filter((v: any) => v.verdict === 'keep').length} survived critique → {run.final_ideas.length} proposed)</h3>
      {run.final_ideas.map((f: any, i: number) => (
        <div key={i} className="idea">
          <div className="spread"><b>{f.title} <span className="muted">({f.score}/10)</span></b><ActionButton className="small" onClick={async () => { await api(`/digest/runs/${run.id}/promote`, { body: { index: i } }); toast('Saved to Research → Opportunities'); }}>Save to Research</ActionButton></div>
          <p className="small" style={{ margin: '4px 0' }}>{f.summary}</p>
          <div className="kv small"><span>Buyer</span><span>{f.targetBuyer}</span><span>Money</span><span>{f.monetization}</span><span>Prices</span><span>{f.pricePoints}</span><span>Make first</span><span>{f.firstProducts.join('; ')}</span><span>Risks</span><span>{f.risks}</span><span>Evidence</span><span>{f.evidence}</span></div>
        </div>
      ))}
      <details><summary className="small">All candidates and the critique</summary><ul className="small">{run.vetted_ideas.map((v: any) => <li key={v.title}><b>{v.title}</b> — {v.verdict} ({v.total}/10): {v.critique}</li>)}</ul></details>
    </div>
  );
}
