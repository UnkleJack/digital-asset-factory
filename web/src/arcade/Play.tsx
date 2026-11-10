import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, errorText, useApi } from '../api.ts';
import { useFocusMainWhenReady } from './input.ts';
import { ArcadeTabs, type ArcadeCharacter } from './Worlds.tsx';

// HAPPY DAFFY milestones 3 to 9 on screen: Task Workspace, QA Review, Bin, Packs, Leaderboards, Codex, plus
// B.M.O.'s chat. Every number shown comes from the factory; anything the owner hasn't set yet says NOT SET.

const thumb = (id: string | null) => (id ? `/api/assets/${id}/thumb` : null);
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
const LABEL: Record<string, string> = {
  in_progress: 'BEING MADE', ready: 'READY FOR QA REVIEW', approved: 'APPROVED', rejected: 'REJECTED', failed: 'FAILED', qa_failed: 'FAILED QA',
};

function Loading({ what }: { what: string }) {
  return <p className="big-pixel center-text blink-slow">LOADING {what}...</p>;
}
function LoadError({ what, error, onRetry }: { what: string; error: string; onRetry: () => void }) {
  return (
    <div className="empty-panel" role="alert">
      <p className="big-pixel bad">{what} DIDN'T LOAD</p>
      <p className="crt-text">{error}</p>
      <button type="button" className="arc-btn small" data-nav onClick={onRetry}>RETRY</button>
    </div>
  );
}
function NotSet() {
  return <span className="not-set" title="The spec leaves this value open. Set it in Settings → arcade when you decide.">NOT SET</span>;
}
function CreditWarning({ credits }: { credits?: { state: string; value: number; live: boolean } }) {
  if (!credits || credits.state === 'normal') return null;
  return (
    <p className="lock-line center-text" role="status">
      <span className="lock-icon" aria-hidden="true">■</span>{' '}
      {credits.state === 'zero' ? 'NO CREDITS: NEW AI WORK WAITS. WHAT YOU MADE IS SAFE.' : `LOW CREDITS: ${credits.value} AI CALLS LEFT TODAY`}
    </p>
  );
}

// ---------- Milestone 3: Task Workspace ----------

interface TaskAsset { productId: string; title: string; productType: string; versionNo: number | null; status: string | null; stage: string | null; qaStatus: string | null; error: string | null; thumb: string | null; binned: boolean; reviewable: boolean; failed: boolean; createdAt: string }
interface Workspace {
  task: { id: string; title: string; description: string; difficulty: string; status: string; task_type: string; milestone: string; remaining_effort: number; estimated_effort: number };
  world: { id: string; name: string };
  module: { kind: 'product'; id: string; name: string; importOnly: boolean; briefMax: number } | { kind: 'custom'; id: string; name: string };
  assets: TaskAsset[];
  credits: { state: string; value: number; live: boolean };
}

