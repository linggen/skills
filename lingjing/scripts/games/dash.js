// 几何冲刺 · the dash runner (Hanli 10-27: 「调息的不太好玩, 能换成geometry dash那种蹦着躲避障碍的吗」 · 「经典小游戏都可以用,
// 但别凭空编造」 · 「先找开源实现」). The classic one-button auto-runner (Geometry Dash's cube): the runner goes on by itself;
// a press jumps, and holding jumps again each time it lands; a press while touching an orb jumps again in the air; a pad
// throws it high. Spikes, blocks, pits and low ceilings; a touch of anything but a block's top ends the attempt and the
// run starts over (practice: from the last checkpoint passed, the win then a ★1). An attempt counter and a progress bar.
//
// The cube's physics are famidash's (github.com/tfdsoft/famidash, MIT © 2023-2024 TFDSoft: SAUCE/defines/
// physics_table_defines.txt — CUBE_SPEED, JUMP_VEL, CUBE_GRAVITY, CUBE_MAX_FALLSPEED, the yellow pad and orb heights,
// a 15/16-tile cube; SAUCE/gamemodes/gamemode_cube.h — hold buffers the jump on landing, a press on an orb), its px/s
// scaled from a 16 px tile to our 20-unit TILE. Its level format, collision and drawing are ours; none of its art or music.
//
// The beat is the music (the kit has no bed: a looped file could never stay in step through restarts): each level has
// its `bpm`, every thing is laid so the press that clears it falls ON a beat, and the board sounds a kick on each beat
// and a light tick on each off-beat from the same clock the runner moves by — mute silences it with everything else.
//
// A level (games.json rows with id `dash`, one level a row; every text {zh, en}):
//   id, title, book (the line under the title card), say (before the first press), end (the won line), grades {1,2,3}
//   speed   'slow' | 'half' | 'normal' | 'double' | 'triple' (famidash's) or u/s      bpm   beats a minute
//   len     beats to the end          cps   practice checkpoints, in beats (default: each quarter)
//   things  [[beat, kind, n?], …]: the press for it falls on `beat` —
//     s · ss · sss   one, two or three spikes in a row          b · bb   a block one or two tall to clear
//     pit (n tiles)  a gap in the ground                         ceil (n tiles)  a low roof: stay down (no press) under it
//     pad            a pad on the ground at the beat that throws the runner over a wide pit (no press)
//     orb (n tiles)  a jump, then a press on the orb at its height over a pit n tiles wide
//   land  the sky's palette (dawn · dusk · jade · mist · moon · star · cave: dash.css), or  backdrop  a picture under worlds/jiuding/art/
// Pure model (newGame / act / tick: the bots and tests); the page is `mount` (its own frame loop, pointer and Space).
import { forInput } from './kit/device.js';

export const TILE = 28; // a cube a little over a tenth of the view: the things read at a glance (10-27 live: 20 was too small)
const K = TILE / 16; // famidash's 16 px tile → ours
export const SPEEDS = { slow: 85.78125 * K, half: 133.8912134 * K, normal: 166.0181582 * K, double: 206.4516129 * K, triple: 249.5126706 * K };
export const JUMP = 333.75 * K; //      JUMP_VEL (u/s, up)
export const GRAV = 1504.6875 * K; //   CUBE_GRAVITY
export const MAXFALL = 360 * K; //      CUBE_MAX_FALLSPEED
export const PAD = 465 * K; //          the yellow pad's height row (sprite_gamemode_adjust_heights, cube)
export const ORB = 333.75 * K; //       the yellow orb's
export const SIZE = 15 * K; //          CUBE_WIDTH / CUBE_HEIGHT 0x0F
export const STEP_MS = 1000 / 60;
const DEAD_MS = 700, READY_MS = 900;
const CEIL_H = 1.25 * TILE; //          a low roof's underside over the ground (the cube passes under; a jump hits it)
const SPIKE_BOX = { w: 0.36 * TILE, h: 0.55 * TILE }; // a spike's hitbox, centred low (a cube grazes its tip)

export const W = 360;
export const H = 200;
export const GROUND = 160; //            the ground's top on the screen
export const RX = 96; //                 where the runner stands on the screen; the world scrolls under it

export const meta = {
  pause: true,
  id: 'dash',
  beat: 'mount',
  sounds: ['start', 'jump', 'die', 'beat', 'off', 'pad', 'orb', 'cp'],
  name: { zh: '几何冲刺', en: 'Dash' },
  how: { zh: '冲到底。点一下就跳，按住落地再跳；碰到刺、撞到墙、掉进坑，从头再来。', en: 'Reach the end. Tap to jump; hold to jump again on landing. Touch a spike, a wall or a pit and it starts over.' },
  restart: (s) => Boolean(s && !s.won && (s.attempt > 1 || s.x > 0)),
};

