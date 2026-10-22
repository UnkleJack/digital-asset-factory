import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, assetUrl, useApi } from '../api.ts';
import { ActionButton, AssetImg, Async, Card, CheckList, Empty, Modal, PageHead, Pill, useToast } from '../ui.tsx';
import { ago, bytes, fmtDate, generatorLabel, label, money, pct, usd } from '../format.ts';

export function Batches() {
  const [status, setStatus] = useState('');
  const st = useApi<any[]>(`/batches${status ? `?status=${status}` : ''}`, { poll: 8000 });
  return (
    <div className="page">
      <PageHead title="Batch approval" sub="Review finished products in batches. Nothing is exported or published without an approval recorded here for the exact version and marketplace listing." />
      <div className="row" style={{ marginBottom: 12 }}><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All batches</option><option value="ready_for_review">Ready for review</option><option value="collecting">Still producing</option><option value="closed">Closed</option></select></div>
      <Card>
        <Async state={st}>{(list) => list.length === 0 ? <Empty title="No batches yet">Production plans create a batch per run; manually created products get their own batch.</Empty> : (
          <table className="t">
            <thead><tr><th>Batch</th><th>Status</th><th>Items</th><th>Awaiting decision</th><th>Created</th></tr></thead>
            <tbody>{list.map((b) => <tr key={b.id}><td><Link to={`/batches/${b.id}`}><b>{b.name}</b></Link><div className="small muted">{b.origin === 'scheduler' ? 'From a production plan' : 'Manual'}</div></td><td><Pill value={b.status} /></td><td>{b.items}</td><td>{b.awaiting}</td><td className="small">{ago(b.created_at)}</td></tr>)}</tbody>
          </table>
        )}</Async>
      </Card>
    </div>
  );
}

export function BatchReview() {
  const { id } = useParams();
  const st = useApi<any>(`/batches/${id}`, { poll: 5000 });
  return (
    <div className="page">
      <Async state={st}>{(d) => (
        <>
          <PageHead title={d.batch.name} sub={<><Pill value={d.batch.status} /> · {d.items.length} item(s) · created {fmtDate(d.batch.created_at)}</>} actions={<Link className="btn" to="/batches">All batches</Link>} />
          {d.batch.status === 'collecting' && <div className="banner info"><span className="spinner" /> Some items are still being produced. Finished items can be reviewed now.</div>}
          {d.items.length === 0 ? <Empty title="This batch is empty" /> : d.items.map((it: any) => <ItemCard key={it.item.id} it={it} reload={st.reload} />)}
        </>
      )}</Async>
    </div>
  );
}

