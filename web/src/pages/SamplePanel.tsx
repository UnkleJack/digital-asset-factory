import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorText, useApi } from '../api.ts';

// "Try it first" on the New product form: shows what the settings will draw before anything is made.
// Mandalas, patterns and mazes are drawn from the seed, and the product made with that same seed gets exactly
// these designs. Other kinds show a layout sample (first two pages) when asked. Nothing is stored.

interface Sample {
  seed: number;
  artIsExact: boolean;
  art: { name: string; svg: string }[];
  pages: string[];
  totalArt: number;
}

interface Reading {
  referenceId: string;
  symmetry: number | null;
  symmetryStrength: number;
  detail: string | null;
  crossings: number;
  inkShare: number;
  lineArt: boolean;
  notes: string[];
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export function SamplePanel({ type, form, seed, setSeed, params, setParams }: {
  type: { id: string; name: string; artwork: string };
  form: { title: string; designSystemId: string; audienceId: string; themeId: string; size: string; orientation: string; grayscale: boolean };
  seed: number;
  setSeed: (n: number) => void;
  params: Record<string, any>;
  setParams: (p: Record<string, any>) => void;
}) {
  const [sample, setSample] = useState<Sample | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pagesBusy, setPagesBusy] = useState(false);
  const seq = useRef(0);
  const procedural = type.artwork === 'procedural';
  const isMandala = type.id === 'mandala-coloring';

  const body = useMemo(() => ({
    productType: type.id,
    title: form.title || undefined,
    params,
    paper: { size: form.size, orientation: form.orientation, grayscale: form.grayscale },
    designSystemId: form.designSystemId || undefined,
    audienceId: form.audienceId || null,
    themeId: form.themeId || null,
    seed,
  }), [type.id, form.title, params, form.size, form.orientation, form.grayscale, form.designSystemId, form.audienceId, form.themeId, seed]);
  const key = JSON.stringify(body);

