// 一千米补测 · 先吐 — 今 · 一 (j01-retest; Hanli 2026-10-05: 今线进游戏，小游戏的玩法
// 就是那一段的科学课). 九月二十四日 the retest: the legs run by themselves; the
// player breathes. Two buttons, each held: 吐 empties the lungs, 吸 fills them.
// Every in-breath spends its first part on the air stuck in the throat (阿禾's
// 挤公交: 门口那一截人永远进不了车厢) — a shallow pant buys almost nothing; a
// breath drawn after a long out-breath buys most. Drawing in on full lungs is
// 憋 (the chest tightens, the air goes faster); four pants in a row is 乱 (he
// gulps faster still). Air out → he throws up at the trackside, as on 九月十一日
// — and runs it again. A thousand metres → 4′29″, 过了. No pay to the 古 line.
// Pure module: newGame / html / act / tick; the holds are [data-g-hold] (live-games.js).
import { bar } from './breath.js';

export const meta = {
  id: 'qianmi',
  name: { zh: '一千米补测 · 先吐', en: 'The 1000-metre retest · Out first' },
  how: {
    zh: '按住「吐」吐干净，再按住「吸」。喘得又快又浅，一半是白喘。',
    en: 'Hold "Out" until you are empty, then hold "In". Quick shallow panting is half wasted.',
  },
};

export const DIST = 1000; //       metres
export const RUN_MS = 45000; //    game time for the thousand
export const DEAD = 0.2; //        the first part of every in-breath: the air in the throat
const DRAIN = 0.06 / 1000; //      air spent per ms running
const GAIN = 0.6; //               air bought per unit of lung, past the dead part
const OUT = 0.45 / 1000, IN = 0.5 / 1000; // lung per ms out / in
const PANT = 0.3, PANIC = 4; //    an in-breath smaller than this is a pant; this many in a row is 乱

const T = {
  zh: {
    ready: '九月二十四日，下午四点。哨子一响，六个人冲了出去。他咬着牙硬让腿慢下来。',
    start: '起跑',
    out: '呵——吐',
    in: '吸',
    air: '气',
    lungs: '肺',
    dist: '米',
    running: '腿自己在跑。你管喘气。',
    exhale: '「呵——」长长地吐。',
    inhale: '吸——',
    fresh: '吐干净了，那一口新气自己灌了进来，一直灌到肚子底下。',
    pant: '又快又浅——一口刚吸到喉咙，下一口已经急着出来。',
    bie: '胸口发紧，吸不进去了——越吸不进越慌。',
    panic: '越慌越想快快地吸。先吐。',
    vomit: '胃里翻江倒海。他弯下腰，把中午那碗牛肉面原原本本还给了这个世界。',
    again: '再跑一回',
    won: '「沈芒，四分二十九。」雷老师又看了一眼表，「……过了。」',
  },
  en: {
    ready: 'The twenty-fourth of September, four in the afternoon. At the whistle six runners shot off. He gritted his teeth and made his legs go slow.',
    start: 'Go',
    out: 'Hoo — out',
    in: 'In',
    air: 'Air',
    lungs: 'Lungs',
    dist: 'm',
    running: 'The legs run by themselves. You see to the breathing.',
    exhale: '"Hooo —" a long breath out.',
    inhale: 'In —',
    fresh: 'Emptied out, the new breath came in by itself, all the way down to his belly.',
    pant: 'Quick and shallow — one breath barely in, the next already hurrying out.',
    bie: 'His chest tightens; he can\'t get any more in — and the less he can, the more he panics.',
    panic: 'The more he panics, the faster he wants to gulp. Out first.',
    vomit: 'His stomach heaved. He bent over and gave that lunchtime bowl of beef noodles back to the world, untouched.',
    again: 'Run it again',
    won: '"Shen Mang, four twenty-nine." Coach Lei looked at the watch again. "…Passed."',
  },
};

export function newGame(seed = '', tries = 0) {
  return { seed: String(seed), tries, live: true, started: false, t: 0, d: 0, air: 0.8, lungs: 0.5, mode: null, vol: 0, pants: 0, note: 'ready', failed: false, won: false };
}

/* An in-breath ends: what it was. A pant counts toward 乱; a full one clears it. */
function endIn(s) {
  if (s.mode !== 'in') return s;
  const pant = s.vol < PANT;
  return { ...s, mode: null, pants: pant ? s.pants + 1 : 0, note: pant ? (s.pants + 1 >= PANIC ? 'panic' : 'pant') : 'fresh' };
}

const VERBS = {
  start: (s) => (s.started || s.failed ? null : { ...s, started: true, note: 'running' }),
  hold: (s, d) => {
    if (!s.started || s.failed) return null;
    const mode = d.gHold === 'in' ? 'in' : 'out';
    const base = endIn(s);
    return { ...base, mode, vol: 0, note: mode === 'out' ? 'exhale' : base.note === 'exhale' || base.note === 'fresh' ? 'inhale' : base.note };
  },
  release: (s) => (s.mode === 'in' ? endIn(s) : s.mode === 'out' ? { ...s, mode: null } : null),
  again: (s) => (s.failed ? { ...newGame(s.seed, s.tries + 1), started: true, note: 'running' } : null),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || !state.started || state.won || state.failed) return state;
  let s = { ...state, t: state.t + ms, d: Math.min(DIST, state.d + (DIST / RUN_MS) * ms) };
  let drain = DRAIN * ms;
  if (s.pants >= PANIC) drain *= 1.6;
  if (s.mode === 'out') {
    s.lungs = Math.max(0, s.lungs - OUT * ms);
    // Emptied right out, the panic goes with it.
    if (s.lungs < 0.15) s.pants = 0;
  } else if (s.mode === 'in') {
    const room = 1 - s.lungs, dl = Math.min(room, IN * ms);
    if (dl <= 0) { drain *= 2.5; s.note = 'bie'; } else {
      const before = s.vol;
      s.vol += dl;
      s.lungs += dl;
      s.air = Math.min(1, s.air + GAIN * Math.max(0, s.vol - Math.max(DEAD, before)));
    }
  }
  s.air = Math.max(0, s.air - drain);
  if (s.air <= 0) return { ...s, live: false, failed: true, mode: null, note: 'vomit' };
  if (s.d >= DIST) return { ...s, live: false, won: true, mode: null, note: 'won' };
  return s;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-jin g-qianmi is-won"><p class="g-jin-line">${t.won}</p></div>`;
  const meters = `<div class="g-jin-track"><i style="left:${Math.round((state.d / DIST) * 100)}%"></i></div>`
    + `<div class="g-jin-meter"><span>${Math.round(state.d)} ${t.dist}</span></div>`
    + bar(t.air, state.air, state.air < 0.25 ? 'is-low' : '')
    + bar(t.lungs, state.lungs, state.lungs >= 0.99 ? 'is-full' : '');
  const btns = state.failed ? `<button type="button" class="g-jin-btn" data-g="again">${t.again}</button>`
      : !state.started ? `<button type="button" class="g-jin-btn" data-g="start">${t.start}</button>`
      : `<div class="g-jin-pair"><button type="button" class="g-jin-btn${state.mode === 'out' ? ' is-held' : ''}" data-g-hold="out">${t.out}</button>`
        + `<button type="button" class="g-jin-btn${state.mode === 'in' ? ' is-held' : ''}" data-g-hold="in">${t.in}</button></div>`;
  return `<div class="g-jin g-qianmi${state.failed ? ' is-failed' : ''}">${meters}<p class="g-jin-line">${t[state.note] ?? ''}</p>${btns}</div>`;
}
