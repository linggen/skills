// 五子棋 — 斗法 with a rival cultivator. Pure ES module: newGame / html / act.
// Board 11×11, player black (1) moves first, rival white (2) answers inside act().
// Deterministic: every AI tie-break comes from a PRNG seeded by (seed, move count).

export const meta = {
  id: 'wuziqi',
  name: { zh: '五子棋', en: 'Five in a row' },
  how: {
    zh: '执黑先行，横竖斜连成五子即胜；对手连成五子则败。',
    en: 'You play black and move first; five in a row in any line wins.',
  },
};

const N = 11;
const EMPTY = 0, BLACK = 1, WHITE = 2;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let k = 0; k < str.length; k++) h = Math.imul(h ^ str.charCodeAt(k), 16777619) >>> 0;
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

const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

// Line through i in direction d if colour `who` stood on i: stones in a row + open ends.
function line(board, i, d, who) {
  const r0 = Math.floor(i / N), c0 = i % N;
  let count = 1, open = 0;
  for (const s of [1, -1]) {
    let r = r0 + d[0] * s, c = c0 + d[1] * s;
    while (inside(r, c) && board[r * N + c] === who) { count++; r += d[0] * s; c += d[1] * s; }
    if (inside(r, c) && board[r * N + c] === EMPTY) open++;
  }
  return { count, open };
}

export function isFive(board, i, who) {
  return DIRS.some((d) => line(board, i, d, who).count >= 5);
}

// Pattern score for `who` playing i: five, open four, four, open three, three, twos.
function patternScore(board, i, who) {
  let total = 0, fours = 0, open3 = 0;
  for (const d of DIRS) {
    const { count, open } = line(board, i, d, who);
    if (count >= 5) return 1e6;
    if (open === 0) continue;
    if (count === 4) { total += open === 2 ? 1e5 : 1e4; fours++; }
    else if (count === 3) { total += open === 2 ? 5000 : 400; if (open === 2) open3++; }
    else if (count === 2) total += open === 2 ? 200 : 30;
    else total += open === 2 ? 10 : 2;
  }
  if (fours >= 2 || (fours && open3)) total += 5e4; // double threat
  else if (open3 >= 2) total += 2e4;
  return total;
}

function candidates(board) {
  const out = [];
  let any = false;
  for (let i = 0; i < N * N; i++) {
    if (board[i] !== EMPTY) { any = true; continue; }
    const r = Math.floor(i / N), c = i % N;
    let near = false;
    for (let dr = -2; dr <= 2 && !near; dr++)
      for (let dc = -2; dc <= 2 && !near; dc++)
        if (inside(r + dr, c + dc) && board[(r + dr) * N + c + dc] !== EMPTY) near = true;
    if (near) out.push(i);
  }
  if (!any) return [Math.floor(N * N / 2)];
  if (out.length) return out;
  return board.map((v, i) => (v === EMPTY ? i : -1)).filter((i) => i >= 0);
}

// Level 1: wins > blocks a five > extends its own longest line, with noise.
function easyScore(board, i, rand) {
  if (isFive(board, i, WHITE)) return 1e6;
  if (isFive(board, i, BLACK)) return 1e5;
  let best = 0;
  for (const d of DIRS) best = Math.max(best, line(board, i, d, WHITE).count);
  return best * 10 + rand() * 25;
}

const mediumScore = (board, i) => patternScore(board, i, WHITE) * 1.1 + patternScore(board, i, BLACK);

