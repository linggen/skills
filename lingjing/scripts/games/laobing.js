// 烙饼 · 一鏊子 — a cooking-timer game (Hanli, 2026-10-16: 「按你说的改」 — the old one-bread 烙饼 had
// no tension; this is the proven plate-spinning kind, Cooking Fever / Papa's). A big 鏊子 with two
// flatbreads, then three, then four, each browning at its own pace. Tap a bread when its down side
// has gone golden: it turns. Tap it again when the second side is golden: it comes off onto 娘's
// plate. Too soon it is raw, too late it scorches, and one left far too long 娘 throws out herself.
// The stove's mouth takes a stick of wood (three a round): the fire roars a while and everything
// cooks faster — the quota sooner, the golden moment shorter. New dough lands on an empty spot.
// A round is ROUND_MS; QUOTA golden breads win it, graded by golden against scorched and raw; short
// of the quota, 娘 says how many and the next round is one tap away. One of the 饭桶's daily games
// (fantong.json `puzzle.games`), and alone in the 游戏厅 / try page.
// Pure module: newGame / act / tick / html / stuck (mount.js runs it).
import { btn, n, scene, skipped, still } from './ink.js';
import { mountPure } from './mount.js';
import { hash } from './seeded.js';
import * as self from './laobing.js';

export const meta = {
  id: 'laobing',
  name: { zh: '烙饼 · 一鏊子', en: 'Flatbreads · A whole griddle' },
  how: {
    zh: '饼底黄了点一下翻面，两面黄了再点一下起锅。早了生，晚了焦。灶口添柴火旺，烙得快也容易焦。',
    en: 'Tap a bread when its underside is golden to turn it; tap again when both sides are golden to take it off. Too soon is raw, too late burns. Wood in the stove: faster, and quicker to burn.',
  },
};

/* ── The numbers (tuned by hand on the live page and by tools/board-bots policies; doc/games.md) ── */
export const ROUND_MS = 40000;
export const QUOTA = 8; //          golden breads 娘 wants
export const SIDE_MS = 4200; //      a side, at rate 1 and an ordinary fire, from dough to golden (d = GOLD)
export const GOLD = 1; //           golden from here…
export const BURN = 1.5; //         …to here; past it the side is scorched
export const CHAR = 2.3; //         so far gone 娘 takes it off herself (scorched)
export const WHITE = 0.35; //       a tap on a side this white is not taken (「还白着呢」): a slip of the finger forgiven
export const HOT = 1.7; //          the fire's pace with wood in it…
export const HOT_MS = 6000; //      …for this long a stick (sticks add up)
export const WOOD = 3; //           sticks a round
export const RAMP = [11000, 22000]; // a third spot from here, a fourth from here
export const DOUGH_MS = 700; //     an empty spot gets new dough after this
export const LAST_DOUGH = 5000; //  no new dough in the round's last seconds (it could not be done)
export const MAX_MISSES = 3; //     rounds short of the quota before 「直接喂」 is offered
export const RATES = [0.8, 1.25]; // each bread's own pace, between these

const SPOTS = [[118, 84], [242, 84], [118, 150], [242, 150]];
const W = 360, H = 340, BW = 106, BH = 60;
const ART = (f) => new URL(`../../worlds/jiuding/art/games/laobing/${f}.webp`, import.meta.url).href;
const PAINT = { griddle: ART('griddle'), stove: ART('stove'), fire: ART('fire'), blaze: ART('blaze'), raw: ART('raw'), gold: ART('gold'), burnt: ART('burnt'), plate: ART('plate'), wood: ART('wood') };

