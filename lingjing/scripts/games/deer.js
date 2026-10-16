// 射鹿 · 先看风，后看鹿 — 古二, the stag by the stream (00-deer; his 2026-09-30:
// 「先并行做1到4」). 爹's first lesson (古一): 「先看风，后看鹿」. Hold to draw
// grandfather's bow — it takes a moment to come full — and let go when the wind
// catches its breath. Held too long, the swollen wrist shakes and the draw sags.
// A miss is never the end: the stag lifts its head, listens, drinks again. After
// a miss, or a long wait, 银月 says the book's line — 「风。往左偏半寸。」 —
// and a little wind is forgiven from then on. The aim is the player's (Hanli
// 2026-10-14, 射鹿 among the opening beats): dead on, the arrow skims the
// antlers even in the still; half an inch left, as she says, it flies true.
// After four misses her voice is in his hands and the aim goes left by itself
// — the stag always falls. How it went is the `grade` (clean · steady · rough).
// Pure module: newGame / html / act / tick. Hold is [data-g-hold] (live-games.js).
import { btn, n, reeds, scene, splash, still } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './deer.js';

export const meta = {
  id: 'deer',
  name: { zh: '射鹿 · 先看风，后看鹿', en: 'The stag · Wind first, then the deer' },
  how: {
    zh: '先定准头，再按住拉弓，松手放箭。等风歇一口气，再松。',
    en: 'Set your aim, then hold to draw and let go to loose. Wait for the wind to catch its breath.',
  },
};

export const DRAW_MS = 1200; //  to full draw
export const SHAKE_MS = 4000; // held longer than this, the wrist shakes
export const TOL = 0.15; //      wind forgiven at the loose
export const TOL_HINT = 0.45; // after 银月's 「往左偏半寸」
const HINT_MS = 12000;
export const GUIDED = 4; //    misses before her voice moves his hands

const T = {
  zh: {
    stag: '溪边，那头雄鹿低着头在喝水，头上的角像一丛冬天的枯树枝。',
    hold: '按住 · 拉弓', pulling: '拉……', loose: '满了 · 松手放箭',
    drawing: '弓慢慢张开……',
    shake: '手腕肿着，胳膊开始打颤——弓，要撑不住了。',
    short: '没拉满，箭软软地扎进了草里。鹿抬起头，竖着耳朵听了一会儿——又低下头去。',
    drift: '风一带，箭偏了，擦着鹿角飞过去。鹿抬起头，竖着耳朵听了一会儿——又低下头去。',
    wide: '风是歇了，芦草将直未直——箭照直出去，擦着鹿角飞了。鹿抬起头，又低下头去。',
    guided: '……往左。她的声音在耳边，手跟着就偏过去了。',
    aim: '准头', straight: '正中', left: '偏左半寸',
    hint: '……风。往左偏半寸。',
    wind: '风',
    rest: '歇了',
    blow: '在吹',
    draw: '弓',
    hit: '手指一松，箭已离弦。溪边那头鹿，轰然倒下。',
  },
  en: {
    stag: 'By the stream the stag drinks, head down, its antlers like a thicket of winter branches.',
    hold: 'Hold · draw', pulling: 'Drawing…', loose: 'Full · let go',
    drawing: 'The bow opens, slowly…',
    shake: 'Your wrist is swollen and your arm begins to shake — the bow will not hold much longer.',
    short: 'Not drawn full: the arrow drops soft into the grass. The stag lifts its head, listens — and drinks again.',
    drift: 'The wind takes it; the arrow skims past the antlers. The stag lifts its head, listens — and drinks again.',
    wide: 'The wind has dropped, the reeds not quite upright — the arrow flies dead on and skims the antlers. The stag lifts its head, and drinks again.',
    guided: '…Left. Her voice is at your ear, and your hands follow it.',
    aim: 'Aim', straight: 'Dead on', left: 'Half an inch left',
    hint: '…The wind. Half an inch to the left.',
    wind: 'Wind',
    rest: 'still',
    blow: 'blowing',
    draw: 'Draw',
    hit: 'Your fingers open and the arrow is gone. By the stream the stag crashes down.',
  },
};

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

/** The wind over the stream: blowing, then a breath of stillness, for 3 minutes. */
export function schedule(seed) {
  const rnd = mulberry32(hash(`deer:${seed}`));
  const out = [];
  let at = 0, blow = true;
  while (at < 180000) {
    const len = blow ? 1500 + rnd() * 1500 : 900 + rnd() * 500;
    const level = blow ? 0.4 + rnd() * 0.6 : rnd() * 0.1;
    out.push({ from: Math.round(at), to: Math.round(at + len), level: Number(level.toFixed(3)) });
    at += len;
    blow = !blow;
  }
  return out;
}

