// 华容道 — a 4 wide × 5 tall sliding-block puzzle; tap-only (or WASD / arrows).
// The 2×2 block must reach the exit at the bottom middle (x 1–2, y 3–4) — the exit's place is the kit's rule.
// Pure module: newGame/html/act never touch document or window; `mount` (games/mount.js's contract) resolves
// the level first, then plays the pure board.
//
// 问询 on this board is the board's own (`meta.ask`, cards.js): the first tap says the goal and the one rule, each
// tap after lights one good next move (the shortest way out from the board as it stands, `solve`) — never the
// scenery (Hanli 10-27, 晒经: 「这个怎么玩, 有点难, 第一次玩华容道」). 重来 (`meta.restart`, the shell's ↺) lays the
// same deal again at 0 moves (「能否加一个重来的按钮」).
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
// 0 is a first meeting (the daily board's `climb`, worlds/jiuding/tasks/world.json): 小满 straight above the exit.
const LAYOUTS = {
  0: ['ABBCDYYEFYYGH..IHJKI', 'CCABDYYEFYYGH..IHJKI'], // 10 · 10
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
    zh: { desk: '把小满（最大那块）挪出下方出口。每块只能滑进空格：点它，再点箭头。', touch: '把小满（最大那块）挪出下方出口。每块只能滑进空格：点它，再点箭头。' },
    en: { desk: 'Get Xiaoman (the big block) out the bottom exit. A block slides only into empty squares: tap it, then an arrow.', touch: 'Get Xiaoman (the big block) out the bottom exit. A block slides only into empty squares: tap it, then an arrow.' },
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
  // Q / E pick the block before / after in reading order, Esc puts it back (小满 moves again) — keyboard-only play
  // (Hanli 10-27). `pass`: a key that would change nothing goes on to the page (Esc with nothing picked closes as ever).
  keys: {
    w: { g: 'move', dir: 'up' }, a: { g: 'move', dir: 'left' }, s: { g: 'move', dir: 'down' }, d: { g: 'move', dir: 'right' },
    ArrowUp: { g: 'move', dir: 'up' }, ArrowLeft: { g: 'move', dir: 'left' }, ArrowDown: { g: 'move', dir: 'down' }, ArrowRight: { g: 'move', dir: 'right' },
    q: { g: 'cycle', step: -1 }, e: { g: 'cycle', step: 1 }, Escape: { g: 'unpick', pass: true },
  },
  // The card's 问询 is this board's tap (cards.js): how to play, then a next move — not lore.
  ask: (state) => (state && !state.won ? 'hint' : null),
  // The shell's ↺ (shell.js restartHtml): this board can start over, once a move has been made.
  restart: (state) => Boolean(state && !state.won && (state.moves > 0 || state.sel != null)),
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
  // A climbing task's `deal.lv` (rules/climb.mjs: 0 the first time he meets the board) is the difficulty, else `level`.
  const want = deal?.lv != null && lays[Number(deal.lv)] ? Number(deal.lv) : level;
  const lv = lays[want] ? Number(want) : lays[1] ? 1 : Math.min(...Object.keys(lays).map(Number));
  const list = lays[lv];
  const pick = hash(`${seed}`) % list.length;
  const own = lvl === MIJING ? {} : { lv: Object.fromEntries(['id', 'name', 'start', 'win', 'you', 'labels', 'exit', 'art'].filter((k) => lvl[k] != null).map((k) => [k, lvl[k]])) };
  return { level: lv, layout: pick, grid: list[pick], blocks: parseLayout(list[pick]), sel: null, moves: 0, won: false, help: 0, hint: null, ...own };
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
  // A move spends the lit hint; the next 问询 lights the next one from where the board now stands.
  return { state: { ...state, blocks, sel: won ? null : id, moves: state.moves + 1, won, hint: null }, won };
}

/* Shape-only key: like pieces are interchangeable. */
function shape(blocks) {
  const g = Array(W * H).fill('.');
  for (const b of blocks) {
    const [w, h] = SIZE[b.t];
    for (let y = b.y; y < b.y + h; y++) for (let x = b.x; x < b.x + w; x++) g[y * W + x] = b.t;
  }
  return g.join('');
}

/** The shortest way out from `start` (a breadth-first search, one block one cell a step), as steps by id; null if none. */
export function solve(start) {
  const prev = new Map([[shape(start), null]]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      if (isWon(s)) {
        const path = [];
        for (let k = shape(s); prev.get(k); k = prev.get(k).from) path.unshift(prev.get(k).step);
        return path;
      }
      for (const b of s)
        for (const dir of Object.keys(DIRS)) {
          if (!canMove(s, b.id, dir)) continue;
          const n = s.map((o) => (o.id === b.id ? { ...o, x: o.x + DIRS[dir][0], y: o.y + DIRS[dir][1] } : o));
          const k = shape(n);
          if (prev.has(k)) continue;
          prev.set(k, { from: shape(s), step: { id: b.id, dir } });
          next.push(n);
        }
    }
    frontier = next;
  }
  return null;
}

