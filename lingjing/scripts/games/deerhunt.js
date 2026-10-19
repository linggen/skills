// 射鹿 · 等风 — a hunting-aim game (Deer Hunter style; Hanli 2026-10-19: 「愤怒小鸟的类型不好玩. 太简单,
// 没有花样」). The tension is the wait, the book's 先看风，后看鹿 and 「往左偏半寸」: a static target with an
// arc hint was darts, and a miss's trail taught the next shot. Here nothing is taught by a trail:
//   - press anywhere on the scene and hold: the bow draws (longer is stronger); slide to move the
//     sight (relative, so the finger never covers it — at 390 too); full, the sight starts to sway,
//     and the sway grows the longer he holds;
//   - hold still at full draw and he holds his breath (屏气): the sway nearly stops for BREATH_MS,
//     then comes back worse — one breath a draw; let go to loose; let go off the scene to ease off;
//   - the wind comes in gusts (the red rag, the leaves, the reeds — deerarc's pictures); the arrow
//     drifts with the wind at release; in a lull (风歇) it flies true; the miss line names the side;
//   - the deer grazes (head down), lifts its head (wary), sometimes walks a few steps (lead it).
//     Loosed while its head is up, or an arrow landing near it, it bolts — and comes back.
// One arrow an approach: a quiet miss leaves the deer (another try); a spook resets to waiting.
// Stars: the heart, the first arrow, calm (no spook) — the grade by stars as deerarc's (clean ·
// steady · rough), so 00-deer's deer-wind takes it as it is. The world steps only in `tick` at a
// fixed 1/60 s and every random thing is seeded, so a 10 ms and a 50 ms clock play alike.
// Pure module (newGame / act / tick / html / stuck) and mount(); the pictures are deerarc's.
import { btn, n, scene, splash, still } from './ink.js';
import { mountPure } from './mount.js';
import {
  BOW, DEER_S, H, STAG, W, arrowShape, bankPicture, bowPicture, deerPicture, groundAt, inkHit, presentArt, rowOf, settle, starsPicture, windPicture,
} from './deerarc.js';

export const meta = {
  id: 'deerhunt',
  name: { zh: '射鹿 · 等风', en: 'The stag · Wait for the wind' },
  how: {
    zh: '按住拉弓，滑动瞄准；拉满停住是屏气。风歇、鹿低头，再松手。',
    en: 'Hold to draw, slide to aim; hold still to steady. Loose in a lull, head down.',
  },
};

export const STEP_MS = 1000 / 60;
export const FULL_MS = 1500; //    press → full draw
export const MIN_P = 0.3; //       let go before this: the bow was never drawn
export const STILL_MS = 400; //    still this long at full draw: he holds his breath
export const BREATH_MS = 2600; //  the breath steadies this long, then the arms shake worse
export const DRIFT = 105; //        a wind of 1 carries the arrow this far over the stream (300 units)
const SHORT = 46, DROP = 64; //    a half-drawn arrow falls short and low
const SWAY0 = 3, SWAY_GROW = 9, SWAY_MAX = 46, GASP = 1.5, GASP_GROW = 16, CALM = 0.12;
const HEART_R = 9, NEAR = 1.55; // the heart (deer units); a miss inside NEAR × the body's reach is loud
const HIT_MS = 1700, CLEAR_MS = 1800, SLOW = 3, SLOW_HIT_MS = 500, BOLT_MS = 1000, RAMP = 320;
export const STUCK_SPOOKS = 4, STUCK_SHOTS = 8;

