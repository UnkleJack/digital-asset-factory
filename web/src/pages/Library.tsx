import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, useApi, errorText } from '../api.ts';
import { AssetImg, Async, Empty, Modal, PageHead, Pill, useToast } from '../ui.tsx';
import { ago, label } from '../format.ts';
import { PackBuilder } from './PackBuilder.tsx';

export function Library() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const type = sp.get('type') ?? '';
  const versionStatus = sp.get('versionStatus') ?? '';
  const status = sp.get('status') ?? 'active';
  const qs = new URLSearchParams({ ...(type && { type }), ...(versionStatus && { versionStatus }), ...(status && { status }), ...(sp.get('q') && { q: sp.get('q')! }), limit: '120' });
  const state = useApi<any>(`/products?${qs}`, { poll: 8000 });
  const types = useApi<any[]>('/product-types');
  const [creating, setCreating] = useState(sp.get('new') === '1');
  const [packing, setPacking] = useState(sp.get('pack') === '1');
  const nav = useNavigate();
  const update = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); n.delete('new'); setSp(n); };
  return (
    <div className="page">
      <PageHead title="Product library" sub="Every product, its current version and where it is in production." actions={<><button onClick={() => setPacking(true)}>Build a pack</button><button className="primary" onClick={() => setCreating(true)}>New product</button></>} />
      <div className="row" style={{ marginBottom: 14 }}>
        <form onSubmit={(e) => { e.preventDefault(); update('q', q); }} className="row"><input placeholder="Search titles…" value={q} onChange={(e) => setQ(e.target.value)} /><button>Search</button></form>
        <select value={type} onChange={(e) => update('type', e.target.value)} aria-label="Product type"><option value="">All types</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select value={versionStatus} onChange={(e) => update('versionStatus', e.target.value)} aria-label="Version status"><option value="">Any production status</option>{['in_progress', 'ready', 'approved', 'qa_failed', 'failed', 'rejected'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        <select value={status} onChange={(e) => update('status', e.target.value)} aria-label="Product status"><option value="active">Active</option><option value="archived">Archived</option><option value="retired">Retired</option><option value="">All</option></select>
      </div>
      <Async state={state}>{(d) => d.items.length === 0 ? (
        <Empty title="No products here yet" action={<button className="primary" onClick={() => setCreating(true)}>Create a product</button>}>Create one directly, produce one from an opportunity in Research, or let a production plan make them.</Empty>
      ) : (
        <>
          <p className="muted small">{d.total} product(s)</p>
          <div className="product-cards">
            {d.items.map((p: any) => (
              <Link key={p.id} to={`/products/${p.id}`} className="pcard">
                <div className="img">{p.thumb ? <AssetImg id={p.thumb} alt={`${p.title} preview`} /> : <span className="muted small">{p.version_status === 'in_progress' ? 'Rendering…' : 'No preview'}</span>}</div>
                <div className="body">
                  <div className="title">{p.title}</div>
                  <div className="small muted">{types.data?.find((t) => t.id === p.product_type)?.name ?? p.product_type} · v{p.version_no}</div>
                  <div className="row"><Pill value={p.version_status} />{p.qa_status !== 'pending' && <Pill value={p.qa_status} text={`QA ${label(p.qa_status)}`} />}{p.published > 0 && <Pill value="published_manual" text="Published" />}</div>
                  <div className="small muted">Updated {ago(p.updated_at)}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}</Async>
      {packing && <PackBuilder onClose={() => setPacking(false)} onDone={(id) => { setPacking(false); nav(`/products/${id}`); }} />}
      {creating && <NewProductModal onClose={() => { setCreating(false); update('new', ''); }} />}
    </div>
  );
}

type ParamField = { options?: Array<string | number>; min?: number; max?: number };

export function ParamsEditor({ value, onChange, defaults, fields = {} }: { value: Record<string, any>; onChange: (v: Record<string, any>) => void; defaults: Record<string, any>; fields?: Record<string, ParamField> }) {
  const keys = Object.keys(defaults).filter((k) => k !== 'members');
  if (!keys.length) return <p className="muted small">This product type has no settings.</p>;
  return (
    <div className="form">
      {keys.map((k) => {
        const d = defaults[k];
        const v = value[k] ?? d;
        const name = label(k.replace(/([A-Z])/g, ' $1').toLowerCase());
        const fd = fields[k] ?? {};
        if (fd.options) return <label key={k} className="f">{name}<select value={String(v)} onChange={(e) => { const o = fd.options!.find((x) => String(x) === e.target.value); onChange({ ...value, [k]: o }); }}>{fd.options.map((o) => <option key={String(o)} value={String(o)}>{typeof o === 'string' ? label(o) : k === 'weekStart' ? (o === 0 ? 'Sunday' : 'Monday') : o}</option>)}</select></label>;
        if (typeof d === 'boolean') return <label key={k} className="check"><input type="checkbox" checked={!!v} onChange={(e) => onChange({ ...value, [k]: e.target.checked })} />{name}</label>;
        if (typeof d === 'number') return <label key={k} className="f">{name}<input type="number" min={fd.min} max={fd.max} value={v} onChange={(e) => onChange({ ...value, [k]: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>;
        if (typeof d === 'string') return <label key={k} className="f">{name}<input value={v} onChange={(e) => onChange({ ...value, [k]: e.target.value })} /></label>;
        return <label key={k} className="f">{name} (JSON)<input value={JSON.stringify(v)} onChange={(e) => { try { onChange({ ...value, [k]: JSON.parse(e.target.value) }); } catch { /* keep typing */ } }} /></label>;
      })}
    </div>
  );
}

type Fonts = { heading: string; body: string; accent: string };
type VariationValue = { key: string; text: string; body: Record<string, unknown> };

/** Loads every bundled font under a preview name so font choices can be shown in their own face. */
export function FontFaces({ fonts }: { fonts: { id: string }[] }) {
  return <style>{fonts.map((f) => `@font-face{font-family:'daf-${f.id}';src:url(/api/fonts/${f.id}/sample.woff2) format('woff2');font-display:swap}`).join('\n')}</style>;
}

export function fontPreview(id: string, fallback = 'sans-serif') {
  return { fontFamily: `'daf-${id}', ${fallback}` };
}

const ARTWORK_NOTE: Record<string, string> = { none: 'Layout only, no artwork', procedural: 'Pattern artwork made by the app, no AI needed', 'ai-image': 'AI-drawn pictures, needs an image key' };

function NewProductModal({ onClose }: { onClose: () => void }) {
  const types = useApi<any[]>('/product-types');
  const designs = useApi<any[]>('/design-systems');
  const audiences = useApi<any[]>('/audiences');
  const themes = useApi<any[]>('/themes');
  const fontsApi = useApi<any>('/fonts');
  const secrets = useApi<any>('/secrets');
  const nav = useNavigate();
  const toast = useToast();
  const [category, setCategory] = useState('');
  const [typeId, setTypeId] = useState('');
  const [params, setParams] = useState<Record<string, any>>({});
  const [f, setF] = useState({ title: '', designSystemId: '', audienceId: '', themeId: '', size: 'letter', orientation: 'portrait', grayscale: false, marketplaces: ['etsy'] as string[] });
  const [pairing, setPairing] = useState('');
  const [custom, setCustom] = useState<Fonts>({ heading: 'playfair-display', body: 'lora', accent: 'playfair-display' });
  const [axis, setAxis] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const type = types.data?.find((t) => t.id === typeId);
  useEffect(() => { setParams({}); setAxis(''); setPicked([]); }, [typeId]);
  useEffect(() => setPicked([]), [axis]);

  const fontList: any[] = fontsApi.data?.fonts ?? [];
  const pairings: any[] = fontsApi.data?.pairings ?? [];
  const fonts: Fonts | null = pairing === 'custom' ? custom : pairings.find((p) => p.id === pairing)?.fonts ?? null;
  const baseDesign = designs.data?.find((d) => d.id === f.designSystemId);
  const shownFonts: Fonts | null = fonts ?? baseDesign?.tokens.fonts ?? null;
  const imageKeyMissing = secrets.data && !secrets.data.secrets.find((s: any) => s.name === 'openai_api_key')?.configured;

  const categories = [...new Set((types.data ?? []).filter((t) => t.id !== 'bundle').map((t) => t.category as string))];
  const kinds = (types.data ?? []).filter((t) => t.id !== 'bundle' && t.category === category);

  // Values a bulk variation can take along each axis this product type supports.
  const axisValues = (a: string): VariationValue[] => {
    if (a === 'design') return (designs.data ?? []).filter((d) => d.id !== f.designSystemId).map((d) => ({ key: d.id, text: d.name, body: { designSystemId: d.id, ...(fonts && { fonts }) } }));
    if (a === 'fonts') return pairings.filter((p) => p.id !== pairing).map((p) => ({ key: p.id, text: p.name, body: { fonts: p.fonts } }));
    if (a === 'audience') return (audiences.data ?? []).filter((x) => x.id !== f.audienceId).map((x) => ({ key: x.id, text: x.name, body: { audienceId: x.id } }));
    if (a === 'theme') return (themes.data ?? []).filter((x) => x.id !== f.themeId).map((x) => ({ key: x.id, text: x.name, body: { themeId: x.id } }));
    if (a === 'paper') return ['letter', 'a4', 'a5', 'half-letter', 'legal'].filter((s) => s !== f.size).map((s) => ({ key: s, text: label(s), body: { paper: { size: s } } }));
    if (a === 'seed') return [2, 3, 4, 5, 6].map((n) => ({ key: String(n), text: `${n} more, each with new random artwork`, body: { newSeed: true, count: n } }));
    const opts = type?.paramFields?.[a]?.options as Array<string | number> | undefined;
    const current = params[a] ?? type?.defaultParams?.[a];
    return (opts ?? []).filter((o) => o !== current).map((o) => ({ key: String(o), text: typeof o === 'string' ? label(o) : a === 'weekStart' ? (o === 0 ? 'Sunday start' : 'Monday start') : String(o), body: { params: { [a]: o } } }));
  };
  const axes: string[] = type ? [...(type.variationAxes as string[]).includes('design') ? ['fonts'] : [], ...(type.variationAxes as string[])].filter((a) => axisValues(a).length > 0) : [];
  const AXIS_NAMES: Record<string, string> = { design: 'Design system', fonts: 'Font pairing', seed: 'New random artwork', paper: 'Paper size' };
  const chosen = axis ? axisValues(axis).filter((v) => picked.includes(v.key)) : [];
  const extraCount = axis === 'seed' ? Number(chosen[0]?.body.count ?? 0) : chosen.length;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api('/products', { body: { productType: typeId, title: f.title || undefined, params, designSystemId: f.designSystemId || undefined, audienceId: f.audienceId || null, themeId: f.themeId || null, paper: { size: f.size, orientation: f.orientation, grayscale: f.grayscale }, marketplaces: f.marketplaces, ...(fonts && { fonts }) } });
      const bodies = axis === 'seed' ? Array.from({ length: extraCount }, () => ({ newSeed: true })) : chosen.map((v) => v.body);
      let made = 0;
      const failures: string[] = [];
      for (const body of bodies) {
        try { await api(`/products/${r.productId}/variations`, { body: { ...body, marketplaces: f.marketplaces } }); made++; } catch (e) { failures.push(errorText(e)); }
      }
      toast(made ? `Production started for ${made + 1} products` : 'Production started');
      if (failures.length) toast(`${failures.length} variation(s) could not be made: ${failures[0]}`);
      nav(`/products/${r.productId}`);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New product" onClose={onClose} wide footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!typeId || busy} onClick={submit}>{busy && <span className="spinner" />}{extraCount ? `Create ${extraCount + 1} products` : 'Create and start production'}</button></>}>
      <FontFaces fonts={fontList} />
      <Async state={types}>{() => (
        <div className="stack">
          <h3>1. What are you making?</h3>
          <div className="chips">{categories.map((c) => <button key={c} className={`chip${c === category ? ' on' : ''}`} onClick={() => { setCategory(c); setTypeId(''); }}>{c}</button>)}</div>
          {category && <>
            <h3>2. Which kind?</h3>
            <div className="choices">{kinds.map((t) => (
              <button key={t.id} className={`choice${t.id === typeId ? ' on' : ''}`} onClick={() => setTypeId(t.id)}>
                <b>{t.name}</b>
                <span className="small muted">{t.description}</span>
                <span className="row" style={{ gap: 4 }}>
                  <Pill value={t.artwork === 'ai-image' ? 'pending' : 'ready'} text={ARTWORK_NOTE[t.artwork] ?? t.artwork} />
                  {t.aiContent && <Pill value="closed" text="AI writes text if a key is set" />}
                </span>
              </button>
            ))}</div>
          </>}
          {type && (
            <>
              {type.artwork === 'ai-image' && imageKeyMissing && <div className="banner warn">This kind needs an OpenAI image key (Settings → AI providers), and none is set, so production will fail. {kinds.some((k) => k.artwork === 'procedural') && 'The pattern option above works without any key.'}</div>}
              <h3>3. Look and feel</h3>
              <div className="form">
                <label className="f">Title (optional)<input value={f.title} placeholder="Generated from the settings if left blank" onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
                <label className="f">Design system<select value={f.designSystemId} onChange={(e) => setF({ ...f, designSystemId: e.target.value })}><option value="">Template default</option>{designs.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><span className="field-help"><Link to="/templates?tab=designs">Make your own design system</Link></span></label>
                <label className="f">Fonts<select value={pairing} onChange={(e) => setPairing(e.target.value)}><option value="">Design system default</option>{pairings.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.mood}</option>)}<option value="custom">Pick fonts myself…</option></select></label>
                {pairing === 'custom' && (['heading', 'body', 'accent'] as const).map((k) => <label key={k} className="f">{label(k)} font<select value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })}>{fontList.map((x) => <option key={x.id} value={x.id}>{x.family}</option>)}</select></label>)}
                <label className="f">Audience<select value={f.audienceId} onChange={(e) => setF({ ...f, audienceId: e.target.value })}><option value="">General</option>{audiences.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                <label className="f">Theme<select value={f.themeId} onChange={(e) => setF({ ...f, themeId: e.target.value })}><option value="">None</option>{themes.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label className="f">Paper size<select value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })}>{['letter', 'a4', 'a5', 'half-letter', 'legal'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
                <label className="f">Orientation<select value={f.orientation} onChange={(e) => setF({ ...f, orientation: e.target.value })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
                <label className="check"><input type="checkbox" checked={f.grayscale} onChange={(e) => setF({ ...f, grayscale: e.target.checked })} />Ink-saver grayscale</label>
              </div>
              {shownFonts && <div className="font-sample">
                <div style={{ ...fontPreview(shownFonts.heading, 'serif'), fontSize: 26 }}>{f.title || type.name}</div>
                <div style={{ ...fontPreview(shownFonts.body), fontSize: 14 }}>Body text looks like this. Plan your week, track habits, and stay on budget.</div>
                <div style={{ ...fontPreview(shownFonts.accent, 'cursive'), fontSize: 16 }}>Accent: notes & labels</div>
                {!fonts && <div className="small muted">These are the fonts of {baseDesign?.name ?? 'the template default design system'}.</div>}
              </div>}
              <h3>4. Settings for {type.name}</h3>
              <ParamsEditor defaults={type.defaultParams} fields={type.paramFields} value={params} onChange={setParams} />
              {axes.length > 0 && <>
                <h3>5. Also make variations (optional)</h3>
                <p className="small muted" style={{ margin: 0 }}>Each variation is its own product, made from the same settings with one thing changed. They all go to batch review like any other product.</p>
                <div className="form">
                  <label className="f">Vary by<select value={axis} onChange={(e) => setAxis(e.target.value)}><option value="">No variations</option>{axes.map((a) => <option key={a} value={a}>{AXIS_NAMES[a] ?? label(a.replace(/([A-Z])/g, ' $1').toLowerCase())}</option>)}</select></label>
                </div>
                {axis === 'seed' ? (
                  <div className="row">{axisValues('seed').map((v) => <label key={v.key} className="check"><input type="radio" name="seedcount" checked={picked[0] === v.key} onChange={() => setPicked([v.key])} />{v.text}</label>)}</div>
                ) : axis && (
                  <div className="row" style={{ flexWrap: 'wrap' }}>{axisValues(axis).map((v) => <label key={v.key} className="check" style={axis === 'fonts' ? fontPreview(pairings.find((p) => p.id === v.key)?.fonts.heading ?? '') : undefined}><input type="checkbox" checked={picked.includes(v.key)} disabled={!picked.includes(v.key) && picked.length >= 12} onChange={() => setPicked(picked.includes(v.key) ? picked.filter((x) => x !== v.key) : [...picked, v.key])} />{v.text}</label>)}</div>
                )}
              </>}
              <h3>Prepare listings for</h3>
              <div className="row">{['etsy', 'gumroad', 'generic'].map((m) => <label key={m} className="check"><input type="checkbox" checked={f.marketplaces.includes(m)} onChange={() => setF({ ...f, marketplaces: f.marketplaces.includes(m) ? f.marketplaces.filter((x) => x !== m) : [...f.marketplaces, m] })} />{label(m)}</label>)}</div>
            </>
          )}
          {err && <div className="err">{err}</div>}
        </div>
      )}</Async>
    </Modal>
  );
}
