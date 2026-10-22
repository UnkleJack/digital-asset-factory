import { useState } from 'react';
import { Link } from 'react-router';
import { api, errorText, readFileText, useApi } from '../api.ts';
import { ActionButton, Async, Card, Empty, PageHead, Pill, useToast } from '../ui.tsx';
import { label, money, pct, usd } from '../format.ts';

const SOURCE: Record<string, string> = { marketplace_api: 'Marketplace API', csv_import: 'CSV import', manual_entry: 'Entered manually', estimate: 'Estimate' };

export function Analytics() {
  const st = useApi<any>('/analytics', { poll: 20000 });
  const recs = useApi<any[]>('/recommendations');
  const toast = useToast();
  return (
    <div className="page">
      <PageHead title="Analytics" sub="Production and sales evidence. Sales from different sources are reported separately and never added together." actions={<ActionButton onClick={async () => { const r = await api('/recommendations/refresh', { body: {} }); toast(`${r.created} new recommendation(s)`); recs.reload(); }}>Refresh recommendations</ActionButton>} />
      <Card title="Recommendations" actions={<span className="small muted">Suggestions only — nothing changes until you act on them.</span>}>
        <Async state={recs}>{(list) => list.length === 0 ? <Empty title="No recommendations yet">They need evidence: QA history, review decisions, recorded publications and sales data.</Empty> : (
          <table className="t"><tbody>{list.map((r) => (
            <tr key={r.id}>
              <td><Pill value={r.status === 'open' ? 'new' : r.status} text={label(r.kind)} /></td>
              <td><b>{r.title}</b><div className="small">{r.rationale}</div><div className="small muted">Evidence: {JSON.stringify(r.evidence)}</div></td>
              <td className="small">confidence {pct(r.confidence)}</td>
              <td className="right">{r.status === 'open' ? <div className="row" style={{ justifyContent: 'flex-end' }}><ActionButton className="small" onClick={async () => { await api(`/recommendations/${r.id}/decision`, { body: { status: 'accepted' } }); recs.reload(); }}>Accept</ActionButton><ActionButton className="small" onClick={async () => { await api(`/recommendations/${r.id}/decision`, { body: { status: 'dismissed' } }); recs.reload(); }}>Dismiss</ActionButton></div> : <Pill value={r.status} />}</td>
            </tr>
          ))}</tbody></table>
        )}</Async>
      </Card>
      <Async state={st}>{(m) => (
        <>
          <div className="grid g2" style={{ marginTop: 14 }}>
            <Card title="Production (last 30 days)">
              <div className="kv">
                <span>Versions produced</span><span>{m.production.versionsLast30}</span>
                <span>Avg. time to review-ready</span><span>{m.production.avgPipelineMinutes ? `${m.production.avgPipelineMinutes.toFixed(1)} min` : '—'}</span>
                <span>AI cost (estimate)</span><span>{usd(m.production.aiCost30?.usd ?? 0, 2)}{m.production.aiCost30?.unknown ? ` + ${m.production.aiCost30.unknown} runs with unknown price` : ''}</span>
                <span>Failed jobs</span><span>{m.production.jobsFailed30}</span>
              </div>
              <h3 style={{ marginTop: 14 }}>QA failure rate by product type</h3>
              {m.production.qaByType.length ? <table className="t"><tbody>{m.production.qaByType.map((r: any) => <tr key={r.type}><td>{label(r.type)}</td><td className="right">{r.failed}/{r.runs} ({pct(r.failed / r.runs)})</td></tr>)}</tbody></table> : <p className="muted small">No QA runs yet.</p>}
              <h3 style={{ marginTop: 14 }}>Review decisions</h3>
              {m.production.decisionsByType.length ? <table className="t"><tbody>{m.production.decisionsByType.map((r: any, i: number) => <tr key={i}><td>{label(r.type)}</td><td><Pill value={r.decision} /></td><td className="right">{r.n}</td></tr>)}</tbody></table> : <p className="muted small">No decisions yet.</p>}
            </Card>
            <Card title="Sales and engagement by source">
              {m.sales.bySource.length ? <table className="t"><thead><tr><th>Source</th><th>Metric</th><th className="right">Total</th></tr></thead><tbody>{m.sales.bySource.map((r: any, i: number) => <tr key={i}><td>{SOURCE[r.source_kind] ?? r.source_kind}</td><td>{label(r.metric)}</td><td className="right">{r.metric === 'revenue_cents' ? money(r.total) : r.total}</td></tr>)}</tbody></table> : <Empty title="No sales data yet">Import a sales CSV from your marketplace or enter numbers manually below.</Empty>}
              <p className="small muted">{m.note}</p>
              <h3>Listings</h3>
              <div className="small">{m.listings.published.map((r: any) => <div key={r.marketplace + r.verification}>{label(r.marketplace)}: {r.n} published ({r.verification === 'api_verified' ? 'verified' : 'recorded manually'})</div>)}{!m.listings.published.length && <span className="muted">Nothing published yet.</span>}</div>
            </Card>
          </div>
          {m.sales.byProduct.length > 0 && (
            <Card title="By product">
              <table className="t"><thead><tr><th>Product</th><th>Source</th><th className="right">Orders</th><th className="right">Revenue</th><th className="right">Views</th></tr></thead><tbody>{m.sales.byProduct.map((r: any, i: number) => <tr key={i}><td><Link to={`/products/${r.id}`}>{r.title}</Link></td><td>{SOURCE[r.source_kind]}</td><td className="right">{r.orders}</td><td className="right">{money(r.revenue_cents)}</td><td className="right">{r.views}</td></tr>)}</tbody></table>
            </Card>
          )}
        </>
      )}</Async>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <ImportCard onDone={() => st.reload()} />
        <ManualEntry onDone={() => st.reload()} />
      </div>
    </div>
  );
}

