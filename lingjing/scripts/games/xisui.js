// 洗髓 · 疼，别喊 — 古二, the night in 娘's washtub (00-sleep; his 2026-09-30:
// 「先并行做1到4」, the audit's 「洗髓 hold」). 银月: 「今夜就泡。疼，别喊。」
// The pain comes in waves, a thousand ants and then a meeting about which bone
// to start on again. Hold to grit your teeth: three sticks of incense burn only
// while you hold. But holding costs breath, and breath comes back only when you
// let go — let go in a trough and nothing is lost; let go (or run out of breath)
// on a wave and you nearly cry out, and that stick of incense starts again. After
// three the water is black enough to write with; then the jump — and the beam.
// Pure module: newGame / html / act / tick. Hold is [data-g-hold] (live-games.js).
// 忍 — drawn in ink since batch two (2026-10-14): the washtub by the woodpile, the water going
// from green to black stick by stick, the pain as rings off it, the three sticks of incense in
// their pot, the token on its branch; at most 75 s (the moon goes over the woodpile and the
// sticks are burned), and the quiet 「算了，往下走」 every beat keeps.
import { btn, n, scene, skipped, still } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './xisui.js';

export const meta = {
  id: 'xisui',
  name: { zh: '洗髓 · 疼，别喊', en: 'Marrow washing · It hurts. Don\'t cry out.' },
  how: {
    zh: '按住咬牙，香才烧。浪头上别松口；浪退了，松一松，喘口气。',
    en: 'Hold to grit your teeth; only then does the incense burn. Never let go on a wave — breathe in the troughs.',
  },
};

export const STICKS = 3;
export const STICK_MS = 6000; // held time per stick of incense
export const WAVE = 0.5; //      pain above this is a wave
export const LIMIT = 75000; //   ms: the moon has gone over the woodpile — the sticks are burned
const DRAIN = 0.12 / 1000; //   breath spent per ms held
const RECOVER = 0.35 / 1000; // breath back per ms let go

