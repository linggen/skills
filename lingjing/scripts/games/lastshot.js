// 最后一罚 · 带着怕投 — 今 · 四 (j09-final; Hanli 2026-10-05). 十二月十九日, 零点六秒，
// 落后一分, the first free throw off the front of the rim. 惧 is the throttle: the
// stand chants 「百分之一！」 and every chant puts the heart up. A long out-breath
// is the brake — 刹得住一截，刹不干净: it never comes down past a hundred, and the
// hands never stop shaking. So he does not wait for them to: two breaths of
// about four in and six out, and 出手 late in an out-breath, shaking — it rolls
// round the rim and drops. Shot in the middle of a breath in, or before two
// such breaths, it is the book's first: 「当」，砸在篮筐前沿上 — the referee hands
// the ball back and he goes again. No pay to the 古 line.
// Pure module: newGame / html / act / tick; the hold is [data-g-hold] (live-games.js).
import { bar, beatOf, BEAT, calm, flow, holdIn, isBrake, letOut } from './breath.js';

export const meta = {
  id: 'lastshot',
  name: { zh: '最后一罚 · 带着怕投', en: 'The last free throw · Shoot with the fear' },
  how: {
    zh: '看台一喊，心就往上蹿。吸四吐六刹一截——手还抖，别等它不抖：两口长吐以后，吐到末尾出手。',
    en: 'Every chant from the stand sends the heart up. In for four, out for six brakes it a little — the hands still shake; don\'t wait for them to stop: after two long out-breaths, shoot at the end of one.',
  },
};

export const START_HR = 128;
export const FLOOR = 100; //      the brake takes it no lower: 刹不干净
export const NEED_BREATHS = 2;
export const CHANT_MS = 6000; //  a chant every so often
const CHANT_UP = 4, BRAKE = 14, LATE = 3 * BEAT;

const T = {
  zh: {
    ready: '还剩一个。裁判把球收回去，等两边站好。这几秒钟，是规则留给他的。',
    in: '吸',
    out: '吐',
    shoot: '出手',
    heart: '心',
    shake: '手',
    beat: '拍',
    breathing: '他不想了，换了一样做：吸四拍，吐六拍。',
    brake: '吐得慢得像要把肚子里的东西全倒干净。刹得住一截，刹不干净。手还在抖。',
    short: '吸得太急——看台上的声音一阵一阵远了，又一阵一阵近了。',
    chant: '「百分之一！百分之一！」',
    miss: '「当」，砸在篮筐前沿上，弹了出来。裁判把球又递了回来。',
    won: '球砸在篮筐后沿，弹起来，落回筐上，沿着铁圈转了一圈，又转了半圈。看台上那声「百分之一」，喊到一半，停了。它掉了进去。',
  },
  en: {
    ready: 'One left. The referee took the ball back and waited for both sides to set. These few seconds were the rules\' gift to him.',
    in: 'In',
    out: 'Out',
    shoot: 'Shoot',
    heart: 'Heart',
    shake: 'Hands',
    beat: 'beat',
    breathing: 'He stopped thinking and did something else instead: in for four beats, out for six.',
    brake: 'Out so slowly it was as if he were emptying everything inside him. It brakes a little; it never brakes all the way. His hands still shook.',
    short: 'In too fast — the noise of the stand faded and came back, faded and came back.',
    chant: '"One percent! One percent!"',
    miss: 'Clang — off the front of the rim, and out. The referee handed him the ball again.',
    won: 'The ball struck the back of the rim, bounced up, came down on it, ran once round the iron, and half round again. The chant of "one percent" stopped halfway. It dropped in.',
  },
};

export function newGame(seed = '') {
  return { seed: String(seed), live: true, t: 0, hr: START_HR, breath: calm(), good: 0, misses: 0, chantAt: CHANT_MS, note: 'ready', won: false };
}

/* How hard the hands shake: never nothing — 他没等它不哆嗦. */
export const shakeOf = (hr) => Math.max(0.25, Math.min(1, (hr - 60) / 80));

const VERBS = {
  hold: (s) => {
    if (s.breath.phase === 'in') return null;
    const { breath, done } = holdIn(s.breath);
    if (!done) return { ...s, breath, note: 'breathing' };
    const good = isBrake(done);
    return { ...s, breath, good: good ? s.good + 1 : s.good, hr: good ? Math.max(FLOOR, s.hr - BRAKE) : s.hr, note: good ? 'brake' : 'short' };
  },
  release: (s) => (s.breath.phase === 'in' ? { ...s, breath: letOut(s.breath) } : null),
  shoot: (s) => {
    const late = s.breath.phase === 'out' && s.breath.outMs >= LATE;
    if (s.good >= NEED_BREATHS && late) return { ...s, live: false, won: true, note: 'won' };
    return { ...s, misses: s.misses + 1, good: 0, breath: calm(), note: 'miss' };
  },
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won) return state;
  let s = { ...state, t: state.t + ms, breath: flow(state.breath, ms) };
  if (s.t >= s.chantAt) s = { ...s, chantAt: s.chantAt + CHANT_MS, hr: Math.min(150, s.hr + CHANT_UP), note: s.note === 'brake' ? 'brake' : 'chant' };
  return s;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-jin g-lastshot is-won"><p class="g-jin-line">${t.won}</p></div>`;
  const b = state.breath, phase = b.phase === 'idle' ? '' : `${b.phase === 'in' ? t.in : t.out} ${beatOf(b)} ${t.beat}`;
  const shake = shakeOf(state.hr);
  return `<div class="g-jin g-lastshot" style="--shake:${shake.toFixed(2)}">`
    + `<div class="g-jin-hr is-fast"><b>${Math.round(state.hr)}</b><span>${t.heart}</span></div>`
    + bar(t.shake, shake, 'is-low')
    + `<div class="g-jin-dots">${Array.from({ length: NEED_BREATHS }, (_, i) => `<span class="g-jin-dot${i < state.good ? ' is-on' : ''}"></span>`).join('')}</div>`
    + `<div class="g-jin-beat">${phase}</div>`
    + `<p class="g-jin-line">${t[state.note] ?? ''}</p>`
    + `<button type="button" class="g-jin-btn${b.phase === 'in' ? ' is-held' : ''}" data-g-hold="in">${t.in}</button>`
    + `<button type="button" class="g-jin-btn is-small" data-g="shoot">${t.shoot}</button></div>`;
}
