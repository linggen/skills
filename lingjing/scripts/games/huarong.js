// 华容道 — a 4 wide × 5 tall sliding-block puzzle; tap-only (or WASD / arrows).
// The 2×2 block must reach the exit at the bottom middle (x 1–2, y 3–4) — the exit's place is the kit's rule.
// Pure module: newGame/html/act never touch document or window; `mount` (games/mount.js's contract) resolves
// the level first, then plays the pure board.
//
// Levels are data. A level (all keys optional but `id`; a missing one falls back to the built-in `mijing`'s):
//   id        string
//   name      {zh, en}                    the level's title (a host's bar reads it; meta.name is mijing's)
//   how       {zh: {desk, touch}, en: …}   the how-to (likewise; meta.how is mijing's)
//   layouts   {1: [grid, …], 2: […], 3: […]}  by difficulty (newGame's `level`); a grid is 20 chars, rows
//                                         top→bottom, same letter = one block, Y = the 2×2, '.' = empty
//   start     {zh, en}                    a line under the board until the first move (mijing: none)
//   win       {zh, en}                    the line on a win; `{n}` = the moves taken
//   you       {zh, en}                    the 2×2 block's label
//   labels    {v|h|s: {zh, en} | [{zh, en}, …]}  what the small blocks are, by kind (v 1×2, h 2×1, s 1×1);
//                                         a list is handed out in reading order (top→bottom, left→right
//                                         of the dealt grid) — one person each in a crowd
//   exit      {zh, en}                    the exit's name ("the back of the crowd")
//   art       {k, v, h, s, floor}         image paths: relative to this module's art dir (games/huarong/), or
//                                         from the skill root when they start `worlds/jiuding/art/games/`
// Where a level comes from (levelFor / pickLevel): `data.levels[0]` (a deal, as Look hands it), else the
// games.json rows with id `huarong`, by `data.level` (a level id), else `mijing`. The `level` number stays
// the difficulty. Optimal move counts of every layout are asserted in tests/game-huarong.test.mjs.
import { mountPure } from './mount.js';

// Rows top→bottom, 20 chars; same letter = one block, Y = the 2×2, '.' = empty.
const LAYOUTS = {
  1: ['GDHIBDEEB.YYACYYACF.', 'IFC.EECBYYGBYYADH.AD', 'A.EEA.FBYYCBYYCDIGHD'], // 12 · 15 · 19
  2: ['FEEHAYYBAYYBDC.GDC.I', 'IGEEBYYCBYYCH.DA.FDA', 'EEGDFYYDHYYIB.CAB.CA'], // 29 · 32 · 40
  3: ['YYDDYYG.IB.AHBCAEECF', 'YYFAYYHA.DDB.CCBGIEE', 'CYYDCYYDAEE.A.IBGFHB'], // 63 · 88 · 115
};

export const layouts = LAYOUTS;

/** The built-in level: escape the 秘境 (Painted by FLUX, tools/paint-huarong-flux.py, 2026-10-20). */
export const MIJING = {
  id: 'mijing',
  name: { zh: '华容道', en: 'Huarong Pass' },
  how: {
    zh: { desk: '点一块再点箭头或旁边空格，一次滑一格；键盘 WASD 或方向键也行（没选时动小满）。把小满挪到下方出口。', touch: '点一块再点箭头或旁边空格，一次滑一格。把小满挪到下方出口。' },
    en: { desk: 'Tap a block, then an arrow or an empty cell beside it; or WASD / arrow keys (they move Xiaoman when none is picked). Get Xiaoman out through the bottom exit.', touch: 'Tap a block, then an arrow or an empty cell beside it. Get Xiaoman out through the bottom exit.' },
  },
  layouts: LAYOUTS,
  win: { zh: '挤出来了 · {n} 步', en: 'Squeezed out · {n} moves' },
  you: { zh: '你', en: 'You' },
  labels: { v: { zh: '岩', en: '' }, h: { zh: '藤', en: '' }, s: { zh: '石', en: '' } },
  exit: { zh: '出口', en: 'Exit' },
  art: { k: 'k.webp', v: 'v.webp', h: 'h.webp', s: 's.webp', floor: 'floor.webp' },
};

