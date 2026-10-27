// 接雨 · 十七个盆 — 古一's first morning (00-shiao; Hanli 2026-10-14: 「每看一会儿
// 剧情就要有游戏可以玩」). The book: 「屋顶漏雨，一场雨接满十七个盆」 — 沈家 has the most
// learned roof on 蒙山: it knows where the rain comes from, and where it goes.
// 打地鼠 (Hanli 2026-10-16: 「要类似打地鼠, 一个或2个地方漏雨, 只能相应的盆」 — and 「直接放6个盆
// 就好了」 was the old board's flaw): a leak pops up at one spot — its stain first, the first drop
// LEAD later — drips CAP times and stops; another pops up elsewhere. Harder 10-19 (「同时放两个盆,
// 或者快一点」): the first TEACH leaks come alone, then two open together — two basins to set — and
// from THREE of the night a pair or three; the drops quicker. A basin goes only where it leaks
// NOW (a tap on a dry spot is a wasted trip: the hand is busy a beat); when the leak stops, the
// basin is carried to the 水缸, poured, and is back to hand by itself — basins never run out and
// no spot can be covered ahead. A leak a basin caught counts toward the seventeen; a drop with no
// basin under it is a puddle. Seventeen caught and it is done; at the fifth watch the rain stops
// whatever is caught. FLOOD puddles before then and the night is lost (Hanli: 「失败你决定吧」):
// 娘 calls out and the same night starts again at once, as the dark's fall does. How dry the floor
// stayed is the `grade` (dry · wet; a flooded try makes it wet) — the rules write it as a mark.
// Pure module: newGame / html / act / tick (live-games.js runs the clock).
//
// The kit (打地鼠) plays any level from data; 接雨 above is its built-in default, `SHIAO` (id `shiao`),
// and the exported constants (NEED, CAP, FLOOD, …) are its values. A level (every field optional; a
// missing one is the default's — a line falls back line by line):
//   id, name {zh, en}, how {zh, en}   the level's name and its how-to text (howOf)
//   spots [{zh, en}]                  the spots that leak, one or more; `cols` the grid's columns (3)
//   need                              leaks caught to win          cap    drops in one leak
//   limit                             ms until the rain stops      flood  puddles that lose the try
//   dry                               puddles at most for the good grade
//   lead                              ms the stain shows before the first drop
//   gap [dusk, end]                   ms leak-wave to leak-wave    beat [dusk, end]  ms drop to drop
//   teach                             leaks that come alone first  three  share of the night from which three open
//   jit                               ms a wave's leaks open apart at most
//   lines {zh: {…}, en: {…}}          ready start go placed wasted poured spill thick thicker dry wet short
//                                     flood, and the head labels full floor drip
//   art {beam, basin, ground?}        images under worlds/jiuding/art/games/ (e.g. 'rain/beam.webp'):
//                                     the overhead strip, the catcher, and a ground drawn under each spot
// A climbing practice board (tasks/world.json `climb`) hands every rung in `levels` and the one it is on as `lv`.
//   grades [good, bad]                the grade names (dry · wet); the lines stay keyed dry / wet
//   row {x, step, w, foot}            the end picture: `need` catchers in a row (default: centred to fit)
// A host passes a level as mount(container, { data: { levels: [level] } }) or newGame(seed, 1, { levels:
// [level] }); or names one with data.level — 'shiao', or a level of the games.json row with id `rain`
// (ladderOf / levelFor, as qimai does). A state carries a data level as `level`; levelOf(s) reads it.
import { rng } from './seeded.js';
import { btn, n, scene, splash, still, stroke } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './rain.js';

export const meta = {
  id: 'rain',
  sounds: ['start', 'hit', 'miss', 'drip', 'spill', 'catch', 'flood', 'thick'], // the whack kit's (games/kit/audio/sounds.json)
  name: { zh: '接雨 · 十七个盆', en: 'Catching the rain · Seventeen basins' },
  how: {
    zh: '哪儿洇湿了、滴答了，就点哪儿摆盆；不漏的地方摆不了。那处不漏了，盆自己回到手边。',
    en: 'Tap a spot as it starts to leak to set a basin there — only where it leaks. When it stops, the basin comes back by itself.',
  },
};

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
    thicker: '雨又紧了——三处一起漏。',
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
    thicker: 'Heavier still — three leaks at once.',
    dry: 'At the fifth watch the rain stops. Seventeen basins, not one missing, and the floor dry.',
    wet: 'At the fifth watch the rain stops. The basins are full, and the floor has its puddles too.',
    short: 'At the fifth watch the rain stops. Not every basin is full, and the floor has its puddles.',
    flood: 'Mother calls from the back room: "The house is a river!" Every basin back in hand — catch it again from the start.',
    full: 'Full', floor: 'Puddles', drip: 'drip',
  },
};

