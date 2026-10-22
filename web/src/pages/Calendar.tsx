import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api, useApi } from '../api.ts';
import { ActionButton, Async, Card, Empty, Modal, PageHead, Pill, useToast } from '../ui.tsx';
import { fmtDate, label, usd } from '../format.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - 7);
  const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 7);
  const cal = useApi<any>(`/calendar?from=${from.toISOString()}&to=${to.toISOString()}`, { poll: 15000 });
  const plans = useApi<any[]>('/plans', { poll: 15000 });
  const [editing, setEditing] = useState<any | null>(null);
  return (
    <div className="page">
      <PageHead title="Production calendar" sub="Daily production plans, what ran, what was missed, and what is coming up." actions={<button className="primary" onClick={() => setEditing({})}>New production plan</button>} />
      <div className="banner info">Scheduled production only happens while the app is running. If the computer is off or asleep at a scheduled time, the run is recorded as missed and the most recent missed run is caught up when the app starts again.</div>
      <Card title={`${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`} actions={<><button className="small" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹ Prev</button><button className="small" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button className="small" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>Next ›</button></>}>
        <Async state={cal}>{(d) => <MonthGrid cursor={cursor} data={d} />}</Async>
      </Card>
      <Card title="Production plans">
        <Async state={plans}>{(list) => list.length === 0 ? <Empty title="No production plans yet" action={<button className="primary" onClick={() => setEditing({})}>Create a plan</button>}>A plan picks eligible opportunities every day (within quotas, category rotation and a cost limit) and puts the results in a review batch.</Empty> : (
          <table className="t">
            <thead><tr><th>Plan</th><th>Schedule</th><th>Quota</th><th>Cost limit</th><th>Next run</th><th>Last runs</th><th /></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b><div className="small muted">{p.product_types.length ? p.product_types.join(', ') : 'all product types'} · {p.marketplaces.join(', ')}</div></td>
                <td>{p.enabled ? <Pill value="active" text="Enabled" /> : <Pill value="pending" text="Paused" />}<div className="small">{p.run_at} on {p.days_of_week.length === 7 ? 'every day' : p.days_of_week.map((d: number) => DOW[d]).join(', ')}</div></td>
                <td>{p.quota}/run<div className="small muted">max {p.per_category_max} per category</div></td>
                <td>{usd(p.max_cost_usd, 2)}</td>
                <td className="small">{p.enabled && p.nextRun ? fmtDate(p.nextRun) : '—'}</td>
                <td>{p.runs.slice(0, 3).map((r: any) => <div key={r.id} className="small"><Pill value={r.status} /> {r.slot.startsWith('manual:') ? 'manual' : fmtDate(r.slot, false)} · {r.products_created} made{r.batch_id && <> · <Link to={`/batches/${r.batch_id}`}>batch</Link></>}{r.notes?.length ? <div className="muted">{r.notes[r.notes.length - 1]}</div> : null}</div>)}</td>
                <td className="right"><div className="row" style={{ justifyContent: 'flex-end' }}>
                  <ActionButton className="small" onClick={async () => { await api(`/plans/${p.id}/run`, { method: 'POST', body: {} }); plans.reload(); cal.reload(); }} successText="Production run started">Run now</ActionButton>
                  <button className="small" onClick={() => setEditing(p)}>Edit</button>
                  <ActionButton className="small" onClick={async () => { await api(`/plans/${p.id}`, { method: 'PATCH', body: { enabled: !p.enabled } }); plans.reload(); }}>{p.enabled ? 'Pause' : 'Enable'}</ActionButton>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}</Async>
      </Card>
      <Async state={cal}>{(d) => d.seasonal.length ? (
        <Card title="Seasonal opportunities">
          <table className="t"><tbody>{d.seasonal.map((o: any) => <tr key={o.id}><td>{o.title}</td><td>{o.seasonal_months.map((m: number) => MONTHS[m - 1]).join(', ')}</td><td><Pill value={o.status} /></td></tr>)}</tbody></table>
        </Card>
      ) : null}</Async>
      {editing && <PlanEditor plan={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); plans.reload(); cal.reload(); }} />}
    </div>
  );
}

