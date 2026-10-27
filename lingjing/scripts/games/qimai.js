// 气走经脉 · the breath kit (Hanli approved 10-19: the seven 调息 games all made one move — watch a
// ring, hold and let go to keep it centred — no route, no obstacle, no climb; 「割绳子 works,
// homemade mechanics don't」). This is a proven genre instead: hold-to-rise (the helicopter game,
// Jetpack Joyride), as breath. A 气 bead travels left to right along a meridian channel drawn in ink;
// holding (mouse, touch, or Space) is 吸 and the bead rises with momentum; letting go is 吐 and it
// sinks. One input, both widths.
//
// Levels are data (worlds/jiuding/games.json, the rows with id `qimai`), each declaring its elements
// the way rope.js's levels do; each element is taught the first time it comes into view in a level,
// with a ring and a line (ELEMENTS below):
//   path   [[x, y], …]          the channel's middle (eased between points); y down, 0…H
//   width  [[x, hw], …]         its half-width (宽脉 ~52, 窄脉 ≤ 36 — taught as 窄脉)
//   gates  [{x, gap, y?, name}] 关窍: a narrow pass to thread (尾闾 · 夹脊 · 玉枕); each a checkpoint
//   xue    [{x, name}]          穴位: a checkpoint along the way, no narrowing
//   currents [{from, to, push}] 乱流: a steady push (+ down, − up), u/s²
//   waves  [{from, to, push?}]  浪头: a heavy push down that only a long hold rides out
//   heart  [{from, to, beat?, kick?, jitter?}]  心跳乱流: on every beat a kick up or down (seeded), lub-dub;
//                               `jitter` (0…1) lets each beat come early or late by that share of `beat`
//                               (seeded per beat, so a 10 ms and a 50 ms clock still play alike)
//   currents may `flip` (ms): the push turns over every `flip` ms of play — a changing wind
//   gold   [{from, to, amp?, period?, rise?, off?}]  金线: a thread that rises over `rise` of its period
//                               and falls over the rest (吸四吐六: rise 0.4) — hug it for the star
//   dark   [{from, to, r?}]     暗: the channel unlit but for a small round about the bead
// Things in the channel (Hanli 10-27: 「调息的游戏出现很多次, 每次都一样…增加障碍物, 道具, 增加趣味」), each at x, `off`
// from the channel's middle (+ down), so every level lays its own:
//   rocks  [{x, off?, r?}]      礁石: a stone in the way (r 9); touching it costs a 气 as a wall does — go over or under
//   orbs   [{x, off?}]          灵珠: a 气 back (to three) as the bead passes through it
//   shields [{x, off?}]         护体: the next touch (wall or stone) costs nothing
//   slows  [{x, off?, ms?, k?}] 定神: the channel goes by at k (0.55) of its speed for ms (3000)
//   speed (u/s), len (u), say · book · end · title ({zh, en})
//   goldTol, goldNeed           the 金线's bar for ★3 (within goldTol of it for goldNeed of its length)
//   grades {3, 2, 1}            the story task's grade for each star count (its `marks` keys)
//   look {tint, ink, trail, glyph, land}  the level's own tint, wall ink, trail colour, its character
//                               (now only its name; the title card shows a painted emblem) and its LAND
//                               (Hanli 10-19: every level its own)
// The board is an inner landscape (内景山水, Hanli 10-20): the channel is a cloud road through mountains
// seen from the side. Painted (tools/paint-qimai-flux.py → qimai/art/): per land a still sky, two
// parallax strips (far peaks, mid ridges) behind the SVG and a cliff rock that fills the gorge walls
// outside the channel; the pass gates (a round moon gate centred on each gate's gap), the 灵珠 pearl and
// its glow, wind gusts for currents, wave crests, an emblem per level. The code still draws the
// channel's walls from the level's data (the outline the bead collides with), the gold thread, the trail.
// Failing: touching a wall costs one 气 (of three); the third is 岔气 — at once, back to the last 关
// or 穴 passed, 气 full again. Stars: through (1) · no wall touched (2) · the gold thread kept (3).
// Physics: a fixed 1/60 s step inside `tick`, so a 10 ms and a 50 ms clock play the same world.
// Pure model: newGame / act / tick (the bots and tests drive these); the page is `mount` (its own
// frame loop, pointer and Space; games/mount.js's contract).
import { rng } from './seeded.js';
import { forInput } from './kit/device.js';

/* ── The painted inner landscape ──────────────────────────────────────────────────────────── */

export const LANDS = ['dawn', 'dusk', 'jade', 'mist', 'moon', 'star'];
const art = (name) => new URL(`./qimai/art/${name}.webp`, import.meta.url).href;
/** Measured by the paint script's cut (qimai/art/art.json): each strip's aspect, each gate's round hole
    (centre and radii as shares of its picture) and the picture's aspect. */
export const ART = {"gates":{"weilv":{"cx":0.4984,"cy":0.5684,"rx":0.1838,"ry":0.1911,"aspect":1.0264},"jiaji":{"cx":0.5047,"cy":0.7112,"rx":0.1398,"ry":0.1436,"aspect":1.0446},"yuzhen":{"cx":0.5114,"cy":0.6096,"rx":0.1974,"ry":0.1901,"aspect":0.976},"pass":{"cx":0.5104,"cy":0.6434,"rx":0.1806,"ry":0.1601,"aspect":0.9128}},"sky-dawn":{"w":1024,"h":640},"far-dawn":{"w":1536,"h":336},"mid-dawn":{"w":1536,"h":336},"sky-dusk":{"w":1024,"h":640},"far-dusk":{"w":1536,"h":336},"mid-dusk":{"w":1536,"h":336},"sky-jade":{"w":1024,"h":640},"far-jade":{"w":1536,"h":336},"mid-jade":{"w":1536,"h":336},"sky-mist":{"w":1024,"h":640},"far-mist":{"w":1536,"h":336},"mid-mist":{"w":1536,"h":336},"sky-moon":{"w":1024,"h":640},"far-moon":{"w":1536,"h":336},"mid-moon":{"w":1536,"h":336},"sky-star":{"w":1024,"h":640},"far-star":{"w":1536,"h":336},"mid-star":{"w":1536,"h":336}};
export const landOf = (L) => (LANDS.includes(L?.look?.land) ? L.look.land : 'moon');
const gateArt = (g) => ({ 尾闾: 'weilv', 夹脊: 'jiaji', 玉枕: 'yuzhen' })[g?.name?.zh] ?? 'pass';
const HOLE0 = { cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2, aspect: 1 };
const ROCK_U = 150; //               the rock tile's side in world units
const PARALLAX = { far: 0.12, mid: 0.38 };

