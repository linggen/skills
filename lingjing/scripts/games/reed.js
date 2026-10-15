// 芦苇里那一等 — 古七, 年四入秋, 沂水东岸 (09-yishui; the per-回 plan, 2026-10-15). 鯥 has no
// creatures.json row (codex.json: never one), so the fight is the book's own reading of it, played:
// 孙二狗 on the 山根桩 behind his board takes the charges (「我是山……我是山……」), 阿禾's brambles
// pin its hind legs, and 小满, twenty paces downwind in the reeds with the 短飞剑 between his
// fingers, waits for the one instant — 「翅膀张开之前，它得吸一口气，吸气的时候，翅膀根上那块皮翻开来，
// 翻开一霎，露出底下粉红的肉，像鱼的鳃」 — and lets the sword go.
// Two parts: the charges (a sword let go now glances off a hide 「厚得出奇」 and has to be called
// back), then the pinned beast heaving for breath, the pink showing for a moment each heave. Never a
// fail; `stuck` after four swords wasted. Grade still · hasty. Pure: newGame / act / tick / html.
import { btn, n, reeds, scene, skipped, splash } from './ink.js';

export const CHARGE = [1600, 1500, 1700]; // the three charges (the first in the dark — 「头一回你没看见」)
export const PIN = 1400; //  阿禾's brambles climb its hind legs
export const HEAVE = [1900, 1500, 2300, 1700]; // between breaths, in turn
export const PINK = 600; // the skin at the wing root stays open this long

export const meta = {
  id: 'reed',
  name: { zh: '芦苇里那一等', en: 'The wait in the reeds' },
  how: {
    zh: '蹲在下风头的芦苇里，别动。它撞板子，你等；荆棘缠住了它，它要吸一口气张翅膀——翅膀根上露出粉红的肉那一霎，「放剑」。',
    en: 'Crouch in the reeds downwind and keep still. While it rams the board, wait; once the brambles have it, it must draw breath to spread its wings — the instant the pink flesh shows at the wing root, let the sword go.',
  },
};

const T = {
  zh: {
    ready: '小满往下风头退了二十步，蹲进一丛芦苇里，火柴横在膝盖上，短飞剑扣在指间。月亮上来的时候，水响了。', start: '蹲进芦苇',
    charge0: '黑地里「咚」的一声——板子后头的孙二狗没倒。', charge1: '「咚」的一声，牛头撞在板子上，板子往后滑了三尺——停住了。「我是山……我是山……」', charge2: '它退了一步，再撞，板子没退；那条蛇尾巴却从板子边上绕了过来。',
    pin: '阿禾右手一掐诀，滩上「噗」地拱出一丛荆棘，爬上它的后腿，一圈一圈勒紧了。', heave: '它进不得，退不得。它要飞——', pink: '吸气了：翅膀根上那块皮翻开来，露出底下粉红的肉——',
    glance: '剑贴着泥飞过去，打在它背上，那张皮厚得出奇——滑开了。你掐诀把剑招了回来。', shut: '皮合上了。剑打在皮上，滑开了。你把剑招了回来。',
    throw: '放剑', charges: '撞', wait: '等',
    still: '一道白光贴着滩上的泥飞过去，从那块粉红的肉里钻了进去。它叫了一声，像牛叫，又拖着一个尾音，像人在水底下喊，翅膀张了一半，塌了下去。',
    hasty: '剑招回来又放出去，到底从那块粉红的肉里钻了进去。它叫了一声，翅膀张了一半，塌了下去。',
    skipped: '小满在芦苇里等的就是这一霎。短飞剑从翅膀根上那块粉红的肉里钻了进去。',
  },
  en: {
    ready: 'Xiaoman falls back twenty paces downwind and crouches in a clump of reeds, Matchstick across his knees, the short flying sword between his fingers. When the moon comes up, the water stirs.', start: 'Into the reeds',
    charge0: 'A *thump* in the dark — behind his board, Sun Ergou hasn\'t gone down.', charge1: 'With a *thump* the ox head hits the board; the board slides back three feet — and stops. "I am the mountain... I am the mountain..."', charge2: 'It backs a step and rams again; the board holds. But the snake\'s tail comes curling round its edge.',
    pin: 'Ahe pinches a sign with her right hand; brambles burst up out of the flat, climb its hind legs and tighten, coil on coil.', heave: 'It can go neither forward nor back. It wants to fly —', pink: 'It draws breath: the skin at the wing root flips open, showing the pink flesh beneath —',
    glance: 'The sword skims the mud and strikes its back; the hide is uncommonly thick — it slides off. You call the sword back with a sign.', shut: 'The skin has closed. The sword strikes hide and slides off. You call it back.',
    throw: 'Let the sword go', charges: 'Charge', wait: 'Wait',
    still: 'A streak of white skims the mud and bores into that pink flesh. It bellows, like an ox, with a trailing note like a man shouting underwater; the wings half open and collapse.',
    hasty: 'Called back and let go again, the sword at last bores into the pink flesh. It bellows; the wings half open and collapse.',
    skipped: 'This was the instant Xiaoman had waited for in the reeds. The short flying sword bored into the pink flesh at the wing root.',
  },
};

