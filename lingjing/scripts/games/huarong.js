// 华容道 — escape the 秘境. 4 wide × 5 tall sliding-block puzzle; tap-only.
// The 2×2 block (你) must reach the exit at the bottom middle (x 1–2, y 3–4).
// Pure module: newGame/html/act never touch document or window.

export const meta = {
  id: 'huarong',
  name: { zh: '华容道', en: 'Huarong Pass' },
  how: {
    zh: '点一块再点箭头或旁边空格，一次滑一格；把金色的「你」移到下方出口。',
    en: 'Tap a block, then an arrow or an empty cell beside it; slide the gold block to the bottom exit.',
  },
};

const W = 4, H = 5;
const EXIT = { x: 1, y: 3 };
const SIZE = { k: [2, 2], v: [1, 2], h: [2, 1], s: [1, 1] };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const ARROW = { up: '↑', left: '←', down: '↓', right: '→' };

// Rows top→bottom, 20 chars; same letter = one block, Y = the 2×2, '.' = empty.
// Optimal single-step move counts are asserted in tests/game-huarong.test.mjs.
const LAYOUTS = {
  1: ['GDHIBDEEB.YYACYYACF.', 'IFC.EECBYYGBYYADH.AD', 'A.EEA.FBYYCBYYCDIGHD'], // 12 · 15 · 19
  2: ['FEEHAYYBAYYBDC.GDC.I', 'IGEEBYYCBYYCH.DA.FDA', 'EEGDFYYDHYYIB.CAB.CA'], // 29 · 32 · 40
  3: ['YYDDYYG.IB.AHBCAEECF', 'YYFAYYHA.DDB.CCBGIEE', 'CYYDCYYDAEE.A.IBGFHB'], // 63 · 88 · 115
};

export const layouts = LAYOUTS;

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h;
}

export function parseLayout(grid) {
  const seen = new Map();
  [...grid].forEach((ch, i) => {
    if (ch === '.') return;
    const x = i % W, y = (i / W) | 0;
    const r = seen.get(ch);
    if (!r) seen.set(ch, { ch, x0: x, y0: y, x1: x, y1: y });
    else Object.assign(r, { x0: Math.min(r.x0, x), y0: Math.min(r.y0, y), x1: Math.max(r.x1, x), y1: Math.max(r.y1, y) });
  });
  const kind = (w, h) => (w === 2 && h === 2 ? 'k' : w === 2 ? 'h' : h === 2 ? 'v' : 's');
  const blocks = [...seen.values()].map((r) => ({ t: kind(r.x1 - r.x0 + 1, r.y1 - r.y0 + 1), x: r.x0, y: r.y0 }));
  blocks.sort((a, b) => (a.t === 'k' ? -1 : b.t === 'k' ? 1 : a.y - b.y || a.x - b.x));
  return blocks.map((b, id) => ({ id, ...b }));
}

export function newGame(seed, level = 1) {
  const lv = LAYOUTS[level] ? Number(level) : 1;
  const list = LAYOUTS[lv];
  const pick = hash(`${seed}`) % list.length;
  return { level: lv, layout: pick, blocks: parseLayout(list[pick]), sel: null, moves: 0, won: false };
}

const covers = (b, x, y) => {
  const [w, h] = SIZE[b.t];
  return x >= b.x && x < b.x + w && y >= b.y && y < b.y + h;
};

const isWon = (blocks) => blocks.some((b) => b.t === 'k' && b.x === EXIT.x && b.y === EXIT.y);

export function canMove(blocks, id, dir) {
  const b = blocks.find((o) => o.id === id);
  const d = DIRS[dir];
  if (!b || !d) return false;
  const [w, h] = SIZE[b.t];
  const nx = b.x + d[0], ny = b.y + d[1];
  if (nx < 0 || ny < 0 || nx + w > W || ny + h > H) return false;
  for (let y = ny; y < ny + h; y++)
    for (let x = nx; x < nx + w; x++)
      if (blocks.some((o) => o.id !== id && covers(o, x, y))) return false;
  return true;
}

