import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, errorText, useApi } from '../api.ts';
import { ActionButton, Async, Card, Empty, Modal, PageHead, Pill, Tabs, useToast } from '../ui.tsx';
import { label } from '../format.ts';
import { FontFaces, ParamsEditor, fontPreview } from './Library.tsx';

export function Templates() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'types';
  const setTab = (t: string) => setSp({ tab: t });
  return (
    <div className="page">
      <PageHead title="Template library" sub="Reusable product types, layouts, design systems, audiences and themes." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'types', label: 'Product types' }, { id: 'designs', label: 'Design systems' }, { id: 'audiences', label: 'Audiences' }, { id: 'themes', label: 'Themes' }, { id: 'categories', label: 'Categories' }]} />
      {tab === 'types' && <Types />}
      {tab === 'designs' && <Designs />}
      {tab === 'audiences' && <Audiences />}
      {tab === 'themes' && <Themes />}
      {tab === 'categories' && <Categories />}
    </div>
  );
}

function Types() {
  const types = useApi<any[]>('/product-types');
  const templates = useApi<any[]>('/templates');
  const designs = useApi<any[]>('/design-systems');
  const [editing, setEditing] = useState<any>(null);
  return (
    <Async state={types}>{(list) => (
      <div className="grid g2">{list.map((t) => {
        const tpl = templates.data?.find((x) => x.product_type === t.id);
        return (
          <Card key={t.id} title={t.name} actions={tpl && t.id !== 'bundle' && <button className="small" onClick={() => setEditing({ tpl, type: t })}>Edit defaults</button>}>
            <p style={{ marginTop: 0 }}>{t.description}</p>
            <div className="row" style={{ marginBottom: 8 }}><Pill value="new" text={t.category} />{t.aiContent ? <Pill value="primary" text="AI content (local fallback)" /> : <Pill value="ready" text="Generated locally" />}{t.artwork === 'ai-image' && <Pill value="pending" text="Needs image AI" />}{t.artwork === 'procedural' && <Pill value="ready" text="Procedural artwork" />}</div>
            {t.variationAxes.length > 0 && <div className="small muted">Variation axes: {t.variationAxes.join(', ')}</div>}
            {tpl && <div className="small muted">Default design: {tpl.design_system ?? '—'} · template revision {tpl.revision}</div>}
          </Card>
        );
      })}
      {editing && <TemplateEditor tpl={editing.tpl} type={editing.type} designs={designs.data ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); templates.reload(); }} />}
      </div>
    )}</Async>
  );
}

function TemplateEditor({ tpl, type, designs, onClose, onSaved }: { tpl: any; type: any; designs: any[]; onClose: () => void; onSaved: () => void }) {
  const [params, setParams] = useState<Record<string, any>>(tpl.default_params);
  const [ds, setDs] = useState(tpl.default_design_system_id);
  const toast = useToast();
  return (
    <Modal title={`Defaults for ${type.name}`} wide onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><ActionButton className="primary" onClick={async () => { await api(`/templates/${tpl.id}`, { method: 'PATCH', body: { defaultParams: params, defaultDesignSystemId: ds } }); toast('Template saved'); onSaved(); }}>Save</ActionButton></>}>
      <label className="f">Default design system<select value={ds} onChange={(e) => setDs(e.target.value)}>{designs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <h3 style={{ marginTop: 14 }}>Default settings</h3>
      <ParamsEditor defaults={type.defaultParams} fields={type.paramFields} value={params} onChange={setParams} />
    </Modal>
  );
}