export const T = {
  zh: { attempt: '第 {n} 次', practice: '练习', practiceOn: '练习中', go: '点一下，冲', won: '到了。', dead: '碰上了——再来。', hint: { desk: '点 / 空格 跳 · 按住连跳', touch: '点一下跳 · 按住连跳' }, restart: '从头' },
  en: { attempt: 'Attempt {n}', practice: 'Practice', practiceOn: 'Practising', go: 'Tap to go', won: 'Through.', dead: 'Hit — again.', hint: { desk: 'Click / Space to jump · hold to keep jumping', touch: 'Tap to jump · hold to keep jumping' }, restart: 'Restart' },
};

/* ── The level, laid out once ─────────────────────────────────────────────────────────────── */

const speedOf = (L) => (typeof L.speed === 'number' ? L.speed : SPEEDS[L.speed] ?? SPEEDS.normal);
export const airtime = (v = JUMP) => (2 * v) / GRAV;

/** The level as things in the world: x in units from the start; spikes, blocks, pits, roofs, pads, orbs; its end. */
export function layout(L) {
  const v = speedOf(L), beatU = (v * 60) / (L.bpm ?? 120), D = v * airtime(), out = { v, beatU, spikes: [], blocks: [], pits: [], ceils: [], pads: [], orbs: [] };
  // the press at x0 = beat × beatU: the runner's left edge leaves there; the jump's middle is half its run further on
  const mid = (x0) => x0 + SIZE / 2 + D / 2;
  for (const [b, kind, n = 1] of L.things ?? []) {
    const x0 = b * beatU, m = mid(x0);
    if (/^s+$/.test(kind)) { const k = kind.length; for (let i = 0; i < k; i++) out.spikes.push({ x: m - (k * TILE) / 2 + i * TILE }); }
    else if (kind === 'b' || kind === 'bb') out.blocks.push({ x: m - TILE / 2, w: TILE, h: kind === 'bb' ? 2 * TILE : TILE });
    else if (kind === 'pit') out.pits.push({ x: m - (n * TILE) / 2, w: n * TILE });
    else if (kind === 'ceil') out.ceils.push({ x: x0, w: n * TILE });
    else if (kind === 'pad') { const Dp = v * airtime(PAD), w = Math.max(TILE, Math.floor(Dp / TILE - 1.5) * TILE); out.pads.push({ x: x0 + SIZE / 2 - TILE / 2, w: TILE }); out.pits.push({ x: x0 + SIZE + Dp / 2 - w / 2, w }); }
    else if (kind === 'orb') {
      // the jump at x0, the orb at its top (a press there jumps again), a pit under both arcs
      const apexX = x0 + v * (JUMP / GRAV), apexH = (JUMP * JUMP) / (2 * GRAV);
      out.orbs.push({ x: apexX + SIZE / 2, h: apexH + SIZE / 2 });
      // the second arc, from the orb's height: it lands well past where one jump would
      const t2 = (ORB + Math.sqrt(ORB * ORB + 2 * GRAV * apexH)) / GRAV, landX = apexX + v * t2;
      const from = x0 + SIZE + TILE * 0.5;
      out.pits.push({ x: from, w: Math.max(TILE, landX - TILE * 0.5 - from) });
    }
  }
  out.end = (L.len ?? 32) * beatU;
  out.cps = (L.cps ?? [0.25, 0.5, 0.75].map((k) => Math.round(k * (L.len ?? 32)))).map((b) => b * beatU);
  return out;
}

/* ── The game ─────────────────────────────────────────────────────────────────────────────── */

export function newGame(seed, _level = 1, deal = {}) {
  const level = deal?.levels?.[0] ?? deal?.level ?? null;
  if (!level?.things) return { seed: String(seed), live: false, won: false, phase: 'empty', level: null };
  return {
    seed: String(seed), level, lay: layout(level), live: true, won: false, grade: null, stars: 0,
    phase: 'ready', first: true, t: 0, clock: 0, acc: 0, x: 0, h: 0, vy: 0, grounded: true, holding: false, pressed: false,
    attempt: 1, deaths: 0, practice: false, cp: 0, cpAt: 0, best: 0, spin: 0, jumps: 0, pads: 0, orbs: 0, beat: 0, off: 0, deadAt: null,
  };
}

function restartAt(s, x) {
  Object.assign(s, { phase: 'ready', t: 0, x, h: 0, vy: 0, grounded: true, pressed: false, spin: 0, beat: Math.floor(x / s.lay.beatU), off: Math.floor(x / s.lay.beatU) });
  return s;
}