// Which way must block b slide one step so it covers cell (x, y)? null if not adjacent.
function dirToward(b, x, y) {
  const [w, h] = SIZE[b.t];
  const inCols = x >= b.x && x < b.x + w, inRows = y >= b.y && y < b.y + h;
  if (inRows && x === b.x - 1) return 'left';
  if (inRows && x === b.x + w) return 'right';
  if (inCols && y === b.y - 1) return 'up';
  if (inCols && y === b.y + h) return 'down';
  return null;
}

function slide(state, id, dir) {
  if (!canMove(state.blocks, id, dir)) return { state, won: false };
  const [dx, dy] = DIRS[dir];
  const blocks = state.blocks.map((b) => (b.id === id ? { ...b, x: b.x + dx, y: b.y + dy } : b));
  const won = isWon(blocks);
  return { state: { ...state, blocks, sel: won ? null : id, moves: state.moves + 1, won }, won };
}

function tapCell(state, x, y) {
  const sel = state.blocks.find((b) => b.id === state.sel);
  if (sel) {
    const dir = dirToward(sel, x, y);
    return dir ? slide(state, sel.id, dir) : { state, won: false };
  }
  // Nothing selected: if exactly one neighbour can slide into this cell, slide it.
  const cands = state.blocks
    .map((b) => [b, dirToward(b, x, y)])
    .filter(([b, d]) => d && canMove(state.blocks, b.id, d));
  if (cands.length === 1) return slide(state, cands[0][0].id, cands[0][1]);
  return { state, won: false };
}

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const g = data.g;
  if (g === 'block') {
    const id = Number(data.b);
    if (!state.blocks.some((b) => b.id === id)) return { state, won: false };
    return { state: { ...state, sel: state.sel === id ? null : id }, won: false };
  }
  if (g === 'move') {
    if (state.sel == null || !DIRS[data.dir]) return { state, won: false };
    return slide(state, state.sel, data.dir);
  }
  if (g === 'cell') {
    const x = Number(data.x), y = Number(data.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= W || y >= H) return { state, won: false };
    if (state.blocks.some((b) => covers(b, x, y))) return { state, won: false };
    return tapCell(state, x, y);
  }
  return { state, won: false };
}

const T = {
  zh: { you: '你', v: '岩', h: '藤', s: '石', moves: '步数', exit: '出口', won: (n) => `出了秘境 · ${n} 步`, pick: '先点一块' },
  en: { you: 'You', v: '', h: '', s: '', moves: 'Moves', exit: 'Exit', won: (n) => `Out of the hidden realm · ${n} moves`, pick: 'Tap a block first' },
};

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const cells = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (!state.blocks.some((b) => covers(b, x, y)))
        cells.push(`<button type="button" class="g-huarong-cell" data-g="cell" data-x="${x}" data-y="${y}" style="grid-column:${x + 1};grid-row:${y + 1}" aria-label="${x},${y}"${state.won ? ' disabled' : ''}></button>`);
  const blocks = state.blocks.map((b) => {
    const [w, h] = SIZE[b.t];
    const cls = `g-huarong-block g-huarong-${b.t}${state.sel === b.id ? ' is-sel' : ''}`;
    const label = b.t === 'k' ? t.you : t[b.t];
    return `<button type="button" class="${cls}" data-g="block" data-b="${b.id}" style="grid-column:${b.x + 1} / span ${w};grid-row:${b.y + 1} / span ${h}"${state.won ? ' disabled' : ''}>${label}</button>`;
  });
  const arrows = Object.keys(ARROW).map((dir) => {
    const ok = !state.won && state.sel != null && canMove(state.blocks, state.sel, dir);
    return `<button type="button" class="g-huarong-arrow g-huarong-${dir}" data-g="move" data-dir="${dir}"${ok ? '' : ' disabled'}>${ARROW[dir]}</button>`;
  });
  const status = state.won
    ? `<div class="g-huarong-won">${t.won(state.moves)}</div>`
    : `<div class="g-huarong-moves">${t.moves} ${state.moves}${state.sel == null ? ` · ${t.pick}` : ''}</div>`;
  return `<div class="g-huarong${state.won ? ' is-won' : ''}">
<div class="g-huarong-board">${cells.join('')}${blocks.join('')}<div class="g-huarong-exit" aria-hidden="true">${t.exit}</div></div>
${status}
${state.won ? '' : `<div class="g-huarong-pad">${arrows.join('')}</div>`}
</div>`;
}
