import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api, assetUrl, useApi, usePagedApi } from '../api.ts';
import { CompactList, CompactRow, PreviewButton, PreviewPane, ShowDone, usePreview, useReveal } from '../compact.tsx';
import { ActionButton, Async, Card, CheckList, Empty, Modal, PageHead, Pill, useToast } from '../ui.tsx';
import { ago, bytes, fmtDate, generatorLabel, label, money, pct, usd } from '../format.ts';

export function Batches() {
  const [status, setStatus] = useState('');
  const [done, setDone] = useState(false);
  const st = usePagedApi<any[]>(`/batches${status ? `?status=${status}` : done ? '' : '?open=1'}`, { poll: 8000 });
  return (
    <div className="page">
      <PageHead title="Batch approval" sub="Review finished products in batches. Nothing is exported or published without an approval recorded here for the exact version and marketplace listing." />
      <div className="row" style={{ marginBottom: 12 }}><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All batches</option><option value="ready_for_review">Ready for review</option><option value="collecting">Still producing</option><option value="closed">Closed</option></select>{!status && <ShowDone value={done} onChange={setDone} text="Show closed batches" />}</div>
      <WarningsToAccept />
      <Card>
        <Async state={st}>{(list) => list.length === 0 ? <Empty title={status || done ? 'No batches yet' : 'Nothing waiting for review'}>{status || done ? 'Production plans create a batch per run; manually created products get their own batch.' : 'Closed batches are hidden. Tick “Show closed batches” to see them.'}</Empty> : (
          <CompactList total={st.total} shown={list.length} onMore={st.more} noun="batches">
          <table className="t">
            <thead><tr><th>Batch</th><th>Status</th><th>Items</th><th>Awaiting decision</th><th>Created</th></tr></thead>
            <tbody>{list.map((b) => <tr key={b.id}><td><Link to={`/batches/${b.id}`}><b>{b.name}</b></Link><div className="small muted">{b.origin === 'scheduler' ? 'From a production plan' : 'Manual'}</div></td><td><Pill value={b.status} /></td><td>{b.items}</td><td>{b.awaiting}</td><td className="small">{ago(b.created_at)}</td></tr>)}</tbody>
          </table>
          </CompactList>
        )}</Async>
      </Card>
    </div>
  );
}

/** Items approved before the warning gate whose yellow flags were never accepted. They can't be packed or published yet. */
function WarningsToAccept() {
  const st = useApi<any[]>('/warnings-to-accept', { poll: 15000 });
  const list = st.data ?? [];
  if (!list.length) return null;
  return (
    <Card title={`${list.length} approved item${list.length === 1 ? '' : 's'} with warnings you haven't accepted`}>
      <p className="small muted" style={{ marginTop: 0 }}>These were approved before the warning gate. They stay approved, but they can't be packed or published until you review the warnings and tick "I accept these warnings" (or fix them).</p>
      <CompactList total={list.length} shown={list.length} noun="items" height={240}>
        {list.map((r) => (
          <CompactRow key={r.versionId} main={<><Link to={`/products/${r.productId}`}><b>{r.title}</b></Link> <span className="muted small">v{r.versionNo}</span></>} sub={`${r.warnings || 'Some'} warning${r.warnings === 1 ? '' : 's'}`}
            actions={r.batchId ? <Link className="btn small primary" to={`/batches/${r.batchId}?item=${r.itemId}`}>Review</Link> : <span className="small muted">Not in a batch</span>} />
        ))}
      </CompactList>
    </Card>
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
          {d.items.length === 0 ? <Empty title="This batch is empty" /> : <BatchItems items={d.items} reload={st.reload} />}
        </>
      )}</Async>
    </div>
  );
}

