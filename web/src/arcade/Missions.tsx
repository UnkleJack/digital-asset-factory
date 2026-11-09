import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api, errorText, useApi } from '../api.ts';
import { useFocusMainWhenReady } from './input.ts';
import { ProgressBar, ArcadeTabs } from './Worlds.tsx';

// HAPPY DAFFY missions: learn the whole suite one guide chapter at a time (owner's choice, 2026-11-09).
// INSTRUCTIONS opens that chapter of the walkthrough guide as a text popup, so you can read up on a
// screen without leaving the cabinet or loading the screen itself.

interface Mission {
  id: string;
  number: number;
  title: string;
  route: string;
  done: boolean;
  completedAt: string | null;
  hasInstructions: boolean;
}
interface Instructions { id: string; title: string; text: string; source: string }

export function MissionsScreen({ onBack }: { onBack: () => void }) {
  const { data, error, loading, reload } = useApi<{ missions: Mission[]; guideFound: boolean }>('/arcade/missions');
  const [open, setOpen] = useState<Mission | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useFocusMainWhenReady(!!data);
  const missions = data?.missions ?? [];
  const doneCount = missions.filter((m) => m.done).length;

  const toggle = async (m: Mission) => {
    setBusy(m.id);
    setErr(null);
    try {
      await api(`/arcade/missions/${m.id}/done`, { method: m.done ? 'DELETE' : 'PUT' });
      await reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="scr missions">
      <div className="hub-zone">
        <h2 className="zone-title">MISSIONS: LEARN THE WHOLE FOUNDRY</h2>
        <p className="fine">One mission for each chapter of the walkthrough guide. INSTRUCTIONS shows that chapter as text, without opening the screen. GO opens the screen itself.</p>
        {data ? <ProgressBar value={missions.length ? doneCount / missions.length : 0} label={`${doneCount} of ${missions.length} missions done`} /> : null}
        {data ? <p className="fine">{doneCount} OF {missions.length} DONE</p> : null}
      </div>

      {loading && !data ? <p className="big-pixel center-text blink-slow">LOADING MISSIONS...</p> : null}
      {error ? <div className="empty-panel" role="alert"><p className="big-pixel bad">MISSIONS DIDN'T LOAD</p><p className="crt-text">{error}</p><button type="button" className="arc-btn small" data-nav onClick={() => void reload()}>RETRY</button></div> : null}
      {data && !data.guideFound ? <p className="lock-line center-text" role="status">THE WALKTHROUGH GUIDE ISN'T IN THIS COPY, SO INSTRUCTIONS ARE UNAVAILABLE</p> : null}
      {err ? <p className="crt-error" role="alert">{err}</p> : null}

      {missions.length ? (
        <ol className="mission-list">
          {missions.map((m, i) => (
            <li key={m.id} className={`mission${m.done ? ' done' : ''}`}>
              <span className="mission-num" aria-hidden="true">{String(m.number).padStart(2, '0')}</span>
              <span className="mission-title">{m.title}{m.done ? <span className="mission-check"> ✓ DONE</span> : null}</span>
              <span className="mission-actions">
                <button type="button" className="arc-btn small" data-nav {...(i === 0 ? { 'data-autofocus': true } : {})} disabled={!m.hasInstructions} title={m.hasInstructions ? 'Read this chapter of the guide' : 'This chapter is missing from the guide'} onClick={() => setOpen(m)}>
                  INSTRUCTIONS
                </button>
                {m.route === '/arcade' ? null : <Link className="arc-btn small" data-nav to={m.route} title={`Open ${m.title}`}>GO</Link>}
                <button type="button" className="arc-btn small" data-nav disabled={busy === m.id} aria-pressed={m.done} onClick={() => void toggle(m)}>
                  {m.done ? 'UNDO' : 'MARK DONE'}
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="row-actions">
        <button type="button" className="arc-btn" data-nav onClick={onBack}>BACK TO HUB</button>
      </div>
      <ArcadeTabs current="MISSIONS" onGo={(d) => d === 'WORLDS' && onBack()} onSoon={(d) => setErr(`${d} UNLOCKS IN A LATER BUILD`)} />

      {open ? <InstructionsPopup mission={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function InstructionsPopup({ mission, onClose }: { mission: Mission; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { data, error, loading } = useApi<Instructions>(`/arcade/missions/${mission.id}/instructions`);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="mission-popup"
      aria-labelledby="mission-popup-title"
      onClose={onClose}
      // Keys belong to the popup while it's open: arrows scroll the text, Esc closes it (not the screen).
      onKeyDown={(e) => {
        if (e.key.startsWith('Arrow') || e.key === 'Escape' || 'wasdWASD'.includes(e.key)) e.stopPropagation();
      }}
    >
      <div className="popup-head">
        <h3 id="mission-popup-title" className="zone-title">MISSION {String(mission.number).padStart(2, '0')}: {mission.title}</h3>
        <button type="button" className="arc-btn small" autoFocus onClick={() => ref.current?.close()}>CLOSE</button>
      </div>
      <div className="popup-body" tabIndex={0}>
        {loading && !data ? <p className="crt-text blink-slow">LOADING...</p> : null}
        {error ? <p className="crt-error" role="alert">{error}</p> : null}
        {data ? <GuideText text={data.text} /> : null}
      </div>
      {data ? <p className="fine">From the walkthrough guide ({data.source}).</p> : null}
    </dialog>
  );
}

// A small reader for the guide's Markdown: headings, paragraphs, lists, tables, **bold** and `code`.
// It builds React elements (no raw HTML), so nothing in the guide can inject markup.
export function GuideText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    const h = /^(#{2,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(<h4 key={i} className="guide-h">{inline(h[2]!)}</h4>);
      i++;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <table key={i} className="guide-table">
          {head ? <thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead> : null}
          <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
        </table>,
      );
      continue;
    }
    if (/^\s*(-|\d+\.)\s+/.test(line)) {
      const items: { depth: number; text: string; marker: string | null }[] = [];
      while (i < lines.length && (/^\s*(-|\d+\.)\s+/.test(lines[i]!) || (/^\s{2,}\S/.test(lines[i]!) && items.length))) {
        const l = lines[i]!;
        const m = /^(\s*)(-|\d+\.)\s+(.*)$/.exec(l);
        if (m) items.push({ depth: Math.floor(m[1]!.length / 2), text: m[3]!, marker: m[2] === '-' ? null : m[2]! });
        else items[items.length - 1]!.text += ' ' + l.trim();
        i++;
      }
      blocks.push(<ul key={i} className="guide-list">{items.map((it, k) => <li key={k} style={{ marginLeft: `${it.depth * 18}px` }} className={it.marker ? 'ordered' : undefined}>{it.marker ? `${it.marker} ` : null}{inline(it.text)}</li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{2,6}\s|\s*\||\s*(-|\d+\.)\s)/.test(lines[i]!)) para.push(lines[i++]!.trim());
    blocks.push(<p key={i} className="guide-p">{inline(para.join(' '))}</p>);
  }
  return <div className="guide-text">{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<code key={k++}>{m[2]}</code>);
    else out.push(<em key={k++}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