export function TaskWorkspace({ taskId, character, onBack, onReview }: { taskId: string; character: ArcadeCharacter | null; onBack: () => void; onReview: (productId: string) => void }) {
  const path = character ? `/arcade/tasks/${encodeURIComponent(taskId)}?character=${encodeURIComponent(character.id)}` : null;
  const making = useRef(false);
  const { data, error, loading, reload } = useApi<Workspace>(path, { poll: 3000, keepData: true });
  const { data: designs } = useApi<{ id: string; name: string }[]>('/design-systems');
  const [title, setTitle] = useState('');
  const [design, setDesign] = useState('');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useFocusMainWhenReady(!!data || !!error);
  making.current = !!data?.assets.some((a) => a.status === 'in_progress');

  if (loading && !data) return <div className="scr center"><Loading what="TASK" /></div>;
  if (error || !data) {
    return (
      <div className="scr center" role="alert">
        <p className="big-pixel bad">CAN'T OPEN THIS TASK</p>
        <p className="crt-text">{error ?? 'Not found.'}</p>
        <div className="row-actions">
          <button type="button" className="arc-btn" data-nav data-autofocus onClick={onBack}>BACK TO WORLD</button>
          <button type="button" className="arc-btn" data-nav onClick={() => void reload()}>RETRY</button>
        </div>
      </div>
    );
  }
  const t = data.task;
  const done = t.status === 'COMPLETE';
  const make = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api(`${path!.replace('?', '/make?')}`, { body: { title: title.trim() || undefined, designSystemId: design || undefined, brief: brief.trim() || undefined } });
      await reload();
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const progress = async (body: Record<string, unknown>) => {
    setProblem(null);
    try {
      await api(`${path!.replace('?', '/progress?')}`, { body });
      await reload();
    } catch (err) {
      setProblem(errorText(err));
    }
  };

  return (
    <div className="scr workspace">
      <p className="breadcrumb">WORLDS / {data.world.name.toUpperCase()} / {t.title.toUpperCase()}</p>
      <h2 className="screen-title">{t.title}</h2>
      {t.description ? <p className="crt-text center-text">{t.description}</p> : null}
      <div className="world-meta center">
        <span className={`diff diff-${t.difficulty.toLowerCase()}`}>{t.difficulty}</span>
        <span>TYPE: <b>{data.module.name.toUpperCase()}</b></span>
        <span>MILESTONE: <b>{t.milestone}</b></span>
        <span>STATUS: <b>{done ? 'DONE' : t.status.replace('_', ' ')}</b></span>
      </div>
      <CreditWarning credits={data.credits} />

      {data.module.kind === 'product' ? (
        data.module.importOnly ? (
          <p className="lock-line center-text">{data.module.name} are made on the Imports screen, from images you imported. <Link to="/imports">OPEN IMPORTS</Link></p>
        ) : done ? (
          <p className="hint-line center-text">THIS TASK IS DONE. REOPEN IT IN THE WORLD BUILDER TO MAKE MORE FOR IT.</p>
        ) : (
          <form className="arc-form" onSubmit={make}>
            <h3 className="form-title">MAKE IT: {data.module.name.toUpperCase()}</h3>
            <p className="fine">The factory makes it from start to finish: content, artwork, pages, QA checks and listings. For every setting of this product type, use the back office's <Link to="/library">Product library</Link>.</p>
            <label>Title<input data-nav data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t.title} /></label>
            <label>Design
              <select data-nav value={design} onChange={(e) => setDesign(e.target.value)}>
                <option value="">The template's own design</option>
                {(designs ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label>Note for the AI (optional)<textarea data-nav value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} maxLength={data.module.briefMax} placeholder={t.description || 'e.g. gentle wording for busy parents'} /></label>
            {problem ? <p className="form-error" role="alert">{problem}</p> : null}
            <button type="submit" className="arc-btn primary" data-nav disabled={busy || data.credits.state === 'zero'}>{busy ? 'STARTING...' : 'MAKE IT'}</button>
          </form>
        )
      ) : (
        <div className="arc-form">
          <h3 className="form-title">CUSTOM TASK: MARK YOUR PROGRESS</h3>
          <p className="fine">This task isn't one of the factory's product types, so there is nothing to make here. Move it along as you work.</p>
          <div className="row-actions">
            {(['IN_PROGRESS', 'BLOCKED', 'COMPLETE'] as const).map((s) => (
              <button key={s} type="button" className={`arc-btn small${t.status === s ? ' primary' : ''}`} data-nav aria-pressed={t.status === s} onClick={() => void progress({ status: s })}>{s === 'COMPLETE' ? 'DONE' : s.replace('_', ' ')}</button>
            ))}
          </div>
          {!done ? (
            <label>Effort left (of {t.estimated_effort})
              <input data-nav type="number" min={0} max={t.estimated_effort} step={0.5} defaultValue={t.remaining_effort} onBlur={(e) => void progress({ remainingEffort: Number(e.target.value) })} />
            </label>
          ) : null}
          {problem ? <p className="form-error" role="alert">{problem}</p> : null}
        </div>
      )}

      {data.module.kind === 'product' ? (
        <>
          <h3 className="form-title">ASSETS FOR THIS TASK</h3>
          {data.assets.length ? (
            <ol className="task-list" aria-label="Assets for this task">
              {data.assets.map((a) => (
                <li key={a.productId} className="task-row">
                  {a.thumb ? <img className="asset-thumb" src={thumb(a.thumb)!} alt="" /> : null}
                  <div className="task-main">
                    <span className="task-title">{a.title}</span>
                    <span className="task-tags">
                      <span>{a.binned ? 'IN THE BIN' : LABEL[a.status ?? ''] ?? (a.status ?? '').toUpperCase()}</span>
                      {a.status === 'in_progress' && a.stage ? <span className="blink-slow">{a.stage.replace(/_/g, ' ').toUpperCase()}</span> : null}
                      {a.qaStatus ? <span>QA: {a.qaStatus.replace(/_/g, ' ').toUpperCase()}</span> : null}
                    </span>
                    {a.error ? <span className="task-desc">{a.error}</span> : null}
                  </div>
                  <button type="button" className="arc-btn small" data-nav disabled={!a.reviewable && !a.failed && a.status !== 'rejected'} title={a.reviewable ? 'Open QA Review' : a.failed ? 'See which check failed, and make a new version' : 'Available once the factory has made it and QA has run'} onClick={() => onReview(a.productId)}>
                    {a.failed ? 'SEE WHY' : a.status === 'rejected' ? 'LOOK' : 'SUBMIT FOR QA / REVIEW'}
                  </button>
                </li>
              ))}
            </ol>
          ) : <p className="hint-line center-text">NOTHING MADE YET. PRESS MAKE IT TO START.</p>}
        </>
      ) : null}
      <div className="row-actions">
        <button type="button" className="arc-btn" data-nav onClick={onBack}>BACK TO WORLD</button>
      </div>
    </div>
  );
}

// ---------- Milestone 4: QA Review ----------

interface Review {
  product: { id: string; title: string; productType: string; typeName: string; binned: boolean };
  version: { id: string; versionNo: number; status: string; stage: string; qaStatus: string; error: string | null };
  task: { id: string; title: string; description: string; world: string; difficulty: string } | null;
  previews: { id: string; page: number }[];
  checklist: { check: string; severity: 'hard' | 'warning'; passed: boolean; message: string }[];
  warnings: { check: string; message: string }[];
  listings: { marketplace: string; status: string; issues: number }[];
  decidable: boolean;
  canRemake: boolean;
  history: { outcome: string; reason_status: string | null; decided_at: string; qualifying: number }[];
  friction: { stage: number; enabled: boolean; swapButtons: boolean; nameOneThingWrong: boolean; holdSeconds: number | null };
  credits: { state: string; value: number; live: boolean };
  openedAt: string;
  minSentences: number;
}

function countSentences(text: string): number {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => (s.match(/\p{L}+/gu) ?? []).length >= 2).length;
}

