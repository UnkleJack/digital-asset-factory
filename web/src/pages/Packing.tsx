import { useState } from 'react';
import { Link } from 'react-router';
import { api, errorText, useApi } from '../api.ts';
import { ActionButton, AssetImg, Async, Card, Empty, Modal, PageHead, Pill, useToast } from '../ui.tsx';
import { ago, label } from '../format.ts';

const KINDS = ['theme', 'category', 'audience', 'season', 'style', 'type', 'custom'];

/**
 * The factory floor: finished products are sorted onto up to six carts, each building one pack.
 * Anything that fits no open cart waits in the backlog until the factory takes a break.
 */
export function Packing() {
  const st = useApi<any>('/packing', { poll: 6000 });
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const run = (path: string, ok: (r: any) => string) => async () => { const r = await api(path, { body: {} }); toast(ok(r)); st.reload(); };
  return (
    <div className="page">
      <PageHead
        title="Factory floor"
        sub="Finished products roll off the line and are sorted onto carts by their tags. A full cart becomes a pack and goes to review. What fits no cart waits in the backlog and is re-sorted at the next break, when nothing is being made."
        actions={<>
          <ActionButton onClick={run('/packing/remix', (r) => `Remix cart opened around "${r.tag.tag}" with ${r.added} item(s)`)} title="Open a cart around a tag your best sellers share but haven't been packed under">↻ Remix winners</ActionButton>
          <ActionButton onClick={run('/packing/break', (r) => `Break done: ${r.placed} re-sorted, ${r.sealed.length} packed, ${r.stillWaiting} still waiting`)} title="Re-sort the backlog now, even if products are still being made">☕ Take a break now</ActionButton>
          <button className="primary" onClick={() => setOpening(true)}>New cart</button>
        </>}
      />
      <Async state={st}>{(d) => (
        <>
          <div className="floor-status">
            <span><b>{d.conveyor}</b> on the conveyor</span>
            <span><b>{d.open.length}</b> of {d.slots} carts in use</span>
            <span><b>{d.backlog.length}</b> waiting in the backlog</span>
            <span className="muted small">Packs of {d.settings.targetSize} · at least {d.settings.minSize} · {d.settings.autoBuild ? 'full carts pack themselves' : 'you pack full carts'} · <Link to="/settings?tab=packing">change</Link></span>
          </div>
          <div className="carts">
            {Array.from({ length: d.slots }, (_, i) => d.open.find((c: any) => c.slot === i + 1)).map((c: any, i: number) => c ? <CartCard key={c.id} cart={c} onChange={st.reload} /> : (
              <div key={`empty${i}`} className="cart empty"><div className="slot-no">Cart {i + 1}</div><p className="muted small">Empty. The next product that fits no other cart starts one here.</p></div>
            ))}
          </div>
          <div className="grid g2" style={{ marginTop: 14 }}>
            <Card title={`Backlog (${d.backlog.length})`}>
              {d.backlog.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Nothing waiting.</p> : (
                <div className="stack">{d.backlog.map((b: any) => (
                  <div key={b.id} className="spread small backlog-row">
                    <span className="row"><span className="mini-thumb"><AssetImg id={b.thumb} alt="" /></span><span><Link to={`/products/${b.id}`}><b>{b.title}</b></Link><br /><span className="muted">{b.reason} · tried {b.passes}× · since {ago(b.created_at)}</span></span></span>
                    <AddToCart productId={b.id} carts={d.open} onDone={st.reload} />
                  </div>
                ))}</div>
              )}
            </Card>
            <Card title="Recently packed">
              {d.closed.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No packs built from carts yet.</p> : (
                <div className="stack">{d.closed.map((c: any) => (
                  <div key={c.id} className="spread small">
                    <span><b>{c.name}</b> <span className="muted">{c.items} items · {ago(c.closed_at)}</span></span>
                    {c.status === 'built' && c.bundle_product_id ? <Link to={`/products/${c.bundle_product_id}`}><Pill value={c.bundle_status ?? 'in_progress'} /></Link> : <Pill value="closed" text="emptied" />}
                  </div>
                ))}</div>
              )}
            </Card>
          </div>
        </>
      )}</Async>
      {opening && <NewCartModal onClose={() => setOpening(false)} onDone={() => { setOpening(false); st.reload(); }} />}
    </div>
  );
}