const T = {
  zh: {
    level: '第 {i} / {n} 处', arrow: '第 {k} 箭', wind: ['风歇', '微风', '有风', '大风'], face: ' · 迎面', back: ' · 顺风',
    draw: '拉……', full: '拉满了 · 停住，屏气', breath: '屏住气……', gasp: '气尽了，手在抖——松手，或滑出画面收弓',
    nodraw: '弓没拉开。', ease: '收了弓。等一等。',
    clean: '正中心口。一团墨花绽开——鹿倒在溪边的浅滩上。', body: '中了，偏了些，没中心口。',
    windR: '一阵风，把箭推到右边去了。往左偏半寸——等风歇。', windL: '风从背后推，箭飘到左边去了。往右偏半寸——等风歇。',
    missL: '偏左了。', missR: '偏右了。', missHi: '高了。', missLo: '低了，扎进了草里。', weak: '没拉满，箭软软地落进了草里。',
    near: '箭落在它跟前——它一惊，跳进了芦苇。等它回来。', graze: '擦着鹿角过去了。它一惊，跑了。等它回来。',
    jumped: '它正抬着头，弦一响，它先跳开了。等它低头再放。', far: '它抬起头，听了一会儿。',
    away: '溪边空了。等它回来……', back: '它回来了，还在张望。',
    next: '下一处', again: '再来这一处', clear: '这一处：',
    end: '那头鹿，倒下了。', stars: '共得 {s} 星。', empty: '溪边没有鹿。',
  },
  en: {
    level: 'Spot {i} of {n}', arrow: 'Arrow {k}', wind: ['Lull', 'A breath', 'Wind', 'Strong wind'], face: ' · in your face', back: ' · at your back',
    draw: 'Drawing…', full: 'Full · hold still to steady', breath: 'Holding your breath…', gasp: 'Out of breath, arms shaking — loose, or slide off to ease',
    nodraw: 'The bow was never drawn.', ease: 'You ease the bow. Wait.',
    clean: 'Through the heart. A bloom of ink — the stag goes down in the shallows.', body: 'A hit, but off the heart.',
    windR: 'A gust pushed it right. Half an inch left — and wait for the lull.', windL: 'The wind at your back carried it left. Half an inch right — wait for the lull.',
    missL: 'Wide left.', missR: 'Wide right.', missHi: 'High.', missLo: 'Low — into the grass.', weak: 'Not drawn full: it drops limp into the grass.',
    near: 'It lands at its feet — the stag bolts into the reeds. Wait for it to come back.', graze: 'It skims the antlers. The stag bolts. Wait for it.',
    jumped: 'Its head was up: at the twang it leapt first. Loose when it drinks.', far: 'It lifts its head and listens a while.',
    away: 'The stream is empty. Wait for it…', back: 'It is back, still looking round.',
    next: 'Next spot', again: 'This spot again', clear: 'This spot: ',
    end: 'The stag is down.', stars: '{s} stars in all.', empty: 'No deer by the stream.',
  },
};

/* ── Seeded randomness: the wind's timetable and the deer's whims ─────────────────────────────── */

