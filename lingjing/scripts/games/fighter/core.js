// fighter/core.js — 格斗: the side-view 1v1 (Hanli 10-26: 「街霸好做吗? 拳皇之类的」 → 「好, 先做秦雁那一场」). Pure and
// seeded: newGame · act · tick · sounds, no DOM, no clock of its own — the mount (games/fighter.js) runs it on the page,
// the bot (games/bots/fighter.js) and the tests in node. Nothing here knows 秦雁: a bout is a level (games.json rows of
// `fighter`), and a later bout (祁长松, 斗法, a beast) adds a level, never code.
//
// The field is one line across a stage (x in units, 0…STAGE.w; y up from the boards). The player (`me`) and the foe
// (`foe`) never pass through each other but by one move (迎, below). Each has a bar: his 血 (hp), her 稳 (footing,
// `bal`) — an eighth layer is never beaten by a count of hits: her bar only says how loose she stands, and a loose
// foe slides further when hit. She leaves the stage only over the stage's slick (`stage.oil`, 那摊红油) off its edge.
//
// His hands: walk (dir), jump, light (拳), heavy (勾 — a hunter's hook at the leg), special (法术, `me.special`, with a
// cooldown), block (a button, or holding away from her). Presses are buffered (BUF_MS), so a tap during a move lands
// as the move ends — a fast thumb on the phone is never lost.
//
// Her moves (`foe.moves`) are data; two are tricks the book has (doc/games.md § 格斗):
//   edge   at the stage's edge, her point at his throat (Ahe's 底册: 「到了台边，往前送一寸」): a guard, then the push
//          (`tell`). A fresh press in the tell — forward or any blow — is 迎: in along the flat of the blade (a cut
//          on the arm), and he comes out on her far side, she where he stood. Too soon (`early`) and she waits again;
//          nothing in the tell and the inch comes: a heavy blow at the edge.
//   palm   the green palm (左掌一翻，掌心里亮起一层青光): `glow` (she stands through any blow), `hold` — she holds back
//          three tenths (「她收了三分」), her weight on her rear foot — then `strike`, landing at that share and never the
//          last of him (大比不许伤人性命), and `after`, still loose. His heavy in `hold` or `after` hooks her rear foot:
//          over the slick, she skids off the edge (the win); elsewhere she staggers and keeps her feet.
// She never strikes a man who is down (「不踩人」), and the 雷符 in her sleeve is never drawn.
//
// The grade: `clean` when no palm landed on him, `clumsy` when one did (the level's `won` lines say which); stars 3
// clean, 2 clumsy, 1 clumsy with little left of him. Lost at hp 0.

export const STEP_MS = 10; //   one physics step; tick(ms) runs as many as fit (the same ms → the same bout)
export const BUF_MS = 160; //   how long a press waits for his hands to be free
export const END_MS = 1700; //  the last frame (her slide off the edge, his fall) before the bout is over
export const GRAVITY = 2600;
export const GAP = 58; //       the least distance between two bodies

/* The stage, in units: the boards from `left` to `right`, the slick at the left edge (the corner he chose). */
export const STAGE = { w: 960, left: 140, right: 930, oil: { from: 140, to: 250 } };

/* His moves (frames in ms): startup · active · recover; reach in units; dmg to her 稳; push (units). */
export const ME = {
  hp: 100, speed: 230, jump: 860,
  light: { startup: 70, active: 90, recover: 150, reach: 108, dmg: 3, push: 30, stun: 260 },
  heavy: { startup: 190, active: 110, recover: 330, reach: 128, dmg: 7, push: 70, stun: 420, hook: true },
  special: { kind: 'fire', startup: 210, recover: 260, speed: 640, dmg: 6, push: 260, stun: 300, cd: 5000 },
};

