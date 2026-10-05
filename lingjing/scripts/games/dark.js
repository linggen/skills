// 黑地十一步 · 领着喘 — 今 · 三 (j07-dark; Hanli 2026-10-05). 十一月十九日夜, the
// rare-books room with the power off: no window under the ground, eyes open or
// shut the same. First, eleven steps to the washroom door on the bad ankle, by
// the lines in the foot and not the eyes (本体感觉): the ankle sways; put the
// foot down when it comes back to the middle, and the leg pulls itself back.
// Three wobbles and he goes down by the desk — and gets up from the start.
// Step four is the cold iron of the shelf, nine the corner of the desk, eleven
// the door handle. Then 马小宝, numb in the hands and mouth: 「我还当是气不够，越
// 吸越使劲」 — 是吸多了. Lead him: hold to breathe in, let go to breathe out, the
// out longer than the in, and the numbness goes as the CO2 comes back. A
// breath too quick, or not longer out than in, and he gulps again.
// Pure module: newGame / html / act / tick; the hold is [data-g-hold] (live-games.js).
import { bar, beatOf, calm, flow, holdIn, letOut } from './breath.js';

export const meta = {
  id: 'dark',
  name: { zh: '黑地十一步 · 领着喘', en: 'Eleven steps in the dark · Breathe with him' },
  how: {
    zh: '脚踝晃回正中再落脚，十一步摸到门；再领他喘：按住吸，松开吐，吐得比吸的长。',
    en: 'Put the foot down when the ankle swings back to the middle — eleven steps to the door. Then lead his breath: hold to breathe in, let go to breathe out, out longer than in.',
  },
};

export const STEPS = 11;
export const FALLS = 3; //     wobbles before he goes down
export const STEADY = 0.3; //  |sway| under this, the foot lands true
export const MARKS = { 4: 'shelf', 9: 'desk', 11: 'door' };
const NUMB_DOWN = 0.25, NUMB_UP = 0.12;

const T = {
  zh: {
    ready: '九点整，灯灭了。卫生间那头传过来一个声音：「……沈芒？」拐滑到桌子底下去了，摸了两把，没摸着。',
    start: '扶着桌沿，站起来',
    step: '落脚',
    sway: '脚踝',
    walk: '睁眼闭眼一个样。不拿眼睛走，拿脚上那些线走。',
    true: '脚踝往外歪了一歪——腿自己往回一收，稳住了。',
    wobble: '脚落歪了，脚踝往外一翻，他一把扶住了空气。',
    fall: '好脚没踩实，整个人坐到了地上。扶着桌沿，从头再来。',
    shelf: '第四步，手摸到书架冰凉的铁边。',
    desk: '第九步，碰到桌角。',
    door: '第十一步，摸到了卫生间的门把手。',
    lead: '「小宝哥。跟着我喘。吐得比吸的长。」',
    in: '吸',
    numb: '手麻',
    good: '吐得黑地里听得见。门里头那口喘，跟上来一点。',
    quick: '他跟不上，吐到一半又急急地吸。',
    won: '到第三十几口，马小宝哑着嗓子道：「……手不麻了。」「是吸多了。二氧化碳吹没了，手才麻。吐慢点，攒回来。」',
  },
  en: {
    ready: 'At nine sharp the lights went out. From the washroom came a voice: "…Shen Mang?" His crutch had slid under the desk; he felt for it twice and found nothing.',
    start: 'Hold the desk edge and stand',
    step: 'Step',
    sway: 'Ankle',
    walk: 'Eyes open or shut, the same. He walked not by his eyes but by the lines in his foot.',
    true: 'The ankle tipped out a little — the leg pulled itself back and held.',
    wobble: 'The foot landed crooked; the ankle rolled out and he grabbed at the air.',
    fall: 'The good foot found nothing solid and he sat down hard. Back to the desk edge; from the start.',
    shelf: 'Step four: his hand found the cold iron edge of a shelf.',
    desk: 'Step nine: the corner of the desk.',
    door: 'Step eleven: the washroom door handle.',
    lead: '"Brother Xiaobao. Breathe with me. Longer out than in."',
    in: 'In',
    numb: 'Numb',
    good: 'He breathed out so you could hear it in the dark. The panting behind the door followed a little.',
    quick: 'He couldn\'t keep up; halfway through breathing out he gulped in again.',
    won: 'Somewhere past thirty breaths Ma Xiaobao said hoarsely, "…My hands aren\'t numb." "You breathed too much. You blew the CO2 off — that\'s the numbness. Breathe out slow and let it build back."',
  },
};