/** Every item as one slim line. Opening a line shows today's full review card; only one is open at a time. */
function BatchItems({ items, reload }: { items: any[]; reload: () => void }) {
  const { shown, total, more } = useReveal(items, 50);
  const [params] = useSearchParams();
  const { open, toggle } = usePreview(params.get('item'));
  return (
    <CompactList total={total} shown={shown.length} onMore={more} noun="items" height={open ? 'none' : 640}>
      {shown.map((it: any) => {
        const decided = it.decisions.find((x: any) => !x.invalidated_at);
        const isOpen = open === it.item.id;
        return (
          <CompactRow key={it.item.id} className={isOpen ? 'on' : ''}
            main={<><Link to={`/products/${it.product.id}`}><b>{it.product.title}</b></Link> <span className="muted small">v{it.version.version_no}</span></>}
            sub={<>{label(it.product.product_type)}{it.product.category ? ` · ${it.product.category}` : ''}{decided ? ` · ${label(decided.decision)} ${ago(decided.decided_at)}` : ''}</>}
            actions={<><Pill value={it.version.status} /><Pill value={it.qa.status} text={`QA ${label(it.qa.status)}`} /><button className={`small${isOpen ? '' : ' primary'}`} aria-expanded={isOpen} onClick={() => toggle(it.item.id)}>{isOpen ? 'Close' : 'Review'}</button></>}>
            {isOpen && <div style={{ marginTop: 8 }}><ItemCard it={it} reload={reload} /></div>}
          </CompactRow>
        );
      })}
    </CompactList>
  );
}

/** Page previews and the main listing image, loaded only when asked for. */
function ItemPreviews({ it }: { it: any }) {
  const [open, setOpen] = useState(false);
  const count = Math.min(4, it.previews.length) + (it.listingImages[0] ? 1 : 0);
  return (
    <div>
      <PreviewButton open={open} disabled={!count} onClick={() => setOpen(!open)} label={`Show previews (${count})`} />
      {open && <PreviewPane assets={[...it.previews.slice(0, 4).map((p: any) => p.id), it.listingImages[0]]} alt={it.product.title} />}
    </div>
  );
}