export const W = 360;
export const H = 220;
export const BX = 96; //            where the bead stands on the screen; the channel scrolls under it
export const R = 6; //              the bead's radius
export const STEP_MS = 1000 / 60;
export const GRAV = 260; //         吐: the bead sinks (u/s²)
export const LIFT = 260; //         吸: it rises
export const VMAX = 110;
export const DRAG = 3; //          the breath's own damping (1/s): the bead eases to a steady climb or sink
export const QI = 3;
export const GOLD_TOL = 10; //      within this of the thread is hugging it
export const GOLD_NEED = 0.7; //    hugged this share of the thread's length keeps the star
export const GATE_HALF = 14;
export const NARROW = 36;
const TOUCH_COOL = 650, CHA_MS = 900, READY_MS = 1500, START_MS = 2600, SAMPLE = 2;
const WAVE_PUSH = 160, HEART_BEAT = 850, HEART_KICK = 40, DARK_R = 52;
export const ROCK_R = 9, PICK_R = R + 7, SLOW_MS = 3000, SLOW_K = 0.55;
/** The things a level lays in its channel, by kind (rocks to dodge, three pickups). */
export const PICKS = ['orbs', 'shields', 'slows'];

/** The elements a level may declare, and what a player is taught the first time each comes into view. */
export const ELEMENTS = {
  narrow: { zh: '窄脉', en: 'Narrow channel', teach: { zh: '窄脉：一口别吸满。吸一点，吐一点。', en: 'A narrow channel: never a full breath. A little in, a little out.' } },
  gate: { zh: '关窍', en: 'Pass', teach: { zh: '关窍：口子窄。先把气摆正，再穿过去。', en: 'A pass: a narrow gap. Settle the breath first, then thread it.' } },
  current: { zh: '乱流', en: 'Cross-current', teach: { zh: '乱流：有股气在推你。往上推就多吐，往下压就多吸。', en: 'A current pushes you. Pushed up, breathe out more; pressed down, breathe in more.' } },
  gold: { zh: '金线', en: 'Gold thread', teach: { zh: '金线：贴着它走。吐得比吸的长。', en: 'The gold thread: ride it. Breathe out longer than in.' } },
  wave: { zh: '浪头', en: 'Wave', teach: { zh: '浪头压下来了——浪头上别松口。', en: 'A wave comes down on you. On the wave, don\'t let go.' } },
  heart: { zh: '心跳乱流', en: 'Heartbeat', teach: { zh: '心跳乱流：心一跳，气就一抖。带着怕走。', en: 'Heartbeat: each beat jolts the breath. Go on with the fear.' } },
  dark: { zh: '暗', en: 'Dark', teach: { zh: '暗：看不见脉壁了，只看得见眼前一小圈。', en: 'Dark: the walls are gone but for a small round around you.' } },
  rock: { zh: '礁石', en: 'Stone', teach: { zh: '礁石：撞上就散一分气。从上头或底下绕过去。', en: 'A stone: hitting it costs qi. Go over it or under it.' } },
  orb: { zh: '灵珠', en: 'Qi pearl', teach: { zh: '灵珠：穿过去，补回一分气。', en: 'A qi pearl: pass through it to win back some qi.' } },
  shield: { zh: '护体', en: 'Guard', teach: { zh: '护体：拿到它，下一回碰壁不散气。', en: 'A guard: take it, and the next knock costs nothing.' } },
  slow: { zh: '定神', en: 'Calm', teach: { zh: '定神：拿到它，四下慢下来一会儿。', en: 'Calm: take it, and everything slows for a while.' } },
};
const KIND = { rocks: 'rock', orbs: 'orb', shields: 'shield', slows: 'slow' };

export const T = {
  zh: {
    qi: '气', gold: '金线', guard: '护', calm: '定', start: '起', touch: ['碰壁，气散了一分。', '蹭着脉壁了。稳住。', '又碰了一下。'],
    cha: '岔气了。从{at}再来。', origin: '起点', end: '气走通了。', hint: { desk: '按住 吸 · 松开 吐（空格亦可）', touch: '按住 吸 · 松开 吐' }, restart: '从头',
    won: ['气走通了，可是碰了壁。', '一口不乱，脉壁没碰。', '一口不乱，金线也贴住了。'],
  },
  en: {
    qi: 'Qi', gold: 'Gold', guard: 'Guard', calm: 'Calm', start: 'Go', touch: ['A wall — some qi is lost.', 'Grazed the wall. Steady.', 'Touched again.'],
    cha: 'The breath breaks. From {at} again.', origin: 'the start', end: 'Through.', hint: { desk: 'Hold: in · Let go: out (or Space)', touch: 'Hold: in · Let go: out' }, restart: 'Restart',
    won: ['Through, though the walls were touched.', 'Not a wall touched.', 'Not a wall touched, and the gold thread kept.'],
  },
};

export const meta = {
  pause: true, // its own loop reads the shell's pause
  id: 'qimai',
  // The story lays it through its own mount (beat-host.js): html() is the first frame, mount() paints
  // the lamp, trail, ring and bead each animation frame — the page's 50 ms html redraw would lose them.
  beat: 'mount',
  sounds: ['tap', 'crash', 'cha', 'cp', 'beat', 'orb', 'shield', 'slow'], // the flight kit's (games/kit/audio/sounds.json)
  name: { zh: '气走经脉', en: 'Qi through the meridians' },
  how: {
    zh: '按住是吸，气往上走；松开是吐，气往下沉。别碰脉壁，贴着金线走。',
    en: 'Hold to breathe in: the qi rises. Let go to breathe out: it sinks. Keep off the walls; ride the gold thread.',
  },
};

/** What a stretch of play sounded (games/kit/heard.js) — read off its counts, so a snapshot (`soundSnap`) does as well
    as a state: a breath drawn in (tap), the bead on the wall (crash), the breath broken (cha), a 穴 passed (cp), a
    heartbeat's jolt (beat). The mount sounds it each frame; the state is stepped in place, so it keeps a snapshot. */
export const soundSnap = (s) => ({ holding: s.holding, touches: s.touches, chas: s.chas, cp: s.cp, beat: s.beat, picked: s.picked ? { ...s.picked } : null });
export function sounds(b, a) {
  if (!b || !a) return [];
  const out = [];
  if (a.holding && !b.holding) out.push('tap');
  if (a.touches > b.touches) out.push('crash');
  if (a.chas > b.chas) out.push('cha');
  if (a.cp > b.cp) out.push('cp');
  if (a.beat && a.beat !== b.beat) out.push('beat');
  for (const [k, ev] of [['orbs', 'orb'], ['shields', 'shield'], ['slows', 'slow']]) if ((a.picked?.[k] ?? 0) > (b.picked?.[k] ?? 0)) out.push(ev);
  return out;
}

/* ── The channel, sampled once ────────────────────────────────────────────────────────────── */

const ease = (k) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, k)))) / 2;
/** A value eased between control points [[x, v], …]. */
export function along(pts, x, dflt = 0) {
  if (!pts?.length) return dflt;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, v1] = pts[i];
    if (x <= x1) { const [x0, v0] = pts[i - 1]; return v0 + (v1 - v0) * ease((x - x0) / Math.max(1e-6, x1 - x0)); }
  }
  return pts.at(-1)[1];
}
const inZone = (z, x) => x >= z.from && x <= z.to;
const ramp = (z, x, edge = 30) => Math.min(1, (x - z.from) / edge, (z.to - x) / edge);