function hash(str) {
  let h = 2166136261 >>> 0;
  for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h;
}
/** The ankle's swing for each step: a period in ms, so the sway is sin(2πt/period). */
export function swings(seed) {
  let h = hash(`dark:${seed}`);
  return Array.from({ length: STEPS }, (_, i) => { h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; return 1400 + (h % 700) - i * 40; });
}
export const swayOf = (s) => Math.sin((2 * Math.PI * s.st) / s.swing[Math.min(s.step, STEPS - 1)]);

export function newGame(seed = '') {
  return { seed: String(seed), phase: 'ready', live: false, step: 0, st: 0, wobbles: 0, falls: 0, swing: swings(seed), breath: calm(), numb: 1, note: 'ready', won: false };
}

function landed(s) {
  if (Math.abs(swayOf(s)) >= STEADY) {
    const wobbles = s.wobbles + 1;
    if (wobbles >= FALLS) return { ...s, step: 0, st: 0, wobbles: 0, falls: s.falls + 1, note: 'fall' };
    return { ...s, wobbles, st: 0, note: 'wobble' };
  }
  const step = s.step + 1;
  if (step >= STEPS) return { ...s, step, phase: 'lead', note: 'door' };
  return { ...s, step, st: 0, note: MARKS[step] ?? 'true' };
}

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'walk', live: true, note: 'walk' } : null),
  step: (s) => (s.phase === 'walk' ? landed(s) : null),
  hold: (s) => {
    if (s.phase !== 'lead' || s.breath.phase === 'in') return null;
    const { breath, done } = holdIn(s.breath);
    if (!done) return { ...s, breath, note: 'lead' };
    // Out longer than in, and not a gulp: the CO2 builds back.
    const good = done.outMs > done.inMs * 1.3 && done.inMs >= 1500 && done.inMs <= 4500;
    const numb = good ? Math.max(0, s.numb - NUMB_DOWN) : Math.min(1, s.numb + NUMB_UP);
    if (numb <= 0) return { ...s, breath, numb, live: false, won: true, note: 'won' };
    return { ...s, breath, numb, note: good ? 'good' : 'quick' };
  },
  release: (s) => (s.phase === 'lead' && s.breath.phase === 'in' ? { ...s, breath: letOut(s.breath) } : null),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won) return state;
  if (state.phase === 'walk') return { ...state, st: state.st + ms };
  if (state.phase === 'lead') return { ...state, breath: flow(state.breath, ms) };
  return state;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-jin g-dark is-won"><p class="g-jin-line">${t.won}</p></div>`;
  const steps = Array.from({ length: STEPS }, (_, i) => `<span class="g-jin-dot${i < state.step ? ' is-on' : ''}"></span>`).join('');
  if (state.phase === 'lead') {
    const b = state.breath;
    return `<div class="g-jin g-dark"><div class="g-jin-dots">${steps}</div>${bar(t.numb, state.numb, 'is-low')}`
      + `<div class="g-jin-beat">${b.phase === 'idle' ? '' : beatOf(b)}</div><p class="g-jin-line">${t[state.note] ?? ''}</p>`
      + `<button type="button" class="g-jin-btn${b.phase === 'in' ? ' is-held' : ''}" data-g-hold="in">${t.in}</button></div>`;
  }
  const x = state.phase === 'walk' ? swayOf(state) : 0;
  const sway = `<div class="g-jin-sway" aria-label="${t.sway}"><b class="g-jin-mid"></b><i style="left:${Math.round(50 + x * 45)}%"></i></div>`;
  const btn = state.phase === 'ready' ? `<button type="button" class="g-jin-btn" data-g="start">${t.start}</button>`
    : `<button type="button" class="g-jin-btn" data-g="step">${t.step}</button>`;
  return `<div class="g-jin g-dark"><div class="g-jin-dots">${steps}</div>${state.phase === 'walk' ? sway : ''}<p class="g-jin-line">${t[state.note] ?? ''}</p>${btn}</div>`;
}