const T = {
  zh: {
    tub: '墨绿色的水咕嘟咕嘟冒着泡，像一锅熬坏了的菜汤。你泡了进去。',
    hold: '按住 · 咬牙',
    holding: '不是刀割的疼，是从骨头缝里往外钻的疼。',
    rest: '浪退了一点。喘口气。',
    cry: '你咬住了胳膊，差点喊出声来——这一炷香，重来。',
    stick: '一炷香烧完了。水又黑了一层。',
    black: '三炷香。一盆水从墨绿变成漆黑，漆黑得能拿来写字。',
    jump: '爬出来，蹦一下',
    pain: '疼',
    breath: '气',
    incense: '香',
    won: '「咚」的一声，脑袋撞上了柴棚的顶梁——离地少说也有一丈。你捂着脑袋蹲在地上，一边疼，一边笑。',
    moon: '疼停下来的时候，月亮已经从柴垛这头挪到了那头。',
    skipped: '你咬住了自己的胳膊，一声没吭，直到疼停下来。',
  },
  en: {
    tub: 'Dark green water bubbles like a pot of soup gone wrong. You get in.',
    hold: 'Hold · grit your teeth',
    holding: 'Not the pain of a blade — a pain that bores out through the joints of your bones.',
    rest: 'The wave eases a little. Breathe.',
    cry: 'You bite your arm and all but cry out — this stick of incense starts again.',
    stick: 'One stick burned down. The water darkens again.',
    black: 'Three sticks. The water has gone from green to black, black enough to write with.',
    jump: 'Climb out and jump',
    pain: 'Pain',
    breath: 'Breath',
    incense: 'Incense',
    won: 'Thunk — your head hits the woodshed\'s ridge beam, a good ten feet up. You crouch, clutching your head, hurting and laughing at once.',
    moon: 'By the time the pain stops, the moon has moved from one end of the woodpile to the other.',
    skipped: 'You bite your own arm and make not a sound, until the pain stops.',
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

/** The waves for five minutes: a rise to a peak, then a trough. */
export function schedule(seed) {
  const rnd = mulberry32(hash(`xisui:${seed}`));
  const out = [];
  let at = 0, wave = false;
  while (at < 300000) {
    const len = wave ? 2500 + rnd() * 1500 : 1000 + rnd() * 1000;
    const level = wave ? 0.7 + rnd() * 0.3 : 0.1 + rnd() * 0.1;
    out.push({ from: Math.round(at), to: Math.round(at + len), level: Number(level.toFixed(3)) });
    at += len;
    wave = !wave;
  }
  return out;
}

export function painAt(sched, t) {
  const s = sched.find((x) => t < x.to) ?? sched[sched.length - 1];
  return s.level;
}

export function newGame(seed) {
  return { seed: String(seed), sched: schedule(seed), t: 0, live: true, holding: false, breath: 1, stick: 0, prog: 0, cries: 0, note: 'tub', won: false };
}

function letGo(s) {
  if (!s.holding) return null;
  if (s.stick >= STICKS) return { ...s, holding: false };
  if (painAt(s.sched, s.t) > WAVE) return { ...s, holding: false, prog: 0, cries: s.cries + 1, note: 'cry' };
  return { ...s, holding: false, note: 'rest' };
}

const VERBS = {
  hold: (s) => (s.holding || s.stick >= STICKS || s.breath <= 0.05 ? null : { ...s, holding: true, note: 'holding' }),
  release: (s) => letGo(s),
  jump: (s) => (s.stick >= STICKS ? { ...s, live: false, won: true, note: 'won' } : null),
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
  let s = { ...state, t: state.t + ms };
  if (s.t >= LIMIT && s.stick < STICKS) return { ...s, holding: false, stick: STICKS, prog: 0, note: 'moon' };
  if (s.holding && s.stick < STICKS) {
    s.breath = Math.max(0, s.breath - DRAIN * ms);
    s.prog += ms;
    if (s.prog >= STICK_MS) {
      s.stick += 1;
      s.prog = 0;
      s.note = s.stick >= STICKS ? 'black' : 'stick';
      if (s.stick >= STICKS) s.holding = false;
    }
    // Out of breath: the mouth opens by itself.
    if (s.holding && s.breath <= 0) s = letGo(s);
  } else {
    s.breath = Math.min(1, s.breath + RECOVER * ms);
  }
  return s;
}

const bar = (label, v, cls = '') => `<div class="g-meter"><span>${label}</span><span class="g-bar ${cls}"><i style="width:${Math.round(v * 100)}%"></i></span></div>`;

/* ── The picture: the woodpile, the token on its branch (its tail light breathing), the big
   washtub with him in it up to the chin — the water from green to black as the sticks burn —
   the pain going out from him as rings, the three sticks in their pot with their smoke. */
function tubScene(state, pain) {
  const t = still() ? 0 : state.t, dark = Math.min(1, (state.stick + state.prog / STICK_MS) / STICKS);
  const water = `rgb(${Math.round(60 - dark * 45)},${Math.round(92 - dark * 72)},${Math.round(56 - dark * 40)})`;
  const pile = '<path class="g-line g-thin g-faint" d="M200 30 H312 M196 44 H316 M192 58 H318 M204 30 V58 M240 30 V58 M276 30 V58"/><path class="g-line g-thin" d="M220 30 l-8 -14"/>';
  const token = `<rect class="g-line g-thin" x="206" y="12" width="10" height="14" rx="2" fill="none"/><path class="g-tail" d="M211 22 q3 -4 0 -7" opacity="${n(0.4 + 0.4 * Math.sin(t / 700), 2)}"/>`;
  const tub = `<ellipse class="g-line" cx="110" cy="96" rx="80" ry="22" fill="none"/><ellipse class="g-tubwater" cx="110" cy="92" rx="74" ry="16" style="fill:${water}"/><path class="g-line" d="M30 96 Q34 126 110 128 Q186 126 190 96"/>`;
  const head = `<circle class="g-line" cx="110" cy="80" r="10" fill="none"/><path class="g-line g-thin" d="${state.holding ? 'M104 84 h12' : 'M105 84 q5 2 10 0'}"/>`;
  const rings = pain > WAVE && !still() ? [14, 24, 34].map((r, k) => `<ellipse class="g-line g-thin g-seal" cx="110" cy="90" rx="${n(r + (t / 30 + k * 8) % 12)}" ry="${n((r + (t / 30 + k * 8) % 12) * 0.35)}" fill="none" opacity="${n(0.5 * pain, 2)}"/>`).join('') : '';
  const pot = '<path class="g-line" d="M236 118 h40 l-4 12 h-32z"/>';
  const sticks = Array.from({ length: STICKS }, (_, i) => {
    const burnt = i < state.stick ? 1 : i === state.stick ? state.prog / STICK_MS : 0, h = n(40 * (1 - burnt)), x = 246 + i * 10;
    const smoke = burnt > 0 && burnt < 1 ? `<path class="g-mist" d="M${x} ${n(116 - h)} q-4 -8 0 -16 q4 -8 0 -16" opacity=".35"/>` : '';
    return `<path class="g-line g-thin" d="M${x} 118 v${-h}"/>${h > 0 ? `<circle class="g-ember" cx="${x}" cy="${n(118 - h)}" r="1.6"/>` : ''}${smoke}`;
  }).join('');
  return scene(320, 132, pile + token + tub + rings + head + pot + sticks);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const pain = painAt(state.sched, state.t);
  if (state.won) return `<div class="g-xisui2 g-ink is-won">${tubScene(state, 0)}<p class="g-line-say">${state.note === 'skipped' ? t.skipped : t.won}</p></div>`;
  const done = state.stick >= STICKS;
  const act = done ? btn(t.jump, 'data-g="jump"')
    : `<button type="button" class="g-btn g-btn-main g-hold${state.holding ? ' is-held' : ''}" data-g-hold="grit">${t.hold}</button>`;
  const head = `<div class="g-head"><span>${t.incense} <b>${state.stick}</b> / ${STICKS}</span></div>`;
  return `<div class="g-xisui2 g-ink">${tubScene(state, pain)}${head}`
    + (done ? '' : bar(t.pain, pain, pain > WAVE ? 'is-seal' : '') + bar(t.breath, state.breath, state.breath < 0.25 ? 'is-seal' : ''))
    + `<p class="g-line-say">${t[state.note] ?? ''}</p>${act}</div>`;
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export const mount = (container, opts) => mountPure(self)(container, opts);
