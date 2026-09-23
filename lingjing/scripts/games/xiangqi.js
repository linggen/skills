// 象棋残局 — 斗法 with a rival cultivator. Pure ES module: newGame / html / act.
// Red (the player) must checkmate black within N red moves; black answers inside act()
// with the best defence an exhaustive search finds. Board: 9 files (x 0..8) × 10 ranks
// (y 0..9); black sits at the top (y 0), red at the bottom (y 9); river between y 4 and 5.
// A board is a 90-char string, index y*9+x, '.' empty; red pieces upper-case, black lower.

export const meta = {
  id: 'xiangqi',
  name: { zh: '象棋残局', en: 'Xiangqi endgame' },
  how: {
    zh: '执红先行，点棋子再点落点，在限定步数内将死黑将。',
    en: 'You play red: tap a piece, then a point; checkmate black within the move limit.',
  },
};

const W = 9, H = 10;
// Puzzles: pieces as <piece><file a-i><rank 0-9>, rank 0 = black's back rank.
export const PUZZLES = {
  1: [
    { id: 'shuangche', name: { zh: '双车错', en: 'Twin chariots' }, n: 1, pos: 'Kd9 Ra1 Ri5 ke0 pc3' },
    { id: 'mahoupao', name: { zh: '马后炮', en: 'Cannon behind horse' }, n: 1, pos: 'Kd9 Ne2 Ca5 ke0 ci2 pc3' },
    { id: 'baimian', name: { zh: '白脸将', en: 'Facing generals' }, n: 1, pos: 'Ke9 Ra5 kd0 af2 pg6' },
  ],
  2: [
    { id: 'chuanxin', name: { zh: '大胆穿心', en: 'Through the heart' }, n: 2, pos: 'Kd9 Re5 Ri6 ke0 ad0 af0 ce2' },
    { id: 'mabing', name: { zh: '马兵助攻', en: 'Horse and pawn' }, n: 2, pos: 'Kd7 Rc9 Nd4 Ph2 kd1 ae1' },
    { id: 'lianjiang', name: { zh: '露帅助车', en: 'The general helps' }, n: 2, pos: 'Kd9 Ri5 Ph4 kf0 ba2' },
  ],
  3: [
    { id: 'chema', name: { zh: '车马冷着', en: 'Rook and horse' }, n: 3, pos: 'Kf8 Rb2 Nh0 kd0 af0' },
    { id: 'shuangma', name: { zh: '双马饮泉', en: 'Two horses at the spring' }, n: 3, pos: 'Kd9 Nh5 Nd5 kd0' },
    { id: 'qiche', name: { zh: '弃车引将', en: 'Rook sacrifice' }, n: 3, pos: 'Kf7 Rh7 Nd6 Cb9 ke0 rh0' },
  ],
};

const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
const isRed = (p) => p >= 'A' && p <= 'Z';
const colorOf = (p) => (p === '.' ? null : isRed(p) ? 'r' : 'b');
const at = (b, x, y) => b[y * W + x];
const inPalace = (c, x, y) => x >= 3 && x <= 5 && (c === 'r' ? y >= 7 : y <= 2);
const ownSide = (c, y) => (c === 'r' ? y >= 5 : y <= 4);
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const HORSE = [[1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1],
  [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0]]; // dx, dy, leg dx, leg dy

export function parsePos(pos) {
  const b = Array(W * H).fill('.');
  for (const tok of pos.trim().split(/\s+/)) b[(+tok[2]) * W + (tok.charCodeAt(1) - 97)] = tok[0];
  return b.join('');
}

// Pseudo-legal destinations for the piece on (x, y), as board indices.
export function pseudoMoves(b, x, y) {
  const p = at(b, x, y), c = colorOf(p), k = p.toUpperCase(), out = [];
  const add = (tx, ty) => { if (inside(tx, ty) && colorOf(at(b, tx, ty)) !== c) out.push(ty * W + tx); };
  if (k === 'K') for (const [dx, dy] of ORTH) { if (inPalace(c, x + dx, y + dy)) add(x + dx, y + dy); }
  if (k === 'A') for (const [dx, dy] of DIAG) { if (inPalace(c, x + dx, y + dy)) add(x + dx, y + dy); }
  if (k === 'B') for (const [dx, dy] of DIAG) {
    const tx = x + 2 * dx, ty = y + 2 * dy;
    if (inside(tx, ty) && ownSide(c, ty) && at(b, x + dx, y + dy) === '.') add(tx, ty);
  }
  if (k === 'N') for (const [dx, dy, lx, ly] of HORSE) {
    if (inside(x + dx, y + dy) && at(b, x + lx, y + ly) === '.') add(x + dx, y + dy);
  }
  if (k === 'R' || k === 'C') for (const [dx, dy] of ORTH) {
    let tx = x + dx, ty = y + dy, screen = false;
    for (; inside(tx, ty); tx += dx, ty += dy) {
      const q = at(b, tx, ty);
      if (!screen) {
        if (q === '.') { out.push(ty * W + tx); continue; }
        if (k === 'R') { add(tx, ty); break; }
        screen = true;
      } else if (q !== '.') { add(tx, ty); break; }
    }
  }
  if (k === 'P') {
    const f = c === 'r' ? -1 : 1;
    add(x, y + f);
    if (!ownSide(c, y)) { add(x - 1, y); add(x + 1, y); }
  }
  return out;
}