function Designs() {
  const designs = useApi<any[]>('/design-systems');
  const [editing, setEditing] = useState<any>(null);
  const toast = useToast();
  return (
    <Async state={designs}>{(list) => (
      <>
        <div className="spread" style={{ marginBottom: 12 }}>
          <p className="small muted" style={{ margin: 0 }}>A design system sets colors, fonts, line weights, ornaments and margins. Built-in ones are read-only; make your own to change them.</p>
          <button className="primary" onClick={() => setEditing({ isNew: true, name: '', description: '', basedOn: list[0]?.id, tokens: structuredClone(list[0]?.tokens) })}>New design system</button>
        </div>
        <div className="product-cards">{list.map((d) => (
          <div key={d.id} className="pcard">
            <div className="img" style={{ aspectRatio: '8.5/11' }}><img src={`/api/design-systems/${d.id}/preview.png?v=${encodeURIComponent(d.updated_at)}`} alt={`${d.name} preview`} loading="lazy" /></div>
            <div className="body">
              <div className="title">{d.name}</div>
              <div className="small muted">{d.description}</div>
              <div className="row">{Object.values(d.tokens.palette).map((c: any, i) => <span key={i} title={c} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: '1px solid var(--border)' }} />)}</div>
              <div className="small muted">{d.is_builtin ? 'Built-in' : 'Custom'} · used by {d.inUse} product version(s)</div>
              <div className="row">
                <ActionButton className="small" onClick={async () => { const name = window.prompt('Name for the copy', `${d.name} copy`); if (!name) return; await api('/design-systems', { body: { name, basedOn: d.id, description: `Based on ${d.name}` } }); designs.reload(); }}>Duplicate</ActionButton>
                {!d.is_builtin && <button className="small" onClick={() => setEditing(d)}>Edit</button>}
                {!d.is_builtin && d.inUse === 0 && <ActionButton className="small danger" confirm={`Delete ${d.name}?`} onClick={async () => { await api(`/design-systems/${d.id}`, { method: 'DELETE' }); toast('Deleted'); designs.reload(); }}>Delete</ActionButton>}
              </div>
            </div>
          </div>
        ))}</div>
        {editing && <DesignTokensEditor design={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); designs.reload(); }} />}
      </>
    )}</Async>
  );
}

