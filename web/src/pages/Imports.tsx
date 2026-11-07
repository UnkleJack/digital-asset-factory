import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorText, useApi } from '../api.ts';
import { ActionButton, Async, Card, Empty, PageHead, Pill, useToast } from '../ui.tsx';
import { fmtDate } from '../format.ts';

const TOOLS = ['Grok Imagine', 'ChatGPT images', 'Gemini (Nano Banana)', 'arena.ai', 'Flux', 'Venice AI', 'Midjourney', 'Canva', 'Pollinations'];

const AVAILABLE_MODELS = [
  { id: 'pollinations', label: 'Pollinations (FLUX, free, no key)', free: true, supportsRef: true },
  { id: 'gemini', label: 'Gemini 3 Pro Image (free tier)', free: true, supportsRef: true },
  { id: 'together', label: 'Together FLUX.1-schnell (free tier)', free: true, supportsRef: false },
  { id: 'huggingface', label: 'Hugging Face FLUX (free tier)', free: true, supportsRef: false },
  { id: 'openai', label: 'OpenAI GPT Image (paid)', free: false, supportsRef: true },
  { id: 'replicate', label: 'Replicate FLUX (paid)', free: false, supportsRef: true },
  { id: 'fal', label: 'Fal.ai FLUX (paid)', free: false, supportsRef: true },
  { id: 'grok', label: 'xAI Grok (paid)', free: false, supportsRef: true },
];