export function QaReview({ productId, character, onBack, onDone }: { productId: string; character: ArcadeCharacter | null; onBack: () => void; onDone: () => void }) {
  const { data, error, loading, reload } = useApi<Review>(`/arcade/review/${encodeURIComponent(productId)}`);
  const [liked, setLiked] = useState('');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [accept, setAccept] = useState(false);
  const [oneThing, setOneThing] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hold, setHold] = useState<number | null>(null);
  const holdStart = useRef<number | null>(null);
  useFocusMainWhenReady(!!data || !!error);

  useEffect(() => {
    if (hold === null) return;
    const id = window.setInterval(() => setHold(holdStart.current ? Date.now() - holdStart.current : null), 100);
    return () => window.clearInterval(id);
  }, [hold !== null]);

  if (loading && !data) return <div className="scr center"><Loading what="QA REVIEW" /></div>;
  if (error || !data) return <div className="scr"><LoadError what="QA REVIEW" error={error ?? 'Not found.'} onRetry={() => void reload()} /><div className="row-actions"><button type="button" className="arc-btn" data-nav onClick={onBack}>BACK</button></div></div>;

  const send = async (path: string, body: Record<string, unknown>, after?: (r: any) => void) => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await api(`/arcade/review/${encodeURIComponent(productId)}/${path}`, { body: { characterId: character?.id ?? null, openedAt: data.openedAt, ...body } });
      after?.(r);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const doApprove = (heldMs?: number) => send('approve', { likedNote: liked, acceptWarnings: accept, oneThingWrong: oneThing || undefined, heldMs }, () => onDone());
  const doReject = () => send('reject', { reason }, (r) => {
    if (r.queued) setNotice(r.message);
    else onDone();
  });
  const holdSeconds = data.friction.holdSeconds;
  const startHold = () => { holdStart.current = Date.now(); setHold(0); };
  const endHold = () => {
    const held = holdStart.current ? Date.now() - holdStart.current : 0;
    holdStart.current = null;
    setHold(null);
    if (holdSeconds && held >= holdSeconds * 1000) void doApprove(held);
    else if (holdSeconds) setProblem(`Keep holding APPROVE for ${holdSeconds} seconds.`);
  };
  const sentences = countSentences(reason);
  const hardFails = data.checklist.filter((c) => !c.passed && c.severity === 'hard');
  const approveBtn = (
    <button key="approve" type="button" className="arc-btn primary" data-nav disabled={busy || !data.decidable || hardFails.length > 0}
      {...(holdSeconds ? { onPointerDown: startHold, onPointerUp: endHold, onPointerLeave: () => hold !== null && endHold(), onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && hold === null) startHold(); }, onKeyUp: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') endHold(); } } : { onClick: () => void doApprove() })}>
      {holdSeconds ? (hold !== null ? `HOLD... ${Math.max(0, holdSeconds - Math.floor(hold / 1000))}` : `HOLD ${holdSeconds}s TO APPROVE`) : 'APPROVE'}
    </button>
  );
  const rejectBtn = <button key="reject" type="button" className="arc-btn" data-nav disabled={busy || !data.decidable} onClick={() => (rejecting ? void doReject() : setRejecting(true))}>{rejecting ? 'SEND REJECTION' : 'REJECT'}</button>;

  return (
    <div className="scr qa-review">
      <p className="breadcrumb">{data.task ? `${data.task.world.toUpperCase()} / ${data.task.title.toUpperCase()} / QA` : 'PACKS / QA'}</p>
      <h2 className="screen-title">{data.product.title}</h2>
      <div className="world-meta center">
        <span>TYPE: <b>{data.product.typeName.toUpperCase()}</b></span>
        <span>VERSION: <b>{data.version.versionNo}</b></span>
        <span>STATUS: <b>{data.product.binned ? 'IN THE BIN' : LABEL[data.version.status] ?? data.version.status}</b></span>
      </div>
      <CreditWarning credits={data.credits} />

      {data.previews.length ? (
        <div className="preview-strip" aria-label="Pages">
          {data.previews.slice(0, 8).map((p) => <img key={p.id} src={thumb(p.id)!} alt={`Page ${p.page}`} loading="lazy" />)}
        </div>
      ) : <p className="lock-line center-text">NO PREVIEW AVAILABLE FOR THIS VERSION.</p>}

      {data.task ? <p className="crt-text center-text">TASK: {data.task.description || data.task.title}</p> : null}

      <section className="arc-form" aria-label="QA checklist">
        <h3 className="form-title">QA CHECKLIST ({data.checklist.filter((c) => c.passed).length} OF {data.checklist.length} PASS)</h3>
        <ul className="check-list">
          {data.checklist.map((c) => (
            <li key={c.check} className={c.passed ? 'pass' : c.severity === 'hard' ? 'fail' : 'warn'}>
              <span aria-hidden="true">{c.passed ? '✓' : c.severity === 'hard' ? '✗' : '!'}</span> {c.message}
            </li>
          ))}
        </ul>
        {hardFails.length ? <p className="form-error">A red check failed, so this version can't be approved. {data.canRemake ? 'Make a new version below' : 'Reject it'}, or fix it in the back office.</p> : null}
        {data.warnings.length ? <label className="tick-line"><input type="checkbox" data-nav checked={accept} onChange={(e) => setAccept(e.target.checked)} /> I looked at the {data.warnings.length} warning{data.warnings.length === 1 ? '' : 's'} and accept {data.warnings.length === 1 ? 'it' : 'them'}</label> : null}
      </section>

      {data.decidable ? (
        <div className="arc-form">
          <label>WHAT I LIKED (optional)<textarea data-nav value={liked} onChange={(e) => setLiked(e.target.value)} rows={2} maxLength={2000} /></label>
          {data.friction.nameOneThingWrong ? (
            <label>QUICK CHECK: NAME ONE THING THAT COULD BE BETTER<textarea data-nav value={oneThing} onChange={(e) => setOneThing(e.target.value)} rows={2} maxLength={500} placeholder="Anything small counts" /></label>
          ) : null}
          {rejecting ? (
            <label>WHY REJECTED (at least {data.minSentences} sentences: which part, then what's wrong)
              <textarea data-nav data-autofocus value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={4000} aria-describedby="reason-count" placeholder="The title on the cover is too small. It can't be read from arm's length." />
              <span id="reason-count" className="fine">{sentences} SENTENCE{sentences === 1 ? '' : 'S'}{sentences < data.minSentences ? ` · NEEDS ${data.minSentences}` : ''}</span>
            </label>
          ) : null}
          {problem ? <p className="form-error" role="alert">{problem}</p> : null}
          {notice ? <p className="lock-line" role="status">{notice}</p> : null}
          <div className="row-actions">
            {data.friction.swapButtons ? [rejectBtn, approveBtn] : [approveBtn, rejectBtn]}
            <button type="button" className="arc-btn danger" data-nav disabled={busy} onClick={() => setDeleting((d) => !d)}>DELETE</button>
          </div>
        </div>
      ) : (
        <div className="arc-form">
          <p className="lock-line center-text">{data.product.binned ? 'THIS ITEM IS IN THE BIN.' : `NOTHING TO DECIDE: ${LABEL[data.version.status] ?? data.version.status}.`}</p>
          {data.version.error ? <p className="fine center-text">{data.version.error}</p> : null}
          {problem ? <p className="form-error" role="alert">{problem}</p> : null}
          <div className="row-actions">
            {data.canRemake ? <button type="button" className="arc-btn primary" data-nav data-autofocus disabled={busy} onClick={() => void send('remake', {}, () => onDone())} title="The factory makes it again with a fresh start">MAKE A NEW VERSION</button> : null}
            {!data.product.binned ? <button type="button" className="arc-btn danger" data-nav disabled={busy} onClick={() => setDeleting((d) => !d)}>DELETE</button> : null}
          </div>
        </div>
      )}

      {deleting ? (
        <div className="arc-form" role="group" aria-label="Delete">
          <h3 className="form-title">DELETE: WHERE TO?</h3>
          <p className="fine">Deleting needs no reason, never counts as a rejection and never earns credits.</p>
          <div className="row-actions">
            {!data.product.binned ? <button type="button" className="arc-btn" data-nav disabled={busy} onClick={() => void (async () => { await api(`/arcade/review/${encodeURIComponent(productId)}/delete`, { body: { destination: 'bin', openedAt: data.openedAt, characterId: character?.id ?? null } }).then(onDone, (e) => setProblem(errorText(e))); })()}>SEND TO BIN</button> : null}
          </div>
          <label>PERMANENT DELETE: type DELETE to remove it and its files for good<input data-nav value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={10} autoComplete="off" /></label>
          <button type="button" className="arc-btn danger" data-nav disabled={busy || confirm !== 'DELETE'} onClick={() => void send('delete', { destination: 'permanent', confirm }, () => onDone())}>DELETE FOREVER</button>
          {problem && !data.decidable ? <p className="form-error" role="alert">{problem}</p> : null}
        </div>
      ) : null}

      {data.history.length ? (
        <p className="fine center-text">EARLIER: {data.history.map((h) => `${h.outcome.replace('_', ' ')} ${day(h.decided_at)}${h.reason_status === 'waiting' ? ' (reason waiting for the AI)' : ''}`).join(' · ')}</p>
      ) : null}
      <div className="row-actions">
        <button type="button" className="arc-btn" data-nav onClick={onBack}>BACK</button>
        <Link className="arc-btn small" data-nav to="/batches">FULL REVIEW IN THE BACK OFFICE</Link>
      </div>
    </div>
  );
}

// ---------- Milestone 4: Bin ----------

export function BinScreen({ onBack, onOpen }: { onBack: () => void; onOpen: (productId: string) => void }) {
  const { data, error, loading, reload } = useApi<{ items: { productId: string; title: string; productType: string; binnedAt: string; thumb: string | null }[] }>('/arcade/bin');
  const [confirm, setConfirm] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  useFocusMainWhenReady(!!data || !!error);
  const run = async (fn: () => Promise<unknown>) => {
    setProblem(null);
    try { await fn(); await reload(); } catch (e) { setProblem(errorText(e)); }
  };
  return (
    <div className="scr bin">
      <h2 className="screen-title">BIN</h2>
      <p className="fine center-text">Items sent here from QA Review. They're archived, not gone: RESTORE puts one back. A permanent delete removes it and its files and can't be undone.</p>
      {loading && !data ? <Loading what="BIN" /> : null}
      {error ? <LoadError what="BIN" error={error} onRetry={() => void reload()} /> : null}
      {problem ? <p className="crt-error" role="alert">{problem}</p> : null}
      {data && !data.items.length ? <p className="hint-line center-text">THE BIN IS EMPTY.</p> : null}
      <ol className="task-list">
        {(data?.items ?? []).map((b, i) => (
          <li key={b.productId} className="task-row">
            {b.thumb ? <img className="asset-thumb" src={thumb(b.thumb)!} alt="" /> : null}
            <div className="task-main">
              <span className="task-title">{b.title}</span>
              <span className="task-tags"><span>{b.productType.toUpperCase()}</span><span>BINNED {day(b.binnedAt)}</span><span>NO REASON NEEDED</span></span>
            </div>
            <div className="mission-actions">
              <button type="button" className="arc-btn small" data-nav {...(i === 0 ? { 'data-autofocus': true } : {})} onClick={() => onOpen(b.productId)}>LOOK</button>
              <button type="button" className="arc-btn small" data-nav onClick={() => void run(() => api(`/arcade/bin/${b.productId}/restore`, { body: {} }))}>RESTORE</button>
              <label className="sr-only" htmlFor={`del-${b.productId}`}>Type DELETE to delete {b.title} forever</label>
              <input id={`del-${b.productId}`} className="confirm-input" data-nav placeholder="type DELETE" value={confirm[b.productId] ?? ''} onChange={(e) => setConfirm({ ...confirm, [b.productId]: e.target.value })} maxLength={10} autoComplete="off" />
              <button type="button" className="arc-btn small danger" data-nav disabled={confirm[b.productId] !== 'DELETE'} onClick={() => void run(() => api(`/arcade/bin/${b.productId}/delete`, { body: { confirm: 'DELETE' } }))}>DELETE FOREVER</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="row-actions"><button type="button" className="arc-btn" data-nav onClick={onBack}>BACK</button></div>
    </div>
  );
}

// ---------- Milestone 5: Packs ----------

interface PacksData {
  open: { id: string; name: string; items: number; target_size: number; min_size: number; canBuild: boolean }[];
  packs: { productId: string; title: string; items: number; thumb: string | null; status: string; readyToSell: boolean; notReady: string | null; finalized: boolean; finalizedAt: string | null; qualifies: boolean; canFinalize: boolean; reviewable: boolean }[];
  rules: { qualifyingPackSize: number; packsPerBonus: number; packBonusCredits: number | null };
  qualifying: number;
  towardNextBonus: number;
}

export function PacksScreen({ character, onBack, onReview, onGo, onSoon }: { character: ArcadeCharacter | null; onBack: () => void; onReview: (productId: string) => void; onGo: (d: TabDestination) => void; onSoon: (d: string) => void }) {
  const { data, error, loading, reload } = useApi<PacksData>('/arcade/packs');
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openPack, setOpenPack] = useState<string | null>(null);
  const contents = useApi<{ items: { id: string; title: string; product_type: string }[] }>(openPack ? `/arcade/packs/${openPack}/contents` : null);
  useFocusMainWhenReady(!!data || !!error);
  const run = async (fn: () => Promise<any>, done: (r: any) => string) => {
    setProblem(null);
    setNotice(null);
    try { const r = await fn(); setNotice(done(r)); await reload(); } catch (e) { setProblem(errorText(e)); }
  };
  return (
    <div className="scr packs">
      <ArcadeTabs current="PACKS" onGo={onGo} onSoon={onSoon} />
      <h2 className="screen-title">PACKS / PACK POOL</h2>
      {data ? (
        <p className="fine center-text">
          A pack qualifies at {data.rules.qualifyingPackSize}+ items, ready to sell and finalized. QUALIFYING: <b>{data.qualifying}</b> · TOWARD NEXT BONUS: <b>{data.towardNextBonus} OF {data.rules.packsPerBonus}</b> · BONUS: {data.rules.packBonusCredits === null ? <NotSet /> : <b>+{data.rules.packBonusCredits}</b>}
        </p>
      ) : null}
      {loading && !data ? <Loading what="PACKS" /> : null}
      {error ? <LoadError what="PACKS" error={error} onRetry={() => void reload()} /> : null}
      {problem ? <p className="crt-error" role="alert">{problem}</p> : null}
      {notice ? <p className="lock-line center-text" role="status">{notice}</p> : null}

      {data?.open.length ? <h3 className="form-title">ON THE FACTORY FLOOR (COLLECTING)</h3> : null}
      <ol className="task-list">
        {(data?.open ?? []).map((c) => (
          <li key={c.id} className="task-row">
            <div className="task-main">
              <span className="task-title">{c.name}</span>
              <span className="task-tags"><span>ITEMS: {c.items} / {c.target_size}</span><span>IN PROGRESS</span></span>
            </div>
            <button type="button" className="arc-btn small" data-nav disabled={!c.canBuild} title={c.canBuild ? 'Make this cart into a pack' : `Needs at least ${Math.max(2, c.min_size)} items`} onClick={() => void run(() => api(`/arcade/packs/carts/${c.id}/build`, { body: {} }), () => 'PACK BUILT. IT GOES THROUGH QA, THEN APPROVE IT HERE.')}>BUILD PACK</button>
          </li>
        ))}
      </ol>

      <h3 className="form-title">PACKS</h3>
      {data && !data.packs.length ? <p className="hint-line center-text">NO PACKS YET. APPROVED ITEMS COLLECT INTO CARTS ON THE FACTORY FLOOR. <Link to="/packing">OPEN FACTORY FLOOR</Link></p> : null}
      <ol className="task-list">
        {(data?.packs ?? []).map((p) => (
          <li key={p.productId} className="task-row">
            {p.thumb ? <img className="asset-thumb" src={thumb(p.thumb)!} alt="" /> : null}
            <div className="task-main">
              <span className="task-title">{p.title}</span>
              <span className="task-tags">
                <span>ITEMS: {p.items}</span>
                <span>{p.status}</span>
                <span>{p.readyToSell ? 'READY TO SELL' : 'NOT READY'}</span>
                {p.qualifies ? <span className="good">QUALIFIES</span> : null}
                {p.finalizedAt ? <span>FINALIZED {day(p.finalizedAt)}</span> : null}
              </span>
              {p.notReady ? <span className="task-desc">{p.notReady}</span> : null}
            </div>
            <div className="mission-actions">
              <button type="button" className="arc-btn small" data-nav aria-expanded={openPack === p.productId} onClick={() => setOpenPack(openPack === p.productId ? null : p.productId)}>CONTENTS</button>
              {p.reviewable ? <button type="button" className="arc-btn small" data-nav onClick={() => onReview(p.productId)}>REVIEW</button> : null}
              <button type="button" className="arc-btn small primary" data-nav disabled={!p.canFinalize} title={p.finalized ? 'Already in the pool' : p.canFinalize ? 'Put it in the pack pool. This cannot be undone.' : 'Approve the pack first'} onClick={() => void run(() => api(`/arcade/packs/${p.productId}/finalize`, { body: { characterId: character?.id ?? null } }), (r) => `FINALIZED.${r.qualifies ? ' IT QUALIFIES.' : ''}${r.bonusPaid ? ` +${r.bonusPaid} EARNED CREDITS.` : ''}`)}>FINALIZE PACK</button>
            </div>
            {openPack === p.productId ? (
              <ul className="pack-contents">
                {contents.loading && !contents.data ? <li>LOADING...</li> : null}
                {(contents.data?.items ?? []).map((i) => <li key={i.id}>{i.title} <span className="fine">({i.product_type})</span></li>)}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="row-actions"><button type="button" className="arc-btn" data-nav onClick={onBack}>BACK TO HUB</button></div>
    </div>
  );
}

// ---------- Milestone 8: Leaderboards ----------

interface Boards {
  finished: { total: number; items: number; entries: { rank: number; productId: string; title: string; items: number; finalizedAt: string }[] };
  rejectedWell: { total: number; entries: { rank: number; characterId: string | null; count: number }[]; recent: { title: string; reason: string; decidedAt: string }[] };
  types: { type: string; total: number; items: { productId: string; title: string; pack: string; finalizedAt: string }[] }[];
  lastShipped: { productId: string; title: string; productType: string; finalizedAt: string }[];
}
const CHAR_NAME: Record<string, string> = { ide: 'GAGE', 'ai-chatbot': 'B.M.O.', daf: 'SPARKS' };

export function LeaderboardsScreen({ onBack, onGo, onSoon }: { onBack: () => void; onGo: (d: TabDestination) => void; onSoon: (d: string) => void }) {
  const { data, error, loading, reload } = useApi<Boards>('/arcade/leaderboards');
  const [type, setType] = useState<string | null>(null);
  useFocusMainWhenReady(!!data || !!error);
  const board = data?.types.find((t) => t.type === (type ?? data.types[0]?.type));
  return (
    <div className="scr leaderboards">
      <ArcadeTabs current="LEADERBOARDS" onGo={onGo} onSoon={onSoon} />
      <h2 className="screen-title">LEADERBOARDS</h2>
      {loading && !data ? <Loading what="LEADERBOARDS" /> : null}
      {error ? <LoadError what="LEADERBOARDS" error={error} onRetry={() => void reload()} /> : null}
      {data ? (
        <>
          <section className="hub-zone" aria-label="Finished">
            <h3 className="zone-title">FINISHED · {data.finished.total} PACKS · {data.finished.items} ITEMS</h3>
            <p className="fine">QA'd, finalized and in the pack pool. All three, or it isn't here.</p>
            {data.finished.entries.length ? (
              <ol className="score-table">{data.finished.entries.map((e) => <li key={e.productId}><span className="rank">{String(e.rank).padStart(2, '0')}</span> <span>{e.title}</span> <b>{e.items}</b></li>)}</ol>
            ) : <p className="hint-line">NO FINISHED PACKS YET.</p>}
          </section>
          <section className="hub-zone" aria-label="Rejected well">
            <h3 className="zone-title">REJECTED WELL · {data.rejectedWell.total}</h3>
            <p className="fine">Rejections with a specific reason of 2+ sentences that passed the check. Deletes never count.</p>
            {data.rejectedWell.entries.length ? (
              <ol className="score-table">{data.rejectedWell.entries.map((e) => <li key={e.characterId ?? 'none'}><span className="rank">{String(e.rank).padStart(2, '0')}</span> <span>{CHAR_NAME[e.characterId ?? ''] ?? 'BACK OFFICE'}</span> <b>{e.count}</b></li>)}</ol>
            ) : <p className="hint-line">NO QUALIFYING REJECTIONS YET.</p>}
          </section>
          <section className="hub-zone" aria-label="By asset type">
            <h3 className="zone-title">BY ASSET TYPE</h3>
            {data.types.length ? (
              <>
                <div className="idea-modes" role="tablist">
                  {data.types.map((t) => <button key={t.type} type="button" role="tab" className={`arc-btn small${board?.type === t.type ? ' primary' : ''}`} aria-selected={board?.type === t.type} data-nav onClick={() => setType(t.type)}>{t.type.toUpperCase()} ({t.total})</button>)}
                </div>
                <ol className="score-table">{(board?.items ?? []).map((i) => <li key={i.productId}><span>{i.title}</span> <span className="fine">{i.pack}</span></li>)}</ol>
              </>
            ) : <p className="hint-line">NOTHING FINISHED YET.</p>}
          </section>
          <section className="hub-zone" aria-label="Last 3 shipped">
            <h3 className="zone-title">LAST 3 SHIPPED</h3>
            {data.lastShipped.length ? <ol className="score-table">{data.lastShipped.map((s) => <li key={s.productId}><span>{s.title}</span> <span className="fine">{s.productType} · {day(s.finalizedAt)}</span></li>)}</ol> : <p className="hint-line">NOTHING SHIPPED YET.</p>}
            <p className="big-pixel center-text">MAKE SOMETHING DIFFERENT TODAY</p>
          </section>
        </>
      ) : null}
      <div className="row-actions"><button type="button" className="arc-btn" data-nav onClick={onBack}>BACK TO HUB</button></div>
    </div>
  );
}

// ---------- Milestone 7: Codex / Quest Log ----------

interface Codex {
  character: { id: string; displayName: string; role: string };
  xp: number;
  xpUnset: boolean;
  stats: Record<'eye' | 'craft' | 'taste' | 'patience', number | null>;
  quests: { done: { title: string; difficulty: string | null; xp: number | null; at: string }[]; open: { id: string; title: string; difficulty: string; world: string }[] };
  tabs: { learned: string[]; total: number; left: string[] };
  crossTab: { id: string; label: string; how: string; learned: boolean }[];
}

export function CodexScreen({ character, onBack, onGo, onSoon }: { character: ArcadeCharacter | null; onBack: () => void; onGo: (d: TabDestination) => void; onSoon: (d: string) => void }) {
  const { data, error, loading, reload } = useApi<Codex>(character ? `/arcade/codex?character=${encodeURIComponent(character.id)}` : null);
  useFocusMainWhenReady(!!data || !!error || !character);
  return (
    <div className="scr codex">
      <ArcadeTabs current="CODEX" onGo={onGo} onSoon={onSoon} />
      <h2 className="screen-title">CODEX / QUEST LOG</h2>
      {!character ? <p className="hint-line center-text">PICK A PLAYER ON THE HUB FIRST.</p> : null}
      {loading && !data ? <Loading what="CODEX" /> : null}
      {error ? <LoadError what="CODEX" error={error} onRetry={() => void reload()} /> : null}
      {data ? (
        <>
          <section className="hub-zone">
            <h3 className="zone-title">{data.character.displayName} · {data.character.role}</h3>
            <p className="big-pixel">CURRENT XP: {data.xp}{data.xpUnset ? <> <NotSet /></> : null}</p>
            {data.xpUnset ? <p className="fine">No XP amounts are set yet, so what you learn is recorded below but adds no XP. Set amounts in Settings → arcade → xp.</p> : null}
            <div className="codex-stats">
              {(['eye', 'craft', 'taste', 'patience'] as const).map((s) => <span key={s} className="codex-stat">{s.toUpperCase()}: {data.stats[s] ?? <NotSet />}</span>)}
            </div>
          </section>
          <section className="hub-zone">
            <h3 className="zone-title">QUESTS · {data.quests.done.length} DONE · {data.quests.open.length} OPEN</h3>
            <ul className="score-table">
              {data.quests.open.slice(0, 10).map((q) => <li key={q.id}><span className={`diff diff-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span> <span>{q.title}</span> <span className="fine">{q.world}</span></li>)}
              {data.quests.done.slice(0, 10).map((q) => <li key={q.at + q.title} className="done"><span className="mission-check">✓</span> <span>{q.title}</span> <span className="fine">{q.difficulty} · {q.xp === null ? 'XP NOT SET' : `+${q.xp} XP`}</span></li>)}
            </ul>
          </section>
          <section className="hub-zone">
            <h3 className="zone-title">TAB KNOWLEDGE · {data.tabs.learned.length} OF {data.tabs.total}</h3>
            <p className="fine">Clear a screen's mission on the MISSIONS tab while playing {data.character.displayName} to learn that tab.</p>
            {data.tabs.left.length ? <p className="fine">STILL TO LEARN: {data.tabs.left.slice(0, 8).join(' · ')}{data.tabs.left.length > 8 ? ' …' : ''}</p> : null}
          </section>
          <section className="hub-zone">
            <h3 className="zone-title">CROSS-TAB LEARNING · {data.crossTab.filter((c) => c.learned).length} OF {data.crossTab.length}</h3>
            <ul className="score-table">{data.crossTab.map((c) => <li key={c.id} className={c.learned ? 'done' : ''}><span>{c.learned ? '✓' : '·'}</span> <span>{c.label}</span> <span className="fine">{c.how}</span></li>)}</ul>
          </section>
        </>
      ) : null}
      <div className="row-actions"><button type="button" className="arc-btn" data-nav onClick={onBack}>BACK TO HUB</button></div>
    </div>
  );
}

// ---------- B.M.O.: the advisor that can act ----------

type BmoAction =
  | { kind: 'create_world'; name: string; description: string; milestones: string[] }
  | { kind: 'add_task'; worldId: string; milestoneId: string; title: string; characterId: string; taskType: string; difficulty: string; estimatedEffort: number }
  | { kind: 'make_product'; productType: string; title: string; brief: string };
interface Turn { role: 'owner' | 'bmo'; text: string; actions?: { action: BmoAction; why: string; proposalId: string; state?: 'done' | 'skipped' | 'saved' | 'failed'; note?: string }[] }
interface SavedIdea { id: string; action: BmoAction; why: string; savedAt: string }

function describe(a: BmoAction): string {
  if (a.kind === 'create_world') return `MAKE A WORLD "${a.name}" with milestones: ${a.milestones.join(', ')}`;
  if (a.kind === 'add_task') return `ADD A TASK "${a.title}" for ${CHAR_NAME[a.characterId] ?? a.characterId} (${a.taskType}, ${a.difficulty}, ${a.estimatedEffort} pts)`;
  return `START MAKING "${a.title}" (${a.productType})`;
}

export function BmoScreen({ onBack }: { onBack: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const saved = useApi<{ ideas: SavedIdea[] }>('/arcade/bmo/saved');
  const [savedNote, setSavedNote] = useState<string | null>(null);
  useFocusMainWhenReady(true);
  const history = useMemo(() => turns.map((t) => ({ role: t.role, text: t.text })), [turns]);
  const ask = async (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    const next = [...turns, { role: 'owner' as const, text: q }];
    setTurns(next);
    setText('');
    setBusy(true);
    setProblem(null);
    try {
      const r = await api<{ reply: string; actions: { action: BmoAction; why: string; proposalId: string }[] }>('/arcade/bmo/chat', { body: { messages: [...history, { role: 'owner', text: q }] } });
      setTurns([...next, { role: 'bmo', text: r.reply, actions: r.actions }]);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const answer = async (ti: number, ai: number, choice: 'yes' | 'no' | 'save') => {
    const t = turns[ti]!;
    const a = t.actions![ai]!;
    let state: 'done' | 'skipped' | 'saved' | 'failed' = 'skipped';
    let note = '';
    if (choice === 'yes') {
      try { await api('/arcade/bmo/act', { body: { proposalId: a.proposalId } }); state = 'done'; } catch (err) { state = 'failed'; note = errorText(err); }
    } else if (choice === 'save') {
      try { await api('/arcade/bmo/save', { body: { proposalId: a.proposalId } }); state = 'saved'; await saved.reload(); } catch (err) { state = 'failed'; note = errorText(err); }
    } else {
      await api('/arcade/bmo/decline', { body: { proposalId: a.proposalId } }).catch(() => undefined);
    }
    setTurns(turns.map((x, i) => (i === ti ? { ...x, actions: x.actions!.map((y, j) => (j === ai ? { ...y, state, note } : y)) } : x)));
  };
  return (
    <div className="scr bmo">
      <h2 className="screen-title">B.M.O. · YOUR ADVISOR</h2>
      <p className="fine center-text">Ask about your worlds, products, QA, packs or sales. B.M.O. answers only from what the factory has recorded and says when it has no data. It can suggest actions; nothing happens until you press YES on one. Like one but not ready? SAVE FOR LATER keeps it here.</p>
      {saved.data?.ideas.length ? (
        <section className="hub-zone" aria-label="Saved ideas">
          <h3 className="zone-title">SAVED IDEAS · {saved.data.ideas.length}</h3>
          <ul className="saved-ideas">
            {saved.data.ideas.map((s) => (
              <li key={s.id} className="bmo-action">
                <p className="crt-text">{describe(s.action)}</p>
                <p className="fine">{s.why}{s.why ? ' · ' : ''}SAVED {day(s.savedAt)}</p>
                <div className="row-actions">
                  <button type="button" className="arc-btn small primary" data-nav onClick={() => void (async () => {
                    setSavedNote(null);
                    try { await api(`/arcade/bmo/saved/${s.id}/act`, { body: {} }); setSavedNote(`✓ DONE: ${describe(s.action)}`); } catch (err) { setSavedNote(`DIDN'T WORK: ${errorText(err)}`); }
                    await saved.reload();
                  })()}>DO IT</button>
                  <button type="button" className="arc-btn small" data-nav onClick={() => void api(`/arcade/bmo/saved/${s.id}`, { method: 'DELETE' }).then(() => saved.reload(), (err) => setSavedNote(errorText(err)))}>DISCARD</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {savedNote ? <p className={savedNote.startsWith('✓') ? 'done-line center-text' : 'crt-error'} role="status">{savedNote}</p> : null}
      <ol className="chat-log" aria-live="polite">
        {turns.map((t, ti) => (
          <li key={ti} className={`chat-turn ${t.role}`}>
            <b>{t.role === 'owner' ? 'YOU' : 'B.M.O.'}:</b> <span>{t.text}</span>
            {t.actions?.map((a, ai) => (
              <div key={ai} className="bmo-action">
                <p className="crt-text">{describe(a.action)}</p>
                <p className="fine">{a.why}</p>
                {a.state ? <p className={a.state === 'failed' ? 'form-error' : 'fine'}>{a.state === 'done' ? '✓ DONE' : a.state === 'saved' ? '★ SAVED FOR LATER' : a.state === 'skipped' ? 'SKIPPED' : `DIDN'T WORK: ${a.note}`}</p> : (
                  <div className="row-actions">
                    <button type="button" className="arc-btn small primary" data-nav onClick={() => void answer(ti, ai, 'yes')}>YES, DO IT</button>
                    <button type="button" className="arc-btn small" data-nav onClick={() => void answer(ti, ai, 'save')}>SAVE FOR LATER</button>
                    <button type="button" className="arc-btn small" data-nav onClick={() => void answer(ti, ai, 'no')}>NO</button>
                  </div>
                )}
              </div>
            ))}
          </li>
        ))}
        {busy ? <li className="chat-turn bmo blink-slow">B.M.O. IS THINKING...</li> : null}
      </ol>
      {problem ? <p className="crt-error" role="alert">{problem}</p> : null}
      <form className="arc-form" onSubmit={ask}>
        <label>ASK B.M.O.<textarea data-nav data-autofocus value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} placeholder="What should I make next? Which world is closest to done?" /></label>
        <button type="submit" className="arc-btn primary" data-nav disabled={busy || !text.trim()}>{busy ? 'SENDING...' : 'ASK'}</button>
      </form>
      <div className="row-actions"><button type="button" className="arc-btn" data-nav onClick={onBack}>BACK TO HUB</button></div>
    </div>
  );
}

export type TabDestination = 'WORLDS' | 'MISSIONS' | 'PACKS' | 'LEADERBOARDS' | 'CODEX';
