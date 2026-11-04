import { useState, type FormEvent } from 'react';
import { api, errorText, useApi } from '../api.ts';

// HAPPY DAFFY milestone 2b and 2c: AI suggestions to click on, and a world the AI writes from a goal.
// Nothing here saves anything except the explicit SAVE WORLD button. With no AI provider the server says so.

export interface IdeaTask { title: string; description: string; characterId: string; taskType: string; difficulty: 'LOW' | 'MEDIUM' | 'HIGH'; estimatedEffort: number }
export interface IdeaWorld { name: string; description: string; milestones: string[] }
interface ProposedWorld { name: string; description: string; milestones: { name: string; tasks: IdeaTask[] }[] }
interface ProductTypeInfo { id: string; name: string; importOnly: boolean }

const CHARACTER_LABEL: Record<string, string> = { daf: 'DAF', ide: 'IDE', 'ai-chatbot': 'AI CHATBOT' };

function Thinking({ what }: { what: string }) {
  return <p className="fine center-text blink-slow" role="status">{what}</p>;
}

/** Click-to-use world ideas for the New World form. */
export function WorldIdeas({ onPick }: { onPick: (idea: IdeaWorld) => void }) {
  const [hint, setHint] = useState('');
  const [ideas, setIdeas] = useState<IdeaWorld[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ask = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setIdeas((await api<{ suggestions: IdeaWorld[] }>('/arcade/builder/suggest/worlds', { body: { hint: hint.trim() || undefined } })).suggestions);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="idea-box">
      <h3 className="form-title">NEED AN IDEA?</h3>
      <div className="idea-ask">
        <input data-nav value={hint} onChange={(e) => setHint(e.target.value)} maxLength={500} placeholder="Optional: a direction, e.g. planners for teachers" aria-label="Direction for ideas" />
        <button type="button" className="arc-btn small" data-nav disabled={busy} onClick={() => void ask()}>{busy ? 'THINKING...' : 'SUGGEST WORLDS'}</button>
      </div>
      {busy ? <Thinking what="The AI is thinking up worlds..." /> : null}
      {problem ? <p className="form-error" role="alert">{problem}</p> : null}
      {ideas && !busy ? (
        <ul className="idea-list">
          {ideas.map((i) => (
            <li key={i.name}>
              <button type="button" className="idea-chip" data-nav onClick={() => onPick(i)}>
                <span className="task-title">{i.name}</span>
                <span className="fine">{i.description}</span>
                <span className="task-tags"><span>{i.milestones.join(' → ')}</span></span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {ideas && !busy ? <p className="fine center-text">Click one to fill in the form below. You can still change anything before building.</p> : null}
    </div>
  );
}

/** Click-to-use task ideas for the Add Task form of one world. */
export function TaskIdeas({ worldId, milestoneId, onPick }: { worldId: string; milestoneId: string; onPick: (idea: IdeaTask) => void }) {
  const types = useApi<ProductTypeInfo[]>('/product-types').data ?? [];
  const [hint, setHint] = useState('');
  const [ideas, setIdeas] = useState<IdeaTask[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ask = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setIdeas((await api<{ suggestions: IdeaTask[] }>('/arcade/builder/suggest/tasks', { body: { worldId, milestoneId: milestoneId || undefined, hint: hint.trim() || undefined } })).suggestions);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const typeLabel = (id: string) => (id === 'custom' ? 'Custom' : types.find((t) => t.id === id)?.name ?? id);
  return (
    <div className="idea-box">
      <h3 className="form-title">NEED AN IDEA?</h3>
      <div className="idea-ask">
        <input data-nav value={hint} onChange={(e) => setHint(e.target.value)} maxLength={500} placeholder="Optional: a direction" aria-label="Direction for task ideas" />
        <button type="button" className="arc-btn small" data-nav disabled={busy} onClick={() => void ask()}>{busy ? 'THINKING...' : 'SUGGEST TASKS'}</button>
      </div>
      {busy ? <Thinking what="The AI is thinking up tasks..." /> : null}
      {problem ? <p className="form-error" role="alert">{problem}</p> : null}
      {ideas && !busy ? (
        <ul className="idea-list">
          {ideas.map((t) => (
            <li key={t.title}>
              <button type="button" className="idea-chip" data-nav onClick={() => onPick(t)}>
                <span className="task-title">{t.title}</span>
                <span className="fine">{t.description}</span>
                <span className="task-tags"><span>{CHARACTER_LABEL[t.characterId] ?? t.characterId}</span><span className={`diff-${t.difficulty.toLowerCase()}`}>{t.difficulty}</span><span>{typeLabel(t.taskType)}</span><span>~{t.estimatedEffort} pts</span></span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {ideas && !busy ? <p className="fine center-text">Click one to fill in the form below. Effort points are the AI's first guess; change them.</p> : null}
    </div>
  );
}

/** The factory writes a whole world from a goal and a few settings. The owner reviews it, trims it and saves it. */
export function WorldGenerator({ onSaved }: { onSaved: (worldId: string) => void }) {
  const types = (useApi<ProductTypeInfo[]>('/product-types').data ?? []).filter((t) => !t.importOnly);
  const [goal, setGoal] = useState('');
  const [milestones, setMilestones] = useState('3');
  const [perMilestone, setPerMilestone] = useState('4');
  const [difficulty, setDifficulty] = useState<'easy' | 'balanced' | 'hard'>('balanced');
  const [characterId, setCharacterId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [proposal, setProposal] = useState<ProposedWorld | null>(null);
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('generate');
    setProblem(null);
    try {
      const r = await api<{ proposal: ProposedWorld }>('/arcade/builder/generate', {
        body: { goal, milestones: Number(milestones), tasksPerMilestone: Number(perMilestone), difficulty, characterId: characterId || null, productTypes: picked.length ? picked : undefined },
      });
      setProposal(r.proposal);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    if (!proposal) return;
    setBusy('save');
    setProblem(null);
    try {
      const r = await api<{ id: string }>('/arcade/builder/worlds/from-proposal', { body: proposal });
      setProposal(null);
      setGoal('');
      onSaved(r.id);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  const typeLabel = (id: string) => (id === 'custom' ? 'Custom' : types.find((t) => t.id === id)?.name ?? id);
  const dropTask = (mi: number, ti: number) => setProposal((p) => p && { ...p, milestones: p.milestones.map((m, i) => (i === mi ? { ...m, tasks: m.tasks.filter((_, j) => j !== ti) } : m)) });
  const dropMilestone = (mi: number) => setProposal((p) => p && { ...p, milestones: p.milestones.filter((_, i) => i !== mi) });
  const emptyProposal = !!proposal && proposal.milestones.every((m) => m.tasks.length === 0);

  if (proposal) {
    return (
      <div className="arc-form">
        <h3 className="form-title">REVIEW THE AI'S WORLD</h3>
        <label>Name<input data-nav value={proposal.name} maxLength={80} onChange={(e) => setProposal({ ...proposal, name: e.target.value })} /></label>
        <p className="fine">{proposal.description}</p>
        {proposal.milestones.map((m, mi) => (
          <div key={`${m.name}-${mi}`} className="milestone-block">
            <div className="milestone-head">
              <span className="task-title">{mi + 1}. {m.name}</span>
              <button type="button" className="arc-btn small" data-nav onClick={() => dropMilestone(mi)} aria-label={`Remove milestone ${m.name}`}>REMOVE</button>
            </div>
            {m.tasks.map((t, ti) => (
              <div key={`${t.title}-${ti}`} className="task-row">
                <div className="task-main">
                  <span className="task-title">{t.title}</span>
                  <span className="task-tags"><span>{CHARACTER_LABEL[t.characterId] ?? t.characterId}</span><span className={`diff-${t.difficulty.toLowerCase()}`}>{t.difficulty}</span><span>{typeLabel(t.taskType)}</span><span>~{t.estimatedEffort} pts</span></span>
                </div>
                <button type="button" className="arc-btn small" data-nav onClick={() => dropTask(mi, ti)} aria-label={`Remove task ${t.title}`}>DEL</button>
              </div>
            ))}
          </div>
        ))}
        <p className="fine">Nothing is saved yet. Remove what you don't want, then save. Effort points are the AI's first guess; you can change every task, effort included, after saving.</p>
        {problem ? <p className="form-error" role="alert">{problem}</p> : null}
        <div className="row-actions">
          <button type="button" className="arc-btn" data-nav disabled={!!busy} onClick={() => setProposal(null)}>DISCARD</button>
          <button type="button" className="arc-btn primary" data-nav data-autofocus disabled={!!busy || emptyProposal || !proposal.name.trim()} onClick={() => void save()}>{busy === 'save' ? 'SAVING...' : 'SAVE WORLD'}</button>
        </div>
      </div>
    );
  }

  return (
    <form className="arc-form" onSubmit={generate}>
      <h3 className="form-title">LET THE AI BUILD A WORLD</h3>
      <label>What is this world for?<textarea data-nav value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} maxLength={1000} required placeholder="e.g. Launch a shop selling mandala coloring packs" /></label>
      <div className="form-grid">
        <label>Milestones<input data-nav type="number" min="1" max="8" value={milestones} onChange={(e) => setMilestones(e.target.value)} required /></label>
        <label>Tasks in each<input data-nav type="number" min="1" max="10" value={perMilestone} onChange={(e) => setPerMilestone(e.target.value)} required /></label>
        <label>Difficulty
          <select data-nav value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
            <option value="easy">Mostly easy</option><option value="balanced">A spread</option><option value="hard">Mostly hard</option>
          </select>
        </label>
        <label>Give tasks to
          <select data-nav value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
            <option value="">Whoever suits each task</option>
            {Object.entries(CHARACTER_LABEL).map(([id, label]) => <option key={id} value={id}>{label} only</option>)}
          </select>
        </label>
      </div>
      <details className="type-pick">
        <summary data-nav>Product types: {picked.length ? `${picked.length} chosen` : 'any'}</summary>
        <div className="type-grid">
          {types.map((t) => (
            <label key={t.id} className="check">
              <input type="checkbox" checked={picked.includes(t.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))} /> {t.name}
            </label>
          ))}
        </div>
        <p className="fine">Pick none to allow any product type, plus Custom tasks. Pick some and the AI uses only those.</p>
      </details>
      {busy === 'generate' ? <Thinking what="The AI is writing your world. This can take a minute..." /> : null}
      {problem ? <p className="form-error" role="alert">{problem}</p> : null}
      <button type="submit" className="arc-btn primary" data-nav disabled={!!busy}>{busy === 'generate' ? 'WRITING...' : 'WRITE MY WORLD'}</button>
    </form>
  );
}
