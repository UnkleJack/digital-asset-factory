import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, errorText, useApi } from '../api.ts';

// The stats ticker on the hub (owner request, 2026-11-05): the stats the owner picked, at a glance, beside
// the STATS button. EDIT lists every stat the factory can report. Nothing recorded shows NO DATA, never a
// made-up 0, and each sales source is its own stat (sources are never added together).

type Unit = 'count' | 'usd' | 'cents' | 'minutes' | 'percent';
interface Stat { id: string; label: string; group: string; unit: Unit; help: string }
interface Item extends Stat { value: number | null; note?: string; test?: boolean }

const MAX_STATS = 16;
const GROUP_ORDER = ['Arcade', 'Sales', 'Listings', 'Production', 'AI'];

export function formatStat(unit: Unit, v: number | null): string {
  if (v === null) return 'NO DATA';
  switch (unit) {
    case 'usd': return `$${v.toFixed(2)}`;
    case 'cents': return `$${(v / 100).toFixed(2)}`;
    case 'minutes': return `${Math.round(v)} MIN`;
    case 'percent': return `${Math.round(v)}%`;
    default: return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  }
}

function Tick({ item }: { item: Item }) {
  return (
    <span className="tick" title={item.help}>
      <span className="tick-label">{item.label}</span>
      <b className={item.value === null ? 'tick-value nodata' : 'tick-value'}>{formatStat(item.unit, item.value)}</b>
      {item.note ? <small className="tick-note">{item.note}</small> : null}
      {item.test ? <small className="tick-tag">TEST</small> : null}
    </span>
  );
}

export function StatsTicker({ character, reduced }: { character: string | null; reduced: boolean }) {
  const { data, error, reload } = useApi<{ items: Item[] }>(`/arcade/ticker${character ? `?character=${encodeURIComponent(character)}` : ''}`, { poll: 15000 });
  const [editing, setEditing] = useState(false);
  const items = data?.items ?? [];
  // Scroll speed stays readable however many stats are picked.
  const seconds = Math.max(18, items.length * 5);
  return (
    <div className="ticker-box">
      {error ? <p className="form-error" role="alert">Stats didn't load: {error}</p> : null}
      {data && items.length === 0 ? <p className="fine center-text">No stats picked. Press EDIT TICKER to choose some.</p> : null}
      {items.length ? (
        <div className={`ticker${reduced ? ' static' : ''}`} aria-label="Your stats at a glance">
          <div className="ticker-track" style={reduced ? undefined : { animationDuration: `${seconds}s` }}>
            <span className="ticker-run">{items.map((i) => <Tick key={i.id} item={i} />)}</span>
            {!reduced ? <span className="ticker-run" aria-hidden="true">{items.map((i) => <Tick key={i.id} item={i} />)}</span> : null}
          </div>
        </div>
      ) : null}
      <div className="row-actions">
        <Link className="arc-btn" data-nav to="/analytics" title="Sales, listings and production in the back office. An arcade-styled stats page comes later.">STATS</Link>
        <button type="button" className="arc-btn small" data-nav aria-expanded={editing} onClick={() => setEditing((e) => !e)}>{editing ? 'CLOSE EDIT' : 'EDIT TICKER'}</button>
      </div>
      {editing ? <TickerEditor onDone={() => { setEditing(false); void reload(); }} /> : null}
    </div>
  );
}

function TickerEditor({ onDone }: { onDone: () => void }) {
  const { data, error } = useApi<{ stats: Stat[]; chosen: string[] }>('/arcade/ticker/catalog');
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (data && chosen === null) setChosen(data.chosen);
  }, [data, chosen]);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!data || !chosen) return <p className="fine center-text blink-slow">LOADING STATS...</p>;
  const byId = new Map(data.stats.map((s) => [s.id, s]));
  const full = chosen.length >= MAX_STATS;
  const toggle = (id: string) => setChosen((c) => (c!.includes(id) ? c!.filter((x) => x !== id) : c!.length >= MAX_STATS ? c : [...c!, id]));
  const move = (i: number, step: -1 | 1) => setChosen((c) => {
    const next = [...c!];
    const j = i + step;
    if (j < 0 || j >= next.length) return next;
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  });
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api('/settings/arcade', { method: 'PATCH', body: { tickerStats: chosen } });
      onDone();
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const groups = [...new Set(data.stats.map((s) => s.group))].sort((a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));

  return (
    <div className="arc-form ticker-editor">
      <h3 className="form-title">ON THE TICKER, IN ORDER ({chosen.length}/{MAX_STATS})</h3>
      {chosen.length === 0 ? <p className="fine">Nothing yet. Pick stats from the list below.</p> : null}
      <ol className="ticker-order">
        {chosen.map((id, i) => (
          <li key={id}>
            <span className="task-title">{byId.get(id)?.label ?? id}</span>
            <span className="task-controls">
              <button type="button" className="arc-btn small" data-nav disabled={i === 0} aria-label={`Move ${byId.get(id)?.label} up`} onClick={() => move(i, -1)}>▲</button>
              <button type="button" className="arc-btn small" data-nav disabled={i === chosen.length - 1} aria-label={`Move ${byId.get(id)?.label} down`} onClick={() => move(i, 1)}>▼</button>
              <button type="button" className="arc-btn small" data-nav aria-label={`Take ${byId.get(id)?.label} off the ticker`} onClick={() => toggle(id)}>✕</button>
            </span>
          </li>
        ))}
      </ol>
      <h3 className="form-title">EVERY STAT</h3>
      <p className="fine">NO DATA means nothing is recorded yet: the factory never fills in a number. Sales from different sources are separate stats and are never added together.</p>
      {groups.map((g) => (
        <div key={g} className="stat-group" role="group" aria-label={g}>
          <p className="zone-title small">{g.toUpperCase()}</p>
          {data.stats.filter((s) => s.group === g).map((s) => {
            const on = chosen.includes(s.id);
            return (
              <button key={s.id} type="button" role="checkbox" aria-checked={on} className={`stat-pick${on ? ' on' : ''}`} data-nav disabled={!on && full} onClick={() => toggle(s.id)}>
                <span className="pick-box" aria-hidden="true">{on ? '■' : '□'}</span>
                <span className="pick-text"><span className="task-title">{s.label}</span><span className="fine">{s.help}</span></span>
              </button>
            );
          })}
        </div>
      ))}
      {full ? <p className="fine">The ticker holds {MAX_STATS} stats. Take one off to add another.</p> : null}
      {problem ? <p className="form-error" role="alert">{problem}</p> : null}
      <div className="row-actions">
        <button type="button" className="arc-btn" data-nav disabled={busy} onClick={onDone}>CANCEL</button>
        <button type="button" className="arc-btn primary" data-nav disabled={busy} onClick={() => void save()}>{busy ? 'SAVING...' : 'SAVE TICKER'}</button>
      </div>
    </div>
  );
}