const findKing = (b, c) => b.indexOf(c === 'r' ? 'K' : 'k');
export const move = (b, from, to) => {
  const a = b.split(''); a[to] = a[from]; a[from] = '.'; return a.join('');
};

// Is side c's general attacked (including the two generals facing on an open file)?
export function inCheck(b, c) {
  const ki = findKing(b, c);
  if (ki < 0) return true;
  const kx = ki % W, oi = findKing(b, c === 'r' ? 'b' : 'r');
  if (oi >= 0 && oi % W === kx) {
    const [lo, hi] = [Math.min(ki, oi), Math.max(ki, oi)];
    let open = true;
    for (let i = lo + W; i < hi; i += W) if (b[i] !== '.') { open = false; break; }
    if (open) return true;
  }
  for (let i = 0; i < b.length; i++) {
    const q = b[i];
    if (q === '.' || colorOf(q) === c || q.toUpperCase() === 'K') continue;
    if (pseudoMoves(b, i % W, (i / W) | 0).includes(ki)) return true;
  }
  return false;
}

// Legal moves for side c: [from, to] pairs in board order (deterministic).
export function legalMoves(b, c) {
  const out = [];
  for (let i = 0; i < b.length; i++) {
    if (colorOf(b[i]) !== c) continue;
    for (const to of pseudoMoves(b, i % W, (i / W) | 0)) {
      if (!inCheck(move(b, i, to), c)) out.push([i, to]);
    }
  }
  return out;
}