const T = {
  zh: {
    left: '剩', sec: '息', plate: '盘里', retry: '再烙一锅', skip: '直接喂', skipAlone: '让娘来',
    say: '娘把面团拍上鏊子：「底下黄了就翻，两面黄了就起。烙{quota}张。」',
    sayItem: '饭桶要闻着饼香才肯吃{name}。娘把面团拍上鏊子：「烙{quota}张。」',
    white: '「还白着呢。」', turn: '「翻。」', gold: '「好。」', raw: '「还生着。」', scorched: '「焦了。」', char: '娘一把撤下：「糊透了。」',
    fire: '添了一根柴，火呼地旺起来。', nowood: '柴添完了。',
    short: '娘看看盘子：「还差{left}张。再来一锅。」', idle: '饼都糊在鏊子上了。娘：「再来一锅，看着点。」',
    stuck: '实在烙不够，就直接喂吧。',
    golden: '娘数了数，一盘黄澄澄的：「这手艺，赶上娘了。」', good: '「够数了。焦了的那几张，娘吃。」', plain: '「够了够了——生的回锅再烙。」',
    skipped: '娘接过铲子：「歇着吧。」',
  },
  en: {
    left: '', sec: 's', plate: 'Plate', retry: 'Another batch', skip: 'Just feed it', skipAlone: 'Let Mother do it',
    say: 'Mother slaps the dough onto the griddle: "Turn it when the bottom\'s golden, take it off when both sides are. {quota} of them."',
    sayItem: 'The Rice Bucket wants the smell of bread before it eats the {name}. Mother slaps the dough down: "{quota} of them."',
    white: '"Still white."', turn: '"Turn."', gold: '"Good."', raw: '"Still raw."', scorched: '"Burnt."', char: 'Mother snatches it off: "Burnt black."',
    fire: 'A stick of wood in, and the fire roars up.', nowood: 'No wood left.',
    short: 'Mother looks at the plate: "{left} short. Another batch."', idle: 'The breads have burnt to the griddle. Mother: "Another batch — watch them."',
    stuck: 'If the plate will not fill, feed it anyway.',
    golden: 'Mother counts them, a plate of gold: "Hands as good as mine."', good: '"That\'s the count. The burnt ones are mine."', plain: '"Enough, enough — the raw ones go back on."',
    skipped: 'Mother takes the slice from you: "Go and rest."',
  },
};
const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const esc = (v) => String(v).replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/* ── The rules ── */
export const rateOf = (seed, k) => RATES[0] + (RATES[1] - RATES[0]) * ((hash(`${seed}|${k}`) % 1000) / 999);
export const spotsAt = (t) => (t < RAMP[0] ? 2 : t < RAMP[1] ? 3 : 4);
export const heatOf = (s) => (s.t < s.hotUntil ? HOT : 1);
/** How a bread comes off: golden both sides, else scorched (any side past BURN), else raw. */
export const doneOf = (b) => (b.sides.some((d) => d >= BURN) ? 'scorched' : b.sides.some((d) => d < GOLD) ? 'raw' : 'gold');
export const countOf = (s, k) => s.plate.filter((x) => x === k).length;

/** The grade of a round that met the quota: stars from the golden over the quota and the bad ones. */
export function gradeOf(plate) {
  const gold = plate.filter((x) => x === 'gold').length, bad = plate.length - gold;
  if (gold < QUOTA) return null;
  const stars = 1 + (gold >= QUOTA + 2 ? 1 : 0) + (bad <= 1 ? 1 : 0);
  return { stars, grade: ['plain', 'good', 'golden'][stars - 1] };
}

function round(s) {
  return { ...s, phase: 'play', live: true, t: 0, hotUntil: 0, wood: WOOD, plate: [], fx: [], note: 'say', noteAt: 0,
    spots: SPOTS.map((_, i) => ({ b: null, free: i < 2 ? DOUGH_MS - 300 : null })) };
}

export function newGame(seed, level = 1, data = {}) {
  return round({ seed: String(seed), item: data.item ?? null, misses: 0, made: 0, won: false, grade: null, stars: null, still: Boolean(data.still), max_misses: data.max_misses ?? MAX_MISSES });
}

export const stuck = (s) => !s.won && s.misses >= s.max_misses;
const say = (s, note) => ({ ...s, note, noteAt: s.t });
const fx = (s, kind, i) => [...s.fx.filter((f) => s.t - f.at < 900), { kind, i, at: s.t }];

