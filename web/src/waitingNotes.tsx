// Review notes waiting for the AI to check them (the AI couldn't be reached when you wrote them), plus ones the
// AI refused later or that couldn't be used any more. Nothing happens to an item until its note passes.
import { api, useApi } from './api.ts';
import { ActionButton, Card, Pill } from './ui.tsx';
import { ago, label } from './format.ts';

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
  const waiting = list.filter((q) => q.status === 'waiting').length;
  return (
    <Card title={`Notes waiting on the AI${waiting ? ` (${waiting})` : ''}`}>
      <p className="small muted" style={{ marginTop: 0 }}>Every note is checked by the AI before anything happens. These were written while it couldn't be reached. It tries again every 60 seconds; until a note passes, its item stays as it was.</p>
      {list.map((q) => (
        <div key={q.id} className="spread" style={{ padding: '6px 0', borderTop: '1px solid var(--border)', gap: 10, alignItems: 'flex-start' }}>
          <div className="small" style={{ minWidth: 0 }}>
            <Pill value={q.status === 'waiting' ? 'pending' : 'bad'} text={q.status === 'waiting' ? 'Waiting' : q.status === 'refused' ? 'Refused by the AI' : 'Could not be used'} /> <b>{WHAT[q.kind] ?? label(q.kind)}</b>{q.title ? <> · {q.title}</> : null} · {ago(q.createdAt)}
            <div>“{q.text}”</div>
            {q.message && <div style={{ color: 'var(--bad)' }}>{q.message}</div>}
          </div>
          <ActionButton className="small" confirm={q.status === 'waiting' ? 'Cancel this note? Its action (reject, note, lesson) will not happen.' : undefined} onClick={async () => { await api(`/reason-queue/${q.id}`, { method: 'DELETE' }); st.reload(); }}>{q.status === 'waiting' ? 'Cancel' : 'Dismiss'}</ActionButton>
        </div>
      ))}
    </Card>
  );
}
