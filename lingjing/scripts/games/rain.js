// 接雨 · 十七个盆 — 古一's first morning (00-shiao; Hanli 2026-10-14: 「每看一会儿
// 剧情就要有游戏可以玩」). The book: 「屋顶漏雨，一场雨接满十七个盆」 — 沈家 has the most
// learned roof on 蒙山: it knows where the rain comes from, and where it goes.
// 打地鼠 (Hanli 2026-10-16: 「要类似打地鼠, 一个或2个地方漏雨, 只能相应的盆」 — and 「直接放6个盆
// 就好了」 was the old board's flaw): a leak pops up at one spot — its stain first, the first drop
// LEAD later — drips CAP times and stops; another pops up elsewhere. Early in the night one at a
// time, toward the fifth watch quicker and up to two at once. A basin goes only where it leaks
// NOW (a tap on a dry spot is a wasted trip: the hand is busy a beat); when the leak stops, the
// basin is carried to the 水缸, poured, and is back to hand by itself — basins never run out and
// no spot can be covered ahead. A leak a basin caught counts toward the seventeen; a drop with no
// basin under it is a puddle. Seventeen caught and it is done; at the fifth watch the rain stops
// whatever is caught. FLOOD puddles before then and the night is lost (Hanli: 「失败你决定吧」):
// 娘 calls out and the same night starts again at once, as the dark's fall does. How dry the floor
// stayed is the `grade` (dry · wet; a flooded try makes it wet) — the rules write it as a mark.
// Pure module: newGame / html / act / tick (live-games.js runs the clock).
import { rng } from './seeded.js';
import { btn, n, scene, splash, still, stroke } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './rain.js';

export const meta = {
  id: 'rain',
  name: { zh: '接雨 · 十七个盆', en: 'Catching the rain · Seventeen basins' },
  how: {
    zh: '哪儿洇湿了、滴答了，就点哪儿摆盆；不漏的地方摆不了。那处不漏了，盆自己回到手边。',
    en: 'Tap a spot as it starts to leak to set a basin there — only where it leaks. When it stops, the basin comes back by itself.',
  },
};

export const NEED = 17; //        leaks caught: the book's seventeen basins
export const CAP = 4; //          drops in one leak (a basin that caught them all is full)
export const LIMIT = 110000; //   the fifth watch: the rain stops
export const DRY = 10; //         puddles at most for a dry floor
export const LEAD = 900; //       the stain shows this long before a leak's first drop
export const MISS_MS = 500; //    a tap on a dry spot: the hand is busy this long
/* Puddles that lose the night — picked by play (2026-10-16, 60 seeds, one night's puddles; doc/games.md):
   a person's pace (the bot) 0; a casual hand, 0.6 s to see and tap, max 3; 1 s max 18; 1.3 s max 28;
   looking away 3 s of every 8, max 29 (29 live too) — 40 leaves that one room. Idle floods at ~31 s;
   away 5 s of every 10 (42 of 60), tapping every spot in turn (53), missing 1 leak in 3 (25) flood. */
export const FLOOD = 40;
const CALM = 1500; //             after a flood: the line stands, no drip, then the rain again
const AT = 1500; //               the first leak
const GAP = [3000, 1500]; //      leak to leak, dusk → the fifth watch
const ONE = 0.25; //              this much of the night: one leak at a time
const BEAT = [600, 500]; //       drop to drop within a leak, dusk → the fifth watch
const AFTER = 300; //             the leak's last drop → the basin carried off

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
    go: '哪儿洇湿了，盆就往哪儿摆。',
    placed: '盆底「叮」的一声。',
    wasted: '这儿不漏——白跑一趟。',
    poured: '那处不漏了。盆端去倒进水缸，又回到手边。',
    spill: '「嗒。」地上又汪了一片。',
    thick: '雨紧了——两处一起漏。',
    dry: '五更天，雨停了。十七个盆，一个不少，地上干干的。',
    wet: '五更天，雨停了。盆接满了，地上也汪着好几片水。',
    short: '五更天，雨停了。盆没接满，地上倒汪着好几片水。',
    flood: '娘在里屋喊：「屋里成河了！」盆都收回来，从头再接。',
    full: '满盆', floor: '地上', drip: '滴答',
  },
  en: {
    ready: 'It rained in the night — not hard, but very patiently. The roof is leaking again.',
    start: 'Get up and catch the rain',
    go: 'Wherever the damp shows, put a basin there.',
    placed: 'The basin goes *ting*.',
    wasted: 'Not leaking here — a wasted trip.',
    poured: 'It stopped there. The basin goes to the vat, is poured out, and is back to hand.',
    spill: '*Drip.* Another puddle on the floor.',
    thick: 'The rain thickens — two leaks at once.',
    dry: 'At the fifth watch the rain stops. Seventeen basins, not one missing, and the floor dry.',
    wet: 'At the fifth watch the rain stops. The basins are full, and the floor has its puddles too.',
    short: 'At the fifth watch the rain stops. Not every basin is full, and the floor has its puddles.',
    flood: 'Mother calls from the back room: "The house is a river!" Every basin back in hand — catch it again from the start.',
    full: 'Full', floor: 'Puddles', drip: 'drip',
  },
};