/* 接雨 · 十七个盆, the built-in default level. Its numbers are pinned by tests/rain.test.mjs. */
export const SHIAO = {
  id: 'shiao',
  name: meta.name,
  how: meta.how,
  spots: [
    { zh: '灶台底下', en: 'Under the stove' },
    { zh: '炕头', en: "Head of the bed" },
    { zh: '堂屋当中', en: 'Middle of the room' },
    { zh: '水缸边', en: 'By the water vat' },
    { zh: '兽皮底下', en: 'Under the hides' },
    { zh: '门槛里头', en: 'Inside the doorway' },
  ],
  need: 17, //        leaks caught: the book's seventeen basins
  cap: 4, //          drops in one leak (a basin that caught them all is full)
  limit: 110000, //   the fifth watch: the rain stops
  flood: 19, //       puddles that lose the night (FLOOD below)
  dry: 10, //         puddles at most for a dry floor
  lead: 900, //       the stain shows this long before a leak's first drop
  gap: [2400, 1200], // leaks to leaks, dusk → the fifth watch (and never over the cap)
  beat: [500, 400], //  drop to drop within a leak, dusk → the fifth watch
  teach: 2, //        the first leaks come one at a time; then two open together
  three: 0.25, //     from this much of the night, a pair or three, three live at most
  jit: 250, //        the leaks of one pair open this close together
  lines: T,
  art: { beam: 'rain/beam.webp', basin: 'rain/basin.webp' },
  grades: ['dry', 'wet'],
  row: { x: 14, step: 17.4, w: 15, foot: 44 },
};

export const NEED = SHIAO.need;
export const CAP = SHIAO.cap;
export const LIMIT = SHIAO.limit;
export const DRY = SHIAO.dry;
export const LEAD = SHIAO.lead;
export const MISS_MS = 500; //    a tap on a dry spot: the hand is busy this long
export const NOPE_MS = 350; //    a refused tap shakes its spot this long
export const GRACE = 300; //      a tap this soon before a stain shows counts: a pair's second leak opens up to JIT after the first (seen on the phone 2026-10-26: the second basin, tapped at once, was a wasted trip)
/* Puddles that lose the night — re-picked by play 2026-10-19, when the rain went to pairs (Hanli:
   「提高一点难度, 同时放两个盆, 或者快一点」). 60 seeds, one night's puddles, the flood off; a hand lands
   its tap its pace after the stain shows, and ~0.35 s after its last tap (two stains seen together
   are tapped one after the other, not each seen afresh): a person's pace (the bot) 0; a 0.6 s hand
   median 2, max 5 — puddles, never near the line; 1 s median 18, max 21 — 16 of 60 reach 19, tight;
   1.3 s median 27 (60 of 60 reach 19); away 3 s of every 8 median 25 (57); away 5 s of 10 (60). Idle
   reaches 19 at ~11 s. (Before, one leak at a time to a quarter of the night: 0.6 s max 3, 1 s max 18,
   FLOOD 40 — nobody but the idle lost.) */
export const FLOOD = SHIAO.flood;
const CALM = 1500; //             after a flood: the line stands, no drip, then the rain again
const AT = 1500; //               the first leak
export const TEACH = SHIAO.teach;
export const THREE = SHIAO.three;
export const JIT = SHIAO.jit;
const AFTER = 300; //             the leak's last drop → the basin carried off

export const SPOTS = SHIAO.spots;

/* A level as played: the data level over the default, field by field (lines line by line). */
const filled = new WeakMap();
const rowFor = (need) => {
  const step = Math.min(26, 292 / Math.max(1, need)), w = Math.min(22, step * 0.86);
  return { x: 160 - ((need - 1) * step) / 2, step, w, foot: 44 };
};
export function fill(raw) {
  if (!raw || raw === SHIAO || typeof raw !== 'object') return SHIAO;
  if (filled.has(raw)) return filled.get(raw);
  const lines = Object.fromEntries(['zh', 'en'].map((k) => [k, { ...SHIAO.lines[k], ...(raw.lines?.[k] ?? {}) }]));
  const need = raw.need ?? SHIAO.need;
  const L = { ...SHIAO, ...raw, lines, art: { ...SHIAO.art, ...(raw.art ?? {}) }, row: { ...rowFor(need), ...(raw.row ?? {}) },
    spots: raw.spots?.length ? raw.spots : SHIAO.spots, grades: raw.grades?.length === 2 ? raw.grades : SHIAO.grades };
  filled.set(raw, L);
  return L;
}
/** The level this board plays (a state saved before levels plays the default). */
export const levelOf = (s) => fill(s?.level);
/** The how-to text of a level, in `lang`. */
export const howOf = (level, lang = 'zh') => { const h = fill(level).how; return h?.[lang] ?? h?.zh ?? ''; };