function CartCard({ cart, onChange }: { cart: any; onChange: () => void }) {
  const toast = useToast();
  const full = cart.items.length >= cart.target_size;
  const pct = Math.min(100, Math.round((cart.items.length / cart.target_size) * 100));
  return (
    <div className={`cart${full ? ' full' : ''}`}>
      <div className="spread"><span className="slot-no">Cart {cart.slot}</span><span className="small muted">{label(cart.origin)}</span></div>
      <div className="cart-name">{cart.name}</div>
      <div className="chips">{cart.tags.length ? cart.tags.map((t: any) => <span key={`${t.kind}${t.tag}`} className="chip on small" title={t.kind}>{t.tag}</span>) : <span className="small muted">takes anything</span>}</div>
      <div className="fill" aria-label={`${cart.items.length} of ${cart.target_size}`}><div style={{ width: `${pct}%` }} /></div>
      <div className="small muted">{cart.items.length} / {cart.target_size} {cart.items.length < cart.min_size ? `(needs ${cart.min_size} to pack)` : ''}</div>
      <div className="cart-items">{cart.items.map((p: any) => (
        <div key={p.id} className="cart-item" title={`${p.title} — match ${Math.round(p.score * 100)}%`}>
          <span className="mini-thumb"><AssetImg id={p.thumb} alt="" /></span>
          <Link to={`/products/${p.id}`} className="small">{p.title}</Link>
          <button className="small ghost" aria-label={`Take ${p.title} out`} onClick={async () => { await api(`/packing/carts/${cart.id}/items/${p.id}`, { method: 'DELETE' }); onChange(); }}>×</button>
        </div>
      ))}</div>
      <div className="row" style={{ marginTop: 'auto' }}>
        <ActionButton className="primary small" disabled={cart.items.length < Math.max(2, cart.min_size)} onClick={async () => { const r = await api(`/packing/carts/${cart.id}/seal`, { body: {} }); toast('Pack created — it is being made now'); onChange(); return r; }}>Pack it</ActionButton>
        <ActionButton className="small" onClick={async () => { const r = await api(`/packing/carts/${cart.id}/fill`, { body: {} }); toast(`${r.added} matching product(s) added from the library`); onChange(); }} title="Pull matching finished products from the whole library">Fill from library</ActionButton>
        <ActionButton className="small danger" confirm="Empty this cart? Its products go back to the backlog." onClick={async () => { await api(`/packing/carts/${cart.id}/dissolve`, { body: {} }); onChange(); }}>Empty</ActionButton>
      </div>
    </div>
  );
}

function AddToCart({ productId, carts, onDone }: { productId: string; carts: any[]; onDone: () => void }) {
  const toast = useToast();
  if (!carts.length) return null;
  return (
    <select aria-label="Put into a cart" value="" onChange={async (e) => { try { await api(`/packing/carts/${e.target.value}/items`, { body: { productId } }); onDone(); } catch (err) { toast(errorText(err)); } }}>
      <option value="">Put in cart…</option>
      {carts.map((c) => <option key={c.id} value={c.id}>{c.slot}. {c.name}</option>)}
    </select>
  );
}

function NewCartModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const tags = useApi<any[]>('/tags');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<{ kind: string; tag: string }[]>([]);
  const [custom, setCustom] = useState('');
  const [kind, setKind] = useState('custom');
  const [err, setErr] = useState<string | null>(null);
  const has = (t: { kind: string; tag: string }) => picked.some((p) => p.kind === t.kind && p.tag === t.tag);
  const toggle = (t: { kind: string; tag: string }) => setPicked((cur) => (has(t) ? cur.filter((p) => !(p.kind === t.kind && p.tag === t.tag)) : [...cur, t].slice(0, 6)));
  return (
    <Modal title="New cart" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><ActionButton className="primary" onClick={async () => { try { await api('/packing/carts', { body: { name: name || undefined, tags: picked } }); onDone(); } catch (e) { setErr(errorText(e)); } }}>Open cart</ActionButton></>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>A cart collects products that share its tags. Leave tags empty for a cart that takes anything you add by hand.</p>
        <label className="f">Name (optional)<input value={name} maxLength={120} placeholder="Made from the tags if left blank" onChange={(e) => setName(e.target.value)} /></label>
        <Async state={tags}>{(list) => list.length === 0 ? <Empty title="No tags yet">Tags appear as products are made.</Empty> : (
          <div className="chips">{list.slice(0, 60).map((t: any) => <button key={`${t.kind}${t.tag}`} className={`chip${has(t) ? ' on' : ''}`} title={`${t.kind} · ${t.products} product(s)`} onClick={() => toggle(t)}>{t.tag} <span className="muted">{t.products}</span></button>)}</div>
        )}</Async>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tag kind">{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
          <input placeholder="Or type a tag" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button disabled={custom.trim().length < 2} onClick={() => { toggle({ kind, tag: custom.trim().toLowerCase() }); setCustom(''); }}>Add</button>
        </div>
        {err && <div className="err">{err}</div>}
      </div>
    </Modal>
  );
}

/** Tag editor for one product (used on the product page). Derived tags are fixed; yours and AI's can change. */
export function ProductTags({ productId }: { productId: string }) {
  const st = useApi<any[]>(`/products/${productId}/tags`);
  const toast = useToast();
  const [tag, setTag] = useState('');
  const [kind, setKind] = useState('custom');
  const [suggested, setSuggested] = useState<{ kind: string; tag: string }[]>([]);
  const save = async (extra: { kind: string; tag: string }[]) => { await api(`/products/${productId}/tags`, { method: 'PUT', body: { tags: extra } }); st.reload(); };
  return (
    <Card title="Tags" actions={<ActionButton className="small" onClick={async () => { const r = await api(`/products/${productId}/tags/suggest`, { body: {} }); setSuggested(r.tags); if (!r.tags.length) toast('No new tags suggested'); }}>✦ Suggest with AI</ActionButton>}>
      <Async state={st}>{(tags) => {
        const extra = tags.filter((t) => t.source !== 'derived').map((t) => ({ kind: t.kind, tag: t.tag }));
        return (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>Tags decide which packs this product can go into. More tags, more packs it fits.</p>
            <div className="chips">{tags.map((t) => (
              <span key={`${t.kind}${t.tag}`} className={`chip${t.source === 'derived' ? '' : ' on'}`} title={`${t.kind}${t.source === 'derived' ? ' · from the product' : ''}`}>
                {t.tag}{t.source !== 'derived' && <button className="chip-x" aria-label={`Remove ${t.tag}`} onClick={() => save(extra.filter((x) => !(x.kind === t.kind && x.tag === t.tag)))}>×</button>}
              </span>
            ))}</div>
            <div className="row">
              <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tag kind">{KINDS.filter((k) => k !== 'type' && k !== 'category').map((k) => <option key={k} value={k}>{k}</option>)}</select>
              <input placeholder="e.g. teachers, halloween, cottagecore" value={tag} onChange={(e) => setTag(e.target.value)} />
              <button disabled={tag.trim().length < 2} onClick={async () => { await save([...extra, { kind, tag: tag.trim() }]); setTag(''); }}>Add tag</button>
            </div>
            {suggested.length > 0 && (
              <div><div className="small muted">Suggested — click to add</div><div className="chips">{suggested.map((s) => <button key={s.tag} className="chip" onClick={async () => { await save([...extra, s]); setSuggested((cur) => cur.filter((x) => x.tag !== s.tag)); }}>+ {s.tag} <span className="muted">{s.kind}</span></button>)}</div></div>
            )}
          </div>
        );
      }}</Async>
    </Card>
  );
}
