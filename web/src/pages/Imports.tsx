import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, useApi } from '../api.ts';
import { IMAGES_IMPORTED, NO_PICTURE, fromFiles, importPictures, linksIn, picturesIn, type ImportResult, type Pending } from '../imageImport.ts';
import { ActionButton, Async, Card, ClearViewControls, Empty, PageHead, Pill, useClearView, useToast } from '../ui.tsx';
import { fmtDate } from '../format.ts';

const TOOLS = ['Grok Imagine', 'ChatGPT images', 'Gemini (Nano Banana)', 'arena.ai', 'Flux', 'Venice AI', 'Midjourney', 'Canva'];
const FIELDS: { id: string; label: string; hint: string }[] = [
  { id: 'title', label: 'Titles', hint: 'Product or listing titles you like' },
  { id: 'description', label: 'Descriptions', hint: 'Listing descriptions you like' },
  { id: 'tags', label: 'Tags', hint: 'Tag sets, comma separated' },
  { id: 'page_text', label: 'Page text', hint: 'Prompts, affirmations, journal questions…' },
  { id: 'other', label: 'Other', hint: 'Anything else that shows your style' },
];

/** Filter value for "not sorted yet". Matches UNTAGGED on the server. */
const UNTAGGED = '_untagged';

/** Same rule as the server's tag cleaner: "Script Fonts!" → "script-fonts". */
function tagSlug(raw: string): string {
  return raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/g, '');
}

/** Every tag used on the given items, most used first. */
function tagCounts(items: { tags?: string[] }[] | null | undefined): { tag: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items ?? []) for (const t of it.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
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

/**
 * Picks tags: type one and press Enter (or a comma), or click one you've used before.
 * An item can have several, so a font picture can be "fonts" and "art" at once.
 */
function TagInput({ value, onChange, known, placeholder = 'Type a tag, press Enter' }: { value: string[]; onChange: (v: string[]) => void; known: string[]; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = (raws: string[]) => {
    const next = [...value];
    for (const r of raws) { const t = tagSlug(r); if (t && !next.includes(t)) next.push(t); }
    if (next.length !== value.length) onChange(next);
  };
  const suggestions = known.filter((t) => !value.includes(t)).slice(0, 10);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="tag-input">
        {value.map((t) => (
          <span key={t} className="chip on tag">{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button></span>
        ))}
        <input
          list="daf-known-tags"
          value={draft}
          placeholder={value.length ? '' : placeholder}
          onChange={(e) => {
            const v = e.target.value;
            if (!v.includes(',')) { setDraft(v); return; }
            const parts = v.split(',');
            add(parts.slice(0, -1));
            setDraft(parts[parts.length - 1]);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add([draft]); setDraft(''); }
            else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => { if (draft.trim()) { add([draft]); setDraft(''); } }}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="chips small">
          <span className="muted">Used before:</span>
          {suggestions.map((t) => <button key={t} type="button" className="chip tag small" onClick={() => add([t])}>+ {t}</button>)}
        </div>
      )}
    </div>
  );
}

/** "All · To sort · fonts (12) · art (5)…" — clicking one shows only that group. */
function TagFilter({ items, value, onChange }: { items: { tags?: string[] }[]; value: string; onChange: (v: string) => void }) {
  const counts = tagCounts(items);
  const untagged = items.filter((i) => !i.tags?.length).length;
  return (
    <div className="chips tag-filter" role="group" aria-label="Show group">
      <button className={`chip small${value === '' ? ' on' : ''}`} onClick={() => onChange('')}>All ({items.length})</button>
      <button className={`chip small${value === UNTAGGED ? ' on' : ''}`} onClick={() => onChange(UNTAGGED)} title="Items with no tags yet">To sort ({untagged})</button>
      {counts.map((c) => <button key={c.tag} className={`chip small${value === c.tag ? ' on' : ''}`} onClick={() => onChange(value === c.tag ? '' : c.tag)}>{c.tag} ({c.count})</button>)}
    </div>
  );
}

const inGroup = (tag: string) => (r: { tags?: string[] }) => tag === '' ? true : tag === UNTAGGED ? !r.tags?.length : !!r.tags?.includes(tag);