function DesignTokensEditor({ design, onClose, onSaved }: { design: any; onClose: () => void; onSaved: () => void }) {
  const designs = useApi<any[]>('/design-systems');
  const fontsApi = useApi<any>('/fonts');
  const fontList: any[] = fontsApi.data?.fonts ?? [];
  const [t, setT] = useState<any>(design.tokens);
  const [meta, setMeta] = useState({ name: design.name, description: design.description ?? '', basedOn: design.basedOn ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (path: string[], v: any) => { const n = structuredClone(t); let o = n; for (const p of path.slice(0, -1)) o = o[p]; o[path[path.length - 1]] = v; setT(n); };
  const save = async () => {
    setErr(null);
    try {
      if (design.isNew) await api('/design-systems', { body: { name: meta.name, description: meta.description, tokens: t } });
      else await api(`/design-systems/${design.id}`, { method: 'PATCH', body: { name: meta.name, description: meta.description, tokens: t } });
      onSaved();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <Modal title={design.isNew ? 'New design system' : `Edit ${design.name}`} wide onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={meta.name.trim().length < 2} onClick={save}>{design.isNew ? 'Create' : 'Save'}</button></>}>
      <FontFaces fonts={fontList} />
      <div className="form">
        <label className="f">Name<input value={meta.name} placeholder="e.g. Ocean Calm" onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></label>
        <label className="f">Description<input value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></label>
        {design.isNew && <label className="f">Start from<select value={meta.basedOn} onChange={(e) => { const b = designs.data?.find((d) => d.id === e.target.value); setMeta({ ...meta, basedOn: e.target.value }); if (b) setT(structuredClone(b.tokens)); }}>{designs.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
      </div>
      <h3 style={{ marginTop: 12 }}>Colors</h3>
      <div className="form">{Object.entries(t.palette).map(([k, v]: any) => <label key={k} className="f">{label(k)}<input type="color" value={v} onChange={(e) => set(['palette', k], e.target.value)} /></label>)}</div>
      <h3 style={{ marginTop: 12 }}>Type</h3>
      <div className="form">
        {(['heading', 'body', 'accent'] as const).map((k) => <label key={k} className="f">{label(k)} font<select value={t.fonts[k]} onChange={(e) => set(['fonts', k], e.target.value)}>{fontList.map((f) => <option key={f.id} value={f.id}>{f.family}</option>)}</select><span style={{ ...fontPreview(t.fonts[k]), fontSize: 18 }}>The quick brown fox</span></label>)}
        <label className="f">Base size (pt)<input type="number" step={0.5} min={7} max={16} value={t.baseSizePt} onChange={(e) => set(['baseSizePt'], Number(e.target.value))} /></label>
        <label className="f">Heading scale<input type="number" step={0.1} min={1.2} max={3.5} value={t.headingScale} onChange={(e) => set(['headingScale'], Number(e.target.value))} /></label>
      </div>
      <h3 style={{ marginTop: 12 }}>Layout</h3>
      <div className="form">
        <label className="f">Line weight (pt)<input type="number" step={0.1} min={0.25} max={2.5} value={t.lineWeightPt} onChange={(e) => set(['lineWeightPt'], Number(e.target.value))} /></label>
        <label className="f">Corner radius (pt)<input type="number" step={1} min={0} max={12} value={t.radiusPt} onChange={(e) => set(['radiusPt'], Number(e.target.value))} /></label>
        <label className="f">Ornament<select value={t.ornament} onChange={(e) => set(['ornament'], e.target.value)}>{['none', 'dots', 'leaf', 'stars', 'waves', 'geometric'].map((o) => <option key={o} value={o}>{label(o)}</option>)}</select></label>
        <label className="f">Density<select value={t.density} onChange={(e) => set(['density'], e.target.value)}>{['airy', 'balanced', 'compact'].map((o) => <option key={o} value={o}>{label(o)}</option>)}</select></label>
        {(['top', 'right', 'bottom', 'left'] as const).map((k) => <label key={k} className="f">Margin {k} (mm)<input type="number" min={5} max={30} value={t.marginsMm[k]} onChange={(e) => set(['marginsMm', k], Number(e.target.value))} /></label>)}
      </div>
      {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

function Audiences() {
  const st = useApi<any[]>('/audiences');
  const [f, setF] = useState({ name: '', description: '', tone: 'warm, practical', readingLevel: 'general', fontScale: 1, density: 'balanced', notes: '' });
  const toast = useToast();
  return (
    <div className="grid g2">
      <Card title="Audiences"><Async state={st}>{(list) => <table className="t"><tbody>{list.map((a) => <tr key={a.id}><td><b>{a.name}</b><div className="small muted">{a.description}</div></td><td className="small">{a.profile.tone} · {a.profile.readingLevel} · text ×{a.profile.fontScale}</td></tr>)}</tbody></table>}</Async></Card>
      <Card title="Add an audience">
        <div className="form">
          <label className="f">Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="f">Description<input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <label className="f">Tone<input value={f.tone} onChange={(e) => setF({ ...f, tone: e.target.value })} /></label>
          <label className="f">Reading level<select value={f.readingLevel} onChange={(e) => setF({ ...f, readingLevel: e.target.value })}><option value="early-reader">Early reader</option><option value="general">General</option><option value="professional">Professional</option></select></label>
          <label className="f">Text size multiplier<input type="number" step={0.05} min={0.8} max={1.6} value={f.fontScale} onChange={(e) => setF({ ...f, fontScale: Number(e.target.value) })} /></label>
          <label className="f">Density<select value={f.density} onChange={(e) => setF({ ...f, density: e.target.value })}><option value="airy">Airy</option><option value="balanced">Balanced</option><option value="compact">Compact</option></select></label>
          <label className="f">Notes for content<input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        </div>
        <div style={{ marginTop: 10 }}><ActionButton className="primary" onClick={async () => { await api('/audiences', { body: { name: f.name, description: f.description, profile: { tone: f.tone, readingLevel: f.readingLevel, fontScale: f.fontScale, density: f.density, notes: f.notes || f.description } } }); toast('Audience added'); st.reload(); }}>Add audience</ActionButton></div>
      </Card>
    </div>
  );
}

function Themes() {
  const st = useApi<any[]>('/themes');
  const [f, setF] = useState({ name: '', description: '', keywords: '', months: '' });
  const toast = useToast();
  return (
    <div className="grid g2">
      <Card title="Themes"><Async state={st}>{(list) => list.length ? <table className="t"><tbody>{list.map((t) => <tr key={t.id}><td><b>{t.name}</b><div className="small muted">{t.description}</div></td><td className="small">{t.keywords.join(', ')}{t.seasonal_months.length ? ` · months ${t.seasonal_months.join(', ')}` : ''}</td></tr>)}</tbody></table> : <Empty title="No themes" />}</Async></Card>
      <Card title="Add a theme">
        <div className="form">
          <label className="f">Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="f">Description<input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <label className="f">Keywords (comma separated)<input value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} /></label>
          <label className="f">Season months (e.g. 11,12)<input value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} /></label>
        </div>
        <div style={{ marginTop: 10 }}><ActionButton className="primary" onClick={async () => { await api('/themes', { body: { name: f.name, description: f.description, keywords: f.keywords.split(',').map((x) => x.trim()).filter(Boolean), seasonalMonths: f.months.split(',').map((x) => Number(x.trim())).filter((x) => x >= 1 && x <= 12) } }); toast('Theme added'); st.reload(); }}>Add theme</ActionButton></div>
      </Card>
    </div>
  );
}

function Categories() {
  const st = useApi<any[]>('/categories');
  return <Card title="Categories"><Async state={st}>{(list) => <table className="t"><tbody>{list.map((c) => <tr key={c.id}><td><b>{c.name}</b><div className="small muted">{c.description}</div></td><td className="right">{c.products} product(s)</td></tr>)}</tbody></table>}</Async></Card>;
}