/** The level's channel as sampled arrays: middle, top and bottom walls (gates cut in). */
export function channel(level) {
  const len = level.len, n = Math.ceil(len / SAMPLE) + 1;
  const mid = new Float32Array(n), top = new Float32Array(n), bot = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * SAMPLE, m = along(level.path, x, H / 2), hw = along(level.width, x, 52);
    mid[i] = m; top[i] = m - hw; bot[i] = m + hw;
  }
  for (const g of level.gates ?? []) {
    const gy = g.y ?? along(level.path, g.x, H / 2), half = g.gap / 2;
    for (let x = g.x - GATE_HALF - 10; x <= g.x + GATE_HALF + 10; x += SAMPLE) {
      const i = Math.round(x / SAMPLE);
      if (i < 0 || i >= n) continue;
      const k = Math.abs(x - g.x) <= GATE_HALF ? 1 : ease(1 - (Math.abs(x - g.x) - GATE_HALF) / 10);
      top[i] = Math.max(top[i], top[i] + (gy - half - top[i]) * k);
      bot[i] = Math.min(bot[i], bot[i] + (gy + half - bot[i]) * k);
    }
  }
  return { len, n, mid, top, bot };
}
const idx = (ch, x) => Math.max(0, Math.min(ch.n - 1, Math.round(x / SAMPLE)));
export const wallsAt = (ch, x) => { const i = idx(ch, x); return { top: ch.top[i], bot: ch.bot[i], mid: ch.mid[i] }; };

/** The gold thread's height at x (or null off it): rising over `rise` of its period, falling the rest. */
export function goldAt(level, ch, x) {
  for (const g of level.gold ?? []) {
    if (!inZone(g, x)) continue;
    const period = g.period ?? 260, rise = g.rise ?? 0.4, amp = g.amp ?? 16;
    const p = (((x - g.from) / period) % 1 + 1) % 1;
    const v = p < rise ? -1 + 2 * ease(p / rise) : 1 - 2 * ease((p - rise) / (1 - rise));
    const { top, bot, mid } = wallsAt(ch, x);
    return Math.max(top + R + 4, Math.min(bot - R - 4, mid + (g.off ?? 0) - amp * v));
  }
  return null;
}

/** Where a thing in the channel stands: its x, and its y off the channel's middle there (inside the walls). */
export function thingAt(ch, t, r = 0) {
  const { top, bot, mid } = wallsAt(ch, t.x);
  return { x: t.x, y: Math.max(top + r + 1, Math.min(bot - r - 1, mid + (t.off ?? 0))) };
}

/** Where a level's checkpoints stand: its start, every 关 (just past it) and every 穴. */
export function checkpoints(level) {
  const cps = [{ x: 0, name: null }];
  for (const g of level.gates ?? []) cps.push({ x: g.x + GATE_HALF + 6, name: g.name, gate: true });
  for (const p of level.xue ?? []) cps.push({ x: p.x, name: p.name });
  return cps.sort((a, b) => a.x - b.x);
}

/** Each element's first appearance in the level: where to ring it, and from where it is in view. */
export function lessons(level, ch) {
  const out = [];
  const first = (kind, x, y) => { if (!out.some((l) => l.kind === kind)) out.push({ kind, x, y }); };
  for (let i = 0; i < ch.n; i++) if (ch.bot[i] - ch.top[i] <= NARROW * 2 && !(level.gates ?? []).some((g) => Math.abs(i * SAMPLE - g.x) < GATE_HALF + 12)) { first('narrow', i * SAMPLE + 30, ch.mid[i]); break; }
  const zones = (kind, list) => { const z = [...(list ?? [])].sort((a, b) => a.from - b.from)[0]; if (z) first(kind, z.from + 24, wallsAt(ch, z.from + 24).mid); };
  const g0 = [...(level.gates ?? [])].sort((a, b) => a.x - b.x)[0];
  if (g0) first('gate', g0.x, g0.y ?? wallsAt(ch, g0.x).mid);
  zones('current', level.currents);
  zones('wave', level.waves);
  zones('heart', level.heart);
  zones('dark', level.dark);
  for (const [list, kind] of Object.entries(KIND)) {
    const t0 = [...(level[list] ?? [])].sort((a, b) => a.x - b.x)[0];
    if (t0) first(kind, t0.x, thingAt(ch, t0).y);
  }
  const gz = [...(level.gold ?? [])].sort((a, b) => a.from - b.from)[0];
  if (gz) first('gold', gz.from + 10, goldAt(level, ch, gz.from + 10));
  return out.sort((a, b) => a.x - b.x);
}

/* ── The game ─────────────────────────────────────────────────────────────────────────────── */

export function newGame(seed, _level = 1, deal = {}) {
  const level = deal?.levels?.[0] ?? deal?.level ?? null;
  if (!level?.len) return { seed: String(seed), live: false, won: false, phase: 'empty', level: null };
  const ch = channel(level);
  const s = {
    seed: String(seed), level, ch, live: true, won: false, grade: null, stars: 0,
    cps: checkpoints(level), lessons: lessons(level, ch), taught: [], teaching: null,
    phase: 'ready', t: 0, clock: 0, acc: 0, x: 0, y: wallsAt(ch, 0).mid, vy: 0, holding: false,
    qi: QI, touches: 0, chas: 0, cp: 0, touchAt: -1e9, touch: null, chaAt: null, pressAt: -1e9, releaseAt: -1e9, startAt: 0,
    gold: (level.gold ?? []).map(() => ({ on: 0, hug: 0 })), trail: [], beat: null, first: true, hb: [],
    got: Object.fromEntries(PICKS.map((k) => [k, (level[k] ?? []).map(() => false)])), picked: { orbs: 0, shields: 0, slows: 0 },
    guard: false, slowUntil: -1, slowK: 1,
  };
  return s;
}

const goldShare = (s) => {
  const on = s.gold.reduce((a, g) => a + g.on, 0), hug = s.gold.reduce((a, g) => a + g.hug, 0);
  return on > 0 ? hug / on : null;
};
export const goldKept = (s) => !s.level.gold?.length || (goldShare(s) ?? 0) >= (s.level.goldNeed ?? GOLD_NEED);
export const starsOf = (s) => 1 + (s.touches === 0 ? 1 : 0) + (s.level.gold?.length && goldKept(s) ? 1 : 0);
export { goldShare };

/** Back to checkpoint `cp` (岔气, or 从头 to 0): 气 full, the bead at the channel's middle, still. */
function reset(s, cp, full = false) {
  const at = s.cps[cp];
  const x = at.x;
  Object.assign(s, { phase: 'ready', t: 0, x, y: wallsAt(s.ch, x).mid, vy: 0, qi: QI, cp, trail: [], beat: null, touch: null, holding: false, hb: [] });
  for (const [i, g] of (s.level.gold ?? []).entries()) if (full || g.to > x) s.gold[i] = { on: 0, hug: 0 };
  // what lies ahead of the checkpoint is there again (a 岔气 does not keep a pearl taken past it); a guard or a calm goes
  for (const k of PICKS) for (const [i, t] of (s.level[k] ?? []).entries()) if (full || t.x > x) s.got[k][i] = false;
  Object.assign(s, { guard: false, slowUntil: -1, slowK: 1 });
  if (full) Object.assign(s, { touches: 0, chas: 0, taught: [], teaching: null, first: true, clock: 0, acc: 0, picked: { orbs: 0, shields: 0, slows: 0 } });
  return s;
}

