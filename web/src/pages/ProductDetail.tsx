import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, assetUrl, errorText, useApi } from '../api.ts';
import { ActionButton, AssetImg, Async, Card, CheckList, Empty, Modal, PageHead, Pill, Tabs, useToast } from '../ui.tsx';
import { ago, bytes, fmtDate, generatorLabel, label, money, usd } from '../format.ts';
import { ParamsEditor } from './Library.tsx';
import { PackBuilder } from './PackBuilder.tsx';
import { ProductTags } from './Packing.tsx';

export function ProductDetail() {
  const { id } = useParams();
  const prod = useApi<any>(`/products/${id}`, { poll: 5000 });
  const [versionId, setVersionId] = useState<string | null>(null);
  const vid = versionId ?? prod.data?.product.current_version_id ?? null;
  const ver = useApi<any>(vid ? `/versions/${vid}` : null, { poll: 4000 });
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState<null | 'content' | 'design' | 'variation' | 'bundle'>(null);
  const nav = useNavigate();
  useEffect(() => setVersionId(null), [id]);
  return (
    <div className="page">
      <Async state={prod}>{(p) => (
        <>
          <PageHead title={p.product.title} sub={<>{label(p.product.product_type)} · {p.product.category ?? 'Uncategorized'}{p.product.audience ? ` · ${p.product.audience}` : ''}{p.product.theme ? ` · ${p.product.theme}` : ''} · <Pill value={p.product.status} /></>}
            actions={<>
              <button onClick={() => setModal('content')} disabled={!ver.data?.version.content}>Edit content</button>
              <button onClick={() => setModal('design')}>Change design / paper</button>
              <button onClick={() => setModal('variation')}>Make variation</button>
              {p.product.product_type !== 'bundle' && <button onClick={() => setModal('bundle')}>Bundle with…</button>}
              {p.product.status === 'active'
                ? <ActionButton confirm="Archive this product? It stays in the library under Archived." onClick={async () => { await api(`/products/${p.product.id}/status`, { method: 'PATCH', body: { status: 'archived' } }); prod.reload(); }}>Archive</ActionButton>
                : <ActionButton onClick={async () => { await api(`/products/${p.product.id}/status`, { method: 'PATCH', body: { status: 'active' } }); prod.reload(); }}>Restore</ActionButton>}
            </>} />
          {p.product.opportunity && <p className="small muted" style={{ marginTop: -8 }}>From opportunity <Link to={`/research?open=${p.product.opportunity.id}`}>{p.product.opportunity.title}</Link></p>}
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="small muted">Version:</span>
            {p.versions.map((v: any) => <button key={v.id} className={`small ${v.id === vid ? 'primary' : ''}`} onClick={() => setVersionId(v.id)}>v{v.version_no} · {label(v.status)}</button>)}
          </div>
          <Async state={ver}>{(v) => (
            <>
              {v.version.id !== p.product.current_version_id && <div className="banner info">You are viewing an older version. The current version is v{p.versions[0]?.version_no}.</div>}
              {v.version.status === 'in_progress' && <div className="banner info"><span className="spinner" /> In production — stage: <b>{label(v.version.stage)}</b>. This page updates automatically.</div>}
              {['failed', 'qa_failed'].includes(v.version.status) && (
                <div className="banner bad"><b>{v.version.status === 'qa_failed' ? 'QA failed' : 'Production failed'}:</b> {v.version.error ?? 'see QA results'}
                  {v.version.status === 'failed' && <> · <ActionButton className="small" onClick={async () => { await api(`/versions/${v.version.id}/retry`, { body: {} }); ver.reload(); prod.reload(); }} successText="Retrying">Retry failed step</ActionButton></>}
                  {v.version.status === 'qa_failed' && <> · Fix it with <b>Edit content</b> or <b>Change design</b>, or regenerate from batch review.</>}
                </div>
              )}
              <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'qa', label: `QA (${label(v.version.qa_status)})` }, { id: 'listings', label: `Listings (${v.listings.length})` }, { id: 'provenance', label: 'Provenance & cost' }, { id: 'history', label: 'History & related' }]} />
              {tab === 'overview' && <Overview v={v} />}
              {tab === 'qa' && <QaTab v={v} />}
              {tab === 'listings' && <ListingsTab v={v} />}
              {tab === 'provenance' && <ProvenanceTab v={v} />}
              {tab === 'history' && <HistoryTab p={p} />}
              {modal === 'content' && <ContentEditor version={v.version} onClose={() => setModal(null)} onDone={(nid) => { setModal(null); setVersionId(nid); prod.reload(); }} />}
              {modal === 'design' && <DesignEditor version={v.version} spec={v.spec} onClose={() => setModal(null)} onDone={(nid) => { setModal(null); setVersionId(nid); prod.reload(); }} />}
              {modal === 'variation' && <VariationEditor product={p.product} spec={v.spec} onClose={() => setModal(null)} onDone={(pid) => { setModal(null); nav(`/products/${pid}`); }} />}
              {modal === 'bundle' && <PackBuilder initial={[p.product.id]} onClose={() => setModal(null)} onDone={(pid) => { setModal(null); nav(`/products/${pid}`); }} />}
            </>
          )}</Async>
        </>
      )}</Async>
    </div>
  );
}

