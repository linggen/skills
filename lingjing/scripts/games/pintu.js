// 拼图 — a picture cut into an n×n grid and scrambled; tap one piece, then another, and the two trade places (Hanli
// 2026-10-27: 「七巧板的游戏删了吧, 换成别的. 感觉想给3岁小孩玩的」 — the classic jigsaw-swap in its place, everywhere
// 七巧 stood: a thing in pieces, put back whole). Higher up the ladder the pieces also lie turned, and 转 ↻ (or R)
// turns the picked one a quarter. Tap-only, or the keys: arrows/WASD move the cursor, Enter/Space take it, R turns.
//
// Pure module: newGame / act / html, no DOM; `mount` is mount.js mountPure. State is plain JSON.
//
// 问询 is the board's own (`meta.ask`, cards.js): the first tap says the goal and the rule, each tap after lights one
// piece and where it belongs (or that it wants turning). 重来 (`meta.restart`, the shell's ↺) lays the same deal again.
//
// Levels by number (a climbing task's `deal.lv`, rules/climb.mjs; else `level`):
//   0  3×3, two pairs traded — four pieces out (a first meeting: two taps twice and it is whole)
//   1  3×3, every piece out of place
//   2  4×4, every piece out of place
//   3  4×4, out of place and half of them turned
//   4  5×5, out of place and most of them turned
// The picture: the deal's `pics` (paths from the skill root, `{src, a}` with a = width ÷ height, or a bare path at
// 3:2; `from`: the least level it is dealt at), one picked by the seed; else the built-in list. A picture not square is cut from its middle.
import { mountPure } from './mount.js';

export const meta = {
  id: 'pintu',
  sounds: ['pick', 'move', 'turn', 'nope'], // what it names (games/kit/audio/sounds.json; tests/game-sound.test.mjs)
  name: { zh: '拼图', en: 'Jigsaw' },
  how: {
    zh: '点一块，再点另一块，两块对调；块块归位，图就拼回来了。',
    en: 'Tap a piece, then another: they trade places. Put every piece back and the picture is whole.',
  },
  keys: {
    w: { g: 'cur', dir: 'up' }, a: { g: 'cur', dir: 'left' }, s: { g: 'cur', dir: 'down' }, d: { g: 'cur', dir: 'right' },
    ArrowUp: { g: 'cur', dir: 'up' }, ArrowLeft: { g: 'cur', dir: 'left' }, ArrowDown: { g: 'cur', dir: 'down' }, ArrowRight: { g: 'cur', dir: 'right' },
    Enter: { g: 'take' }, ' ': { g: 'take' }, r: { g: 'turn' }, Escape: { g: 'unpick', pass: true },
  },
  ask: (state) => (state && !state.won ? 'hint' : null),
  restart: (state) => Boolean(state && !state.won && (state.moves > 0 || state.sel != null)),
};

/** The ladder: grid side, how it is scrambled, whether pieces lie turned. */
export const LEVELS = {
  0: { n: 3, swaps: 2, turned: 0 },
  1: { n: 3, swaps: 'all', turned: 0 },
  2: { n: 4, swaps: 'all', turned: 0 },
  3: { n: 4, swaps: 'all', turned: 0.5 },
  4: { n: 5, swaps: 'all', turned: 0.8 },
};

