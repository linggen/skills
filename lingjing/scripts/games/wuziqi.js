// 五子棋 — 斗法 with a rival cultivator. Pure ES module: newGame / html / act.
// Board 15×15, player black (1) moves first, rival white (2) answers inside act().
// Deterministic: every AI tie-break comes from a PRNG seeded by (seed, move count).

export const meta = {
  id: 'wuziqi',
  sounds: ['place', 'reply', 'bad'], // what it names (games/kit/audio/sounds.json; tests/game-sound.test.mjs)
  name: { zh: '五子棋', en: 'Five in a row' },
  how: {
    zh: '执黑先行，横竖斜连成五子即胜；对手连成五子则败。',
    en: 'You play black and move first; five in a row in any line wins.',
  },
};

export const N = 15;
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
export function patternScore(board, i, who) {
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

export function candidates(board) {
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

/* The rival's strength, 1–4 (Hanli 10-19: the first game fair, later ones a real test):
   1 新手 — wins, blocks a five, else lengthens its own longest line (a beginner's board);
   2 公道 — reads the board as 3 does, but half the time it does not see an open three of yours
            coming, and a quarter of its moves are its second or third thought;
   3 稳当 — reads every pattern of both colours and takes the best (no slips);
   4 老辣 — 3, then looks one reply ahead over its eight best moves.
   A tie always breaks by the seeded PRNG, so a game replays move for move. */
function easyScore(board, i, rand) {
  if (isFive(board, i, WHITE)) return 1e6;
  if (isFive(board, i, BLACK)) return 1e5;
  let best = 0;
  for (const d of DIRS) best = Math.max(best, line(board, i, d, WHITE).count);
  return best * 10 + rand() * 25;
}

const mediumScore = (board, i) => patternScore(board, i, WHITE) * 1.1 + patternScore(board, i, BLACK);

// 公道: plays its own lines at FAIR.attack of their worth and makes a four of its own only FAIR.press
// of the times it could; does not see a black open three coming FAIR.blind of the time; FAIR.slop of its
// quiet moves are a second or third thought. Never blind to a five of either colour, nor to your four.
export const FAIR = { attack: 0.4, blind: 0.7, slop: 0.4, press: 0.3 };
function fairPick(board, rand) {
  const scored = candidates(board).map((i) => {
    const own = patternScore(board, i, WHITE), theirs = patternScore(board, i, BLACK);
    const seen = theirs >= 5000 && theirs < 1e4 && rand() < FAIR.blind ? theirs * 0.05 : theirs;
    const mine = own >= 1e6 ? own : own >= 1e4 && rand() < FAIR.press ? own : own * FAIR.attack;
    return { i, s: mine + seen + rand() };
  }).sort((a, b) => b.s - a.s);
  if (scored[0].s >= 1e5 || rand() >= FAIR.slop) return scored[0].i;
  return scored[Math.min(scored.length - 1, 1 + Math.floor(rand() * 2))].i;
}

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

const PICK = {
  1: (board, rand) => bestOf(board, (i) => easyScore(board, i, rand)),
  2: fairPick,
  3: (board, rand) => bestOf(board, (i) => mediumScore(board, i) + rand()),
  4: strongPick,
};
function bestOf(board, score) {
  let best = -1, bestScore = -Infinity;
  for (const i of candidates(board)) {
    const s = score(i);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}
const aiMove = (board, level, rand) => (PICK[level] ?? PICK[2])(board, rand);

/* `level` is the realm's (Look's gameLevel, 1–3): the rival one step above it (2 公道 → 4 老辣).
   `opts.ai` names the rival outright — a story board's own (tasks/world.json `deal.ai`: 困阵 is 2).
   `opts.solved` is the task's done_line, said on the win; `opts.rival` the rival's name (the 阵). */
export function newGame(seed, level = 1, opts = {}) {
  const s = String(seed ?? '');
  const ai = clampAi(opts?.ai ?? (Number(level) || 1) + 1);
  return {
    game: 'wuziqi', seed: s, base: s, again: 0, ai,
    ...(opts?.solved ? { solved: opts.solved } : {}), ...(opts?.rival ? { rival: opts.rival } : {}),
    board: new Array(N * N).fill(EMPTY),
    turn: 'black', outcome: 'open', last: null, moves: 0, won: false,
  };
}
const clampAi = (n) => Math.min(4, Math.max(1, Math.round(Number(n)) || 2));

/* The five (or more) in a row through i, as cell indices — the win line drawn on the board. */
export function fiveAt(board, i, who) {
  for (const d of DIRS) {
    const cells = [i];
    const r0 = Math.floor(i / N), c0 = i % N;
    for (const s of [1, -1]) {
      let r = r0 + d[0] * s, c = c0 + d[1] * s;
      while (inside(r, c) && board[r * N + c] === who) { cells.push(r * N + c); r += d[0] * s; c += d[1] * s; }
    }
    if (cells.length >= 5) return cells.sort((a, b) => a - b);
  }
  return null;
}

/* Stars on a win, by the black stones it took (Hanli 10-19: few moves · a win · a long one):
   ★★★ within QUICK, ★★ within STEADY, else ★. The story task reads them as its grade (stars: 3). */
export const QUICK = 12, STEADY = 20;
export const starsFor = (blackMoves) => (blackMoves <= QUICK ? 3 : blackMoves <= STEADY ? 2 : 1);

// Refused: the same state back — the host sees the picture unchanged and rings its seal-red refusal (live-games.js tapNope).
const refused = (state) => ({ state, won: false });

export function act(state, data) {
  const g = data && data.g;
  if (g === 'again') {
    if (state.outcome !== 'lost' && state.outcome !== 'draw') return refused(state);
    const again = (state.again || 0) + 1;
    const fresh = newGame(`${state.base ?? state.seed}|again${again}`, 1, { ai: aiOf(state), solved: state.solved, rival: state.rival });
    return { state: { ...fresh, base: state.base ?? state.seed, again }, won: false };
  }
  // A tap on a stone, or on the board once the game is over, is answered (the host rings it), never dead.
  if (g !== 'play' || state.outcome !== 'open') return refused(state);
  const i = Number(data.i);
  if (!Number.isInteger(i) || i < 0 || i >= N * N || state.board[i] !== EMPTY) return refused(state);

  const board = state.board.slice();
  board[i] = BLACK;
  let moves = state.moves + 1;
  if (isFive(board, i, BLACK)) {
    const stars = starsFor(Math.ceil(moves / 2));
    return { state: { ...state, board, moves, last: { i, by: 'black' }, mine: i, at: Date.now(), outcome: 'won', turn: 'none', won: true, stars, line: fiveAt(board, i, BLACK) }, won: true };
  }
  if (!board.includes(EMPTY)) {
    return { state: { ...state, board, moves, last: { i, by: 'black' }, outcome: 'draw', turn: 'none' }, won: false };
  }
  const rand = mulberry32(hash(`${state.seed}|${moves}`));
  const j = aiMove(board, aiOf(state), rand);
  board[j] = WHITE;
  moves++;
  let outcome = 'open';
  if (isFive(board, j, WHITE)) outcome = 'lost';
  else if (!board.includes(EMPTY)) outcome = 'draw';
  const turn = outcome === 'open' ? 'black' : 'none';
  const line = outcome === 'lost' ? { line: fiveAt(board, j, WHITE) } : {};
  return { state: { ...state, board, moves, last: { i: j, by: 'white' }, mine: i, at: Date.now(), outcome, turn, ...line }, won: false };
}
// A board dealt before 10-19 carried `level` (1–3), never `ai`.
const aiOf = (state) => state.ai ?? clampAi((state.level ?? 1) + 1);

const T = {
  zh: { won: '你胜了', lost: (r) => `${r}连成了五子`, draw: '和棋', open: '执黑落子', again: '再来一局', rival: '对手', cell: (r, c) => `第${r + 1}行第${c + 1}列`, moves: (n) => `第 ${n} 手` },
  en: { won: 'You win', lost: (r) => `${r} made five`, draw: 'Draw', open: 'Black to play', again: 'Play again', rival: 'Your rival', cell: (r, c) => `row ${r + 1}, column ${c + 1}`, moves: (n) => `move ${n}` },
};
const esc = (v) => String(v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const pickLang = (v, lang) => (v && typeof v === 'object' ? v[lang] ?? v.zh : v);

function statusOf(state, t, lang) {
  if (state.outcome === 'won') return state.solved ? esc(pickLang(state.solved, lang)) : t.won;
  if (state.outcome === 'lost') return t.lost(esc(pickLang(state.rival, lang) ?? t.rival));
  if (state.outcome === 'draw') return t.draw;
  return state.moves ? `${t.open} · ${t.moves(Math.ceil(state.moves / 2) + 1)}` : t.open;
}

/* The stage repaints by replacing its nodes: the drop-in and the glow play only for a move just made
   (FRESH ms), never again on a later repaint of the same board. */
const FRESH = 1500;
export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const win = new Set(state.line ?? []);
  const fresh = state.at && Date.now() - state.at < FRESH ? ' is-fresh' : '';
  const cells = state.board.map((v, i) => {
    const r = Math.floor(i / N), c = i % N;
    const last = state.last && state.last.i === i ? ' is-last' : '';
    const mine = state.mine === i ? ' is-mine' : '';
    const inLine = win.has(i) ? ' is-win' : '';
    const stone = v === EMPTY ? '' : `<span class="g-wuziqi-stone ${v === BLACK ? 'is-b' : 'is-w'}${last}${mine}${inLine}"></span>`;
    // Every point is a button (a stone, or the board after the end, rings a refusal — no dead tap).
    return `<button type="button" class="g-wuziqi-cell${v === EMPTY ? '' : ' is-taken'}" data-g="play" data-i="${i}" aria-label="${t.cell(r, c)}">${stone}</button>`;
  }).join('');
  const again = state.outcome === 'lost' || state.outcome === 'draw'
    ? `<button type="button" class="g-wuziqi-again" data-g="again">${t.again}</button>` : '';
  const stars = state.outcome === 'won' && state.stars ? `<span class="g-wuziqi-stars" aria-label="${state.stars}/3">${'★'.repeat(state.stars)}${'☆'.repeat(3 - state.stars)}</span>` : '';
  return `<div class="g-wuziqi is-${state.outcome}${fresh}">`
    + `<div class="g-wuziqi-board" style="--n:${N}">${cells}</div>`
    + `<div class="g-wuziqi-foot"><span class="g-wuziqi-status">${statusOf(state, t, lang)}</span>${stars}${again}</div>`
    + `</div>`;
}

/** What a step sounded (games/kit/heard.js): his stone down (place), the rival's answer (reply), five of the rival's or a
    full board (bad); a fresh game after a loss is a pick-up (place). */
export function sounds(b, a) {
  if (!b || !a) return [];
  if ((a.moves ?? 0) <= (b.moves ?? 0)) return (a.again ?? 0) > (b.again ?? 0) ? ['place'] : [];
  const out = ['place'];
  if (a.last?.by === 'white') out.push('reply');
  if (a.outcome === 'lost' || a.outcome === 'draw') out.push('bad');
  return out;
}
