import { useState } from 'react';
import { Link } from 'react-router';
import { api, errorText, useApi } from '../api.ts';

// Mission reports (owner, 2026-11-10): some missions are cleared by trying the thing and writing back
// how it went, not by pressing MARK DONE. You pick the product you made and write a line or two. The
// report is also saved as a note for the AI on that product. Nothing is detected for you.
// Shared by the arcade's MISSIONS tab and the back-office Missions page; `arcade` picks the look.

export const REPORT_MIN = 15;
export const REPORT_MAX = 1000;

export interface MissionReportInfo { productId: string; productTitle: string; report: string; at: string }
export interface MissionPartInfo { id: string; title: string; productType: string; presetId: string | null; done: boolean; report: MissionReportInfo | null }
export interface ReportRule { ask: string; needsBrief: boolean }

interface Candidate { id: string; title: string; productType: string; updatedAt: string }

/** Where TRY IT goes: the New product form, with the part's preset filled in when it has one. */
export function tryItLink(part: MissionPartInfo | null): string {
  return part?.presetId ? `/library?new=1&preset=${encodeURIComponent(part.presetId)}` : '/library?new=1';
}

export function ReportForm({ missionId, rule, part, arcade, onDone, onCancel }: {
  missionId: string;
  rule: ReportRule;
  part: MissionPartInfo | null;
  arcade: boolean;
  onDone: (missionCleared: boolean) => void;
  onCancel: () => void;
}) {
  const products = useApi<Candidate[]>(`/arcade/missions/${missionId}/report-products${part ? `?part=${encodeURIComponent(part.id)}` : ''}`);
  const [productId, setProductId] = useState(part?.report?.productId ?? '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = products.data ?? [];
  const short = text.trim().length < REPORT_MIN;
  const btn = arcade ? 'arc-btn small' : 'small';
  const shout = (s: string) => (arcade ? s.toUpperCase() : s);

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ done: boolean }>(`/arcade/missions/${missionId}/report`, { body: { productId, report: text, ...(part && { partId: part.id }) } });
      onDone(r.done);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={arcade ? 'mission-report arc-form' : 'stack'}>
      <p className={arcade ? 'crt-text' : undefined}>{rule.ask}</p>
      {products.loading && !products.data ? <p className={arcade ? 'fine blink-slow' : 'small muted'}>{shout('Loading your products...')}</p> : null}
      {products.error ? <p className={arcade ? 'crt-error' : 'small'} role="alert" style={arcade ? undefined : { color: 'var(--bad)' }}>{products.error}</p> : null}
      {products.data && list.length === 0 ? (
        <p className={arcade ? 'fine' : 'small muted'}>
          {part ? `You don't have a ${part.title} yet. ` : rule.needsBrief ? "None of your products has a Brief for the AI yet. " : "You don't have a product yet. "}
          <Link to={tryItLink(part)}>{part?.presetId ? 'Make one from its preset' : 'Make one now'}</Link>, then come back and report.
        </p>
      ) : null}
      {list.length > 0 ? (
        <>
          <label className={arcade ? undefined : 'f'}>
            {shout('Product')}
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">{arcade ? 'PICK ONE' : 'Pick the product you made'}</option>
              {list.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          <label className={arcade ? undefined : 'f'}>
            {shout('How did it come out?')}
            <textarea rows={4} maxLength={REPORT_MAX} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="e.g. The habits were countable like I asked, but two of the tips were too long for the boxes." />
            <span className={arcade ? 'fine' : 'field-help'}>Saved with the mission and as a note for the AI on that product. {text.trim().length}/{REPORT_MAX}{short ? `, at least ${REPORT_MIN}` : ''}</span>
          </label>
        </>
      ) : null}
      {err ? <p className={arcade ? 'crt-error' : 'small'} role="alert" style={arcade ? undefined : { color: 'var(--bad)' }}>{err}</p> : null}
      <div className={arcade ? 'row-actions' : 'row'}>
        <button type="button" className={arcade ? 'arc-btn small' : 'primary small'} data-nav disabled={busy || !productId || short} onClick={() => void send()}>{shout('Send report')}</button>
        <button type="button" className={btn} data-nav onClick={onCancel}>{shout('Cancel')}</button>
      </div>
    </div>
  );
}
