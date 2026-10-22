export function fmtDate(iso?: string | null, withTime = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return withTime ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ago(iso?: string | null): string {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const abs = Math.abs(s);
  const f = (n: number, u: string) => `${n} ${u}${n === 1 ? '' : 's'}`;
  const txt = abs < 60 ? f(abs, 'second') : abs < 3600 ? f(Math.round(abs / 60), 'minute') : abs < 86400 ? f(Math.round(abs / 3600), 'hour') : f(Math.round(abs / 86400), 'day');
  return s >= 0 ? `${txt} ago` : `in ${txt}`;
}

export function money(cents?: number | null, currency = 'USD'): string {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export function usd(v?: number | null, digits = 3): string {
  if (v === null || v === undefined) return 'unknown';
  return `$${v.toFixed(digits)}`;
}

export function bytes(n?: number | null): string {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function label(s?: string | null): string {
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function pct(v?: number | null): string {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
}

export const AI_PROVIDER_LABELS: Record<string, string> = { anthropic: 'Anthropic', openrouter: 'OpenRouter', groq: 'Groq', nvidia: 'NVIDIA NIM', cerebras: 'Cerebras', together: 'Together AI' };

export function providerLabel(id: string): string {
  return AI_PROVIDER_LABELS[id] ?? label(id);
}

/** Short "who wrote this" label from a stored provenance.generator value, for any AI text provider, deterministic content, or a manual edit. */
export function generatorLabel(generator?: string | null, model?: string | null): string {
  if (!generator) return '—';
  if (generator === 'deterministic') return 'Built-in content library';
  if (generator === 'user_edit') return 'Edited by you';
  const name = providerLabel(generator);
  return model ? `AI · ${name} (${model})` : `AI · ${name}`;
}