/** Yellow flags: each warning with an optional AI explanation, then the "I accept these warnings" tick. */
function WarningReview({ it, accept, setAccept, note, setNote }: { it: any; accept: boolean; setAccept: (v: boolean) => void; note: string; setNote: (v: string) => void }) {
  const done = it.version.status === 'approved' && it.warningsCleared;
  const last = it.acceptedWarnings?.[0];
  return (
    <div className="warn-review">
      <h3 style={{ margin: 0 }}>{it.qa.warnings.length || 'Some'} warning{it.qa.warnings.length === 1 ? '' : 's'} to review</h3>
      {it.version.status === 'approved' && !it.warningsCleared && <p className="small" style={{ margin: '4px 0 0', color: 'var(--warn)' }}>Approved before the warning gate, so it's held back from packing and publishing until you accept these (press Approve again after ticking).</p>}
      <p className="small muted" style={{ margin: '4px 0 8px' }}>Yellow flags have to be looked at before this can be approved or packed. Fix them (Edit, Return for revision, Regenerate), or accept them as they are.</p>
      <div className="stack" style={{ gap: 6 }}>
        {it.qa.warnings.map((w: any) => <WarningRow key={w.check_code} versionId={it.version.id} w={w} />)}
        {!it.qa.warnings.length && <p className="small muted" style={{ margin: 0 }}>QA marked this version "passed with warnings" but the details aren't in the newest run. Check the QA page for this product.</p>}
      </div>
      {last && <p className="small" style={{ margin: '8px 0 0' }}>You accepted {last.warnings?.length ?? 0} warning(s) {ago(last.at)}{last.notes ? ` — “${last.notes}”` : ''}.</p>}
      {!done && <>
        <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} /><b>I accept these warnings</b></label>
        {accept && <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): why it's fine, or what you'll do about it" maxLength={2000} style={{ marginTop: 6, width: '100%' }} />}
      </>}
    </div>
  );
}

function WarningRow({ versionId, w }: { versionId: string; w: any }) {
  const [help, setHelp] = useState<null | { meaning: string; fix: string; acceptIf: string }>(null);
  return (
    <div className="warn-row">
      <div className="spread" style={{ alignItems: 'flex-start', gap: 8 }}>
        <CheckList results={[w]} />
        {!help && <ActionButton className="small" onClick={async () => setHelp(await api(`/versions/${versionId}/warning-help`, { body: { check: w.check_code } }))}>Help me with this</ActionButton>}
      </div>
      {help && (
        <div className="kv small" style={{ marginTop: 6 }}>
          <span>What it means</span><span>{help.meaning}</span>
          <span>How to fix it</span><span>{help.fix}</span>
          <span>OK to accept if</span><span>{help.acceptIf}</span>
          <span /><span className="muted">AI suggestion only. Nothing was changed.</span>
        </div>
      )}
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
  const hasWarnings = it.qa.warnings.length > 0 || it.qa.status === 'passed_with_warnings';
  const [accept, setAccept] = useState(false);
  const [warningNote, setWarningNote] = useState('');
  const warnBlocked = hasWarnings && !accept;
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
          <ItemPreviews it={it} />
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

          {it.qa.failures.length > 0 && (
            <details open><summary>{it.qa.failures.length} QA failure(s)</summary><div style={{ marginTop: 8 }}><CheckList results={it.qa.failures} /></div></details>
          )}
          {hasWarnings && <WarningReview it={it} accept={accept} setAccept={setAccept} note={warningNote} setNote={setWarningNote} />}

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
            <ActionButton className="primary" disabled={!canApprove || !markets.length || qaBlocked || warnBlocked} title={qaBlocked ? 'QA failed — this version cannot be approved' : warnBlocked ? 'Review the warnings and tick "I accept these warnings" first' : !markets.length ? 'Choose at least one marketplace' : ''} onClick={() => decide('approved', { marketplaces: markets, ...(hasWarnings && { acceptWarnings: accept, warningNote }) })}>Approve {markets.length ? `for ${markets.map(label).join(' & ')}` : ''}</ActionButton>
            <button disabled={!it.current || busy} onClick={() => setModal('revise')}>Return for revision</button>
            <button disabled={!it.current || busy} onClick={() => setModal('regen')}>Regenerate</button>
            <button className="danger" disabled={!it.current || busy || v.status === 'rejected'} onClick={() => setModal('reject')}>Reject</button>
            <Link className="btn" to={`/products/${it.product.id}`}>Edit…</Link>
          </div>
          {qaBlocked && <p className="small" style={{ color: 'var(--bad)', margin: 0 }}>This version failed a hard QA check, so it cannot be approved. Edit or regenerate it.</p>}
          {!qaBlocked && warnBlocked && canApprove && <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>Approve unlocks once you tick "I accept these warnings" above.</p>}
        </div>
      </div>
      {modal && (
        <Modal title={modal === 'revise' ? 'Return for revision' : modal === 'regen' ? 'Regenerate' : 'Reject'} onClose={() => setModal(null)} footer={<><button onClick={() => setModal(null)}>Cancel</button><ActionButton className={modal === 'reject' ? 'danger' : 'primary'} onClick={() => decide(modal === 'revise' ? 'revision_requested' : modal === 'regen' ? 'regenerate_requested' : 'rejected', { notes })}>{modal === 'revise' ? 'Send back with notes' : modal === 'regen' ? 'Regenerate' : 'Reject version'}</ActionButton></>}>
          <p className="small muted" style={{ marginTop: 0 }}>{modal === 'revise' ? 'Your notes are given to the generator for the next version.' : modal === 'regen' ? 'A fresh version is produced with a new random seed.' : 'The version is marked rejected and can never be published.'}</p>
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={modal === 'revise' ? 'What should change?' : modal === 'reject' ? 'Why are you rejecting it? (optional, e.g. "text too small", "colors clash")' : 'Notes (optional)'} />
          <p className="small muted" style={{ marginBottom: 0 }}>Anything you write here is checked first: it has to be real words that say what's wrong. Keyboard-mash gets sent back and nothing changes.</p>
        </Modal>
      )}
    </Card>
  );
}