const VERBS = {
  hold(s) {
    if (s.phase === 'ready') { s.phase = 'play'; s.t = 0; s.first = false; }
    if (s.phase !== 'play' || s.holding) return null;
    s.holding = true; s.pressAt = s.clock;
    return s;
  },
  release(s) {
    if (!s.holding) return null;
    s.holding = false; s.releaseAt = s.clock;
    return s;
  },
  restart(s) {
    if (s.won || (s.phase === 'ready' && s.cp === 0 && s.x === 0 && s.touches === 0)) return null;
    return reset(s, 0, true);
  },
};

/** An act: { g: 'hold' | 'release' | 'restart' }. A refused one answers `refused` (the page rings it). */
export function act(state, data = {}) {
  if (!state?.live || state.won) return { state, won: false, refused: true };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false, refused: data.g !== 'release' };
  return { state: next, won: false };
}

/* ── Time ─────────────────────────────────────────────────────────────────────────────────── */

/** The push on the bead at x, now (u/s²), and a heartbeat's kick (u/s) when a beat falls this step. */
function forces(s, x) {
  const L = s.level;
  let a = 0, kick = 0;
  for (const c of L.currents ?? []) if (inZone(c, x)) a += c.push * flipOf(s, c) * ramp(c, x);
  for (const w of L.waves ?? []) if (inZone(w, x)) a += (w.push ?? WAVE_PUSH) * Math.sin(Math.PI * (x - w.from) / (w.to - w.from));
  for (const [i, h] of (L.heart ?? []).entries()) {
    if (!inZone(h, x)) continue;
    const beat = h.beat ?? HEART_BEAT, hb = (s.hb[i] ??= { k: 0, at: s.clock + beat });
    // each beat comes `jitter` early or late (seeded per beat): the heart never settles into a rhythm
    if (s.clock >= hb.at) { hb.k += 1; hb.lub = hb.at; hb.at += beat * (1 + (h.jitter ?? 0) * (2 * rng(`${s.seed}|${i}|j${hb.k}`)() - 1)); }
    const into = hb.lub == null ? -1 : s.clock - hb.lub, k = hb.k;
    const lub = into >= 0 && into < STEP_MS, dub = into >= beat * 0.18 && into < beat * 0.18 + STEP_MS;
    if (lub || dub) {
      const dir = rng(`${s.seed}|${i}|${k}`)() < 0.5 ? -1 : 1;
      kick += dir * (h.kick ?? HEART_KICK) * (lub ? 1 : 0.55);
      s.beat = { at: s.clock, dir };
    }
  }
  return { a, kick };
}

/** A current's sign now: +1, or −1 through every other `flip` ms of play (a wind that turns). */
export const flipOf = (s, c) => (c.flip ? (Math.floor((s.clock - s.startAt + (c.phase ?? 0)) / c.flip) % 2 === 0 ? 1 : -1) : 1);

/* A knock (a wall or a stone): one 气, unless a guard takes it (护体: gone, nothing lost, no touch counted). */
function knock(s, side) {
  if (s.clock - s.touchAt < TOUCH_COOL) return;
  s.touchAt = s.clock;
  if (s.guard) { s.guard = false; s.touch = null; return; }
  s.qi -= 1; s.touches += 1; s.touch = { at: s.clock, x: s.x, y: s.y, side };
  if (s.qi <= 0) { s.phase = 'cha'; s.t = 0; s.chas += 1; s.chaAt = s.clock; s.holding = false; }
}
function touchWall(s, side, top, bot) {
  s.y = side < 0 ? top + R : bot - R;
  s.vy = side < 0 ? Math.max(40, Math.abs(s.vy) * 0.3) : -Math.max(40, Math.abs(s.vy) * 0.3);
  knock(s, side);
}
/* A stone: the bead is put back out of it on the side it came from, and bounced that way. */
function hitRock(s, rk) {
  const { y } = thingAt(s.ch, rk, rk.r ?? ROCK_R), r = (rk.r ?? ROCK_R) + R;
  const dx = s.x - rk.x, dy = s.y - y;
  if (dx * dx + dy * dy >= r * r) return;
  const side = dy < 0 ? -1 : 1;
  s.y = y + side * Math.sqrt(Math.max(0, r * r - dx * dx));
  s.vy = side * Math.max(50, Math.abs(s.vy) * 0.4);
  knock(s, side);
}
/* The pickups the bead passes through: a pearl a 气 back, a guard, a calm. */
const TAKE = {
  orbs: (s) => { s.qi = Math.min(QI, s.qi + 1); },
  shields: (s) => { s.guard = true; },
  slows: (s, t) => { s.slowUntil = s.clock + (t.ms ?? SLOW_MS); s.slowK = t.k ?? SLOW_K; },
};
function pick(s) {
  for (const k of PICKS) for (const [i, t] of (s.level[k] ?? []).entries()) {
    if (s.got[k][i] || Math.abs(s.x - t.x) > PICK_R) continue;
    const { y } = thingAt(s.ch, t);
    if ((s.x - t.x) ** 2 + (s.y - y) ** 2 > PICK_R * PICK_R) continue;
    s.got[k][i] = true; s.picked[k] += 1; TAKE[k](s, t);
  }
}
/** The channel's speed now: the level's, slowed while a 定神 lasts. */
export const speedNow = (s) => (s.level.speed ?? 90) * (s.clock < s.slowUntil ? s.slowK : 1);

function teach(s) {
  const next = s.lessons.find((l) => !s.taught.includes(l.kind) && l.x - s.x < W - BX - 40);
  if (next) { s.taught = [...s.taught, next.kind]; s.teaching = { ...next, at: s.clock }; }
  if (s.teaching && s.x > s.teaching.x + 60) s.teaching = null;
}

function step(s) {
  const dt = STEP_MS / 1000;
  s.clock += STEP_MS; s.t += STEP_MS;
  if (s.phase === 'ready') {
    if (s.t >= (s.first ? START_MS : READY_MS)) { s.phase = 'play'; s.t = 0; s.first = false; }
    return;
  }
  if (s.phase === 'cha') { if (s.t >= CHA_MS) reset(s, s.cp); return; }
  if (s.phase !== 'play') return;
  const L = s.level;
  if (s.t <= STEP_MS) s.startAt = s.clock;
  const { a, kick } = forces(s, s.x);
  s.vy += ((s.holding ? -LIFT : GRAV) + a - DRAG * s.vy) * dt + kick;
  s.vy = Math.max(-VMAX, Math.min(VMAX, s.vy));
  s.y += s.vy * dt;
  s.x += speedNow(s) * dt;
  const { top, bot } = wallsAt(s.ch, s.x);
  if (s.y - R < top) touchWall(s, -1, top, bot);
  else if (s.y + R > bot) touchWall(s, 1, top, bot);
  for (const rk of L.rocks ?? []) if (Math.abs(s.x - rk.x) < (rk.r ?? ROCK_R) + R && s.phase === 'play') hitRock(s, rk);
  if (s.phase === 'play') pick(s);
  for (const [i, g] of (L.gold ?? []).entries()) {
    if (!inZone(g, s.x)) continue;
    s.gold[i].on += STEP_MS;
    if (Math.abs(s.y - goldAt(L, s.ch, s.x)) <= (L.goldTol ?? GOLD_TOL)) s.gold[i].hug += STEP_MS;
  }
  while (s.cp + 1 < s.cps.length && s.x >= s.cps[s.cp + 1].x) s.cp += 1;
  teach(s);
  if (Math.round(s.clock / STEP_MS) % 2 === 0) { s.trail.push([s.x, s.y]); if (s.trail.length > 70) s.trail.shift(); }
  if (s.x >= L.len) {
    s.x = L.len; s.phase = 'won'; s.won = true; s.live = false; s.holding = false;
    s.stars = starsOf(s); s.grade = L.grades?.[s.stars] ?? (s.stars === 3 ? 'even' : s.touches === 0 ? 'clean' : 'through');
  }
}