function rng(key) {
  let a = 2166136261;
  for (const ch of String(key)) a = Math.imul(a ^ ch.codePointAt(0), 16777619) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const between = (r, [a, b]) => a + (b - a) * r();
const ease = (k) => { const x = Math.max(0, Math.min(1, k)); return x * x * (3 - 2 * x); };

/* The wind: lulls and gusts, one after another (games.json level `wind`: lull, gust ms ranges,
   strength, dirs — +1 in his face, −1 at his back; `first` which comes first). A gust's strength
   eases in over WIND_RAMP. Answers the wind at `ms` — the same for the same seed, any clock. */
const WIND_RAMP = 600;
const TABLES = new Map();
function windTable(level, seed) {
  const key = `${seed}|${level.id}|${JSON.stringify(level.wind)}`;
  if (!TABLES.has(key)) {
    if (TABLES.size > 64) TABLES.clear();
    TABLES.set(key, { r: rng(`${key}|wind`), segs: [], end: 0 });
  }
  return TABLES.get(key);
}
export function windAt(level, seed, ms) {
  const w = level.wind;
  if (!w) return 0;
  const tab = windTable(level, seed);
  while (tab.end <= ms) {
    const gust = tab.segs.length % 2 === (w.first === 'lull' ? 1 : 0);
    const len = between(tab.r, gust ? w.gust : w.lull);
    const dirs = w.dirs ?? [1], dir = dirs[Math.floor(tab.r() * dirs.length) % dirs.length];
    const v = gust ? dir * between(tab.r, w.strength) : (w.calm ?? 0.04) * dir;
    tab.segs.push({ from: tab.end, to: tab.end + len, v, gust });
    tab.end += len;
  }
  let i = tab.segs.findIndex((g) => ms < g.to);
  if (i < 0) i = tab.segs.length - 1;
  const seg = tab.segs[i], prev = tab.segs[i - 1]?.v ?? 0;
  return prev + (seg.v - prev) * ease((ms - seg.from) / WIND_RAMP);
}
/** In a gust now (for the bot and the line): the wind's strength over half a lull's. */
export const gusting = (level, seed, ms) => Math.abs(windAt(level, seed, ms)) > 0.15;

/* ── The deer: grazing, wary, walking, bolting, away, coming back ─────────────────────────────── */

const DEER = { graze: [2600, 5000], wary: [900, 1700], walk: 0, speed: 34, range: [90, 210], back: [3000, 4500] };
const deerSpec = (level) => ({ ...DEER, ...(level.deer ?? {}) });

function freshDeer(level) {
  const d = level.deer ?? {};
  return { mode: 'graze', x: d.x ?? 150, face: d.face ?? -1, lift: 0, until: d.first ?? 3600, to: null, n: 0, gone: 0 };
}

/** What comes after `mode` ends, at `now`: the next mode, seeded by the deer's count of moods. */
function nextMood(d, level, seed, now) {
  const spec = deerSpec(level), r = rng(`${seed}|${level.id}|deer|${d.n}`), k = d.n + 1;
  if (d.mode === 'bolt') return { ...d, mode: 'away', until: now + between(r, spec.back), n: k };
  if (d.mode === 'away') {
    const to = between(r, spec.range);
    return { ...d, mode: 'back', x: -40, to, face: 1, lift: 1, gone: 0, until: Infinity, n: k };
  }
  if (d.mode === 'graze' && r() < spec.walk) {
    let to = between(r, spec.range);
    if (Math.abs(to - d.x) < 50) to = d.x + (d.x < (spec.range[0] + spec.range[1]) / 2 ? 70 : -70);
    return { ...d, mode: 'walk', to, face: Math.sign(to - d.x) || d.face, until: Infinity, n: k };
  }
  if (d.mode === 'graze') return { ...d, mode: 'wary', until: now + between(r, spec.wary), n: k };
  return { ...d, mode: 'graze', face: level.deer?.face ?? d.face, until: now + between(r, spec.graze), n: k };
}

/** One step of the deer (dt ms, `now` the level's clock after it). */
export function stepDeer(d, level, seed, dt, now) {
  const spec = deerSpec(level);
  let x = d.x, mode = d.mode, arrived = false;
  if (mode === 'walk' || mode === 'back') {
    const v = (mode === 'back' ? spec.speed * 1.6 : spec.speed) * (dt / 1000), left = d.to - x;
    if (Math.abs(left) <= v) { x = d.to; arrived = true; } else x += Math.sign(left) * v;
  }
  const want = mode === 'wary' || mode === 'back' ? 1 : 0;
  const lift = d.lift + Math.sign(want - d.lift) * Math.min(Math.abs(want - d.lift), dt / RAMP);
  const gone = mode === 'bolt' ? Math.min(1.4, d.gone + dt / 700) : d.gone;
  let next = { ...d, x, lift, gone };
  // A walk or a return ends where it was going: the one that came back looks round a moment first.
  if (arrived) next = mode === 'back' ? { ...next, mode: 'wary', face: level.deer?.face ?? -1, until: now + 900, n: d.n + 1 } : nextMood({ ...next, mode: 'walk' }, level, seed, now);
  if (now >= next.until) next = nextMood(next, level, seed, now);
  return next;
}

/** The head is up (or the deer is gone): a loose now and it jumps the string. */
export const headUp = (d) => ['wary', 'back', 'bolt', 'away'].includes(d.mode) && (d.lift > 0.5 || ['bolt', 'away'].includes(d.mode));
const spook = (d, now) => ({ ...d, mode: 'bolt', gone: 0, until: now + BOLT_MS, to: null });

/* ── Where an arrow lands, and what it struck ─────────────────────────────────────────────────── */

const { HEART, BODY, DOWN, UP, ANTLER_DOWN, ANTLER_UP, ANTLER_R } = STAG;
const lerp = (a, b, k) => a + (b - a) * k;
const headAt = (lift) => [lerp(DOWN[0], UP[0], lift), lerp(DOWN[1], UP[1], lift)];
const segDist = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, k = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - dx * k, py - ay - dy * k);
};

/** A point (world) on the deer `d`: 'clean' (the heart), 'body', 'graze' (head, antlers), 'near'
    (a miss close enough to startle it) or null. */
export function struck(d, [x, y]) {
  if (['bolt', 'away'].includes(d.mode) || d.x < -20) return null;
  const lx = ((x - d.x) * d.face) / DEER_S, ly = (y - groundAt(d.x)) / DEER_S;
  const lift = d.mode === 'walk' ? 0.5 : d.lift, head = headAt(lift);
  const antler = [head[0] + lerp(ANTLER_DOWN[0], ANTLER_UP[0], lift), head[1] + lerp(ANTLER_DOWN[1], ANTLER_UP[1], lift)];
  if (Math.hypot(lx - HEART[0], ly - HEART[1]) <= HEART_R) return 'clean';
  const [cx, cy, rx, ry] = BODY, e = Math.hypot((lx - cx) / rx, (ly - cy) / ry);
  if (e <= 1 || segDist([lx, ly], [20, -38], head) <= 6) return 'body';
  if (Math.hypot(lx - head[0], ly - head[1]) <= 8 || Math.hypot(lx - antler[0], ly - antler[1]) <= ANTLER_R) return 'graze';
  return e <= NEAR ? 'near' : null;
}

