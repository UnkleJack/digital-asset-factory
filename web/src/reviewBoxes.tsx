import { useRef, useState, type PointerEvent } from 'react';
import { assetUrl } from './api.ts';

/** A box being drawn, as shares of the page (0 to 1). */
export type DraftBox = { previewId: string; page: number; x: number; y: number; w: number; h: number };

/** A saved box, as the server sends it. */
export type SavedBox = { id: string; page: number; where: string; description: string | null; visionStatus: 'waiting' | 'described' | 'failed'; visionError: string | null; visionModel: string | null; hasPictures: boolean };

export const MAX_BOXES = 6;
const MIN = 0.01;

function where(b: { x: number; y: number; w: number; h: number }): string {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const v = cy < 1 / 3 ? 'top' : cy > 2 / 3 ? 'bottom' : 'middle';
  const hz = cx < 1 / 3 ? 'left' : cx > 2 / 3 ? 'right' : '';
  return v === 'middle' && !hz ? 'middle' : [v, hz].filter(Boolean).join(' ');
}

/**
 * Drag a box around the part of a page that is wrong, as a direct visual reference for the note.
 * The pages load only when "Draw a box" is pressed.
 */
export function BoxDrawer({ previews, boxes, setBoxes }: { previews: { id: string; page: number }[]; boxes: DraftBox[]; setBoxes: (b: DraftBox[]) => void }) {
  const [open, setOpen] = useState(boxes.length > 0);
  const [page, setPage] = useState(previews[0]?.id ?? '');
  const [drag, setDrag] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null);
  const frame = useRef<HTMLDivElement>(null);
  if (!previews.length) return <p className="small muted" style={{ margin: '0 0 8px' }}>No page previews yet, so there is nothing to draw a box on.</p>;
  const current = previews.find((p) => p.id === page) ?? previews[0]!;
  const at = (e: PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const rect = (d: { x0: number; y0: number; x1: number; y1: number }) => ({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) });
  const full = boxes.length >= MAX_BOXES;
  const style = (b: { x: number; y: number; w: number; h: number }, dashed = false) => ({ position: 'absolute' as const, left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, border: `3px ${dashed ? 'dashed' : 'solid'} #dc1e1e`, background: 'rgba(220,30,30,0.08)', pointerEvents: 'none' as const, boxSizing: 'border-box' as const });

  return (
    <div style={{ marginBottom: 8 }}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide pages' : boxes.length ? `Boxes drawn: ${boxes.length} (show)` : 'Draw a box on a page'}</button>
        {open && previews.length > 1 && previews.map((p) => (
          <button key={p.id} type="button" className={`small${p.id === current.id ? ' primary' : ''}`} onClick={() => setPage(p.id)}>Page {p.page}{boxes.some((b) => b.previewId === p.id) ? ' •' : ''}</button>
        ))}
      </div>
      {open && <>
        <p className="small muted" style={{ margin: '6px 0' }}>{full ? `That's the most boxes (${MAX_BOXES}) for one note.` : 'Drag across the part that is wrong. A box counts as saying which part, so your words only need to say what is wrong with it.'}</p>
        <div
          ref={frame}
          style={{ position: 'relative', maxWidth: 420, border: '1px solid var(--border)', cursor: full ? 'not-allowed' : 'crosshair', touchAction: 'none', userSelect: 'none' }}
          onPointerDown={(e) => { if (full) return; (e.target as Element).setPointerCapture?.(e.pointerId); const p = at(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }}
          onPointerMove={(e) => { if (drag) { const p = at(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } }}
          onPointerUp={() => {
            if (!drag) return;
            const r = rect(drag);
            setDrag(null);
            if (r.w >= MIN && r.h >= MIN) setBoxes([...boxes, { previewId: current.id, page: current.page, ...r }]);
          }}
        >
          <img src={assetUrl(current.id)} alt={`Page ${current.page}`} draggable={false} style={{ display: 'block', width: '100%' }} />
          {boxes.filter((b) => b.previewId === current.id).map((b, i) => <div key={i} style={style(b)} />)}
          {drag && <div style={style(rect(drag), true)} />}
        </div>
        {boxes.length > 0 && (
          <div className="stack" style={{ gap: 4, marginTop: 6 }}>
            {boxes.map((b, i) => (
              <div key={i} className="row small" style={{ gap: 8 }}>
                <span>Box {i + 1}: page {b.page}, {where(b)}</span>
                <button type="button" className="small" onClick={() => setBoxes(boxes.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </>}
    </div>
  );
}

const pictureUrl = (id: string, kind: 'crop' | 'page') => `/api/review-boxes/${id}/picture?kind=${kind}`;

/** Boxes saved with a decision: the cut-out (pressing it opens the page with the box outlined) and what the AI saw. */
export function SavedBoxes({ boxes }: { boxes?: SavedBox[] }) {
  const [show, setShow] = useState(false);
  if (!boxes?.length) return null;
  return (
    <div className="small" style={{ marginTop: 4 }}>
      <button type="button" className="small" onClick={() => setShow(!show)}>{show ? 'Hide boxes' : `Show ${boxes.length === 1 ? 'the box' : `${boxes.length} boxes`} you drew`}</button>
      {show && (
        <div className="stack" style={{ gap: 6, marginTop: 6 }}>
          {boxes.map((b) => (
            <div key={b.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              {b.hasPictures && <a href={pictureUrl(b.id, 'page')} target="_blank" rel="noreferrer" title="Open the page with the box outlined"><img src={pictureUrl(b.id, 'crop')} alt={`Boxed area, page ${b.page}`} style={{ maxWidth: 120, maxHeight: 120, border: '2px solid #dc1e1e' }} /></a>}
              <span>
                <b>Page {b.page}, {b.where}.</b>{' '}
                {b.visionStatus === 'described' ? <>AI saw: {b.description} <span className="muted">({b.visionModel})</span></>
                  : b.visionStatus === 'failed' ? <span className="muted">{b.visionError ?? 'The picture could not be read.'}</span>
                  : <span className="muted">Waiting for the picture-reading AI{b.visionError ? `: ${b.visionError}` : ''}. It tries again every minute.</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