function VariationsModal({
  open,
  onClose,
  referenceId,
  count,
  modelIds,
  prompt,
  onSubmit,
  onCountChange,
  onModelIdsChange,
  onPromptChange,
}: {
  open: boolean;
  onClose: () => void;
  referenceId: string;
  count: number;
  modelIds: string[];
  prompt: string;
  onSubmit: (referenceId: string, count: number, modelIds: string[], prompt: string) => Promise<void>;
  onCountChange: (c: number) => void;
  onModelIdsChange: (m: string[]) => void;
  onPromptChange: (p: string) => void;
}) {
  if (!open) return null;
  const [err, setErr] = useState<string | null>(null);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await onSubmit(referenceId, count, modelIds, prompt);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Make variations of {referenceId}</h3>
        <form onSubmit={handleSubmit} className="stack">
          <label className="f">How many per model<input type="number" min="1" max="20" value={count} onChange={(e) => onCountChange(Number(e.target.value))} /></label>
          <label className="f">Prompt (optional, empty = use reference prompt)<textarea rows={3} value={prompt} onChange={(e) => onPromptChange(e.target.value)} /></label>
          <div className="stack">
            <div className="small muted">Pick models (max 4):</div>
            {AVAILABLE_MODELS.map((m) => (
              <label key={m.id} className="check">
                <input type="checkbox" checked={modelIds.includes(m.id)} onChange={(e) => onModelIdsChange(e.target.checked ? [...modelIds, m.id] : modelIds.filter((x) => x !== m.id))} />
                {m.label} {m.free ? <span className="pill ready">free</span> : <span className="pill pending">paid</span>} {m.supportsRef && <span className="pill ready">ref</span>}
              </label>
            ))}
          </div>
          {err ? <div className="err">{err}</div> : null}
          <div className="row">
            <ActionButton className="danger" onClick={onClose}>Cancel</ActionButton>
            <ActionButton className="primary" type="submit" disabled={modelIds.length === 0}>Generate {modelIds.length} × {count}</ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImageThumb({ r, n, sel, toggle, onMakeVariations }: { r: any; n: number; sel: string[]; toggle: (id: string) => void; onMakeVariations: (refId: string) => void }) {
  return (
    <div key={r.id} className={`ref-card${n >= 0 ? ' on' : ''}`}>
      <button className="thumb sq ref-pick" onClick={() => toggle(r.id)} title={r.original_name}>
        <img src={`/api/references/${r.id}/file`} alt={r.label} loading="lazy" />
        {n >= 0 && <span className="ref-n">{n + 1}</span>}
      </button>
      <div className="small"><b>{r.rel_path?.split('/').pop()}</b></div>
      <div className="small muted">{r.source_tool || 'tool not recorded'} · {r.width_px}×{r.height_px} · {fmtDate(r.made_at)}</div>
      {r.usedBy.length > 0 && <div className="small">In {r.usedBy.map((u: any, i: number) => <span key={u.id}>{i ? ', ' : ''}<Link to={`/products/${u.id}`}>{u.title}</Link></span>)}</div>
      <div className="row">
        <EditTool item={r} onSaved={() => {}} />
        <ActionButton className="small danger" disabled={r.usedBy.length > 0} title={r.usedBy.length > 0 ? 'Used by a product' : 'Delete this image from the library'} confirm={`Delete ${r.rel_path?.split('/').pop()}? This removes the file.`} onClick={async () => { await api(`/references/${r.id}`, { method: 'DELETE' }); }}>Delete</ActionButton>
      </div>
    </div>
  );
}

const renderThumb = (r: any, n: number, toggle: (id: string) => void) => {
    const cardClass = `ref-card${n >= 0 ? ' on' : ''}`;
    return (
        <div key={r.id} className={cardClass}>
            <button className="thumb sq ref-pick" onClick={() => toggle(r.id)} title={r.original_name}>
                <img src={`/api/references/${r.id}/file`} alt={r.label} loading="lazy" />
                {n >= 0 && <span className="ref-n">{n + 1}</span>}
            </button>
            <div className="small"><b>{r.rel_path?.split('/').pop()}</b></div>
            <div className="small muted">{r.source_tool || 'tool not recorded'} · {r.width_px}×{r.height_px} · {fmtDate(r.made_at)}</div>
            {r.usedBy.length > 0 && <div className="small">In {r.usedBy.map((u: any, i: number) => <span key={u.id}>{i ? ', ' : ''}<Link to={`/products/${u.id}`}>{u.title}</Link></span>)}</div>
            <div className="row">
                <EditTool item={r} onSaved={() => {}} />
                <ActionButton className="small danger" disabled={r.usedBy.length > 0} title={r.usedBy.length > 0 ? 'Used by a product' : 'Delete this image from the library'} confirm={`Delete ${r.rel_path?.split('/').pop()}? This removes the file.`} onClick={async () => { await api(`/references/${r.id}`, { method: 'DELETE' }); }}>Delete</ActionButton>
            </div>
        </div>
    );
};

const FIELDS: { id: string; label: string; hint: string }[] = [
  { id: 'title', label: 'Titles', hint: 'Product or listing titles you like' },
  { id: 'description', label: 'Descriptions', hint: 'Listing descriptions you like' },
  { id: 'tags', label: 'Tags', hint: 'Tag sets, comma separated' },
  { id: 'page_text', label: 'Page text', hint: 'Prompts, affirmations, journal questions…' },
  { id: 'other', label: 'Other', hint: 'Anything else that shows your style' },
];

type Result = { name: string; status: 'imported' | 'duplicate' | 'rejected' | 'error'; detail: string };

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error ?? new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}

function ToolPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = TOOLS.includes(value) || value === '';
  return (
    <label className="f">Made with
      <select value={known ? value : '__other'} onChange={(e) => onChange(e.target.value === '__other' ? ' ' : e.target.value)}>
        <option value="">Not sure</option>
        {TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}
        <option value="__other">Something else…</option>
      </select>
      {!known && <input autoFocus placeholder="Tool name" value={value.trim()} onChange={(e) => onChange(e.target.value || ' ')} />}
    </label>
  );
}

interface ImageLibraryProps {
  state: any;
  onMakeVariations: (refId: string) => void;
}

export function Imports() {
  const images = useApi<any[]>('/references?kind=image');
  const texts = useApi<any[]>('/references?kind=text');
  const [makeVar, setMakeVar] = useState<{ open: boolean; count: number; modelIds: string[]; prompt: string; referenceId: string } | null>(null);
  const toast = useToast();

  const handleSubmitVariations = async (referenceId: string, count: number, modelIds: string[], prompt: string) => {
    setMakeVar(prev => prev ? { ...prev, open: false } : null);
    const r = await api<any>('/api/tournaments/variations', { body: { referenceId, count, modelIds, prompt } });
    toast(`Variations started: ${r.results.filter((x: any) => x.result).length}/${r.results.length} succeeded`);
  };

  return (
    <div className="page">
      <PageHead title="Imports" sub="Bring in things you made with other tools. Images become coloring-page products; text you like becomes style examples for the AI. Exact duplicates are skipped automatically." />
      <div className="grid g2">
        <ImageUpload onDone={() => images.reload()} />
        <TextUpload onDone={() => texts.reload()} />
      </div>
      <ImageLibrary state={images} onMakeVariations={(refId) => setMakeVar({ open: true, count: 5, modelIds: ['pollinations', 'gemini', 'together', 'huggingface'], prompt: '', referenceId: refId })} />
      <TextLibrary state={texts} />
      {makeVar ? (
        <VariationsModal
          open={makeVar.open}
          onClose={() => setMakeVar(null)}
          referenceId={makeVar.referenceId}
          count={makeVar.count}
          modelIds={makeVar.modelIds}
          prompt={makeVar.prompt}
          onSubmit={handleSubmitVariations}
          onCountChange={(c) => setMakeVar({ ...makeVar, count: c })}
          onModelIdsChange={(m) => setMakeVar({ ...makeVar, modelIds: m })}
          onPromptChange={(p) => setMakeVar({ ...makeVar, prompt: p })}
        />
      ) : null}
    </div>
  );
}

function ImageUpload({ onDone }: { onDone: () => void }) {
  const [tool, setTool] = useState('');
  const [label, setLabel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (files: File[]) => {
    const out: Result[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(`Importing ${i + 1} of ${files.length}…`);
      try {
        const r = await api<any>('/references/images', { body: { fileName: f.name, dataBase64: await readBase64(f), label: label || undefined, sourceTool: tool.trim() || undefined, prompt: prompt || undefined, madeAt: f.lastModified ? new Date(f.lastModified).toISOString() : undefined } });
        out.push(r.status === 'imported' ? { name: f.name, status: 'imported', detail: `saved as ${r.path}` }
          : r.status === 'duplicate' ? { name: f.name, status: 'duplicate', detail: `same image as ${r.existingPath ?? r.existingLabel}, skipped` }
          : { name: f.name, status: 'rejected', detail: r.reason });
      } catch (e) {
        out.push({ name: f.name, status: 'error', detail: errorText(e) });
      }
      setResults([...out]);
    }
    setBusy(null);
    onDone();
  };

  return (
    <Card title="Add images">
      <div className="stack">
        <div className="form">
          <ToolPicker value={tool} onChange={setTool} />
          <label className="f">What are they? (names the files)<input placeholder="e.g. mandala" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        </div>
        <label className="f">Prompt you used (optional)<textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Kept with the image so you can reuse it" /></label>
        <div
          className={`dropzone${drag ? ' on' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload([...e.dataTransfer.files]); }}
          onClick={() => input.current?.click()}
          role="button"
          tabIndex={0}
        >
          {busy ?? 'Drop images here, or click to choose (PNG, JPEG, WebP, GIF)'}
          <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
        </div>
        {results.length > 0 && (
          <div className="stack small">
            <div className="muted">{results.filter((r) => r.status === 'imported').length} imported · {results.filter((r) => r.status === 'duplicate').length} duplicates skipped · {results.filter((r) => r.status === 'rejected' || r.status === 'error').length} not imported</div>
            {results.map((r, i) => <div key={i} className="spread"><span>{r.name}</span><span className="row"><Pill value={r.status === 'imported' ? 'ready' : r.status === 'duplicate' ? 'pending' : 'failed'} text={r.status} /><span className="muted">{r.detail}</span></span></div>)}
          </div>
        )}
      </div>
    </Card>
  );
}

function TextUpload({ onDone }: { onDone: () => void }) {
  const [field, setField] = useState('title');
  const [text, setText] = useState('');
  const [eachLine, setEachLine] = useState(true);
  const [tool, setTool] = useState('');
  const toast = useToast();
  const hint = FIELDS.find((f) => f.id === field)?.hint;
  return (
    <Card title="Add text examples">
      <div className="stack">
        <div className="form">
          <label className="f">Kind of text<select value={field} onChange={(e) => setField(e.target.value)}>{FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
          <ToolPicker value={tool} onChange={setTool} />
        </div>
        <label className="f">{hint}<textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={eachLine} onChange={(e) => setEachLine(e.target.checked)} />Each line is a separate example</label>
        <p className="small muted" style={{ margin: 0 }}>The AI sees up to 8 recent examples of the kind that fits the job (titles, descriptions and tags when it writes listings; page text when it writes pages) and is told to match their style without copying them.</p>
        <div><ActionButton className="primary" disabled={text.trim().length < 3} onClick={async () => {
          const r = await api<any>('/references/texts', { body: { field, text, eachLine, sourceTool: tool.trim() || undefined } });
          const added = r.results.filter((x: any) => x.status === 'imported').length;
          const dup = r.results.length - added;
          toast(`${added} example(s) added${dup ? `, ${dup} duplicate(s) skipped` : ''}`);
          setText('');
          onDone();
        }}>Add</ActionButton></div>
      </div>
    </Card>
  );
}

function ImageLibrary({ state, onMakeVariations }: { state: any; onMakeVariations: (refId: string) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const toast = useToast();
  const nav = useNavigate();
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <Card title="Image library" className="imports-lib" actions={sel.length > 0 && (
      <>
        <input placeholder="Product title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: 220 }} />
        <ActionButton className="primary" onClick={async () => {
          const r = await api<any>('/references/products', { body: { referenceIds: sel, title: title || undefined } });
          toast('Product started. It will appear in Batch approval when it is ready.');
          setSel([]);
          setTitle('');
          state.reload();
          nav(`/products/${r.productId}`);
        }}>Make coloring product from {sel.length} selected</ActionButton>
        {sel.length === 1 && (
          <ActionButton onClick={() => onMakeVariations(sel[0])}>Make variations</ActionButton>
        )}
      </>
    )}>
      <Async state={state}>{(d: any[]) => d.length === 0 ? <Empty title="No images yet">Add some above.</Empty> : (
        <>
          <p className="small muted">Click images to pick them, in the order you want the pages. {sel.length ? `${sel.length} picked.` : ''}</p>
          <div className="thumbs">
            {(() => {
              const thumbs = d.map((r) => {
                const n = sel.indexOf(r.id);
                const cardClass = `ref-card${n >= 0 ? ' on' : ''}`;
                const row = React.createElement('div', { className: 'row' },
                  React.createElement(EditTool, { item: r, onSaved: () => state.reload() }),
                  React.createElement(ActionButton, {
                    className: 'small danger',
                    disabled: r.usedBy.length > 0,
                    title: r.usedBy.length > 0 ? 'Used by a product' : 'Delete this image from the library',
                    confirm: `Delete ${r.rel_path?.split('/').pop()}? This removes the file.`,
                    onClick: async () => { await api(`/references/${r.id}`, { method: 'DELETE' }); setSel(sel.filter((x) => x !== r.id)); state.reload(); }
                  }, 'Delete')
                );
                return React.createElement('div', { key: r.id, className: `ref-card${n >= 0 ? ' on' : ''}` },
                  React.createElement('button', {
                    className: 'thumb sq ref-pick',
                    onClick: () => toggle(r.id),
                    title: r.original_name
                  },
                    React.createElement('img', { src: `/api/references/${r.id}/file`, alt: r.label, loading: 'lazy' }),
                    n >= 0 && React.createElement('span', { className: 'ref-n' }, n + 1)
                  ),
                  React.createElement('div', { className: 'small' },
                    React.createElement('b', {}, r.rel_path?.split('/').pop())
                  ),
                  React.createElement('div', { className: 'small muted' },
                    r.source_tool || 'tool not recorded', ' · ', r.width_px, '×', r.height_px, ' · ', fmtDate(r.made_at)
                  ),
                  r.usedBy.length > 0 && React.createElement('div', { className: 'small' },
                    'In ',
                    r.usedBy.map((u: any, i: number) => React.createElement('span', { key: u.id }, i ? ', ' : '', React.createElement(Link, { to: `/products/${u.id}` }, u.title)))
                  ),
                  React.createElement('div', { className: 'row' },
                    React.createElement(EditTool, { item: r, onSaved: () => state.reload() }),
                    React.createElement(ActionButton, {
                      className: 'small danger',
                      disabled: r.usedBy.length > 0,
                      title: r.usedBy.length > 0 ? 'Used by a product' : 'Delete this image from the library',
                      confirm: `Delete ${r.rel_path?.split('/').pop()}? This removes the file.`,
                      onClick: async () => { await api(`/references/${r.id}`, { method: 'DELETE' }); setSel(sel.filter((x) => x !== r.id)); state.reload(); }
                    }, 'Delete')
                  )
                );
              });
              return thumbs;
            })()}
          </div>
          </div>
        </>
      )}</Async>
    </Card>
  );
}

function EditTool({ item, onSaved }: { item: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState(item.source_tool);
  const [prompt, setPrompt] = useState(item.prompt);
  if (!open) return <button className="small" onClick={() => setOpen(true)}>Edit</button>;
  return (
    <div className="stack" style={{ width: '100%' }}>
      <ToolPicker value={tool} onChange={setTool} />
      <label className="f">Prompt<textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
      <div className="row">
        <ActionButton className="small primary" onClick={async () => { await api(`/references/${item.id}`, { method: 'PATCH', body: { sourceTool: tool.trim(), prompt } }); setOpen(false); onSaved(); }}>Save</ActionButton>
        <button className="small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function TextLibrary({ state }: { state: any }) {
  return (
    <Card title="Text examples">
      <Async state={state}>{(d: any[]) => d.length === 0 ? <Empty title="No text examples yet">Add titles, descriptions or tags you like above.</Empty> : (
        <table className="t">
          <thead><tr><th>Kind</th><th>Text</th><th>Made with</th><th>Use as example</th><th /></tr></thead>
          <tbody>{d.map((r) => (
            <tr key={r.id}>
              <td>{FIELDS.find((f) => f.id === r.field)?.label ?? r.field}</td>
              <td style={{ whiteSpace: 'pre-wrap' }}>{r.body}</td>
              <td className="small muted">{r.source_tool || '—'}</td>
              <td><input type="checkbox" aria-label="Use as example" checked={!!r.use_as_example} onChange={async (e) => { await api(`/references/${r.id}`, { method: 'PATCH', body: { useAsExample: e.target.checked } }); state.reload(); }} /></td>
              <td><ActionButton className="small danger" confirm="Delete this example?" onClick={async () => { await api(`/references/${r.id}`, { method: 'DELETE' }); state.reload(); }}>Delete</ActionButton></td>
            </tr>
          ))}</tbody>
        </table>
      )}</Async>
    </Card>
  );
}