  // The designs redraw by themselves a moment after any setting changes (drawing them is quick and free).
  useEffect(() => {
    setPages([]);
    if (!procedural) { setSample(null); setErr(null); return; }
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<Sample>('/products/sample', { body });
        if (my === seq.current) { setSample(r); setErr(null); }
      } catch (e) {
        if (my === seq.current) setErr(errorText(e));
      } finally {
        if (my === seq.current) setBusy(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [key, procedural]);

  const showPages = async () => {
    setPagesBusy(true);
    setErr(null);
    try {
      const r = await api<Sample>('/products/sample', { body: { ...body, pages: true } });
      setPages(r.pages);
      if (!procedural) setSample(r);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setPagesBusy(false);
    }
  };

  const unavailable = type.artwork === 'ai-image'
    ? 'This kind is drawn by an AI image provider, so there is no free sample. You will see it after production.'
    : null;

  return (
    <div className="stack" style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>Try it first</h3>
        <span className="small muted">SAMPLE, nothing is made or saved</span>
      </div>
      {unavailable ? <p className="small muted" style={{ margin: 0 }}>{unavailable}</p> : <>
        {procedural && <p className="small muted" style={{ margin: 0 }}>
          These are the first designs this product will have. Change any setting and they redraw. Press Different designs for another set. Creating the product keeps the set you see (seed {seed}).
        </p>}
        {procedural && <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {(sample?.art ?? []).map((a) => <img key={a.name} alt={a.name} src={svgUrl(a.svg)} style={{ width: 150, height: 150, background: '#fff', border: '1px solid #ccc', borderRadius: 4, opacity: busy ? 0.5 : 1 }} />)}
          {!sample && busy && <span className="small muted"><span className="spinner" /> Drawing…</span>}
        </div>}
        {procedural && sample && <p className="small muted" style={{ margin: 0 }}>Showing {sample.art.length} of {sample.totalArt} designs.</p>}
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {procedural && <button onClick={() => setSeed(newSeed())}>Different designs</button>}
          <button disabled={pagesBusy} onClick={showPages}>{pagesBusy && <span className="spinner" />}Show the first pages</button>
        </div>
        {pages.length > 0 && <>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
            {pages.map((p, i) => <img key={i} alt={`Sample page ${i + 1}`} src={p} style={{ width: 240, border: '1px solid #ccc', borderRadius: 4 }} />)}
          </div>
          <p className="small muted" style={{ margin: 0 }}>The words here come from the built-in library. If an AI key works when you press Create, the AI may word the pages differently. Layout, paper and artwork match.</p>
        </>}
        {isMandala && <ReferencePicker params={params} setParams={setParams} />}
      </>}
      {err && <div className="err">{err}</div>}
    </div>
  );
}

const DETAIL_WORD: Record<string, string> = { simple: 'Simple', medium: 'Medium', detailed: 'Detailed', intricate: 'Intricate' };

/** Pick one of your imported pictures to look at beside the sample, and to read the repeat count and detail from. */
function ReferencePicker({ params, setParams }: { params: Record<string, any>; setParams: (p: Record<string, any>) => void }) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState('');
  const [shown, setShown] = useState(18);
  const [picked, setPicked] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tags = useApi<any>(open ? '/references/tags?kind=image' : null);
  const list = useApi<any[]>(open ? `/references?kind=image${tag ? `&tag=${encodeURIComponent(tag)}` : ''}` : null);

  const read = async (id: string) => {
    setBusy(true);
    setErr(null);
    setReading(null);
    try {
      const r = await api<Reading>(`/references/${id}/read-mandala`, { body: {} });
      setReading(r);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const apply = () => {
    if (!reading) return;
    setParams({ ...params, ...(reading.symmetry ? { symmetry: reading.symmetry } : {}), ...(reading.detail ? { detail: reading.detail } : {}) });
  };

  return (
    <div className="stack" style={{ borderTop: '1px solid #ddd', paddingTop: 8 }}>
      <button onClick={() => setOpen(!open)} style={{ alignSelf: 'flex-start' }}>{open ? 'Hide my pictures' : 'Compare with one of my pictures'}</button>
      {open && <>
        <p className="small muted" style={{ margin: 0 }}>
          The mandala maker draws its own shapes, so a picture can't be copied. What it can do is read how many times your picture repeats around its centre and roughly how detailed it is, and set those two settings for you. Pick the motif set yourself.
        </p>
        {picked ? (
          <div className="row" style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <img alt="Your picture" src={`/api/references/${picked}/file`} style={{ width: 240, maxHeight: 300, objectFit: 'contain', border: '1px solid #ccc', borderRadius: 4, background: '#fff' }} />
            <div className="stack" style={{ flex: 1, minWidth: 220 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="primary" disabled={busy} onClick={() => read(picked)}>{busy && <span className="spinner" />}Read repeat count and detail</button>
                <button onClick={() => { setPicked(null); setReading(null); }}>Pick another</button>
              </div>
              {reading && <div className="stack">
                <div>
                  <b>Repeats around the centre: </b>{reading.symmetry ? `${reading.symmetry} times (match ${Math.round(reading.symmetryStrength * 100)}%)` : 'no clear count found'}
                </div>
                <div><b>Detail: </b>{reading.detail ? `about ${DETAIL_WORD[reading.detail]}` : 'could not tell'} <span className="small muted">(a rough guess; the neighbouring level is possible)</span></div>
                {reading.notes.map((n, i) => <div key={i} className="small muted">{n}</div>)}
                <button disabled={!reading.symmetry && !reading.detail} onClick={apply} style={{ alignSelf: 'flex-start' }}>Use these settings</button>
              </div>}
            </div>
          </div>
        ) : (
          <>
            <label className="f" style={{ maxWidth: 320 }}>Group
              <select value={tag} onChange={(e) => { setTag(e.target.value); setShown(18); }}>
                <option value="">All pictures</option>
                {(tags.data?.tags ?? []).map((t: any) => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}
              </select>
            </label>
            {list.loading && <span className="small muted"><span className="spinner" /> Loading…</span>}
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {(list.data ?? []).slice(0, shown).map((r: any) => (
                <button key={r.id} title={r.label} onClick={() => { setPicked(r.id); setReading(null); }} style={{ padding: 0, border: '1px solid #ccc', background: '#fff' }}>
                  <img loading="lazy" alt={r.label} src={`/api/references/${r.id}/file`} style={{ width: 96, height: 96, objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
            {(list.data ?? []).length > shown && <button onClick={() => setShown(shown + 18)} style={{ alignSelf: 'flex-start' }}>Show more ({(list.data ?? []).length - shown} left)</button>}
          </>
        )}
        {err && <div className="err">{err}</div>}
      </>}
    </div>
  );
}