export const meta = {
  id: 'huarong',
  sounds: ['pick', 'move'], // what it names (games/kit/audio/sounds.json; tests/game-sound.test.mjs)
  name: MIJING.name,
  how: MIJING.how,
  // WASD and the arrow keys slide the picked block (Hanli 2026-10-20: 「可以用wsad触发移动吗」).
  keys: {
    w: { g: 'move', dir: 'up' }, a: { g: 'move', dir: 'left' }, s: { g: 'move', dir: 'down' }, d: { g: 'move', dir: 'right' },
    ArrowUp: { g: 'move', dir: 'up' }, ArrowLeft: { g: 'move', dir: 'left' }, ArrowDown: { g: 'move', dir: 'down' }, ArrowRight: { g: 'move', dir: 'right' },
  },
};

const W = 4, H = 5;
const EXIT = { x: 1, y: 3 };
const SIZE = { k: [2, 2], v: [1, 2], h: [2, 1], s: [1, 1] };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const ARROW = { up: '↑', left: '←', down: '↓', right: '→' };

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

const okGrid = (g) => typeof g === 'string' && /^[A-Z.]{20}$/.test(g) && parseLayout(g).filter((b) => b.t === 'k').length === 1;

/** A level's layouts by difficulty, the ill-formed grids dropped; none left → mijing's. */
function layoutsOf(lvl) {
  const out = {};
  for (const [k, list] of Object.entries(lvl?.layouts ?? {})) {
    const ok = Array.isArray(list) ? list.filter(okGrid) : [];
    if (ok.length && Number.isInteger(Number(k))) out[Number(k)] = ok;
  }
  return Object.keys(out).length ? out : LAYOUTS;
}

/** The level a deal plays: `deal.levels` (the one `deal.level` names, else the first), else mijing. */
export function pickLevel(deal = {}) {
  const levels = Array.isArray(deal?.levels) ? deal.levels.filter((l) => l && typeof l === 'object') : [];
  return levels.find((l) => l.id === deal.level) ?? levels[0] ?? MIJING;
}

/** Every level of the registry's `huarong` rows (worlds/jiuding/games.json), each carrying its row's name. */
export function ladderOf(registry) {
  return (registry?.games ?? []).filter((g) => g.id === meta.id).flatMap((g) => (g.levels ?? []).map((l) => ({ ...(g.name ? { name: g.name } : {}), ...l })));
}

/** The level a mount plays: `data.levels[0]`, else the registry's level named `data.level`, else mijing. */
export function levelFrom(data = {}, registry = null) {
  if (Array.isArray(data?.levels) && data.levels.length) return pickLevel(data);
  if (!data?.level || data.level === MIJING.id) return MIJING;
  return ladderOf(registry).find((l) => l.id === data.level) ?? MIJING;
}

export async function levelFor(opts = {}) {
  const data = opts.data ?? {};
  if ((Array.isArray(data.levels) && data.levels.length) || !data.level || data.level === MIJING.id) return levelFrom(data);
  const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url)).catch(() => null);
  return levelFrom(data, res?.ok ? await res.json().catch(() => null) : null);
}