export function newGame(seed) {
  return { seed: String(seed), phase: 'ready', live: false, t: 0, at: 0, k: 0, wasted: 0, fx: null, note: 'ready', won: false, grade: null };
}
export const stuck = (s) => s.wasted >= 4;
/* In the heaving: is the pink showing (the last PINK ms before each breath's end)? */
export const pinkNow = (s) => s.phase === 'heave' && s.t - s.at >= HEAVE[s.k % HEAVE.length] - PINK;

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'charge', live: true, at: s.t, k: 0, note: 'charge0' } : null),
  throw: (s) => {
    if (s.phase === 'charge' || s.phase === 'pin') return { ...s, wasted: s.wasted + 1, note: 'glance', fx: { at: s.t, ok: false } };
    if (s.phase !== 'heave') return null;
    if (!pinkNow(s)) return { ...s, wasted: s.wasted + 1, note: 'shut', fx: { at: s.t, ok: false } };
    const grade = s.wasted === 0 ? 'still' : 'hasty';
    return { ...s, live: false, won: true, grade, note: grade, fx: { at: s.t, ok: true } };
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
  if (!state.live || state.won || ms <= 0) return state;
  const s = { ...state, t: state.t + ms }, since = s.t - s.at;
  const told = (s.note === 'glance' || s.note === 'shut') && s.t - (s.fx?.at ?? 0) < 1200;
  if (s.phase === 'charge') {
    if (since < CHARGE[s.k]) return told ? s : { ...s, note: `charge${s.k}` };
    return s.k < CHARGE.length - 1 ? { ...s, k: s.k + 1, at: s.t, note: told ? s.note : `charge${s.k + 1}` } : { ...s, phase: 'pin', at: s.t, k: 0, note: 'pin' };
  }
  if (s.phase === 'pin') return since < PIN ? (told ? s : { ...s, note: 'pin' }) : { ...s, phase: 'heave', at: s.t, k: 0, note: 'heave' };
  if (s.phase === 'heave') {
    if (since >= HEAVE[s.k % HEAVE.length]) return { ...s, at: s.t, k: s.k + 1, note: told ? s.note : 'heave' };
    return told ? s : { ...s, note: pinkNow(s) ? 'pink' : 'heave' };
  }
  return s;
}

/* ── The picture: the flat at night, the board and its torch, the beast's ox head against it, the
   reeds in front of him; the wing root showing pink for its moment. */
function picture(s) {
  const flat = '<path class="g-line g-thin g-faint" d="M0 112 H320"/>';
  const ram = s.phase === 'charge' && s.t - s.at > CHARGE[s.k] - 300 ? 8 : 0;
  const board = `<path class="g-line" d="M${190 - ram} 60 v52"/><path class="g-line g-thin" d="M${196 - ram} 62 l4 -10"/><circle class="g-flame" cx="${200 - ram}" cy="48" r="4"/>`;
  const beast = `<g transform="translate(${236 - ram} 0)"><path class="g-line" d="M-30 82 q-6 -14 6 -18 l16 0 q18 0 22 14 q2 16 -12 18 h-26 Z"/><path class="g-line g-thin" d="M-28 66 l-6 -8 M-20 64 l2 -9"/>`
    + `<path class="g-line g-thin" d="M14 92 q24 6 40 -4"/>${s.phase === 'heave' ? `<path class="g-line${pinkNow(s) ? '' : ' g-thin'}" d="M0 78 q14 -26 30 -18"/>` : ''}${pinkNow(s) ? '<circle class="g-flame" cx="2" cy="76" r="4"/>' : ''}</g>`;
  const thorns = s.phase === 'pin' || s.phase === 'heave' || s.won ? '<path class="g-line g-thin" d="M236 112 l-6 -12 l6 4 l4 -10 l2 12 l6 -6 l-2 12"/>' : '';
  const front = reeds([20, 34, 48, 62, 76, 90], 118, 54, 0.3, s.t);
  const fx = s.fx ? splash(s.fx.ok ? 238 : 250, s.fx.ok ? 76 : 70, s.t - s.fx.at, { r: 9, seal: s.fx.ok }) : '';
  return scene(320, 124, flat + board + beast + thorns + front + fx);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-reedwait g-ink is-won">${picture(state)}<p class="g-line-say">${t[state.grade ?? 'skipped']}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-reedwait g-ink">${picture(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const head = state.phase === 'charge' ? `<div class="g-head"><span>${t.charges} <b>${state.k + 1}</b></span></div>` : `<div class="g-head"><span>${t.wait}</span></div>`;
  return `<div class="g-reedwait g-ink">${picture(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p>${btn(t.throw, 'data-g="throw"')}</div>`;
}