// Can red (to move) force a mate within n red moves? No legal move = loss for the mover.
export function redMates(b, n) {
  if (n <= 0) return false;
  for (const [f, t] of legalMoves(b, 'r')) if (blackLoses(move(b, f, t), n - 1)) return true;
  return false;
}
function blackLoses(b, n) {
  const replies = legalMoves(b, 'b');
  if (!replies.length) return true;
  return replies.every(([f, t]) => redMates(move(b, f, t), n));
}
// Fewest red moves to force mate (red to move), or Infinity beyond `max`.
export function mateDistance(b, max) {
  for (let k = 1; k <= max; k++) if (redMates(b, k)) return k;
  return Infinity;
}
// Black's best defence: the reply that delays mate longest within `left` red moves.
export function blackReply(b, left) {
  let best = null, bestD = -1;
  for (const m of legalMoves(b, 'b')) {
    const d = mateDistance(move(b, m[0], m[1]), left);
    if (d > bestD) { best = m; bestD = d; }
    if (d === Infinity) break;
  }
  return best;
}

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let k = 0; k < str.length; k++) h = Math.imul(h ^ str.charCodeAt(k), 16777619) >>> 0;
  return h;
}
function mulberry32(a) {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function fresh(level, pid) {
  const pz = PUZZLES[level][pid];
  return { level, pid, n: pz.n, board: parsePos(pz.pos), left: pz.n, sel: null, last: null, outcome: 'open' };
}

export function newGame(seed, level = 1) {
  const lv = PUZZLES[level] ? Number(level) : 1;
  const list = PUZZLES[lv];
  return fresh(lv, Math.floor(mulberry32(hash(String(seed) + ':' + lv)) * list.length));
}

const parseAt = (s) => {
  const [x, y] = String(s || '').split(',').map(Number);
  return Number.isInteger(x) && Number.isInteger(y) && inside(x, y) ? y * W + x : -1;
};

export function act(state, data = {}) {
  const g = data.g;
  if (g === 'again') return { state: fresh(state.level, state.pid), won: false };
  if (state.outcome !== 'open') return { state, won: false };
  const i = parseAt(data.at);
  if (i < 0) return { state, won: false };
  if (g === 'pick') {
    if (colorOf(state.board[i]) !== 'r') return { state, won: false };
    return { state: { ...state, sel: state.sel === i ? null : i }, won: false };
  }
  if (g !== 'go' || state.sel === null) return { state, won: false };
  const ok = legalMoves(state.board, 'r').some(([f, t]) => f === state.sel && t === i);
  if (!ok) return { state, won: false };
  let board = move(state.board, state.sel, i);
  const left = state.left - 1;
  let last = { from: state.sel, to: i, side: 'r' };
  if (!legalMoves(board, 'b').length) {
    return { state: { ...state, board, left, sel: null, last, outcome: 'won' }, won: true };
  }
  if (left <= 0) return { state: { ...state, board, left, sel: null, last, outcome: 'lost' }, won: false };
  const [f, t] = blackReply(board, left);
  board = move(board, f, t);
  last = { from: f, to: t, side: 'b' };
  const outcome = legalMoves(board, 'r').length ? 'open' : 'lost';
  return { state: { ...state, board, left, sel: null, last, outcome }, won: false };
}

const GLYPH = { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵',
  k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒' };
const T = {
  zh: { goal: (n, l) => `红先，${n} 步内将死（余 ${l} 步）`, open: '轮到你走红棋。', won: '将死！斗法得胜。',
    lost: '未能将死，此局告负。', again: '再来一局', check: '将军！' },
  en: { goal: (n, l) => `Red to move: mate in ${n} (${l} left)`, open: 'Your move (red).', won: 'Checkmate! You win.',
    lost: 'No mate in time; the puzzle is lost.', again: 'Try again', check: 'Check!' },
};

function boardSvg() {
  const L = [];
  for (let y = 0; y < H; y++) L.push(`M0.5 ${y + 0.5}H8.5`);
  for (let x = 0; x < W; x++) {
    if (x === 0 || x === 8) L.push(`M${x + 0.5} 0.5V9.5`);
    else L.push(`M${x + 0.5} 0.5V4.5M${x + 0.5} 5.5V9.5`);
  }
  L.push('M3.5 0.5L5.5 2.5M5.5 0.5L3.5 2.5M3.5 7.5L5.5 9.5M5.5 7.5L3.5 9.5');
  return `<svg class="g-xiangqi-lines" viewBox="0 0 9 10" aria-hidden="true">`
    + `<path d="${L.join('')}"/>`
    + `<text x="2.5" y="5.18">楚 河</text><text x="6.5" y="5.18">汉 界</text></svg>`;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const open = state.outcome === 'open';
  const b = state.board;
  const dests = open && state.sel !== null
    ? new Set(legalMoves(b, 'r').filter(([f]) => f === state.sel).map(([, to]) => to)) : new Set();
  const cells = [];
  for (let i = 0; i < b.length; i++) {
    const x = i % W, y = (i / W) | 0, p = b[i];
    const pos = `grid-column:${x + 1};grid-row:${y + 1}`;
    const cls = ['g-xiangqi-pt'];
    if (state.last && (state.last.from === i || state.last.to === i)) cls.push('is-last');
    if (state.sel === i) cls.push('is-sel');
    const disc = p === '.' ? '' : `<span class="g-xiangqi-piece ${isRed(p) ? 'is-red' : 'is-black'}">${GLYPH[p]}</span>`;
    let attrs = '';
    if (dests.has(i)) { cls.push('is-dest'); attrs = `data-g="go" data-at="${x},${y}"`; }
    else if (open && isRed(p)) attrs = `data-g="pick" data-at="${x},${y}"`;
    cells.push(attrs
      ? `<button type="button" class="${cls.join(' ')}" style="${pos}" ${attrs}>${disc}</button>`
      : `<span class="${cls.join(' ')}" style="${pos}">${disc}</span>`);
  }
  const checked = open && inCheck(b, 'r') ? ` ${t.check}` : '';
  const again = state.outcome === 'lost'
    ? `<button type="button" class="g-xiangqi-again" data-g="again">${t.again}</button>` : '';
  return `<div class="g-xiangqi is-${state.outcome}">`
    + `<p class="g-xiangqi-goal">${t.goal(state.n, state.left)}</p>`
    + `<div class="g-xiangqi-board">${boardSvg()}<div class="g-xiangqi-grid">${cells.join('')}</div></div>`
    + `<div class="g-xiangqi-foot"><span class="g-xiangqi-status">${t[state.outcome]}${checked}</span>${again}</div>`
    + `</div>`;
}
