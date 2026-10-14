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
    hold: '按住 · 拉弓',
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
    hold: 'Hold · draw',
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
  const base = { ...s, drawing: false, held: 0, shots: s.shots + 1 };
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

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-deer is-won"><p class="g-deer-line">${t.hit}</p></div>`;
  const w = windAt(state.sched, state.t), rest = w <= (state.hint ? TOL_HINT : TOL);
  const grass = Array.from({ length: 9 }, () => '<i></i>').join('');
  const draw = state.drawing ? drawAt(state.held) : 0;
  const hint = state.hint ? `<p class="g-deer-hint">${lang === 'en' ? 'Yinyue: ' : '银月：'}「${t.hint}」</p>` : '';
  return `<div class="g-deer">`
    + `<div class="g-deer-grass" style="--w:${w.toFixed(2)}">${grass}</div>`
    + `<div class="g-deer-meter"><span>${t.wind}</span><b class="${rest ? 'is-calm' : ''}">${rest ? t.rest : t.blow}</b></div>`
    + `<div class="g-deer-meter"><span>${t.draw}</span><span class="g-deer-bar"><i style="width:${Math.round(draw * 100)}%" class="${draw >= 0.9 ? 'is-full' : ''}"></i></span></div>`
    + `<div class="g-deer-aim"><span>${t.aim}</span>${['straight', 'left'].map((k) => `<button type="button" class="g-deer-aimbtn${state.aim === k ? ' is-on' : ''}${k === 'left' && state.hint && state.aim !== 'left' ? ' is-hinted' : ''}" data-g="aim" data-to="${k}" aria-pressed="${state.aim === k}">${t[k]}</button>`).join('')}</div>`
    + `<p class="g-deer-line">${t[state.note] ?? t.stag}</p>${hint}`
    + `<button type="button" class="g-deer-btn${state.drawing ? ' is-held' : ''}" data-g-hold="draw">${t.hold}</button>`
    + `</div>`;
}
