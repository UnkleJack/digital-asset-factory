import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api } from './api.ts';

/**
 * A pack being built in the "Build a pack" window, kept while the owner goes off to fix a product
 * that is blocking it (approve it in Batch review, accept its warnings, and so on). Everything typed
 * is kept, and when the product is fixed the app brings the owner back to the same window.
 * Kept in this browser tab only (sessionStorage); nothing is saved on the server.
 */
export interface PackDraft {
  picked: string[];
  title: string;
  theme: string;
  pitch: string;
  titles: string[];
  markets: string[];
  /** The page the pack window was opened on. */
  returnTo: string;
  /** The product the owner went to fix. */
  fixing: { productId: string; title: string } | null;
  /** Set when the owner is on their way back, so the window reopens on arrival. */
  resume: boolean;
  at: number;
}

/** What the server says is blocking one picked product (see checkBundleMembers). */
export interface BundleProblem {
  productId: string;
  title: string;
  reason: 'not_approved' | 'warnings' | 'qa' | 'other';
  message: string;
  batchId: string | null;
  itemId: string | null;
}

const KEY = 'daf:packDraft';
const EVENT = 'daf:packdraft';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function loadDraft(): PackDraft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as PackDraft | null;
    return d && Date.now() - d.at < MAX_AGE_MS ? d : null;
  } catch {
    return null;
  }
}

export function saveDraft(d: Omit<PackDraft, 'at'>) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...d, at: Date.now() })); } catch { /* storage blocked: the pack window just won't be restored */ }
  window.dispatchEvent(new Event(EVENT));
}

export function clearDraft() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  window.dispatchEvent(new Event(EVENT));
}

/** The draft to reopen on arrival, if the owner was sent back to this page. Reading does not clear it. */
export function resumeDraftFor(path: string): PackDraft | null {
  const d = loadDraft();
  return d?.resume && d.returnTo.split('?')[0] === path ? d : null;
}

/**
 * Opens the host page's pack window when the owner is sent back to it. Runs on arrival and also when the page is
 * already showing (the fix happened on this same page), since then nothing remounts.
 */
export function usePackResume(open: () => void) {
  const loc = useLocation();
  useEffect(() => {
    const look = () => { if (resumeDraftFor(loc.pathname)) open(); };
    look();
    window.addEventListener(EVENT, look);
    return () => window.removeEventListener(EVENT, look);
  }, [loc.pathname]);
}

/** Where to go to fix a blocked product: its Batch review item when it has one, otherwise its own page. */
export function fixPath(p: BundleProblem): string {
  return p.batchId && p.itemId ? `/batches/${p.batchId}?item=${p.itemId}` : `/products/${p.productId}`;
}

export function fixHint(p: BundleProblem): string {
  if (p.reason === 'other') return 'This one cannot be fixed here. Take it out of the pack.';
  if (p.reason === 'qa') return 'Click here to open it and fix what QA found.';
  // Without a batch item the link goes to the product's own page, so say so.
  const where = p.batchId && p.itemId ? 'in Batch review' : 'on its product page';
  if (p.reason === 'warnings') return `Click here to open it ${where} and accept or fix its warnings.`;
  return `Click here to open it ${where} and approve it.`;
}

/**
 * A bar across the top of every back-office page while the owner is away fixing a pack's product.
 * It keeps checking, and the moment nothing blocks that product any more it takes them back.
 */
export function PackReturnBar() {
  const nav = useNavigate();
  const [draft, setDraft] = useState<PackDraft | null>(() => loadDraft());
  const [fixed, setFixed] = useState(false);
  useEffect(() => {
    const sync = () => setDraft(loadDraft());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const away = !!draft?.fixing && !draft.resume;
  const goBack = (d: PackDraft) => {
    saveDraft({ ...d, resume: true });
    setFixed(false);
    nav(d.returnTo);
  };
  useEffect(() => {
    if (!away || !draft) return;
    let live = true;
    const look = async () => {
      try {
        const r = await api<{ problems: BundleProblem[] }>('/bundles/check', { body: { productIds: draft.picked } });
        if (live && !r.problems.some((p) => p.productId === draft.fixing!.productId)) {
          setFixed(true);
          goBack(draft);
        }
      } catch { /* try again on the next look */ }
    };
    void look();
    const t = setInterval(look, 3000);
    return () => { live = false; clearInterval(t); };
  }, [away, draft?.at]);
  if (!draft || !away) return null;
  return (
    <div className="banner info pack-bar" role="status">
      <div className="spread">
        <span>{fixed ? 'Fixed. Taking you back to your pack…' : <>Fixing <b>{draft.fixing!.title}</b> for your pack. You'll be taken straight back to it when it's ready.</>}</span>
        <span className="row"><button className="small primary" onClick={() => goBack(draft)}>Back to my pack now</button><button className="small" onClick={clearDraft}>Forget this pack</button></span>
      </div>
    </div>
  );
}