export function windAt(sched, t) {
  const s = sched.find((x) => t < x.to) ?? sched[sched.length - 1];
  return s.level;
}

/** How full the bow is after being held `ms`: it opens, then the wrist shakes it down. */
export function drawAt(ms) {
  if (ms <= SHAKE_MS) return Math.min(1, ms / DRAW_MS);
  return Math.max(0.5, 1 - (ms - SHAKE_MS) / 2000);
}

export function newGame(seed) {
  return { seed: String(seed), sched: schedule(seed), t: 0, live: true, drawing: false, held: 0, shots: 0, misses: 0, hint: false, aim: 'straight', note: 'stag', won: false, grade: null };
}

/** How the stag fell: at the first arrow, after a miss or two, or after many. */
export const gradeOf = (misses) => (misses === 0 ? 'clean' : misses <= 2 ? 'steady' : 'rough');

function loose(s) {
  const draw = drawAt(s.held), wind = windAt(s.sched, s.t);
  const tol = s.hint ? TOL_HINT : TOL;
  const base = { ...s, drawing: false, held: 0, shots: s.shots + 1, lastAt: s.t };
  if (draw >= 0.9 && wind <= tol && s.aim === 'left') return { ...base, live: false, won: true, note: 'hit', grade: gradeOf(s.misses) };
  const misses = s.misses + 1, guided = misses >= GUIDED && s.aim !== 'left';
  const note = guided ? 'guided' : draw < 0.9 ? 'short' : wind > tol ? 'drift' : 'wide';
  return { ...base, misses, note, hint: true, aim: guided ? 'left' : s.aim };
}

const VERBS = {
  hold: (s) => (s.drawing ? null : { ...s, drawing: true, held: 0, note: 'drawing' }),
  release: (s) => (s.drawing ? loose(s) : null),
  aim: (s, d) => (s.drawing || !['straight', 'left'].includes(d.to) || d.to === s.aim ? null : { ...s, aim: d.to }),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won) return state;
  const s = { ...state, t: state.t + ms };
  if (s.drawing) {
    s.held += ms;
    if (s.held > SHAKE_MS) s.note = 'shake';
  }
  if (!s.hint && s.t >= HINT_MS) s.hint = true;
  return s;
}

/* ── The picture (2026-10-14, his: 「小游戏的UI太粗糙了」): the stream at the valley mouth in
   ink — reeds and a few leaves that lean and drift with the wind, the stag drinking, the aim a
   cinnabar mark on its neck nudged half an inch, grandfather's bow whose string comes back as
   it is held. Everything is drawn at the state's own clock (live-games repaints each step). */
const NECK = [212, 108], NUDGE = 8;
const LEAVES = [[0, 52], [120, 38], [230, 64]];
// The stag is painted (tools/paint-games.py, 2026-10-16 — Hanli: 「射鹿的画风比较粗糙啊」): drinking, or with its
// head up a moment after a miss; it faces right on its canvas and is mirrored here to face the hunter's left.
const STAG_ART = (f) => new URL(`../../worlds/jiuding/art/games/deer/${f}.webp`, import.meta.url).href;
const STAG_POSE = { drink: STAG_ART('stag-drink'), look: STAG_ART('stag-look') };
const STAG_W = 150, STAG_H = 112.5; // its 640×480 canvas; the neck at (0.42, 0.55) once mirrored
const stagArt = (pose) => `<g class="g-stag-art" transform="translate(${n(NECK[0] + 0.58 * STAG_W)} ${n(NECK[1] - 0.55 * STAG_H)}) scale(-1 1)">`
  + `<image href="${STAG_POSE[pose]}" width="${STAG_W}" height="${STAG_H}"/></g>`;
