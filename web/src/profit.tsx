import { money } from './format.ts';

/** What a listing would earn after the marketplace's published fees (the estimate comes from the server with each listing). */
export function ProfitLine({ profit }: { profit?: any }) {
  if (!profit) return null;
  if (!profit.available) return <div className="small muted">What you keep: not available. {profit.reason}</div>;
  const c = profit.currency;
  return (
    <div className="small profit" style={{ marginTop: 4 }}>
      <span className="muted">What you keep after the marketplace's fees: </span>
      {profit.scenarios.map((s: any, i: number) => (
        <span key={s.label} title={s.breakdown.map((b: any) => `${b.label}: ${money(b.cents, c)}`).join('\n')}>
          {i > 0 && <span className="muted"> · </span>}
          <b style={s.netCents <= 0 ? { color: 'var(--bad)' } : undefined}>{money(s.netCents, c)}</b>
          <span className="muted"> {s.label.toLowerCase()}{s.netShare != null ? ` (${Math.round(s.netShare * 100)}%)` : ''}</span>
        </span>
      ))}
      {profit.oneTimeCents > 0 && <span className="muted"> · plus {money(profit.oneTimeCents, c)} to list it</span>}
      <div className="muted">{profit.notes.join(' ')} Hover a figure to see the fees.</div>
    </div>
  );
}