/** Run the world on by `ms` (any clock: it steps at a fixed 1/60 s inside). */
export function tick(state, ms) {
  if (!state?.live || state.won) return state;
  state.acc += ms;
  while (state.acc >= STEP_MS && !state.won) { state.acc -= STEP_MS; step(state); }
  return state;
}

/** The checkpoint the bead goes back to on 岔气, named. */
export const cpName = (s, lang = 'zh') => { const c = s.cps[s.cp]; return c?.name ? (c.name[lang] ?? c.name.zh) : T[lang].origin; };

/* ── The page ─────────────────────────────────────────────────────────────────────────────── */

const fmt = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const esc = (v) => String(v ?? '').replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
const tr = (o, lang) => (o ? o[lang] ?? o.zh ?? '' : '');
let uid = 0;

/** Points along the channel as an SVG polyline's `points` (world units). */
function line(ch, arr, from = 0, to = ch.len, stepU = 6) {
  const pts = [];
  for (let x = from; x <= to; x += stepU) pts.push(`${fmt(x)},${fmt(arr[idx(ch, x)])}`);
  return pts.join(' ');
}

/** The static world of one level, in world units (scrolled by one transform). */
function worldSvg(s, lang, id) {
  const L = s.level, ch = s.ch, len = L.len, X0 = -BX - 20, X1 = len + W;
  const body = `${line(ch, ch.top)} ${line(ch, ch.bot).split(' ').reverse().join(' ')}`;
  // the gorge walls: everything above the top wall and below the bottom one, filled with the land's rock
  const above = `${fmt(X0)},-30 ${line(ch, ch.top, X0, X1)} ${fmt(X1)},-30`;
  const below = `${fmt(X0)},${H + 30} ${line(ch, ch.bot, X0, X1)} ${fmt(X1)},${H + 30}`;
  // 暗: the zone's ink wash, with a hole where the bead's small round of light is (the shade mask)
  const darks = (L.dark ?? []).length ? `<g mask="url(#${id}-shade)">${L.dark.map((d) => `<rect class="g-qm-darkzone" data-from="${d.from}" data-to="${d.to}" x="${d.from}" y="-20" width="${d.to - d.from}" height="${H + 40}"/>`).join('')}</g>` : '';
  const gust = art('gust');
  // a current is a row of painted wind gusts blowing the way it pushes (up or down)
  const arrows = (c, up) => {
    const marks = [];
    for (let x = c.from + 20; x < c.to - 10; x += 46) {
      const m = wallsAt(ch, x).mid;
      marks.push(`<image class="g-qm-current" href="${gust}" x="-15" y="-8" width="30" height="16" preserveAspectRatio="xMidYMid meet" transform="translate(${fmt(x)} ${fmt(m)}) rotate(${up ? -90 : 90})"/>`);
    }
    return marks.join('');
  };
  // a turning wind (`flip`) draws both ways; the page shows the way it blows now (is-flipped)
  const currents = (L.currents ?? []).map((c, i) => {
    const up = c.push < 0, now = flipOf(s, c) < 0 ? ' is-flipped' : '';
    if (!c.flip) return `<g class="g-qm-zone is-${up ? 'up' : 'down'}">${arrows(c, up)}</g>`;
    return `<g class="g-qm-zone g-qm-turn${now}" data-cur="${i}"><g class="g-qm-way is-a">${arrows(c, up)}</g><g class="g-qm-way is-b">${arrows(c, !up)}</g></g>`;
  }).join('');
  const wave = art('wave');
  const waves = (L.waves ?? []).map((w) => {
    const curls = [];
    for (let x = w.from + 18; x < w.to - 10; x += 38) {
      const t = wallsAt(ch, x).top;
      curls.push(`<image class="g-qm-wave" href="${wave}" x="${fmt(x - 18)}" y="${fmt(t - 2)}" width="36" height="18" preserveAspectRatio="xMidYMin meet"/>`);
    }
    return `<g class="g-qm-zone">${curls.join('')}</g>`;
  }).join('');
  const hearts = (L.heart ?? []).map((h) => {
    const pts = [];
    for (let x = h.from; x < h.to; x += 40) {
      const b = wallsAt(ch, x).bot - 8;
      pts.push(`M${fmt(x)} ${fmt(b)} h10 l4 -9 l5 16 l4 -7 h17`);
    }
    return `<path class="g-qm-heart-glow" d="${pts.join(' ')}"/><path class="g-qm-heart" d="${pts.join(' ')}"/>`;
  }).join('');
  const gold = (L.gold ?? []).map((g) => {
    const pts = [];
    for (let x = g.from; x <= g.to; x += 4) pts.push(`${fmt(x)},${fmt(goldAt(L, ch, x))}`);
    const p = pts.join(' ');
    return `<polyline class="g-qm-gold-glow" points="${p}"/><polyline class="g-qm-gold" points="${p}"/>`;
  }).join('');
  // a pass gate: the painted moon gate, its round hole on the gap (the walls' pinch is the collision)
  const gates = (L.gates ?? []).map((g) => {
    const { top, bot } = wallsAt(ch, g.x), a = ART.gates[gateArt(g)] ?? HOLE0, gy = (top + bot) / 2;
    const h = (bot - top) / 2 / a.ry, w = h * a.aspect;
    return `<g class="g-qm-gate"><image class="g-qm-gate-art" href="${art(`gate-${gateArt(g)}`)}" x="${fmt(g.x - a.cx * w)}" y="${fmt(gy - a.cy * h)}" width="${fmt(w)}" height="${fmt(h)}"/>`
      + `<text class="g-qm-name" x="${g.x}" y="${fmt(Math.max(12, gy - a.cy * h - 4))}">${esc(tr(g.name, lang))}</text></g>`;
  }).join('');
  const xue = (L.xue ?? []).map((p, i) => {
    const { bot } = wallsAt(ch, p.x);
    return `<g class="g-qm-xue" data-xue="${i}"><circle class="g-qm-xue-dot" cx="${p.x}" cy="${fmt(bot + 8)}" r="3.6"/>`
      + `<text class="g-qm-name" x="${p.x}" y="${fmt(Math.min(H - 3, bot + 22))}">${esc(tr(p.name, lang))}</text></g>`;
  }).join('');
  // 礁石: the land's own rock, cut round; 灵珠 · 护体 · 定神: the pearl's glow, each its own mark (data-pick: the page hides a taken one)
  const rocks = (L.rocks ?? []).map((rk) => { const r = rk.r ?? ROCK_R, p = thingAt(ch, rk, r); return `<g class="g-qm-stone"><circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${r}" style="fill:url(#${id}-rock)"/><circle class="g-qm-stone-rim" cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${r}"/></g>`; }).join('');
  const MARK = { orbs: '', shields: '护', slows: '定' };
  const picks = PICKS.flatMap((k) => (L[k] ?? []).map((t, i) => {
    const p = thingAt(ch, t), got = s.got?.[k]?.[i] ? ' is-got' : '';
    return `<g class="g-qm-pick is-${KIND[k]}${got}" data-pick="${k}:${i}"><image class="g-qm-pick-glow" href="${art('glow')}" x="${fmt(p.x - 12)}" y="${fmt(p.y - 12)}" width="24" height="24"/>`
      + (k === 'orbs' ? `<image href="${art('pearl')}" x="${fmt(p.x - 5)}" y="${fmt(p.y - 5)}" width="10" height="10"/>` : `<circle class="g-qm-pick-ring" cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="7"/><text class="g-qm-pick-mark" x="${fmt(p.x)}" y="${fmt(p.y + 3.5)}">${MARK[k]}</text>`) + '</g>';
  })).join('');
  const inner = `<polygon class="g-qm-body" points="${body}"/>`
    + `<polygon class="g-qm-rock" points="${above}" style="fill:url(#${id}-rock)"/><polygon class="g-qm-rock is-below" points="${below}" style="fill:url(#${id}-rock)"/>`
    + `<polyline class="g-qm-wall-wash" points="${line(ch, ch.top, X0, X1)}"/><polyline class="g-qm-wall-wash" points="${line(ch, ch.bot, X0, X1)}"/>`
    + `<polyline class="g-qm-wall" data-side="top" points="${line(ch, ch.top, X0, X1)}"/><polyline class="g-qm-wall" data-side="bot" points="${line(ch, ch.bot, X0, X1)}"/>`
    + `${gold}${currents}${waves}${hearts}${gates}${xue}${rocks}${picks}`;
  // only a level with 暗 masks the world by the bead's lamp (a moving mask over bitmaps costs every frame)
  const lit = (L.dark ?? []).length ? `<g mask="url(#${id}-lamp)">${inner}</g>` : inner;
  const end = wallsAt(ch, len), gr = Math.min(24, (end.bot - end.top) / 2);
  const goal = `<g class="g-qm-goal"><image class="g-qm-goal-glow" href="${art('glow')}" x="${fmt(len - gr * 2)}" y="${fmt(end.mid - gr * 2)}" width="${fmt(gr * 4)}" height="${fmt(gr * 4)}"/>`
    + `<circle class="g-qm-goal-ring" cx="${len}" cy="${fmt(end.mid)}" r="${fmt(gr)}"/></g>`;
  const ring = '<circle class="g-teach-ring g-qm-teach" r="22" cx="-99" cy="-99"/>';
  return `${lit}${darks}${goal}${ring}`;
}