function deerScene(state, w, rest) {
  const t = state.t, age = state.t - (state.lastAt ?? -1e9);
  const hills = `<path class="g-wash" d="M0 82 Q60 58 120 74 T240 64 T320 70 V170 H0Z"/>`;
  const water = `<path class="g-water" d="M0 146 H320 M14 154 H120 M150 158 H300 M40 163 H210"/>`;
  const reedsAt = reeds([18, 30, 44, 58, 72, 300, 310], 150, 34, w, t);
  const leaves = LEAVES.map(([off, y], i) => {
    const tt = still() ? 0 : t, x = ((off + tt * (0.004 + w * 0.05)) % 360) - 20, yy = y + Math.sin(tt / 500 + i) * (3 + w * 6);
    return `<ellipse class="g-leaf" cx="${n(x)}" cy="${n(yy)}" rx="4" ry="1.6" transform="rotate(${n(20 + w * 40 + Math.sin(tt / 300 + i) * 25)} ${n(x)} ${n(yy)})"/>`;
  }).join('');
  const [ax, ay] = [NECK[0] - (state.aim === 'left' ? NUDGE : 0), NECK[1]];
  const aim = state.won ? '' : `<g class="g-aim${state.aim === 'left' ? ' is-left' : ''}"><circle cx="${ax}" cy="${ay}" r="6"/><path d="M${ax - 10} ${ay} h6 M${ax + 4} ${ay} h6 M${ax} ${ay - 10} v6 M${ax} ${ay + 4} v6"/></g>`;
  const miss = { drift: [262, 70], wide: [238, 76], short: [150, 150], guided: [238, 76] }[state.note];
  const fx = state.won ? splash(NECK[0], NECK[1], 240, { r: 16, seal: true }) : miss ? splash(miss[0], miss[1], age, { r: 9 }) : '';
  const breeze = `<text class="g-scene-note${rest ? ' is-calm' : ''}" x="314" y="16" text-anchor="end">${rest ? '·' : '~'}</text>`;
  const pose = !state.won && miss && age < 2600 ? 'look' : 'drink';
  return scene(320, 170, hills + water + leaves + `<g class="${state.won ? 'g-fallen' : ''}">${stagArt(pose)}</g>` + reedsAt + aim + fx + breeze);
}
function bowScene(state) {
  const draw = state.drawing ? drawAt(state.held) : 0, shake = state.drawing && state.held > SHAKE_MS ? Math.sin(state.t / 30) * 1.6 : 0;
  const sx = n(46 + draw * 30 + shake), y = n(30 + shake * 0.5);
  const limb = `<path class="g-bow" d="M46 4 C22 14 22 46 46 56"/><path class="g-line g-thin" d="M44 26 h5 M44 34 h5"/>`;
  const string = `<path class="g-line g-thin" d="M46 4 L${sx} ${y} L46 56"/>`;
  const arrow = `<path class="g-line" d="M${sx} ${y} H${n(sx + 170)}"/><path d="M${n(sx + 170)} ${y - 4} l9 4 l-9 4z"/><path class="g-line g-thin" d="M${sx} ${y} l6 -4 M${sx} ${y} l6 4"/>`;
  const full = draw >= 0.9 ? `<text class="g-scene-note is-calm" x="312" y="34" text-anchor="end">满</text>` : '';
  return scene(320, 60, limb + string + arrow + full, `g-bowscene${draw >= 0.9 ? ' is-full' : ''}`);
}

/** The one button says what the hand does now: draw; drawing; full — let go. */
const holdWord = (s, t) => (!s.drawing ? t.hold : drawAt(s.held) >= 0.9 ? t.loose : t.pulling);

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const w = windAt(state.sched, state.t), rest = w <= (state.hint ? TOL_HINT : TOL);
  if (state.won) return `<div class="g-deer g-ink is-won">${deerScene(state, 0, true)}<p class="g-line-say">${t.hit}</p></div>`;
  const hint = state.hint ? `<p class="g-hint">${lang === 'en' ? 'Yinyue: ' : '银月：'}「${t.hint}」</p>` : '';
  const wind = `<span class="g-chip${rest ? ' is-calm' : ''}">${t.wind} · ${rest ? t.rest : t.blow}</span>`;
  // The aim as two named choices, not ‹ › arrows (live, 2026-10-16: which arrow was 「偏左」 was a guess).
  const pick = (to) => `<button type="button" class="g-aimbtn${state.hint && to === 'left' && state.aim !== 'left' ? ' is-hinted' : ''}" data-g="aim" data-to="${to}" aria-pressed="${state.aim === to}">${t[to]}</button>`;
  const nudge = `<div class="g-nudge"><span class="g-nudgesay">${t.aim}</span><span class="g-aimpair">${pick('straight')}${pick('left')}</span>${wind}</div>`;
  return `<div class="g-deer g-ink">${deerScene(state, w, rest)}${nudge}${bowScene(state)}`
    + `<p class="g-line-say">${t[state.note] ?? t.stag}</p>${hint}`
    + btn(holdWord(state, t), 'data-g-hold="draw"', 'main', `g-hold${state.drawing ? ' is-held' : ''}${state.drawing && drawAt(state.held) >= 0.9 ? ' is-full' : ''}`)
    + `</div>`;
}

/** Stuck (scripts/stuck.js): three arrows gone wide — the page may offer 「算了，往下走」 now. */
export const stuck = (s) => (s.misses ?? 0) >= 3;

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export const mount = (container, opts) => mountPure(self)(container, opts);