const lerp = ([a, b], f) => a + (b - a) * Math.min(1, Math.max(0, f));

/** The night's rain: every leak (spot, from, to, drops). The first TEACH come one at a time; then
    they open in pairs — two stains at once (JIT apart at most), two basins to set — and from THREE of
    the night a pair or three. Never more than two live before THREE, three after; a pair never
    opens on a spot still leaking or one the last leaks just left. */
export function schedule(seed, level = SHIAO) {
  const { spots: SPOTS, cap: CAP, limit: LIMIT, lead: LEAD, gap: GAP, beat: BEAT, teach: TEACH, three: THREE, jit: JIT } = fill(level);
  const rnd = rng(`rain:${seed}`);
  const leaks = [];
  // How many open together, and how many may be live then: one alone while it teaches, then pairs.
  const waveOf = (wave, at) => (wave < TEACH ? [1, 1] : at / LIMIT >= THREE ? [rnd() < 0.5 ? 3 : 2, 3] : [2, 2]);
  let at = AT, last = [], thick = null, thicker = null, [size, cap] = waveOf(0, AT);
  for (let wave = 0; ; ) {
    const beat = Math.round(lerp(BEAT, at / LIMIT));
    if (at + JIT + LEAD + (CAP - 1) * beat >= LIMIT) break;
    const live = leaks.filter((l) => l.to > at).map((l) => l.spot);
    let free = SPOTS.map((_, i) => i).filter((i) => !live.includes(i) && !last.includes(i));
    if (free.length < size) free = SPOTS.map((_, i) => i).filter((i) => !live.includes(i));
    size = Math.min(size, free.length); // a level of few spots: never a leak at no spot
    const opened = Array.from({ length: size }, (_, m) => {
      const spot = free.splice(Math.floor(rnd() * free.length), 1)[0];
      const from = at + (m ? Math.round(rnd() * JIT) : 0);
      const drops = Array.from({ length: CAP }, (_, k) => from + LEAD + k * beat);
      return { spot, from, to: drops.at(-1) + AFTER, drops };
    }).sort((x, y) => x.from - y.from);
    leaks.push(...opened);
    last = opened.map((l) => l.spot);
    if (live.length + size >= 2) thick ??= at;
    if (live.length + size >= 3) thicker ??= at;
    // The next leaks: GAP on, but never over their cap — wait for enough of these to stop.
    let next = Math.max(at + LEAD, Math.round(at + lerp(GAP, at / LIMIT) * (0.85 + rnd() * 0.3)));
    [size, cap] = waveOf(++wave, next);
    const ends = leaks.map((l) => l.to).filter((to) => to > next).sort((x, y) => x - y);
    const over = ends.length + size - cap;
    if (over > 0) next = ends[over - 1];
    at = next;
  }
  const windows = SPOTS.map((_, i) => leaks.filter((l) => l.spot === i).map((l) => [l.from, l.to]));
  const drips = leaks.flatMap((l) => l.drops.map((d) => ({ at: d, spot: l.spot }))).sort((a, b) => a.at - b.at || a.spot - b.spot);
  const ends = leaks.map((l, i) => i).sort((a, b) => leaks[a].to - leaks[b].to);
  return { leaks, windows, drips, ends, thick, thicker };
}

/** Is this spot leaking at `t` (its stain showing, or dripping)? */
export const leakingAt = (sched, spot, t) => sched.windows[spot].some(([from, to]) => t >= from && t < to);
/** The leak at this spot at `t`, if any. */
const leakOf = (sched, spot, t) => sched.leaks.find((l) => l.spot === spot && t >= l.from && t < l.to) ?? null;

/** The data level a deal plays: the one a climbing task names (`deal.lv`, rules/climb.mjs — a practice board's ladder,
    every rung in `levels`), else `levels[0]`. */