const lerp = ([a, b], f) => a + (b - a) * Math.min(1, Math.max(0, f));

/** The night's rain: every leak (spot, from, to, drops), never more than two at once, never two
    beginning within LEAD of each other, never the spot that just stopped. */
export function schedule(seed) {
  const rnd = rng(`rain:${seed}`);
  const leaks = [];
  let at = AT, last = -1, thick = null;
  for (;;) {
    const f = at / LIMIT, beat = Math.round(lerp(BEAT, f));
    if (at + LEAD + (CAP - 1) * beat >= LIMIT) break;
    const live = leaks.filter((l) => l.to > at);
    if (live.length && thick == null) thick = at;
    const taken = new Set([last, ...live.map((l) => l.spot)]);
    const free = SPOTS.map((_, i) => i).filter((i) => !taken.has(i));
    const spot = free[Math.floor(rnd() * free.length)];
    const drops = Array.from({ length: CAP }, (_, k) => at + LEAD + k * beat);
    leaks.push({ spot, from: at, to: drops.at(-1) + AFTER, drops });
    last = spot;
    let next = Math.max(at + LEAD, Math.round(at + lerp(GAP, f) * (0.85 + rnd() * 0.3)));
    const ends = leaks.map((l) => l.to).filter((to) => to > next).sort((a, b) => a - b);
    if (ends.length >= 2) next = ends[ends.length - 2]; // a third would open: wait for one to stop
    else if (ends.length && next < LIMIT * ONE) next = ends[0]; // the first part of the night: one at a time
    at = next;
  }
  const windows = SPOTS.map((_, i) => leaks.filter((l) => l.spot === i).map((l) => [l.from, l.to]));
  const drips = leaks.flatMap((l) => l.drops.map((d) => ({ at: d, spot: l.spot }))).sort((a, b) => a.at - b.at || a.spot - b.spot);
  const ends = leaks.map((l, i) => i).sort((a, b) => leaks[a].to - leaks[b].to);
  return { leaks, windows, drips, ends, thick };
}

/** Is this spot leaking at `t` (its stain showing, or dripping)? */
export const leakingAt = (sched, spot, t) => sched.windows[spot].some(([from, to]) => t >= from && t < to);
/** The leak at this spot at `t`, if any. */
const leakOf = (sched, spot, t) => sched.leaks.find((l) => l.spot === spot && t >= l.from && t < l.to) ?? null;

export function newGame(seed) {
  return { seed: String(seed), sched: schedule(seed), t: 0, k: 0, e: 0, live: false, basins: SPOTS.map(() => null), caught: 0, puddles: 0, floods: 0, busy: null, note: 'ready', won: false, grade: null };
}
/* A board saved before the 打地鼠 rain (2026-10-16) starts fresh on the new one. */
const fit = (s) => (s.won || s.sched?.leaks ? s : { ...newGame(s.seed), live: s.live, note: s.live ? 'go' : 'ready' });

/** Leaks caught: basins carried to the 水缸. */
export const fullCount = (s) => s.caught ?? 0;

function finish(s, forced) {
  const grade = !forced && !s.floods && s.puddles <= DRY ? 'dry' : 'wet';
  return { ...s, live: false, won: true, grade, note: forced && fullCount(s) < NEED ? 'short' : grade };
}

function tapSpot(s, i) {
  if (!s.live || !Number.isInteger(i) || i < 0 || i >= SPOTS.length) return null;
  if (s.busy != null && s.t < s.busy) return null; // still on the wasted trip
  if (s.basins[i] != null) return null; // a basin stands there already
  if (!leakingAt(s.sched, i, s.t)) return { ...s, busy: s.t + MISS_MS, note: 'wasted' };
  const basins = [...s.basins];
  basins[i] = 0;
  return { ...s, basins, note: 'placed' };
}

