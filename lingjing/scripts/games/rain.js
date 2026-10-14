// 接雨 · 十七个盆 — 古一's first morning (00-shiao; Hanli 2026-10-14: 「每看一会儿
// 剧情就要有游戏可以玩」). The book: 「屋顶漏雨，一场雨接满十七个盆」 — 沈家 has the most
// learned roof on 蒙山: it knows where the rain comes from, and where it goes.
// The night's rain drips in three places at a time and keeps moving; tap a dry
// spot to set a basin there, tap a basin to lift it (a full one goes to the
// wall, a half one back to hand). A drip with no basin under it, or on a brim,
// is a puddle. Seventeen basins full and it is done; at the fifth watch the
// rain stops whatever is full. It never fails: how dry the floor stayed is the
// `grade` (dry · wet) — the rules write it as a mark, nothing more.
// Pure module: newGame / html / act / tick (live-games.js runs the clock).
import { rng } from './seeded.js';

export const meta = {
  id: 'rain',
  name: { zh: '接雨 · 十七个盆', en: 'Catching the rain · Seventeen basins' },
  how: {
    zh: '哪儿滴答，就点哪儿，摆一个盆；盆满了点一下端开，不滴了就挪走。',
    en: 'Tap where it drips to set a basin; tap a full one to lift it away, and move the ones where it has stopped.',
  },
};

export const NEED = 17; //       basins in the house
export const CAP = 5; //          drips to fill one
export const LIMIT = 110000; //   the fifth watch: the rain stops
export const DRY = 10; //         puddles at most for a dry floor
const LEAKS = 3; //               dripping at once

export const SPOTS = [
  { zh: '灶台底下', en: 'Under the stove' },
  { zh: '炕头', en: "Head of the bed" },
  { zh: '堂屋当中', en: 'Middle of the room' },
  { zh: '水缸边', en: 'By the water vat' },
  { zh: '兽皮底下', en: 'Under the hides' },
  { zh: '门槛里头', en: 'Inside the doorway' },
];

const T = {
  zh: {
    ready: '头天夜里下起雨来，不大，却很有耐心。屋顶又漏了。',
    start: '起来接雨',
    go: '哪儿滴答，盆就往哪儿摆。',
    placed: '盆底「叮」的一声。',
    brim: '这一盆满了——端到墙根，再摆一个空的。',
    lifted: '这一盆端起来，搁回手边。',
    banked: '满盆端到墙根，排好。',
    spill: '「嗒。」地上又汪了一片。',
    none: '手边没有空盆了——把不滴的那几个挪过来。',
    shift: '那边不漏了，这边又漏了——这屋顶知道雨往哪去。',
    dry: '五更天，雨停了。十七个盆，一个不少，地上干干的。',
    wet: '五更天，雨停了。盆接满了，地上也汪着好几片水。',
    short: '五更天，雨停了。盆没接满，地上倒汪着好几片水。',
    full: '满盆', floor: '地上', spare: '手边的盆', drip: '滴答',
  },
  en: {
    ready: 'It rained in the night — not hard, but very patiently. The roof is leaking again.',
    start: 'Get up and catch the rain',
    go: 'Wherever it drips, put a basin there.',
    placed: 'The basin goes *ting*.',
    brim: 'This one is full — carry it to the wall and put down an empty one.',
    lifted: 'You lift this one and keep it to hand.',
    banked: 'A full basin carried to the wall, in its row.',
    spill: '*Drip.* Another puddle on the floor.',
    none: 'No empty basin to hand — move the ones where it has stopped.',
    shift: 'It stopped there and started here — this roof knows where the rain goes.',
    dry: 'At the fifth watch the rain stops. Seventeen basins, not one missing, and the floor dry.',
    wet: 'At the fifth watch the rain stops. The basins are full, and the floor has its puddles too.',
    short: 'At the fifth watch the rain stops. Not every basin is full, and the floor has its puddles.',
    full: 'Full', floor: 'Puddles', spare: 'Basins to hand', drip: 'drip',
  },
};

/** The night's rain: which spots leak when, and every drip, for the whole night. */
export function schedule(seed) {
  const rnd = rng(`rain:${seed}`);
  const n = SPOTS.length;
  let on = new Set();
  while (on.size < LEAKS) on.add(Math.floor(rnd() * n));
  const windows = Array.from({ length: n }, () => []);
  for (const i of on) windows[i].push([0, null]);
  const shifts = [];
  let at = 5000 + rnd() * 3000;
  while (at < LIMIT) {
    const live = [...on], off = [...Array(n).keys()].filter((i) => !on.has(i));
    const stop = live[Math.floor(rnd() * live.length)], go = off[Math.floor(rnd() * off.length)];
    on.delete(stop); on.add(go);
    windows[stop].at(-1)[1] = Math.round(at);
    windows[go].push([Math.round(at), null]);
    shifts.push(Math.round(at));
    at += 4500 + rnd() * 3500;
  }
  const drips = [];
  windows.forEach((ws, spot) => {
    for (const [from, to] of ws) {
      for (let t = from + 300 + rnd() * 600; t < (to ?? LIMIT); t += 800 + rnd() * 600) drips.push({ at: Math.round(t), spot });
    }
  });
  drips.sort((a, b) => a.at - b.at || a.spot - b.spot);
  return { windows, shifts, drips };
}

