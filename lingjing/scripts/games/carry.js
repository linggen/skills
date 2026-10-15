// 练功 · 挑水上坡不喘 — 古二, the winter (00-halfyear's second board; batch two, 2026-10-14). The
// book: the breath goes down to the belly — 深 gets its circle in 娘's ledger — and by the eleventh
// month he carries water from four loads to six, up the slope without panting, and has to pretend
// to pant; 蓄 gets its circle too. Here it is the fifth and sixth loads: two buckets on a shoulder
// pole swing as he goes; step up the slope when they swing through the middle and the water
// stays in and the breath stays low; step on the swing and it slops over, and the breath climbs.
// Out of breath, he stops a beat by himself. Two loads of five steps; the grade (even · panting)
// is written as a mark. Past the limit the loads are carried anyway. Never a fail.
// Pure module: newGame / html / act / tick (live while he carries; live-games.js).
import { SKIP, btn, n, scene, skipBtn, skipped, splash, still } from './ink.js';

export const meta = {
  id: 'carry',
  name: { zh: '练功 · 挑水上坡不喘', en: 'Practice · Water up the slope without a pant' },
  how: {
    zh: '扁担两头的水桶一晃一晃。桶荡到正中，迈一步；赶在桶甩起来的时候迈，水就泼了，气也喘了。',
    en: 'The buckets on the pole swing as you go. Step when they swing through the middle; step on the swing and the water slops and your breath goes ragged.',
  },
};

export const LOADS = 2; //      the fifth and the sixth
export const STEPS = 5; //      steps up the slope a load
// 2026-10-15: 1.4 s and 0.32 left ~145 ms a pass through the middle — not a human's tap.
// 2.4 s and 0.4: ~315 ms, twice a swing.
export const PERIOD = 2400; //  ms for one swing out and back
export const MID = 0.4; //      |sway| under this: through the middle
export const PANT = 0.26; //    breath a step on the swing costs
export const LIMIT = 35000;

const T = {
  zh: {
    ready: '入了冬月，他挑水从四担挑到了六担。第五担，上坡。', start: '挑起来', step: '迈一步',
    walk: '扁担压在肩上，两只桶一晃一晃。', even: '桶荡到正中——迈。水一点没洒。', slop: '桶正甩着——水泼出去一瓢，气也喘了。',
    rest: '喘不上气了，站下来缓一缓。', load: '一担倒进缸里。再来一担。', loads: '担', steps: '步', breath: '喘',
    evenEnd: '六担。上坡不喘——只好装喘。娘在账本最末一页的「蓄」字外头，又画了一个圈。', pantingEnd: '六担挑完了，喘得像个风箱。可娘还是在「蓄」字外头画了一个圈。',
    skipped: '一冬下来，他挑水从四担挑到了六担。',
  },
  en: {
    ready: 'By the eleventh month he carries water from four loads to six. The fifth load, up the slope.', start: 'Shoulder the pole', step: 'Step',
    walk: 'The pole bears down on your shoulder, the two buckets swinging.', even: 'Through the middle — step. Not a drop spilt.', slop: 'Mid-swing — a ladleful slops out, and your breath goes ragged.',
    rest: 'You\'re out of breath — you stop to let it settle.', load: 'One load into the vat. Another.', loads: 'loads', steps: 'steps', breath: 'Panting',
    evenEnd: 'Six loads. Up the slope without getting out of breath — so he has to pretend to. Mother draws another circle round "Store" on the last page of her account book.', pantingEnd: 'Six loads done, puffing like a bellows. Still, Mother draws a circle round "Store".',
    skipped: 'Over the winter he goes from four loads of water to six.',
  },
};

export function newGame(seed) {
  return { seed: String(seed), live: false, phase: 'ready', t: 0, load: 0, step: 0, breath: 0, spills: 0, restUntil: 0, fx: null, note: 'ready', won: false, grade: null };
}

export const swayAt = (t) => Math.sin((t / PERIOD) * Math.PI * 2);
const end = (s, forced) => {
  const grade = !forced && s.spills <= 2 ? 'even' : 'panting';
  return { ...s, live: false, won: true, grade, note: grade === 'even' ? 'evenEnd' : 'pantingEnd' };
};

