import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, ApiError, errorText, useApi } from '../api.ts';
import { ActionButton, Async, Card, Empty, PageHead, Pill, useToast } from '../ui.tsx';
import { fmtDate } from '../format.ts';

const TOOLS = ['Grok Imagine', 'ChatGPT images', 'Gemini (Nano Banana)', 'arena.ai', 'Flux', 'Venice AI', 'Midjourney', 'Canva'];
const FIELDS: { id: string; label: string; hint: string }[] = [
  { id: 'title', label: 'Titles', hint: 'Product or listing titles you like' },
  { id: 'description', label: 'Descriptions', hint: 'Listing descriptions you like' },
  { id: 'tags', label: 'Tags', hint: 'Tag sets, comma separated' },
  { id: 'page_text', label: 'Page text', hint: 'Prompts, affirmations, journal questions…' },
  { id: 'other', label: 'Other', hint: 'Anything else that shows your style' },
];

type Result = { name: string; status: 'imported' | 'duplicate' | 'rejected' | 'error'; detail: string };

function readBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error ?? new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}

/** One picture to import: a dropped or chosen file, or one fetched from a dragged web link. */
type Incoming = { name: string; blob: Blob; madeAt?: number };

const STORED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Pictures the factory doesn't store as-is (AVIF, BMP, SVG, ICO...) are redrawn by the browser and saved as PNG. */
async function toStorable(item: Incoming): Promise<Incoming> {
  if (!item.blob.type || STORED.includes(item.blob.type)) return item;
  const url = URL.createObjectURL(item.blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 1200, h = img.naturalHeight || 1200;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const png = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
    if (!png) throw new Error('could not convert');
    return { ...item, name: item.name.replace(/\.[A-Za-z0-9]{2,5}$/, '') + '.png', blob: png };
  } catch {
    throw new Error(`This browser can't open ${item.blob.type.replace('image/', '').toUpperCase() || 'this'} pictures, so it can't be imported.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The pictures in a drag or paste from a web page: each <img> in its HTML, else its link list or plain text.
 * Each picture is a list of links to try in order: the largest size the page offers first, then the one shown.
 */
function linksIn(dt: DataTransfer): string[][] {
  const out: string[][] = [];
  const html = dt.getData('text/html');
  if (html) for (const img of new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? '';
    const set = img.getAttribute('srcset');
    // srcset lists sizes; the last entry is usually the largest.
    const best = set ? set.split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean).pop() : undefined;
    const tries = [...new Set([best, src].filter((x): x is string => !!x))];
    if (tries.length) out.push(tries);
  }
  if (!out.length) for (const line of (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split(/\r?\n/)) {
    const t = line.trim();
    if (/^(https?:|data:image\/)/i.test(t)) out.push([t]);
  }
  return out.slice(0, 50);
}

async function fetchLink(link: string): Promise<Incoming> {
  if (link.startsWith('data:')) {
    const blob = await (await fetch(link)).blob();
    return { name: `pasted-image.${blob.type.split('/')[1]?.replace('jpeg', 'jpg').replace(/\+.*/, '') || 'png'}`, blob };
  }
  const res = await fetch('/api/references/fetch-image', { method: 'POST', headers: { 'x-daf-client': '1', 'content-type': 'application/json' }, body: JSON.stringify({ url: link }) });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new ApiError(e?.error?.message ?? `Could not fetch the picture (${res.status}).`, res.status, e?.error?.code ?? 'error', null);
  }
  const name = decodeURIComponent(res.headers.get('x-file-name') ?? '') || 'web-image';
  return { name, blob: await res.blob() };
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

export function Imports() {
  const images = useApi<any[]>('/references?kind=image');
  const texts = useApi<any[]>('/references?kind=text');
  return (
    <div className="page">
      <PageHead title="Imports" sub="Bring in things you made with other tools. Images become coloring-page products; text you like becomes style examples for the AI. Exact duplicates are skipped automatically." />
      <div className="grid g2">
        <ImageUpload onDone={() => images.reload()} />
        <TextUpload onDone={() => texts.reload()} />
      </div>
      <ImageLibrary state={images} />
      <TextLibrary state={texts} />
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

  const fromFiles = (files: File[]): Incoming[] => files.map((f) => ({ name: f.name, blob: f, madeAt: f.lastModified }));

  /** Files when the drag or paste carries them; otherwise the picture links a web page put in it. */
  const take = async (dt: DataTransfer | null) => {
    if (!dt) return;
    const files = [...dt.files].filter((f) => f.type.startsWith('image/') || !f.type);
    if (files.length) return upload(fromFiles(files));
    const links = linksIn(dt);
    if (!links.length) { setResults([{ name: 'Dropped item', status: 'rejected', detail: 'No picture found in what was dropped. Try dragging the picture itself, not its page.' }]); return; }
    return upload(links.map((l) => ({ name: l[0].startsWith('data:') ? 'pasted image' : l[0].split('?')[0].split('/').pop() || l[0], links: l })));
  };

  // Paste (⌘V / Ctrl+V) anywhere on this page works like a drop, unless you are typing in a box.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!e.clipboardData) return;
      const hasPicture = [...e.clipboardData.files].length > 0 || linksIn(e.clipboardData).length > 0;
      if (!hasPicture) return;
      e.preventDefault();
      void take(e.clipboardData);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  /** The first link that gives a picture (a page's "largest size" link sometimes doesn't exist). */
  const fetchFirst = async (links: string[]): Promise<Incoming & { from: string }> => {
    let err: unknown;
    for (const l of links) {
      try { return { ...(await fetchLink(l)), from: l }; } catch (e) { err = e; }
    }
    throw err;
  };

  const upload = async (items: (Incoming | { name: string; links: string[] })[]) => {
    const out: Result[] = [];
    for (const [i, it] of items.entries()) {
      setBusy(`Importing ${i + 1} of ${items.length}…`);
      try {
        const got = 'links' in it ? await fetchFirst(it.links) : null;
        const f = await toStorable(got ?? (it as Incoming));
        const r = await api<any>('/references/images', { body: { fileName: f.name, dataBase64: await readBase64(f.blob), label: label || undefined, sourceTool: tool.trim() || undefined, prompt: prompt || undefined, notes: got && !got.from.startsWith('data:') ? `Imported from ${got.from.slice(0, 1900)}` : undefined, madeAt: f.madeAt ? new Date(f.madeAt).toISOString() : undefined } });
        out.push(r.status === 'imported' ? { name: f.name, status: 'imported', detail: `saved as ${r.path}` }
          : r.status === 'duplicate' ? { name: f.name, status: 'duplicate', detail: `same image as ${r.existingPath ?? r.existingLabel}, skipped` }
          : { name: f.name, status: 'rejected', detail: r.reason });
      } catch (e) {
        out.push({ name: it.name, status: 'error', detail: errorText(e) });
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
          onDrop={(e) => { e.preventDefault(); setDrag(false); void take(e.dataTransfer); }}
          onClick={() => input.current?.click()}
          role="button"
          tabIndex={0}
        >
          {busy ?? 'Drop pictures here: files, or straight from a web page. You can also paste one (⌘V) or click to choose. Any picture type works; unusual ones are saved as PNG.'}
          <input ref={input} type="file" multiple accept="image/*" hidden onChange={(e) => { void upload(fromFiles([...(e.target.files ?? [])])); e.target.value = ''; }} />
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

function ImageLibrary({ state }: { state: any }) {
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  // Only one preview is open at a time, so only one full image is ever loaded.
  const [preview, setPreview] = useState<string | null>(null);
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
      </>
    )}>
      <Async state={state}>{(d: any[]) => d.length === 0 ? <Empty title="No images yet">Add some above.</Empty> : (
        <>
          <p className="small muted">Tick files to pick them, in the order you want the pages. Press Preview to see one. {sel.length ? `${sel.length} picked.` : ''}</p>
          <div className="ref-list" role="list">
            {d.map((r) => {
              const n = sel.indexOf(r.id);
              const name = r.rel_path?.split('/').pop() ?? r.original_name;
              const open = preview === r.id;
              return (
                <div key={r.id} role="listitem" className={`ref-row${n >= 0 ? ' on' : ''}`}>
                  <div className="ref-line">
                    <label className="ref-check" title={r.original_name}>
                      <input type="checkbox" checked={n >= 0} onChange={() => toggle(r.id)} aria-label={`Pick ${name}`} />
                      <span className="ref-n">{n >= 0 ? n + 1 : ''}</span>
                    </label>
                    <div className="ref-name">
                      <b>{name}</b>
                      <div className="small muted">{r.source_tool || 'tool not recorded'} · {r.width_px}×{r.height_px} · {fmtDate(r.made_at)}</div>
                      {r.usedBy.length > 0 && <div className="small">In {r.usedBy.map((u: any, i: number) => <span key={u.id}>{i ? ', ' : ''}<Link to={`/products/${u.id}`}>{u.title}</Link></span>)}</div>}
                    </div>
                    <div className="row ref-actions">
                      <button className="small" aria-expanded={open} onClick={() => setPreview(open ? null : r.id)}>{open ? 'Hide preview' : 'Preview'}</button>
                      <EditTool item={r} onSaved={() => state.reload()} />
                      <ActionButton className="small danger" disabled={r.usedBy.length > 0} title={r.usedBy.length ? 'Used by a product' : 'Delete this image from the library'} confirm={`Delete ${name}? This removes the file.`} onClick={async () => { await api(`/references/${r.id}`, { method: 'DELETE' }); setSel(sel.filter((x) => x !== r.id)); if (open) setPreview(null); state.reload(); }}>Delete</ActionButton>
                    </div>
                  </div>
                  {open && (
                    <div className="ref-preview">
                      <img src={`/api/references/${r.id}/file`} alt={r.label || name} />
                    </div>
                  )}
                </div>
              );
            })}
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
