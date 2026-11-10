import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { api, useApi, usePagedApi } from '../api.ts';
import { CompactList, ShowDone } from '../compact.tsx';
import { ActionButton, Async, Card, ClearViewControls, Empty, Modal, PageHead, Pill, useClearView } from '../ui.tsx';
import { ago, fmtDate, label } from '../format.ts';

const TYPES = ['generate_content', 'generate_artwork', 'render', 'qa', 'package', 'prepare_listings', 'run_production_plan', 'refresh_recommendations'];

const ACTIVE = ['queued', 'running'];

type Group = { key: string; title: string; productId: string | null; jobs: any[]; last: string };

/** One line per product (or per kind of job that has no product), newest activity first. */
function groupJobs(jobs: any[]): Group[] {
  const map = new Map<string, Group>();
  for (const j of jobs) {
    const key = j.product_id ?? `type:${j.type}`;
    const g: Group = map.get(key) ?? { key, title: j.product_id ? (j.product_title ?? j.product_id) : label(j.type), productId: j.product_id ?? null, jobs: [], last: '' };
    g.jobs.push(j);
    const t = j.finished_at ?? j.created_at;
    if (t > g.last) g.last = t;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
}

function StatusSummary({ jobs }: { jobs: any[] }) {
  const counts: Record<string, number> = {};
  for (const j of jobs) counts[j.status] = (counts[j.status] ?? 0) + 1;
  return <span className="row" style={{ gap: 4 }}>{Object.entries(counts).map(([s, n]) => <Pill key={s} value={s} text={`${n} ${label(s).toLowerCase()}`} />)}</span>;
}

export function Jobs() {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [done, setDone] = useState(false);
  const qs = new URLSearchParams({ ...(status && { status }), ...(type && { type }), ...(!done && !status && { open: '1' }) });
  const st = usePagedApi<any>(`/jobs?${qs}`, { poll: 3000 });
  const [grouped, setGrouped] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const view = useClearView<any>('jobs', st.data?.items, (j) => j.finished_at ?? j.created_at, (j) => ACTIVE.includes(j.status));
  const [open, setOpen] = useState<string | null>(null);
  const row = (j: any, inGroup = false) => (
    <tr key={j.id} className="click" onClick={() => setOpen(j.id)}>
      <td style={inGroup ? { paddingLeft: 28 } : undefined}>{label(j.type)}</td>
      {!inGroup && <td>{j.product_id ? <Link to={`/products/${j.product_id}`} onClick={(e) => e.stopPropagation()}>{j.product_title ?? j.product_id}</Link> : <span className="muted">—</span>}</td>}
      <td><Pill value={j.status} />{j.status === 'queued' && new Date(j.run_after) > new Date() && <div className="small muted">retry {ago(j.run_after)}</div>}</td>
      <td>{j.attempts}/{j.max_attempts}</td>
      <td className="small">{ago(j.created_at)}</td>
      <td className="small" style={{ color: j.status === 'failed' ? 'var(--bad)' : 'var(--muted)' }}><span className="one-line" title={j.last_error ?? ''}>{j.last_error ?? ''}</span></td>
      <td className="right" onClick={(e) => e.stopPropagation()}>
        {['failed', 'cancelled'].includes(j.status) && <ActionButton className="small" onClick={async () => { await api(`/jobs/${j.id}/retry`, { body: {} }); st.reload(); }}>Retry</ActionButton>}
        {j.status === 'queued' && <ActionButton className="small" onClick={async () => { await api(`/jobs/${j.id}/cancel`, { body: {} }); st.reload(); }}>Cancel</ActionButton>}
      </td>
    </tr>
  );
  return (
    <div className="page">
      <PageHead title="Production jobs" sub="Every background step, its attempts and errors. Transient failures retry automatically with back-off; interrupted jobs resume after a restart." />
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{['queued', 'running', 'succeeded', 'failed', 'cancelled'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select>
        <ShowDone value={done} onChange={setDone} text="Show finished jobs" />
        <label className="check small"><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> One line per product</label>
        <Async state={st}>{(d) => <span className="small muted">{d.counts.map((c: any) => `${label(c.status)}: ${c.n}`).join(' · ')}</span>}</Async>
      </div>
      <Card>
        <Async state={st}>{(d) => d.items.length === 0 ? <Empty title={done || status ? 'No jobs' : 'Nothing running or failed'}>{done || status ? 'Jobs appear when products are produced.' : 'Finished jobs are hidden. Tick “Show finished jobs” to see them.'}</Empty> : (
          <CompactList total={d.total == null ? null : d.total - view.hiddenCount} shown={view.visible.length} onMore={st.more} noun="jobs" tools={<ClearViewControls view={view} noun="jobs" />}>
          {view.visible.length === 0 ? <Empty title="View cleared">Nothing was deleted. New jobs show up here as they start, and every product you have made stays in the <Link to="/library">Product library</Link>.</Empty> : grouped ? (
          <table className="t">
            <thead><tr><th>Product</th><th>Steps</th><th>Result</th><th>Last activity</th><th /></tr></thead>
            <tbody>{groupJobs(view.visible).map((g) => (
              <Fragment key={g.key}>
                <tr className="click" onClick={() => setExpanded(expanded === g.key ? null : g.key)}>
                  <td>{g.productId ? <Link to={`/products/${g.productId}`} onClick={(e) => e.stopPropagation()}><b>{g.title}</b></Link> : <b>{g.title}</b>}</td>
                  <td>{g.jobs.length}</td>
                  <td><StatusSummary jobs={g.jobs} /></td>
                  <td className="small">{ago(g.last)}</td>
                  <td className="right small muted" style={{ whiteSpace: 'nowrap' }}>{expanded === g.key ? 'Hide steps ▲' : 'Show steps ▼'}</td>
                </tr>
                {expanded === g.key && <tr><td colSpan={5} style={{ padding: 0 }}><table className="t"><tbody>{g.jobs.map((j) => row(j, true))}</tbody></table></td></tr>}
              </Fragment>
            ))}</tbody>
          </table>
          ) : (
          <table className="t">
            <thead><tr><th>Job</th><th>Product</th><th>Status</th><th>Attempts</th><th>Created</th><th>Last error</th><th /></tr></thead>
            <tbody>{view.visible.map((j: any) => row(j))}</tbody>
          </table>
          )}
          </CompactList>
        )}</Async>
      </Card>
      {open && <JobModal id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function JobModal({ id, onClose }: { id: string; onClose: () => void }) {
  const st = useApi<any>(`/jobs/${id}`, { poll: 3000 });
  return (
    <Modal title="Job details" wide onClose={onClose}>
      <Async state={st}>{(d) => (
        <div className="stack">
          <div className="kv"><span>Type</span><span>{label(d.job.type)}</span><span>Status</span><span><Pill value={d.job.status} /></span><span>Error class</span><span>{d.job.error_class ?? '—'}</span><span>Created</span><span>{fmtDate(d.job.created_at)}</span><span>Finished</span><span>{fmtDate(d.job.finished_at)}</span></div>
          <h3>Attempts</h3>
          <table className="t"><thead><tr><th>#</th><th>Worker</th><th>Started</th><th>Duration</th><th>Outcome</th><th>Error</th></tr></thead><tbody>{d.attempts.map((a: any) => <tr key={a.id}><td>{a.attempt_no}</td><td className="small mono">{a.worker}</td><td className="small">{fmtDate(a.started_at)}</td><td>{a.duration_ms ? `${(a.duration_ms / 1000).toFixed(1)}s` : '—'}</td><td><Pill value={a.outcome === 'succeeded' ? 'succeeded' : a.outcome ? 'failed' : 'running'} text={a.outcome ? label(a.outcome) : 'Running'} /></td><td className="small">{a.error}</td></tr>)}</tbody></table>
          {d.job.result && <><h3>Result</h3><pre>{JSON.stringify(d.job.result, null, 2)}</pre></>}
        </div>
      )}</Async>
    </Modal>
  );
}
