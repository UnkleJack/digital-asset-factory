// Review notes that haven't been used yet:
//  - waiting: written while the AI couldn't be reached; checked again every 60 seconds.
//  - refused: the AI said the reason wasn't good enough. These can't just be dismissed (owner, 2026-11-10):
//    rewrite it and send it again, or drop its action with a reason (which the AI checks too).
//  - failed: the note passed but what it was for changed meanwhile (e.g. a newer version). Clear it.
// Nothing happens to an item until its note passes.
import { useState } from 'react';
import { api, useApi } from './api.ts';
import { ActionButton, Card, Pill, useToast } from './ui.tsx';
import { ago, label } from './format.ts';
import { ReasonPicks } from './reasons.tsx';

type Queued = { id: string; kind: string; text: string; title: string | null; status: 'waiting' | 'refused' | 'failed'; attempts: number; message: string | null; createdAt: string; nextTryAt: string };

const WHAT: Record<string, string> = { rejected: 'Reject', revision_requested: 'Return for revision', regenerate_requested: 'Regenerate', note: 'Rework note', lesson: 'Lesson' };

/** The message to show after sending a note: the server either used it or queued it. */
export function sentText(r: { queued?: boolean; message?: string } | undefined, done: string): string {
  return r?.queued ? r.message ?? 'Waiting for the AI to check your note.' : done;
}

export function WaitingNotes() {
  const st = useApi<Queued[]>('/reason-queue', { poll: 15000 });
  const list = st.data ?? [];
  if (!list.length) return null;
  const refused = list.filter((q) => q.status === 'refused').length;
  const waiting = list.filter((q) => q.status === 'waiting').length;
  const title = refused ? `Needs a better reason (${refused})` : `Notes waiting on the AI${waiting ? ` (${waiting})` : ''}`;
  return (
    <Card title={title}>
      <p className="small muted" style={{ marginTop: 0 }}>
        Every note is checked by the AI before anything happens, and the item stays as it was until its note passes.
        {refused ? ' A refused note has to be dealt with: rewrite it and send it again, or drop it and say why.' : ''}
        {waiting ? ' Waiting notes were written while the AI couldn’t be reached; it tries again every 60 seconds.' : ''}
      </p>
      {list.map((q) => <Row key={q.id} q={q} reload={st.reload} />)}
    </Card>
  );
}

function Row({ q, reload }: { q: Queued; reload: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<null | 'rewrite' | 'drop'>(q.status === 'refused' ? 'rewrite' : null);
  const [text, setText] = useState(q.text);
  const [reason, setReason] = useState('');
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <div className="small">
        <Pill value={q.status === 'waiting' ? 'pending' : 'bad'} text={q.status === 'waiting' ? 'Waiting' : q.status === 'refused' ? 'Refused by the AI' : 'Could not be used'} /> <b>{WHAT[q.kind] ?? label(q.kind)}</b>{q.title ? <> · {q.title}</> : null} · {ago(q.createdAt)}
        {q.status !== 'refused' && <div>“{q.text}”</div>}
        {q.message && <div style={{ color: 'var(--bad)' }}>{q.message}</div>}
      </div>

      {mode === 'rewrite' && (
        <div className="stack" style={{ marginTop: 6, gap: 6 }}>
          <ReasonPicks notes={text} setNotes={setText} />
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} aria-label="Rewrite the reason" />
          <div className="row">
            <ActionButton className="small primary" disabled={!text.trim() || text.trim() === q.text.trim()} title={text.trim() === q.text.trim() ? 'Change the wording first' : ''} onClick={async () => {
              const r = await api<{ status: string; message?: string }>(`/reason-queue/${q.id}/resend`, { body: { text } });
              toast(r.status === 'applied' ? 'Accepted and done' : r.message ?? 'Waiting for the AI');
              reload();
            }}>Send again</ActionButton>
            <button className="small" onClick={() => setMode('drop')}>Drop it instead…</button>
          </div>
        </div>
      )}

      {mode === 'drop' && (
        <div className="stack" style={{ marginTop: 6, gap: 6 }}>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="Why are you dropping this instead of fixing it? e.g. &quot;I approved a newer version that fixed the margins&quot;" aria-label="Why drop it" />
          <div className="row">
            <ActionButton className="small danger" disabled={!reason.trim()} onClick={async () => { await api(`/reason-queue/${q.id}/drop`, { body: { reason } }); toast('Dropped'); reload(); }}>Drop it</ActionButton>
            <button className="small" onClick={() => setMode(q.status === 'refused' ? 'rewrite' : null)}>Back</button>
          </div>
        </div>
      )}

      {!mode && (
        <div className="row" style={{ marginTop: 6 }}>
          {q.status === 'waiting' && <button className="small" onClick={() => setMode('drop')}>Drop it…</button>}
          {q.status === 'failed' && <ActionButton className="small" onClick={async () => { await api(`/reason-queue/${q.id}`, { method: 'DELETE' }); reload(); }}>OK, clear it</ActionButton>}
        </div>
      )}
    </div>
  );
}