function Overview({ v }: { v: any }) {
  const previews = v.assets.filter((a: any) => a.role === 'preview');
  const listingImgs = v.assets.filter((a: any) => a.role === 'listing_image');
  const files = v.assets.filter((a: any) => a.role === 'deliverable');
  return (
    <>
      <Card title="Page previews">{previews.length ? <div className="thumbs">{previews.map((a: any) => <a key={a.id} href={assetUrl(a.id)} target="_blank" rel="noreferrer" className="thumb"><AssetImg id={a.id} alt={`Page ${a.pageIndex + 1}`} /></a>)}</div> : <Empty title="No previews yet">They appear once the product is rendered.</Empty>}</Card>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title="Files">
          {files.length ? <table className="t"><tbody>{files.map((a: any) => <tr key={a.id}><td><a href={assetUrl(a.id)} target="_blank" rel="noreferrer">{a.name}</a><div className="small muted">{label(a.kind)}{a.pages ? ` · ${a.pages} pages` : ''}</div></td><td className="right small">{bytes(a.bytes)}</td><td className="right"><a className="btn small" href={assetUrl(a.id, true)}>Download</a></td></tr>)}</tbody></table> : <p className="muted">No files yet.</p>}
          <div className="kv" style={{ marginTop: 12 }}><span>Design</span><span>{v.spec.designSystem}</span><span>Paper</span><span>{label(v.spec.paper.size)} · {v.spec.paper.orientation}{v.spec.paper.grayscale ? ' · grayscale' : ''}</span><span>Seed</span><span className="mono">{v.spec.seed}</span></div>
        </Card>
        <Card title="Production steps">
          <table className="t"><tbody>{v.jobs.map((j: any) => <tr key={j.id}><td>{label(j.type)}</td><td><Pill value={j.status} /></td><td className="small muted">attempt {j.attempts}/{j.max_attempts}{j.last_error ? <div style={{ color: 'var(--bad)' }}>{j.last_error}</div> : null}</td></tr>)}</tbody></table>
          {!v.jobs.length && <p className="muted">No production jobs yet.</p>}
        </Card>
      </div>
      {v.product?.id && <div style={{ marginTop: 14 }}><ProductTags productId={v.product.id} /></div>}
      {listingImgs.length > 0 && <Card title="Listing images" className="" ><div className="thumbs">{listingImgs.map((a: any) => <a key={a.id} href={assetUrl(a.id)} target="_blank" rel="noreferrer" className="thumb sq"><AssetImg id={a.id} alt="Listing image" /></a>)}</div></Card>}
    </>
  );
}

function QaTab({ v }: { v: any }) {
  if (!v.qa.length) return <Empty title="QA has not run yet" />;
  return <>{v.qa.map((r: any) => <Card key={r.id} title={<>{r.kind === 'release' ? 'Release checks (package & listings)' : 'Deliverable checks'} <Pill value={r.status} /></>} actions={<span className="small muted">{fmtDate(r.started_at)} · {r.hard_failures} hard failure(s), {r.warnings} warning(s)</span>}><CheckList results={r.results} /></Card>)}</>;
}

function ListingsTab({ v }: { v: any }) {
  if (!v.listings.length) return <Empty title="No listings yet">Listings are drafted after packaging.</Empty>;
  return <>{v.listings.map((l: any) => (
    <Card key={l.id} title={<>{label(l.marketplace)} <Pill value={l.status} /></>} actions={<Link to={`/listings?open=${l.id}`}>Edit listing</Link>}>
      <div className="kv"><span>Title</span><span>{l.title}</span><span>Price</span><span>{money(l.price_cents, l.currency)}</span><span>Tags</span><span>{l.tags.join(', ')}</span><span>Copy written by</span><span>{generatorLabel(l.provenance.generator, l.provenance.model)}</span></div>
      {l.validation.issues.length > 0 && <div className="err" style={{ marginTop: 10 }}>{l.validation.issues.map((i: any) => `${i.field}: ${i.message}`).join('; ')}</div>}
      {l.validation.notes.length > 0 && <p className="small muted">{l.validation.notes.join(' · ')}</p>}
    </Card>
  ))}</>;
}

