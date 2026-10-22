import { Link } from 'react-router';
import { useApi } from '../api.ts';
import { Async, Card, Empty, PageHead, Pill } from '../ui.tsx';
import { ago, fmtDate, label, usd } from '../format.ts';

export function Dashboard() {
  const state = useApi<any>('/dashboard', { poll: 5000 });
  return (
    <div className="page">
      <PageHead title="Dashboard" sub="What the factory is doing right now. Updates every few seconds." actions={<Link className="btn primary" to="/library?new=1">New product</Link>} />
      <Async state={state}>{(d) => (
        <>
          {d.providers.text.mode !== 'ai' && (
            <div className="banner warn"><b>AI text generation is not active.</b> {d.providers.text.reason}. Products are still produced with the built-in content library and are labelled that way in their provenance. <Link to="/settings?tab=ai">Configure AI providers</Link></div>
          )}
          {!d.providers.chrome && <div className="banner bad"><b>Google Chrome was not found.</b> PDF rendering will fail until it is installed or its path is set in <Link to="/settings?tab=rendering">Settings → Rendering</Link>.</div>}
          {d.counts.needsReconciliation > 0 && <div className="banner warn"><b>{d.counts.needsReconciliation} listing(s) need reconciliation:</b> a publish attempt has an unknown outcome. <Link to="/publishing">Resolve in Publishing</Link></div>}

          <div className="grid g4">
            <Stat value={d.counts.products} label="Active products" to="/library" />
            <Stat value={d.counts.inProduction} label="In production" to="/jobs" />
            <Stat value={d.counts.awaitingReview} label="Awaiting review" to="/batches" />
            <Stat value={d.counts.approved} label="Approved" to="/library?versionStatus=approved" />
            <Stat value={d.counts.publishedManual} label="Published — recorded manually (unverified)" to="/publishing" />
            <Stat value={d.counts.publishedVerified} label="Published — verified by API" to="/publishing" />
            <Stat value={d.counts.qaFailed} label="Failed or QA-failed" to="/qa" />
            <Stat value={d.counts.openOpportunities} label="Open opportunities" to="/research" />
          </div>

          <div className="grid g2" style={{ marginTop: 14 }}>
            <Card title="Ready for review" actions={<Link to="/batches">All batches</Link>}>
              {d.batches.length ? (
                <table className="t"><tbody>{d.batches.map((b: any) => <tr key={b.id}><td><Link to={`/batches/${b.id}`}>{b.name}</Link></td><td className="right muted">{b.items} item(s) · {ago(b.created_at)}</td></tr>)}</tbody></table>
              ) : <Empty title="Nothing waiting">Finished products appear here in review batches.</Empty>}
            </Card>
            <Card title="Production" actions={<Link to="/jobs">Jobs</Link>}>
              <div className="kv"><span>Queued jobs</span><span>{d.jobs.queued}</span><span>Running</span><span>{d.jobs.running.length ? d.jobs.running.map((j: any) => label(j.type)).join(', ') : 'none'}</span><span>AI cost, 30 days</span><span>{usd(d.cost30?.usd ?? 0, 2)} estimated{d.cost30?.unknown ? ` (+${d.cost30.unknown} runs with unknown cost)` : ''}</span></div>
              {d.jobs.recentFailures.length > 0 && (<><h3 style={{ marginTop: 14 }}>Recent failures</h3>{d.jobs.recentFailures.map((j: any) => <div key={j.id} className="small" style={{ marginBottom: 6 }}><Pill value="failed" /> <b>{j.title ?? label(j.type)}</b> — {j.last_error} <span className="muted">({ago(j.updated_at)})</span></div>)}</>)}
            </Card>
            <Card title="Schedule" actions={<Link to="/calendar">Calendar</Link>}>
              <p style={{ marginTop: 0 }}>{d.nextRun ? <>Next run: <b>{d.nextRun.plan}</b> at {fmtDate(d.nextRun.at)} ({ago(d.nextRun.at)})</> : <span className="muted">No enabled production plans. <Link to="/calendar">Create one</Link>.</span>}</p>
              {d.recentRuns.length > 0 && <table className="t"><tbody>{d.recentRuns.map((r: any) => <tr key={r.id}><td>{r.plan}</td><td><Pill value={r.status} /></td><td className="muted small">{r.slot.startsWith('manual:') ? `manual ${fmtDate(r.slot.slice(7))}` : fmtDate(r.slot)}</td><td className="right small">{r.products_created} made{r.items_skipped ? `, ${r.items_skipped} skipped` : ''}</td></tr>)}</tbody></table>}
              <p className="muted small">Scheduled runs only happen while this app is running. Missed runs are recorded and the latest is caught up at start-up.</p>
            </Card>
            <Card title="Integrations">
              <div className="kv">
                <span>Text AI</span><span>{d.providers.text.mode === 'ai' ? <Pill value="ready" text={`Anthropic · ${d.providers.text.model}`} /> : <Pill value="pending" text="Not active" />}</span>
                <span>Image AI</span><span>{d.providers.image.configured ? <Pill value="ready" text={`OpenAI · ${d.providers.image.model}`} /> : <Pill value="pending" text="Not configured" />}</span>
                <span>Rendering</span><span>{d.providers.chrome ? <Pill value="ready" text="Chrome found" /> : <Pill value="failed" text="Chrome missing" />}</span>
                {d.marketplaces.map((m: any) => <span key={m.id} style={{ display: 'contents' }}><span>{m.name}</span><span>{m.directPublishing ? <Pill value="ready" text="Direct publishing (verified)" /> : <Pill value="export_prepared" text="Export package + manual publishing" />}</span></span>)}
              </div>
            </Card>
          </div>
        </>
      )}</Async>
    </div>
  );
}

function Stat({ value, label: text, to }: { value: number; label: string; to: string }) {
  return <Link to={to} className="card" style={{ color: 'inherit', textDecoration: 'none' }}><div className="stat">{value ?? 0}</div><div className="stat-label">{text}</div></Link>;
}
