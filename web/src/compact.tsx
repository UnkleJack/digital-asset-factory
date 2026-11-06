import { useState, type ReactNode } from 'react';
import { assetUrl } from './api.ts';

/*
 * The compact list used by every page that lists the factory's output.
 * One slim line per item inside a box of fixed height, a true count, a "Load more" button,
 * and pictures only when Preview is pressed (one open at a time, so only one image loads).
 * The Imports page (PR #17) uses the same look; it moves onto these pieces once #17 is merged.
 */

/** The box: a header with the real count, the rows scrolling inside, and Load more under them. */
export function CompactList({ total, shown, onMore, children, noun = 'items', tools, height }: {
  total: number | null | undefined;
  shown: number;
  onMore?: () => void;
  children: ReactNode;
  noun?: string;
  tools?: ReactNode;
  /** Box height in px, or 'none' to let it grow (used while a full review card is open). */
  height?: number | 'none';
}) {
  const all = total ?? shown;
  const more = onMore && shown < all;
  return (
    <div className="clist-wrap">
      <div className="clist-head">
        <span className="small muted">{all === 0 ? `No ${noun}` : shown >= all ? `${all} ${noun}` : `Showing ${shown} of ${all} ${noun}`}</span>
        {tools && <span className="row">{tools}</span>}
      </div>
      <div className="clist" style={height ? { maxHeight: height } : undefined} role="region" aria-label={`${noun} list`} tabIndex={0}>
        {children}
        {more && <div className="clist-more"><button className="small" onClick={onMore}>Load more ({all - shown} more)</button></div>}
      </div>
    </div>
  );
}

/** A slim line: main text on the left, small details under it, actions on the right. Extra content (a preview) goes below. */
export function CompactRow({ main, sub, actions, children, className = '' }: { main: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`crow ${className}`} role="listitem">
      <div className="crow-line">
        <div className="crow-main"><div className="crow-title">{main}</div>{sub && <div className="small muted crow-sub">{sub}</div>}</div>
        {actions && <div className="row crow-actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** One open preview per list. `toggle(id)` opens that one and closes any other. */
export function usePreview() {
  const [open, setOpen] = useState<string | null>(null);
  return { open, toggle: (id: string) => setOpen((cur) => (cur === id ? null : id)), close: () => setOpen(null) };
}

export function PreviewButton({ open, onClick, disabled, label = 'Preview' }: { open: boolean; onClick: () => void; disabled?: boolean; label?: string }) {
  return <button className="small" aria-expanded={open} disabled={disabled} title={disabled ? 'No preview yet' : undefined} onClick={onClick}>{open ? 'Hide preview' : label}</button>;
}

/** The picture under a row. Pass asset ids (page previews) or plain URLs. Only rendered while open. */
export function PreviewPane({ assets = [], urls = [], alt }: { assets?: (string | null | undefined)[]; urls?: string[]; alt: string }) {
  const srcs = [...assets.filter(Boolean).map((id) => assetUrl(id as string)), ...urls];
  if (!srcs.length) return <div className="cpreview"><span className="small muted">No preview yet.</span></div>;
  return (
    <div className="cpreview">
      {srcs.map((src, i) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt={srcs.length > 1 ? `${alt}, page ${i + 1}` : alt} /></a>)}
    </div>
  );
}

/** The "Show done" switch: finished and rejected work is hidden until it is ticked. */
export function ShowDone({ value, onChange, text = 'Show done' }: { value: boolean; onChange: (v: boolean) => void; text?: string }) {
  return <label className="check small"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {text}</label>;
}

/** For lists the page already has in full: show the first `size`, then `size` more per press. */
export function useReveal<T>(items: T[] | null | undefined, size = 50) {
  const [n, setN] = useState(size);
  const list = items ?? [];
  return { shown: list.slice(0, n), total: list.length, more: () => setN((x) => x + size) };
}