/** The deer's heart in the world (where a patient hand aims). */
export function heartOf(d) {
  return [d.x + d.face * HEART[0] * DEER_S, groundAt(d.x) + HEART[1] * DEER_S];
}

/** The sway of the sight at `ms` for a draw (pure: the same for any clock). */
export function swayOf(s, ms = s.clock) {
  const dr = s.draw;
  if (!dr) return [0, 0];
  const full = dr.at + FULL_MS;
  let a;
  if (ms < full) a = 1.5 * ((ms - dr.at) / FULL_MS);
  else {
    a = SWAY0 + SWAY_GROW * ((ms - full) / 1000);
    if (dr.breathAt != null && ms >= dr.breathAt) {
      const after = ms - dr.breathAt - BREATH_MS;
      a = after < 0 ? a * (1 - (1 - CALM) * ease((ms - dr.breathAt) / 200)) : a * GASP + GASP_GROW * (after / 1000);
    }
  }
  a = Math.min(SWAY_MAX, a);
  const ph = s.phase0, t = ms;
  return [a * (0.8 * Math.sin(t / 270 + ph) + 0.35 * Math.sin(t / 97 + 2 * ph)), a * 0.6 * (Math.sin(t / 207 + 3 * ph) + 0.3 * Math.sin(t / 75 + ph))];
}
export const powerOf = (s, ms = s.clock) => (s.draw ? Math.min(1, (ms - s.draw.at) / FULL_MS) : 0);
export const breathing = (s, ms = s.clock) => Boolean(s.draw?.breathAt != null && ms >= s.draw.breathAt && ms < s.draw.breathAt + BREATH_MS);
const gasping = (s, ms = s.clock) => Boolean(s.draw?.breathAt != null && ms >= s.draw.breathAt + BREATH_MS);

/** The shot loosed at `ms`: from the sight (and its sway), the wind of the moment carries it, a
    weak draw drops it. → { to, drift, T } (T the flight's ms). */
export function shotOf(s, ms = s.clock) {
  const level = levelOf(s), [sx, sy] = swayOf(s, ms), p = powerOf(s, ms);
  const aim = [s.aim[0] + sx, s.aim[1] + sy], dist = Math.max(60, BOW[0] - aim[0]);
  const wind = windAt(level, s.seed, ms), drift = DRIFT * wind * (dist / 300);
  const to = [aim[0] + drift + SHORT * (1 - p), aim[1] + DROP * (1 - p)];
  return { to, aim, drift, wind, p, T: 260 + dist * 1.2 };
}

/* ── The game ──────────────────────────────────────────────────────────────────────────────────── */

const levelOf = (s) => s.levels[s.li];

function lay(s, li) {
  const level = s.levels[li];
  return { ...s, li, phase: 'wait', t: 0, clock: 0, drift: 0, deer: freshDeer(level), draw: null, shot: null, aim: [...(level.aim ?? [250, 170])],
    shots: 0, spooks: 0, said: null, saidAt: null, stuck: [], at: null, hitKind: null, phase0: rng(`${s.seed}|${li}|sway`)() * 6.28 };
}

export function newGame(seed, _level = 1, deal = {}) {
  const levels = Array.isArray(deal?.levels) ? deal.levels : [];
  const s = { seed: String(seed), live: levels.length > 0, levels, li: 0, best: levels.map(() => 0), won: false, stars: 0, grade: null,
    still: Boolean(deal?.still), art: deal?.art ?? null, spooksAll: 0, shotsAll: 0 };
  return levels.length ? lay(s, 0) : { ...s, phase: 'empty' };
}

/** Stars: the heart, the first arrow, calm (no spook) — at least one for any hit. */
export const starsFor = ({ heart, shots, spooks }) => Math.max(1, (heart ? 1 : 0) + (shots <= 1 ? 1 : 0) + (spooks === 0 ? 1 : 0));
export const starsOf = (s) => (s.best.every((b) => b > 0) ? Math.round(s.best.reduce((a, b) => a + b, 0) / s.best.length) : 0);
export const gradeOf = (stars) => (stars >= 3 ? 'clean' : stars === 2 ? 'steady' : 'rough');
export const stuck = (s) => !s.won && s.live && ((s.spooks ?? 0) >= STUCK_SPOOKS || (s.shots ?? 0) >= STUCK_SHOTS);