/** Is this spot dripping at `t`? */
export const leakingAt = (sched, spot, t) => sched.windows[spot].some(([from, to]) => t >= from && (to == null || t < to));

export function newGame(seed) {
  return { seed: String(seed), sched: schedule(seed), t: 0, k: 0, live: false, basins: SPOTS.map(() => null), spare: NEED, hand: [], banked: 0, puddles: 0, note: 'ready', won: false, grade: null };
}

/** Basins full: carried to the wall, and brimming where they stand. */
export const fullCount = (s) => s.banked + s.basins.filter((b) => b != null && b >= CAP).length;

function finish(s, forced) {
  const grade = !forced && s.puddles <= DRY ? 'dry' : 'wet';
  return { ...s, live: false, won: true, grade, note: forced && fullCount(s) < NEED ? 'short' : grade };
}
const settle = (s) => (fullCount(s) >= NEED ? finish(s, false) : s);

function tapSpot(s, i) {
  if (!s.live || !Number.isInteger(i) || i < 0 || i >= SPOTS.length) return null;
  const basins = [...s.basins], b = basins[i];
  if (b == null) {
    // The fullest half-basin in hand goes down first, else a dry one.
    const hand = [...s.hand].sort((x, y) => y - x);
    if (hand.length) { basins[i] = hand.shift(); return settle({ ...s, basins, hand, note: 'placed' }); }
    if (s.spare > 0) { basins[i] = 0; return { ...s, basins, spare: s.spare - 1, note: 'placed' }; }
    return { ...s, note: 'none' };
  }
  basins[i] = null;
  if (b >= CAP) return { ...s, basins, banked: s.banked + 1, note: 'banked' };
  return { ...s, basins, hand: [...s.hand, b], note: 'lifted' };
}

const VERBS = {
  start: (s) => (s.live ? null : { ...s, live: true, note: 'go' }),
  spot: (s, d) => tapSpot(s, Number(d.i)),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won) return state;
  const s = { ...state, t: state.t + ms, basins: [...state.basins] };
  const { drips, shifts } = s.sched;
  if (shifts.some((at) => at > state.t && at <= s.t)) s.note = 'shift';
  while (s.k < drips.length && drips[s.k].at <= s.t) {
    const { spot } = drips[s.k];
    const b = s.basins[spot];
    if (b != null && b < CAP) {
      s.basins[spot] = b + 1;
      if (b + 1 >= CAP) s.note = 'brim';
    } else {
      s.puddles += 1;
      s.note = 'spill';
    }
    s.k += 1;
  }
  if (fullCount(s) >= NEED) return finish(s, false);
  return s.t >= LIMIT ? finish(s, true) : s;
}

function spotHtml(s, i, t, lang) {
  const b = s.basins[i], drip = s.live && leakingAt(s.sched, i, s.t);
  const fill = b == null ? '' : `<span class="g-rain-basin${b >= CAP ? ' is-full' : ''}"><i style="height:${Math.round((b / CAP) * 100)}%"></i></span>`;
  return `<button type="button" class="g-rain-spot${drip ? ' is-drip' : ''}${b == null ? '' : ' has-basin'}" data-g="spot" data-i="${i}">`
    + `<span class="g-rain-drop" aria-hidden="true"></span>${fill}<span class="g-rain-name">${SPOTS[i][lang] ?? SPOTS[i].zh}</span>`
    + `${drip ? `<span class="g-rain-sr">${t.drip}</span>` : ''}</button>`;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const full = fullCount(state);
  const pips = Array.from({ length: NEED }, (_, i) => `<i class="${i < full ? 'is-on' : ''}"></i>`).join('');
  if (state.won) return `<div class="g-rain is-won"><div class="g-rain-pips">${pips}</div><p class="g-rain-line">${t[state.note] ?? t[state.grade]}</p></div>`;
  if (!state.live) return `<div class="g-rain"><p class="g-rain-line">${t.ready}</p><button type="button" class="g-rain-btn" data-g="start">${t.start}</button></div>`;
  const spots = SPOTS.map((_, i) => spotHtml(state, i, t, lang)).join('');
  const hand = state.spare + state.hand.length;
  return `<div class="g-rain">`
    + `<div class="g-rain-head"><span>${t.full} <b>${full}</b> / ${NEED}</span><span>${t.spare} <b>${hand}</b></span><span class="${state.puddles > DRY ? 'is-wet' : ''}">${t.floor} <b>${state.puddles}</b></span></div>`
    + `<div class="g-rain-pips">${pips}</div>`
    + `<div class="g-rain-house">${spots}</div>`
    + `<p class="g-rain-line">${t[state.note] ?? ''}</p></div>`;
}