function defsSvg(s, id) {
  const lampR = (s.level.dark ?? [])[0]?.r ?? DARK_R;
  const darks = (s.level.dark ?? []).map((d) => `<rect x="${d.from}" y="-40" width="${d.to - d.from}" height="${H + 80}" style="fill:#000"/>`).join('');
  const rock = `<pattern id="${id}-rock" patternUnits="userSpaceOnUse" width="${ROCK_U}" height="${ROCK_U}" x="0" y="0">`
    + `<image href="${art(`rock-${landOf(s.level)}`)}" width="${ROCK_U}" height="${ROCK_U}" preserveAspectRatio="none"/></pattern>`;
  return `<defs>${rock}<radialGradient id="${id}-glow"><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="${id}-trail" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${BX}" y2="0"><stop offset="0" stop-opacity="0" stop-color="currentColor"/><stop offset="1" stop-opacity="0.75" stop-color="currentColor"/></linearGradient>`
    + `<mask id="${id}-lamp" maskUnits="userSpaceOnUse" x="-100" y="-100" width="${s.level.len + 600}" height="${H + 200}">`
    + `<rect x="-100" y="-100" width="${s.level.len + 600}" height="${H + 200}" style="fill:#fff"/>${darks}`
    + `<circle class="g-qm-lamp" cx="0" cy="0" r="${lampR}" style="fill:url(#${id}-glow)"/></mask>`
    + `<radialGradient id="${id}-hole"><stop offset="0.55" stop-color="#000"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`
    + `<mask id="${id}-shade" maskUnits="userSpaceOnUse" x="-100" y="-100" width="${s.level.len + 600}" height="${H + 200}">`
    + `<rect x="-100" y="-100" width="${s.level.len + 600}" height="${H + 200}" style="fill:#fff"/>`
    + `<circle class="g-qm-lamp" cx="0" cy="0" r="${lampR}" style="fill:url(#${id}-hole)"/></mask></defs>`;
}

const pips = (q) => '●'.repeat(Math.max(0, q)) + '○'.repeat(Math.max(0, QI - q));

function headHtml(s, t) {
  if (s.won) return `<span>${t.end}</span><span class="g-qm-stars">★ ${s.stars} / 3</span>`;
  const share = goldShare(s);
  const gold = s.level.gold?.length ? `<span class="g-qm-goldpct">${t.gold} <b>${share == null ? '—' : `${Math.round(share * 100)}%`}</b></span>` : '';
  const held = `${s.guard ? `<span class="g-qm-held is-guard">${t.guard}</span>` : ''}${s.clock < s.slowUntil ? `<span class="g-qm-held is-calm">${t.calm}</span>` : ''}`;
  return `<span class="g-qm-qi${s.qi < QI ? ' is-low' : ''}">${t.qi} <b>${pips(s.qi)}</b>${held}</span>${gold}<span class="g-qm-prog">${Math.min(100, Math.round((s.x / s.level.len) * 100))}%</span>`;
}

function sayOf(s, t, lang) {
  if (s.won) return `${tr(s.level.end, lang) || t.end} ${t.won[s.stars - 1]}`;
  if (s.phase === 'cha') return t.cha.replace('{at}', cpName(s, lang));
  if (s.touch && s.clock - s.touch.at < 1100) return t.touch[(s.touches - 1) % t.touch.length];
  if (s.teaching) return ELEMENTS[s.teaching.kind].teach[lang];
  if (s.phase === 'ready' && s.cp === 0) return tr(s.level.say, lang) || tr(s.level.book, lang);
  return tr(s.level.book, lang) || tr(s.level.say, lang);
}

/** The level's own look as CSS custom properties on the board (qimai.css mixes them into the theme). */
const COLOR = /^#[0-9a-f]{3,8}$/i;
function lookStyle(L) {
  const k = L?.look ?? {}, v = [['tint', '--qm-tint'], ['ink', '--qm-ink'], ['trail', '--qm-trail']].filter(([f]) => COLOR.test(k[f] ?? '')).map(([f, n]) => `${n}:${k[f]}`);
  return v.length ? ` style="${v.join(';')}"` : '';
}
/** The land behind the channel: a still sky and two strips that scroll slower than the world (parallax). */
function landHtml(L) {
  const land = landOf(L);
  const strip = (k) => `<div class="g-qm-strip is-${k}" style="background-image:url(${art(`${k}-${land}`)})"></div>`;
  return `<div class="g-qm-land" data-land="${land}" style="background-image:url(${art(`sky-${land}`)})">${strip('far')}${strip('mid')}</div>`;
}
/** The levels that have a painted emblem for their title card. */
const EMBLEMS = new Set(["cangxi", "chongmai", "daimai", "dark", "dazhoutian", "faqiu", "feather", "lastshot", "qianmi", "xirang", "xisui", "zhoutian"]);