function lay(s) {
  const n0 = spotsAt(s.t);
  let made = s.made;
  const spots = s.spots.map((sp, i) => {
    if (i >= n0 || sp.b) return sp;
    if (sp.free == null) return { ...sp, free: s.t };
    if (s.t - sp.free < DOUGH_MS || s.t > ROUND_MS - LAST_DOUGH) return sp;
    return { b: { k: made, rate: rateOf(s.seed, made++), sides: [0, 0], down: 0, flipped: false, at: s.t }, free: null };
  });
  return { ...s, spots, made };
}

function cook(s, ms) {
  const heat = heatOf(s);
  let out = s;
  const spots = s.spots.map((sp, i) => {
    if (!sp.b) return sp;
    const b = sp.b, sides = [...b.sides];
    sides[b.down] += (b.rate * heat * ms) / SIDE_MS;
    if (sides[b.down] < CHAR) return { ...sp, b: { ...b, sides } };
    out = { ...out, plate: [...out.plate, 'scorched'], fx: fx(out, 'char', i), note: 'char', noteAt: out.t };
    return { b: null, free: s.t };
  });
  return { ...out, spots };
}

function end(s) {
  const g = gradeOf(s.plate);
  if (g) return { ...s, phase: 'end', live: false, won: true, grade: g.grade, stars: g.stars, note: g.grade };
  const left = QUOTA - countOf(s, 'gold');
  return { ...s, phase: 'over', live: false, misses: s.misses + 1, note: s.plate.length && countOf(s, 'gold') ? 'short' : 'idle', left };
}

export function tick(state, ms) {
  if (!state?.live || state.won || state.phase !== 'play' || ms <= 0) return state;
  let s = { ...state, t: state.t + ms };
  s = lay(cook(s, ms));
  return s.t >= ROUND_MS ? end({ ...s, t: ROUND_MS }) : s;
}