function ImportCard({ onDone }: { onDone: () => void }) {
  const [market, setMarket] = useState('etsy');
  const [result, setResult] = useState<any>(null);
  const toast = useToast();
  return (
    <Card title="Import sales CSV">
      <p className="small muted" style={{ marginTop: 0 }}>Needs a date column and a column identifying the listing (listing ID, URL or title). Quantity, revenue/item total, views and favorites are read when present. Rows are matched to listings you recorded as published.</p>
      <div className="row"><select value={market} onChange={(e) => setMarket(e.target.value)}>{['etsy', 'gumroad', 'generic'].map((m) => <option key={m} value={m}>{label(m)}</option>)}</select>
        <input type="file" accept=".csv,text/csv" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try { const r = await api('/analytics/import', { body: { filename: file.name, content: await readFileText(file), marketplace: market } }); setResult(r); onDone(); } catch (err) { toast(errorText(err), 'bad'); }
          e.target.value = '';
        }} /></div>
      {result && <div style={{ marginTop: 10 }}><Pill value={result.rejected ? 'partial' : 'completed'} text={`${result.imported} rows imported, ${result.rejected} rejected`} />{result.errors.slice(0, 10).map((x: any) => <div key={x.row} className="small" style={{ color: 'var(--bad)' }}>Row {x.row}: {x.message}</div>)}</div>}
    </Card>
  );
}

function ManualEntry({ onDone }: { onDone: () => void }) {
  const listings = useApi<any[]>('/listings?current=1');
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ listingId: '', metric: 'orders', value: '', periodStart: today, periodEnd: today, sourceKind: 'manual_entry', sourceDetail: '' });
  return (
    <Card title="Enter numbers manually">
      <div className="form">
        <label className="f">Listing<select value={f.listingId} onChange={(e) => setF({ ...f, listingId: e.target.value })}><option value="">Choose…</option>{listings.data?.map((l) => <option key={l.id} value={l.id}>{l.product_title} ({label(l.marketplace)})</option>)}</select></label>
        <label className="f">Metric<select value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}>{['views', 'favorites', 'orders', 'units', 'revenue_cents', 'refunds'].map((m) => <option key={m} value={m}>{m === 'revenue_cents' ? 'Revenue (cents)' : label(m)}</option>)}</select></label>
        <label className="f">Value<input type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label>
        <label className="f">From<input type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></label>
        <label className="f">To<input type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></label>
        <label className="f">This number is<select value={f.sourceKind} onChange={(e) => setF({ ...f, sourceKind: e.target.value })}><option value="manual_entry">Real (copied from my shop stats)</option><option value="estimate">An estimate</option></select></label>
      </div>
      <div style={{ marginTop: 10 }}><ActionButton className="primary" disabled={!f.listingId || f.value === ''} onClick={async () => { await api('/analytics/entries', { body: { ...f, value: Number(f.value) } }); toast('Saved'); setF({ ...f, value: '' }); onDone(); }}>Save</ActionButton></div>
    </Card>
  );
}
