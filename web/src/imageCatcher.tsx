// Drop a picture anywhere in the app, on any page, and it goes into the image library, the same as
// dropping it in the box on the Imports page. A drop on that box still goes to the box, so the
// "Made with" and prompt fields there are saved with it.
import { useEffect, useState } from 'react';
import { useToast } from './ui.tsx';
import { NO_PICTURE, importPictures, picturesIn, type ImportResult } from './imageImport.ts';

/** Drags that may hold a picture: files, or something dragged out of a web page. Plain text is left alone. */
function mayHoldPicture(e: DragEvent): boolean {
  const types = [...(e.dataTransfer?.types ?? [])];
  return types.includes('Files') || types.includes('text/html') || types.includes('text/uri-list');
}

/** Typing boxes keep their own drop behaviour (dropping a link into a text box should type it). */
function inTypingBox(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  return !!t?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function summary(results: ImportResult[]): { text: string; bad: boolean } {
  const n = (s: ImportResult['status'][]) => results.filter((r) => s.includes(r.status)).length;
  const ok = n(['imported']), dup = n(['duplicate']), failed = results.filter((r) => r.status === 'rejected' || r.status === 'error');
  const parts = [
    ok && `${ok} picture${ok === 1 ? '' : 's'} imported to the image library`,
    dup && `${dup} already in the library, skipped`,
    failed.length && `${failed.length} not imported: ${failed[0].detail}`,
  ].filter(Boolean);
  return { text: parts.join(' · ') || 'Nothing was imported.', bad: ok === 0 && dup === 0 };
}

export function ImageCatcher() {
  const toast = useToast();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // Child elements fire their own enter/leave as the pointer moves, so count them to know when the drag left the window.
    let depth = 0;
    // A drag that started inside the app (a link, a thumbnail) is not a picture coming in.
    let fromInside = false;
    const ours = (e: DragEvent) => !fromInside && mayHoldPicture(e) && !inTypingBox(e);
    const reset = () => { depth = 0; setOver(false); };

    const onStart = () => { fromInside = true; };
    const onEnd = () => { fromInside = false; reset(); };
    const onEnter = (e: DragEvent) => {
      if (!ours(e)) return;
      e.preventDefault();
      depth += 1;
      setOver(true);
    };
    const onOver = (e: DragEvent) => {
      if (!ours(e)) return;
      // Without this the browser opens the picture itself and the app is gone.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!ours(e)) return;
      depth -= 1;
      if (depth <= 0) reset();
    };
    const onDrop = (e: DragEvent) => {
      const wanted = ours(e);
      reset();
      fromInside = false;
      // Already taken by a drop box on the page (the Imports box), or not a picture drag at all.
      if (!wanted || e.defaultPrevented || !e.dataTransfer) return;
      e.preventDefault();
      // Read what was dropped now: the browser empties it once this handler returns.
      const items = picturesIn(e.dataTransfer);
      if (!items.length) { toast(NO_PICTURE, 'bad'); return; }
      void (async () => {
        const results = await importPictures(items, {}, (step) => setBusy(step));
        setBusy(null);
        const s = summary(results);
        toast(s.text, s.bad ? 'bad' : undefined);
      })();
    };

    window.addEventListener('dragstart', onStart);
    window.addEventListener('dragend', onEnd);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragstart', onStart);
      window.removeEventListener('dragend', onEnd);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [toast]);

  return (
    <>
      {over && <div className="drop-anywhere" aria-hidden="true"><div>Drop to add to the image library</div></div>}
      {busy && <div className="drop-busy" role="status">{busy}</div>}
    </>
  );
}
