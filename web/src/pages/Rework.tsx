import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api, useApi } from '../api.ts';
import { CompactList, CompactRow, PreviewButton, PreviewPane, ShowDone, usePreview } from '../compact.tsx';
import { ActionButton, Async, Card, Empty, PageHead, Pill } from '../ui.tsx';
import { ago, label } from '../format.ts';

type Item = {
  versionId: string; productId: string; title: string; productType: string; category: string | null; versionNo: number; versions: number; current: boolean;
  status: string; reason: string; at: string; notes: string; marketplaces: string[]; checks: string[]; severity: 'hard' | 'warning' | null; error: string | null; thumb: string | null; fixedAt: string | null;
  myNotes: { id: string; notes: string; at: string }[];
};

// Every sort uses something the app already records. Newest first is the default.
const SORTS: { id: string; text: string; key: (i: Item) => string | number }[] = [
  { id: 'date', text: 'Newest first', key: (i) => i.at },
  { id: 'type', text: 'Product type', key: (i) => i.productType },
  { id: 'category', text: 'Category', key: (i) => i.category ?? '~' },
  { id: 'marketplace', text: 'Marketplace', key: (i) => i.marketplaces.join(',') || '~' },
  { id: 'check', text: 'QA check flagged', key: (i) => i.checks.join(',') || '~' },
  { id: 'severity', text: 'Failure before warning', key: (i) => (i.severity === 'hard' ? 0 : i.severity === 'warning' ? 1 : 2) },
  { id: 'versions', text: 'Most versions', key: (i) => i.versions },
  { id: 'notes', text: 'Has your notes', key: (i) => (i.notes ? 0 : 1) },
];

function sorted(items: Item[], by: string): Item[] {
  const s = SORTS.find((x) => x.id === by) ?? SORTS[0];
  const desc = by === 'date' || by === 'versions';
  return [...items].sort((a, b) => {
    const x = s.key(a), y = s.key(b);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return (desc ? -c : c) || b.at.localeCompare(a.at);
  });
}

const REASON: Record<string, string> = { failed: 'Production failed', qa_failed: 'Failed QA', rejected: 'Rejected', revision_requested: 'Returned for revision', regenerate_requested: 'Regenerated' };

export function Rework() {
  const [showFixed, setShowFixed] = useState(false);
  const st = useApi<{ machine: Item[]; yours: Item[] }>(`/rework${showFixed ? '?showFixed=1' : ''}`, { poll: 10000 });
  return (
    <div className="page">
      <PageHead title="Rework" sub="Everything that was rejected or failed, in one place to work through. An item stays here until you press Mark fixed. Nothing is deleted." />
      <div className="row" style={{ marginBottom: 12 }}><ShowDone value={showFixed} onChange={setShowFixed} text="Show items already marked fixed" /></div>
      <Async state={st}>{(d) => (
        <>
          <Section title="Failed by the machine" help="Production that failed, and versions that failed a hard QA check." items={d.machine} reload={st.reload} empty="Nothing failed in the factory." />
          <Section title="Rejected by you" help="Things you rejected, returned for revision or regenerated in Batch approval, older versions included." items={d.yours} reload={st.reload} empty="Nothing rejected." />
        </>
      )}</Async>
    </div>
  );
}

function Section({ title, help, items, reload, empty }: { title: string; help: string; items: Item[]; reload: () => void; empty: string }) {
  const [by, setBy] = useState('date');
  const [shown, setShown] = useState(50);
  const list = useMemo(() => sorted(items, by), [items, by]);
  const preview = usePreview();
  const [noteFor, setNoteFor] = useState<string | null>(null);
  return (
    <Card className="rework-section" title={<>{title} <span className="small muted">({items.length})</span></>} actions={<select value={by} onChange={(e) => setBy(e.target.value)} aria-label={`Sort ${title}`}>{SORTS.map((s) => <option key={s.id} value={s.id}>{s.text}</option>)}</select>}>
      <p className="small muted" style={{ marginTop: 0 }}>{help}</p>
      {items.length === 0 ? <Empty title={empty} /> : (
        <CompactList total={list.length} shown={Math.min(shown, list.length)} onMore={() => setShown((n) => n + 50)} noun="items">
          {list.slice(0, shown).map((i) => (
            <CompactRow key={i.versionId} className={i.fixedAt ? 'done' : ''}
              main={<><Link to={`/products/${i.productId}`}><b>{i.title}</b></Link> <span className="small muted">v{i.versionNo} of {i.versions}{i.current ? '' : ' (older version)'}</span></>}
              sub={[REASON[i.reason] ?? label(i.reason), ago(i.at), label(i.productType), i.category, i.marketplaces.map(label).join(', '), i.checks.length ? `QA: ${i.checks.map(label).join(', ')}` : null].filter(Boolean).join(' · ')}
              actions={<>
                {i.severity && <Pill value={i.severity === 'hard' ? 'failed' : 'passed_with_warnings'} text={i.severity === 'hard' ? 'Hard failure' : 'Warnings'} />}
                <button className="small" aria-expanded={noteFor === i.versionId} onClick={() => setNoteFor(noteFor === i.versionId ? null : i.versionId)}>{noteFor === i.versionId ? 'Cancel note' : 'Add note'}</button>
                <PreviewButton open={preview.open === i.versionId} disabled={!i.thumb} onClick={() => preview.toggle(i.versionId)} />
                <Link className="btn small" to={`/products/${i.productId}`}>Open</Link>
                {i.fixedAt
                  ? <ActionButton className="small" onClick={async () => { await api(`/rework/${i.versionId}/fixed`, { method: 'DELETE' }); reload(); }}>Put back</ActionButton>
                  : <ActionButton className="small primary" onClick={async () => { await api(`/rework/${i.versionId}/fixed`, { body: {} }); reload(); }} successText="Marked fixed">Mark fixed</ActionButton>}
              </>}>
              {(i.notes || i.error) && <div className="small" style={{ marginTop: 4 }}>{i.notes ? <>Your notes: “{i.notes}”</> : <span style={{ color: 'var(--bad)' }}>{i.error}</span>}</div>}
              {i.myNotes.map((n) => <div key={n.id} className="small" style={{ marginTop: 2 }}>Note {ago(n.at)}: “{n.notes}”</div>)}
              {noteFor === i.versionId && <AddNote versionId={i.versionId} onSaved={() => { setNoteFor(null); reload(); }} />}
              {i.fixedAt && <div className="small muted">Marked fixed {ago(i.fixedAt)}</div>}
              {preview.open === i.versionId && <PreviewPane assets={[i.thumb]} alt={i.title} />}
            </CompactRow>
          ))}
        </CompactList>
      )}
    </Card>
  );
}

/** A note for the AI about this item. It goes into the notes the AI reads for repeat problems (Notes for the AI page). */
function AddNote({ versionId, onSaved }: { versionId: string; onSaved: () => void }) {
  const [text, setText] = useState('');
  return (
    <div className="stack" style={{ marginTop: 6, gap: 6 }}>
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What's wrong, or what you'd like next time. Be specific: the AI reads all your notes for repeat problems." maxLength={4000} />
      <div className="row"><ActionButton className="small primary" disabled={text.trim().length < 3} onClick={async () => { await api(`/rework/${versionId}/note`, { body: { notes: text } }); onSaved(); }} successText="Note saved">Save note</ActionButton></div>
    </div>
  );
}
