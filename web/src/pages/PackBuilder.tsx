import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ApiError, api, errorText, useApi } from '../api.ts';
import { clearDraft, fixHint, fixPath, resumeDraftFor, saveDraft, type BundleProblem } from '../packDraft.tsx';
import { ActionButton, Async, Empty, Modal } from '../ui.tsx';
import { CompactList, CompactRow, PreviewButton, PreviewPane, usePreview } from '../compact.tsx';
import { label } from '../format.ts';

/**
 * Pick finished products from a visual grid and turn them into one bundle (a "pack"): name it,
 * give it a theme, optionally let AI suggest titles and a description from what you picked.
 */
export function PackBuilder({ initial = [], onClose, onDone }: { initial?: string[]; onClose: () => void; onDone: (productId: string) => void }) {
  // Every product, not only the newest 200: the rows are text, pictures load only on Preview.
  const list = useApi<any>('/products?limit=5000');
  const preview = usePreview();
  const nav = useNavigate();
  const loc = useLocation();
  // Back from fixing a blocked product: everything typed before is still here.
  const [back] = useState(() => resumeDraftFor(loc.pathname));
  const [picked, setPicked] = useState<string[]>(back?.picked ?? initial);
  const [filter, setFilter] = useState('');
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState(back?.title ?? '');
  const [theme, setTheme] = useState(back?.theme ?? '');
  const [pitch, setPitch] = useState(back?.pitch ?? '');
  const [titles, setTitles] = useState<string[]>(back?.titles ?? []);
  const [markets, setMarkets] = useState<string[]>(back?.markets ?? ['etsy', 'gumroad']);
  const [err, setErr] = useState<string | null>(null);
  // What still blocks the pack, one entry per product, each a link to where it is fixed.
  const [problems, setProblems] = useState<BundleProblem[]>([]);
  const [fixedNote, setFixedNote] = useState<string | null>(null);

  const close = () => { clearDraft(); onClose(); };
  /** Asks the server what blocks the picked products, without making the pack. */
  const check = async (ids: string[]) => {
    const r = await api<{ problems: BundleProblem[] }>('/bundles/check', { body: { productIds: ids } });
    setProblems(r.problems);
    return r.problems;
  };
  useEffect(() => {
    if (!back) return;
    // Land on the pack window again and show what is still wrong, or that it is all clear now.
    const name = back.fixing?.title;
    clearDraft();
    check(back.picked).then((left) => {
      if (!left.length) setFixedNote(name ? `"${name}" is fixed. Everything you picked is ready, so you can create the pack.` : 'Everything you picked is ready, so you can create the pack.');
    }).catch((e) => setErr(errorText(e)));
  }, []);
  /** Keeps the whole window, then opens the blocked product where it can be fixed. The app brings the owner back when it is. */
  const goFix = (p: BundleProblem) => {
    saveDraft({ picked, title, theme, pitch, titles, markets, returnTo: loc.pathname + loc.search, fixing: { productId: p.productId, title: p.title }, resume: false });
    // Shut the window without dropping the kept pack, so it can't sit over the page where the fix happens.
    onClose();
    nav(fixPath(p));
  };
  const dropFromPack = (id: string) => { setPicked((cur) => cur.filter((x) => x !== id)); setProblems((cur) => cur.filter((p) => p.productId !== id)); };

  const eligible = useMemo(() => (list.data?.items ?? []).filter((p: any) => p.product_type !== 'bundle' && p.version_status === 'approved' && ['passed', 'passed_with_warnings'].includes(p.qa_status)), [list.data]);
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
    setFixedNote(null);
    try {
      const r = await api('/bundles', { body: { productIds: picked, title: title || undefined, pitch: pitch || undefined, marketplaces: markets } });
      clearDraft();
      onDone(r.productId);
    } catch (e) {
      const list = e instanceof ApiError ? (e.details as { problems?: BundleProblem[] } | null)?.problems : undefined;
      if (list?.length) setProblems(list);
      else setErr(errorText(e));
    }
  };

  return (
    <Modal title="Build a pack" wide onClose={close} footer={<><span className="small muted" style={{ marginRight: 'auto' }}>{picked.length} picked{picked.length < 2 ? ' — pick at least 2' : ''}</span><button onClick={close}>Cancel</button><ActionButton className="primary" disabled={picked.length < 2} onClick={create}>Create pack ({picked.length})</ActionButton></>}>
      <div className="stack">
        <h3>1. Pick what goes in</h3>
        <p className="small muted" style={{ margin: 0 }}>Only products you approved in batch review are shown (any QA warnings must be accepted first). The pack becomes its own product with its own review and listings; the originals stay for sale on their own.</p>
        <div className="row">
          <input placeholder="Search titles…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="chips"><button className={`chip${!category ? ' on' : ''}`} onClick={() => setCategory('')}>All</button>{categories.map((c) => <button key={c} className={`chip${c === category ? ' on' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}</div>
        </div>
        <Async state={list}>{() => eligible.length < 2 ? <Empty title="Not enough approved products yet">At least two approved products are needed. Approve some in Batch review, or make more from Product library → New product.</Empty> : (
          <CompactList total={shown.length} shown={shown.length} noun="approved products" height={360} tools={picked.length ? <span className="small">{picked.length} picked</span> : undefined}>
            {shown.map((p: any) => (
              <CompactRow key={p.id} className={picked.includes(p.id) ? 'on' : ''}
                main={<label className="check"><input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} /> <b>{p.title}</b></label>}
                sub={<>{label(p.product_type)}{p.category ? ` · ${p.category}` : ''}</>}
                actions={<PreviewButton open={preview.open === p.id} disabled={!p.thumb} onClick={() => preview.toggle(p.id)} />}>
                {preview.open === p.id && <PreviewPane assets={[p.thumb]} alt={p.title} />}
              </CompactRow>
            ))}
          </CompactList>
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
        {fixedNote && !problems.length && <div className="banner info">{fixedNote}</div>}
        {problems.map((p) => (
          <div key={p.productId} className={`err${p.reason === 'other' ? '' : ' fixable'}`} {...(p.reason === 'other' ? {} : { role: 'button', tabIndex: 0, onClick: () => goFix(p), onKeyDown: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); goFix(p); } } })}>
            <div className="spread" style={{ alignItems: 'flex-start', gap: 12 }}>
              <span>{p.message}<span className="fix-hint small">{fixHint(p)}</span></span>
              <button className="small" onClick={(e) => { e.stopPropagation(); dropFromPack(p.productId); }}>Take it out of the pack</button>
            </div>
          </div>
        ))}
        {err && <div className="err">{err}</div>}
      </div>
    </Modal>
  );
}
