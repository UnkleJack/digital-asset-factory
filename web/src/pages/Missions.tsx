import { useState } from 'react';
import { Link } from 'react-router';
import { api, useApi } from '../api.ts';
import { GuideText } from '../arcade/Missions.tsx';
import { ActionButton, Async, Card, Modal, PageHead } from '../ui.tsx';

// Missions on the back-office side (owner, 2026-11-09: "both sides"). Same list and same done marks as
// the arcade's MISSIONS tab; only the look differs.

interface Mission {
  id: string; number: number; title: string; route: string; done: boolean; completedAt: string | null;
  hasInstructions: boolean; locked: boolean; needs: string[];
}
interface Instructions { id: string; title: string; text: string; source: string }

export function MissionsPage() {
  const state = useApi<{ missions: Mission[]; guideFound: boolean }>('/arcade/missions');
  const [open, setOpen] = useState<Mission | null>(null);
  return (
    <div className="page">
      <PageHead
        title="Missions"
        sub="Learn the whole Foundry, one screen at a time. There's one mission per chapter of the walkthrough guide, plus locked ones for things still being built. Progress is shared with the arcade's MISSIONS tab."
        actions={<Link className="btn" to="/arcade">Open in the arcade</Link>}
      />
      <Async state={state}>{(d) => {
        const done = d.missions.filter((m) => m.done).length;
        return (
          <Card title={`${done} of ${d.missions.length} done`}>
            {!d.guideFound && <p className="small" style={{ color: 'var(--bad)' }}>The walkthrough guide isn't in this copy, so instructions are unavailable.</p>}
            <table className="t">
              <thead><tr><th>#</th><th>Mission</th><th>Status</th><th /></tr></thead>
              <tbody>
                {d.missions.map((m) => (
                  <tr key={m.id}>
                    <td className="muted">{String(m.number).padStart(2, '0')}</td>
                    <td>
                      {m.title}
                      {m.needs.length > 0 && <div className="small muted">Needs: {m.needs.join(', ')}</div>}
                    </td>
                    <td>{m.locked ? <span className="pill warn">Locked</span> : m.done ? <span className="pill ok">Done</span> : <span className="pill">To do</span>}</td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="small" disabled={!m.hasInstructions} title={m.hasInstructions ? 'Read this chapter of the guide' : 'This chapter is missing from the guide'} onClick={() => setOpen(m)}>Instructions</button>
                        {!m.locked && <Link className="btn small" to={m.route}>Go</Link>}
                        {!m.locked && (
                          <ActionButton className="small" onClick={async () => { await api(`/arcade/missions/${m.id}/done`, { method: m.done ? 'DELETE' : 'PUT' }); state.reload(); }}>
                            {m.done ? 'Undo' : 'Mark done'}
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      }}</Async>
      {open && <InstructionsModal mission={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function InstructionsModal({ mission, onClose }: { mission: Mission; onClose: () => void }) {
  const state = useApi<Instructions>(`/arcade/missions/${mission.id}/instructions`);
  return (
    <Modal title={`Mission ${String(mission.number).padStart(2, '0')}: ${mission.title}`} onClose={onClose} wide>
      <div className="guide-text office" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
        <Async state={state}>{(d) => <GuideText text={d.text} />}</Async>
      </div>
      {state.data && <p className="small muted">From {state.data.source}.</p>}
    </Modal>
  );
}