const VERBS = {
  hold(s) {
    if (s.phase === 'ready') { s.phase = 'play'; s.t = 0; s.first = false; s.holding = true; return s; } // the first tap starts the run
    if (s.phase !== 'play') return s.holding ? null : (s.holding = true, s);
    if (s.holding) return null;
    s.holding = true; s.pressed = true;
    return s;
  },
  release(s) { if (!s.holding) return null; s.holding = false; return s; },
  restart(s) { if (s.won) return null; s.attempt += 1; s.practice = false; s.cpAt = 0; return restartAt(s, 0); },
  practice(s) { if (s.won) return null; s.practice = !s.practice; s.cpAt = 0; s.attempt += 1; return restartAt(s, 0); },
};

/** An act: { g: 'hold' | 'release' | 'restart' | 'practice' }. */
export function act(state, data = {}) {
  if (!state?.live || state.won) return { state, won: false, refused: true };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false, refused: data.g !== 'release' };
  return { state: next, won: false };
}

const overlap = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;
const overPit = (s, x) => s.lay.pits.some((p) => x >= p.x && x + SIZE <= p.x + p.w);

function die(s) {
  s.phase = 'dead'; s.t = 0; s.deaths += 1; s.deadAt = { x: s.x, h: s.h }; s.holding = s.holding && true; s.pressed = false;
  s.best = Math.max(s.best, s.x / s.lay.end);
}

function step(s) {
  const dt = STEP_MS / 1000, L = s.lay;
  s.clock += STEP_MS; s.t += STEP_MS;
  if (s.phase === 'dead') {
    if (s.t >= DEAD_MS) { s.attempt += 1; restartAt(s, s.practice ? s.cpAt : 0); s.phase = 'play'; }
    return;
  }
  if (s.phase === 'ready') { if (!s.first && s.t >= READY_MS) s.phase = 'play'; return; }
  if (s.phase !== 'play') return;
  const x0 = s.x, h0 = s.h;
  // a pad under the cube throws it; holding (or a press) on the ground jumps; a press on an orb jumps again
  if (s.grounded && L.pads.some((p) => overlap(s.x, s.x + SIZE, p.x, p.x + p.w))) { s.vy = PAD; s.grounded = false; s.pads += 1; }
  else if (s.grounded && (s.holding || s.pressed)) { s.vy = JUMP; s.grounded = false; s.jumps += 1; }
  else if (!s.grounded && s.pressed && L.orbs.some((o) => Math.abs(s.x + SIZE / 2 - o.x) < TILE * 0.9 && Math.abs(s.h + SIZE / 2 - o.h) < TILE * 0.9)) { s.vy = ORB; s.orbs += 1; }
  s.pressed = false;
  if (!s.grounded) { s.vy = Math.max(-MAXFALL, s.vy - GRAV * dt); s.spin += 330 * dt; }
  s.x += L.v * dt;
  s.h += s.vy * dt;
  // the floor: the ground (none over a pit) and the blocks' tops, landed on from above
  let floor = overPit(s, s.x) ? -Infinity : 0;
  for (const b of L.blocks) if (overlap(s.x, s.x + SIZE, b.x, b.x + b.w) && h0 >= b.h - 1) floor = Math.max(floor, b.h);
  if (s.h <= floor && s.vy <= 0) { s.h = floor; s.vy = 0; if (!s.grounded) s.spin = Math.round(s.spin / 90) * 90; s.grounded = true; }
  else if (s.h > floor) s.grounded = false;
  // what ends the attempt: a block's side, a spike, a roof, the pit's bottom
  for (const b of L.blocks) if (overlap(s.x, s.x + SIZE, b.x, b.x + b.w) && s.h < b.h - 1) return die(s);
  for (const k of L.spikes) if (overlap(s.x, s.x + SIZE, k.x + (TILE - SPIKE_BOX.w) / 2, k.x + (TILE + SPIKE_BOX.w) / 2) && s.h < SPIKE_BOX.h) return die(s);
  for (const c of L.ceils) if (overlap(s.x, s.x + SIZE, c.x, c.x + c.w) && s.h + SIZE > CEIL_H) return die(s);
  if (s.h < -TILE * 2) return die(s);
  // the beat: a kick on each, a tick on each off-beat, by where the runner is (so a restart keeps the step)
  const b = Math.floor(s.x / L.beatU), o = Math.floor(s.x / L.beatU + 0.5);
  if (b > s.beat) s.beat = b;
  if (o > s.off) s.off = o;
  if (s.practice) for (const c of L.cps) if (x0 < c && s.x >= c && s.grounded) s.cpAt = c;
  s.best = Math.max(s.best, s.x / L.end);
  if (s.x >= L.end) {
    s.x = L.end; s.phase = 'won'; s.won = true; s.live = false; s.holding = false; s.best = 1;
    s.stars = s.practice ? 1 : s.attempt <= 3 ? 3 : s.attempt <= 8 ? 2 : 1;
    s.grade = s.level.grades?.[s.stars] ?? (s.stars === 3 ? 'clean' : 'through');
  }
}