/** The built-in pictures (worlds/jiuding/art: the book's own paintings, nothing painted for this board). */
export const PICS = [
  { src: 'worlds/jiuding/art/setpiece/chendingshan.webp', a: 1.5 },
  { src: 'worlds/jiuding/art/places/waimen.webp', a: 1.5 },
  { src: 'worlds/jiuding/art/places/zhengdian.webp', a: 1.5 },
  // the ink map is the hardest face (pale, alike all over): only from 4×4 up (`from`, the least level it is dealt at)
  { src: 'worlds/jiuding/art/map/jiuzhou-ink.webp', a: 1536 / 1126, from: 2 },
];

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h;
}
/* A small seeded generator (mulberry32): the same seed deals the same board. */
function rng(seed) {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const okPath = (p) => typeof p === 'string' && /^[\w./-]+$/.test(p) && !p.split('/').includes('..') && p.startsWith('worlds/');
function picsOf(deal) {
  const list = (Array.isArray(deal?.pics) ? deal.pics : [])
    .map((p) => (typeof p === 'string' ? { src: p, a: 1.5 } : p))
    .filter((p) => p && okPath(p.src) && Number(p.a) > 0);
  return list.length ? list : PICS;
}

/* Every piece off its place: a shuffle with no piece left home (a derangement, by retrying a seeded shuffle). */
function deranged(n2, rand) {
  for (;;) {
    const ids = [...Array(n2).keys()];
    for (let i = n2 - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    if (ids.every((id, i) => id !== i)) return ids;
  }
}
/* `k` disjoint pairs traded: 2k pieces out, k taps-pairs to mend. */
function pairs(n2, k, rand) {
  const ids = [...Array(n2).keys()], free = [...ids];
  for (let p = 0; p < k && free.length >= 2; p++) {
    const a = free.splice(Math.floor(rand() * free.length), 1)[0];
    const b = free.splice(Math.floor(rand() * free.length), 1)[0];
    [ids[a], ids[b]] = [ids[b], ids[a]];
  }
  return ids;
}

/** The level a deal plays: `deal.lv` (a climb), else `level`, held to the ladder. */
export function levelOf(level, deal) {
  const want = deal?.lv != null && LEVELS[Number(deal.lv)] ? Number(deal.lv) : Number(level);
  return LEVELS[want] ? want : 1;
}

export function newGame(seed = '', level = 1, deal = {}) {
  const lv = levelOf(level, deal), L = LEVELS[lv], n2 = L.n * L.n, rand = rng(`pintu|${seed}`);
  const all = picsOf(deal), fit = all.filter((p) => !(Number(p.from) > lv)), pics = fit.length ? fit : all;
  const pic = pics[hash(seed) % pics.length];
  const ids = L.swaps === 'all' ? deranged(n2, rand) : pairs(n2, L.swaps, rand);
  // Turned pieces: a share of them, each a quarter, a half or three quarters off.
  const tiles = ids.map((id) => ({ id, r: L.turned && rand() < L.turned ? 1 + Math.floor(rand() * 3) : 0 }));
  if (L.turned && !tiles.some((t) => t.r)) tiles[0].r = 1;
  return { level: lv, n: L.n, turns: Boolean(L.turned), pic, deal: tiles, tiles, sel: null, cur: 0, moves: 0, won: false, help: 0, hint: null };
}

const home = (s) => s.tiles.every((t, i) => t.id === i && t.r === 0);

/** The fewest moves left: a trade puts one piece home per cycle step (n − cycles), each quarter turn a move. */
export function least(state) {
  const at = state.tiles.map((t) => t.id), seen = new Set();
  let swaps = 0;
  for (let i = 0; i < at.length; i++) {
    if (seen.has(i)) continue;
    let len = 0;
    for (let j = i; !seen.has(j); j = at[j]) { seen.add(j); len++; }
    swaps += len - 1;
  }
  return swaps + state.tiles.reduce((m, t) => m + (4 - t.r) % 4, 0);
}

function settle(next) {
  const won = home(next);
  return { state: { ...next, won, ...(won ? { sel: null, hint: null } : {}) }, won };
}

/* A tap on the piece at `i`: pick it, put it back, or trade it with the one picked. */
function take(state, i) {
  if (state.sel == null) return { state: { ...state, sel: i, cur: i }, won: false };
  if (state.sel === i) return { state: { ...state, sel: null, cur: i }, won: false };
  const tiles = [...state.tiles];
  [tiles[state.sel], tiles[i]] = [tiles[i], tiles[state.sel]];
  return settle({ ...state, tiles, sel: null, cur: i, moves: state.moves + 1, hint: null });
}

function turn(state) {
  if (!state.turns || state.sel == null) return { state: { ...state, refused: true }, won: false };
  const tiles = state.tiles.map((t, i) => (i === state.sel ? { ...t, r: (t.r + 1) % 4 } : t));
  return settle({ ...state, tiles, moves: state.moves + 1, hint: null });
}

/* 问询: the goal and the rule, then one piece lit, and where it goes or that it wants turning. */
function ask(state) {
  if (!state.help) return { ...state, help: 1 };
  const i = state.tiles.findIndex((t, k) => t.id !== k);
  if (i >= 0) {
    const from = state.tiles.findIndex((t) => t.id === i);
    return { ...state, help: 2, hint: { from, to: i }, sel: from, cur: from };
  }
  const k = state.tiles.findIndex((t) => t.r !== 0);
  return k < 0 ? state : { ...state, help: 2, hint: { turn: k }, sel: k, cur: k };
}

function restart(state) {
  if (!meta.restart(state)) return state;
  return { ...state, tiles: state.deal, sel: null, cur: 0, moves: 0, won: false, hint: null };
}

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const s = state.refused ? { ...state, refused: false } : state;
  const g = data.g, n2 = s.n * s.n;
  if (g === 'tile') {
    const i = Number(data.i);
    return Number.isInteger(i) && i >= 0 && i < n2 ? take(s, i) : { state: s, won: false };
  }
  if (g === 'take') return take(s, s.cur ?? 0);
  if (g === 'turn') return turn(s);
  if (g === 'hint') return { state: ask(s), won: false };
  if (g === 'restart') return { state: restart(s), won: false };
  if (g === 'unpick') return { state: { ...s, sel: null }, won: false };
  if (g === 'cur') {
    const d = DIRS[data.dir];
    if (!d) return { state: s, won: false };
    const x = Math.min(s.n - 1, Math.max(0, (s.cur % s.n) + d[0])), y = Math.min(s.n - 1, Math.max(0, Math.floor(s.cur / s.n) + d[1]));
    return { state: { ...s, cur: y * s.n + x, kb: true }, won: false };
  }
  return { state: s, won: false };
}

const T = {
  zh: { moves: '步数', pick: '点一块', then: '再点一块对调', turn: '转 ↻', look: '原图', won: '拼回来了 · {n} 步',
    rule: '把每块换回原位：点一块，再点另一块，两块就对调。', ruleTurn: '有的块是歪的：选中它，点「转 ↻」。',
    more: '再点 ? 亮出下一块。', hint: '亮着的这块，该去虚线框那里。', hintTurn: '亮着的这块位置对了，转正它。',
    keys: { desk: '方向键/WASD 移动 · 空格 选/换 · R 转', touch: '' }, refused: '先点一块，再转。' },
  en: { moves: 'Moves', pick: 'Tap a piece', then: 'now tap another to trade', turn: 'Turn ↻', look: 'Picture', won: 'Whole again · {n} moves',
    rule: 'Put every piece home: tap one, then another, and the two trade places.', ruleTurn: 'Some pieces lie turned: pick one, tap “Turn ↻”.',
    more: 'Tap ? again for a next piece.', hint: 'The lit piece belongs in the dashed square.', hintTurn: 'The lit piece is in place; turn it upright.',
    keys: { desk: 'Arrows/WASD move · Space pick/trade · R turn', touch: '' }, refused: 'Pick a piece first, then turn it.' },
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** A picture path (from the skill root) as a URL. */
export const picUrl = (p) => (okPath(p) ? new URL(`../../${p}`, import.meta.url).href : '');
const f = (x) => Number(x.toFixed(4));

/* Where piece `id` sits in the picture: the background's size and position, cut square from the middle. */
function slice(id, n, a) {
  const wide = Math.max(1, a), tall = Math.max(1, 1 / a); // the picture over the square board, in board sides
  const col = id % n, row = Math.floor(id / n);
  const cx = ((wide - 1) * n) / 2, cy = ((tall - 1) * n) / 2; // what is cut off one side, in pieces
  const px = wide * n - 1 > 0 ? (cx + col) / (wide * n - 1) : 0, py = tall * n - 1 > 0 ? (cy + row) / (tall * n - 1) : 0;
  return `background-size:${f(wide * n * 100)}% ${f(tall * n * 100)}%;background-position:${f(px * 100)}% ${f(py * 100)}%`;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh, n = state.n, url = picUrl(state.pic?.src), a = Number(state.pic?.a) || 1.5;
  const img = url ? `background-image:url(&quot;${esc(url)}&quot;);` : '';
  const tiles = state.tiles.map((tile, i) => {
    const cls = ['g-pintu-tile', state.sel === i ? 'is-sel' : '', state.kb && state.cur === i && !state.won ? 'is-cur' : '',
      tile.id === i && tile.r === 0 && !state.won ? 'is-home' : '',
      state.hint && (state.hint.from === i || state.hint.turn === i) ? 'is-hint' : '', state.hint?.to === i ? 'is-goal' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-g="tile" data-i="${i}" aria-label="${i + 1}" style="${img}${slice(tile.id, n, a)};transform:rotate(${tile.r * 90}deg)"${state.won ? ' disabled' : ''}></button>`;
  }).join('');
  const help = !state.won && state.help
    ? `<div class="g-pintu-help"><p>${esc(t.rule)}${state.turns ? ` ${esc(t.ruleTurn)}` : ''}</p><p>${esc(state.hint ? (state.hint.turn != null ? t.hintTurn : t.hint) : t.more)}</p></div>` : '';
  const status = state.won
    ? `<div class="g-pintu-won">${esc(t.won.replace('{n}', String(state.moves)))}</div>`
    : `<div class="g-pintu-moves${state.refused ? ' is-refused' : ''}">${state.refused ? esc(t.refused) : `${t.moves} ${state.moves} · ${esc(state.sel == null ? t.pick : t.then)}`}</div>`;
  const tools = state.won ? '' : `<div class="g-pintu-tools">${state.turns ? `<button type="button" class="g-pintu-turn" data-g="turn"${state.sel == null ? ' disabled' : ''}>${esc(t.turn)}</button>` : ''}</div><div class="g-pintu-keys">${esc(t.keys.desk)}</div>`;
  const look = url ? `<div class="g-pintu-look" aria-hidden="true"><div style="${img}${slice(0, 1, a)}"></div><span>${esc(t.look)}</span></div>` : '';
  return `<div class="g-pintu${state.won ? ' is-won' : ''}"><div class="g-pintu-row"><div class="g-pintu-board" style="grid-template-columns:repeat(${n},1fr);grid-template-rows:repeat(${n},1fr)">${tiles}</div>${look}</div>${help}${status}${tools}</div>`;
}

/** What a step sounded (games/kit/heard.js): a piece picked or put back (pick), two traded (move), one turned (turn),
    a turn with nothing picked (nope). */
export function sounds(b, a) {
  if (!b || !a) return [];
  if (a.refused && !b.refused) return ['nope'];
  if ((a.moves ?? 0) > (b.moves ?? 0)) return a.tiles.some((x, i) => x.id !== b.tiles[i].id) ? ['move'] : ['turn'];
  return a.sel !== b.sel ? ['pick'] : [];
}

/* ── Standalone: the mount contract (games/mount.js). ── */
export const mount = mountPure({ meta, newGame, act, html, sounds });