export const dealtLevel = (deal) => (deal?.lv != null ? deal?.levels?.find((l) => l.id === deal.lv) : null) ?? deal?.levels?.[0];
/** A new board: the level is the deal's (a data level, kept on the state as `level`), else the default. */
export function newGame(seed, _level = 1, deal = {}) {
  const raw = dealtLevel(deal), L = fill(raw);
  return { seed: String(seed), ...(L === SHIAO ? {} : { level: raw }), sched: schedule(seed, L), t: 0, k: 0, e: 0, live: false, basins: L.spots.map(() => null), caught: 0, puddles: 0, floods: 0, busy: null, note: 'ready', won: false, grade: null };
}
/* A board saved before the 打地鼠 rain (2026-10-16) starts fresh on the new one. */
const fit = (s) => (s.won || s.sched?.leaks ? s : { ...newGame(s.seed, 1, { levels: [s.level] }), live: s.live, note: s.live ? 'go' : 'ready' });

/** Leaks caught: basins carried to the 水缸. */
export const fullCount = (s) => s.caught ?? 0;

/* The grade's line is keyed by its role (dry · wet) whatever the level names the grade. */
const roleOf = (L, grade) => (grade === L.grades[0] ? 'dry' : 'wet');
function finish(s, forced) {
  const L = levelOf(s), role = !forced && !s.floods && s.puddles <= L.dry ? 'dry' : 'wet';
  return { ...s, live: false, won: true, grade: L.grades[role === 'dry' ? 0 : 1], note: forced && fullCount(s) < L.need ? 'short' : role };
}

function tapSpot(s, i) {
  if (!s.live || !Number.isInteger(i) || i < 0 || i >= levelOf(s).spots.length) return null;
  // A tap never goes unanswered (10-16 play-human: a tap while the hand was busy, or on a spot that
  // has its basin, did nothing at all): a refused tap shakes its spot (`nope`, NOPE_MS).
  const nope = { i, at: s.t };
  if (s.busy != null && s.t < s.busy) return { ...s, nope }; // still on the wasted trip
  if (s.basins[i] != null) return { ...s, nope }; // a basin stands there already
  if (!leakingAt(s.sched, i, s.t) && !leakingAt(s.sched, i, s.t + GRACE)) return { ...s, busy: s.t + MISS_MS, note: 'wasted', nope };
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

/** What a step sounded (games/kit/heard.js): a basin set down (hit), a wasted trip (miss), a drop in a basin (drip) or on
    the floor (spill), a basin carried to the 水缸 (catch), the floor a river (flood), the rain coming on harder (thick). */
export function sounds(b, a) {
  if (!b || !a) return [];
  const out = [];
  if (!b.live && a.live) out.push('start');
  if (a.note !== b.note && a.note === 'placed') out.push('hit');
  if ((a.busy ?? 0) > (b.busy ?? 0)) out.push('miss');
  if ((a.floods ?? 0) > (b.floods ?? 0)) return [...out, 'flood'];
  const filled = (s) => (s.basins ?? []).reduce((t, x) => t + (x ?? 0), 0);
  if ((a.caught ?? 0) > (b.caught ?? 0)) out.push('catch');
  else if (filled(a) > filled(b)) out.push('drip');
  if ((a.puddles ?? 0) > (b.puddles ?? 0)) out.push('spill');
  if (a.note !== b.note && /^thick/.test(a.note ?? '')) out.push('thick');
  return out;
}

/* The night lost: the floor a river, every basin back, the same rain again after a breath. */
const flooded = (s) => ({ ...s, t: -CALM, k: 0, e: 0, basins: levelOf(s).spots.map(() => null), caught: 0, puddles: 0, busy: null, floods: (s.floods ?? 0) + 1, note: 'flood' });

/** Lost the night again and again: the page may offer its 「算了，往下走」 (stuck.js). */
export const stuck = (s) => (s.floods ?? 0) >= 3;

export function tick(state, ms) {
  if (!state.live || state.won) return state;
  const prev = fit(state);
  const s = { ...prev, t: prev.t + ms, basins: [...prev.basins] };
  const L = levelOf(s);
  const { drips, leaks, ends, thick, thicker } = s.sched;
  if (thick != null && thick > prev.t && thick <= s.t) s.note = 'thick';
  if (thicker != null && thicker > prev.t && thicker <= s.t) s.note = 'thicker';
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
      if (s.puddles >= L.flood) return flooded(s);
    } else {
      const b = s.basins[l.spot];
      if (b != null) {
        s.basins[l.spot] = null;
        if (b > 0) { s.caught += 1; s.note = 'poured'; }
      }
      s.e += 1;
      if (fullCount(s) >= L.need) return finish(s, false);
    }
  }
  return s.t >= L.limit ? finish(s, true) : s;
}