/** Run the world on by `ms` (any clock: a fixed 1/60 s step inside). */
export function tick(state, ms) {
  if (!state?.live || state.won) return state;
  state.acc += ms;
  while (state.acc >= STEP_MS && !state.won) { state.acc -= STEP_MS; step(state); }
  return state;
}

/** Tried and tried: the page may offer its 「算了，往下走」 (stuck.js). */
export const stuck = (s) => (s?.attempt ?? 0) >= 8;
export const progress = (s) => Math.max(0, Math.min(1, s.x / s.lay.end));

/** What a stretch of play sounded (games/kit/heard.js), read off its counts. */
export const soundSnap = (s) => ({ live: s.phase === 'play', jumps: s.jumps, deaths: s.deaths, beat: s.beat, off: s.off, pads: s.pads, orbs: s.orbs, cpAt: s.cpAt, attempt: s.attempt });
export function sounds(b, a) {
  if (!b || !a) return [];
  const out = [];
  if (!b.live && a.live && a.attempt === 1) out.push('start');
  if (a.deaths > b.deaths) return [...out, 'die'];
  if (a.jumps > b.jumps) out.push('jump');
  if (a.pads > b.pads) out.push('pad');
  if (a.orbs > b.orbs) out.push('orb');
  if (a.beat > b.beat && a.live) out.push('beat');
  else if (a.off > b.off && a.live) out.push('off');
  if (a.cpAt > b.cpAt) out.push('cp');
  return out;
}

/* ── The page ─────────────────────────────────────────────────────────────────────────────── */

const fmt = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const esc = (v) => String(v ?? '').replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
const tr = (o, lang) => (o ? o[lang] ?? o.zh ?? '' : '');
const world = (path) => new URL(`../../worlds/jiuding/art/${path}`, import.meta.url).href;
export const LANDS = ['dawn', 'dusk', 'jade', 'mist', 'moon', 'star', 'cave'];
const landOf = (L) => (LANDS.includes(L?.land) ? L.land : 'dusk');

/* ── The look: flat comic shapes drawn here (Hanli 10-28: 「做成漫画风格就行. 背景简单一些. 现在障碍物看不清」) ──────────────
   One calm sky per land (dash.css's [data-land] palette) and one faint far ridge; the things in bold black outlines and
   flat cel shades: what kills is always the one red (spikes, a roof's underside), what carries is solid ground (blocks
   in the ground's colours), the pad yellow, the orb cyan, the runner a white 灵珠. Every shape covers its hitbox:
   a spike's triangle holds SPIKE_BOX, a block is its square, a pad its tile, an orb's ring its reach. */
const SPIKE = { half: 0.46 * TILE, tall: 0.94 * TILE }; // the drawn triangle: SPIKE_BOX's corners lie inside it
export const spikeHolds = () => SPIKE.half * (1 - SPIKE_BOX.h / SPIKE.tall) >= SPIKE_BOX.w / 2;
const ORB_R = 0.42 * TILE, ORB_REACH = 0.9 * TILE, TRAIL = 5;

