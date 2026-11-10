import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errorText, useApi } from '../api.ts';

// HAPPY DAFFY milestone 2b and 2c, plus the owner's 2026-11-05 additions:
// - AI world ideas: fresh ones, ones that build on what exists, and ones on unexplored ground.
// - A world the AI writes from a goal. It runs as a draft: leaving the page loses nothing.
// - TIDY MY NOTES: a brain dump comes back structured, with questions kept apart; the original stays as written.
// Only the explicit SAVE WORLD button creates a world. With no AI provider the server says so at once.

export interface IdeaTask { title: string; description: string; characterId: string; taskType: string; difficulty: 'LOW' | 'MEDIUM' | 'HIGH'; estimatedEffort: number }
export interface IdeaWorld { name: string; description: string; milestones: string[] }
interface ProposedWorld { name: string; description: string; milestones: { name: string; tasks: IdeaTask[] }[] }
interface ProductTypeInfo { id: string; name: string; importOnly: boolean }
interface TidyNotes {
  title: string; goal: string; scope: string[];
  milestones: { name: string; tasks: { title: string; characterId: string; taskType: string }[] }[];
  constraints: string[]; doneWhen: string[]; questions: string[];
}
interface Draft<R, Q> { id: string; kind: 'world' | 'notes'; status: 'writing' | 'ready' | 'failed'; request: Q; result: R | null; error: string | null; model: string | null; createdAt: string }
/** How the AI sized a world it wrote (settings A and B, 2026-11-10). Older drafts have none. */
interface WorldSizing { budget: number | null; historyTasks: number }
type GeneratedWorld = ProposedWorld & { sizing?: WorldSizing };
type WorldDraft = Draft<GeneratedWorld, { goal: string }>;
type NotesDraft = Draft<TidyNotes, { notes: string }>;

/** Tidied notes handed to the world writer as its goal. `n` changes on every hand-off so the same text can be sent twice. */
export interface GoalSeed { text: string; milestones: number; n: number }

const CHARACTER_LABEL: Record<string, string> = { daf: 'DAF', ide: 'IDE', 'ai-chatbot': 'AI CHATBOT' };
const GOAL_MAX = 4000;
const NOTES_MAX = 20000;
const DRAFT_POLL_MS = 3000;

function Thinking({ what }: { what: string }) {
  return <p className="fine center-text blink-slow" role="status">{what}</p>;
}

function useProductTypes() {
  return useApi<ProductTypeInfo[]>('/product-types').data ?? [];
}

const shortText = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The drafts of one kind, polled while any is still being written. */
function useDrafts<D extends Draft<unknown, unknown>>(kind: 'world' | 'notes') {
  const r = useApi<{ drafts: D[] }>(`/arcade/builder/drafts?kind=${kind}`, { poll: DRAFT_POLL_MS });
  return { ...r, drafts: r.data?.drafts ?? [] };
}

