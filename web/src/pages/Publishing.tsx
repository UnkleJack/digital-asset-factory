import { useState } from 'react';
import { Link } from 'react-router';
import { api, assetUrl, errorText, useApi } from '../api.ts';
import { ActionButton, Async, Card, Empty, Modal, PageHead, Pill, useToast } from '../ui.tsx';
import { ago, label } from '../format.ts';

export function Publishing() {
  const st = useApi<any[]>('/publishing', { poll: 8000 });
  const markets = useApi<any[]>('/marketplaces');
  const [recording, setRecording] = useState<any>(null);
  const [reconciling, setReconciling] = useState<any>(null);
  const toast = useToast();
  return (
    <div className="page">
      <PageHead title="Publishing status" sub="Export packages, recorded publications and reconciliation. Every action here requires an approval for the exact version and listing." />
      <Async state={markets}>{(list) => (
        <div className="grid g3" style={{ marginBottom: 14 }}>{list.map((m) => (
          <Card key={m.id} title={m.name}>
            <div className="row" style={{ marginBottom: 6 }}>{m.verification === 'verified' && m.capabilities.publish ? <Pill value="ready" text="Direct publishing verified" /> : m.directPublishOn ? <Pill value="pending" text="Direct publishing on — not yet live-confirmed" /> : m.capabilities.publish ? <Pill value="export_prepared" text="Direct publishing available — turn on in Settings → Integrations" /> : <Pill value="export_prepared" text="Export package + manual publishing" />}{!m.enabled && <Pill value="pending" text="Disabled" />}</div>
            <p className="small muted" style={{ margin: 0 }}>{m.notes}</p>
          </Card>
        ))}</div>
      )}</Async>
      <Card>
        <Async state={st}>{(list) => list.length === 0 ? <Empty title="Nothing to publish yet">Approve products in Batch approval to prepare export packages.</Empty> : (
          <table className="t">
            <thead><tr><th>Listing</th><th>Status</th><th>Approval</th><th>Live listing</th><th>Last action</th><th /></tr></thead>
            <tbody>{list.map(({ listing: l, adapter, approval, external, lastAttempt, exportAssetId }) => (
              <tr key={l.id}>
                <td><b>{l.product_title}</b><div className="small muted">{adapter.name} · <Link to={`/listings?open=${l.id}`}>{l.title.slice(0, 60)}{l.title.length > 60 ? '…' : ''}</Link></div></td>
                <td><Pill value={l.status} /></td>
                <td>{approval ? <Pill value="approved" text={`Approved ${ago(approval.decided_at)}`} /> : <span className="small muted">Needs approval</span>}</td>
                <td>{external.length ? external.map((e: any) => <div key={e.id} className="small"><a href={e.external_url} target="_blank" rel="noreferrer noopener">{e.external_url}</a><div><Pill value={e.verification} text={e.verification === 'api_verified' ? 'Verified by API' : 'Recorded manually — not verified by the app'} /></div></div>) : <span className="muted small">—</span>}</td>
                <td className="small">{lastAttempt ? <>{label(lastAttempt.operation)} · <Pill value={lastAttempt.status} /> {ago(lastAttempt.started_at)}{lastAttempt.error && <div style={{ color: 'var(--bad)' }}>{lastAttempt.error}</div>}</> : '—'}</td>
                <td className="right"><div className="row" style={{ justifyContent: 'flex-end' }}>
                  {l.status === 'needs_reconciliation' && <button className="small primary" onClick={() => setReconciling(l)}>Reconcile</button>}
                  <ActionButton className="small" disabled={!approval || l.status === 'needs_reconciliation'} title={!approval ? 'Approve this listing first' : ''} onClick={async () => { const r = await api(`/listings/${l.id}/export`, { body: {} }); toast(r.reused ? 'Export package already existed for this approval' : 'Export package ready'); st.reload(); window.location.href = assetUrl(r.exportAssetId, true); }}>Export package</ActionButton>
                  {exportAssetId && <a className="btn small" href={assetUrl(exportAssetId, true)}>Download</a>}
                  {!external.length && <button className="small" disabled={!approval || l.status === 'needs_reconciliation'} onClick={() => setRecording(l)}>Record publication</button>}
                  <ActionButton className="small" disabled={!adapter.directPublishOn || !approval || ['published_verified', 'published_manual'].includes(l.status)} title={!adapter.directPublishOn ? (adapter.capabilities.publish ? 'Turn on direct posting in Settings → Integrations' : 'Direct publishing is not built for this marketplace yet') : ''} onClick={async () => { const r = await api(`/listings/${l.id}/publish`, { body: {} }); toast(r.externalUrl ? `Posted: ${r.externalUrl}` : 'Posted'); st.reload(); }}>Publish directly</ActionButton>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}</Async>
      </Card>
      {recording && <RecordModal listing={recording} onClose={() => setRecording(null)} onDone={() => { setRecording(null); st.reload(); }} />}
      {reconciling && <ReconcileModal listing={reconciling} onClose={() => setReconciling(null)} onDone={() => { setReconciling(null); st.reload(); }} />}
    </div>
  );
}

function RecordModal({ listing, onClose, onDone }: { listing: any; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Record a manual publication" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={async () => { try { await api(`/listings/${listing.id}/record`, { body: { externalUrl: url } }); onDone(); } catch (e) { setErr(errorText(e)); } }}>Record</button></>}>
      <p className="small" style={{ marginTop: 0 }}>After you publish the listing yourself on {label(listing.marketplace)} using the export package, paste its URL here. The app records it as <b>published manually</b>; it does not verify that the listing is live.</p>
      <label className="f">Live listing URL<input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} /></label>
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

function ReconcileModal({ listing, onClose, onDone }: { listing: any; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const send = async (outcome: 'published' | 'not_published') => {
    try { await api(`/listings/${listing.id}/reconcile`, { body: { outcome, externalUrl: outcome === 'published' ? url : undefined } }); onDone(); } catch (e) { setErr(errorText(e)); }
  };
  return (
    <Modal title="Reconcile an unknown publication" onClose={onClose}>
      <p className="small" style={{ marginTop: 0 }}>A publish request was sent but the app could not confirm the result. Check {label(listing.marketplace)} and tell the app what happened. It will not retry until you do, so no duplicate listing can be created.</p>
      <label className="f">If it is live, its URL<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></label>
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      <div className="modal-foot"><button onClick={onClose}>Cancel</button><button onClick={() => send('not_published')}>It was NOT published</button><button className="primary" disabled={!url} onClick={() => send('published')}>It IS live</button></div>
    </Modal>
  );
}