/* 问询: the first tap says the goal and the rule; each one after lights a good next move and picks its block. */
function ask(state) {
  if (!state.help) return { ...state, help: 1 };
  const step = solve(state.blocks)?.[0] ?? null;
  return step ? { ...state, help: 2, hint: step, sel: step.id } : state;
}

/* 重来: the same deal, as it was laid. */
function restart(state) {
  if (!meta.restart(state) || !okGrid(state.grid)) return state;
  return { ...state, blocks: parseLayout(state.grid), sel: null, moves: 0, won: false, hint: null };
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
  if (g === 'cycle') {
    // Reading order (top→bottom, left→right); from none, E takes the first and Q the last.
    const order = [...state.blocks].sort((a, b) => a.y - b.y || a.x - b.x).map((b) => b.id);
    const at = order.indexOf(state.sel), step = Number(data.step) < 0 ? -1 : 1;
    const next = at < 0 ? (step > 0 ? order[0] : order[order.length - 1]) : order[(at + step + order.length) % order.length];
    return { state: { ...state, sel: next }, won: false };
  }
  if (g === 'hint') return { state: ask(state), won: false };
  if (g === 'restart') return { state: restart(state), won: false };
  if (g === 'unpick') return state.sel == null ? { state, won: false } : { state: { ...state, sel: null }, won: false };
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
  zh: { moves: '步数', pick: '先点一块', keys: { desk: 'WASD/方向键 挪动 · Q/E 换一块 · Esc 回小满', touch: '' },
    rule: '{you}从下方缺口出去就成；每块只能滑进空格。', more: '再点 ? 亮出下一步。', hint: '亮着的这块，往 {arrow} 挪一格。' },
  en: { moves: 'Moves', pick: 'Tap a block first', keys: { desk: 'WASD/arrows move · Q/E pick · Esc back to Xiaoman', touch: '' },
    rule: 'Get {you} out through the gap at the bottom; a block slides only into an empty square.', more: 'Tap ? again for a next move.', hint: 'Slide the lit block {arrow} one square.' },
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
    const cls = `g-huarong-block g-huarong-${b.t}${state.sel === b.id ? ' is-sel' : ''}${state.hint?.id === b.id ? ' is-hint' : ''}`;
    const label = labelOf(lvl, state, b, lang);
    return `<button type="button" class="${cls}" data-g="block" data-b="${b.id}" aria-label="${esc(label || b.t)}" style="grid-column:${b.x + 1} / span ${w};grid-row:${b.y + 1} / span ${h}${bg(b.t) ? `;background-image:${bg(b.t)}` : ''}"${state.won ? ' disabled' : ''}></button>`;
  });
  const arrows = Object.keys(ARROW).map((dir) => {
    const ok = !state.won && state.sel != null && canMove(state.blocks, state.sel, dir);
    const lit = ok && state.hint?.id === state.sel && state.hint?.dir === dir ? ' is-hint' : '';
    return `<button type="button" class="g-huarong-arrow g-huarong-${dir}${lit}" data-g="move" data-dir="${dir}"${ok ? '' : ' disabled'}>${ARROW[dir]}</button>`;
  });
  const start = state.moves === 0 && !state.won ? say(lvl.start, lang) : '';
  // 问询's words, two short lines at most: the goal and the rule, then the lit move.
  const fill = (s) => s.replace('{you}', say(lvl.you ?? MIJING.you, lang) === say(MIJING.you, lang) ? (lang === 'en' ? 'Xiaoman' : '小满') : say(lvl.you, lang))
    .replace('{arrow}', ARROW[state.hint?.dir] ?? '');
  const help = !state.won && state.help ? `<div class="g-huarong-help"><p>${esc(fill(t.rule))}</p><p>${esc(fill(state.hint ? t.hint : t.more))}</p></div>` : '';
  const status = state.won
    ? `<div class="g-huarong-won">${esc(say(lvl.win ?? MIJING.win, lang).replace('{n}', String(state.moves)))}</div>`
    : `${start ? `<div class="g-huarong-start">${esc(start)}</div>` : ''}<div class="g-huarong-moves">${t.moves} ${state.moves}${state.sel == null ? ` · ${t.pick}` : ''}</div>`;
  return `<div class="g-huarong${state.won ? ' is-won' : ''}">
<div class="g-huarong-board"${boardStyle}>${cells.join('')}${blocks.join('')}<div class="g-huarong-exit" aria-hidden="true">${esc(say(lvl.exit ?? MIJING.exit, lang))}</div></div>
${help}${status}
${state.won ? '' : `<div class="g-huarong-pad">${arrows.join('')}</div><div class="g-huarong-keys">${esc(t.keys.desk)}</div>`}
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
