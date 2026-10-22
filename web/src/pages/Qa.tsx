import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api.ts';
import { Async, Card, CheckList, Empty, PageHead, Pill } from '../ui.tsx';
import { ago, label } from '../format.ts';

export function QaPage() {
  const [status, setStatus] = useState('failed');
  const runs = useApi<any[]>(`/qa?limit=100${status ? `&status=${status}` : ''}`, { poll: 8000 });
  const summary = useApi<any[]>('/qa/summary', { poll: 15000 });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="page">
      <PageHead title="QA results" sub="Automated checks on every version. A failed hard check blocks approval and publication; warnings are shown to the reviewer." />
      <div className="grid g2">
        <Card title="Checks that fail most often">
          <Async state={summary}>{(list) => list.filter((r) => r.failed > 0).length === 0 ? <Empty title="No failures recorded" /> : (
            <table className="t"><thead><tr><th>Check</th><th>Severity</th><th className="right">Failed / run</th></tr></thead><tbody>{list.filter((r) => r.failed > 0).slice(0, 15).map((r) => <tr key={r.check_code + r.severity}><td>{label(r.check_code.replace(/:.*/, ''))}{r.check_code.includes(':') ? <span className="muted small"> ({r.check_code.split(':')[1]})</span> : null}</td><td><Pill value={r.severity === 'hard' ? 'failed' : 'pending'} text={r.severity === 'hard' ? 'Hard' : 'Warning'} /></td><td className="right">{r.failed} / {r.total}</td></tr>)}</tbody></table>
          )}</Async>
        </Card>
        <Card title="What is checked">
          <p className="small" style={{ marginTop: 0 }}>Files exist and match checksums · PDF opens with the right page count and paper size · no clipped or overflowing text · content inside print margins · fonts embedded · no external requests or render errors · product-specific consistency (dates, maze solvability, word placement…) · no placeholder text · no blocked trademark terms · spelling (warning) · exact and near duplicates · CSV/XLSX/SVG/PNG validity · provenance recorded · illustration line-art and resolution (warning) · bundle completeness · ZIP package and license · marketplace listing rules.</p>
        </Card>
      </div>
      <Card title="Recent QA runs" actions={<select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter"><option value="failed">Failed</option><option value="passed_with_warnings">Passed with warnings</option><option value="passed">Passed</option><option value="">All</option></select>}>
        <Async state={runs}>{(list) => list.length === 0 ? <Empty title="Nothing to show" /> : (
          <table className="t">
            <thead><tr><th>Product</th><th>Version</th><th>Checks</th><th>Result</th><th>When</th></tr></thead>
            <tbody>{list.map((r) => (
              <Fragment key={r.id}>
                <tr className="click" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td><Link to={`/products/${r.product_id}`} onClick={(e) => e.stopPropagation()}>{r.title}</Link><div className="small muted">{label(r.product_type)}</div></td>
                  <td>v{r.version_no}</td>
                  <td className="small">{r.kind === 'release' ? 'Release' : 'Deliverable'}</td>
                  <td><Pill value={r.status} /> <span className="small muted">{r.hard_failures} hard · {r.warnings} warnings</span></td>
                  <td className="small">{ago(r.started_at)}</td>
                </tr>
                {open === r.id && <tr><td colSpan={5}><CheckList results={r.results} /></td></tr>}
              </Fragment>
            ))}</tbody>
          </table>
        )}</Async>
      </Card>
    </div>
  );
}