/** The level's title card over the board before its first breath: its name and the book's line. */
function titleCard(s, lang) {
  const name = tr(s.level.title ?? s.level.name, lang);
  if (!name) return '';
  const em = s.level.id && EMBLEMS.has(s.level.id) ? `<img class="g-qm-emblem" src="${art(`em-${s.level.id}`)}" alt="">` : '';
  return `<div class="g-qm-card" aria-hidden="${s.phase === 'ready' && s.first ? 'false' : 'true'}">${em}<b>${esc(name)}</b><span>${esc(tr(s.level.book, lang))}</span></div>`;
}

/** The board's whole markup for a state (the page lays it once a level, then moves it each frame). */
export function html(s, lang = 'zh', id = 'qm') {
  const t = T[lang] || T.zh;
  if (!s.level) return `<div class="g-qimai g-ink"><p class="g-line-say">—</p></div>`;
  return `<div class="g-qimai g-ink${s.won ? ' is-won' : ''}${s.phase === 'ready' && s.first ? ' is-titled' : ''}"${lookStyle(s.level)} data-level="${esc(s.level.id ?? '')}">`
    + `<div class="g-head g-qm-head">${headHtml(s, t)}</div>`
    + `<div class="g-qm-board g-hold" data-g-hold="">${landHtml(s.level)}`
    + `<svg class="g-scene g-qm-scene" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tr(s.level.name ?? meta.name, lang))}" focusable="false">${defsSvg(s, id)}`
    + `<g class="g-qm-world" transform="translate(${fmt(BX - s.x)} 0)">${worldSvg(s, lang, id)}</g>`
    + `<path class="g-qm-trail" stroke="url(#${id}-trail)" d=""/>`
    + `<g class="g-qm-pulses"></g>`
    + `<g class="g-qm-bead" transform="translate(${BX} ${fmt(s.y)})"><image class="g-qm-bead-glow" href="${art('glow')}" x="${-R * 3}" y="${-R * 3}" width="${R * 6}" height="${R * 6}"/>`
    + `<image class="g-qm-bead-pearl" href="${art('pearl')}" x="${-R - 1}" y="${-R - 1}" width="${2 * R + 2}" height="${2 * R + 2}"/><circle class="g-qm-bead-core" r="${R}"/></g>`
    + `</svg>${titleCard(s, lang)}</div>`
    + `<p class="g-line-say">${esc(sayOf(s, t, lang))}</p>`
    + `<div class="g-qm-row"><span class="g-qm-hint">${forInput(t.hint)}</span><button type="button" class="g-btn g-btn-quiet" data-g="restart">${t.restart}</button></div>`
    + `</div>`;
}

/* ── Standalone: the mount contract (games/mount.js) — own frame loop, pointer and Space ────── */

async function ladder() {
  const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
  return ladderOf(await res.json());
}
/** Every level of the kit's rows, in the registry's order, each carrying its row's name. */
export function ladderOf(registry) {
  return (registry?.games ?? []).filter((g) => g.id === meta.id).flatMap((g) => (g.levels ?? []).map((l) => ({ name: g.name, ...l })))
    .sort((a, b) => (a.n ?? 99) - (b.n ?? 99)); // the climb: each level's `n`, not where its row sits
}
/** The level a mount plays: `data.levels[0]`, else the ladder's level named `data.level`, else the
    ladder's `level`-th (1-based, by each level's `n`; the try page's ?level=). */
export async function levelFor(opts = {}) {
  if (opts.data?.levels?.length) return opts.data.levels[0];
  const all = await ladder();
  return all.find((l) => l.id === opts.data?.level) ?? all[Math.max(0, Math.min(all.length - 1, (Number(opts.level) || 1) - 1))] ?? null;
}

function ensureCss(doc) {
  if (doc.getElementById('g-qimai-css')) return;
  const l = doc.createElement('link');
  l.id = 'g-qimai-css'; l.rel = 'stylesheet'; l.href = new URL('./qimai.css', import.meta.url).href;
  doc.head.appendChild(l);
}

