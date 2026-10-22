import { useState } from 'react';
import { Link } from 'react-router';
import { api, useApi } from '../api.ts';
import { ActionButton, Async, Card, Empty, Modal, PageHead, Pill } from '../ui.tsx';
import { ago, fmtDate, label } from '../format.ts';

const TYPES = ['generate_content', 'generate_artwork', 'render', 'qa', 'package', 'prepare_listings', 'run_production_plan', 'refresh_recommendations'];

export function Jobs() {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const qs = new URLSearchParams({ ...(status && { status }), ...(type && { type }), limit: '200' });
  const st = useApi<any>(`/jobs?${qs}`, { poll: 3000 });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="page">
      <PageHead title="Production jobs" sub="Every background step, its attempts and errors. Transient failures retry automatically with back-off; interrupted jobs resume after a restart." />
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{['queued', 'running', 'succeeded', 'failed', 'cancelled'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select>
        <Async state={st}>{(d) => <span className="small muted">{d.counts.map((c: any) => `${label(c.status)}: ${c.n}`).join(' · ')}</span>}</Async>
      </div>
      <Card>
        <Async state={st}>{(d) => d.items.length === 0 ? <Empty title="No jobs" >Jobs appear when products are produced.</Empty> : (
          <table className="t">
            <thead><tr><th>Job</th><th>Product</th><th>Status</th><th>Attempts</th><th>Created</th><th>Last error</th><th /></tr></thead>
            <tbody>{d.items.map((j: any) => (
              <tr key={j.id} className="click" onClick={() => setOpen(j.id)}>
                <td>{label(j.type)}</td>
                <td>{j.product_id ? <Link to={`/products/${j.product_id}`} onClick={(e) => e.stopPropagation()}>{j.product_title ?? j.product_id}</Link> : <span className="muted">—</span>}</td>
                <td><Pill value={j.status} />{j.status === 'queued' && new Date(j.run_after) > new Date() && <div className="small muted">retry {ago(j.run_after)}</div>}</td>
                <td>{j.attempts}/{j.max_attempts}</td>
                <td className="small">{ago(j.created_at)}</td>
                <td className="small" style={{ color: j.status === 'failed' ? 'var(--bad)' : 'var(--muted)', maxWidth: 360 }}>{j.last_error ?? ''}</td>
                <td className="right" onClick={(e) => e.stopPropagation()}>
                  {['failed', 'cancelled'].includes(j.status) && <ActionButton className="small" onClick={async () => { await api(`/jobs/${j.id}/retry`, { body: {} }); st.reload(); }}>Retry</ActionButton>}
                  {j.status === 'queued' && <ActionButton className="small" onClick={async () => { await api(`/jobs/${j.id}/cancel`, { body: {} }); st.reload(); }}>Cancel</ActionButton>}
                </td>
              </tr>
            ))}</tbody>
          </table>
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
