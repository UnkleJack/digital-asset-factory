import { useMemo, useState } from 'react';
import { api, errorText, useApi } from '../api.ts';
import { ActionButton, AssetImg, Async, Empty, Modal } from '../ui.tsx';
import { label } from '../format.ts';

/**
 * Pick finished products from a visual grid and turn them into one bundle (a "pack"): name it,
 * give it a theme, optionally let AI suggest titles and a description from what you picked.
 */
export function PackBuilder({ initial = [], onClose, onDone }: { initial?: string[]; onClose: () => void; onDone: (productId: string) => void }) {
  const list = useApi<any>('/products?limit=200');
  const [picked, setPicked] = useState<string[]>(initial);
  const [filter, setFilter] = useState('');
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [pitch, setPitch] = useState('');
  const [titles, setTitles] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>(['etsy', 'gumroad']);
  const [err, setErr] = useState<string | null>(null);

  const eligible = useMemo(() => (list.data?.items ?? []).filter((p: any) => p.product_type !== 'bundle' && ['ready', 'approved'].includes(p.version_status) && ['passed', 'passed_with_warnings'].includes(p.qa_status)), [list.data]);
  const categories = [...new Set(eligible.map((p: any) => p.category).filter(Boolean))] as string[];
  const shown = eligible.filter((p: any) => (!category || p.category === category) && (!filter || p.title.toLowerCase().includes(filter.toLowerCase())));
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 20 ? cur : [...cur, id]));

  const suggest = async () => {
    setErr(null);
    try {
      const r = await api('/bundles/suggest-copy', { body: { productIds: picked, theme: theme || undefined } });
      setTitles(r.titles);
      if (!title) setTitle(r.titles[0]);
      setPitch(r.pitch);
    } catch (e) {
      setErr(errorText(e));
    }
  };
  const create = async () => {
    setErr(null);
    try {
      const r = await api('/bundles', { body: { productIds: picked, title: title || undefined, pitch: pitch || undefined, marketplaces: markets } });
      onDone(r.productId);
    } catch (e) {
      setErr(errorText(e));
    }
  };

  return (
    <Modal title="Build a pack" wide onClose={onClose} footer={<><span className="small muted" style={{ marginRight: 'auto' }}>{picked.length} picked{picked.length < 2 ? ' — pick at least 2' : ''}</span><button onClick={onClose}>Cancel</button><ActionButton className="primary" disabled={picked.length < 2} onClick={create}>Create pack ({picked.length})</ActionButton></>}>
      <div className="stack">
        <h3>1. Pick what goes in</h3>
        <p className="small muted" style={{ margin: 0 }}>Only finished products that passed QA are shown. The pack becomes its own product with its own review and listings; the originals stay for sale on their own.</p>
        <div className="row">
          <input placeholder="Search titles…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="chips"><button className={`chip${!category ? ' on' : ''}`} onClick={() => setCategory('')}>All</button>{categories.map((c) => <button key={c} className={`chip${c === category ? ' on' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}</div>
        </div>
        <Async state={list}>{() => eligible.length < 2 ? <Empty title="Not enough finished products yet">At least two products that passed QA are needed. Make some from Product library → New product.</Empty> : (
          <div className="pick-grid">{shown.map((p: any) => (
            <button key={p.id} className={`pick${picked.includes(p.id) ? ' on' : ''}`} onClick={() => toggle(p.id)} aria-pressed={picked.includes(p.id)}>
              <span className="tick">{picked.includes(p.id) ? '✓' : ''}</span>
              <span className="img"><AssetImg id={p.thumb} alt="" /></span>
              <span className="small"><b>{p.title}</b></span>
              <span className="small muted">{label(p.product_type)}</span>
            </button>
          ))}</div>
        )}</Async>

        <h3>2. Name it</h3>
        <div className="form">
          <label className="f">Theme or angle (optional)<input value={theme} placeholder="e.g. back-to-school, new homeowners, cozy autumn" onChange={(e) => setTheme(e.target.value)} /></label>
          <label className="f">Pack title<input value={title} placeholder="Left blank, one is generated" maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
        </div>
        <div className="row"><ActionButton disabled={picked.length < 2} onClick={suggest}>✦ Suggest titles &amp; description with AI</ActionButton><span className="small muted">Uses your AI provider; nothing is saved until you create the pack.</span></div>
        {titles.length > 0 && <div className="chips">{titles.map((t) => <button key={t} className={`chip${t === title ? ' on' : ''}`} onClick={() => setTitle(t)}>{t}</button>)}</div>}
        <label className="f">Description (optional — used in the listings)<textarea rows={3} value={pitch} maxLength={1200} onChange={(e) => setPitch(e.target.value)} placeholder="Who it is for and what the set does together" /></label>

        <h3>3. Prepare listings for</h3>
        <div className="row">{['etsy', 'gumroad', 'generic'].map((m) => <label key={m} className="check"><input type="checkbox" checked={markets.includes(m)} onChange={() => setMarkets(markets.includes(m) ? markets.filter((x) => x !== m) : [...markets, m])} />{label(m)}</label>)}</div>
        {err && <div className="err">{err}</div>}
      </div>
    </Modal>
  );
}