export function Imports() {
  const images = useApi<any[]>('/references?kind=image');
  const texts = useApi<any[]>('/references?kind=text');
  // Pictures imported from the box here or dropped anywhere in the app: refresh the library.
  useEffect(() => {
    const refresh = () => images.reload();
    window.addEventListener(IMAGES_IMPORTED, refresh);
    return () => window.removeEventListener(IMAGES_IMPORTED, refresh);
  });
  // Tags are shared between pictures and text, so "fonts" means the same group everywhere.
  const known = useMemo(() => tagCounts([...(images.data ?? []), ...(texts.data ?? [])]).map((c) => c.tag), [images.data, texts.data]);
  return (
    <div className="page">
      <PageHead title="Imports" sub="Bring in things you made with other tools. Tag them as they come in so like things stay together; one item can carry several tags. Images become coloring-page products; text you like becomes style examples for the AI. Exact duplicates are skipped automatically." />
      <datalist id="daf-known-tags">{known.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="grid g2">
        <ImageUpload known={known} />
        <TextUpload known={known} onDone={() => texts.reload()} />
      </div>
      <ImageLibrary state={images} known={known} />
      <TextLibrary state={texts} known={known} />
    </div>
  );
}

function ImageUpload({ known }: { known: string[] }) {
  const [tool, setTool] = useState('');
  const [label, setLabel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = async (dt: DataTransfer | null) => {
    if (!dt) return;
    const items = picturesIn(dt);
    if (!items.length) { setResults([{ name: 'Dropped item', status: 'rejected', detail: NO_PICTURE }]); return; }
    return upload(items);
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

  // What's typed in the fields above is saved with every picture dropped in this box.
  const upload = async (items: Pending[]) => {
    await importPictures(items, { label: label || undefined, sourceTool: tool.trim() || undefined, prompt: prompt || undefined, tags }, (step, done) => { setBusy(step); setResults(done); });
    setBusy(null);
  };

  return (
    <Card title="Add images">
      <div className="stack">
        <div className="form">
          <ToolPicker value={tool} onChange={setTool} />
          <label className="f">What are they? (names the files)<input placeholder="e.g. mandala" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        </div>
        <div className="f">
          <span className="muted" style={{ fontSize: 13.5 }}>Sort into (tags) — every picture dropped below gets these. Use several when it fits more than one use, e.g. <b>fonts</b> and <b>art</b>.</span>
          <TagInput value={tags} onChange={setTags} known={known} placeholder="e.g. fonts, art, planners" />
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
          {busy ?? `Drop pictures here: files, or straight from a web page. You can also paste one (⌘V) or click to choose. Any picture type works; unusual ones are saved as PNG.${tags.length ? ` Tagged: ${tags.join(', ')}.` : ' No tags set: they will wait in "To sort".'}`}
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

function TextUpload({ known, onDone }: { known: string[]; onDone: () => void }) {
  const [field, setField] = useState('title');
  const [text, setText] = useState('');
  const [eachLine, setEachLine] = useState(true);
  const [tool, setTool] = useState('');
  const [tags, setTags] = useState<string[]>([]);
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
        <div className="f"><span className="muted" style={{ fontSize: 13.5 }}>Sort into (tags, optional)</span><TagInput value={tags} onChange={setTags} known={known} /></div>
        <label className="check"><input type="checkbox" checked={eachLine} onChange={(e) => setEachLine(e.target.checked)} />Each line is a separate example</label>
        <p className="small muted" style={{ margin: 0 }}>The AI sees up to 8 recent examples of the kind that fits the job (titles, descriptions and tags when it writes listings; page text when it writes pages) and is told to match their style without copying them.</p>
        <div><ActionButton className="primary" disabled={text.trim().length < 3} onClick={async () => {
          const r = await api<any>('/references/texts', { body: { field, text, eachLine, sourceTool: tool.trim() || undefined, tags: tags.length ? tags : undefined } });
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

/** Adds or removes tags on every ticked item at once. */
function BulkTagger({ ids, known, onDone }: { ids: string[]; known: string[]; onDone: () => void }) {
  const [tags, setTags] = useState<string[]>([]);
  const toast = useToast();
  const send = async (which: 'add' | 'remove') => {
    const r = await api<any>('/references/tags', { body: { ids, [which]: tags } });
    toast(`${which === 'add' ? 'Tagged' : 'Untagged'} ${ids.length} item(s).${r.full?.length ? ` ${r.full.length} already had the most tags allowed and were skipped.` : ''}`);
    setTags([]);
    onDone();
  };
  return (
    <div className="bulk-tag">
      <b className="small">Tags for the {ids.length} ticked</b>
      <TagInput value={tags} onChange={setTags} known={known} />
      <div className="row">
        <ActionButton className="small primary" disabled={!tags.length} onClick={() => send('add')}>Add tags</ActionButton>
        <ActionButton className="small" disabled={!tags.length} onClick={() => send('remove')}>Remove tags</ActionButton>
      </div>
    </div>
  );
}

function TagList({ tags }: { tags?: string[] }) {
  if (!tags?.length) return <span className="small muted">no tags yet</span>;
  return <span className="chips">{tags.map((t) => <span key={t} className="chip tag small">{t}</span>)}</span>;
}

function ImageLibrary({ state, known }: { state: any; known: string[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [group, setGroup] = useState('');
  // Only one preview is open at a time, so only one full image is ever loaded.
  const [preview, setPreview] = useState<string | null>(null);
  const toast = useToast();
  const nav = useNavigate();
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  // "Clear view" hides pictures imported before the clear. Nothing is deleted, new imports still show,
  // and ticked pictures stay so a selection in progress never disappears.
  const view = useClearView<any>('imports-images', state.data, (r) => r.created_at, (r) => sel.includes(r.id));
  const shown = view.visible.filter(inGroup(group));
  // A group that has just been emptied (its last item re-tagged) falls back to All.
  useEffect(() => { if (group && group !== UNTAGGED && !known.includes(group)) setGroup(''); }, [group, known]);
  return (
    <Card title="Image library" className="imports-lib" actions={(
      <>
        <ClearViewControls view={view} noun="pictures" />
        {sel.length > 0 && <>
        <input placeholder="Product title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: 220 }} />
        <ActionButton className="primary" onClick={async () => {
          const r = await api<any>('/references/products', { body: { referenceIds: sel, title: title || undefined } });
          toast('Product started. It will appear in Batch approval when it is ready.');
          setSel([]);
          setTitle('');
          state.reload();
          nav(`/products/${r.productId}`);
        }}>Make coloring product from {sel.length} selected</ActionButton>
        </>}
      </>
    )}>
      <Async state={state}>{(all: any[]) => all.length === 0 ? <Empty title="No images yet">Add some above.</Empty>
        : view.visible.length === 0 ? <Empty title="View cleared">Nothing was deleted. New pictures show up here as you import them, and "Show {view.hiddenCount} cleared pictures" above brings the rest back.</Empty> : (
        <>
          <TagFilter items={view.visible} value={group} onChange={setGroup} />
          <div className="spread" style={{ margin: '8px 0' }}>
            <p className="small muted" style={{ margin: 0 }}>Tick files to pick them, in the order you want the pages, or to tag them together. Press Preview to see one. {sel.length ? `${sel.length} picked.` : ''}</p>
            <span className="row">
              {shown.length > 0 && <button className="small" onClick={() => setSel([...sel, ...shown.map((r: any) => r.id).filter((id: string) => !sel.includes(id))])}>Tick all {shown.length} shown</button>}
              {sel.length > 0 && <button className="small" onClick={() => setSel([])}>Untick all</button>}
            </span>
          </div>
          {sel.length > 0 && <BulkTagger ids={sel} known={known} onDone={() => state.reload()} />}
          {shown.length === 0 ? <Empty title={group === UNTAGGED ? 'Everything is sorted' : 'Nothing in this group'}>Pick another group above.</Empty> : (
          <div className="ref-list" role="list">
            {shown.map((r: any) => {
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
                      <TagList tags={r.tags} />
                      {r.usedBy.length > 0 && <div className="small">In {r.usedBy.map((u: any, i: number) => <span key={u.id}>{i ? ', ' : ''}<Link to={`/products/${u.id}`}>{u.title}</Link></span>)}</div>}
                    </div>
                    <div className="row ref-actions">
                      <button className="small" aria-expanded={open} onClick={() => setPreview(open ? null : r.id)}>{open ? 'Hide preview' : 'Preview'}</button>
                      <EditItem item={r} known={known} onSaved={() => state.reload()} />
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
          )}
        </>
      )}</Async>
    </Card>
  );
}

/** Sends only what changed: tags added and tags taken off. */
async function saveTags(id: string, before: string[], after: string[]) {
  const add = after.filter((t) => !before.includes(t));
  const remove = before.filter((t) => !after.includes(t));
  if (add.length || remove.length) await api('/references/tags', { body: { ids: [id], add, remove } });
}

function EditItem({ item, known, onSaved }: { item: any; known: string[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState(item.source_tool);
  const [prompt, setPrompt] = useState(item.prompt);
  const [tags, setTags] = useState<string[]>(item.tags ?? []);
  if (!open) return <button className="small" onClick={() => { setTags(item.tags ?? []); setOpen(true); }}>Edit</button>;
  return (
    <div className="stack" style={{ width: '100%' }}>
      <ToolPicker value={tool} onChange={setTool} />
      <label className="f">Prompt<textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
      <div className="f"><span className="muted" style={{ fontSize: 13.5 }}>Tags</span><TagInput value={tags} onChange={setTags} known={known} /></div>
      <div className="row">
        <ActionButton className="small primary" onClick={async () => {
          await api(`/references/${item.id}`, { method: 'PATCH', body: { sourceTool: tool.trim(), prompt } });
          await saveTags(item.id, item.tags ?? [], tags);
          setOpen(false);
          onSaved();
        }}>Save</ActionButton>
        <button className="small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function TextTags({ item, known, onSaved }: { item: any; known: string[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(item.tags ?? []);
  if (!open) return <span className="row"><TagList tags={item.tags} /><button className="small" onClick={() => { setTags(item.tags ?? []); setOpen(true); }}>Edit</button></span>;
  return (
    <div className="stack" style={{ minWidth: 220 }}>
      <TagInput value={tags} onChange={setTags} known={known} />
      <div className="row">
        <ActionButton className="small primary" onClick={async () => { await saveTags(item.id, item.tags ?? [], tags); setOpen(false); onSaved(); }}>Save</ActionButton>
        <button className="small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function TextLibrary({ state, known }: { state: any; known: string[] }) {
  const [group, setGroup] = useState('');
  return (
    <Card title="Text examples">
      <Async state={state}>{(d: any[]) => d.length === 0 ? <Empty title="No text examples yet">Add titles, descriptions or tags you like above.</Empty> : (
        <>
          <TagFilter items={d} value={group} onChange={setGroup} />
          <table className="t">
            <thead><tr><th>Kind</th><th>Text</th><th>Made with</th><th>Tags</th><th>Use as example</th><th /></tr></thead>
            <tbody>{d.filter(inGroup(group)).map((r) => (
              <tr key={r.id}>
                <td>{FIELDS.find((f) => f.id === r.field)?.label ?? r.field}</td>
                <td style={{ whiteSpace: 'pre-wrap' }}>{r.body}</td>
                <td className="small muted">{r.source_tool || '—'}</td>
                <td><TextTags item={r} known={known} onSaved={() => state.reload()} /></td>
                <td><input type="checkbox" aria-label="Use as example" checked={!!r.use_as_example} onChange={async (e) => { await api(`/references/${r.id}`, { method: 'PATCH', body: { useAsExample: e.target.checked } }); state.reload(); }} /></td>
                <td><ActionButton className="small danger" confirm="Delete this example?" onClick={async () => { await api(`/references/${r.id}`, { method: 'DELETE' }); state.reload(); }}>Delete</ActionButton></td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}</Async>
    </Card>
  );
}
