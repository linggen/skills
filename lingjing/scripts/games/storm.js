// 暴雨 · 拽爹上崖 — 古一, the storm on 黑松岭 (00-storm / 00-fall; his 2026-09-30:
// 「先并行做1到4」, the fun audit's first ten minutes). 爹's knee gives out on the
// slope; 小满 hauls him back to the cliff face, three pulls, one in each lull between
// gusts. A pull into a gust and 爹 slides back half a foot. He is always saved —
// the book saves him, and then the mud under 小满 gives way — so the game never
// fails: at the minute's end the last pull is made by main force. How cleanly
// he did it (`grade`) only flavours the closing line.
// Pure module: newGame / html / act / tick. No DOM; the host routes [data-g]
// taps to act() and steps tick() while `live` (live-games.js).
// Drawn in ink since batch two (2026-10-14): the slope and the drop, 爹 hauled up it pull by
// pull, the rain slanting with the wind — and the quiet 「算了，往下走」 every beat keeps.
import { SKIP, btn, n, scene, skipBtn, skipped, splash, still } from './ink.js';

export const meta = {
  id: 'storm',
  name: { zh: '暴雨 · 拽爹上崖', en: 'The storm · Haul Father back' },
  how: {
    zh: '风一歇，就拽。顶着风拽，爹要往下滑。',
    en: 'Pull when the wind drops. Pull into a gust and Father slides back.',
  },
};

export const NEED = 3; //       pulls to get him to the cliff face
export const LIMIT = 30000; //  ms: after this the last pull is made by main force (half a minute, batch two)
export const CALM = 0.35; //    wind below this is a lull