function DraftList<D extends Draft<unknown, unknown>>({ drafts, label, openId, onOpen, onDiscard }: { drafts: D[]; label: (d: D) => string; openId: string | null; onOpen: (d: D) => void; onDiscard: (d: D) => void }) {
  if (!drafts.length) return null;
  return (
    <div className="draft-box">
      <p className="zone-title small">YOUR AI DRAFTS</p>
      <ul className="draft-list">
        {drafts.map((d) => (
          <li key={d.id} className={`draft-row${d.id === openId ? ' open' : ''}`}>
            <div className="task-main">
              <span className="task-title">{shortText(label(d))}</span>
              <span className="task-tags">
                <span className={`draft-state ${d.status}`}>{d.status === 'writing' ? 'WRITING…' : d.status === 'ready' ? 'READY' : 'FAILED'}</span>
                <span>{when(d.createdAt)}</span>
                {d.model ? <span>{d.model}</span> : null}
              </span>
              {d.status === 'failed' && d.error ? <span className="task-desc">{d.error}</span> : null}
            </div>
            <span className="task-controls">
              {d.status === 'ready' ? <button type="button" className="arc-btn small" data-nav onClick={() => onOpen(d)}>REVIEW</button> : null}
              <button type="button" className="arc-btn small" data-nav aria-label={`Discard draft: ${label(d)}`} onClick={() => onDiscard(d)}>{d.status === 'writing' ? 'CANCEL' : 'DISCARD'}</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- World ideas ----------

type IdeaMode = 'fresh' | 'build-on' | 'unexplored';
const MODE_BUTTON: Record<IdeaMode, string> = { fresh: 'SUGGEST WORLDS', 'build-on': 'BUILD ON WHAT I HAVE', unexplored: 'SHOW ME UNEXPLORED GROUND' };
const MODE_THINKING: Record<IdeaMode, string> = {
  fresh: 'The AI is thinking up worlds...',
  'build-on': 'The AI is reading your worlds and thinking up what comes next...',
  unexplored: 'The AI is looking for product types and work you have not touched yet...',
};

/** Click-to-use world ideas for the New World form. */
export function WorldIdeas({ onPick }: { onPick: (idea: IdeaWorld) => void }) {
  const [hint, setHint] = useState('');
  const [ideas, setIdeas] = useState<IdeaWorld[] | null>(null);
  const [busy, setBusy] = useState<IdeaMode | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const ask = async (mode: IdeaMode) => {
    setBusy(mode);
    setProblem(null);
    try {
      setIdeas((await api<{ suggestions: IdeaWorld[] }>('/arcade/builder/suggest/worlds', { body: { hint: hint.trim() || undefined, mode } })).suggestions);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="idea-box">
      <h3 className="form-title">NEED AN IDEA?</h3>
      <input data-nav value={hint} onChange={(e) => setHint(e.target.value)} maxLength={500} placeholder="Optional: a direction, e.g. planners for teachers" aria-label="Direction for ideas" />
      <div className="idea-modes">
        {(Object.keys(MODE_BUTTON) as IdeaMode[]).map((m) => (
          <button key={m} type="button" className="arc-btn small" data-nav disabled={!!busy} onClick={() => void ask(m)}>{busy === m ? 'THINKING...' : MODE_BUTTON[m]}</button>
        ))}
      </div>
      <p className="fine">BUILD ON WHAT I HAVE reads your worlds, products and any recorded sales. UNEXPLORED GROUND looks for product types and characters you have not used yet.</p>
      {busy ? <Thinking what={MODE_THINKING[busy]} /> : null}
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
  const types = useProductTypes();
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

// ---------- LET THE AI BUILD A WORLD ----------

/** The factory writes a whole world from a goal and a few settings, as a draft. The owner reviews it, trims it and saves it. */
export function WorldGenerator({ onSaved, seed }: { onSaved: (worldId: string) => void; seed?: GoalSeed | null }) {
  const types = useProductTypes().filter((t) => !t.importOnly);
  const { drafts, reload } = useDrafts<WorldDraft>('world');
  const [goal, setGoal] = useState('');
  const [milestones, setMilestones] = useState('3');
  const [perMilestone, setPerMilestone] = useState('4');
  const [difficulty, setDifficulty] = useState<'easy' | 'balanced' | 'hard'>('balanced');
  const [characterId, setCharacterId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [budget, setBudget] = useState('');
  const [useHistory, setUseHistory] = useState(true);
  const [proposal, setProposal] = useState<GeneratedWorld | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const goalRef = useRef<HTMLTextAreaElement>(null);

  // Tidied notes handed over from TIDY MY NOTES.
  useEffect(() => {
    if (!seed) return;
    setGoal(seed.text.slice(0, GOAL_MAX));
    if (seed.milestones > 0) setMilestones(String(Math.min(8, seed.milestones)));
    setProposal(null);
    setDraftId(null);
    goalRef.current?.scrollIntoView({ block: 'center' });
    goalRef.current?.focus({ preventScroll: true });
  }, [seed]);

  // The draft this page started: open it as soon as the AI finishes, if the owner is still here.
  useEffect(() => {
    if (!waitingFor) return;
    const d = drafts.find((x) => x.id === waitingFor);
    if (!d || d.status === 'writing') return;
    setWaitingFor(null);
    if (d.status === 'ready' && d.result) {
      setProposal(d.result);
      setDraftId(d.id);
    } else {
      setProblem(d.error ?? 'The AI could not write this world. Try again.');
    }
  }, [drafts, waitingFor]);

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('generate');
    setProblem(null);
    try {
      const r = await api<{ draft: WorldDraft }>('/arcade/builder/generate', {
        body: { goal, milestones: Number(milestones), tasksPerMilestone: Number(perMilestone), difficulty, characterId: characterId || null, productTypes: picked.length ? picked : undefined, effortBudget: budget.trim() ? Number(budget) : null, useHistory },
      });
      setWaitingFor(r.draft.id);
      await reload();
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  const discard = async (id: string) => {
    setProblem(null);
    try {
      await api(`/arcade/builder/drafts/${id}`, { method: 'DELETE' });
    } catch (err) {
      setProblem(errorText(err));
    }
    if (id === draftId) {
      setProposal(null);
      setDraftId(null);
    }
    if (id === waitingFor) setWaitingFor(null);
    await reload();
  };
  const save = async () => {
    if (!proposal) return;
    setBusy('save');
    setProblem(null);
    try {
      const r = await api<{ id: string }>('/arcade/builder/worlds/from-proposal', { body: { ...proposal, draftId: draftId ?? undefined } });
      setProposal(null);
      setDraftId(null);
      setGoal('');
      await reload();
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
  const totalEffort = proposal ? proposal.milestones.reduce((n, m) => n + m.tasks.reduce((k, t) => k + t.estimatedEffort, 0), 0) : 0;
  const sizing = proposal?.sizing;
  const draftList = (
    <DraftList
      drafts={drafts}
      label={(d) => d.result?.name ?? d.request.goal}
      openId={draftId}
      onOpen={(d) => { setProposal(d.result); setDraftId(d.id); setProblem(null); }}
      onDiscard={(d) => void discard(d.id)}
    />
  );

  if (proposal) {
    return (
      <div className="arc-form">
        <h3 className="form-title">REVIEW THE AI'S WORLD</h3>
        <label>Name<input data-nav value={proposal.name} maxLength={80} onChange={(e) => setProposal({ ...proposal, name: e.target.value })} /></label>
        <p className="fine">{proposal.description}</p>
        <p className="effort-total" data-testid="effort-total">
          TOTAL EFFORT: {totalEffort} pts
          {sizing?.budget ? <> of a {sizing.budget} pt budget{totalEffort > sizing.budget ? <span className="over"> ({totalEffort - sizing.budget} over)</span> : totalEffort < sizing.budget ? <> ({sizing.budget - totalEffort} under)</> : null}</> : null}
        </p>
        {sizing ? (
          <p className="fine">{sizing.historyTasks > 0 ? `Effort guesses follow how you sized your ${sizing.historyTasks} finished task${sizing.historyTasks === 1 ? '' : 's'}.` : 'You have no finished tasks yet, so the effort numbers are the AI\'s own guess.'}</p>
        ) : null}
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
        <p className="fine">Nothing is saved as a world yet. Remove what you don't want, then save. Your removals here are not kept if you close this; the AI's full draft stays in your drafts until you save or discard it. Effort points are the AI's first guess; you can change every task after saving.</p>
        {problem ? <p className="form-error" role="alert">{problem}</p> : null}
        <div className="row-actions">
          <button type="button" className="arc-btn" data-nav disabled={!!busy} onClick={() => { setProposal(null); setDraftId(null); }}>CLOSE</button>
          {draftId ? <button type="button" className="arc-btn" data-nav disabled={!!busy} onClick={() => void discard(draftId)}>DISCARD DRAFT</button> : null}
          <button type="button" className="arc-btn primary" data-nav data-autofocus disabled={!!busy || emptyProposal || !proposal.name.trim()} onClick={() => void save()}>{busy === 'save' ? 'SAVING...' : 'SAVE WORLD'}</button>
        </div>
      </div>
    );
  }

  return (
    <form className="arc-form" onSubmit={generate}>
      <h3 className="form-title">LET THE AI BUILD A WORLD</h3>
      <label>What is this world for?<textarea ref={goalRef} data-nav value={goal} onChange={(e) => setGoal(e.target.value)} rows={seed ? 8 : 2} maxLength={GOAL_MAX} required placeholder="e.g. Launch a shop selling mandala coloring packs" /></label>
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
        <label>Effort budget (pts)<input data-nav type="number" min="1" max="500" step="1" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="none" /></label>
      </div>
      <p className="fine">With a budget, the AI aims for that many effort points in total, and the milestone and task numbers become the most it can use. Leave it empty for exact counts.</p>
      <label className="check"><input type="checkbox" data-nav checked={useHistory} onChange={(e) => setUseHistory(e.target.checked)} /> Base effort guesses on how I sized my finished tasks</label>
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
      {waitingFor ? <Thinking what="The AI is writing your world. This can take a minute or two. You can leave this page: the draft waits for you here." /> : null}
      {problem ? <p className="form-error" role="alert">{problem}</p> : null}
      <button type="submit" className="arc-btn primary" data-nav disabled={!!busy}>{busy === 'generate' ? 'SENDING...' : 'WRITE MY WORLD'}</button>
      {draftList}
    </form>
  );
}

// ---------- TIDY MY NOTES ----------

/** The tidied notes as one block of text, to use as the world writer's goal. Open questions stay out: the owner answers them first. */
export function notesAsGoal(t: TidyNotes): string {
  const parts = [
    `${t.title}: ${t.goal}`,
    t.scope.length ? `Scope: ${t.scope.join('; ')}` : '',
    t.milestones.length ? `Milestones: ${t.milestones.map((m, i) => `${i + 1}. ${m.name}${m.tasks.length ? ` (${m.tasks.map((x) => x.title).join(', ')})` : ''}`).join('; ')}` : '',
    t.constraints.length ? `Must and must-not: ${t.constraints.join('; ')}` : '',
    t.doneWhen.length ? `Done when: ${t.doneWhen.join('; ')}` : '',
  ];
  return parts.filter(Boolean).join('\n').slice(0, GOAL_MAX);
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="tidy-section">
      <p className="zone-title small">{title}</p>
      <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

/** A brain dump in, the same ideas back in a fixed structure, with questions kept apart. Nothing replaces the original. */
export function TidyNotesPanel({ onUse }: { onUse: (seed: GoalSeed) => void }) {
  const types = useProductTypes();
  const { drafts, reload } = useDrafts<NotesDraft>('notes');
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState<NotesDraft | null>(null);
  const [goalText, setGoalText] = useState('');
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const typeLabel = (id: string) => (id === 'custom' ? 'Custom' : types.find((t) => t.id === id)?.name ?? id);

  const show = (d: NotesDraft) => {
    setOpen(d);
    setGoalText(d.result ? notesAsGoal(d.result) : '');
    setProblem(null);
  };
  useEffect(() => {
    if (!waitingFor) return;
    const d = drafts.find((x) => x.id === waitingFor);
    if (!d || d.status === 'writing') return;
    setWaitingFor(null);
    if (d.status === 'ready' && d.result) show(d);
    else setProblem(d.error ?? 'The AI could not tidy these notes. Try again.');
  }, [drafts, waitingFor]);

  const tidy = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await api<{ draft: NotesDraft }>('/arcade/builder/tidy', { body: { notes } });
      setWaitingFor(r.draft.id);
      await reload();
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const discard = async (id: string) => {
    try {
      await api(`/arcade/builder/drafts/${id}`, { method: 'DELETE' });
    } catch (err) {
      setProblem(errorText(err));
    }
    if (open?.id === id) setOpen(null);
    if (waitingFor === id) setWaitingFor(null);
    await reload();
  };

  const t = open?.result ?? null;
  return (
    <div className="arc-form tidy">
      <h3 className="form-title">TIDY MY NOTES</h3>
      <p className="fine">Dump everything you're thinking, as messy as you like. The AI hands back the same ideas in a clear structure, with anything unclear listed as questions for you. It is told not to add facts you didn't write. Your notes stay exactly as you wrote them.</p>
      <label className="sr-only" htmlFor="tidy-notes">Your notes</label>
      <textarea id="tidy-notes" data-nav value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} maxLength={NOTES_MAX} placeholder="e.g. ok so I want a teacher planner line, weekly maybe monthly, no dated pages, sell on etsy first then gumroad..." />
      <div className="row-actions">
        <button type="button" className="arc-btn primary" data-nav disabled={busy || !notes.trim()} onClick={() => void tidy()}>{busy ? 'SENDING...' : 'TIDY MY NOTES'}</button>
      </div>
      {waitingFor ? <Thinking what="The AI is tidying your notes. You can leave this page: the tidy version waits in your drafts." /> : null}
      {problem ? <p className="form-error" role="alert">{problem}</p> : null}

      {open && t ? (
        <div className="tidy-review">
          <div className="tidy-cols">
            <div className="tidy-col">
              <p className="zone-title small">YOUR NOTES, UNCHANGED</p>
              <pre className="tidy-original">{open.request.notes}</pre>
            </div>
            <div className="tidy-col">
              <p className="zone-title small">TIDY VERSION</p>
              <p className="task-title">{t.title}</p>
              <p className="crt-text">{t.goal}</p>
              <Section title="SCOPE" items={t.scope} />
              {t.milestones.length ? (
                <div className="tidy-section">
                  <p className="zone-title small">MILESTONES</p>
                  <ol>
                    {t.milestones.map((m, i) => (
                      <li key={i}>
                        {m.name}
                        {m.tasks.length ? <ul>{m.tasks.map((x, j) => <li key={j}>{x.title} <span className="fine">· {CHARACTER_LABEL[x.characterId] ?? x.characterId} · {typeLabel(x.taskType)}</span></li>)}</ul> : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              <Section title="MUST AND MUST-NOT" items={t.constraints} />
              <Section title="DONE WHEN" items={t.doneWhen} />
            </div>
          </div>
          {t.questions.length ? (
            <div className="tidy-questions" role="note">
              <p className="zone-title small">QUESTIONS FOR YOU</p>
              <ul>{t.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              <p className="fine">The AI left these for you to decide. Answer them in the text below if you want the world writer to use the answers.</p>
            </div>
          ) : null}
          <label>Use as the world goal (edit anything first)
            <textarea data-nav value={goalText} onChange={(e) => setGoalText(e.target.value)} rows={7} maxLength={GOAL_MAX} />
          </label>
          <div className="row-actions">
            <button type="button" className="arc-btn" data-nav onClick={() => setOpen(null)}>CLOSE</button>
            <button type="button" className="arc-btn" data-nav onClick={() => void discard(open.id)}>DISCARD DRAFT</button>
            <button type="button" className="arc-btn primary" data-nav disabled={!goalText.trim()} onClick={() => onUse({ text: goalText.trim(), milestones: t.milestones.length, n: Date.now() })}>USE FOR LET THE AI BUILD A WORLD</button>
          </div>
        </div>
      ) : null}

      <DraftList drafts={drafts} label={(d) => d.result?.title ?? d.request.notes} openId={open?.id ?? null} onOpen={show} onDiscard={(d) => void discard(d.id)} />
    </div>
  );
}