/* Her moves and her mind. `share` is what lands of a held-back palm. */
export const FOE = {
  bal: 100, speed: 150, back: 120, keep: 200,
  moves: {
    poke: { startup: 330, active: 120, recover: 400, reach: 236, dmg: 3, push: 46, stun: 300 },
    thrust: { startup: 540, active: 160, recover: 640, reach: 268, lunge: 70, dmg: 6, push: 96, stun: 420 },
    ice: { startup: 460, recover: 420, count: 3, gap: 110, speed: 540, dmg: 3, push: 24, stun: 220, at: 104, cd: 4200 },
    edge: { guard: [1300, 1100, 1500], tell: 620, dmg: 14, cut: 6, cd: 6500, near: 80, after: 24 },
    palm: { glow: 900, hold: 560, strike: 120, after: 1150, reach: 104, dmg: 100, share: 0.3, push: 70, cd: 9000, under: 55 },
    block: { hold: 460 },
  },
  ai: { think: 300, block: 0.3, soft: 10, softBy: 0.5, drive: 40 },
};

/* ── A seeded random source (mulberry32), kept in the state as one integer. ── */
const hash = (seed) => { let a = 1779033703; for (const ch of String(seed)) a = Math.imul(a ^ ch.codePointAt(0), 3432918353) >>> 0; return a >>> 0; };
function roll(s) {
  s.rng = (s.rng + 0x6D2B79F5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ── The level ── */
const merge = (a, b) => {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b ?? a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = a?.[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? merge(a[k], v) : v;
  return out;
};
/** The numbers a level plays: the kit's, with the level's own laid on (`me`, `foe`, `stage`). */
export function rulesOf(level = {}) {
  return { me: merge(ME, level.me?.rules), foe: merge(FOE, level.foe?.rules), stage: merge(STAGE, level.stage) };
}
const dealt = (deal) => deal?.levels?.[0] ?? (deal?.level && typeof deal.level === 'object' ? deal.level : null) ?? {};

/** A fresh bout. `deal` as a board is dealt (sneeze's way): `levels[0]`, or a level object as `level`. */
export function newGame(seed = 'fighter', _n = 1, deal = {}) {
  const level = dealt(deal), R = rulesOf(level);
  const mid = (R.stage.left + R.stage.right) / 2;
  return {
    seed: String(seed), rng: hash(seed), t: 0, live: true, won: false, lost: false, grade: null, stars: null,
    level, R,
    me: { x: mid - 70, y: 0, vx: 0, vy: 0, face: 1, hp: R.me.hp, act: null, stun: 0, cd: 0, guard: false, air: false },
    foe: { x: mid + 150, y: 0, vx: 0, face: -1, bal: R.foe.bal, act: null, stun: 0, think: 900, cd: { ice: 2500, palm: 0, edge: 0 }, moves: 0 },
    in: { dir: 0, block: false }, buf: [], order: 1,
    shots: [], fx: [], n: 0,
    edge: null, palm: null, end: null,
    palmLanded: 0, hooked: false, early: 0,
    cue: null, line: null,
    snd: {},
  };
}

/* ── Small helpers ── */
const clone = (s) => ({ ...s, me: { ...s.me }, foe: { ...s.foe, cd: { ...s.foe.cd } }, in: { ...s.in }, buf: [...s.buf], shots: s.shots.map((x) => ({ ...x })), fx: [...s.fx], snd: { ...s.snd } });
const bump = (s, k) => { s.snd[k] = (s.snd[k] ?? 0) + 1; };
const say = (s, key) => { s.line = { key, at: s.t }; };
const fx = (s, kind, x, y, extra = {}) => { s.n += 1; s.fx.push({ kind, x, y, at: s.t, id: s.n, ...extra }); if (s.fx.length > 24) s.fx.shift(); };
const side = (s) => s.order ?? (Math.sign(s.foe.x - s.me.x) || 1); // where she stands from him: kept, so a lunge never crosses him
const dist = (s) => Math.abs(s.foe.x - s.me.x);
const onOil = (s, x) => x >= s.R.stage.oil.from && x <= s.R.stage.oil.to;
/** Over the slick: where she stands. */
export const foeOnOil = (s) => onOil(s, s.foe.x);
/** Near an edge of the stage with his back to it: -1 the left edge, 1 the right, 0 neither. */
export function cornered(s, near = s.R.foe.moves.edge.near) {
  const back = -side(s);
  if (back < 0 && s.me.x - s.R.stage.left <= near) return -1;
  if (back > 0 && s.R.stage.right - s.me.x <= near) return 1;
  return 0;
}
const phaseOf = (act, t) => {
  if (!act) return null;
  const e = t - act.at, m = act.m;
  if (e < m.startup) return 'startup';
  if (e < m.startup + (m.active ?? 0)) return 'active';
  if (e < m.startup + (m.active ?? 0) + m.recover) return 'recover';
  return 'done';
};
const busy = (who, t) => Boolean(who.act) || who.stun > t;

/* ── His hands ── */
const PRESS = new Set(['jump', 'light', 'heavy', 'special']);
/** The player's hand: `walk` { dir: -1 | 0 | 1 } (screen left/right), `block` { on }, and the presses jump · light ·
    heavy · special. Answers { state } (the same state when nothing changed). */
export function act(state, d = {}) {
  if (!state || state.won || state.lost || state.end) return { state, won: false };
  const g = d.g;
  if (g === 'walk') {
    const dir = Math.sign(Number(d.dir) || 0);
    if (dir === state.in.dir) return { state, won: false };
    const s = clone(state);
    s.in.dir = dir;
    // A fresh step toward her is a press too (迎 in the edge's tell).
    if (dir && dir === side(s)) pressed(s, 'forward');
    return { state: s, won: false };
  }
  if (g === 'block') {
    const on = Boolean(d.on);
    if (on === state.in.block) return { state, won: false };
    const s = clone(state);
    s.in.block = on;
    return { state: s, won: false };
  }
  if (PRESS.has(g)) {
    const s = clone(state);
    if (!pressed(s, g)) s.buf = [...s.buf.filter((b) => s.t - b.at <= BUF_MS), { k: g, at: s.t }];
    return { state: s, won: false };
  }
  return { state, won: false };
}

/* A press while her point is at his throat answers the edge, and is spent there. */
function pressed(s, k) {
  const e = s.edge;
  if (!e || s.me.stun > s.t) return false;
  if (e.phase === 'guard') {
    s.early += 1;
    e.early += 1;
    say(s, 'edgeEarly');
    bump(s, 'early');
    if (e.early >= 3) { edgeFail(s, 'edgeRead'); return true; }
    e.at = s.t; // she waits again
    e.guard = pickGuard(s);
    return true;
  }
  if (e.phase === 'tell') { ying(s); return true; }
  return false;
}
const pickGuard = (s) => { const g = [s.R.foe.moves.edge.guard].flat(); return g[Math.floor(roll(s) * g.length)]; };

/* 迎: in along the flat of her blade — the edge on his arm — and out on her far side; she stands where he stood. */
function ying(s) {
  const m = s.R.foe.moves.edge, sd = side(s), me = s.me, foe = s.foe;
  const at = me.x; // his heels at the edge
  me.hp = Math.max(1, me.hp - m.cut);
  foe.x = at + (-sd) * 6;
  me.x = foe.x + sd * (GAP + 8);
  s.order = -sd; // he is past her
  foe.face = sd; me.face = -sd; // turned to each other at once: her palm comes before she could turn otherwise
  me.act = { k: 'ying', at: s.t, m: { startup: 0, active: 0, recover: 260 } };
  me.vx = 0;
  foe.act = null;
  foe.vx = 0;
  s.edge = null;
  s.cue = null;
  foe.cd.edge = m.cd;
  say(s, 'ying');
  bump(s, 'ying');
  fx(s, 'cut', (at + me.x) / 2, 120);
  // She lets the scabbard go and turns her left palm up: the palm comes at once (the book's order).
  startPalm(s, 'ying');
}

/* Nothing in the tell: the inch comes. */
function edgeFail(s, key = 'edgeFail') {
  const m = s.R.foe.moves.edge, me = s.me;
  hurtMe(s, m.dmg, 0, 620);
  say(s, key);
  s.edge = null;
  s.cue = null;
  s.foe.act = null;
  s.foe.cd.edge = m.cd;
  s.foe.x += side(s) * 70; // she steps back off him: 「再来。」
  s.foe.think = s.t + 700;
  bump(s, 'heavy');
}

/* ── Blows ── */
function hurtMe(s, dmg, push, stun, { lethal = true } = {}) {
  const me = s.me;
  me.hp = Math.max(lethal ? 0 : 1, me.hp - dmg);
  me.act = null;
  me.stun = s.t + stun;
  me.vx = -side(s) * push * 4;
  fx(s, 'ink', me.x + side(s) * 18, me.y + 110);
  bump(s, 'hurt');
}

/* A blow he stands off: a chip of it, a step back, a moment's stiff arms (a wall of blocks wears down too). */
function blocked(s, chip, push) {
  const me = s.me;
  me.hp = Math.max(0, me.hp - chip);
  me.stun = s.t + 140;
  me.vx = -side(s) * push * 3;
  fx(s, 'spark', me.x + side(s) * 20, 116);
  bump(s, 'block');
}

/* What a blow of his does to her: her 稳, her stagger, how far she slides (looser, further; on the slick, further still). */
function hurtFoe(s, m, { heavy = false, fire = false } = {}) {
  const foe = s.foe, R = s.R, sd = side(s);
  const glow = s.palm?.phase === 'glow';
  const loose = s.palm && (s.palm.phase === 'hold' || s.palm.phase === 'after');
  if (heavy && m.hook && loose) return hook(s);
  if (foe.act?.k === 'block' && !fire && !loose) {
    foe.bal = Math.max(0, foe.bal - m.dmg * 0.15);
    foe.vx = sd * m.push * 2.2;
    fx(s, 'spark', foe.x - sd * 22, 110);
    bump(s, 'block');
    return;
  }
  foe.bal = Math.max(0, foe.bal - m.dmg * (glow ? 0.5 : 1));
  fx(s, 'ink', foe.x - sd * 16, fire ? 24 : 112);
  bump(s, heavy ? 'heavy' : 'hit');
  if (glow || (loose && !heavy)) return; // she stands through it: the palm goes on
  if (s.palm) s.palm = null;
  if (s.edge) { s.edge = null; s.cue = null; }
  foe.act = null;
  foe.stun = s.t + m.stun;
  const looser = 1 + (R.foe.bal - foe.bal) / (R.foe.bal * 0.6);
  foe.vx = sd * m.push * 4 * (fire ? 1 : looser) * (onOil(s, foe.x) && !fire ? 1.6 : 1);
  if (fire) { foe.hop = s.t; say(s, 'fireHop'); }
}

/* 勾: his foot at the rear foot she sits back on. Over the slick, she skids off the edge; elsewhere she staggers. */
function hook(s) {
  const foe = s.foe, sd = side(s), R = s.R;
  s.palm = null;
  s.cue = null;
  foe.act = null;
  s.hooked = true;
  bump(s, 'hook');
  fx(s, 'ink', foe.x - sd * 10, 30, { big: true });
  // Over the slick with the edge at her back (the slick lies at the left edge): she skids off.
  if (onOil(s, foe.x) && sd * (s.R.stage.oil.from - s.R.stage.left <= s.R.stage.right - s.R.stage.oil.to ? -1 : 1) > 0) {
    foe.vx = sd * 640;
    s.end = { kind: 'out', at: s.t, from: foe.x, dir: sd };
    say(s, s.palmLanded ? 'outClumsy' : 'out');
    bump(s, 'slip');
    return;
  }
  foe.bal = Math.max(0, foe.bal - 45);
  foe.stun = s.t + 900;
  foe.vx = sd * 900;
  say(s, 'hookHold'); // an eighth layer keeps her feet on dry stone
}

/* ── Her moves ── */
function startFoe(s, k) {
  const foe = s.foe, m = s.R.foe.moves[k];
  foe.act = { k, at: s.t, m: { startup: m.startup ?? 0, active: m.active ?? 0, recover: m.recover ?? m.hold ?? 0 }, hit: false, shot: 0 };
  foe.vx = 0;
  if (k !== 'block') { foe.moves += 1; bump(s, 'swing'); }
  if (k === 'thrust') bump(s, 'tell');
  if (k === 'ice') { bump(s, 'tell'); foe.cd.ice = m.cd; }
}

function startPalm(s, from) {
  const m = s.R.foe.moves.palm;
  s.palm = { phase: 'glow', at: s.t, from, landed: false };
  s.foe.act = { k: 'palm', at: s.t, m: { startup: m.glow + m.hold, active: m.strike, recover: m.after } };
  s.foe.cd.palm = m.cd;
  s.foe.moves += 1;
  say(s, 'palmGlow');
  bump(s, 'glow');
}

function startEdge(s) {
  const foe = s.foe;
  s.edge = { phase: 'guard', at: s.t, guard: pickGuard(s), early: 0, side: cornered(s) };
  foe.act = { k: 'edge', at: s.t, m: { startup: 1e9, active: 0, recover: 0 } };
  foe.vx = 0;
  foe.moves += 1;
  say(s, 'edgeGuard');
}

/* Her mind: every `think` ms while her hands are free, one choice — readable on purpose. */
function decide(s) {
  const foe = s.foe, me = s.me, R = s.R, ai = R.foe.ai, M = R.foe.moves, d = dist(s), t = s.t;
  foe.think = t + ai.think * (0.8 + roll(s) * 0.5);
  if (me.stun > t + 200) { foe.vx = 0; return; } // 不踩人: she waits him up
  // His blow coming within her reach: she may stand it off.
  if (me.act && ['light', 'heavy'].includes(me.act.k) && d < 170 && roll(s) < ai.block) { startFoe(s, 'block'); return; }
  if (cornered(s) && foe.moves >= M.edge.after && foe.cd.edge <= 0 && d < M.poke.reach + 20) { startEdge(s); return; }
  if (d < M.palm.reach + 16 && foe.bal <= M.palm.under && foe.cd.palm <= 0 && roll(s) < 0.45) { startPalm(s, 'close'); return; }
  if (d > 330) {
    if (foe.cd.ice <= 0 && roll(s) < 0.5) { startFoe(s, 'ice'); return; }
    foe.vx = -side(s) * R.foe.speed;
    return;
  }
  if (d > M.thrust.reach) { foe.vx = -side(s) * R.foe.speed; return; }
  if (d < 120) {
    const r = roll(s);
    if (r < 0.35) { foe.vx = side(s) * R.foe.back; foe.think = t + 380; return; } // back to her length of blade
    startFoe(s, r < 0.75 ? 'poke' : 'thrust');
    return;
  }
  const r = roll(s), driving = foe.bal <= ai.drive;
  if (r < (driving ? 0.5 : 0.3)) startFoe(s, 'thrust');
  else if (r < 0.75) startFoe(s, 'poke');
  else foe.vx = -side(s) * R.foe.speed * 0.6;
}

/* What her blade does to him this step (her move's active frames, once a move). */
function foeStrikes(s) {
  const foe = s.foe, me = s.me, a = foe.act, R = s.R;
  if (!a || a.hit) return;
  const ph = phaseOf(a, s.t);
  if (a.k === 'ice') {
    const m = R.foe.moves.ice;
    while (a.shot < m.count && s.t - a.at >= m.startup + a.shot * m.gap) {
      a.shot += 1;
      s.n += 1;
      s.shots.push({ who: 'foe', kind: 'ice', x: foe.x - side(s) * 30, y: m.at, vx: -side(s) * m.speed, id: s.n });
      bump(s, 'ice');
    }
    if (a.shot >= m.count) a.hit = true;
    return;
  }
  if ((a.k === 'poke' || a.k === 'thrust') && ph === 'active') {
    const m = R.foe.moves[a.k];
    if (a.k === 'thrust' && !a.lunged) { a.lunged = true; foe.x -= side(s) * m.lunge; }
    a.hit = true;
    fx(s, 'qi', foe.x, 120, { to: foe.x - side(s) * m.reach });
    if (dist(s) > m.reach || me.stun > s.t + 300) return;
    const soft = foe.moves <= R.foe.ai.soft ? R.foe.ai.softBy : 1; // 头十招，她只使了五分力
    if (me.guard) { blocked(s, Math.round(m.dmg * soft * 0.25), m.push); return; }
    hurtMe(s, Math.round(m.dmg * soft), m.push, m.stun);
  }
}

/* The palm through its parts; `strike` lands once, at its share, never the last of him. */
function palmStep(s) {
  const p = s.palm;
  if (!p) return;
  const m = s.R.foe.moves.palm, e = s.t - p.at;
  const next = e < m.glow ? 'glow' : e < m.glow + m.hold ? 'hold' : e < m.glow + m.hold + m.strike ? 'strike' : e < m.glow + m.hold + m.strike + m.after ? 'after' : 'done';
  if (next === p.phase) return;
  p.phase = next;
  if (next === 'hold') { say(s, 'palmHold'); s.cue = { k: 'hook', at: s.t }; bump(s, 'hold'); return; }
  if (next === 'strike') {
    const me = s.me;
    if (dist(s) > m.reach + 10) { say(s, 'palmMiss'); return; }
    if (me.guard) { blocked(s, 6, m.push * 1.2); say(s, 'palmBlocked'); return; }
    p.landed = true;
    s.palmLanded += 1;
    hurtMe(s, Math.round(m.dmg * m.share), m.push, 420, { lethal: false }); // three tenths of a palm that would end him
    fx(s, 'glow', me.x + side(s) * 10, 112);
    say(s, 'palmHit');
    bump(s, 'palm');
    return;
  }
  if (next === 'done') { s.palm = null; s.cue = null; }
}

/* The edge's clock: guard, then the tell, then the inch. */
function edgeStep(s) {
  const e = s.edge;
  if (!e) return;
  const m = s.R.foe.moves.edge, since = s.t - e.at;
  if (e.phase === 'guard' && since >= e.guard) { e.phase = 'tell'; e.at = s.t; say(s, 'edgeTell'); s.cue = { k: 'ying', at: s.t }; bump(s, 'tell'); return; }
  if (e.phase === 'tell' && since >= m.tell) edgeFail(s);
}

/* ── His moves ── */
function startMe(s, k) {
  const me = s.me, R = s.R;
  if (k === 'jump') { me.vy = R.me.jump; me.vx = s.in.dir * R.me.speed; me.air = true; bump(s, 'jump'); return true; }
  if (k === 'special') {
    if (me.cd > 0) return false;
    me.cd = R.me.special.cd;
    me.act = { k, at: s.t, m: { startup: R.me.special.startup, active: 0, recover: R.me.special.recover }, hit: false };
    bump(s, 'cast');
    return true;
  }
  me.act = { k, at: s.t, m: R.me[k], hit: false };
  if (!me.air) me.vx = 0;
  bump(s, 'swing');
  return true;
}

function meStep(s) {
  const me = s.me, R = s.R, t = s.t;
  s.buf = s.buf.filter((b) => t - b.at <= BUF_MS);
  if (me.act && phaseOf(me.act, t) === 'done') me.act = null;
  if (me.act?.k === 'ying' && t - me.act.at >= me.act.m.recover) me.act = null;
  const free = !me.act && me.stun <= t;
  if (free && s.buf.length) {
    const b = s.buf[0];
    // In the air only a light blow (a kick on the way down); the rest wait for the boards.
    if (!me.air || b.k === 'light') { s.buf.shift(); startMe(s, b.k); }
  }
  const toward = side(s);
  me.guard = !me.air && !me.act && (me.stun <= t ? true : me.guard) && (s.in.block || (s.in.dir !== 0 && s.in.dir === -toward && Boolean(s.foe.act && s.foe.act.k !== 'block')) || (s.in.dir === -toward && s.shots.some((x) => x.who === 'foe')));
  if (!me.act && me.stun <= t && !me.air) me.vx = s.in.block ? 0 : s.in.dir * R.me.speed;
  // His blow's active frames: once a move.
  const a = me.act;
  if (a && !a.hit && (a.k === 'light' || a.k === 'heavy') && phaseOf(a, t) === 'active') {
    a.hit = true;
    if (dist(s) <= a.m.reach && Math.abs(s.foe.y - me.y) < 90) hurtFoe(s, a.m, { heavy: a.k === 'heavy' });
    else bump(s, 'whiff');
  }
  if (a && !a.hit && a.k === 'special' && t - a.at >= a.m.startup) {
    a.hit = true;
    s.n += 1;
    s.shots.push({ who: 'me', kind: R.me.special.kind, x: me.x + toward * 30, y: 22, vx: toward * R.me.special.speed, id: s.n });
    bump(s, 'fire');
  }
}

/* ── Bodies, shots, the edges ── */
function bodies(s, dt) {
  const k = dt / 1000, R = s.R, me = s.me, foe = s.foe;
  me.x += me.vx * k;
  if (me.air || me.y > 0) {
    me.vy -= GRAVITY * k;
    me.y += me.vy * k;
    if (me.y <= 0) { me.y = 0; me.vy = 0; me.air = false; bump(s, 'land'); }
  } else if (me.stun > s.t || me.act) me.vx *= Math.max(0, 1 - 9 * k);
  // Her slide: friction, less on the slick.
  if (!s.end) {
    foe.x += foe.vx * k;
    const fr = onOil(s, foe.x) ? 2.2 : 7.5;
    if (foe.act || foe.stun > s.t) foe.vx *= Math.max(0, 1 - fr * k);
    else if (!foe.act && foe.stun <= s.t && Math.abs(foe.vx) > R.foe.speed + 1) foe.vx *= Math.max(0, 1 - fr * k);
  }
  // Never through each other: the order they stand in holds.
  const sd = side(s), gap = (foe.x - me.x) * sd;
  if (gap < GAP) {
    const push = (GAP - gap) / 2;
    me.x -= sd * push;
    foe.x += sd * push;
  }
  // The boards: he keeps them (the edge is hers to use); she keeps them but over the slick, where a slide takes her off.
  const lo = R.stage.left + 12, hi = R.stage.right - 12;
  me.x = Math.min(hi, Math.max(lo, me.x));
  if (!s.end) {
    const slipping = onOil(s, foe.x) && Math.abs(foe.vx) > 300;
    if (foe.x < R.stage.left && slipping) s.end = { kind: 'out', at: s.t, from: foe.x, dir: Math.sign(foe.vx) || -1 }, say(s, s.palmLanded ? 'outClumsy' : 'out'), bump(s, 'slip');
    else foe.x = Math.min(hi, Math.max(lo, foe.x));
    // A body pressed against the boards' end pushes the other back.
    if (Math.abs(foe.x - me.x) < GAP - 1) { if (me.x <= lo + 0.5 || me.x >= hi - 0.5) foe.x = me.x + sd * GAP; else me.x = foe.x - sd * GAP; }
  }
  for (const who of [me, foe]) if (!who.act && who.stun <= s.t) who.face = Math.sign((who === me ? foe.x - me.x : me.x - foe.x)) || who.face;
}

function shotsStep(s, dt) {
  const k = dt / 1000, R = s.R, me = s.me, foe = s.foe;
  for (const x of s.shots) x.x += x.vx * k;
  // Fire meets ice: both gone in steam.
  for (const f of s.shots.filter((x) => x.who === 'me' && !x.gone)) for (const i of s.shots.filter((x) => x.who === 'foe' && !x.gone)) {
    if (Math.abs(f.x - i.x) < 26) { f.gone = i.gone = true; fx(s, 'steam', (f.x + i.x) / 2, 60); bump(s, 'steam'); }
  }
  for (const x of s.shots) {
    if (x.gone) continue;
    if (x.x < 0 || x.x > R.stage.w) { x.gone = true; continue; }
    if (x.who === 'foe' && Math.abs(x.x - me.x) < 26) {
      x.gone = true;
      if (me.y > 52) continue; // jumped over it: it flies on below him — gone off the stage with the next step
      const m = R.foe.moves.ice, soft = foe.moves <= R.foe.ai.soft ? R.foe.ai.softBy : 1;
      if (me.guard) blocked(s, 1, 10);
      else hurtMe(s, Math.max(1, Math.round(m.dmg * soft)), m.push, m.stun);
    }
    if (x.who === 'me' && !x.gone && Math.abs(x.x - foe.x) < 30 && !s.end) { x.gone = true; hurtFoe(s, R.me.special, { fire: true }); }
  }
  s.shots = s.shots.filter((x) => !x.gone);
}

function foeStep(s) {
  const foe = s.foe, t = s.t;
  for (const k of Object.keys(foe.cd)) foe.cd[k] = Math.max(0, foe.cd[k] - STEP_MS);
  if (s.edge) { edgeStep(s); return; }
  if (s.palm) { palmStep(s); if (!s.palm && foe.act?.k === 'palm') foe.act = null; else return; }
  if (foe.act && foe.act.k !== 'edge' && phaseOf(foe.act, t) === 'done') foe.act = null;
  foeStrikes(s);
  if (!busy(foe, t) && t >= foe.think) decide(s);
}

/* The bout's end: her slide off the edge and her landing, or his fall. */
function endStep(s) {
  const e = s.end;
  if (e.kind === 'out') {
    const foe = s.foe, k = STEP_MS / 1000;
    foe.x += foe.vx * k;
    foe.vx *= 1 - 1.5 * k;
    if (foe.x < s.R.stage.left - 4) { foe.y = Math.max(-62, (foe.y ?? 0) - 340 * k); if (foe.y <= -62) foe.vx *= 1 - 14 * k; } // down on the frozen ground, on her feet
  }
  if (s.t - e.at < END_MS) return;
  s.live = false;
  if (e.kind === 'out') {
    s.won = true;
    s.grade = s.palmLanded ? 'clumsy' : 'clean';
    s.stars = s.palmLanded ? (s.me.hp >= 30 ? 2 : 1) : 3;
  } else s.lost = true;
}

function step(s) {
  s.t += STEP_MS;
  if (s.end) { endStep(s); return; }
  const me = s.me;
  me.cd = Math.max(0, me.cd - STEP_MS);
  meStep(s);
  if (!s.end) foeStep(s); // hooked this step: her slide is the end's now
  bodies(s, STEP_MS);
  shotsStep(s, STEP_MS);
  if (me.hp <= 0 && !s.end) { s.end = { kind: 'down', at: s.t }; say(s, 'lost'); bump(s, 'down'); }
  if (s.cue && s.t - s.cue.at > 900) s.cue = null;
}

/** The bout in time: `ms` of it, in steps of STEP_MS (what is left over carries). */
export function tick(state, ms) {
  if (!state?.live || state.won || state.lost || !(ms > 0)) return state;
  const s = clone(state);
  s.carry = (s.carry ?? 0) + ms;
  while (s.carry >= STEP_MS && s.live) { s.carry -= STEP_MS; step(s); }
  return s;
}

/** What a step sounded (games/kit/heard.js): each counter that rose names its event. */
export const SOUNDS = ['swing', 'whiff', 'hit', 'heavy', 'hurt', 'block', 'jump', 'land', 'cast', 'fire', 'ice', 'steam', 'tell', 'early', 'ying', 'glow', 'hold', 'palm', 'hook', 'slip', 'down'];
export function sounds(b, a) {
  if (!b?.snd || !a?.snd) return [];
  return SOUNDS.filter((k) => (a.snd[k] ?? 0) > (b.snd[k] ?? 0));
}

/** May the board be left before the page's clock says so (stuck.js, 75 s unwon)? Never: a lost bout is dealt again, and
    the clock alone opens 「算了」 — the same on the Mac's story (whose board holds no state of ours) and the phone. */
export const stuck = () => false;

/** The line a state says now (its key), and how long ago. */
export const lineNow = (s) => s?.line ?? null;