/* ── The picture (2026-10-14): each spot of the two rooms in ink — the thatch above, a damp
   stain where a leak is coming, a drop falling in time with the leak's own drops, a basin
   filling. A basin that caught every drop rings 满; a drop on the floor is a small ink splash. */
// Painted (2026-10-16, tools/paint-games.py): the wet beam under the thatch and the wooden basin are
// house 水墨淡彩 pieces on the game's paper; the drops, the water and the ink stay the brush's.
// A level's art: paths under worlds/jiuding/art/games/ (the default's are rain/beam.webp, rain/basin.webp).
const ART = (path) => new URL(`../../worlds/jiuding/art/games/${path}`, import.meta.url).href;
const beam = (L, x, w, h = 16) => `<image class="g-rain-beam" href="${ART(L.art.beam)}" x="${n(x)}" y="-3" width="${n(w)}" height="${h}" preserveAspectRatio="none"/>`;
/* The level's ground, under a scene `w`×`h`, when it has one. */
const ground = (L, w, h) => (L.art.ground ? `<image class="g-rain-ground" href="${ART(L.art.ground)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>` : '');
/* A basin standing at (cx, foot), `w` wide; `lvl` 0…1 of water shows in its mouth. */
function basinArt(L, cx, foot, w, lvl, full) {
  // The painting is 273×200; its mouth is the top half. Water rises to the rim: the surface widens.
  const h = w * 0.73, k = Math.min(1, lvl);
  const water = lvl > 0 ? `<ellipse class="g-waterfill${full ? ' is-brim' : ''}" cx="${n(cx)}" cy="${n(foot - h * (0.6 + 0.1 * k))}" rx="${n(w * (0.3 + 0.12 * k))}" ry="${n(h * (0.09 + 0.07 * k))}"/>` : '';
  return `<image class="g-rain-basin-art" href="${ART(L.art.basin)}" x="${n(cx - w / 2)}" y="${n(foot - h)}" width="${n(w)}" height="${n(h)}"/>${water}`;
}

/* Where the falling drop is, 0…1, timed to land on the leak's next drop; null when none is falling. */
function fallOf(leak, t) {
  if (!leak) return null;
  const beat = leak.drops[1] - leak.drops[0];
  if (t < leak.drops[0] - beat || t > leak.drops.at(-1)) return null;
  if (still()) return 0.4;
  return ((t - (leak.drops[0] - beat)) % beat) / beat;
}

function spotScene(s, i, L) {
  const b = s.basins[i], leak = s.live ? leakOf(s.sched, i, s.t) : null, CAP = L.cap;
  const k = fallOf(leak, s.t);
  const thatch = beam(L, -((i * 53) % 150), 260);
  const drop = k != null ? `<path class="g-drop" transform="translate(45 ${n(10 + k * (b == null ? 52 : 30))})" d="M0 -5 C2 -1 3 1 3 2.5 A3 3 0 0 1 -3 2.5 C-3 1 -2 -1 0 -5Z"/>` : '';
  const land = k != null && k > 0.82 ? (b == null ? splash(45, 62, (k - 0.82) * 2400, { r: 6 }) : `<ellipse class="g-ripple" cx="45" cy="42" rx="${n(6 + (k - 0.82) * 60)}" ry="2"/>`) : '';
  const basin = b == null ? '' : `<g class="g-rain-basin${b >= CAP ? ' is-full' : ''}">${basinArt(L, 45, 68, 52, b / CAP, b >= CAP)}`
    + `${b >= CAP ? '<text class="g-fullmark" x="84" y="30" text-anchor="end">满</text>' : ''}</g>`;
  const stain = s.t < 0 ? '<ellipse class="g-stain" cx="45" cy="63" rx="40" ry="5"/>' // the flood, while 娘's line stands
    : b == null && leak ? '<ellipse class="g-stain" cx="45" cy="63" rx="13" ry="3"/>' : '';
  return scene(90, 70, ground(L, 90, 70) + thatch + stain + basin + drop + land, 'g-painted');
}
function spotHtml(s, i, t, lang, L) {
  const b = s.basins[i], drip = s.live && leakingAt(s.sched, i, s.t);
  const nope = s.nope?.i === i && s.t >= s.nope.at && s.t - s.nope.at < NOPE_MS;
  return `<button type="button" class="g-rain-spot${drip ? ' is-drip' : ''}${b == null ? '' : ' has-basin'}${b != null && b >= L.cap ? ' is-full' : ''}${nope ? ' is-nope' : ''}" data-g="spot" data-i="${i}">`
    + `${spotScene(s, i, L)}<span class="g-rain-name">${L.spots[i][lang] ?? L.spots[i].zh}</span>`
    + `${drip ? `<span class="g-sr">${t.drip}</span>` : ''}</button>`;
}

