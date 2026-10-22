export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function raw(markup: string): SafeHtml {
  return new SafeHtml(markup);
}

function renderValue(v: unknown): string {
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

export function join(parts: SafeHtml[], sep = ''): SafeHtml {
  return new SafeHtml(parts.map((p) => p.value).join(sep));
}

export function n(value: number, digits = 2): string {
  return Number.isFinite(value) ? String(Math.round(value * 10 ** digits) / 10 ** digits) : '0';
}