const T = {
  zh: {
    ready: '暴雨。爹的膝盖一软，整个人往坡下滑去——你一把抓住了他的手腕。',
    start: '抓住爹的手',
    pull: '拽',
    go: '风灌进耳朵里。等它歇一口气。',
    pulled: '拽上来一截。',
    regrip: '手还没换过来——等下一阵风过去。',
    slipped: '顶着风头拽——爹往下滑了半尺，泥水糊了你一脸。',
    wind: '风',
    calm: '歇',
    gust: '紧',
    dist: '离崖壁',
    clean: '一口气拽了上去，爹连膝盖都没磕着。',
    steady: '拽上去了。爹的膝盖在石头上磕了两下，他一声没吭。',
    rough: '最后那一下，是拿命拽的。爹扒住了崖壁，你的胳膊已经没了知觉。',
    fall: '你松了一口气——脚底下那块泥，塌了。',
    skipped: '你攥着爹的腰带，拼了命往里一拽。',
  },
  en: {
    ready: 'Rain like a flood. Father\'s knee gives and he slides down the slope — you catch his wrist.',
    start: 'Grab Father\'s hand',
    pull: 'Pull',
    go: 'The wind roars in your ears. Wait for it to catch its breath.',
    pulled: 'Up a little way.',
    regrip: 'You need a fresh grip — wait out the next gust.',
    slipped: 'You pull into the gust — Father slides back half a foot, and mud slaps your face.',
    wind: 'Wind',
    calm: 'lull',
    gust: 'gust',
    dist: 'to the cliff face',
    clean: 'Up in one go. Father did not even knock his knee.',
    steady: 'Up. Father\'s knee struck the rock twice; he never made a sound.',
    rough: 'The last pull took everything you had. Father clings to the cliff face; your arm has gone numb.',
    fall: 'You let out a breath — and the mud under your feet gives way.',
    skipped: 'You grab Father\'s belt and haul inward with everything you have.',
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

/** The storm's gusts and lulls, laid out for 70 s from the seed. */
export function schedule(seed) {
  const rnd = mulberry32(hash(`storm:${seed}`));
  const out = [];
  let at = 0, gust = true;
  while (at < LIMIT + 10000) {
    const len = gust ? 1300 + rnd() * 1200 : 800 + rnd() * 700;
    const level = gust ? 0.65 + rnd() * 0.35 : rnd() * 0.2;
    out.push({ from: Math.round(at), to: Math.round(at + len), level: Number(level.toFixed(3)) });
    at += len;
    gust = !gust;
  }
  return out;
}

/** Which stretch of the storm `t` falls in. */
export function segAt(sched, t) {
  const i = sched.findIndex((s) => t < s.to);
  return i < 0 ? sched.length - 1 : i;
}

/** The wind at `t` ms: the segment's level, eased over its first 250 ms. */
export function windAt(sched, t) {
  const i = sched.findIndex((s) => t < s.to);
  if (i < 0) return sched[sched.length - 1].level;
  const s = sched[i], prev = i ? sched[i - 1].level : s.level;
  const k = Math.min(1, (t - s.from) / 250);
  return prev + (s.level - prev) * k;
}

export function newGame(seed) {
  return { seed: String(seed), sched: schedule(seed), t: 0, live: false, pulls: 0, slips: 0, lastLull: -1, note: 'ready', won: false, grade: null };
}

function finish(s, forced) {
  const grade = forced ? 'rough' : s.slips === 0 && s.t < 25000 ? 'clean' : s.slips <= 2 ? 'steady' : 'rough';
  return { ...s, live: false, won: true, grade, note: grade };
}

const VERBS = {
  start: (s) => (s.live ? null : { ...s, live: true, note: 'go' }),
  pull: (s) => {
    if (!s.live) return null;
    if (windAt(s.sched, s.t) < CALM) {
      // One pull a lull: the grip has to be taken again while the next gust blows.
      const lull = segAt(s.sched, s.t);
      if (lull === s.lastLull) return { ...s, note: 'regrip' };
      const up = { ...s, pulls: s.pulls + 1, lastLull: lull, fx: { at: s.t, ok: true }, note: 'pulled' };
      return up.pulls >= NEED ? finish(up, false) : up;
    }
    return { ...s, slips: s.slips + 1, pulls: Math.max(0, s.pulls - 1), fx: { at: s.t, ok: false }, note: 'slipped' };
  },
  skip: (s) => skipped(s),
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
  return s.t >= LIMIT ? finish(s, true) : s;
}

/* ── The picture (ink, batch two): the narrow slope against the rock, the drop beyond it, 爹
   held by the wrist and hauled toward the rock face a stretch at a time, the rain slanting with
   the wind (drawn where it falls at the state's clock, so a repaint never restarts it). */
function stormScene(state, w) {
  const t = still() ? 0 : state.t, k = state.won ? 1 : state.pulls / NEED;
  const rock = '<path class="g-rock" d="M0 0 H70 Q80 40 72 80 Q66 110 74 130 H0Z"/><path class="g-line g-thin g-faint" d="M20 20 l12 8 M14 60 l16 6 M24 100 l10 10"/>';
  const slope = '<path class="g-line" d="M70 96 Q170 104 236 120"/><path class="g-line g-faint" d="M236 120 Q250 126 252 130"/><path class="g-line g-thin g-faint" d="M246 118 l18 -4 M256 124 l20 2"/>';
  // 爹: a figure on the slope, from the drop's lip (k = 0) to the rock (k = 1).
  const fx = 214 - k * 120, fy = 112 - k * 8, lean = n(20 - k * 20);
  const baba = `<g transform="translate(${n(fx)} ${n(fy)}) rotate(${lean})"><circle class="g-line" cx="0" cy="-26" r="6" fill="none"/><path class="g-line" d="M0 -20 V-4 L-6 8 M0 -4 L8 6 M0 -16 L-12 -10"/></g>`;
  const you = `<g transform="translate(${n(fx - 30)} ${n(fy - 2)})"><circle class="g-line" cx="0" cy="-24" r="5" fill="none"/><path class="g-line" d="M0 -19 V-4 L-5 8 M0 -4 L6 8 M0 -15 L${n(14)} -12"/></g>`;
  const drops = Array.from({ length: 26 }, (_, i) => {
    const x0 = (i * 53 + t * 0.35) % 340 - 10, y0 = (i * 37 + t * 0.6) % 140 - 10, dx = n(4 + w * 14);
    return `<path class="g-line g-thin g-water" d="M${n(x0)} ${n(y0)} l${dx} 12"/>`;
  }).join('');
  const gusts = w > CALM ? `<path class="g-line g-thin g-faint" d="M200 30 q30 -8 60 0 M220 46 q30 -8 70 0" opacity="${n(w, 2)}"/>` : '';
  const hit = state.fx ? splash(state.fx.ok ? n(fx - 14) : n(fx), n(fy - 14), state.t - state.fx.at, { r: 8, seal: state.fx.ok }) : '';
  return scene(320, 130, rock + slope + drops + gusts + baba + you + hit);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const w = windAt(state.sched, state.t);
  const calm = w < CALM;
  const pips = Array.from({ length: NEED }, (_, i) => `<i class="${i < state.pulls ? 'is-on' : ''}"></i>`).join('');
  if (state.won) {
    const end = state.note === 'skipped' ? t.skipped : `${t[state.grade]}<br>${t.fall}`;
    return `<div class="g-storm2 g-ink is-won">${stormScene(state, w)}<p class="g-line-say">${end}</p></div>`;
  }
  const head = `<div class="g-head"><span>${t.dist} <span class="g-feather-pips">${pips}</span></span><span class="g-chip${calm ? ' is-calm' : ''}">${t.wind} · ${calm ? t.calm : t.gust}</span></div>`;
  const meter = `<div class="g-meter"><span>${t.wind}</span><span class="g-bar${calm ? '' : ' is-seal'}"><i style="width:${Math.round(w * 100)}%"></i></span></div>`;
  const act = state.live ? btn(t.pull, 'data-g="pull"') : btn(t.start, 'data-g="start"');
  return `<div class="g-storm2 g-ink">${stormScene(state, w)}${state.live ? head + meter : ''}<p class="g-line-say">${t[state.note] ?? ''}</p>${act}${skipBtn(SKIP[lang] ?? SKIP.zh)}</div>`;
}