const say = (s, said) => ({ ...s, said, saidAt: s.clock });
const inScene = (x, y) => x >= 0 && x <= W && y >= 0 && y <= H;
const clampAim = ([x, y]) => [Math.max(4, Math.min(W - 4, x)), Math.max(4, Math.min(H - 4, y))];

/** Press: the bow starts to draw; the sight stays where it was and follows the finger from here. */
function hold(s, d) {
  if (s.phase !== 'wait' || s.draw) return null;
  const x = Number(d.x), y = Number(d.y), at = Number.isFinite(x) ? [x, y] : null;
  return { ...s, draw: { at: s.clock, press: at, from: [...s.aim], movedAt: s.clock, breathAt: null, out: false }, said: null };
}
/** Slide: the sight moves with the finger (1:1, relative); a still finger at full draw is a held breath. */
function move(s, d) {
  if (!s.draw || !s.draw.press || !Number.isFinite(Number(d.x))) return null;
  const x = Number(d.x), y = Number(d.y), dr = s.draw;
  const aim = clampAim([dr.from[0] + x - dr.press[0], dr.from[1] + y - dr.press[1]]);
  const moved = Math.hypot(aim[0] - s.aim[0], aim[1] - s.aim[1]) > 1.2;
  return { ...s, aim, draw: { ...dr, out: !inScene(x, y), movedAt: moved ? s.clock : dr.movedAt } };
}
/** The sight set outright (the bot, the tests). */
function aimAt(s, d) {
  if (!Number.isFinite(Number(d.x))) return null;
  const aim = clampAim([Number(d.x), Number(d.y)]);
  return { ...s, aim, draw: s.draw ? { ...s.draw, movedAt: s.clock } : s.draw };
}
/** Let go: off the scene eases the bow; short of MIN_P the bow was never drawn; else the arrow. */
function release(s) {
  if (!s.draw) return null;
  if (s.draw.out) return say({ ...s, draw: null }, 'ease');
  if (powerOf(s) < MIN_P) return say({ ...s, draw: null }, 'nodraw');
  return loose(s);
}
const ease0 = (s) => (s.draw ? say({ ...s, draw: null }, 'ease') : null);

function loose(s) {
  const shot = shotOf(s), jumped = headUp(s.deer);
  // A loose with its head up: it hears the string and is gone before the arrow comes.
  const deer = jumped && !['bolt', 'away'].includes(s.deer.mode) ? spook(s.deer, s.clock) : s.deer;
  const ahead = jumped ? null : struck(deerAhead(s, shot.T), shot.to);
  return { ...s, phase: 'fly', t: 0, deer, draw: null, shot: { ...shot, from: [...BOW], at: s.clock, jumped, clean: ahead === 'clean' },
    shots: s.shots + 1, shotsAll: s.shotsAll + 1, spooks: s.spooks + (jumped ? 1 : 0), spooksAll: s.spooksAll + (jumped ? 1 : 0), said: jumped ? 'jumped' : null, saidAt: s.clock };
}

/** The deer `ms` from now, as it will be (its steps are seeded: the same as the game will take). */
function deerAhead(s, ms) {
  let d = s.deer, c = s.clock;
  for (let k = 0; k < ms; k += STEP_MS) { c += STEP_MS; d = stepDeer(d, levelOf(s), s.seed, STEP_MS, c); }
  return d;
}

/** The arrow arrives: the heart, the body, a graze, near, or wide. */
function arrive(s) {
  const sh = s.shot, hit = sh.jumped ? null : struck(s.deer, sh.to);
  if (hit === 'clean' || hit === 'body') return hitDeer(s, hit);
  const stuckAt = [n(sh.to[0] - 10), n(Math.max(sh.to[1], groundAt(sh.to[0] - 10) - 2)), n(angleOf(sh) * 57.3)];
  const base = { ...s, phase: 'wait', t: 0, shot: null, stuck: [...s.stuck, stuckAt].slice(-4) };
  if (sh.jumped) return say(base, 'jumped');
  if (hit === 'graze' || hit === 'near') return say({ ...base, deer: spook(s.deer, s.clock), spooks: s.spooks + 1, spooksAll: s.spooksAll + 1 }, hit === 'graze' ? 'graze' : missWord(s, sh, 'near'));
  // Wide and quiet: it only looks up a while — another arrow.
  const deer = ['graze', 'walk'].includes(s.deer.mode) ? { ...s.deer, mode: 'wary', until: s.clock + 1600, to: null } : s.deer;
  return say({ ...base, deer }, missWord(s, sh, 'far'));
}

