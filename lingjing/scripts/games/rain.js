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
import { btn, n, scene, splash, still, stroke } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './rain.js';

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
    swapped: '满盆端走，空盆放下——「叮」。',
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
    swapped: 'The full one off, an empty one down — *ting*.',
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

/* A full basin carried off where it still drips: one tap sets the next one down in its place (live,
   2026-10-16: it took two — lift, then tap the empty floor again — while the drip fell on the floor). */
function swapFull(s, i) {
  if (!leakingAt(s.sched, i, s.t)) return settle(s);
  const hand = [...s.hand].sort((x, y) => y - x), basins = [...s.basins];
  if (hand.length) { basins[i] = hand.shift(); return settle({ ...s, basins, hand, note: 'swapped' }); }
  if (s.spare > 0) { basins[i] = 0; return settle({ ...s, basins, spare: s.spare - 1, note: 'swapped' }); }
  return settle(s);
}

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
  if (b >= CAP) return swapFull({ ...s, basins, banked: s.banked + 1, note: 'banked' }, i);
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

/* ── The picture (2026-10-14): each spot of the two rooms in ink — the thatch above, a drop
   falling where it leaks (drawn at the state's clock), a basin filling, a stain where it
   lands on the floor. A basin brimming rings; a full one carried to the wall is a dot more
   in the row; a drop on the floor is a small ink splash. */
const DROP_MS = 800;
// Painted (2026-10-16, tools/paint-games.py): the wet beam under the thatch and the wooden basin are
// house 水墨淡彩 pieces on the game's paper; the drops, the water and the ink stay the brush's.
const ART = (f) => new URL(`../../worlds/jiuding/art/games/rain/${f}.webp`, import.meta.url).href;
const PAINT = { basin: ART('basin'), beam: ART('beam') };
const beam = (x, w, h = 16) => `<image class="g-rain-beam" href="${PAINT.beam}" x="${n(x)}" y="-3" width="${n(w)}" height="${h}" preserveAspectRatio="none"/>`;
/* A basin standing at (cx, foot), `w` wide; `lvl` 0…1 of water shows in its mouth. */
function basinArt(cx, foot, w, lvl, full) {
  // The painting is 273×200; its mouth is the top half. Water rises to the rim: the surface widens.
  const h = w * 0.73, k = Math.min(1, lvl);
  const water = lvl > 0 ? `<ellipse class="g-waterfill${full ? ' is-brim' : ''}" cx="${n(cx)}" cy="${n(foot - h * (0.6 + 0.1 * k))}" rx="${n(w * (0.3 + 0.12 * k))}" ry="${n(h * (0.09 + 0.07 * k))}"/>` : '';
  return `<image class="g-rain-basin-art" href="${PAINT.basin}" x="${n(cx - w / 2)}" y="${n(foot - h)}" width="${n(w)}" height="${n(h)}"/>${water}`;
}

function spotScene(s, i) {
  const b = s.basins[i], drip = s.live && leakingAt(s.sched, i, s.t);
  const k = still() ? 0.4 : ((s.t + i * 137) % DROP_MS) / DROP_MS;
  const thatch = beam(-((i * 53) % 150), 260);
  const drop = drip ? `<path class="g-drop" transform="translate(45 ${n(10 + k * (b == null ? 52 : 30))})" d="M0 -5 C2 -1 3 1 3 2.5 A3 3 0 0 1 -3 2.5 C-3 1 -2 -1 0 -5Z"/>` : '';
  const land = drip && k > 0.82 ? (b == null || b >= CAP ? splash(45, 62, (k - 0.82) * 2400, { r: 6 }) : `<ellipse class="g-ripple" cx="45" cy="42" rx="${n(6 + (k - 0.82) * 60)}" ry="2"/>`) : '';
  const lvl = b == null ? 0 : b / CAP;
  const basin = b == null ? '' : `<g class="g-rain-basin${b >= CAP ? ' is-full' : ''}">${basinArt(45, 68, 52, lvl, b >= CAP)}`
    + `${b >= CAP ? '<text class="g-fullmark" x="84" y="30" text-anchor="end">满</text>' : ''}</g>`;
  const stain = b == null && drip ? `<ellipse class="g-stain" cx="45" cy="63" rx="13" ry="3"/>` : '';
  return scene(90, 70, thatch + stain + basin + drop + land, 'g-painted');
}
function spotHtml(s, i, t, lang) {
  const b = s.basins[i], drip = s.live && leakingAt(s.sched, i, s.t);
  return `<button type="button" class="g-rain-spot${drip ? ' is-drip' : ''}${b == null ? '' : ' has-basin'}${b != null && b >= CAP ? ' is-full' : ''}" data-g="spot" data-i="${i}">`
    + `${spotScene(s, i)}<span class="g-rain-name">${SPOTS[i][lang] ?? SPOTS[i].zh}</span>`
    + `${drip ? `<span class="g-sr">${t.drip}</span>` : ''}</button>`;
}

const bowls = (full) => `<div class="g-rain-pips" aria-hidden="true">${Array.from({ length: NEED }, (_, i) => `<i class="${i < full ? 'is-on' : ''}"></i>`).join('')}</div>`;

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const full = fullCount(state);
  if (state.won) {
    // The seventeen in a row by the wall, full or not, and the floor as it was left.
    const row = Array.from({ length: NEED }, (_, i) => basinArt(14 + i * 17.4, 44, 15, i < full ? 1 : 0, i < full)).join('');
    const stains = state.grade === 'wet' ? [40, 120, 210, 280].map((x, i) => `<ellipse class="g-stain" cx="${x}" cy="${48 + (i % 2) * 3}" rx="${16 + i * 3}" ry="3.5"/>`).join('') : stroke(110, 50, 100, 400);
    return `<div class="g-rain g-ink is-won">${scene(320, 58, row + stains, 'g-painted')}<p class="g-line-say">${t[state.note] ?? t[state.grade]}</p></div>`;
  }
  if (!state.live) return `<div class="g-rain g-ink">${scene(320, 90, beam(-10, 340, 26) + [40, 95, 160, 220, 280].map((x, i) => `<path class="g-drop" transform="translate(${x} ${40 + (i % 3) * 12})" d="M0 -5 C2 -1 3 1 3 2.5 A3 3 0 0 1 -3 2.5 C-3 1 -2 -1 0 -5Z"/>`).join('') + basinArt(95, 88, 56, 0, false) + basinArt(225, 88, 56, 0.3, false), 'g-painted')}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const spots = SPOTS.map((_, i) => spotHtml(state, i, t, lang)).join('');
  const hand = state.spare + state.hand.length;
  return `<div class="g-rain g-ink">`
    + `<div class="g-rain-head g-head"><span>${t.full} <b>${full}</b> / ${NEED}</span><span>${t.spare} <b>${hand}</b></span><span class="${state.puddles > DRY ? 'is-wet' : ''}">${t.floor} <b>${state.puddles}</b></span></div>`
    + bowls(full)
    + `<div class="g-rain-house">${spots}</div>`
    + `<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export const mount = (container, opts) => mountPure(self)(container, opts);
