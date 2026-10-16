// 吹鹅毛 · 吐气，毛不许动 — 古二, the woodpile (00-halfyear; Hanli 2026-10-14). The
// book: the scroll's one line with a number in it — 「心里数到一百二十，拿一根鸿毛搁在
// 鼻子底下，吐气，毛不许动」 — and 老周家's goose feather on a strip of bamboo. The
// first night he breathes in, holds it, counts — and at twelve the breath bursts
// out and the feather flies into the hen house. The lesson is 今线's too: 先吐.
// Here the breath out is a stroke: press and move slowly and steadily (a small
// circle) — that is the breath going out, and the count runs. Stop moving and
// the breath is held: it builds, and bursts. Move fast and the feather shakes,
// and flies. The stroke used up, the breath is spent. Three breaths; the best
// count is the `grade` (still · shaky), written as a mark. Never a fail.
// Pure module: newGame / html / act / tick. The stroke is [data-g-drag] (live-games.js).
import { n, scene, splash, still } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './feather.js';

export const meta = {
  id: 'feather',
  name: { zh: '吹鹅毛 · 吐气，毛不许动', en: 'The goose feather · Breathe out, and it mustn\'t stir' },
  how: {
    zh: '按住，慢慢地、匀匀地画圈——那是吐气。手停了是憋气；画急了，鹅毛就飞了。',
    en: 'Press and draw slow, even circles — that is the breath going out. Stop and you are holding it; rush and the feather flies.',
  },
};

export const TRIES = 3; //      breaths
export const TARGET = 120; //   the scroll's count
export const STILL = 96; //     his best on the last night: a still feather
export const RATE = 6; //       counts a second while the breath runs right
export const LUNG_PX = 960; //  the stroke a whole breath is
export const VMIN = 12; //      px/s: slower than this, the breath is held
export const VMAX = 110; //     px/s: faster than this, the feather shakes
export const FLY_MS = 450; //   shaking this long, it flies
export const HOLD_MS = 1500; // held this long, the breath bursts out
export const WINDOW_MS = 300; // the pace is read over this much of the stroke, not per tick
const WINDOW_MIN = 150; //      …and never over less (a stroke's first move, a 3 ms catch-up tick)

const T = {
  zh: {
    ready: '鹅毛粘在竹篾上，横在鼻子底下。吐气，毛不许动。',
    first: '先吐——慢慢地，细细地。',
    out: '一，二，三……数要像娘拨算盘珠子，一颗是一颗。',
    held: '憋住了……胸口发胀。',
    shake: '鹅毛在抖——慢些。',
    burst: '憋不住了，「噗」的一声，鹅毛翻着跟头飞了。数到 {n}。',
    puff: '吐得太急，鹅毛一抖，飞了。数到 {n}。',
    empty: '一口气吐尽了，鹅毛没动。数到 {n}。',
    let: '手一松，这口气断了。数到 {n}。',
    pad: '按住，慢慢画圈', again: '再来一口气',
    lung: '这口气', slow: '憋', fast: '急', best: '最多', breaths: '口气',
    still: '数到 {n}。鹅毛在鼻子底下轻轻地抖，没飞。',
    shaky: '最多数到 {n}。鹅毛飞了几回，鸡窝乱了几回。',
  },
  en: {
    ready: 'The feather is stuck to a strip of bamboo, under your nose. Breathe out, and it mustn\'t stir.',
    first: 'Out first — slowly, finely.',
    out: 'One, two, three… counted like Mother\'s abacus beads, each one its own.',
    held: 'You are holding it… your chest swells.',
    shake: 'The feather is shaking — slower.',
    burst: 'You can\'t hold it: *puff*, and the feather goes tumbling away. You reached {n}.',
    puff: 'Too fast: the feather shivers, and flies. You reached {n}.',
    empty: 'The breath is all out, and the feather never moved. You reached {n}.',
    let: 'You let go, and the breath breaks. You reached {n}.',
    pad: 'Press and circle slowly', again: 'Another breath',
    lung: 'Breath', slow: 'held', fast: 'rushed', best: 'Best', breaths: 'breaths',
    still: 'You reached {n}. The feather trembles under your nose, and stays.',
    shaky: 'Your best was {n}. The feather flew a few times, and so did the hens.',
  },
};

