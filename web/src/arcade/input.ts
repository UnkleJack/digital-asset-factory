import { useEffect, useRef, type RefObject } from 'react';

// Keyboard and controller input for the arcade (spec G4/G5 proposed mappings).
// Directions move focus through the screen's [data-nav] controls in reading order;
// Enter/Space activate the focused control (native button behaviour); Esc goes back.
// Controller: D-pad / left stick move, A selects, B goes back, Start = start, Select = insert coin.

export type Direction = 'up' | 'down' | 'left' | 'right';

interface Handlers {
  onBack: () => void;
  onStart: () => void;
  onSelect: () => void;
  onMove?: (d: Direction) => void;
}

const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

export function moveFocus(root: HTMLElement, dir: Direction): void {
  const items = [...root.querySelectorAll<HTMLElement>('[data-nav]')].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!items.length) return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  const step = dir === 'up' || dir === 'left' ? -1 : 1;
  const next = current === -1 ? 0 : (current + step + items.length) % items.length;
  items[next]!.focus();
}

export function useArcadeInput(rootRef: RefObject<HTMLElement | null>, handlers: Handlers): void {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTyping(document.activeElement)) {
        if (e.key === 'Escape') (document.activeElement as HTMLElement).blur();
        return;
      }
      const root = rootRef.current;
      const dir = KEY_DIRS[e.key];
      if (dir && root) {
        e.preventDefault();
        moveFocus(root, dir);
        h.current.onMove?.(dir);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        h.current.onBack();
        return;
      }
      // Enter/Space with nothing focused on the screen: press the screen's main control.
      if ((e.key === 'Enter' || e.key === ' ') && root && !root.contains(document.activeElement)) {
        const main = root.querySelector<HTMLElement>('[data-autofocus]');
        if (main) {
          e.preventDefault();
          main.click();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rootRef]);

  // Controllers: the Gamepad API has no events for buttons, so poll once per frame while one is connected.
  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    let frame = 0;
    const prev = new Map<string, boolean>();
    const lastMove = { at: 0 };
    const edge = (key: string, pressed: boolean) => {
      const was = prev.get(key) ?? false;
      prev.set(key, pressed);
      return pressed && !was;
    };
    const tick = (now: number) => {
      const pads = navigator.getGamepads?.() ?? [];
      for (const pad of pads) {
        if (!pad) continue;
        const b = (i: number) => !!pad.buttons[i]?.pressed;
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        const dirs: [Direction, boolean][] = [
          ['up', b(12) || ay < -0.6], ['down', b(13) || ay > 0.6], ['left', b(14) || ax < -0.6], ['right', b(15) || ax > 0.6],
        ];
        const root = rootRef.current;
        for (const [d, on] of dirs) {
          const key = `${pad.index}:${d}`;
          const first = edge(key, on);
          // First press moves at once; holding repeats every 220 ms.
          if (on && root && (first || now - lastMove.at > 220)) {
            lastMove.at = now;
            moveFocus(root, d);
            h.current.onMove?.(d);
          }
        }
        if (edge(`${pad.index}:a`, b(0))) {
          const el = document.activeElement as HTMLElement | null;
          if (el && root?.contains(el) && el.matches('[data-nav]')) el.click();
          else root?.querySelector<HTMLElement>('[data-autofocus]')?.click();
        }
        if (edge(`${pad.index}:b`, b(1))) h.current.onBack();
        if (edge(`${pad.index}:start`, b(9))) h.current.onStart();
        if (edge(`${pad.index}:select`, b(8))) h.current.onSelect();
      }
      frame = requestAnimationFrame(tick);
    };
    const begin = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener('gamepadconnected', begin);
    if ([...(navigator.getGamepads?.() ?? [])].some(Boolean)) begin();
    return () => {
      window.removeEventListener('gamepadconnected', begin);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rootRef]);
}
