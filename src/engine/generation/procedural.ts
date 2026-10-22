import { seededRandom } from '../../core/hash.ts';

const f = (x: number) => (Math.round(x * 100) / 100).toString();

// ---------------------------------------------------------------- mandala

export type Complexity = 'simple' | 'medium' | 'detailed';

export function mandalaSvg(seed: number, complexity: Complexity): string {
  const rand = seededRandom(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const rings = complexity === 'simple' ? 4 : complexity === 'medium' ? 6 : 9;
  const sw = complexity === 'simple' ? 5 : complexity === 'medium' ? 3.4 : 2.4;
  const C = 500;
  const R = 470;
  const r0 = 45 + rand() * 20;
  const radii = [r0];
  for (let i = 1; i <= rings; i++) radii.push(r0 + ((R - r0) * i) / rings);
  const parts: string[] = [];
  const pt = (r: number, a: number) => [C + r * Math.cos(a), C + r * Math.sin(a)];
  for (let i = rings; i >= 1; i--) {
    const ri = radii[i - 1];
    const ro = radii[i];
    const k = pick(i > rings / 2 ? [16, 18, 20, 24] : [8, 10, 12, 16]);
    const pattern = pick(['petal', 'scallop', 'circles', 'spikes', 'leaf', 'dots', 'lattice']);
    const shapes: string[] = [];
    for (let j = 0; j < k; j++) {
      const a = (j / k) * Math.PI * 2;
      const da = (Math.PI * 2) / k;
      if (pattern === 'petal' || pattern === 'leaf') {
        const [x0, y0] = pt(ri, a);
        const [x1, y1] = pt(ro, a);
        const w = pattern === 'petal' ? da * 0.55 : da * 0.4;
        const [c1x, c1y] = pt((ri + ro) / 2, a - w);
        const [c2x, c2y] = pt((ri + ro) / 2, a + w);
        shapes.push(`<path d="M${f(x0)} ${f(y0)} Q${f(c1x)} ${f(c1y)} ${f(x1)} ${f(y1)} Q${f(c2x)} ${f(c2y)} ${f(x0)} ${f(y0)}Z"/>`);
        if (pattern === 'leaf') {
          const [mx, my] = pt((ri + ro) / 2, a);
          shapes.push(`<path d="M${f(x0)} ${f(y0)} L${f(mx)} ${f(my)}" fill="none"/>`);
        }
      } else if (pattern === 'scallop') {
        const [x0, y0] = pt(ri, a);
        const [x1, y1] = pt(ri, a + da);
        const r = (ro - ri) * 0.95;
        shapes.push(`<path d="M${f(x0)} ${f(y0)} A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y1)}"/>`);
      } else if (pattern === 'circles' || pattern === 'dots') {
        const rm = (ri + ro) / 2;
        const [x, y] = pt(rm, a + da / 2);
        const cr = Math.min((ro - ri) / 2, (Math.PI * rm) / k) * (pattern === 'dots' ? 0.35 : 0.8);
        shapes.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(cr)}"/>`);
        if (pattern === 'circles') shapes.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(cr * 0.45)}"/>`);
      } else if (pattern === 'spikes') {
        const [x0, y0] = pt(ri, a);
        const [x1, y1] = pt(ro, a + da / 2);
        const [x2, y2] = pt(ri, a + da);
        shapes.push(`<path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}Z"/>`);
      } else {
        const [x0, y0] = pt(ri + (ro - ri) * 0.2, a);
        const [x1, y1] = pt(ro - (ro - ri) * 0.2, a + da / 2);
        const [x2, y2] = pt(ri + (ro - ri) * 0.2, a + da);
        shapes.push(`<path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}" fill="none"/>`);
      }
    }
    parts.push(`<circle cx="${C}" cy="${C}" r="${f(ro)}"/>`);
    parts.push(`<g>${shapes.join('')}</g>`);
  }
  parts.push(`<circle cx="${C}" cy="${C}" r="${f(r0)}"/>`);
  parts.push(`<circle cx="${C}" cy="${C}" r="${f(r0 * 0.45)}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000"><rect width="1000" height="1000" fill="#ffffff"/><g fill="#ffffff" stroke="#000000" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${parts.join('')}</g></svg>`;
}

// ---------------------------------------------------------------- maze

export interface Maze {
  cols: number;
  rows: number;
  open: Uint8Array;
}

const N = 1, E = 2, S = 4, W = 8;
const DIRS: [number, number, number, number][] = [[0, -1, N, S], [1, 0, E, W], [0, 1, S, N], [-1, 0, W, E]];