/** The miss, named by its side: the wind's if the wind carried it there, else where it went. */
function missWord(s, sh, kind) {
  const [hx, hy] = heartOf(s.deer), dx = sh.to[0] - hx, dy = sh.to[1] - hy;
  if (Math.abs(sh.drift) > 14 && Math.sign(sh.drift) === Math.sign(dx) && Math.abs(dx) > 10) return { kind, side: sh.drift > 0 ? 'windR' : 'windL' };
  if (sh.p < 0.85) return { kind, side: 'weak' };
  const side = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'missL' : 'missR') : (dy < 0 ? 'missHi' : 'missLo');
  return { kind, side };
}

const angleOf = (sh) => Math.atan2(sh.to[1] - sh.from[1] + 18, sh.to[0] - sh.from[0]);

function hitDeer(s, kind) {
  const heart = kind === 'clean', stars = starsFor({ heart, shots: s.shots, spooks: s.spooks });
  const best = s.best.map((b, i) => (i === s.li ? Math.max(b, stars) : b));
  return { ...s, phase: 'hit', t: 0, best, at: s.shot.to, hitKind: kind, levelStars: stars, deerGone: { ...s.deer }, said: kind, saidAt: s.clock };
}

function advance(s) {
  if (s.li + 1 < s.levels.length) return lay(s, s.li + 1);
  const stars = starsOf(s);
  return { ...s, phase: 'end', live: false, won: true, stars, grade: gradeOf(stars) };
}

const VERBS = {
  hold, move, aim: aimAt, release, loose: release, ease: ease0,
  next: (s) => (s.phase === 'clear' ? advance(s) : null),
  retry: (s) => (s.phase === 'clear' ? lay(s, s.li) : null),
};