export function newGame(seed) {
  return { seed: String(seed), live: false, phase: 'ready', t: 0, lung: 1, v: 0, moved: 0, still: 0, flutter: 0, win: [], count: 0, best: 0, breaths: 0, note: 'ready', won: false, grade: null };
}

export const gradeOf = (best) => (best >= STILL ? 'still' : 'shaky');

function finish(s) {
  const grade = gradeOf(s.best);
  return { ...s, live: false, won: true, grade, note: grade };
}

function endBreath(s, why) {
  const n = Math.floor(s.count);
  const e = { ...s, live: false, phase: 'rest', breaths: s.breaths + 1, best: Math.max(s.best, n), last: n, note: why, moved: 0, v: 0, still: 0, flutter: 0, win: [] };
  return e.breaths >= TRIES || e.best >= TARGET ? finish(e) : e;
}

const VERBS = {
  hold: (s) => (s.phase === 'out' ? null : { ...s, live: true, phase: 'out', lung: 1, count: 0, v: 0, moved: 0, still: 0, flutter: 0, win: [], note: 'first' }),
  move: (s, d) => (s.phase !== 'out' ? null : { ...s, moved: s.moved + Math.max(0, Math.min(400, Number(d.d) || 0)) }),
  release: (s) => (s.phase === 'out' ? endBreath(s, 'let') : null),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* The pace over the last WINDOW_MS of the stroke (2026-10-15 play-test: it was px/ms per tick,
   and a tick is 50 ms from the clock or 3 ms from a move's catch-up — one move in a 3 ms tick read
   as thousands of px/s, the feather flew on a slow stroke). Samples [ms, px], newest last. */
export function paceWindow(win = [], ms, px) {
  const out = [...win, [ms, px]];
  let total = out.reduce((a, [m]) => a + m, 0);
  while (out.length > 1 && total - out[0][0] >= WINDOW_MS) total -= out.shift()[0];
  return out;
}
export const paceOf = (win = []) => {
  const ms = win.reduce((a, [m]) => a + m, 0), px = win.reduce((a, [, p]) => a + p, 0);
  return (px * 1000) / Math.max(ms, WINDOW_MIN);
};

export function tick(state, ms) {
  if (!state.live || state.won || state.phase !== 'out' || ms <= 0) return state;
  const s = { ...state, t: state.t + ms, lung: state.lung - state.moved / LUNG_PX, moved: 0, win: paceWindow(state.win, ms, state.moved) };
  s.v = paceOf(s.win);
  if (s.v > VMAX) {
    s.flutter += ms;
    s.note = 'shake';
    if (s.flutter > FLY_MS) return endBreath(s, 'puff');
  } else s.flutter = Math.max(0, s.flutter - ms);
  if (s.v < VMIN) {
    s.still += ms;
    if (s.count > 0 || s.still > 400) s.note = 'held';
    if (s.still > HOLD_MS) return endBreath(s, 'burst');
  } else {
    s.still = 0;
    if (s.v <= VMAX) { s.count += (RATE * ms) / 1000; s.note = 'out'; }
  }
  if (s.count >= TARGET) return endBreath({ ...s, count: TARGET }, 'empty');
  return s.lung <= 0 ? endBreath({ ...s, lung: 0 }, 'empty') : s;
}

/* ── The picture (2026-10-14): the goose feather on its strip of bamboo under his nose, in ink.
   It trembles a little while the breath runs right, shakes when it runs fast, and tumbles away
   when it bursts or rushes; the breath shows as a faint mist; the count stands beside it. */
const FEATHER = '<path class="g-quill" d="M0 0 C-1 -20 1 -40 3 -58"/><path class="g-vane" d="M1 -8 C-10 -16 -14 -34 -6 -52 C-2 -56 2 -58 3 -58 C8 -48 12 -30 4 -10 Z"/>'
  + '<path class="g-line g-thin g-faint" d="M1 -16 l-7 -4 M1 -24 l-8 -4 M2 -32 l-8 -4 M2 -40 l-6 -4 M2 -18 l5 -4 M2 -28 l6 -4 M2 -38 l5 -4"/>';
function featherScene(state) {
  const out = state.phase === 'out', flown = ['puff', 'burst'].includes(state.note);
  const shake = out ? Math.min(1, Math.max(0, (state.v - VMAX * 0.6) / VMAX)) : 0;
  const sway = out ? (still() ? 0 : Math.sin(state.t / 260)) * (1.5 + shake * 14) + shake * 18 : 0;
  const face = '<path class="g-line g-faint" d="M40 20 C30 34 28 46 34 54 L26 62 C30 66 34 66 36 68 C34 74 38 80 46 84 C42 96 46 110 54 120"/>';
  const strip = '<path class="g-strip" d="M60 86 H250"/><path class="g-line g-thin g-faint" d="M90 86 v3 M150 86 v3 M210 86 v3"/>';
  const at = flown ? 'translate(218 70) rotate(112)' : `translate(160 86) rotate(${n(sway)})`;
  const mist = out && state.v > VMIN ? [0, 1, 2].map((k) => `<path class="g-mist" d="M42 ${70 + k * 5} q${n(20 + Math.min(state.v, 140) * 0.5)} ${-4 + k * 2} ${n(40 + Math.min(state.v, 140))} ${-2 + k * 3}" opacity="${n(0.12 + Math.min(1, state.v / VMAX) * 0.25, 2)}"/>`).join('') : '';
  const count = state.phase === 'out' ? Math.floor(state.count) : state.phase === 'rest' ? state.last : 0;
  const num = `<text class="g-count" x="298" y="48" text-anchor="end">${count}</text><text class="g-scene-note" x="298" y="66" text-anchor="end">/ ${TARGET}</text>`;
  const fx = state.won ? splash(160, 40, 240, { r: 10, seal: state.grade === 'still' }) : flown ? splash(214, 66, 200, { r: 7 }) : '';
  return scene(320, 130, face + strip + mist + `<g transform="${at}" class="${flown ? 'is-flown' : ''}">${FEATHER}</g>` + num + fx);
}

/* The pace, read where the eye is (2026-10-16): 憋 · 匀 · 急, a mark at the stroke's speed now — the
   same numbers the breath is judged by (VMIN, VMAX), so "too slow" and "too fast" are seen, not guessed. */
function paceGauge(s, t) {
  const top = VMAX * 1.6, at = Math.max(0, Math.min(1, s.v / top));
  const lo = VMIN / top, hi = VMAX / top, zone = s.v < VMIN ? 'slow' : s.v > VMAX ? 'fast' : 'even';
  return `<div class="g-pace is-${zone}" aria-hidden="true"><span>${t.slow}</span><span class="g-pacebar"><b style="left:${Math.round(lo * 100)}%;width:${Math.round((hi - lo) * 100)}%"></b><i style="left:${Math.round(at * 100)}%"></i></span><span>${t.fast}</span></div>`;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const say = (k, n) => (t[k] ?? '').replace('{n}', String(n));
  const pips = Array.from({ length: TRIES }, (_, i) => `<i class="${i < state.breaths ? 'is-on' : ''}"></i>`).join('');
  const head = `<div class="g-feather-head g-head"><span>${t.best} <b>${state.best}</b> / ${TARGET}</span><span>${t.breaths} <span class="g-feather-pips">${pips}</span></span></div>`;
  if (state.won) return `<div class="g-feather g-ink is-won">${featherScene(state)}${head}<p class="g-line-say">${say(state.grade, state.best)}</p></div>`;
  const count = state.phase === 'out' ? Math.floor(state.count) : state.phase === 'rest' ? state.last : 0;
  const line = state.phase === 'rest' ? say(state.note, state.last) : say(state.note, count);
  const lung = state.phase === 'out' ? `<div class="g-meter"><span>${t.lung}</span><span class="g-bar"><i style="width:${Math.round(Math.max(0, state.lung) * 100)}%"></i></span></div>` : '';
  const pace = state.phase === 'out' ? paceGauge(state, t) : '';
  return `<div class="g-feather g-ink">${featherScene(state)}${head}${lung}`
    + pace + `<p class="g-line-say">${line}</p>`
    + `<div class="g-feather-pad${state.phase === 'out' ? ' is-held' : ''}" data-g-drag="breath" role="button" tabindex="0">${scene(120, 120, '<circle class="g-guide" cx="60" cy="60" r="40"/><path class="g-guide-arrow" d="M96 46 l4 10 l-10 -2"/>', 'g-padring')}<span>${state.phase === 'rest' ? t.again : t.pad}</span></div></div>`;
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export const mount = (container, opts) => mountPure(self)(container, opts);