function spikeSvg(k) {
  const c = k.x + TILE / 2, l = c - SPIKE.half, r = c + SPIKE.half, top = GROUND - SPIKE.tall;
  return `<g class="g-dash-spike"><path class="g-dash-spike-lit" d="M${fmt(l)} ${GROUND}L${fmt(c)} ${fmt(top)}L${fmt(r)} ${GROUND}Z"/>`
    + `<path class="g-dash-spike-shade" d="M${fmt(c)} ${fmt(top)}L${fmt(r)} ${GROUND}L${fmt(c + 1)} ${GROUND}Z"/>`
    + `<path class="g-dash-spike-glint" d="M${fmt(c - 2.2)} ${fmt(top + 7)}L${fmt(l + 6)} ${GROUND - 4}"/>`
    + `<path class="g-dash-ink" d="M${fmt(l)} ${GROUND}L${fmt(c)} ${fmt(top)}L${fmt(r)} ${GROUND}Z"/></g>`;
}
function blockSvg(b) {
  const n = Math.round(b.h / TILE);
  return Array.from({ length: n }, (_, i) => {
    const y0 = GROUND - (i + 1) * TILE;
    return `<g class="g-dash-block"><rect class="g-dash-block-face" x="${fmt(b.x)}" y="${fmt(y0)}" width="${TILE}" height="${TILE}"/>`
      + `<rect class="g-dash-block-shade" x="${fmt(b.x)}" y="${fmt(y0 + TILE * 0.72)}" width="${TILE}" height="${fmt(TILE * 0.28)}"/>`
      + (i === n - 1 ? `<rect class="g-dash-lip" x="${fmt(b.x)}" y="${fmt(y0)}" width="${TILE}" height="4"/>` : '')
      + `<rect class="g-dash-block-inset" x="${fmt(b.x + 6)}" y="${fmt(y0 + 7)}" width="${TILE - 12}" height="${TILE - 13}" rx="2"/>`
      + `<rect class="g-dash-ink" x="${fmt(b.x)}" y="${fmt(y0)}" width="${TILE}" height="${TILE}" rx="1.5"/></g>`;
  }).join('');
}
function padSvg(p) {
  const l = p.x, r = p.x + TILE, c = p.x + TILE / 2, hy = GROUND - TILE * 0.3;
  return `<g class="g-dash-pad"><g class="g-dash-pulse"><path class="g-dash-pad-ray" d="M${fmt(c - 7)} ${fmt(hy - 5)}l7 -7l7 7M${fmt(c - 7)} ${fmt(hy - 13)}l7 -7l7 7"/></g>`
    + `<path class="g-dash-pad-face" d="M${fmt(l)} ${GROUND}Q${fmt(l)} ${fmt(hy)} ${fmt(c)} ${fmt(hy)}Q${fmt(r)} ${fmt(hy)} ${fmt(r)} ${GROUND}Z"/>`
    + `<path class="g-dash-pad-glint" d="M${fmt(l + 6)} ${GROUND - 3}Q${fmt(l + 7)} ${fmt(hy + 3)} ${fmt(c - 2)} ${fmt(hy + 2.5)}"/>`
    + `<path class="g-dash-ink" d="M${fmt(l)} ${GROUND}Q${fmt(l)} ${fmt(hy)} ${fmt(c)} ${fmt(hy)}Q${fmt(r)} ${fmt(hy)} ${fmt(r)} ${GROUND}Z"/></g>`;
}
function orbSvg(o) {
  const cx = fmt(o.x), cy = fmt(GROUND - o.h);
  return `<g class="g-dash-orb"><g class="g-dash-pulse"><circle class="g-dash-orb-reach" cx="${cx}" cy="${cy}" r="${fmt(ORB_REACH)}"/></g>`
    + `<circle class="g-dash-orb-face" cx="${cx}" cy="${cy}" r="${fmt(ORB_R)}"/><circle class="g-dash-orb-core" cx="${cx}" cy="${cy}" r="${fmt(ORB_R * 0.45)}"/>`
    + `<circle class="g-dash-orb-glint" cx="${fmt(o.x - ORB_R * 0.4)}" cy="${fmt(GROUND - o.h - ORB_R * 0.4)}" r="2.2"/>`
    + `<circle class="g-dash-ink" cx="${cx}" cy="${cy}" r="${fmt(ORB_R)}"/></g>`;
}

/** The world, in world units (y down from the screen's top; the ground's top at GROUND), scrolled by one transform. */
function worldSvg(s) {
  const L = s.lay, y = (h) => GROUND - h, X0 = -RX - 40, X1 = L.end + W, B = H + 20;
  // the ground: a flat band from GROUND down, cut where the pits are, each piece outlined (its top the jump line)
  const cuts = [...L.pits].sort((a, b) => a.x - b.x);
  let from = X0;
  const ground = [];
  for (const p of cuts) { if (p.x > from) ground.push([from, p.x]); from = Math.max(from, p.x + p.w); }
  ground.push([from, X1]);
  const groundSvg = ground.map(([a, b]) => `<rect class="g-dash-ground" x="${fmt(a)}" y="${GROUND}" width="${fmt(b - a)}" height="${B - GROUND}"/>`
    + `<rect class="g-dash-ground-low" x="${fmt(a)}" y="${GROUND + 16}" width="${fmt(b - a)}" height="${B - GROUND - 16}"/>`
    + `<rect class="g-dash-lip" x="${fmt(a)}" y="${GROUND}" width="${fmt(b - a)}" height="4"/>`
    + `<path class="g-dash-ink" d="M${fmt(a)} ${B}V${GROUND}H${fmt(b)}V${B}"/>`).join('');
  const pits = L.pits.map((p) => `<rect class="g-dash-pit" x="${fmt(p.x)}" y="${GROUND + 6}" width="${fmt(p.w)}" height="${B - GROUND - 6}"/>`).join('');
  const ceils = L.ceils.map((c) => `<g class="g-dash-ceil"><rect class="g-dash-block-face" x="${fmt(c.x)}" y="-20" width="${fmt(c.w)}" height="${fmt(y(CEIL_H) + 20)}"/>`
    + `<rect class="g-dash-danger" x="${fmt(c.x)}" y="${fmt(y(CEIL_H) - 5)}" width="${fmt(c.w)}" height="5"/>`
    + `<path class="g-dash-ink" d="M${fmt(c.x)} -20V${fmt(y(CEIL_H))}H${fmt(c.x + c.w)}V-20"/></g>`).join('');
  const cps = s.practice ? L.cps.map((c) => `<path class="g-dash-cp" d="M${fmt(c)} ${GROUND}v-30l12 6l-12 6"/>`).join('') : '';
  const gx = L.end, goal = `<g class="g-dash-goal"><path class="g-dash-goal-flag" d="M${fmt(gx)} ${GROUND - 64}h26l-7 9l7 9h-26z"/>`
    + `<path class="g-dash-ink" d="M${fmt(gx)} ${GROUND}V${GROUND - 66}"/><path class="g-dash-ink" d="M${fmt(gx)} ${GROUND - 64}h26l-7 9l7 9h-26z"/></g>`;
  return `${pits}${ceils}${groundSvg}${L.pads.map(padSvg).join('')}${L.blocks.map(blockSvg).join('')}${L.spikes.map(spikeSvg).join('')}${L.orbs.map(orbSvg).join('')}${cps}${goal}`;
}

