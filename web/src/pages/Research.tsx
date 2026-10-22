import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, errorText, readFileText, useApi } from '../api.ts';
import { ActionButton, Async, Card, Empty, Evidence, Modal, PageHead, Pill, Tabs, useToast } from '../ui.tsx';
import { fmtDate, label, pct } from '../format.ts';

const FACTORS = ['demand', 'competition', 'differentiation', 'commercial', 'productionCost', 'bundlePotential', 'seasonality', 'risk'];
const FACTOR_LABEL: Record<string, string> = { demand: 'Demand', competition: 'Competition (10 = little)', differentiation: 'Differentiation', commercial: 'Commercial potential', productionCost: 'Production cost (10 = cheap)', bundlePotential: 'Bundle potential', seasonality: 'Seasonality & timing', risk: 'Quality & policy risk (10 = safe)' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function Research() {
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState('opps');
  const [status, setStatus] = useState('');
  const opps = useApi<any[]>(`/opportunities${status ? `?status=${status}` : ''}`, { poll: 15000 });
  const [adding, setAdding] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const open = sp.get('open');
  return (
    <div className="page">
      <PageHead title="Research & opportunities" sub="Ideas worth producing, the evidence behind them, and a transparent score. Nothing here is invented: missing data stays “unknown”." actions={<><button onClick={() => setSuggesting(true)}>Suggest ideas with AI</button><button className="primary" onClick={() => setAdding(true)}>Add opportunity</button></>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'opps', label: 'Opportunities' }, { id: 'obs', label: 'Research data' }, { id: 'rules', label: 'How scoring works' }]} />
      {tab === 'opps' && (
        <>
          <div className="row" style={{ marginBottom: 12 }}><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter"><option value="">Open (not archived)</option>{['new', 'evaluating', 'approved', 'produced', 'rejected', 'archived'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          <Card>
            <Async state={opps}>{(list) => list.length === 0 ? <Empty title="No opportunities" action={<button className="primary" onClick={() => setAdding(true)}>Add one</button>}>Add ideas by hand, import keyword research, or ask the AI for idea suggestions (stored as hypotheses).</Empty> : (
              <table className="t">
                <thead><tr><th>Opportunity</th><th>Type</th><th>Status</th><th>Score</th><th>Evidence confidence</th><th>Outcome</th><th>Origin</th></tr></thead>
                <tbody>{list.map((o) => (
                  <tr key={o.id} className="click" onClick={() => setSp({ open: o.id })}>
                    <td><b>{o.title}</b><div className="small muted">{o.keywords.slice(0, 4).join(', ')}{o.seasonal_months.length ? ` · season ${o.seasonal_months.map((m: number) => MONTHS[m - 1]).join(', ')}` : ''}</div></td>
                    <td className="small">{label(o.product_type)}</td>
                    <td><Pill value={o.status} /></td>
                    <td>{o.score?.score ?? '—'}</td>
                    <td>{o.score ? pct(o.score.confidence) : '—'}</td>
                    <td>{o.score ? <Pill value={o.score.outcome} /> : <span className="muted small">not scored</span>}</td>
                    <td className="small">{o.origin === 'ai_suggestion' ? <Pill value="model_hypothesis" text="AI idea" /> : label(o.origin)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}</Async>
          </Card>
        </>
      )}
      {tab === 'obs' && <Observations />}
      {tab === 'rules' && <Rules />}
      {adding && <OpportunityForm onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); opps.reload(); setSp({ open: id }); }} />}
      {suggesting && <SuggestModal onClose={() => setSuggesting(false)} onDone={() => { setSuggesting(false); opps.reload(); }} />}
      {open && <OpportunityDrawer id={open} onClose={() => { setSp({}); opps.reload(); }} />}
    </div>
  );
}

function OpportunityForm({ onClose, onSaved, initial }: { onClose: () => void; onSaved: (id: string) => void; initial?: any }) {
  const types = useApi<any[]>('/product-types');
  const audiences = useApi<any[]>('/audiences');
  const themes = useApi<any[]>('/themes');
  const [f, setF] = useState({ title: initial?.title ?? '', description: initial?.description ?? '', productType: initial?.product_type ?? '', audienceId: initial?.audience_id ?? '', themeId: initial?.theme_id ?? '', keywords: (initial?.keywords ?? []).join(', '), seasonalMonths: initial?.seasonal_months ?? [], differentiationNote: initial?.differentiation_note ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setErr(null);
    const body = { title: f.title, description: f.description, productType: f.productType, audienceId: f.audienceId || null, themeId: f.themeId || null, keywords: f.keywords.split(',').map((k: string) => k.trim()).filter(Boolean), seasonalMonths: f.seasonalMonths, differentiationNote: f.differentiationNote };
    try {
      if (initial) { await api(`/opportunities/${initial.id}`, { method: 'PATCH', body }); onSaved(initial.id); }
      else { const r = await api('/opportunities', { body }); onSaved(r.id); }
    } catch (e) { setErr(errorText(e)); }
  };
  return (
    <Modal title={initial ? 'Edit opportunity' : 'Add opportunity'} wide onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
      <div className="form">
        <label className="f">Title<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="f">Product type<select value={f.productType} onChange={(e) => setF({ ...f, productType: e.target.value })}><option value="">Choose…</option>{types.data?.filter((t) => t.id !== 'bundle').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="f">Audience<select value={f.audienceId} onChange={(e) => setF({ ...f, audienceId: e.target.value })}><option value="">General</option>{audiences.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="f">Theme<select value={f.themeId} onChange={(e) => setF({ ...f, themeId: e.target.value })}><option value="">None</option>{themes.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="f">Search keywords (comma separated)<input value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} /></label>
      </div>
      <label className="f" style={{ marginTop: 10 }}>Description<textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <label className="f" style={{ marginTop: 10 }}>What would make it different?<textarea rows={2} value={f.differentiationNote} onChange={(e) => setF({ ...f, differentiationNote: e.target.value })} /></label>
      <h3 style={{ marginTop: 12 }}>Peak season months <span className="muted small">(leave empty if evergreen)</span></h3>
      <div className="row">{MONTHS.map((m, i) => <label key={m} className="check"><input type="checkbox" checked={f.seasonalMonths.includes(i + 1)} onChange={() => setF({ ...f, seasonalMonths: f.seasonalMonths.includes(i + 1) ? f.seasonalMonths.filter((x: number) => x !== i + 1) : [...f.seasonalMonths, i + 1] })} />{m}</label>)}</div>
      {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

function SuggestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [count, setCount] = useState(5);
  const [focus, setFocus] = useState('');
  const toast = useToast();
  return (
    <Modal title="Suggest ideas with AI" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><ActionButton className="primary" onClick={async () => { const r = await api('/opportunities/suggest', { body: { count, focus: focus || undefined } }); toast(`${r.ids.length} idea(s) added`); onDone(); }}>Suggest</ActionButton></>}>
      <div className="banner info" style={{ marginTop: 0 }}>Suggestions are stored as <b>AI hypotheses</b>. They carry no demand data — the AI is told not to invent search volumes or sales. Add real research before relying on them.</div>
      <div className="form"><label className="f">How many<input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label><label className="f">Focus (optional)<input value={focus} placeholder="e.g. teachers, back to school" onChange={(e) => setFocus(e.target.value)} /></label></div>
    </Modal>
  );
}

function OpportunityDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const st = useApi<any>(`/opportunities/${id}`);
  const nav = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [inputs, setInputs] = useState<Record<string, any> | null>(null);
  return (
    <Modal title="Opportunity" wide onClose={onClose}>
      <Async state={st}>{(d) => {
        const o = d.opportunity;
        const ins = inputs ?? o.inputs ?? {};
        const latest = d.scores[0];
        return (
          <div className="stack">
            <div className="spread"><div><h2 style={{ margin: 0 }}>{o.title}</h2><div className="small muted">{label(o.product_type)} · <Pill value={o.status} /> · {o.origin === 'ai_suggestion' ? 'AI-suggested idea (hypothesis)' : label(o.origin)}</div></div>
              <div className="row">
                <button className="small" onClick={() => setEditing(true)}>Edit</button>
                <ActionButton className="small" onClick={async () => { await api(`/opportunities/${id}/score`, { body: {} }); st.reload(); }}>Re-score</ActionButton>
                {o.status !== 'approved' && <ActionButton className="small" onClick={async () => { await api(`/opportunities/${id}`, { method: 'PATCH', body: { status: 'approved' } }); st.reload(); }} successText="Approved for production">Approve for production</ActionButton>}
                {o.status !== 'rejected' && <ActionButton className="small danger" onClick={async () => { await api(`/opportunities/${id}`, { method: 'PATCH', body: { status: 'rejected' } }); st.reload(); }}>Reject</ActionButton>}
                <ActionButton className="small primary" onClick={async () => { const r = await api(`/opportunities/${id}/produce`, { body: {} }); toast('Production started'); nav(`/products/${r.productId}`); }}>Produce now</ActionButton>
              </div></div>
            {o.description && <p style={{ margin: 0 }}>{o.description}</p>}
            {o.differentiation_note && <p className="small" style={{ margin: 0 }}><b>Differentiation:</b> {o.differentiation_note}</p>}
            <Card title={latest ? <>Score {latest.score ?? '—'} <Pill value={latest.outcome} /> <span className="small muted">confidence {pct(latest.confidence)} · {fmtDate(latest.created_at)}</span></> : 'Not scored yet'}>
              {latest ? latest.factors.map((f: any) => (
                <div key={f.factor} className="factor" style={{ marginBottom: 8 }}>
                  <span>{FACTOR_LABEL[f.factor]}</span>
                  <div><div className="bar"><span style={{ width: `${(f.value ?? 0) * 10}%`, opacity: f.value === null ? 0 : 1 }} /></div><div className="small muted">{f.source}{f.note ? ` — ${f.note}` : ''}</div></div>
                  <span className="right">{f.value ?? '—'} <Evidence kind={f.evidence} /></span>
                </div>
              )) : <p className="muted">Press Re-score to compute a score from the evidence below.</p>}
              {latest && <p className="small muted">Thresholds when scored: score ≥ {latest.thresholds.minScore}, confidence ≥ {latest.thresholds.minConfidence}. These are starting points you can change in Settings → Scoring. Unknown factors are left out of the score and lower the confidence.</p>}
            </Card>
            <Card title="Your ratings" actions={<ActionButton className="small primary" disabled={!inputs} onClick={async () => { await api(`/opportunities/${id}`, { method: 'PATCH', body: { inputs: ins } }); await api(`/opportunities/${id}/score`, { body: {} }); setInputs(null); st.reload(); }}>Save & re-score</ActionButton>}>
              <p className="small muted" style={{ marginTop: 0 }}>Optional. A rating you enter overrides derived values for that factor. Say honestly where it comes from.</p>
              {FACTORS.map((f) => {
                const cur = ins[f];
                return (
                  <div key={f} className="row" style={{ marginBottom: 6 }}>
                    <span style={{ width: 210 }} className="small">{FACTOR_LABEL[f]}</span>
                    <input type="number" min={0} max={10} step={0.5} style={{ width: 80 }} value={cur?.value ?? ''} placeholder="—" onChange={(e) => { const v = e.target.value; const next = { ...ins }; if (v === '') delete next[f]; else next[f] = { value: Number(v), evidence: cur?.evidence ?? 'measured', note: cur?.note }; setInputs(next); }} />
                    <select value={cur?.evidence ?? 'measured'} disabled={!cur} onChange={(e) => setInputs({ ...ins, [f]: { ...cur, evidence: e.target.value } })}><option value="measured">Measured by me</option><option value="external_estimate">External estimate</option><option value="model_hypothesis">AI hypothesis</option></select>
                    <input placeholder="note / source" disabled={!cur} value={cur?.note ?? ''} onChange={(e) => setInputs({ ...ins, [f]: { ...cur, note: e.target.value } })} />
                  </div>
                );
              })}
            </Card>
            <Card title={`Research data (${d.observations.length})`}>{d.observations.length ? <table className="t"><tbody>{d.observations.map((r: any) => <tr key={r.id}><td>{r.keyword ?? '—'}</td><td>{label(r.metric)}</td><td>{r.value_num ?? r.value_text}</td><td><Evidence kind={r.evidence_kind} /></td><td className="small muted">{r.source} · {r.observed_at}</td></tr>)}</tbody></table> : <p className="muted small">No data yet. Add observations in the Research data tab, linked to this opportunity or its keywords.</p>}</Card>
            {d.products.length > 0 && <Card title="Products made from this">{d.products.map((p: any) => <div key={p.id}><Link to={`/products/${p.id}`}>{p.title}</Link> <span className="small muted">{fmtDate(p.created_at)}</span></div>)}</Card>}
            {editing && <OpportunityForm initial={o} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); st.reload(); }} />}
          </div>
        );
      }}</Async>
    </Modal>
  );
}

function Observations() {
  const obs = useApi<any[]>('/observations');
  const opps = useApi<any[]>('/opportunities');
  const rules = useApi<any>('/scoring/rules');
  const toast = useToast();
  const [f, setF] = useState({ keyword: '', opportunityId: '', metric: 'search_volume', value: '', evidenceKind: 'measured', source: '', notes: '' });
  const [importResult, setImportResult] = useState<any>(null);
  const [defaults, setDefaults] = useState({ evidenceKind: 'external_estimate', source: '' });
  return (
    <div className="grid g2">
      <Card title="Add an observation">
        <div className="form">
          <label className="f">Keyword<input value={f.keyword} onChange={(e) => setF({ ...f, keyword: e.target.value })} /></label>
          <label className="f">…or opportunity<select value={f.opportunityId} onChange={(e) => setF({ ...f, opportunityId: e.target.value })}><option value="">—</option>{opps.data?.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></label>
          <label className="f">Metric<select value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}>{rules.data && Object.entries(rules.data.metrics).map(([k, m]: any) => <option key={k} value={k}>{m.label} ({m.unit})</option>)}</select></label>
          <label className="f">Value<input type="number" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label>
          <label className="f">Evidence<select value={f.evidenceKind} onChange={(e) => setF({ ...f, evidenceKind: e.target.value })}><option value="measured">Measured by me</option><option value="external_estimate">External tool estimate</option><option value="model_hypothesis">AI hypothesis</option></select></label>
          <label className="f">Source<input value={f.source} placeholder="e.g. counted on Etsy search, keyword tool" onChange={(e) => setF({ ...f, source: e.target.value })} /></label>
        </div>
        <div style={{ marginTop: 10 }}><ActionButton className="primary" onClick={async () => { await api('/observations', { body: { keyword: f.keyword || undefined, opportunityId: f.opportunityId || undefined, metric: f.metric, value: f.value === '' ? undefined : Number(f.value), evidenceKind: f.evidenceKind, source: f.source, notes: f.notes || undefined } }); toast('Observation saved'); setF({ ...f, value: '', keyword: '' }); obs.reload(); }}>Save observation</ActionButton></div>
      </Card>
      <Card title="Import a CSV">
        <p className="small muted" style={{ marginTop: 0 }}>Columns: <code>keyword, metric, value, unit, evidence_kind, source, observed_at, marketplace, notes</code>. Rows with problems are reported and skipped; good rows are kept.</p>
        <div className="form">
          <label className="f">Default evidence<select value={defaults.evidenceKind} onChange={(e) => setDefaults({ ...defaults, evidenceKind: e.target.value })}><option value="external_estimate">External estimate</option><option value="measured">Measured</option></select></label>
          <label className="f">Default source<input value={defaults.source} onChange={(e) => setDefaults({ ...defaults, source: e.target.value })} /></label>
        </div>
        <input type="file" accept=".csv,text/csv" style={{ marginTop: 10 }} onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try { const r = await api('/observations/import', { body: { filename: file.name, content: await readFileText(file), evidenceKind: defaults.evidenceKind, source: defaults.source || undefined } }); setImportResult(r); obs.reload(); } catch (err) { toast(errorText(err), 'bad'); }
          e.target.value = '';
        }} />
        {importResult && <div style={{ marginTop: 10 }}><Pill value={importResult.rejected ? 'partial' : 'completed'} text={`${importResult.imported} imported, ${importResult.rejected} rejected`} />{importResult.errors.map((x: any) => <div key={x.row} className="small" style={{ color: 'var(--bad)' }}>Row {x.row}: {x.message}</div>)}</div>}
      </Card>
      <Card title="Recorded research data" className="" >
        <Async state={obs}>{(list) => list.length ? <table className="t"><thead><tr><th>Keyword / opportunity</th><th>Metric</th><th>Value</th><th>Evidence</th><th>Source</th></tr></thead><tbody>{list.map((r) => <tr key={r.id}><td>{r.keyword ?? r.opportunity}</td><td>{label(r.metric)}</td><td>{r.value_num ?? r.value_text} {r.unit && <span className="muted small">{r.unit}</span>}</td><td><Evidence kind={r.evidence_kind} /></td><td className="small muted">{r.source} · {r.observed_at}</td></tr>)}</tbody></table> : <Empty title="No research data yet" />}</Async>
      </Card>
    </div>
  );
}

function Rules() {
  const r = useApi<any>('/scoring/rules');
  return <Async state={r}>{(d) => (
    <Card title="How opportunity scores are calculated">
      <p>Each factor is a 0–10 value with an evidence kind. The score is the weighted average of the factors that have values, scaled to 0–100. Factors with no data are <b>left out</b> and reduce the evidence confidence instead of being guessed.</p>
      <p>Confidence weights evidence by quality: measured 100%, external estimates 80%, AI hypotheses 30%, unknown 0%.</p>
      <table className="t"><tbody>{Object.entries(d.rules).map(([k, v]: any) => <tr key={k}><td><b>{label(k)}</b></td><td>{v}</td></tr>)}</tbody></table>
      <h3 style={{ marginTop: 14 }}>Current weights and thresholds</h3>
      <pre>{JSON.stringify(d.settings, null, 2)}</pre>
      <p className="small muted">Change them in Settings → Scoring. Thresholds are starting points, not rules.</p>
    </Card>
  )}</Async>;
}
