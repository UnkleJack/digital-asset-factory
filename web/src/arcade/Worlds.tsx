import { useState, type FormEvent } from 'react';
import { api, errorText, useApi } from '../api.ts';
import { useFocusMainWhenReady } from './input.ts';
import { WorldIdeas, TaskIdeas, WorldGenerator, TidyNotesPanel, type GoalSeed } from './Ai.tsx';

// HAPPY DAFFY milestone 2: Worlds, World Detail and the World Builder.

export interface ArcadeCharacter { id: string; displayName: string; scope: string }

interface WorldCard {
  id: string;
  name: string;
  description: string;
  nextMilestone: { id: string; name: string; sequence: number } | null;
  remainingEffort: number;
  progress: number;
  tasksLeft: number;
}
interface Task {
  id: string; milestone_id: string; character_id: string; title: string; description: string; task_type: string;
  difficulty: 'LOW' | 'MEDIUM' | 'HIGH'; status: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETE';
  estimated_effort: number; remaining_effort: number; milestone?: string;
}
interface ProductTypeInfo { id: string; name: string; importOnly: boolean }

const CHARACTER_OPTIONS = [['daf', 'DAF'], ['ide', 'IDE'], ['ai-chatbot', 'AI CHATBOT']] as const;
const STATUS_LABEL: Record<Task['status'], string> = { OPEN: 'OPEN', IN_PROGRESS: 'IN PROGRESS', BLOCKED: 'BLOCKED', COMPLETE: 'DONE' };
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function useProductTypes() {
  const { data } = useApi<ProductTypeInfo[]>('/product-types');
  return data ?? [];
}
function typeName(types: ProductTypeInfo[], id: string) {
  return id === 'custom' ? 'Custom' : types.find((t) => t.id === id)?.name ?? id;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
      <span className="progress-text">{pct}%</span>
    </div>
  );
}

const NAV_DESTINATIONS = ['WORLDS', 'MISSIONS', 'PACKS', 'LEADERBOARDS', 'CODEX'] as const;
type NavDestination = (typeof NAV_DESTINATIONS)[number];
const BUILT: readonly NavDestination[] = ['WORLDS', 'MISSIONS'];

export function ArcadeTabs({ current = 'WORLDS', onGo, onSoon }: { current?: NavDestination; onGo: (d: 'WORLDS' | 'MISSIONS') => void; onSoon: (name: string) => void }) {
  return (
    <nav className="arcade-tabs" aria-label="Arcade">
      {NAV_DESTINATIONS.map((d) => {
        const built = BUILT.includes(d);
        return (
          <button key={d} type="button" className={`arcade-tab${d === current ? ' active' : built ? '' : ' unavailable'}`} data-nav aria-current={d === current ? 'page' : undefined} aria-disabled={!built} onClick={() => (built ? onGo(d as 'WORLDS' | 'MISSIONS') : onSoon(d))}>
            {d}{built ? null : <small>SOON</small>}
          </button>
        );
      })}
    </nav>
  );
}

// ---------- Worlds (shown on the hub, under the character picker) ----------

/**
 * The chosen character's worlds, closest milestone first. Locked rule: only worlds where the character has
 * an open task. `locked` is the zero-credit lock: ENTER WORLD is shown but refuses, and the hub says why.
 */