/** One faint ridge far back, scrolled at a tenth of the pace (the only thing behind the play line). */
export const FAR_K = 0.1;
function farSvg(L) {
  const x1 = (L.end + W) * FAR_K + W + 40, pts = [];
  for (let x = -20; x <= x1; x += 10) pts.push(`${x} ${fmt(GROUND - 22 - 13 * Math.sin(x / 47) - 7 * Math.sin(x / 19 + 1.3))}`);
  return `<path class="g-dash-far" d="M-20 ${GROUND + 2}L${pts.join('L')}L${fmt(x1)} ${GROUND + 2}Z"/>`;
}

/** The runner: a white 灵珠, outlined, a gold fleck that turns as it spins, a short trail behind. */
function runnerSvg(s) {
  const r = SIZE / 2, ty = fmt(GROUND - s.h - SIZE);
  const trail = Array.from({ length: TRAIL }, (_, i) => `<circle cx="${fmt(RX + r)}" cy="${fmt(GROUND - s.h - r)}" r="${fmt(r * (0.78 - i * 0.12))}" style="opacity:0"/>`).join('');
  return `<g class="g-dash-trail">${trail}</g><g class="g-dash-runner" transform="translate(${RX} ${ty})">`
    + `<circle class="g-dash-pearl" cx="${fmt(r)}" cy="${fmt(r)}" r="${fmt(r)}"/>`
    + `<path class="g-dash-pearl-shade" d="M${fmt(r * 0.25)} ${fmt(r * 1.55)}A${fmt(r)} ${fmt(r)} 0 0 0 ${fmt(r * 1.9)} ${fmt(r * 0.7)}A${fmt(r * 1.1)} ${fmt(r * 1.1)} 0 0 1 ${fmt(r * 0.25)} ${fmt(r * 1.55)}Z"/>`
    + `<g class="g-dash-spin" transform="rotate(${fmt(s.spin)} ${fmt(r)} ${fmt(r)})"><circle class="g-dash-seam" cx="${fmt(r * 1.42)}" cy="${fmt(r * 1.2)}" r="${fmt(r * 0.2)}"/></g>`
    + `<circle class="g-dash-pearl-glint" cx="${fmt(r * 0.62)}" cy="${fmt(r * 0.6)}" r="${fmt(r * 0.2)}"/>`
    + `<circle class="g-dash-ink" cx="${fmt(r)}" cy="${fmt(r)}" r="${fmt(r)}"/></g>`;
}

/** Behind it all: the land's calm sky (dash.css), or the scene's own picture, quietened. */
function backHtml(L) {
  if (L.backdrop) return `<div class="g-dash-back is-picture" style="background-image:url(${world(L.backdrop)})"></div>`;
  return `<div class="g-dash-back"></div>`;
}

function headHtml(s, t) {
  return `<span class="g-dash-attempt">${t.attempt.replace('{n}', s.attempt)}</span>`
    + `<span class="g-dash-bar"><i style="width:${Math.round(progress(s) * 100)}%"></i></span><b class="g-dash-pct">${Math.round(progress(s) * 100)}%</b>`;
}
function sayOf(s, t, lang) {
  if (s.won) return tr(s.level.end, lang) || t.won;
  if (s.phase === 'dead') return t.dead;
  if (s.phase === 'ready' && s.first) return tr(s.level.say, lang) || t.go;
  return tr(s.level.book, lang);
}