export function act(state, data = {}) {
  if (!state || state.won || !state.live) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── Time ──────────────────────────────────────────────────────────────────────────────────────── */

function stepOnce(s) {
  const level = levelOf(s), c = s.clock + STEP_MS;
  let next = { ...s, t: s.t + STEP_MS, clock: c, drift: s.drift + windAt(level, s.seed, c) * STEP_MS };
  if (next.phase !== 'hit' && next.phase !== 'clear') next.deer = stepDeer(s.deer, level, s.seed, STEP_MS, c);
  const dr = next.draw;
  // Full and still: the breath is held (once a draw).
  if (dr && dr.breathAt == null && c >= dr.at + FULL_MS && c - Math.max(dr.movedAt, dr.at + FULL_MS) >= STILL_MS) next.draw = { ...dr, breathAt: c };
  if (next.phase === 'fly' && c - next.shot.at >= next.shot.T) return arrive(next);
  if (next.phase === 'hit' && next.t >= HIT_MS) return next.levels.length > 1 ? { ...next, phase: 'clear', t: 0 } : advance(next);
  // Three stars go on by themselves; fewer wait for 下一处 or 再来这一处.
  if (next.phase === 'clear' && next.t >= CLEAR_MS && next.best[next.li] >= 3) return advance(next);
  return next;
}

export function tick(state, ms) {
  if (!state?.live || state.won) return state;
  let s = { ...state, acc: (state.acc ?? 0) + ms };
  while (s.acc >= STEP_MS * slowness(s) && s.live && !s.won) {
    const k = STEP_MS * slowness(s);
    s = { ...stepOnce(s), acc: s.acc - k };
  }
  return s;
}

const calm = (s) => Boolean(s?.still) || still();

/** The slow beat of a clean hit: the arrow's last third and the burst's first moments. */
function slowness(s) {
  if (calm(s)) return 1;
  if (s.phase === 'fly' && s.shot?.clean && s.clock - s.shot.at >= s.shot.T * 0.62) return SLOW;
  return s.phase === 'hit' && s.t < SLOW_HIT_MS ? SLOW : 1;
}

/* ── The picture: deerarc's creek, rag, reeds, deer, bow and arrow ────────────────────────────── */

function deerNow(s) {
  const d = s.deer;
  if (s.phase === 'hit') {
    const gone = Math.max(0, Math.min(1.4, (s.t - 400) / 900));
    return calm(s) && gone > 0 ? '' : deerPicture({ ...s.deerGone, walking: false, phase: s.clock }, { gone, alert: 1, art: s.art }).replace(' data-deer=""', '');
  }
  if (d.mode === 'away' || s.phase === 'clear') return '';
  if (d.mode === 'bolt' && calm(s)) return '';
  const walking = d.mode === 'walk' || d.mode === 'back';
  const pic = deerPicture({ x: d.x, face: d.face, walking, lift: walking ? 1 : d.lift, phase: s.clock }, { gone: d.mode === 'bolt' ? d.gone : 0, art: s.art });
  return `<g data-hunt-deer="" data-head="${headUp(d) ? 'up' : 'down'}" data-walk="${walking ? 1 : 0}" data-face="${d.face}">${pic.replace(' data-deer=""', '')}</g>`;
}

/** The sight: a ring and a cross where the arrow is aimed now (sway and all — never the wind), a
    breath ring around it while he holds it, drawn in as it fills. */
function sightPicture(s) {
  if (!s.draw) return '';
  const p = powerOf(s), [sx, sy] = swayOf(s), x = s.aim[0] + sx, y = s.aim[1] + sy, r = 7 + (1 - p) * 14;
  const k = breathing(s) ? 1 - (s.clock - s.draw.breathAt) / BREATH_MS : 0, C = 2 * Math.PI * (r + 5);
  const breath = k > 0 ? `<circle class="g-dh-aim-breath" r="${n(r + 5)}" style="stroke-dasharray:${n(C * k)} ${n(C)}"/>` : '';
  const cls = `g-dh-aim${p >= 1 ? ' is-full' : ''}${gasping(s) ? ' is-gasp' : ''}${breathing(s) ? ' is-breath' : ''}`;
  return `<g class="${cls}" data-reticle="" transform="translate(${n(x)} ${n(y)})"><circle class="g-dh-aim-ring" r="${n(r)}"/>`
    + `<path class="g-dh-aim-cross" d="M${n(-r - 4)} 0 H${n(-r + 3)} M${n(r - 3)} 0 H${n(r + 4)} M0 ${n(-r - 4)} V${n(-r + 3)} M0 ${n(r - 3)} V${n(r + 4)}"/>${breath}</g>`;
}

function bowNow(s) {
  const p = powerOf(s), [ax, ay] = s.aim;
  const a = (Math.atan2(BOW[1] - ay, BOW[0] - ax) * 180) / Math.PI + 4;
  return bowPicture({ phase: s.phase === 'fly' ? 'fly' : 'aim', pull: s.draw ? { a, p } : { a, p: 0 }, art: s.art, clock: s.clock, still: s.still });
}

/** The arrow in flight: along a low arc from the bow to where it lands. */
function arrowNow(s) {
  const sh = s.shot;
  if (s.phase !== 'fly' || !sh) return '';
  const k = Math.min(1, (s.clock - sh.at) / sh.T), [x0, y0] = sh.from, [x1, y1] = sh.to;
  const lift = Math.hypot(x1 - x0, y1 - y0) * 0.16, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - lift;
  const x = (1 - k) ** 2 * x0 + 2 * (1 - k) * k * cx + k * k * x1, y = (1 - k) ** 2 * y0 + 2 * (1 - k) * k * cy + k * k * y1;
  const tx = 2 * (1 - k) * (cx - x0) + 2 * k * (x1 - cx), ty = 2 * (1 - k) * (cy - y0) + 2 * k * (y1 - cy);
  return `<g class="g-da-arrow" transform="translate(${n(x)} ${n(y)}) rotate(${n((Math.atan2(ty, tx) * 180) / Math.PI)})">${arrowShape(s.art, -6)}</g>`;
}

const spentNow = (s) => s.stuck.map(([x, y, a]) => `<g class="g-da-spent" transform="translate(${x} ${y}) rotate(${a})">${arrowShape(s.art, 0, true)}</g>`).join('');

function burstNow(s) {
  if (s.phase !== 'hit' || !s.at) return '';
  const [x, y] = s.at, stars = starsPicture(x, y - 34, s.levelStars, calm(s) ? 999 : s.t);
  if (calm(s)) return `<circle class="g-da-burst" cx="${n(x)}" cy="${n(y)}" r="14"/>${stars}`;
  const ring = s.t < 600 ? `<circle class="g-da-ring" cx="${n(x)}" cy="${n(y)}" r="${n(10 + s.t / 12)}" opacity="${n(1 - s.t / 600, 2)}"/>` : '';
  return (s.hitKind === 'clean' ? inkHit(s.art?.ink_hit, x, y, s.t) : splash(x, y, s.t, { r: 12 })) + ring + stars;
}

/** Dusk: the light low over the creek (a level's `dusk`, 0–1). */
const duskNow = (level) => (level.dusk ? `<rect class="g-dh-dusk-wash" width="${W}" height="${H}" style="opacity:${level.dusk}"/>` : '');

function playScene(s) {
  const level = levelOf(s), w = windAt(level, s.seed, s.clock);
  const pad = `<rect class="g-da-pad" x="0" y="0" width="${W}" height="${H}" data-g-drag="bow"/>`;
  const rag = windPicture({ wind: w }, { clock: s.clock, art: s.art, world: { drift: s.drift }, still: s.still });
  const world = bankPicture(s) + rag + spentNow(s) + deerNow(s) + duskNow(level) + burstNow(s) + bowNow(s) + arrowNow(s) + sightPicture(s);
  return scene(W, H, `<g class="g-da-world"${settle(s)}>${world}</g>${pad}`, 'g-da-scene g-dh-scene');
}

function windWord(w, t) {
  const k = Math.min(3, Math.ceil(Math.abs(w) / 0.3 - 0.15));
  return k ? `${t.wind[k]}${w > 0 ? t.face : t.back}` : t.wind[0];
}
const starRow = (k, pop = false) => [0, 1, 2].map((i) => `<i class="g-da-star${i < k ? ' is-on' : ''}${pop ? ' g-da-pop' : ''}" style="--i:${i}">${i < k ? '★' : '☆'}</i>`).join('');

function head(s, t) {
  const level = levelOf(s), w = windAt(level, s.seed, s.clock);
  const where = s.levels.length > 1 ? `<span>${t.level.replace('{i}', String(s.li + 1)).replace('{n}', String(s.levels.length))}</span>` : '';
  return `<div class="g-head g-da-top">${where}<span class="g-da-windword${Math.abs(w) <= 0.15 ? ' is-lull' : ''}">${windWord(w, t)}</span>`
    + `<span>${t.arrow.replace('{k}', String(s.shots + (s.phase === 'fly' ? 0 : 1)))}</span></div>`;
}

function lineOf(s, t, lang) {
  const level = levelOf(s);
  if (s.phase === 'clear') return `${t.clear}${starRow(s.best[s.li], true)}`;
  if (s.draw) return breathing(s) ? t.breath : gasping(s) ? t.gasp : powerOf(s) >= 1 ? t.full : t.draw;
  if (s.phase === 'hit') return t[s.hitKind];
  const said = typeof s.said === 'object' && s.said ? `${t[s.said.side] ?? ''}${s.said.kind === 'near' ? t.near : t.far}` : s.said ? t[s.said] : null;
  const fresh = s.saidAt != null && s.clock - s.saidAt < 4200;
  if (said && fresh) return said;
  if (s.deer.mode === 'away' || s.deer.mode === 'bolt') return t.away;
  if (s.deer.mode === 'back') return t.back;
  return level.say?.[lang] ?? level.say?.zh ?? '';
}

function controls(s, t) {
  if (s.phase === 'clear' && s.best[s.li] < 3) return `<div class="g-pair">${btn(t.next, 'data-g="next"', 'main')}${btn(t.again, 'data-g="retry"', 'soft')}</div>`;
  return '';
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.phase === 'empty') return `<div class="g-deerarc g-deerhunt g-ink"><p class="g-line-say">${t.empty}</p></div>`;
  if (state.won) {
    return `<div class="g-deerarc g-deerhunt g-ink is-won"><p class="g-da-stars">${starRow(state.stars)}</p>`
      + `<p class="g-line-say">${t.end}<br>${t.stars.replace('{s}', String(state.stars))}</p></div>`;
  }
  return `<div class="g-deerarc g-deerhunt g-ink">${head(state, t)}${playScene(state)}<p class="g-line-say">${lineOf(state, t, lang)}</p>${controls(state, t)}</div>`;
}

/* ── Standalone: the mount() contract. Alone (the 游戏厅) it reads its row of games.json; a beat
   passes its own `data` (levels, art). The paintings are 射鹿's (the row's `art` names deerarc). */
const onServer = async (file) => {
  try { return (await fetch(new URL(`../../worlds/jiuding/art/${file}`, import.meta.url), { method: 'HEAD' })).ok; } catch { return false; }
};
export async function mount(container, opts = {}) {
  const row = opts.data?.levels ? {} : await rowOf(meta.id);
  const levels = opts.data?.levels ?? row.levels ?? [], art = await presentArt(opts.data?.art ?? row.art, onServer);
  const quiet = opts.reducedMotion ? { still: true } : {};
  return mountPure({ newGame, act, tick, html })(container, { ...opts, data: { ...(opts.data ?? {}), levels, art, ...quiet } });
}