export function WorldList({ character, locked, onOpen }: { character: ArcadeCharacter; locked: boolean; onOpen: (id: string) => void }) {
  const { data, error, loading, reload } = useApi<{ worlds: WorldCard[] }>(`/arcade/worlds?character=${encodeURIComponent(character.id)}`, { poll: 30000 });
  const worlds = data?.worlds ?? [];
  return (
    <>
      {loading && !data ? <p className="big-pixel center-text blink-slow">LOADING WORLDS...</p> : null}
      {error ? <div className="empty-panel" role="alert"><p className="big-pixel bad">WORLDS DIDN'T LOAD</p><p className="crt-text">{error}</p><button type="button" className="arc-btn small" data-nav onClick={() => void reload()}>RETRY</button></div> : null}
      {!loading && !error && worlds.length === 0 ? (
        <div className="empty-panel" role="status">
          <p className="big-pixel">NO OPEN WORLDS</p>
          <p className="crt-text">{character.displayName} has no open tasks in any world yet. Build a world and give {character.displayName} a task, and it shows up here.</p>
        </div>
      ) : null}
      <div className="world-list">
        {worlds.map((w, i) => (
          <article key={w.id} className="world-card">
            <div className="world-head">
              <span className="world-rank" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="world-name">{w.name}</h3>
            </div>
            <ProgressBar value={w.progress} label={`${w.name} progress to next milestone`} />
            <div className="world-meta">
              <span>TASKS LEFT: <b>{w.tasksLeft}</b></span>
              <span>NEXT: <b>{w.nextMilestone?.name ?? 'NONE'}</b></span>
              <span title="Effort points left in the next milestone">WORK LEFT: <b>{fmt(w.remainingEffort)}</b></span>
            </div>
            <button type="button" className={`arc-btn small${locked ? ' locked' : ''}`} data-nav data-enter-world aria-disabled={locked} onClick={() => onOpen(w.id)}>ENTER WORLD</button>
          </article>
        ))}
      </div>
    </>
  );
}

// ---------- World Detail ----------

interface Detail {
  world: WorldCard;
  milestones: { id: string; name: string; sequence: number; status: string }[];
  tasks: Task[];
}

export function WorldDetail({ worldId, character, onBack }: { worldId: string; character: ArcadeCharacter | null; onBack: () => void }) {
  const types = useProductTypes();
  const { data, error, loading, reload } = useApi<Detail>(character ? `/arcade/worlds/${encodeURIComponent(worldId)}?character=${encodeURIComponent(character.id)}` : null);
  const [notice, setNotice] = useState<string | null>(null);
  useFocusMainWhenReady(!!data || !!error);
  if (loading && !data) return <div className="scr center"><p className="big-pixel blink-slow">LOADING WORLD...</p></div>;
  if (error || !data) {
    return (
      <div className="scr center" role="alert">
        <p className="big-pixel bad">CAN'T ENTER THIS WORLD</p>
        <p className="crt-text">{error ?? 'Not found.'}</p>
        <div className="row-actions">
          <button type="button" className="arc-btn" data-nav data-autofocus onClick={onBack}>BACK TO HUB</button>
          <button type="button" className="arc-btn" data-nav onClick={() => void reload()}>RETRY</button>
        </div>
      </div>
    );
  }
  const w = data.world;
  return (
    <div className="scr world-detail">
      <p className="breadcrumb">HUB / {w.name.toUpperCase()}</p>
      <h2 className="screen-title">{w.name}</h2>
      {w.description ? <p className="crt-text center-text">{w.description}</p> : null}
      <ProgressBar value={w.progress} label="Progress to next milestone" />
      <div className="world-meta center">
        <span>NEXT MILESTONE: <b>{w.nextMilestone?.name ?? 'NONE'}</b></span>
        <span>TASKS LEFT: <b>{w.tasksLeft}</b></span>
      </div>
      <ol className="task-list" aria-label="Your open tasks">
        {data.tasks.map((t, i) => (
          <li key={t.id} className="task-row">
            <div className="task-main">
              <span className="task-title">{t.title}</span>
              {t.description ? <span className="task-desc">{t.description}</span> : null}
              <span className="task-tags">
                <span className={`diff diff-${t.difficulty.toLowerCase()}`}>{t.difficulty}</span>
                <span>{typeName(types, t.task_type)}</span>
                <span>{t.milestone}</span>
                <span>{STATUS_LABEL[t.status]}</span>
              </span>
            </div>
            <button type="button" className="arc-btn small" data-nav {...(i === 0 ? { 'data-autofocus': true } : {})} onClick={() => setNotice('THE TASK WORKSPACE OPENS IN MILESTONE 3. MARK PROGRESS IN THE WORLD BUILDER FOR NOW.')}>OPEN TASK</button>
          </li>
        ))}
      </ol>
      {notice ? <p className="lock-line center-text">{notice}</p> : null}
      <div className="row-actions">
        <button type="button" className="arc-btn" data-nav onClick={onBack}>BACK TO HUB</button>
      </div>
    </div>
  );
}

// ---------- World Builder: list + new world ----------

interface BuilderWorld { id: string; name: string; description: string; status: 'active' | 'archived'; tasks: number; openTasks: number; milestones: number; nextMilestone: string | null }

export function BuilderScreen({ onOpen, onBack }: { onOpen: (id: string) => void; onBack: () => void }) {
  const { data, error, reload } = useApi<{ worlds: BuilderWorld[] }>('/arcade/builder');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [milestones, setMilestones] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [goalSeed, setGoalSeed] = useState<GoalSeed | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const r = await api<{ id: string }>('/arcade/builder/worlds', { body: { name, description, milestones: milestones.split('\n').map((m) => m.trim()).filter(Boolean) } });
      setName('');
      setDescription('');
      setMilestones('');
      onOpen(r.id);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scr builder">
      <h2 className="screen-title">WORLD BUILDER</h2>
      <p className="fine center-text">Start from scratch, or let the AI help. A world shows up for a character once that character has an open task in it. Anything the AI writes waits in your drafts, so you can leave this page while it works.</p>
      <TidyNotesPanel onUse={(seed) => setGoalSeed(seed)} />
      <WorldGenerator onSaved={onOpen} seed={goalSeed} />
      <WorldIdeas onPick={(i) => { setName(i.name); setDescription(i.description); setMilestones(i.milestones.join('\n')); }} />
      <form className="arc-form" onSubmit={create}>
        <h3 className="form-title">NEW WORLD</h3>
        <label>Name<input data-nav value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="e.g. Mandala empire" /></label>
        <label>What it's for<textarea data-nav value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={2} placeholder="Optional" /></label>
        <label>Milestones, one per line, in order<textarea data-nav value={milestones} onChange={(e) => setMilestones(e.target.value)} rows={3} placeholder={'First pack of 15\nSecond pack\nShop launch'} /></label>
        {problem ? <p className="form-error" role="alert">{problem}</p> : null}
        <button type="submit" className="arc-btn primary" data-nav data-autofocus disabled={busy}>{busy ? 'BUILDING...' : 'BUILD WORLD'}</button>
      </form>

      <h3 className="form-title">ALL WORLDS</h3>
      {error ? <p className="form-error" role="alert">{error} <button type="button" className="arc-btn small" data-nav onClick={() => void reload()}>RETRY</button></p> : null}
      {data && data.worlds.length === 0 ? <p className="fine center-text">No worlds yet.</p> : null}
      <ul className="builder-list">
        {(data?.worlds ?? []).map((w) => (
          <li key={w.id}>
            <button type="button" className={`builder-item${w.status === 'archived' ? ' archived' : ''}`} data-nav onClick={() => onOpen(w.id)}>
              <span className="task-title">{w.name}{w.status === 'archived' ? ' (archived)' : ''}</span>
              <span className="task-tags"><span>{w.milestones} milestones</span><span>{w.openTasks} open / {w.tasks} tasks</span><span>next: {w.nextMilestone ?? 'none'}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <div className="row-actions"><button type="button" className="arc-btn" data-nav onClick={onBack}>BACK TO HUB</button></div>
    </div>
  );
}

// ---------- World Builder: one world ----------

interface BuilderDetail {
  world: { id: string; name: string; description: string; status: 'active' | 'archived' };
  milestones: { id: string; name: string; sequence: number; status: string; progress: number; remainingEffort: number; taskList: Task[] }[];
}

export function BuilderWorldScreen({ worldId, defaultCharacter, onBack, onHub }: { worldId: string; defaultCharacter: string | null; onBack: () => void; onHub: () => void }) {
  const types = useProductTypes();
  const { data, error, reload } = useApi<BuilderDetail>(`/arcade/builder/worlds/${encodeURIComponent(worldId)}`);
  const [problem, setProblem] = useState<string | null>(null);
  useFocusMainWhenReady(!!data);
  const [milestoneName, setMilestoneName] = useState('');
  const [task, setTask] = useState({ milestoneId: '', characterId: defaultCharacter ?? 'daf', title: '', description: '', taskType: 'mandala-coloring', difficulty: 'MEDIUM', estimatedEffort: '3' });
  const run = async (fn: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setProblem(errorText(err));
    }
  };

  if (error) return <div className="scr center" role="alert"><p className="big-pixel bad">WORLD DIDN'T LOAD</p><p className="crt-text">{error}</p><button type="button" className="arc-btn" data-nav data-autofocus onClick={onBack}>BACK</button></div>;
  if (!data) return <div className="scr center"><p className="big-pixel blink-slow">LOADING...</p></div>;
  const milestoneId = task.milestoneId || data.milestones.find((m) => m.status === 'open')?.id || data.milestones[0]?.id || '';
  const makeable = types.filter((t) => !t.importOnly);

  const addTask = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api(`/arcade/builder/worlds/${worldId}/tasks`, { body: { ...task, milestoneId, estimatedEffort: Number(task.estimatedEffort) } });
      setTask((t) => ({ ...t, title: '', description: '' }));
    });
  };

  return (
    <div className="scr builder">
      <p className="breadcrumb">WORLD BUILDER / {data.world.name.toUpperCase()}</p>
      <h2 className="screen-title">{data.world.name}</h2>
      {data.world.description ? <p className="crt-text center-text">{data.world.description}</p> : null}
      {problem ? <p className="form-error" role="alert">{problem}</p> : null}

      {data.milestones.length === 0 ? <p className="fine center-text">Add a milestone first; every task belongs to one.</p> : null}
      {data.milestones.map((m) => (
        <section key={m.id} className="milestone-block" aria-label={`Milestone ${m.sequence}: ${m.name}`}>
          <div className="milestone-head">
            <span className="form-title">{m.sequence}. {m.name}{m.status === 'completed' ? ' ✓' : ''}</span>
            <span className="fine">work left {fmt(m.remainingEffort)}</span>
          </div>
          <ProgressBar value={m.progress} label={`${m.name} progress`} />
          {m.taskList.length === 0 ? <p className="fine">No tasks yet.</p> : null}
          <ul className="builder-tasks">
            {m.taskList.map((t) => (
              <li key={t.id} className={`task-row${t.status === 'COMPLETE' ? ' done' : ''}`}>
                <div className="task-main">
                  <span className="task-title">{t.title}</span>
                  <span className="task-tags">
                    <span>{CHARACTER_OPTIONS.find(([id]) => id === t.character_id)?.[1] ?? t.character_id}</span>
                    <span className={`diff diff-${t.difficulty.toLowerCase()}`}>{t.difficulty}</span>
                    <span>{typeName(types, t.task_type)}</span>
                    <span>effort {fmt(t.remaining_effort)} / {fmt(t.estimated_effort)}</span>
                  </span>
                </div>
                <div className="task-controls">
                  <label className="sr-only" htmlFor={`st-${t.id}`}>Status of {t.title}</label>
                  <select id={`st-${t.id}`} data-nav value={t.status} onChange={(e) => void run(() => api(`/arcade/builder/tasks/${t.id}`, { method: 'PATCH', body: { status: e.target.value } }))}>
                    {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button type="button" className="arc-btn small" data-nav aria-label={`Delete task ${t.title}`} onClick={() => { if (window.confirm(`Delete the task "${t.title}"?`)) void run(() => api(`/arcade/builder/tasks/${t.id}`, { method: 'DELETE' })); }}>DEL</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <form className="arc-form" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api(`/arcade/builder/worlds/${worldId}/milestones`, { body: { name: milestoneName } }); setMilestoneName(''); }); }}>
        <h3 className="form-title">ADD MILESTONE</h3>
        <div className="form-row">
          <input data-nav aria-label="Milestone name" value={milestoneName} onChange={(e) => setMilestoneName(e.target.value)} maxLength={80} required placeholder="Milestone name" />
          <button type="submit" className="arc-btn small" data-nav>ADD</button>
        </div>
      </form>

      {data.milestones.length ? (
        <form className="arc-form" onSubmit={addTask}>
          <h3 className="form-title">ADD TASK</h3>
          <TaskIdeas worldId={worldId} milestoneId={milestoneId} onPick={(i) => setTask({ ...task, title: i.title, description: i.description, characterId: i.characterId, taskType: i.taskType, difficulty: i.difficulty, estimatedEffort: String(i.estimatedEffort) })} />
          <label>Title<input data-nav value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} maxLength={120} required placeholder="e.g. 30 intricate mandalas" /></label>
          <label>Details<textarea data-nav value={task.description} onChange={(e) => setTask({ ...task, description: e.target.value })} rows={2} maxLength={4000} placeholder="Optional: what done looks like" /></label>
          <div className="form-grid">
            <label>Milestone
              <select data-nav value={milestoneId} onChange={(e) => setTask({ ...task, milestoneId: e.target.value })}>
                {data.milestones.map((m) => <option key={m.id} value={m.id}>{m.sequence}. {m.name}</option>)}
              </select>
            </label>
            <label>Character
              <select data-nav value={task.characterId} onChange={(e) => setTask({ ...task, characterId: e.target.value })}>
                {CHARACTER_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label>Task type
              <select data-nav value={task.taskType} onChange={(e) => setTask({ ...task, taskType: e.target.value })}>
                {makeable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="custom">Custom (anything else)</option>
              </select>
            </label>
            <label>Difficulty
              <select data-nav value={task.difficulty} onChange={(e) => setTask({ ...task, difficulty: e.target.value })}>
                <option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option>
              </select>
            </label>
            <label>Effort points
              <input data-nav type="number" min="0.5" step="0.5" value={task.estimatedEffort} onChange={(e) => setTask({ ...task, estimatedEffort: e.target.value })} required />
            </label>
          </div>
          <p className="fine">Effort points are your own estimate of the work. Worlds with the fewest points left before their next milestone are listed first.</p>
          <button type="submit" className="arc-btn primary" data-nav data-autofocus>ADD TASK</button>
        </form>
      ) : null}

      <div className="row-actions">
        <button type="button" className="arc-btn" data-nav onClick={onBack}>BACK TO BUILDER</button>
        <button type="button" className="arc-btn" data-nav onClick={onHub}>HUB</button>
        <button type="button" className="arc-btn" data-nav onClick={() => void run(() => api(`/arcade/builder/worlds/${worldId}`, { method: 'PATCH', body: { status: data.world.status === 'active' ? 'archived' : 'active' } }))}>
          {data.world.status === 'active' ? 'ARCHIVE WORLD' : 'RESTORE WORLD'}
        </button>
      </div>
    </div>
  );
}
