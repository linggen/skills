// 洗髓 · 疼，别喊 — 第二回, the night in 娘's washtub (00-sleep; his 2026-09-30:
// 「先并行做1到4」, the audit's 「洗髓 hold」). 银月: 「今夜就泡。疼，别喊。」
// The pain comes in waves, a thousand ants and then a meeting about which bone
// to start on again. Hold to grit your teeth: three sticks of incense burn only
// while you hold. But holding costs breath, and breath comes back only when you
// let go — let go in a trough and nothing is lost; let go (or run out of breath)
// on a wave and you nearly cry out, and that stick of incense starts again. After
// three the water is black enough to write with; then the jump — and the beam.
// Pure module: newGame / html / act / tick. Hold is [data-g-hold] (live-games.js).

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

const bar = (label, v, cls = '') => `<div class="g-xisui-meter"><span>${label}</span><span class="g-xisui-bar ${cls}"><i style="width:${Math.round(v * 100)}%"></i></span></div>`;

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-xisui is-won"><p class="g-xisui-line">${t.won}</p></div>`;
  const pain = painAt(state.sched, state.t);
  const sticks = Array.from({ length: STICKS }, (_, i) => {
    const burnt = i < state.stick ? 1 : i === state.stick ? state.prog / STICK_MS : 0;
    return `<span class="g-xisui-stick"><i style="height:${Math.round((1 - burnt) * 100)}%"></i></span>`;
  }).join('');
  const done = state.stick >= STICKS;
  const btn = done
    ? `<button type="button" class="g-xisui-btn" data-g="jump">${t.jump}</button>`
    : `<button type="button" class="g-xisui-btn${state.holding ? ' is-held' : ''}" data-g-hold="grit">${t.hold}</button>`;
  return `<div class="g-xisui" style="--dark:${(state.stick / STICKS).toFixed(2)}">`
    + `<div class="g-xisui-sticks" aria-label="${t.incense}">${sticks}</div>`
    + (done ? '' : bar(t.pain, pain, pain > WAVE ? 'is-wave' : '') + bar(t.breath, state.breath, state.breath < 0.25 ? 'is-low' : ''))
    + `<p class="g-xisui-line">${t[state.note] ?? ''}</p>${btn}</div>`;
}