export function newGame(seed, level = 1, deal = {}) {
  const lvl = pickLevel(deal);
  const lays = lvl === MIJING ? LAYOUTS : layoutsOf(lvl);
  const lv = lays[level] ? Number(level) : lays[1] ? 1 : Math.min(...Object.keys(lays).map(Number));
  const list = lays[lv];
  const pick = hash(`${seed}`) % list.length;
  const own = lvl === MIJING ? {} : { lv: Object.fromEntries(['id', 'name', 'start', 'win', 'you', 'labels', 'exit', 'art'].filter((k) => lvl[k] != null).map((k) => [k, lvl[k]])) };
  return { level: lv, layout: pick, blocks: parseLayout(list[pick]), sel: null, moves: 0, won: false, ...own };
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
    if (!DIRS[data.dir]) return { state, won: false };
    // Nothing picked: a key moves 你 (an arrow button stays disabled until a block is picked).
    const id = state.sel ?? state.blocks.find((b) => b.t === 'k')?.id;
    if (id == null) return { state, won: false };
    return slide(state, id, data.dir);
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
  zh: { moves: '步数', pick: '先点一块' },
  en: { moves: 'Moves', pick: 'Tap a block first' },
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const say = (o, lang) => (o && typeof o === 'object' ? o[lang] ?? o.zh ?? '' : typeof o === 'string' ? o : '');
const ART_ROOT = 'worlds/jiuding/art/games/';
const okPath = (p) => typeof p === 'string' && /^[\w./-]+$/.test(p) && !p.split('/').includes('..');
/** An art path as a URL: from the skill root under worlds/jiuding/art/games/, else in games/huarong/. */
export const artUrl = (p) => (!okPath(p) ? null : p.startsWith(ART_ROOT) ? new URL(`../../${p}`, import.meta.url).href : new URL(`./huarong/${p}`, import.meta.url).href);

/** A block's label: the level's `labels[kind]` (a list in reading order), the 2×2 the level's `you`. */
function labelOf(lvl, state, b, lang) {
  if (b.t === 'k') return say(lvl.you ?? MIJING.you, lang);
  const l = (lvl.labels ?? MIJING.labels)[b.t];
  if (!Array.isArray(l)) return say(l, lang);
  const nth = state.blocks.filter((o) => o.t === b.t && o.id < b.id).length;
  return say(l[nth % l.length], lang);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const lvl = state.lv ?? MIJING;
  // A data level's art goes inline (huarong.css holds mijing's): the floor under the board's two exit walls, a picture per block kind.
  const art = state.lv?.art ?? {};
  const bg = (k) => { const u = artUrl(art[k]); return u ? `url(&quot;${esc(u)}&quot;)` : ''; };
  const wall = 'linear-gradient(var(--line), var(--line))';
  const boardStyle = bg('floor') ? ` style="background-image:${wall},${wall},${bg('floor')}"` : '';
  const cells = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (!state.blocks.some((b) => covers(b, x, y)))
        cells.push(`<button type="button" class="g-huarong-cell" data-g="cell" data-x="${x}" data-y="${y}" style="grid-column:${x + 1};grid-row:${y + 1}" aria-label="${x},${y}"${state.won ? ' disabled' : ''}></button>`);
  const blocks = state.blocks.map((b) => {
    const [w, h] = SIZE[b.t];
    const cls = `g-huarong-block g-huarong-${b.t}${state.sel === b.id ? ' is-sel' : ''}`;
    const label = labelOf(lvl, state, b, lang);
    return `<button type="button" class="${cls}" data-g="block" data-b="${b.id}" aria-label="${esc(label || b.t)}" style="grid-column:${b.x + 1} / span ${w};grid-row:${b.y + 1} / span ${h}${bg(b.t) ? `;background-image:${bg(b.t)}` : ''}"${state.won ? ' disabled' : ''}></button>`;
  });
  const arrows = Object.keys(ARROW).map((dir) => {
    const ok = !state.won && state.sel != null && canMove(state.blocks, state.sel, dir);
    return `<button type="button" class="g-huarong-arrow g-huarong-${dir}" data-g="move" data-dir="${dir}"${ok ? '' : ' disabled'}>${ARROW[dir]}</button>`;
  });
  const start = state.moves === 0 && !state.won ? say(lvl.start, lang) : '';
  const status = state.won
    ? `<div class="g-huarong-won">${esc(say(lvl.win ?? MIJING.win, lang).replace('{n}', String(state.moves)))}</div>`
    : `${start ? `<div class="g-huarong-start">${esc(start)}</div>` : ''}<div class="g-huarong-moves">${t.moves} ${state.moves}${state.sel == null ? ` · ${t.pick}` : ''}</div>`;
  return `<div class="g-huarong${state.won ? ' is-won' : ''}">
<div class="g-huarong-board"${boardStyle}>${cells.join('')}${blocks.join('')}<div class="g-huarong-exit" aria-hidden="true">${esc(say(lvl.exit ?? MIJING.exit, lang))}</div></div>
${status}
${state.won ? '' : `<div class="g-huarong-pad">${arrows.join('')}</div>`}
</div>`;
}

/* ── Standalone: the mount contract (games/mount.js) — the level resolved, then the pure board. ── */
export async function mount(container, opts = {}) {
  const level = await levelFor(opts);
  return mountPure({ meta, newGame, act, html })(container, { ...opts, data: { ...(opts.data ?? {}), levels: [level] } });
}

/** What a step sounded (games/kit/heard.js): a block picked up or put back (pick), a block slid (move). */
export function sounds(b, a) {
  if (!b || !a) return [];
  if ((a.moves ?? 0) > (b.moves ?? 0)) return ['move'];
  return a.sel !== b.sel ? ['pick'] : [];
}
