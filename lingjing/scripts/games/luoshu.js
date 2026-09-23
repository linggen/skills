// 洛书九宫 — break a cauldron's seal by completing a 3×3 magic square (1–9, every line 15).
// Pure module: newGame / html / act. No DOM, no listeners; the host routes [data-g] clicks to act().

export const meta = {
  id: 'luoshu',
  name: { zh: '洛书九宫', en: 'The Luo Shu square' },
  how: {
    zh: '选一数，点空格落下；横竖斜皆合十五，封印自破。',
    en: 'Pick a number, tap an empty cell; make every row, column and diagonal sum to 15.',
  },
};

const T = {
  zh: { solved: '封印已破', row: '行', col: '列', diag: '斜', clear: '点已落之数可收回' },
  en: { solved: 'The seal gives way', row: 'Rows', col: 'Cols', diag: 'Diag', clear: 'Tap a placed number to lift it' },
};

const GIVENS = { 1: 4, 2: 3, 3: 2 };
const BASE = [2, 7, 6, 9, 5, 1, 4, 3, 8];
export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function hash(str) {
  let h = 2166136261 >>> 0;
  for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h;
}

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rotate = (g) => [6, 3, 0, 7, 4, 1, 8, 5, 2].map((i) => g[i]);
const mirror = (g) => [2, 1, 0, 5, 4, 3, 8, 7, 6].map((i) => g[i]);

/** All eight magic squares of order 3 (the Lo Shu under rotation and reflection). */
export function allSquares() {
  const out = [];
  let g = BASE;
  for (let r = 0; r < 4; r++) { out.push(g, mirror(g)); g = rotate(g); }
  return out;
}

/** True when the grid holds 1–9 once each and every line sums to 15. */
export function isMagic(cells) {
  if (cells.length !== 9 || new Set(cells).size !== 9) return false;
  if (!cells.every((n) => Number.isInteger(n) && n >= 1 && n <= 9)) return false;
  return LINES.every((l) => l.reduce((s, i) => s + cells[i], 0) === 15);
}

export function newGame(seed, level = 1) {
  const lv = GIVENS[level] ? Number(level) : 1;
  const rnd = mulberry32(hash(`luoshu:${seed}:${lv}`));
  const squares = allSquares();
  const solution = squares[Math.floor(rnd() * squares.length)];
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const givens = order.slice(0, GIVENS[lv]).sort((a, b) => a - b);
  const cells = solution.map((n, i) => (givens.includes(i) ? n : 0));
  return { seed: String(seed), level: lv, givens, cells, pick: 0, won: false };
}

function place(state, i) {
  if (state.givens.includes(i)) return null;
  const cells = state.cells.slice();
  if (cells[i]) { cells[i] = 0; return { ...state, cells }; }
  if (!state.pick || cells.includes(state.pick)) return null;
  cells[i] = state.pick;
  return { ...state, cells, pick: 0, won: isMagic(cells) };
}

function pick(state, n) {
  if (!(n >= 1 && n <= 9) || state.cells.includes(n)) return null;
  return { ...state, pick: state.pick === n ? 0 : n };
}

const VERBS = {
  pick: (s, d) => pick(s, Number(d.n)),
  cell: (s, d) => place(s, Number(d.i)),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const verb = VERBS[data.g];
  const next = verb ? verb(state, data) : null;
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

const lineSum = (cells, l) => (l.every((i) => cells[i]) ? l.reduce((s, i) => s + cells[i], 0) : null);

function sumTag(v) {
  if (v === null) return '<span class="g-luoshu-sum">·</span>';
  return `<span class="g-luoshu-sum${v === 15 ? ' is-ok' : ' is-off'}">${v}</span>`;
}

function cellHtml(state, i) {
  const n = state.cells[i];
  if (state.givens.includes(i)) {
    return `<button type="button" class="g-luoshu-cell is-given" data-g="cell" data-i="${i}" disabled>${n}</button>`;
  }
  const cls = n ? 'is-placed' : 'is-empty';
  const off = state.won ? ' disabled' : '';
  return `<button type="button" class="g-luoshu-cell ${cls}" data-g="cell" data-i="${i}"${off}>${n || ''}</button>`;
}

function trayHtml(state) {
  const btns = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
    const used = state.cells.includes(n);
    const cls = n === state.pick ? ' is-picked' : '';
    return `<button type="button" class="g-luoshu-num${cls}" data-g="pick" data-n="${n}"${used ? ' disabled' : ''}>${n}</button>`;
  });
  return `<div class="g-luoshu-tray">${btns.join('')}</div>`;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const c = state.cells;
  const rows = [0, 1, 2].map((r) =>
    [0, 1, 2].map((k) => cellHtml(state, r * 3 + k)).join('') + sumTag(lineSum(c, LINES[r])),
  );
  const foot = [3, 4, 5].map((k) => sumTag(lineSum(c, LINES[k]))).join('') + sumTag(lineSum(c, LINES[6]));
  const board = `<div class="g-luoshu-board">${rows.join('')}${foot}</div>`;
  const anti = `<div class="g-luoshu-anti">${t.diag} ↙ ${sumTag(lineSum(c, LINES[7]))}</div>`;
  const bottom = state.won
    ? `<div class="g-luoshu-solved">${t.solved}</div>`
    : `${trayHtml(state)}<div class="g-luoshu-note">${t.clear}</div>`;
  return `<div class="g-luoshu${state.won ? ' is-won' : ''}">${board}${anti}${bottom}</div>`;
}
