import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { assetUrl, errorText, thumbUrl } from './api.ts';
import { label } from './format.ts';

type Toast = { id: number; text: string; kind: 'ok' | 'bad' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'bad') => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'bad' ? 9000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind === 'bad' ? 'bad' : ''}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

const TONE: Record<string, string> = {
  ready: 'ok', approved: 'ok', passed: 'ok', succeeded: 'ok', completed: 'ok', published_verified: 'ok', meets_threshold: 'ok', active: 'ok', accepted: 'ok', measured: 'ok', closed: 'info',
  passed_with_warnings: 'warn', partial: 'warn', needs_reconciliation: 'warn', below_threshold: 'warn', insufficient_evidence: 'warn', queued: 'warn', pending: 'warn', in_progress: 'warn', collecting: 'warn', revision_requested: 'warn', regenerate_requested: 'warn', evaluating: 'warn', draft: 'warn', external_estimate: 'warn', catch_up: 'warn', manual_unverified: 'warn',
  failed: 'bad', qa_failed: 'bad', rejected: 'bad', policy_blocked: 'bad', invalid: 'bad', error: 'bad', model_hypothesis: 'bad',
  running: 'primary', ready_for_review: 'primary', export_prepared: 'primary', published_manual: 'primary', new: 'primary', produced: 'primary', api_verified: 'ok',
};

export function Pill({ value, text }: { value?: string | null; text?: string }) {
  if (!value) return <span className="pill">—</span>;
  const t = TONE[value] ?? '';
  const display = text ?? (value === 'published_manual' ? 'Published (manual, unverified)' : value === 'published_verified' ? 'Published (verified)' : label(value));
  return <span className={`pill ${t}`}>{display}</span>;
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <div className="loading"><span className="spinner" /> {text}</div>;
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return <div className="err">{error} {onRetry && <button className="small" onClick={onRetry} style={{ marginLeft: 8 }}>Try again</button>}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children && <div>{children}</div>}{action && <div style={{ marginTop: 12 }}>{action}</div>}</div>;
}

export function Async<T>({ state, children, empty }: { state: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (d: T) => ReactNode; empty?: (d: T) => boolean | ReactNode }) {
  if (state.error && !state.data) return <ErrorBox error={state.error} onRetry={state.reload} />;
  if (state.loading && !state.data) return <Loading />;
  if (!state.data) return null;
  return <>{children(state.data)}</>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="spread" style={{ marginBottom: 14 }}><h2 style={{ margin: 0 }}>{title}</h2><button className="small" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ActionButton({ onClick, children, className = '', confirm, disabled, title, successText }: { onClick: () => Promise<unknown>; children: ReactNode; className?: string; confirm?: string; disabled?: boolean; title?: string; successText?: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <button className={className} disabled={busy || disabled} title={title} onClick={async () => {
      if (confirm && !window.confirm(confirm)) return;
      setBusy(true);
      try {
        await onClick();
        if (successText) toast(successText);
      } catch (e) {
        toast(errorText(e), 'bad');
      } finally {
        setBusy(false);
      }
    }}>{busy && <span className="spinner" />}{children}</button>
  );
}

/** `thumb` loads a small copy that many px wide instead of the full image. */
export function AssetImg({ id, alt, className, thumb }: { id?: string | null; alt: string; className?: string; thumb?: number }) {
  if (!id) return <span className="muted small">No preview</span>;
  return <img src={thumb ? thumbUrl(id, thumb) : assetUrl(id)} alt={alt} loading="lazy" className={className} />;
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="spread" style={{ marginBottom: 10 }}>{title ? <h2 style={{ margin: 0 }}>{title}</h2> : <span />}{actions && <div className="row">{actions}</div>}</div>}
      {children}
    </section>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: ReactNode }[]; value: string; onChange: (id: string) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>;
}

export function CheckList({ results }: { results: { check_code: string; severity: string; passed: number | boolean; message: string }[] }) {
  if (!results.length) return <p className="muted small">No checks recorded.</p>;
  return (
    <div className="checks">
      {results.map((r, i) => {
        const ok = !!r.passed;
        const cls = ok ? 'ok' : r.severity === 'hard' ? 'bad' : 'warn';
        return <div key={i} className="check-row"><span className={`ic ${cls}`}>{ok ? '✓' : r.severity === 'hard' ? '✕' : '!'}</span><span><b>{label(r.check_code.replace(/:.*/, ''))}</b>{r.check_code.includes(':') ? ` (${r.check_code.split(':')[1]})` : ''} — {r.message}</span></div>;
      })}
    </div>
  );
}

export function Evidence({ kind }: { kind: string }) {
  const text: Record<string, string> = { measured: 'Measured', external_estimate: 'External estimate', model_hypothesis: 'AI hypothesis', unknown: 'Unknown' };
  return <Pill value={kind === 'unknown' ? undefined : kind} text={text[kind] ?? kind} />;
}

/**
 * "Clear view": hides a page's older rows from the screen without deleting anything.
 * The moment of the last clear is remembered in this browser; rows from before it are hidden,
 * rows that still need attention (passed as `keep`) always stay, and "Show cleared" brings the rest back.
 */
export function useClearView<T>(page: string, items: T[] | null | undefined, when: (item: T) => string | null | undefined, keep: (item: T) => boolean = () => false) {
  const storeKey = `daf.clearedAt.${page}`;
  const [clearedAt, setClearedAt] = useState<string | null>(() => { try { return localStorage.getItem(storeKey); } catch { return null; } });
  const [showCleared, setShowCleared] = useState(false);
  const save = (v: string | null) => {
    setClearedAt(v);
    setShowCleared(false);
    try { if (v) localStorage.setItem(storeKey, v); else localStorage.removeItem(storeKey); } catch { /* private window: the clear lasts until reload */ }
  };
  const list = items ?? [];
  const isHidden = (it: T) => { const t = when(it); return !!clearedAt && !keep(it) && !!t && t <= clearedAt; };
  const hiddenCount = list.filter(isHidden).length;
  const visible = showCleared ? list : list.filter((it) => !isHidden(it));
  const clearable = list.filter((it) => !keep(it)).length - hiddenCount;
  return { visible, hiddenCount, clearable, clearedAt, showCleared, setShowCleared, clear: () => save(new Date().toISOString()), restore: () => save(null), isHidden };
}

export function ClearViewControls({ view, noun = 'items' }: { view: ReturnType<typeof useClearView<any>>; noun?: string }) {
  return (
    <span className="row clear-view">
      {view.hiddenCount > 0 && (
        <label className="check small muted" title={`Cleared ${view.clearedAt ? new Date(view.clearedAt).toLocaleString() : ''}. Nothing was deleted.`}>
          <input type="checkbox" checked={view.showCleared} onChange={(e) => view.setShowCleared(e.target.checked)} />Show {view.hiddenCount} cleared {noun}
        </label>
      )}
      {view.hiddenCount > 0 && view.showCleared && <button className="small" onClick={view.restore}>Un-clear all</button>}
      <button className="small" disabled={view.clearable === 0} onClick={view.clear} title="Hides everything currently on this list. Nothing is deleted, and new items still appear.">Clear view</button>
    </span>
  );
}