function stepUp(s, ok) {
  let next = { ...s, step: s.step + 1, breath: ok ? Math.max(0, s.breath - 0.08) : Math.min(1, s.breath + PANT), spills: s.spills + (ok ? 0 : 1), fx: { at: s.t, ok }, note: ok ? 'even' : 'slop' };
  if (next.breath >= 1) next = { ...next, restUntil: s.t + 1200, breath: 0.6, note: 'rest' };
  if (next.step < STEPS) return next;
  next = { ...next, load: next.load + 1, step: 0, note: 'load' };
  return next.load >= LOADS ? end(next, false) : next;
}

const VERBS = {
  start: (s) => (s.phase !== 'ready' ? null : { ...s, phase: 'carry', live: true, note: 'walk' }),
  step: (s) => {
    if (s.phase !== 'carry') return null;
    if (s.t < s.restUntil) return { ...s, note: 'rest' };
    return stepUp(s, Math.abs(swayAt(s.t)) < MID);
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
  if (!state.live || state.won || state.phase !== 'carry' || ms <= 0) return state;
  const s = { ...state, t: state.t + ms };
  return s.t >= LIMIT ? end(s, true) : s;
}

/* ── The picture: the slope up to the house, him on it at his step, the pole across his
   shoulder and the two buckets swinging under it — level when they pass through the middle —
   a splash of water when one slops, the vat at the top. */
function carryScene(state) {
  const sway = state.phase === 'carry' && !state.won ? swayAt(still() ? 0 : state.t) : 0;
  const slope = '<path class="g-line" d="M10 124 L300 44"/><path class="g-line g-thin g-faint" d="M10 130 L310 48"/>';
  const vat = '<path class="g-line" d="M286 26 h26 l-3 20 h-20z"/><path class="g-water" d="M290 30 h18"/>';
  const k = (state.won ? STEPS : state.step) / STEPS, x = 40 + k * 230, y = 124 - k * 64 - 16;
  const body = `<circle class="g-line" cx="${n(x)}" cy="${n(y - 30)}" r="5" fill="none"/><path class="g-line" d="M${n(x)} ${n(y - 25)} v14 l-5 10 M${n(x)} ${n(y - 11)} l6 10"/>`;
  const pole = `<path class="g-beam" d="M${n(x - 26)} ${n(y - 22)} L${n(x + 26)} ${n(y - 22)}"/>`;
  const bucket = (bx) => {
    const sx = n(bx + sway * 9), by = n(y - 4);
    return `<path class="g-line g-thin" d="M${bx} ${n(y - 22)} L${sx} ${by}"/><path class="g-line" d="M${n(sx - 6)} ${by} h12 l-2 10 h-8z"/><path class="g-water" d="M${n(sx - 4)} ${n(+by + 3)} h8"/>`;
  };
  const fx = state.fx ? splash(n(x + (state.fx.ok ? 0 : 26)), n(y + (state.fx.ok ? -40 : 6)), state.t - state.fx.at, { r: state.fx.ok ? 6 : 8, seal: state.fx.ok }) : '';
  return scene(320, 132, slope + vat + body + pole + bucket(x - 26) + bucket(x + 26) + fx);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const head = `<div class="g-head"><span>${t.loads} <b>${4 + state.load}</b> / 6</span><span>${t.steps} <b>${state.step}</b> / ${STEPS}</span></div>`;
  if (state.won) return `<div class="g-carry g-ink is-won">${carryScene(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-carry g-ink">${carryScene(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}${skipBtn(SKIP[lang] ?? SKIP.zh)}</div>`;
  const meter = `<div class="g-meter"><span>${t.breath}</span><span class="g-bar${state.breath > 0.6 ? ' is-seal' : ''}"><i style="width:${Math.round(state.breath * 100)}%"></i></span></div>`;
  return `<div class="g-carry g-ink">${carryScene(state)}${head}${meter}<p class="g-line-say">${t[state.note] ?? ''}</p>${btn(t.step, 'data-g="step"')}${skipBtn(SKIP[lang] ?? SKIP.zh)}</div>`;
}
