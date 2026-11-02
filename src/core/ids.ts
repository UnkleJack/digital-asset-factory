import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

function encodeTime(ms: number): string {
  let out = '';
  let n = ms;
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

let lastMs = 0;
let counter = 0;

export function newId(prefix: string): string {
  const now = Date.now();
  if (now === lastMs) counter++;
  else {
    lastMs = now;
    counter = 0;
  }
  const rand = randomBytes(8);
  let r = '';
  for (const b of rand) r += ALPHABET[b % 32];
  return `${prefix}_${encodeTime(now)}${ALPHABET[counter % 32]}${r}`;
}

export function slugify(input: string, maxLen = 60): string {
  const s = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '');
  return s || 'item';
}

/** When an id from newId was made (to the millisecond), or null if it is not one of ours. */
export function idTime(id: string): Date | null {
  const m = /^[a-z]+_([0-9a-hjkmnp-tv-z]{10})/.exec(id);
  if (!m) return null;
  let ms = 0;
  for (const c of m[1]) ms = ms * 32 + ALPHABET.indexOf(c);
  return new Date(ms);
}