const VERBS = {
  start: (s) => (s.live ? null : { ...s, live: true, note: 'go' }),
  spot: (s, d) => tapSpot(s, Number(d.i)),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(fit(state), data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* The night lost: the floor a river, every basin back, the same rain again after a breath. */
const flooded = (s) => ({ ...s, t: -CALM, k: 0, e: 0, basins: SPOTS.map(() => null), caught: 0, puddles: 0, busy: null, floods: (s.floods ?? 0) + 1, note: 'flood' });

/** Lost the night again and again: the page may offer its 「算了，往下走」 (stuck.js). */
export const stuck = (s) => (s.floods ?? 0) >= 3;

export function tick(state, ms) {
  if (!state.live || state.won) return state;
  const prev = fit(state);
  const s = { ...prev, t: prev.t + ms, basins: [...prev.basins] };
  const { drips, leaks, ends, thick } = s.sched;
  if (thick != null && thick > prev.t && thick <= s.t) s.note = 'thick';
  // Drops and leaks stopping, in the order they happen.
  for (;;) {
    const d = drips[s.k], l = leaks[ends[s.e]];
    const dAt = d && d.at <= s.t ? d.at : Infinity, eAt = l && l.to <= s.t ? l.to : Infinity;
    if (dAt === Infinity && eAt === Infinity) break;
    if (dAt <= eAt) {
      const b = s.basins[d.spot];
      if (b != null) s.basins[d.spot] = b + 1;
      else { s.puddles += 1; s.note = 'spill'; }
      s.k += 1;
      if (s.puddles >= FLOOD) return flooded(s);
    } else {
      const b = s.basins[l.spot];
      if (b != null) {
        s.basins[l.spot] = null;
        if (b > 0) { s.caught += 1; s.note = 'poured'; }
      }
      s.e += 1;
      if (fullCount(s) >= NEED) return finish(s, false);
    }
  }
  return s.t >= LIMIT ? finish(s, true) : s;
}

/* ── The picture (2026-10-14): each spot of the two rooms in ink — the thatch above, a damp
   stain where a leak is coming, a drop falling in time with the leak's own drops, a basin
   filling. A basin that caught every drop rings 满; a drop on the floor is a small ink splash. */
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

/* Where the falling drop is, 0…1, timed to land on the leak's next drop; null when none is falling. */
function fallOf(leak, t) {
  if (!leak) return null;
  const beat = leak.drops[1] - leak.drops[0];
  if (t < leak.drops[0] - beat || t > leak.drops.at(-1)) return null;
  if (still()) return 0.4;
  return ((t - (leak.drops[0] - beat)) % beat) / beat;
}

function spotScene(s, i) {
  const b = s.basins[i], leak = s.live ? leakOf(s.sched, i, s.t) : null;
  const k = fallOf(leak, s.t);
  const thatch = beam(-((i * 53) % 150), 260);
  const drop = k != null ? `<path class="g-drop" transform="translate(45 ${n(10 + k * (b == null ? 52 : 30))})" d="M0 -5 C2 -1 3 1 3 2.5 A3 3 0 0 1 -3 2.5 C-3 1 -2 -1 0 -5Z"/>` : '';
  const land = k != null && k > 0.82 ? (b == null ? splash(45, 62, (k - 0.82) * 2400, { r: 6 }) : `<ellipse class="g-ripple" cx="45" cy="42" rx="${n(6 + (k - 0.82) * 60)}" ry="2"/>`) : '';
  const basin = b == null ? '' : `<g class="g-rain-basin${b >= CAP ? ' is-full' : ''}">${basinArt(45, 68, 52, b / CAP, b >= CAP)}`
    + `${b >= CAP ? '<text class="g-fullmark" x="84" y="30" text-anchor="end">满</text>' : ''}</g>`;
  const stain = s.t < 0 ? '<ellipse class="g-stain" cx="45" cy="63" rx="40" ry="5"/>' // the flood, while 娘's line stands
    : b == null && leak ? '<ellipse class="g-stain" cx="45" cy="63" rx="13" ry="3"/>' : '';
  return scene(90, 70, thatch + stain + basin + drop + land, 'g-painted');
}
function spotHtml(s, i, t, lang) {
  const b = s.basins[i], drip = s.live && leakingAt(s.sched, i, s.t);
  return `<button type="button" class="g-rain-spot${drip ? ' is-drip' : ''}${b == null ? '' : ' has-basin'}${b != null && b >= CAP ? ' is-full' : ''}" data-g="spot" data-i="${i}">`
    + `${spotScene(s, i)}<span class="g-rain-name">${SPOTS[i][lang] ?? SPOTS[i].zh}</span>`
    + `${drip ? `<span class="g-sr">${t.drip}</span>` : ''}</button>`;
}

/* The floor's count: wet past DRY, close to the flood in its last ten. */
const floorMark = (p) => (p >= FLOOD - 10 ? 'is-wet is-near' : p > DRY ? 'is-wet' : '');

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
  const s = fit(state);
  const spots = SPOTS.map((_, i) => spotHtml(s, i, t, lang)).join('');
  return `<div class="g-rain g-ink">`
    + `<div class="g-rain-head g-head"><span>${t.full} <b>${full}</b> / ${NEED}</span><span class="${floorMark(s.puddles)}">${t.floor} <b>${s.puddles}</b> / ${FLOOD}</span></div>`
    + bowls(full)
    + `<div class="g-rain-house">${spots}</div>`
    + `<p class="g-line-say">${t[s.note] ?? ''}</p></div>`;
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export const mount = (container, opts) => mountPure(self)(container, opts);