/** The board's whole markup for a state (the page lays it once, then moves it each frame). */
export function html(s, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (!s.level) return `<div class="g-dash g-ink"><p class="g-line-say">—</p></div>`;
  const card = `<div class="g-qm-card g-dash-card"><b>${esc(tr(s.level.title, lang))}</b><span>${esc(tr(s.level.book, lang))}</span></div>`;
  return `<div class="g-dash g-ink${s.won ? ' is-won' : ''}${s.phase === 'ready' && s.first ? ' is-titled' : ''}${s.practice ? ' is-practice' : ''}" data-level="${esc(s.level.id ?? '')}">`
    + `<div class="g-head g-dash-head">${headHtml(s, t)}</div>`
    + `<div class="g-dash-board g-hold" data-g-hold="" data-land="${landOf(s.level)}">${backHtml(s.level)}`
    + `<svg class="g-scene g-dash-scene" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tr(s.level.title ?? meta.name, lang))}" focusable="false">`
    + `${s.level.backdrop ? '' : `<g class="g-dash-far-g" transform="translate(${fmt(-s.x * FAR_K)} 0)">${farSvg(s.lay)}</g>`}`
    + `<g class="g-dash-world" transform="translate(${fmt(RX - s.x)} 0)">${worldSvg(s)}</g>${runnerSvg(s)}<g class="g-dash-fx"></g></svg>${card}</div>`
    + `<p class="g-line-say">${esc(sayOf(s, t, lang))}</p>`
    + `<div class="g-qm-row"><span class="g-qm-hint">${forInput(t.hint)}</span><span class="g-dash-tools"><button type="button" class="g-btn g-btn-quiet g-dash-practice" data-g="practice">${s.practice ? t.practiceOn : t.practice}</button></span></div>`
    + `</div>`;
}

/* ── Levels ───────────────────────────────────────────────────────────────────────────────── */

/** Every level of the kit's rows, each carrying its row's name. */
export function ladderOf(registry) {
  return (registry?.games ?? []).filter((g) => g.id === meta.id && !g.replaced).flatMap((g) => (g.levels ?? []).map((l) => ({ name: g.name, ...l })));
}
export async function levelFor(opts = {}) {
  if (opts.data?.levels?.length) return opts.data.levels[0];
  const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
  const all = ladderOf(await res.json());
  return all.find((l) => l.id === opts.data?.level) ?? all[0] ?? null;
}

function ensureCss(doc) {
  if (doc.getElementById('g-dash-css')) return;
  for (const [id, name] of [['g-qimai-css', 'qimai'], ['g-dash-css', 'dash']]) {
    if (doc.getElementById(id)) continue;
    const l = doc.createElement('link');
    l.id = id; l.rel = 'stylesheet'; l.href = new URL(`./${name}.css`, import.meta.url).href;
    doc.head.appendChild(l);
  }
}

/* ── Standalone: the mount contract (games/mount.js) — its own frame loop, pointer and Space ─── */