export async function mount(container, opts = {}) {
  const { lang = 'zh', seed = String(Date.now()), signal, winHold = 1600, reducedMotion = false, shell } = opts;
  const paused = () => Boolean(shell?.paused?.()); // the shell's pause (games/shell.js): the bead stands still, no breath taken
  const doc = container.ownerDocument, win = doc.defaultView;
  ensureCss(doc);
  const level = await levelFor(opts);
  const id = `qm${++uid}`;
  let s = newGame(seed, 1, { levels: level ? [level] : [] });
  opts.peek?.(() => s); // a host that keeps the stuck rule itself (games/phone/host.js) looks at the board
  const host = doc.createElement('div');
  host.className = 'game g-mounted';
  container.replaceChildren(host);
  host.innerHTML = html(s, lang, id);
  if (!s.live) return { won: false, left: true };
  const still = reducedMotion || Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const t = T[lang] || T.zh;
  const $ = (q) => host.querySelector(q);
  const board = $('.g-qm-board'), world = $('.g-qm-world'), bead = $('.g-qm-bead'), trail = $('.g-qm-trail'), pulses = $('.g-qm-pulses');
  const head = $('.g-qm-head'), say = $('.g-line-say'), ring = $('.g-qm-teach'), root = $('.g-qimai');
  const lamps = s.level.dark?.length ? [...host.querySelectorAll('.g-qm-lamp')] : [];
  // the parallax strips: each tile's width in px follows the board's size (measured on resize, not per frame)
  const land = landOf(s.level);
  const strips = [...host.querySelectorAll('.g-qm-strip')].map((el) => ({ el, k: PARALLAX[el.classList.contains('is-far') ? 'far' : 'mid'], a: ART[`${el.classList.contains('is-far') ? 'far' : 'mid'}-${land}`], tile: 0, px: -1 }));
  let unit = 1;
  const measure = () => {
    unit = board.clientWidth / W;
    for (const st of strips) {
      st.tile = st.el.clientHeight * (st.a ? st.a.w / st.a.h : 3);
      st.el.style.width = `${Math.ceil(board.clientWidth + st.tile + 4)}px`;
      st.px = -1;
    }
  };
  const scroll = () => {
    for (const st of strips) {
      if (!st.tile) continue;
      const px = Math.round(((s.x * unit * st.k) % st.tile) * 2) / 2;
      if (px !== st.px) { st.px = px; st.el.style.transform = `translate3d(${-px}px,0,0)`; }
    }
  };
  const ro = win.ResizeObserver ? new win.ResizeObserver(() => { measure(); scroll(); }) : null;
  ro?.observe(board);
  measure();
  const xues = [...host.querySelectorAll('.g-qm-xue')], turns = [...host.querySelectorAll('.g-qm-turn')];
  const picks = [...host.querySelectorAll('.g-qm-pick')].map((el) => { const [k, i] = el.dataset.pick.split(':'); return { el, k, i: Number(i) }; });
  let last = { head: '', say: '', cls: '' };

  const pulse = (k) => {
    if (still) return;
    const c = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('class', `g-qm-pulse is-${k}`); c.setAttribute('cx', BX); c.setAttribute('cy', fmt(s.y)); c.setAttribute('r', R * 1.6);
    pulses.appendChild(c);
    win.setTimeout(() => c.remove(), 700);
  };
  const ink = (x, y, cls) => {
    if (still) return;
    const c = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('class', cls); c.setAttribute('cx', fmt(x)); c.setAttribute('cy', fmt(y)); c.setAttribute('r', 5);
    pulses.appendChild(c);
    win.setTimeout(() => c.remove(), 800);
  };
  const nope = (el) => {
    // the shared kit's refusal ring (live-games.js tapNope), drawn here so the module stands alone
    const r = el.getBoundingClientRect(), i = doc.createElement('i');
    i.className = 'g-tapink is-no'; i.style.left = `${r.left + r.width / 2}px`; i.style.top = `${r.top + r.height / 2}px`;
    doc.body.appendChild(i); win.setTimeout(() => i.remove(), 520);
  };

  let seenTouch = 0, seenCha = 0, seenBeat = null, heard = soundSnap(s);
  const paint = () => {
    // its sound, by what changed since the last frame (the shell plays it; games/kit/audio/sounds.json)
    const now = soundSnap(s);
    for (const e of sounds(heard, now)) shell?.sound?.(e);
    heard = now;
    const cam = BX - s.x;
    world.setAttribute('transform', `translate(${fmt(cam)} 0)`);
    scroll();
    bead.setAttribute('transform', `translate(${BX} ${fmt(s.y)})`);
    const cls = `g-qm-bead${s.holding ? ' is-in' : ''}${s.clock - s.touchAt < 650 ? ' is-hurt' : ''}${s.phase === 'cha' ? ' is-cha' : ''}${s.phase === 'ready' ? ' is-ready' : ''}`;
    if (cls !== last.cls) { bead.setAttribute('class', cls); last.cls = cls; }
    trail.setAttribute('d', s.trail.length > 1 ? `M${s.trail.map(([x, y]) => `${fmt(x + cam)} ${fmt(y)}`).join(' L')} L${BX} ${fmt(s.y)}` : '');
    for (const l of lamps) { l.setAttribute('cx', fmt(s.x)); l.setAttribute('cy', fmt(s.y)); }
    if (s.teaching) { ring.setAttribute('cx', fmt(s.teaching.x)); ring.setAttribute('cy', fmt(s.teaching.y)); ring.style.display = ''; } else ring.style.display = 'none';
    xues.forEach((g, i) => g.classList.toggle('is-lit', s.x >= (s.level.xue[i]?.x ?? Infinity)));
    for (const p of picks) p.el.classList.toggle('is-got', Boolean(s.got?.[p.k]?.[p.i]));
    root.classList.toggle('is-calm', s.clock < s.slowUntil);
    const h = headHtml(s, t);
    if (h !== last.head) { head.innerHTML = h; last.head = h; }
    const line = sayOf(s, t, lang);
    if (line !== last.say) { say.textContent = line; say.classList.toggle('g-teach-say', Boolean(s.teaching) && line === ELEMENTS[s.teaching?.kind]?.teach[lang]); last.say = line; }
    if (s.touches > seenTouch && s.touch) { seenTouch = s.touches; ink(BX, s.touch.y, 'g-qm-splash'); nope(bead); }
    if (s.touches < seenTouch) seenTouch = s.touches;
    if (s.chas > seenCha) { seenCha = s.chas; ink(BX, s.y, 'g-qm-splash is-cha'); }
    if (s.beat && s.beat !== seenBeat) { seenBeat = s.beat; board.classList.remove('is-beat'); void board.offsetWidth; board.classList.add('is-beat'); }
    root.classList.toggle('is-dark', (s.level.dark ?? []).some((d) => s.x >= d.from && s.x <= d.to));
    root.classList.toggle('is-titled', s.phase === 'ready' && s.first);
    for (const z of turns) z.classList.toggle('is-flipped', flipOf(s, s.level.currents[Number(z.dataset.cur)]) < 0);
  };

  return new Promise((resolve) => {
    let done = false, raf = 0, prev = win.performance.now(), keyDown = false, pointerDown = false;
    const off = [];
    const on = (el, type, fn, o) => { el.addEventListener(type, fn, o); off.push(() => el.removeEventListener(type, fn, o)); };
    off.push(() => ro?.disconnect());
    const finish = (r) => { if (done) return; done = true; win.cancelAnimationFrame(raf); off.forEach((f) => f()); resolve(r); };
    const settle = () => {
      root.classList.add('is-won');
      paint();
      done = true; win.cancelAnimationFrame(raf); off.forEach((f) => f());
      win.setTimeout(() => resolve({ won: true, stars: s.stars, grade: s.grade }), winHold);
    };
    const apply = (g, el) => {
      const r = act(s, { g });
      if (r.refused && el) nope(el);
      if (!r.refused && g === 'hold') pulse('in');
      if (!r.refused && g === 'release') pulse('out');
      if (!r.refused && g === 'restart') { seenTouch = 0; seenCha = 0; last = { head: '', say: '', cls: '' }; }
      paint();
    };
    const press = (el) => { if (!s.holding) apply('hold', el); };
    const lift = () => { if (!keyDown && !pointerDown) apply('release'); };
    const frame = (now) => {
      if (done) return;
      const dt = Math.min(100, now - prev);
      prev = now;
      if (doc.visibilityState === 'visible' && !paused()) {
        s = tick(s, dt);
        // a finger (or Space) still down through a 岔气 breathes in again once the bead goes on
        if ((keyDown || pointerDown) && !s.holding && s.phase === 'play') { act(s, { g: 'hold' }); pulse('in'); }
        paint();
      }
      if (s.won) return settle();
      raf = win.requestAnimationFrame(frame);
    };
    on(board, 'pointerdown', (e) => {
      if (e.button !== 0 || paused()) return;
      e.preventDefault();
      pointerDown = true;
      try { board.setPointerCapture(e.pointerId); } catch { /* the document still hears it */ }
      press(bead);
    });
    const up = () => { if (!pointerDown) return; pointerDown = false; lift(); };
    on(doc, 'pointerup', up);
    on(doc, 'pointercancel', up);
    on(board, 'contextmenu', (e) => e.preventDefault());
    on(host, 'click', (e) => {
      const b = e.target.closest?.('[data-g="restart"]');
      if (b && host.contains(b)) apply('restart', b);
    });
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '') || e.target?.isContentEditable;
    on(doc, 'keydown', (e) => {
      if (e.code !== 'Space' || typing(e) || !host.isConnected || paused()) return;
      e.preventDefault();
      if (e.repeat || keyDown) return;
      keyDown = true;
      press(bead);
    });
    on(doc, 'keyup', (e) => { if (e.code !== 'Space' || !keyDown) return; e.preventDefault(); keyDown = false; lift(); });
    on(win, 'blur', () => { keyDown = false; pointerDown = false; lift(); });
    if (signal) {
      if (signal.aborted) return finish({ won: false, left: true });
      signal.addEventListener('abort', () => finish({ won: false, left: true }), { once: true });
    }
    paint();
    raf = win.requestAnimationFrame(frame);
  });
}