export function generateMaze(cols: number, rows: number, seed: number): Maze {
  const rand = seededRandom(seed);
  const open = new Uint8Array(cols * rows);
  const seen = new Uint8Array(cols * rows);
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const x = cur % cols, y = Math.floor(cur / cols);
    const opts = DIRS.filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny * cols + nx];
    });
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const [dx, dy, bit, opp] = opts[Math.floor(rand() * opts.length)];
    const nxt = (y + dy) * cols + (x + dx);
    open[cur] |= bit;
    open[nxt] |= opp;
    seen[nxt] = 1;
    stack.push(nxt);
  }
  open[0] |= N;
  open[cols * rows - 1] |= S;
  return { cols, rows, open };
}

export function solveMaze(m: Maze): number[] | null {
  const target = m.cols * m.rows - 1;
  const prev = new Int32Array(m.cols * m.rows).fill(-1);
  const q = [0];
  prev[0] = 0;
  while (q.length) {
    const c = q.shift()!;
    if (c === target) break;
    const x = c % m.cols, y = Math.floor(c / m.cols);
    for (const [dx, dy, bit] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!(m.open[c] & bit) || nx < 0 || ny < 0 || nx >= m.cols || ny >= m.rows) continue;
      const n = ny * m.cols + nx;
      if (prev[n] !== -1) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  if (prev[target] === -1) return null;
  const path = [target];
  while (path[0] !== 0) path.unshift(prev[path[0]]);
  return path;
}

export function mazeStats(m: Maze): { passages: number; cells: number; perfect: boolean; solvable: boolean } {
  let passages = 0;
  for (let i = 0; i < m.open.length; i++) {
    const x = i % m.cols, y = Math.floor(i / m.cols);
    if (m.open[i] & E && x < m.cols - 1) passages++;
    if (m.open[i] & S && y < m.rows - 1) passages++;
  }
  const cells = m.cols * m.rows;
  return { passages, cells, perfect: passages === cells - 1, solvable: solveMaze(m) !== null };
}

export function mazeSvg(m: Maze, opts: { solution?: boolean; stroke: string; accent: string; strokeWidth: number }): string {
  const cell = 20;
  const pad = cell;
  const w = m.cols * cell + pad * 2;
  const h = m.rows * cell + pad * 2;
  const segs: string[] = [];
  for (let i = 0; i < m.open.length; i++) {
    const x = i % m.cols, y = Math.floor(i / m.cols);
    const x0 = pad + x * cell, y0 = pad + y * cell;
    if (!(m.open[i] & N)) segs.push(`M${x0} ${y0}h${cell}`);
    if (!(m.open[i] & W)) segs.push(`M${x0} ${y0}v${cell}`);
    if (x === m.cols - 1 && !(m.open[i] & E)) segs.push(`M${x0 + cell} ${y0}v${cell}`);
    if (y === m.rows - 1 && !(m.open[i] & S)) segs.push(`M${x0} ${y0 + cell}h${cell}`);
  }
  let sol = '';
  if (opts.solution) {
    const path = solveMaze(m) ?? [];
    const ptsArr = path.map((c) => `${pad + (c % m.cols) * cell + cell / 2},${pad + Math.floor(c / m.cols) * cell + cell / 2}`);
    sol = `<polyline points="${pad + cell / 2},${pad - cell / 2} ${ptsArr.join(' ')} ${pad + (m.cols - 1) * cell + cell / 2},${pad + m.rows * cell + cell / 2}" fill="none" stroke="${opts.accent}" stroke-width="${opts.strokeWidth * 1.6}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const arrow = (x: number, y: number, down: boolean) => `<path d="M${x - 5} ${y - (down ? 6 : -6)} L${x} ${y} L${x + 5} ${y - (down ? 6 : -6)}" fill="none" stroke="${opts.accent}" stroke-width="${opts.strokeWidth}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet"><rect width="${w}" height="${h}" fill="#ffffff"/>${sol}<path d="${segs.join('')}" fill="none" stroke="${opts.stroke}" stroke-width="${opts.strokeWidth}" stroke-linecap="square"/>${arrow(pad + cell / 2, pad - 2, true)}${arrow(pad + (m.cols - 1) * cell + cell / 2, pad + m.rows * cell + cell - 4, true)}</svg>`;
}

// ---------------------------------------------------------------- word search

export interface WordSearch {
  size: number;
  grid: string[][];
  placements: { word: string; cells: [number, number][] }[];
  unplaced: string[];
}

const BLOCKED_FILL = ['FUCK', 'SHIT', 'CUNT', 'DICK', 'PISS', 'COCK', 'SLUT', 'WHORE', 'BITCH', 'NIGG', 'FAG', 'RAPE', 'NAZI', 'KILL'];

export function generateWordSearch(words: string[], size: number, difficulty: 'easy' | 'medium' | 'hard', seed: number): WordSearch {
  const rand = seededRandom(seed);
  const dirs: [number, number][] = [[1, 0], [0, 1]];
  if (difficulty !== 'easy') dirs.push([1, 1], [1, -1]);
  if (difficulty === 'hard') dirs.push([-1, 0], [0, -1], [-1, -1], [-1, 1]);
  const clean = [...new Set(words.map((w) => w.toUpperCase().replace(/[^A-Z]/g, '')).filter((w) => w.length >= 3 && w.length <= size))].sort((a, b) => b.length - a.length);
  for (let attempt = 0; attempt < 40; attempt++) {
    const grid: string[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => ''));
    const placements: WordSearch['placements'] = [];
    const unplaced: string[] = [];
    for (const word of clean) {
      let placed = false;
      for (let t = 0; t < 300 && !placed; t++) {
        const [dx, dy] = dirs[Math.floor(rand() * dirs.length)];
        const x0 = Math.floor(rand() * size), y0 = Math.floor(rand() * size);
        const xe = x0 + dx * (word.length - 1), ye = y0 + dy * (word.length - 1);
        if (xe < 0 || ye < 0 || xe >= size || ye >= size) continue;
        const cells: [number, number][] = [];
        let ok = true;
        for (let i = 0; i < word.length; i++) {
          const x = x0 + dx * i, y = y0 + dy * i;
          if (grid[y][x] && grid[y][x] !== word[i]) {
            ok = false;
            break;
          }
          cells.push([x, y]);
        }
        if (!ok) continue;
        cells.forEach(([x, y], i) => (grid[y][x] = word[i]));
        placements.push({ word, cells });
        placed = true;
      }
      if (!placed) unplaced.push(word);
    }
    const letters = 'ABCDEFGHIJKLMNOPRSTUWY';
    for (const row of grid) for (let x = 0; x < size; x++) if (!row[x]) row[x] = letters[Math.floor(rand() * letters.length)];
    const lines: string[] = [];
    for (let i = 0; i < size; i++) {
      lines.push(grid[i].join(''), grid.map((r) => r[i]).join(''));
    }
    for (let d = -size + 1; d < size; d++) {
      let a = '', b = '';
      for (let y = 0; y < size; y++) {
        const x1 = y + d, x2 = size - 1 - y + d;
        if (x1 >= 0 && x1 < size) a += grid[y][x1];
        if (x2 >= 0 && x2 < size) b += grid[y][x2];
      }
      lines.push(a, b);
    }
    const all = lines.flatMap((l) => [l, [...l].reverse().join('')]).join('|');
    if (BLOCKED_FILL.some((w) => all.includes(w)) && attempt < 39) continue;
    return { size, grid, placements, unplaced };
  }
  throw new Error('unreachable');
}

export function wordSearchSvg(ws: WordSearch, opts: { solution: boolean; ink: string; accent: string; fontFamily: string }): string {
  const cell = 30;
  const s = ws.size * cell;
  const hl = opts.solution
    ? ws.placements.map((p) => {
        const [a, b] = [p.cells[0], p.cells[p.cells.length - 1]];
        return `<line x1="${a[0] * cell + cell / 2}" y1="${a[1] * cell + cell / 2}" x2="${b[0] * cell + cell / 2}" y2="${b[1] * cell + cell / 2}" stroke="${opts.accent}" stroke-opacity="0.35" stroke-width="${cell * 0.78}" stroke-linecap="round"/>`;
      }).join('')
    : '';
  const letters = ws.grid.map((row, y) => row.map((ch, x) => `<text x="${x * cell + cell / 2}" y="${y * cell + cell / 2}" text-anchor="middle" dominant-baseline="central">${ch}</text>`).join('')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${s + 8} ${s + 8}" preserveAspectRatio="xMidYMid meet"><rect x="-4" y="-4" width="${s + 8}" height="${s + 8}" fill="#ffffff" stroke="${opts.ink}" stroke-width="2" rx="6"/>${hl}<g font-family="${opts.fontFamily.replace(/"/g, "'")}" font-size="${cell * 0.62}" font-weight="600" fill="${opts.ink}">${letters}</g></svg>`;
}