function strongPick(board, rand) {
  const scored = candidates(board).map((i) => ({ i, s: mediumScore(board, i) + rand() }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, 8);
  if (patternScore(board, top[0].i, WHITE) >= 1e6) return top[0].i;
  let best = top[0].i, bestVal = -Infinity;
  for (const { i, s } of top) {
    const b = board.slice(); b[i] = WHITE;
    let reply = 0, threat = 0;
    for (const j of candidates(b)) {
      reply = Math.max(reply, patternScore(b, j, BLACK));
      threat = Math.max(threat, patternScore(b, j, WHITE));
    }
    // A white four forces black to answer unless black can make five first.
    if (threat >= 1e6 && reply < 1e6) reply = Math.min(reply, 1e3);
    const val = s - reply * 0.5;
    if (val > bestVal) { bestVal = val; best = i; }
  }
  return best;
}

function aiMove(board, level, rand) {
  if (level >= 3) return strongPick(board, rand);
  let best = -1, bestScore = -Infinity;
  for (const i of candidates(board)) {
    const s = level <= 1 ? easyScore(board, i, rand) : mediumScore(board, i) + rand();
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

export function newGame(seed, level = 1) {
  const s = String(seed ?? '');
  return {
    game: 'wuziqi', seed: s, base: s, again: 0,
    level: Math.min(3, Math.max(1, Number(level) || 1)),
    board: new Array(N * N).fill(EMPTY),
    turn: 'black', outcome: 'open', last: null, moves: 0,
  };
}

export function act(state, data) {
  const g = data && data.g;
  if (g === 'again') {
    if (state.outcome !== 'lost' && state.outcome !== 'draw') return { state, won: false };
    const again = (state.again || 0) + 1;
    const fresh = newGame(`${state.base ?? state.seed}|again${again}`, state.level);
    return { state: { ...fresh, base: state.base ?? state.seed, again }, won: false };
  }
  if (g !== 'play' || state.outcome !== 'open') return { state, won: false };
  const i = Number(data.i);
  if (!Number.isInteger(i) || i < 0 || i >= N * N || state.board[i] !== EMPTY) return { state, won: false };

  const board = state.board.slice();
  board[i] = BLACK;
  let moves = state.moves + 1;
  if (isFive(board, i, BLACK)) {
    return { state: { ...state, board, moves, last: { i, by: 'black' }, outcome: 'won', turn: 'none' }, won: true };
  }
  if (!board.includes(EMPTY)) {
    return { state: { ...state, board, moves, last: { i, by: 'black' }, outcome: 'draw', turn: 'none' }, won: false };
  }
  const rand = mulberry32(hash(`${state.seed}|${moves}`));
  const j = aiMove(board, state.level, rand);
  board[j] = WHITE;
  moves++;
  let outcome = 'open';
  if (isFive(board, j, WHITE)) outcome = 'lost';
  else if (!board.includes(EMPTY)) outcome = 'draw';
  const turn = outcome === 'open' ? 'black' : 'none';
  return { state: { ...state, board, moves, last: { i: j, by: 'white' }, outcome, turn }, won: false };
}

const T = {
  zh: { won: '你胜了', lost: '对手连成五子', draw: '和棋', open: '执黑落子', again: '再来一局', cell: (r, c) => `第${r + 1}行第${c + 1}列` },
  en: { won: 'You win', lost: 'Your rival made five', draw: 'Draw', open: 'Black to play', again: 'Play again', cell: (r, c) => `row ${r + 1}, column ${c + 1}` },
};

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const open = state.outcome === 'open';
  const cells = state.board.map((v, i) => {
    const r = Math.floor(i / N), c = i % N;
    const last = state.last && state.last.i === i ? ' is-last' : '';
    const stone = v === EMPTY ? '' : `<span class="g-wuziqi-stone ${v === BLACK ? 'is-b' : 'is-w'}${last}"></span>`;
    if (v === EMPTY && open) {
      return `<button type="button" class="g-wuziqi-cell" data-g="play" data-i="${i}" aria-label="${t.cell(r, c)}"></button>`;
    }
    return `<span class="g-wuziqi-cell">${stone}</span>`;
  }).join('');
  const again = state.outcome === 'lost' || state.outcome === 'draw'
    ? `<button type="button" class="g-wuziqi-again" data-g="again">${t.again}</button>` : '';
  return `<div class="g-wuziqi is-${state.outcome}">`
    + `<div class="g-wuziqi-board" style="--n:${N}">${cells}</div>`
    + `<div class="g-wuziqi-foot"><span class="g-wuziqi-status">${t[state.outcome] || ''}</span>${again}</div>`
    + `</div>`;
}