/* The floor's count: wet past the level's dry, close to the flood in its last five. */
const floorMark = (L, p) => (p >= L.flood - 5 ? 'is-wet is-near' : p > L.dry ? 'is-wet' : '');

const bowls = (L, full) => `<div class="g-rain-pips" aria-hidden="true">${Array.from({ length: L.need }, (_, i) => `<i class="${i < full ? 'is-on' : ''}"></i>`).join('')}</div>`;

export function html(state, lang = 'zh') {
  const L = levelOf(state);
  const t = L.lines[lang] || L.lines.zh;
  const full = fullCount(state);
  if (state.won) {
    // The level's catchers in a row by the wall, full or not, and the floor as it was left.
    const { x, step, w, foot } = L.row;
    const row = Array.from({ length: L.need }, (_, i) => basinArt(L, x + i * step, foot, w, i < full ? 1 : 0, i < full)).join('');
    const stains = roleOf(L, state.grade) === 'wet' ? [40, 120, 210, 280].map((x, i) => `<ellipse class="g-stain" cx="${x}" cy="${48 + (i % 2) * 3}" rx="${16 + i * 3}" ry="3.5"/>`).join('') : stroke(110, 50, 100, 400);
    return `<div class="g-rain g-ink is-won">${scene(320, 58, ground(L, 320, 58) + row + stains, 'g-painted')}<p class="g-line-say">${t[state.note] ?? t[roleOf(L, state.grade)]}</p></div>`;
  }
  if (!state.live) return `<div class="g-rain g-ink">${scene(320, 90, ground(L, 320, 90) + beam(L, -10, 340, 26) + [40, 95, 160, 220, 280].map((x, i) => `<path class="g-drop" transform="translate(${x} ${40 + (i % 3) * 12})" d="M0 -5 C2 -1 3 1 3 2.5 A3 3 0 0 1 -3 2.5 C-3 1 -2 -1 0 -5Z"/>`).join('') + basinArt(L, 95, 88, 56, 0, false) + basinArt(L, 225, 88, 56, 0.3, false), 'g-painted')}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const s = fit(state);
  const spots = L.spots.map((_, i) => spotHtml(s, i, t, lang, L)).join('');
  return `<div class="g-rain g-ink">`
    + `<div class="g-rain-head g-head"><span>${t.full} <b>${full}</b> / ${L.need}</span><span class="${floorMark(L, s.puddles)}">${t.floor} <b>${s.puddles}</b> / ${L.flood}</span></div>`
    + bowls(L, full)
    + `<div class="g-rain-house"${L.cols ? ` style="--rain-cols:${Number(L.cols)}"` : ''}>${spots}</div>`
    + `<p class="g-line-say">${t[s.note] ?? ''}</p></div>`;
}

/* ── Levels: the default, then the games.json rows with id `rain` (their `levels`), as qimai's. ── */
/** Every level the kit knows: the default first, then the registry's rows of this kit, each with its row's name. */
export function ladderOf(registry) {
  const rows = (registry?.games ?? []).filter((g) => g.id === meta.id).flatMap((g) => (g.levels ?? []).map((l) => ({ ...(g.name ? { name: g.name } : {}), ...l })));
  return [SHIAO, ...rows.filter((l) => l.id !== SHIAO.id)];
}
/** The level a mount plays: `data.levels[0]`, else the level named `data.level`, else the default.
    The registry is fetched only for a level the kit doesn't hold (the phone's pack has no games.json). */
export async function levelFor(opts = {}) {
  if (opts.data?.levels?.length) return dealtLevel(opts.data);
  const id = opts.data?.level;
  if (!id || id === SHIAO.id) return SHIAO;
  try {
    const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
    return ladderOf(await res.json()).find((l) => l.id === id) ?? SHIAO;
  } catch { return SHIAO; }
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export async function mount(container, opts = {}) {
  const level = await levelFor(opts);
  return mountPure(self)(container, { ...opts, data: { ...(opts.data ?? {}), levels: [level] } });
}
