import { useState } from 'react';
import { Link } from 'react-router';
import { api, useApi, usePagedApi } from '../api.ts';
import { CompactList, CompactRow } from '../compact.tsx';
import { ActionButton, Async, Card, Empty, PageHead, Pill } from '../ui.tsx';
import { ago, label } from '../format.ts';
import { WaitingNotes, sentText } from '../waitingNotes.tsx';
import { useToast } from '../ui.tsx';

const KINDS: { id: string; text: string }[] = [
  { id: '', text: 'All notes' },
  { id: 'rejected', text: 'Rejected' },
  { id: 'revision_requested', text: 'Sent back' },
  { id: 'regenerate_requested', text: 'Regenerated' },
  { id: 'approved', text: 'Approved' },
  { id: 'warnings_accepted', text: 'Warnings accepted' },
  { id: 'note', text: 'Rework notes' },
];
const KIND_TEXT: Record<string, string> = { rejected: 'Rejected', revision_requested: 'Sent back for revision', regenerate_requested: 'Regenerated', approved: 'Approved', warnings_accepted: 'Accepted as-is', note: 'Rework note' };
const KIND_PILL: Record<string, string> = { rejected: 'rejected', revision_requested: 'revision_requested', regenerate_requested: 'regenerate_requested', approved: 'approved', warnings_accepted: 'passed_with_warnings', note: 'closed' };

export function AiNotes() {
  return (
    <div className="page">
      <PageHead title="Notes for the AI" sub="Every note you write in review is kept here. After every 10 new notes the AI reads all of them and writes the repeat problems below, which go into every AI prompt. You can edit, pin, delete or add your own." />
      <WaitingNotes />
      <Lessons />
      <AllNotes />
    </div>
  );
}

function Lessons() {
  const toast = useToast();
  const status = useApi<any>('/ai-notes/status', { poll: 10000 });
  const lessons = useApi<any[]>('/ai-lessons', { poll: 10000 });
  const [text, setText] = useState('');
  const reload = () => { status.reload(); lessons.reload(); };
  const s = status.data;
  return (
    <Card title="Repeat problems the AI keeps in mind" actions={
      <ActionButton className="primary" disabled={!s?.aiReady || s?.running || !s?.totalNotes} title={!s?.aiReady ? 'Needs an AI provider key (Settings → AI providers)' : !s?.totalNotes ? 'No notes yet' : ''} onClick={async () => { const r = await api('/ai-notes/digest', { body: {} }); reload(); return r; }} successText="Read your notes and updated the list">Read my notes now</ActionButton>
    }>
      {s && (
        <p className="small muted" style={{ marginTop: 0 }}>
          {s.running ? <><span className="spinner" /> The AI is reading your notes… </> : null}
          {s.totalNotes} note{s.totalNotes === 1 ? '' : 's'} in total · {s.newSinceLastRead} new since the last read · reads by itself every {s.every} new notes
          {s.lastRead ? <> · last read {ago(s.lastRead.at)} ({s.lastRead.notesRead} notes)</> : ' · not read yet'}
          {!s.aiReady && <> · <b>needs an AI key to read</b> (<Link to="/settings">Settings</Link>); your own lessons still go into prompts</>}
          {s.lastAttempt?.status === 'failed' && <span style={{ color: 'var(--bad)' }}> · last try failed: {s.lastAttempt.error}</span>}
        </p>
      )}
      <Async state={lessons}>{(list) => list.length === 0 ? <Empty title="No repeat problems yet">They appear after the AI reads your notes. You can also add one yourself below.</Empty> : (
        <CompactList total={list.length} shown={list.length} noun="lessons" height={420}>
          {list.map((l) => <LessonRow key={l.id} l={l} onChange={reload} />)}
        </CompactList>
      )}</Async>
      <div className="row" style={{ marginTop: 10 }}>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add your own rule, e.g. Keep checklist items under 8 words" maxLength={300} style={{ flex: 1 }} />
        <ActionButton disabled={text.trim().length < 3} onClick={async () => { const r = await api('/ai-lessons', { body: { text } }); toast(sentText(r, 'Added')); setText(''); reload(); }}>Add</ActionButton>
      </div>
    </Card>
  );
}

function LessonRow({ l, onChange }: { l: any; onChange: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(l.text);
  return (
    <CompactRow
      main={editing ? <input type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} style={{ width: '100%' }} /> : <span>{l.pinned && <b title="Pinned: kept when the AI re-reads">📌 </b>}{l.text}</span>}
      sub={[l.source === 'ai' ? `AI · noted ${l.times} time${l.times === 1 ? '' : 's'}` : 'Yours (the AI never replaces it)', `updated ${ago(l.updated_at)}`].join(' · ')}
      actions={editing ? <>
        <ActionButton className="small primary" onClick={async () => { const r = await api(`/ai-lessons/${l.id}`, { method: 'PATCH', body: { text } }); toast(sentText(r, 'Saved')); setEditing(false); onChange(); }}>Save</ActionButton>
        <button className="small" onClick={() => { setText(l.text); setEditing(false); }}>Cancel</button>
      </> : <>
        <button className="small" onClick={() => setEditing(true)}>Edit</button>
        <ActionButton className="small" onClick={async () => { await api(`/ai-lessons/${l.id}`, { method: 'PATCH', body: { pinned: !l.pinned } }); onChange(); }}>{l.pinned ? 'Unpin' : 'Pin'}</ActionButton>
        <ActionButton className="small danger" confirm="Delete this lesson? The AI may write it again if your notes keep saying it." onClick={async () => { await api(`/ai-lessons/${l.id}`, { method: 'DELETE' }); onChange(); }}>Delete</ActionButton>
      </>} />
  );
}

function AllNotes() {
  const [kind, setKind] = useState('');
  const st = usePagedApi<any[]>(`/ai-notes${kind ? `?kind=${kind}` : ''}`, { poll: 15000 });
  return (
    <Card title="Every note" actions={<div className="chips">{KINDS.map((k) => <button key={k.id} className={`chip${kind === k.id ? ' on' : ''}`} onClick={() => setKind(k.id)}>{k.text}</button>)}</div>}>
      <Async state={st}>{(list) => list.length === 0 ? <Empty title="No notes yet">Notes you write when you reject, send back, regenerate, approve or accept warnings show up here, and so do notes added on the Rework page.</Empty> : (
        <CompactList total={st.total} shown={list.length} onMore={st.more} noun="notes">
          {list.map((n) => (
            <CompactRow key={`${n.kind}:${n.id}`}
              main={<span>“{n.notes}”</span>}
              sub={<><Link to={`/products/${n.productId}`}>{n.title}</Link> v{n.versionNo} · {label(n.productType)} · {ago(n.at)}{n.warnings?.length ? ` · warnings: ${n.warnings.join('; ')}` : ''}</>}
              actions={<Pill value={KIND_PILL[n.kind]} text={KIND_TEXT[n.kind] ?? label(n.kind)} />} />
          ))}
        </CompactList>
      )}</Async>
    </Card>
  );
}