function ProvenanceTab({ v }: { v: any }) {
  const prov = v.version.content_provenance;
  const total = v.generationRuns.reduce((a: number, r: any) => a + (r.cost_usd ?? 0), 0);
  return (
    <>
      <Card title="Content">
        {prov ? <div className="kv"><span>Generator</span><span>{prov.generator === 'deterministic' ? `Built-in library (${prov.library ?? 'deterministic'})` : generatorLabel(prov.generator, prov.model)}</span>{prov.note && <><span>Note</span><span>{prov.note}</span></>}{prov.copiedFromVersion && <><span>Copied from</span><span className="mono">{prov.copiedFromVersion}</span></>}{prov.promptHash && <><span>Prompt hash</span><span className="mono">{prov.promptHash.slice(0, 16)}…</span></>}</div> : <p className="muted">No content yet.</p>}
      </Card>
      <Card title="AI generation runs" actions={<span className="small muted">Estimated total {usd(total)} — from the price table in Settings, not an invoice</span>}>
        {v.generationRuns.length ? <table className="t"><thead><tr><th>When</th><th>Purpose</th><th>Model</th><th>Tokens in/out</th><th>Est. cost</th><th>Status</th></tr></thead><tbody>{v.generationRuns.map((r: any) => <tr key={r.id}><td className="small">{fmtDate(r.started_at)}</td><td>{r.purpose}</td><td>{r.provider} · {r.model}</td><td>{r.input_tokens ?? '—'} / {r.output_tokens ?? '—'}</td><td>{r.cost_basis === 'unknown' ? 'unknown' : usd(r.cost_usd)}</td><td><Pill value={r.status} />{r.error && <div className="small" style={{ color: 'var(--bad)' }}>{r.error}</div>}</td></tr>)}</tbody></table> : <p className="muted">No AI calls were made for this version.</p>}
      </Card>
      <Card title="File provenance"><table className="t"><tbody>{v.assets.map((a: any) => <tr key={a.id}><td>{a.name}</td><td className="small mono">{JSON.stringify(a.provenance)}</td></tr>)}</tbody></table></Card>
    </>
  );
}

function HistoryTab({ p }: { p: any }) {
  return (
    <div className="grid g2">
      <Card title="Versions"><table className="t"><tbody>{p.versions.map((v: any) => <tr key={v.id}><td>v{v.version_no}</td><td>{label(v.origin)}</td><td><Pill value={v.status} /></td><td className="small">{v.revision_notes || v.change_note}</td><td className="small muted">{ago(v.created_at)}</td></tr>)}</tbody></table></Card>
      <Card title="Related products">
        {p.related.relationships.map((r: any, i: number) => <div key={i} className="small">{label(r.kind)}: <Link to={`/products/${r.from_product_id === p.product.id ? r.to_product_id : r.from_product_id}`}>{r.from_product_id === p.product.id ? r.to_title : r.from_title}</Link></div>)}
        {p.related.mergeCandidates.length > 0 && <><h3 style={{ marginTop: 10 }}>Very similar (consider merging)</h3>{p.related.mergeCandidates.map((m: any) => <div key={m.id} className="small"><Link to={`/products/${m.id}`}>{m.title}</Link> — {Math.round(m.similarity * 100)}% similar text</div>)}</>}
        <h3 style={{ marginTop: 10 }}>Same category</h3>
        {p.related.sameCategory.length ? p.related.sameCategory.map((r: any) => <div key={r.id} className="small"><Link to={`/products/${r.id}`}>{r.title}</Link></div>) : <p className="small muted">None yet.</p>}
        <h3 style={{ marginTop: 10 }}>Review batches</h3>
        {p.batches.map((b: any) => <div key={b.id} className="small"><Link to={`/batches/${b.id}`}>{b.name}</Link> <Pill value={b.status} /></div>)}
      </Card>
    </div>
  );
}