function MonthGrid({ cursor, data }: { cursor: Date; data: any }) {
  const cells = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [cursor]);
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDay = new Map<string, { text: string; tone: string; link?: string }[]>();
  const push = (iso: string, ev: { text: string; tone: string; link?: string }) => {
    const k = key(new Date(iso));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(ev);
  };
  for (const r of data.runs) {
    const at = r.slot.startsWith('manual:') ? r.slot.slice(7) : r.slot;
    const tone = r.status === 'missed' ? 'var(--warn-soft)' : r.status === 'failed' ? 'var(--bad-soft)' : r.status === 'running' || r.status === 'pending' ? 'var(--primary-soft)' : 'var(--ok-soft)';
    push(at, { text: `${r.plan}: ${label(r.status)}${r.products_created ? ` (${r.products_created})` : ''}`, tone, link: r.batch_id ? `/batches/${r.batch_id}` : undefined });
  }
  for (const u of data.upcoming) push(u.at, { text: `${u.plan} ${new Date(u.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, tone: 'var(--surface-2)' });
  const today = key(new Date());
  return (
    <div className="cal">
      {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
      {cells.map((d) => (
        <div key={key(d)} className={`${d.getMonth() !== cursor.getMonth() ? 'out' : ''} ${key(d) === today ? 'today' : ''}`}>
          <span className="muted">{d.getDate()}</span>
          {(byDay.get(key(d)) ?? []).slice(0, 4).map((e, i) => e.link ? <Link key={i} to={e.link} className="ev" style={{ background: e.tone, color: 'var(--text)' }}>{e.text}</Link> : <span key={i} className="ev" style={{ background: e.tone }}>{e.text}</span>)}
        </div>
      ))}
    </div>
  );
}

function PlanEditor({ plan, onClose, onSaved }: { plan: any; onClose: () => void; onSaved: () => void }) {
  const types = useApi<any[]>('/product-types');
  const cats = useApi<any[]>('/categories');
  const toast = useToast();
  const [f, setF] = useState({
    name: plan.name ?? 'Daily production', enabled: plan.enabled ? true : false, runAt: plan.run_at ?? '06:00', daysOfWeek: plan.days_of_week ?? [0, 1, 2, 3, 4, 5, 6],
    quota: plan.quota ?? 5, perCategoryMax: plan.per_category_max ?? 2, categoryRotation: plan.category_rotation ?? [], productTypes: plan.product_types ?? [],
    marketplaces: plan.marketplaces ?? ['etsy'], maxCostUsd: plan.max_cost_usd ?? 2, minScore: plan.min_score ?? 60, minConfidence: plan.min_confidence ?? 0.35,
  });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (k: 'daysOfWeek' | 'productTypes' | 'marketplaces' | 'categoryRotation', v: any) => set(k, (f[k] as any[]).includes(v) ? (f[k] as any[]).filter((x) => x !== v) : [...(f[k] as any[]), v]);
  const save = async () => {
    try {
      if (plan.id) await api(`/plans/${plan.id}`, { method: 'PATCH', body: f });
      else await api('/plans', { body: f });
      toast('Plan saved');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };
  return (
    <Modal title={plan.id ? 'Edit production plan' : 'New production plan'} onClose={onClose} wide footer={<>{plan.id && <ActionButton className="danger" confirm="Delete this plan? Past runs are kept in history only while the plan exists." onClick={async () => { await api(`/plans/${plan.id}`, { method: 'DELETE' }); onSaved(); }}>Delete</ActionButton>}<button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save plan</button></>}>
      <div className="form">
        <label className="f">Name<input value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="f">Run at (local time)<input type="time" value={f.runAt} onChange={(e) => set('runAt', e.target.value)} /></label>
        <label className="f">Products per run<input type="number" min={1} max={50} value={f.quota} onChange={(e) => set('quota', Number(e.target.value))} /></label>
        <label className="f">Max per category per run<input type="number" min={1} max={50} value={f.perCategoryMax} onChange={(e) => set('perCategoryMax', Number(e.target.value))} /></label>
        <label className="f">Cost limit per run (USD, estimated)<input type="number" min={0} step={0.1} value={f.maxCostUsd} onChange={(e) => set('maxCostUsd', Number(e.target.value))} /><span className="field-help">AI calls stop once the estimate would exceed this.</span></label>
        <label className="f">Minimum score (0–100)<input type="number" min={0} max={100} value={f.minScore} onChange={(e) => set('minScore', Number(e.target.value))} /><span className="field-help">A starting point — adjust as you learn.</span></label>
        <label className="f">Minimum evidence confidence (0–1)<input type="number" min={0} max={1} step={0.05} value={f.minConfidence} onChange={(e) => set('minConfidence', Number(e.target.value))} /></label>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Enabled</label>
      </div>
      <h3 style={{ marginTop: 16 }}>Days</h3>
      <div className="row">{DOW.map((d, i) => <label key={d} className="check"><input type="checkbox" checked={f.daysOfWeek.includes(i)} onChange={() => toggle('daysOfWeek', i)} />{d}</label>)}</div>
      <h3 style={{ marginTop: 16 }}>Marketplaces for listings</h3>
      <div className="row">{['etsy', 'gumroad', 'generic'].map((m) => <label key={m} className="check"><input type="checkbox" checked={f.marketplaces.includes(m)} onChange={() => toggle('marketplaces', m)} />{label(m)}</label>)}</div>
      <h3 style={{ marginTop: 16 }}>Product types <span className="muted small">(none selected = all)</span></h3>
      <Async state={types}>{(list) => <div className="row">{list.filter((t) => t.id !== 'bundle').map((t) => <label key={t.id} className="check"><input type="checkbox" checked={f.productTypes.includes(t.id)} onChange={() => toggle('productTypes', t.id)} />{t.name}</label>)}</div>}</Async>
      <h3 style={{ marginTop: 16 }}>Category rotation <span className="muted small">(none selected = rotate through all; order follows selection)</span></h3>
      <Async state={cats}>{(list) => <div className="row">{list.map((c) => <label key={c.id} className="check"><input type="checkbox" checked={f.categoryRotation.includes(c.name)} onChange={() => toggle('categoryRotation', c.name)} />{c.name}</label>)}</div>}</Async>
    </Modal>
  );
}
