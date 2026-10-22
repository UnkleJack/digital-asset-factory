import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, errorText, useApi } from '../api.ts';
import { Async, Card, Empty, Modal, PageHead, Pill, useToast } from '../ui.tsx';
import { ago, generatorLabel, label, money } from '../format.ts';

export function Listings() {
  const [sp, setSp] = useSearchParams();
  const [market, setMarket] = useState('');
  const [status, setStatus] = useState('');
  const [current, setCurrent] = useState(true);
  const qs = new URLSearchParams({ ...(market && { marketplace: market }), ...(status && { status }), ...(current && { current: '1' }) });
  const st = useApi<any[]>(`/listings?${qs}`, { poll: 10000 });
  const open = sp.get('open');
  return (
    <div className="page">
      <PageHead title="Marketplace listings" sub="Listing drafts per product version and marketplace, checked against each marketplace's rules." />
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={market} onChange={(e) => setMarket(e.target.value)} aria-label="Marketplace"><option value="">All marketplaces</option>{['etsy', 'gumroad', 'generic'].map((m) => <option key={m} value={m}>{label(m)}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Any status</option>{['ready', 'invalid', 'export_prepared', 'published_manual', 'published_verified', 'needs_reconciliation', 'retired'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        <label className="check"><input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} />Current versions only</label>
      </div>
      <Card>
        <Async state={st}>{(list) => list.length === 0 ? <Empty title="No listings">Listings are drafted automatically after a product is packaged.</Empty> : (
          <table className="t">
            <thead><tr><th>Listing</th><th>Marketplace</th><th>Price</th><th>Status</th><th>Approval</th><th>Updated</th></tr></thead>
            <tbody>{list.map((l) => (
              <tr key={l.id} className="click" onClick={() => setSp({ open: l.id })}>
                <td><b>{l.title}</b><div className="small muted"><Link to={`/products/${l.product_id}`} onClick={(e) => e.stopPropagation()}>{l.product_title}</Link> · v{l.version_no}{!l.is_current ? ' (old version)' : ''}</div></td>
                <td>{label(l.marketplace)}</td>
                <td>{money(l.price_cents, l.currency)}</td>
                <td><Pill value={l.status} />{l.validation.issues.length > 0 && <div className="small" style={{ color: 'var(--bad)' }}>{l.validation.issues.length} issue(s)</div>}</td>
                <td>{l.approved ? <Pill value="approved" /> : <span className="muted small">not approved</span>}</td>
                <td className="small">{ago(l.updated_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}</Async>
      </Card>
      {open && <ListingEditor id={open} onClose={() => { setSp({}); st.reload(); }} />}
    </div>
  );
}

function ListingEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const st = useApi<any>(`/listings/${id}`);
  const markets = useApi<any[]>('/marketplaces');
  const toast = useToast();
  const [draft, setDraft] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Edit listing" wide onClose={onClose}>
      <Async state={st}>{(d) => {
        const l = d.listing;
        const rules = markets.data?.find((m) => m.id === l.marketplace)?.rules;
        const f = draft ?? { title: l.title, description: l.description, tags: l.tags.join(', '), price: (l.price_cents / 100).toFixed(2) };
        const tags = f.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
        const save = async () => {
          setErr(null);
          try {
            await api(`/listings/${id}`, { method: 'PATCH', body: { title: f.title, description: f.description, tags, price_cents: Math.round(Number(f.price) * 100) } });
            toast('Listing saved');
            setDraft(null);
            st.reload();
          } catch (e) { setErr(errorText(e)); }
        };
        return (
          <div className="stack">
            <div className="row"><b>{label(l.marketplace)}</b><Pill value={l.status} />{d.approval ? <Pill value="approved" text="Approved — saving changes withdraws this approval" /> : <Pill value="pending" text="Not approved" />}</div>
            <label className="f">Title <span className={rules && f.title.length > rules.titleMax ? 'pill bad' : 'muted'}>{f.title.length}{rules ? ` / ${rules.titleMax}` : ''}</span><input value={f.title} onChange={(e) => setDraft({ ...f, title: e.target.value })} /></label>
            <label className="f">Price ({l.currency})<input type="number" step="0.01" min={0} value={f.price} onChange={(e) => setDraft({ ...f, price: e.target.value })} /></label>
            <label className="f">Tags (comma separated) <span className="muted">{tags.length}{rules ? ` / ${rules.tagsMax}, each ≤ ${rules.tagMaxLen} chars` : ''}</span><input value={f.tags} onChange={(e) => setDraft({ ...f, tags: e.target.value })} /></label>
            {rules && tags.some((t: string) => t.length > rules.tagMaxLen) && <div className="small" style={{ color: 'var(--bad)' }}>Too long: {tags.filter((t: string) => t.length > rules.tagMaxLen).join(', ')}</div>}
            <label className="f">Description <span className="muted">{f.description.length} chars</span><textarea rows={14} value={f.description} onChange={(e) => setDraft({ ...f, description: e.target.value })} /></label>
            {l.validation.issues.length > 0 && <div className="err">{l.validation.issues.map((i: any) => `${i.field}: ${i.message}`).join('; ')}</div>}
            {l.validation.notes.length > 0 && <p className="small muted">{l.validation.notes.join(' · ')}</p>}
            {rules?.unverifiedRules?.length > 0 && <p className="small muted">Some limits for {label(l.marketplace)} ({rules.unverifiedRules.join(', ')}) could not be confirmed from official sources; they are conservative defaults you can change in Settings → Marketplaces.</p>}
            <p className="small muted">Copy written by {generatorLabel(l.provenance.generator, l.provenance.model)}{l.provenance.editedAt ? `, last edited ${ago(l.provenance.editedAt)}` : ''}.</p>
            {err && <div className="err">{err}</div>}
            <div className="modal-foot"><button onClick={onClose}>Close</button><button className="primary" disabled={!draft} onClick={save}>Save changes</button></div>
          </div>
        );
      }}</Async>
    </Modal>
  );
}