const VERBS = {
  bread: (s, d) => {
    const i = Number(d.i), b = s.spots[i]?.b;
    if (s.phase !== 'play' || !b) return null;
    if (b.sides[b.down] < WHITE) return say(s, 'white');
    if (!b.flipped) {
      const spots = s.spots.map((sp, j) => (j === i ? { ...sp, b: { ...b, down: 1, flipped: true, turnAt: s.t } } : sp));
      return { ...say(s, 'turn'), spots, fx: fx(s, 'turn', i) };
    }
    const how = doneOf(b);
    const spots = s.spots.map((sp, j) => (j === i ? { b: null, free: s.t } : sp));
    return { ...say(s, how), spots, plate: [...s.plate, how], fx: fx(s, `off-${how}`, i), off: { i, how, at: s.t, plateN: s.plate.length } };
  },
  fire: (s) => {
    if (s.phase !== 'play') return null;
    if (s.wood <= 0) return say(s, 'nowood');
    return { ...say(s, 'fire'), wood: s.wood - 1, hotUntil: Math.max(s.t, s.hotUntil) + HOT_MS, fireAt: s.t };
  },
  retry: (s) => round(s),
  skip: (s) => (stuck(s) ? skipped({ ...s, phase: 'end', stars: 0 }) : null),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── The picture: the stove's front with its fire, the big 鏊子 over it, each bread painted in its
   three states (raw · golden · scorched) crossfaded by its doneness — the up side on top, the down
   side as a lip beneath it — a ring round it that fills as the down side cooks (its golden stretch
   marked), steam when it is ready and smoke when it burns, 娘's plate, the wood by the stove mouth. */
function looks(d) {
  if (d < GOLD) return { raw: 1, gold: clamp((d - WHITE) / (GOLD - WHITE)) ** 1.4, burnt: 0 };
  return { raw: 0, gold: 1, burnt: d < BURN ? 0.12 * ((d - GOLD) / (BURN - GOLD)) : clamp(0.35 + 0.65 * (d - BURN) / (CHAR - BURN)) };
}
function painted(d, x, y, w, h, cls = '') {
  const L = looks(d);
  const img = (k) => (L[k] > 0.01 ? `<image href="${PAINT[k]}" x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none"${L[k] < 0.99 ? ` opacity="${n(L[k], 2)}"` : ''}/>` : '');
  return `<g class="g-lb-bread${cls}">${img('raw')}${img('gold')}${img('burnt')}</g>`;
}
function ring(d, x, y) {
  const rx = BW / 2 + 7, ry = BH / 2 + 6, f = clamp(d / CHAR) * 100;
  const zone = `<ellipse class="g-lb-zone" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" pathLength="100" stroke-dasharray="0 ${n((GOLD / CHAR) * 100)} ${n(((BURN - GOLD) / CHAR) * 100)} 100" transform="rotate(-90 ${x} ${y})"/>`;
  const cls = d < GOLD ? '' : d < BURN ? ' is-gold' : ' is-burn';
  return `${zone}<ellipse class="g-lb-ring${cls}" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" pathLength="100" stroke-dasharray="${n(f)} 100" transform="rotate(-90 ${x} ${y})"/>`;
}
function wisps(d, x, y, t, calm) {
  if (d < GOLD * 0.85) return '';
  const burn = d >= BURN, sway = calm ? 0 : Math.sin(t / 260) * 3;
  return [-14, 4, 20].slice(0, burn ? 3 : 2).map((dx, k) => {
    const rise = 16 + ((t / (burn ? 9 : 14) + k * 11) % 18);
    return `<path class="g-lb-${burn ? 'smoke' : 'steam'}" d="M${n(x + dx)} ${n(y - 10)} q${n(-6 + sway)} ${n(-rise / 2)} 0 ${n(-rise)} q${n(6 + sway)} -8 0 -14" opacity="${n(burn ? 0.75 : 0.55, 2)}"/>`;
  }).join('');
}
function breadAt(s, sp, i, calm) {
  const [x, y] = SPOTS[i], b = sp.b;
  const land = calm ? 1 : clamp((s.t - b.at) / 260);
  const turn = b.turnAt != null && !calm ? clamp((s.t - b.turnAt) / 240) : 1;
  const squash = turn < 1 ? Math.abs(Math.cos(turn * Math.PI)) * 0.9 + 0.1 : 1;
  const up = b.sides[1 - b.down], down = b.sides[b.down];
  const lift = turn < 1 ? -Math.sin(turn * Math.PI) * 18 : 0;
  const sc = 0.6 + 0.4 * land;
  const body = `<g transform="translate(${x} ${n(y + lift)}) scale(${n(sc, 2)} ${n(sc * squash, 2)}) translate(${-x} ${-y})">`
    + painted(down, x, y + 6, BW + 2, BH, ' is-lip') + painted(up, x, y, BW, BH) + '</g>';
  return ring(down, x, y) + body + wisps(down, x, y, s.t, calm)
    + `<ellipse class="g-lb-hit" cx="${x}" cy="${y}" rx="${BW / 2 + 10}" ry="${BH / 2 + 12}" data-g="bread" data-i="${i}"/>`;
}
const PLATE = [52, 300];
function plateAt(s, calm) {
  const [px, py] = PLATE, shown = s.plate.slice(-6);
  const stack = shown.map((how, k) => painted(how === 'gold' ? 1.2 : how === 'raw' ? 0.5 : 2, px, py - 4 - k * 4, 62, 30)).join('');
  // the last one off flies from its spot to the plate
  const o = s.off, fly = o && !calm && s.t - o.at < 320 ? (() => {
    const k = (s.t - o.at) / 320, [x0, y0] = SPOTS[o.i], x = x0 + (px - x0) * k, y = y0 + (py - y0) * k - Math.sin(k * Math.PI) * 40;
    return painted(o.how === 'gold' ? 1.2 : o.how === 'raw' ? 0.5 : 2, x, y, BW * (1 - 0.4 * k), BH * (1 - 0.4 * k));
  })() : '';
  return `<image href="${PAINT.plate}" x="${px - 48}" y="${py - 26}" width="96" height="52" preserveAspectRatio="none"/>${stack}${fly}`;
}
function stoveAt(s, calm) {
  const hot = s.t < s.hotUntil && s.phase === 'play', t = calm ? 0 : s.t;
  const flick = 1 + Math.sin(t / 110) * 0.05 + Math.sin(t / 47) * 0.03;
  const [fx, fy] = [180, 300], fw = hot ? 96 : 66, fh = hot ? 82 : 52;
  const fire = s.phase === 'play' || s.phase === 'end'
    ? `<g transform="translate(${fx} ${fy}) scale(${n(flick, 3)} ${n(flick, 3)})"><image href="${hot ? PAINT.blaze : PAINT.fire}" x="${-fw / 2}" y="${-fh + 14}" width="${fw}" height="${fh}"/></g>` : '';
  const wood = Array.from({ length: s.wood }, (_, k) => `<image href="${PAINT.wood}" x="${270 + k * 10}" y="${292 - k * 14}" width="72" height="38"/>`).join('');
  const ready = s.wood > 0 && s.phase === 'play' ? ' is-ready' : '';
  return `<image href="${PAINT.stove}" x="70" y="226" width="220" height="114" preserveAspectRatio="none"/>${fire}${wood}`
    + `<rect class="g-lb-mouth${ready}" x="140" y="252" width="200" height="88" rx="16" data-g="fire"/>`;
}
function playScene(s) {
  const calm = s.still || still();
  const griddle = `<image href="${PAINT.griddle}" x="22" y="8" width="316" height="226" preserveAspectRatio="none"/>`;
  const breads = s.spots.map((sp, i) => (sp.b ? breadAt(s, sp, i, calm) : '')).join('');
  const chars = s.fx.filter((f) => f.kind === 'char' && s.t - f.at < 700).map((f) => {
    const [x, y] = SPOTS[f.i], k = (s.t - f.at) / 700;
    return `<g opacity="${n(1 - k, 2)}">${painted(CHAR, x, y - k * 30, BW * (1 - 0.3 * k), BH * (1 - 0.3 * k))}</g>`;
  }).join('');
  return scene(W, H, stoveAt(s, calm) + griddle + breads + chars + plateAt(s, calm), 'g-lb-scene g-painted');
}

function lineOf(s, t) {
  const fresh = s.t - (s.noteAt ?? 0) < 1400;
  if (s.phase === 'over') return stuck(s) ? `${fill(t[s.note], { left: s.left })} ${t.stuck}` : fill(t[s.note], { left: s.left });
  if (s.won) return t[s.note] ?? '';
  if (s.note !== 'say' && fresh) return t[s.note] ?? '';
  return s.item ? fill(t.sayItem, { name: s.item.name ?? '', quota: QUOTA }) : fill(t.say, { quota: QUOTA });
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh, s = state;
  const gold = countOf(s, 'gold'), bad = s.plate.length - gold, left = Math.max(0, Math.ceil((ROUND_MS - s.t) / 1000));
  const marks = `<span class="g-lb-marks">${t.plate} <b>${gold}</b> / ${QUOTA}${bad ? ` <i>· ${bad}</i>` : ''}</span>`;
  const clock = `<span class="g-lb-clock${left <= 10 && s.phase === 'play' ? ' is-late' : ''}">${t.left}<b>${left}</b>${t.sec}</span>`;
  const head = `<div class="g-head g-lb-head">${marks}${s.won ? '' : clock}</div>`;
  const hot = s.t < s.hotUntil && s.phase === 'play' ? ' is-hot' : '';
  const row = s.won ? '' : stuck(s)
    ? `<div class="g-pair">${btn(s.item ? t.skip : t.skipAlone, 'data-g="skip"', 'main')}${btn(t.retry, 'data-g="retry"', 'soft')}</div>`
    : `<div class="g-bread-row">${btn(t.retry, 'data-g="retry"', s.phase === 'over' ? 'soft' : 'quiet')}</div>`;
  return `<div class="g-lb g-ink${s.won ? ' is-won' : ''}${s.phase === 'over' ? ' is-over' : ''}${hot}">${head}${playScene(s)}`
    + `<p class="g-line-say" aria-live="polite">${esc(lineOf(s, t))}</p>${row}</div>`;
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or the 饭桶. */
export const mount = (container, opts = {}) => mountPure(self)(container, { ...opts, data: { ...(opts.data ?? {}), ...(opts.reducedMotion ? { still: true } : {}) } });