function ItemCard({ it, reload }: { it: any; reload: () => void }) {
  const toast = useToast();
  const [markets, setMarkets] = useState<string[]>(it.listings.filter((l: any) => !l.validation.issues.length).map((l: any) => l.marketplace));
  const [modal, setModal] = useState<null | 'revise' | 'reject' | 'regen'>(null);
  const [notes, setNotes] = useState('');
  const v = it.version;
  const decided = it.decisions.find((x: any) => !x.invalidated_at);
  const busy = v.status === 'in_progress';
  const canApprove = it.current && ['ready', 'approved'].includes(v.status) && ['passed', 'passed_with_warnings'].includes(it.qa.status);
  const qaBlocked = ['failed'].includes(it.qa.status);
  const decide = async (decision: string, extra: Record<string, unknown> = {}) => {
    await api(`/batch-items/${it.item.id}/decision`, { body: { decision, ...extra } });
    toast(decision === 'approved' ? 'Approved' : decision === 'rejected' ? 'Rejected' : 'New version is being produced');
    setModal(null);
    setNotes('');
    reload();
  };
  return (
    <Card title={<><Link to={`/products/${it.product.id}`}>{it.product.title}</Link> <span className="muted small">v{v.version_no}</span></>} actions={<><Pill value={v.status} /><Pill value={it.qa.status} text={`QA ${label(it.qa.status)}`} /></>}>
      {!it.current && <div className="banner info">A newer version exists — review that one instead.</div>}
      <div className="item-card">
        <div className="stack">
          <div className="thumbs" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>{it.previews.slice(0, 4).map((p: any) => <a key={p.id} href={assetUrl(p.id)} target="_blank" rel="noreferrer" className="thumb"><AssetImg id={p.id} alt={`Page ${p.page}`} /></a>)}</div>
          {it.listingImages[0] && <a href={assetUrl(it.listingImages[0])} target="_blank" rel="noreferrer" className="thumb sq"><AssetImg id={it.listingImages[0]} alt="Main listing image" /></a>}
          {busy && <div className="small muted"><span className="spinner" /> {label(v.stage)}…</div>}
        </div>
        <div className="stack">
          <div className="kv">
            <span>Category</span><span>{it.product.category ?? '—'} · {label(it.product.product_type)}</span>
            <span>Audience / theme</span><span>{it.product.audience ?? 'General'} / {it.product.theme ?? 'none'}</span>
            <span>Content by</span><span>{it.provenance ? generatorLabel(it.provenance.generator, it.provenance.model) : '—'}</span>
            <span>Opportunity score</span><span>{it.score ? <>{it.score.score ?? '—'} <Pill value={it.score.outcome} /> <span className="small muted">evidence confidence {pct(it.score.confidence)}</span></> : <span className="muted">No linked opportunity</span>}</span>
            <span>Estimated AI cost</span><span>{it.cost.runs ? `${usd(it.cost.estimatedUsd ?? 0)} over ${it.cost.runs} call(s)${it.cost.unknownCostRuns ? `, ${it.cost.unknownCostRuns} with unknown price` : ''}` : 'None (no AI calls)'}</span>
            <span>Files</span><span>{it.files.map((f: any) => <span key={f.id} className="small" style={{ marginRight: 10 }}><a href={assetUrl(f.id, true)}>{f.name}</a> <span className="muted">{f.pages ? `${f.pages}p · ` : ''}{bytes(f.bytes)}</span></span>)}</span>
            {it.bundleMembers.length > 0 && <><span>Bundle contents</span><span>{it.bundleMembers.map((m: any) => m.title).join(', ')}</span></>}
            <span>History</span><span className="small">{it.history.map((h: any) => `v${h.version_no} ${label(h.origin)} (${label(h.status)})`).join(' → ')}</span>
          </div>

          {(it.qa.failures.length > 0 || it.qa.warnings.length > 0) && (
            <details open={it.qa.failures.length > 0}><summary>{it.qa.failures.length} QA failure(s), {it.qa.warnings.length} warning(s) / policy risks</summary><div style={{ marginTop: 8 }}><CheckList results={[...it.qa.failures, ...it.qa.warnings]} /></div></details>
          )}

          <div>
            <h3>Listings — choose where to approve</h3>
            {it.listings.length === 0 && <p className="muted small">No listings prepared yet.</p>}
            {it.listings.map((l: any) => (
              <div key={l.id} className="card" style={{ padding: 10, marginBottom: 8 }}>
                <div className="spread">
                  <label className="check"><input type="checkbox" disabled={!!l.validation.issues.length} checked={markets.includes(l.marketplace)} onChange={() => setMarkets(markets.includes(l.marketplace) ? markets.filter((m) => m !== l.marketplace) : [...markets, l.marketplace])} /><b>{label(l.marketplace)}</b></label>
                  <span className="row">{l.approval ? <Pill value="approved" text="Approved for this version" /> : <Pill value="pending" text="Not approved" />}<Link className="small" to={`/listings?open=${l.id}`}>Edit</Link></span>
                </div>
                <div className="small" style={{ marginTop: 6 }}><b>{l.title}</b> · {money(l.price_cents, l.currency)}</div>
                <div className="small muted">{l.tags.join(', ')}</div>
                <details><summary className="small">Description</summary><pre style={{ marginTop: 6 }}>{l.description}</pre></details>
                {l.validation.issues.length > 0 && <div className="err small" style={{ marginTop: 6 }}>{l.validation.issues.map((i: any) => `${i.field}: ${i.message}`).join('; ')}</div>}
              </div>
            ))}
          </div>

          {decided && <div className="small">Decision: <Pill value={decided.decision} /> by {decided.decided_by} {ago(decided.decided_at)}{decided.notes ? ` — “${decided.notes}”` : ''}</div>}
          {it.decisions.some((x: any) => x.invalidated_at) && <div className="small muted">Earlier approvals were withdrawn: {it.decisions.filter((x: any) => x.invalidated_at).map((x: any) => x.invalidated_reason).join('; ')}</div>}

          <div className="row">
            <ActionButton className="primary" disabled={!canApprove || !markets.length || qaBlocked} title={qaBlocked ? 'QA failed — this version cannot be approved' : !markets.length ? 'Choose at least one marketplace' : ''} onClick={() => decide('approved', { marketplaces: markets })}>Approve {markets.length ? `for ${markets.map(label).join(' & ')}` : ''}</ActionButton>
            <button disabled={!it.current || busy} onClick={() => setModal('revise')}>Return for revision</button>
            <button disabled={!it.current || busy} onClick={() => setModal('regen')}>Regenerate</button>
            <button className="danger" disabled={!it.current || busy || v.status === 'rejected'} onClick={() => setModal('reject')}>Reject</button>
            <Link className="btn" to={`/products/${it.product.id}`}>Edit…</Link>
          </div>
          {qaBlocked && <p className="small" style={{ color: 'var(--bad)', margin: 0 }}>This version failed a hard QA check, so it cannot be approved. Edit or regenerate it.</p>}
        </div>
      </div>
      {modal && (
        <Modal title={modal === 'revise' ? 'Return for revision' : modal === 'regen' ? 'Regenerate' : 'Reject'} onClose={() => setModal(null)} footer={<><button onClick={() => setModal(null)}>Cancel</button><ActionButton className={modal === 'reject' ? 'danger' : 'primary'} onClick={() => decide(modal === 'revise' ? 'revision_requested' : modal === 'regen' ? 'regenerate_requested' : 'rejected', { notes })}>{modal === 'revise' ? 'Send back with notes' : modal === 'regen' ? 'Regenerate' : 'Reject version'}</ActionButton></>}>
          <p className="small muted" style={{ marginTop: 0 }}>{modal === 'revise' ? 'Your notes are given to the generator for the next version.' : modal === 'regen' ? 'A fresh version is produced with a new random seed.' : 'The version is marked rejected and can never be published.'}</p>
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={modal === 'revise' ? 'What should change?' : 'Notes (optional)'} />
        </Modal>
      )}
    </Card>
  );
}