function ContentEditor({ version, onClose, onDone }: { version: any; onClose: () => void; onDone: (id: string) => void }) {
  const [text, setText] = useState(JSON.stringify(version.content, null, 2));
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Edit content" wide onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={async () => {
      setErr(null);
      let content: unknown;
      try { content = JSON.parse(text); } catch { setErr('This is not valid JSON.'); return; }
      setBusy(true);
      try { const r = await api(`/versions/${version.id}/edit`, { body: { content, note: note || 'Content edited' } }); onDone(r.newVersionId); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
    }}>Save as new version</button></>}>
      <p className="small muted" style={{ marginTop: 0 }}>Saving creates a new version, re-renders it and runs QA again. Any approval of the current version is withdrawn.</p>
      <textarea rows={20} value={text} onChange={(e) => setText(e.target.value)} className="mono" spellCheck={false} />
      <label className="f" style={{ marginTop: 8 }}>Change note<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

function DesignEditor({ version, spec, onClose, onDone }: { version: any; spec: any; onClose: () => void; onDone: (id: string) => void }) {
  const designs = useApi<any[]>('/design-systems');
  const [ds, setDs] = useState(spec.design_system_id);
  const [paper, setPaper] = useState(spec.paper);
  const toast = useToast();
  return (
    <Modal title="Change design or paper" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><ActionButton className="primary" onClick={async () => { const r = await api(`/versions/${version.id}/edit`, { body: { designSystemId: ds !== spec.design_system_id ? ds : undefined, paper, note: 'Design/paper changed' } }); toast('New version in production'); onDone(r.newVersionId); }}>Re-render as new version</ActionButton></>}>
      <p className="small muted" style={{ marginTop: 0 }}>The content is kept; only the look or paper changes.</p>
      <div className="form">
        <label className="f">Design system<select value={ds} onChange={(e) => setDs(e.target.value)}>{designs.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label className="f">Paper<select value={paper.size} onChange={(e) => setPaper({ ...paper, size: e.target.value })}>{['letter', 'a4', 'a5', 'half-letter', 'legal'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
        <label className="f">Orientation<select value={paper.orientation} onChange={(e) => setPaper({ ...paper, orientation: e.target.value })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
        <label className="check"><input type="checkbox" checked={paper.grayscale} onChange={(e) => setPaper({ ...paper, grayscale: e.target.checked })} />Ink-saver grayscale</label>
      </div>
      {ds && <img src={`/api/design-systems/${ds}/preview.png`} alt="Design preview" style={{ width: 200, marginTop: 12, border: '1px solid var(--border)', borderRadius: 6 }} />}
    </Modal>
  );
}

function VariationEditor({ product, spec, onClose, onDone }: { product: any; spec: any; onClose: () => void; onDone: (id: string) => void }) {
  const designs = useApi<any[]>('/design-systems');
  const audiences = useApi<any[]>('/audiences');
  const themes = useApi<any[]>('/themes');
  const types = useApi<any[]>('/product-types');
  const [f, setF] = useState({ title: '', designSystemId: spec.design_system_id, audienceId: spec.audience_id ?? '', themeId: spec.theme_id ?? '', paper: spec.paper, params: {} as Record<string, any> });
  const type = types.data?.find((t) => t.id === product.product_type);
  return (
    <Modal title="Make a variation" wide onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><ActionButton className="primary" onClick={async () => {
      const r = await api(`/products/${product.id}/variations`, { body: { title: f.title || undefined, designSystemId: f.designSystemId, audienceId: f.audienceId || null, themeId: f.themeId || null, paper: f.paper, params: Object.keys(f.params).length ? f.params : undefined } });
      onDone(r.productId);
    }}>Create variation</ActionButton></>}>
      <p className="small muted" style={{ marginTop: 0 }}>A variation is a separate product linked to this one. It must differ in design, audience, theme, paper or settings — a new title alone is not a variation.</p>
      <div className="form">
        <label className="f">Title (optional)<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="f">Design system<select value={f.designSystemId} onChange={(e) => setF({ ...f, designSystemId: e.target.value })}>{designs.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label className="f">Audience<select value={f.audienceId} onChange={(e) => setF({ ...f, audienceId: e.target.value })}><option value="">General</option>{audiences.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="f">Theme<select value={f.themeId} onChange={(e) => setF({ ...f, themeId: e.target.value })}><option value="">None</option>{themes.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="f">Paper<select value={f.paper.size} onChange={(e) => setF({ ...f, paper: { ...f.paper, size: e.target.value } })}>{['letter', 'a4', 'a5', 'half-letter', 'legal'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
        <label className="f">Orientation<select value={f.paper.orientation} onChange={(e) => setF({ ...f, paper: { ...f.paper, orientation: e.target.value } })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
      </div>
      {type && <><h3 style={{ marginTop: 14 }}>Settings (changed values only)</h3><ParamsEditor defaults={spec.params} fields={type.paramFields} value={f.params} onChange={(params) => setF({ ...f, params })} /></>}
    </Modal>
  );
}