export async function mount(container, opts = {}) {
  const { lang = 'zh', seed = String(Date.now()), signal, winHold = 1600, shell } = opts;
  const paused = () => Boolean(shell?.paused?.());
  const doc = container.ownerDocument, win = doc.defaultView;
  ensureCss(doc);
  const level = await levelFor(opts);
  let s = newGame(seed, 1, { levels: level ? [level] : [] });
  opts.peek?.(() => s);
  const host = doc.createElement('div');
  host.className = 'game g-mounted';
  container.replaceChildren(host);
  const lay = () => { host.innerHTML = html(s, lang); bind(); };
  let board, worldG, farG, runner, spin, head, say, root, trail = [];
  const bind = () => {
    const $ = (q) => host.querySelector(q);
    board = $('.g-dash-board'); worldG = $('.g-dash-world'); farG = $('.g-dash-far-g'); runner = $('.g-dash-runner'); spin = $('.g-dash-spin');
    head = $('.g-dash-head'); say = $('.g-line-say'); root = $('.g-dash');
    trail = [...host.querySelectorAll('.g-dash-trail circle')];
  };
  lay();
  if (!s.live) return { won: false, left: true };
  const t = T[lang] || T.zh;
  let last = { head: '', say: '', practice: s.practice }, heard = soundSnap(s), past = [];
  // the trail: where the runner was a few frames back, drawn behind it (gone on a restart or a hit)
  const paintTrail = () => {
    if (s.phase !== 'play' || (past.length && s.x < past[past.length - 1].x)) past = [];
    if (s.phase === 'play') { past.push({ x: s.x, h: s.h }); if (past.length > TRAIL * 3 + 1) past.shift(); }
    const r = SIZE / 2;
    trail.forEach((c, i) => {
      const p = past[past.length - 1 - (i + 1) * 3];
      if (!p) { c.style.opacity = '0'; return; }
      c.setAttribute('cx', fmt(RX + r + p.x - s.x)); c.setAttribute('cy', fmt(GROUND - p.h - r)); c.style.opacity = '';
    });
  };
  const paint = () => {
    const now = soundSnap(s);
    for (const e of sounds(heard, now)) shell?.sound?.(e);
    heard = now;
    if (s.practice !== last.practice) { last = { head: '', say: '', practice: s.practice }; lay(); }
    worldG.setAttribute('transform', `translate(${fmt(RX - s.x)} 0)`);
    runner.setAttribute('transform', `translate(${RX} ${fmt(GROUND - s.h - SIZE)})`);
    spin.setAttribute('transform', `rotate(${fmt(s.spin)} ${fmt(SIZE / 2)} ${fmt(SIZE / 2)})`);
    farG?.setAttribute('transform', `translate(${fmt(-s.x * FAR_K)} 0)`);
    paintTrail();
    const h = headHtml(s, t);
    if (h !== last.head) { head.innerHTML = h; last.head = h; }
    const line = sayOf(s, t, lang);
    if (line !== last.say) { say.textContent = line; last.say = line; }
    root.classList.toggle('is-dead', s.phase === 'dead');
    root.classList.toggle('is-titled', s.phase === 'ready' && s.first);
    const re = host.closest('.gshell')?.querySelector(':scope > .gshell-bar [data-g="restart"]');
    if (re) re.disabled = !meta.restart(s);
  };

  return new Promise((resolve) => {
    let done = false, raf = 0, prev = win.performance.now(), keyDown = false, pointerDown = false;
    const off = [];
    const on = (el, type, fn, o) => { el.addEventListener(type, fn, o); off.push(() => el.removeEventListener(type, fn, o)); };
    const finish = (r) => { if (done) return; done = true; win.cancelAnimationFrame(raf); off.forEach((f) => f()); resolve(r); };
    const settle = () => {
      root.classList.add('is-won'); paint();
      done = true; win.cancelAnimationFrame(raf); off.forEach((f) => f());
      win.setTimeout(() => resolve({ won: true, stars: s.stars, grade: s.grade }), winHold);
    };
    const apply = (g) => { act(s, { g }); paint(); };
    const press = () => { if (!s.holding) apply('hold'); };
    const lift = () => { if (!keyDown && !pointerDown) apply('release'); };
    const frame = (now) => {
      if (done) return;
      const dt = Math.min(100, now - prev);
      prev = now;
      if (doc.visibilityState === 'visible' && !paused()) { s = tick(s, dt); paint(); }
      if (s.won) return settle();
      raf = win.requestAnimationFrame(frame);
    };
    on(host, 'pointerdown', (e) => {
      if (e.button !== 0 || paused() || !e.target.closest?.('.g-dash-board')) return;
      e.preventDefault();
      pointerDown = true;
      try { board.setPointerCapture(e.pointerId); } catch { /* the document still hears it */ }
      press();
    });
    const up = () => { if (!pointerDown) return; pointerDown = false; lift(); };
    on(doc, 'pointerup', up);
    on(doc, 'pointercancel', up);
    on(host, 'contextmenu', (e) => { if (e.target.closest?.('.g-dash-board')) e.preventDefault(); });
    on(host, 'click', (e) => { if (e.target.closest?.('[data-g="practice"]')) apply('practice'); });
    // the shell's ↺ (games/shell.js restartHtml) in the frame's bar: this board's
    on(doc, 'click', (e) => {
      const b = e.target.closest?.('[data-g="restart"]');
      if (b && b.closest('.gshell') && b.closest('.gshell') === host.closest('.gshell')) apply('restart');
    });
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '') || e.target?.isContentEditable;
    on(doc, 'keydown', (e) => {
      if ((e.code !== 'Space' && e.code !== 'ArrowUp') || typing(e) || !host.isConnected || paused()) return;
      e.preventDefault();
      if (e.repeat || keyDown) return;
      keyDown = true;
      press();
    });
    on(doc, 'keyup', (e) => { if ((e.code !== 'Space' && e.code !== 'ArrowUp') || !keyDown) return; e.preventDefault(); keyDown = false; lift(); });
    on(win, 'blur', () => { keyDown = false; pointerDown = false; lift(); });
    if (signal) {
      if (signal.aborted) return finish({ won: false, left: true });
      signal.addEventListener('abort', () => finish({ won: false, left: true }), { once: true });
    }
    paint();
    raf = win.requestAnimationFrame(frame);
  });
}
