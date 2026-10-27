// fighter/core.js — 格斗: the side-view 1v1 (Hanli 10-26: 「街霸好做吗? 拳皇之类的」 → 「好, 先做秦雁那一场」; v2 10-27:
// 「基本的逻辑都有了, 需要美观和优化. 用wasd控制, ijkl等是招数 … 组合技什么的都加一下」). Pure and seeded: newGame · act ·
// tick · sounds, no DOM, no clock of its own — the mount (games/fighter.js) runs it on the page, the bot
// (games/bots/fighter.js) and the tests in node. Nothing here knows 秦雁: a bout is a level (games.json rows of
// `fighter`), and a later bout (祁长松, 斗法, a beast) adds a level, never code.
//
// The field is one line across a stage (x in units; y up from the boards). The player (`me`) and the foe (`foe`) never
// pass through each other but by one move (迎, below). Bars: his 血 (hp), her 稳 (footing, `bal`) — an eighth layer is
// never beaten by a count of hits: her bar only says how loose she stands, and a loose foe slides further when hit.
// She leaves the stage only over the slick (`stage.oil`, 那摊红油) with its edge at her back. Each has 气 (`qi`, 0…100):
// it fills on blows given and taken, and full it pays for one 绝 (a super).
//
// His hands (the mount maps keys; the phone maps buttons):
//   walk { dir } · crouch { on } (蹲: ducks her ice; held back with it, a low guard) · block { on } (挡, the phone's
//   button; standing away from her guards too) · jump · light (拳 K) · heavy (腿 L — 勾 at her rear foot) · special
//   (火 ;: fire at her feet, she hops back) · ying (迎 O: a roll — in along her blade and out past her, untouchable a
//   moment; held away from her, a roll back; in the edge's push it is the book's 迎) · skill (技, the phone: 掌心火, or
//   升勾 with a direction held) · jumpRelease (W let go soon: a short hop; held: the full jump). Double-tap toward her: a
//   dash in; away: a back-step (KOF '97, Hanli's pick 10-27: fast and pressing, not SF's spacing).
//   · super (绝, the phone; keys: O+; or K+L together, or ↓↓ then K+L). (Hanli 10-27: 「出招键可以右边一些, 变成okl;」.)
// Combos: a 拳 that lands can be cut short into the next blow (K K L, K L …), and a 腿 that lands into a special or the
// 绝 (K K L → S D ;); a jump-in 腿 stuns long enough for a 拳 on landing. Blows into a foe still reeling count a chain (`combo`, 「2 连」…), each a little lighter on her 稳.
// Motions read the last directions pressed (`hist`, MOTION_MS): ↓→ + ; is 掌心火 (a fireball), →↓→ + L is 升勾.
// Hits stop the clock a beat (`freeze`, hit-stop); a 绝 stops it for its cut-in.
//
// Her moves (`foe.moves`) are data; two are tricks the book has (doc/games.md § 格斗):
//   edge   at the stage's edge, her point at his throat (Ahe's 底册: 「到了台边，往前送一寸」): a guard, then the push
//          (`tell`). A fresh press in the tell — 迎, forward, or any blow — takes him in along the flat of the blade (a cut
//          on the arm) and out on her far side, she where he stood. Too soon (`early`) and she waits again; nothing in
//          the tell and the inch comes.
//   palm   the green palm (左掌一翻，掌心里亮起一层青光): `glow` (she stands through any blow), `hold` — she holds back
//          three tenths (「她收了三分」), her weight on her rear foot — then `strike`, landing at that share and never the
//          last of him (大比不许伤人性命), and `after`, still loose. His 腿 in `hold` or `after` hooks her rear foot: over
//          the slick, she skids off the edge (the win); elsewhere she staggers and keeps her feet.
//   jianqi her 绝 when her 气 is full: 剑气三尺, a long low sweep of green that knocks him down.
// She never strikes a man who is down (「不踩人」), and the 雷符 in her sleeve is never drawn.
//
// The grade: `clean` when no palm landed on him, `clumsy` when one did (the level's `won` lines say which); stars 3
// clean, 2 clumsy, 1 clumsy with little left of him. Lost at hp 0.

export const STEP_MS = 10; //   one physics step; tick(ms) runs as many as fit (the same ms → the same bout)
export const BUF_MS = 300; //   how long a press waits for his hands to be free (a chain's next blow, a fast thumb)
export const MOTION_MS = 320; // a motion's directions, read back from the press that ends it
export const PAIR_MS = 120; //  two keys at once (a 绝)
export const END_MS = 1700; //  the last frame (her slide off the edge, his fall) before the bout is over
export const GRAVITY = 2600;
export const GAP = 58; //       the least distance between two bodies
export const QI = 100; //   one stock of 气 (a 绝 costs one)
export const QI_MAX = 300; // three stocks
export const TAP_MS = 240; // a double tap (dash, back-step)
export const HOP_MS = 130; // W let go this soon: a short hop

/* The stage, in units: the boards from `left` to `right`, the slick at the left edge (the corner he chose). */
export const STAGE = { w: 960, left: 140, right: 930, oil: { from: 140, to: 250 } };

/* His moves (frames in ms): startup · active · recover; reach in units; dmg to her 稳; push (units); stun on her;
   `hit`: what a blow is called in sounds (hit · heavy). `cancel`: may be cut short into the next blow once it lands. */
export const ME = {
  hp: 100, speed: 250, jump: 880, hop: 420, dash: 620, step: 480,
  light: { startup: 70, active: 90, recover: 150, reach: 108, dmg: 3, push: 24, stun: 300, cancel: true, qi: 4 },
  heavy: { startup: 160, active: 110, recover: 320, reach: 130, dmg: 7, push: 70, stun: 440, hook: true, qi: 7, cancelTo: ['palmfire', 'rise', 'special', 'super'] },
  air: { startup: 90, active: 260, recover: 120, reach: 118, dmg: 6, push: 40, stun: 560, qi: 6 },
  rise: { startup: 110, active: 160, recover: 480, reach: 116, dmg: 11, push: 120, stun: 620, hook: true, qi: 9, lift: 520 },
  roll: { ms: 380, safe: 300, speed: 760 },
  special: { kind: 'fire', startup: 210, recover: 260, speed: 640, dmg: 6, push: 260, stun: 300, cd: 5000, qi: 5 },
  palmfire: { kind: 'palmfire', startup: 240, recover: 300, speed: 760, dmg: 9, push: 120, stun: 420, cd: 2200, at: 108, qi: 6 },
  super: { name: { zh: '两样', en: 'Two at Once' }, cut: 900, startup: 120, recover: 600, speed: 700, dmg: 26, push: 340, stun: 1000 },
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
    jianqi: { name: { zh: '剑气三尺', en: 'Three Feet of Sword-Qi' }, cut: 800, startup: 520, active: 200, recover: 700, reach: 380, dmg: 9, push: 140, down: 1100 },
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
/** The numbers a level plays: the kit's, with the level's own laid on (`me.rules`, `foe.rules`, `stage`). */
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
    me: { x: mid - 70, y: 0, vx: 0, vy: 0, face: 1, hp: R.me.hp, act: null, stun: 0, cd: 0, cdPf: 0, guard: false, air: false, crouch: false, down: 0, qi: 0, airHit: false },
    foe: { x: mid + 150, y: 0, vx: 0, face: -1, bal: R.foe.bal, act: null, stun: 0, think: 900, cd: { ice: 2500, palm: 0, edge: 0 }, moves: 0, qi: 0 },
    in: { dir: 0, block: false, crouch: false }, buf: [], hist: [], last: {}, order: 1,
    shots: [], fx: [], n: 0, freeze: 0,
    edge: null, palm: null, end: null, cutin: null, wall: null,
    palmLanded: 0, hooked: false, early: 0, parried: 0, supers: 0, best: 0,
    combo: { n: 0, at: 0, who: 'me' },
    cue: null, line: null,
    snd: {},
  };
}

/* ── Small helpers ── */
const clone = (s) => ({ ...s, me: { ...s.me }, foe: { ...s.foe, cd: { ...s.foe.cd } }, in: { ...s.in }, buf: [...s.buf], hist: [...s.hist], last: { ...s.last }, shots: s.shots.map((x) => ({ ...x })), fx: [...s.fx], snd: { ...s.snd }, combo: { ...s.combo } });
const bump = (s, k) => { s.snd[k] = (s.snd[k] ?? 0) + 1; };
const say = (s, key) => { s.line = { key, at: s.t }; };
const fx = (s, kind, x, y, extra = {}) => { s.n += 1; s.fx.push({ kind, x, y, at: s.t, id: s.n, ...extra }); if (s.fx.length > 28) s.fx.shift(); };
const side = (s) => s.order ?? (Math.sign(s.foe.x - s.me.x) || 1); // where she stands from him: kept, so a lunge never crosses him
const dist = (s) => Math.abs(s.foe.x - s.me.x);
const onOil = (s, x) => x >= s.R.stage.oil.from && x <= s.R.stage.oil.to;
const gainQi = (who, n) => { who.qi = Math.min(QI_MAX, (who.qi ?? 0) + n); };
/* Untouchable: the first part of a roll. */
const safe = (s) => s.me.act?.k === 'roll' && s.t - s.me.act.at < s.R.me.roll.safe;
const hitstop = (s, ms) => { s.freeze = Math.max(s.freeze, ms); };
/** Over the slick: where she stands. */
export const foeOnOil = (s) => onOil(s, s.foe.x);
/* The slick lies at one edge: the left one when it is nearer the left. Its edge is at her back when he stands on the
   other side of her from it. */
const oilBehind = (s) => {
  const oilAtLeft = s.R.stage.oil.from - s.R.stage.left <= s.R.stage.right - s.R.stage.oil.to;
  return onOil(s, s.foe.x) && side(s) === (oilAtLeft ? -1 : 1);
};
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
const PRESS = new Set(['jump', 'light', 'heavy', 'special', 'ying', 'skill', 'super']);
const tapped = (s, k) => s.hist.filter((h) => h.k === k && s.t - h.at <= TAP_MS).length >= 2;
/** The player's hand: `walk` { dir: -1 | 0 | 1 } (screen left/right), `crouch` { on }, `block` { on }, and the presses
    jump · light · heavy · special · ying · skill · super. Answers { state } (the same state when nothing changed). */
export function act(state, d = {}) {
  if (!state || state.won || state.lost || state.end) return { state, won: false };
  const g = d.g;
  if (g === 'walk') {
    const dir = Math.sign(Number(d.dir) || 0);
    if (dir === state.in.dir) return { state, won: false };
    const s = clone(state);
    s.in.dir = dir;
    if (dir) {
      const k = dir === side(s) ? 'f' : 'b';
      note(s, k);
      if (tapped(s, k) && !s.edge) s.buf = [...s.buf, { k: k === 'f' ? 'dash' : 'backstep', at: s.t }].slice(-3); // a double tap
    }
    // A fresh step toward her is a press too (迎 in the edge's tell).
    if (dir && dir === side(s)) pressed(s, 'forward');
    return { state: s, won: false };
  }
  if (g === 'jumpRelease') {
    if (!state.me.air || state.me.hopCut || state.t - (state.me.jumpAt ?? -1e9) > HOP_MS) return { state, won: false };
    const s = clone(state);
    s.me.hopCut = true; // let go soon: a short hop
    s.me.vy = Math.min(s.me.vy, s.R.me.hop);
    return { state: s, won: false };
  }
  if (g === 'crouch' || g === 'block') {
    const on = Boolean(d.on);
    if (on === state.in[g]) return { state, won: false };
    const s = clone(state);
    s.in[g] = on;
    if (g === 'crouch' && on) note(s, 'd');
    return { state: s, won: false };
  }
  if (PRESS.has(g)) {
    const s = clone(state);
    if (pressed(s, g)) return { state: s, won: false };
    const k = read(s, g);
    s.last[g] = s.t;
    // a 绝 takes the place of the pair's first key, if it still waits
    if (k) s.buf = [...s.buf.filter((b) => s.t - b.at <= BUF_MS && !(k === 'super' && ['light', 'heavy', 'special', 'roll'].includes(b.k))), { k, at: s.t }].slice(-3);
    return { state: s, won: false };
  }
  return { state, won: false };
}
/* A direction pressed, for the motions. */
function note(s, k) { s.hist = [...s.hist.filter((h) => s.t - h.at <= MOTION_MS * 2), { k, at: s.t }].slice(-6); }
const seq = (s, keys) => {
  // the directions pressed within MOTION_MS (per step), in order, ending with `keys`' last
  const h = s.hist.filter((x) => s.t - x.at <= MOTION_MS + (keys.length - 2) * 120).map((x) => x.k);
  let i = h.length - 1;
  for (let k = keys.length - 1; k >= 0; k -= 1) { while (i >= 0 && h[i] !== keys[k]) i -= 1; if (i < 0) return false; i -= 1; }
  return true;
};
/* What a press means: a 绝 (two at once with 气 full, or ↓↓ J+K), a motion's special, the phone's 技, else itself. */
function read(s, g) {
  const me = s.me, full = me.qi >= QI;
  const pair = (a) => s.t - (s.last[a] ?? -1e9) <= PAIR_MS;
  if (g === 'super') return full ? 'super' : null;
  if (full && ((g === 'heavy' && pair('light')) || (g === 'light' && pair('heavy')) || (g === 'special' && pair('ying')) || (g === 'ying' && pair('special')))) return 'super';
  if (g === 'special' && seq(s, ['d', 'f'])) return 'palmfire';
  if (g === 'heavy' && seq(s, ['f', 'd', 'f'])) return 'rise';
  if (g === 'skill') return (s.in.dir === side(s) || s.in.crouch) ? 'rise' : 'palmfire';
  if (g === 'ying') return 'roll';
  return g;
}

/* A press while her point is at his throat answers the edge, and is spent there. */
function pressed(s, k) {
  const e = s.edge;
  if (!e || s.me.stun > s.t || s.me.down > s.t) return false;
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
  s.buf = [];
  foe.cd.edge = m.cd;
  gainQi(me, 20);
  say(s, 'ying');
  bump(s, 'ying');
  hitstop(s, 120);
  fx(s, 'cut', (at + me.x) / 2, 120);
  // She lets the scabbard go and turns her left palm up: the palm comes at once (the book's order).
  startPalm(s, 'ying');
}

/* Nothing in the tell: the inch comes. */
function edgeFail(s, key = 'edgeFail') {
  const m = s.R.foe.moves.edge;
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

/* ── Blows on him ── */
function hurtMe(s, dmg, push, stun, { lethal = true, down = 0 } = {}) {
  const me = s.me;
  me.hp = Math.max(lethal ? 0 : 1, me.hp - dmg);
  me.act = null;
  me.stun = s.t + stun;
  if (down) { me.down = s.t + down; me.stun = me.down + 200; bump(s, 'knock'); }
  me.vx = -side(s) * push * 4;
  gainQi(me, 6);
  gainQi(s.foe, 4);
  s.combo = { n: 0, at: s.t, who: 'me' };
  hitstop(s, down ? 110 : 70);
  fx(s, 'ink', me.x + side(s) * 18, me.y + (me.crouch ? 70 : 110));
  bump(s, 'hurt');
}
/* A blow he stands off: a chip of it, a step back, a moment's stiff arms (a wall of blocks wears down too). Answers
   whether he stood it off. */
function guarded(s, chip, push) {
  const me = s.me;
  if (!me.guard) return false;
  me.hp = Math.max(0, me.hp - chip);
  me.stun = s.t + 140;
  me.vx = -side(s) * push * 3;
  gainQi(me, 3);
  hitstop(s, 50);
  fx(s, 'spark', me.x + side(s) * 20, me.crouch ? 70 : 116);
  bump(s, 'block');
  return true;
}

/* What a blow of his does to her: her 稳, her stagger, how far she slides (looser, further; on the slick, further still). */
function hurtFoe(s, m, { heavy = false, fire = false, big = false } = {}) {
  const foe = s.foe, R = s.R, sd = side(s);
  const glow = s.palm?.phase === 'glow';
  const loose = s.palm && (s.palm.phase === 'hold' || s.palm.phase === 'after');
  if (heavy && m.hook && loose) return hook(s);
  if (foe.act?.k === 'block' && !fire && !loose && !big) {
    foe.bal = Math.max(0, foe.bal - m.dmg * 0.15);
    foe.vx = sd * m.push * 2.2;
    gainQi(s.me, 2);
    hitstop(s, 50);
    fx(s, 'spark', foe.x - sd * 22, 110);
    bump(s, 'block');
    return;
  }
  // a chain: blows into a foe still reeling
  const chained = foe.stun > s.t && s.combo.who === 'me' && s.combo.n > 0;
  s.combo = { n: chained ? s.combo.n + 1 : 1, at: s.t, who: 'me' };
  s.best = Math.max(s.best, s.combo.n);
  if (s.combo.n >= 2) bump(s, 'combo');
  const scale = Math.pow(0.85, s.combo.n - 1);
  foe.bal = Math.max(0, foe.bal - m.dmg * scale * (glow ? 0.5 : 1));
  gainQi(s.me, m.qi ?? 5);
  gainQi(foe, 3);
  hitstop(s, big ? 140 : heavy ? 90 : 65);
  fx(s, 'ink', foe.x - sd * 16, fire ? 24 : 112, { big: heavy || big });
  bump(s, big ? 'super' : heavy ? 'heavy' : 'hit');
  if (glow || (loose && !heavy && !big)) return; // she stands through it: the palm goes on
  if (s.palm) s.palm = null;
  if (s.edge) { s.edge = null; s.cue = null; }
  foe.act = null;
  foe.stun = s.t + m.stun;
  const looser = 1 + (R.foe.bal - foe.bal) / (R.foe.bal * 0.6);
  foe.vx = sd * m.push * 4 * (fire ? 1 : looser) * (onOil(s, foe.x) && !fire ? 1.6 : 1);
  if (m.lift) foe.lift = s.t;
  if (fire) { foe.hop = s.t; say(s, 'fireHop'); }
  // A big blow over the slick, its edge at her back: she skids off, as the hook takes her.
  if (big && oilBehind(s)) out(s);
}

/* 勾: his foot at the rear foot she sits back on. Over the slick, she skids off the edge; elsewhere she staggers. */
function hook(s) {
  const foe = s.foe, sd = side(s);
  s.palm = null;
  s.cue = null;
  foe.act = null;
  s.hooked = true;
  bump(s, 'hook');
  hitstop(s, 140);
  fx(s, 'ink', foe.x - sd * 10, 30, { big: true });
  if (oilBehind(s)) { out(s); return; }
  foe.bal = Math.max(0, foe.bal - 45);
  foe.stun = s.t + 900;
  foe.vx = sd * 900;
  say(s, 'hookHold'); // an eighth layer keeps her feet on dry stone
}
function out(s) {
  const foe = s.foe, sd = side(s);
  foe.vx = sd * 640;
  s.end = { kind: 'out', at: s.t, from: foe.x, dir: sd };
  say(s, s.palmLanded ? 'outClumsy' : 'out');
  bump(s, 'slip');
}

/* ── Her moves ── */
function startFoe(s, k) {
  const foe = s.foe, m = s.R.foe.moves[k];
  foe.act = { k, at: s.t, m: { startup: m.startup ?? 0, active: m.active ?? 0, recover: m.recover ?? m.hold ?? 0 }, hit: false, shot: 0 };
  foe.vx = 0;
  if (k !== 'block') { foe.moves += 1; bump(s, 'swing'); }
  if (k === 'thrust') bump(s, 'tell');
  if (k === 'ice') { bump(s, 'tell'); foe.cd.ice = m.cd; }
  if (k === 'jianqi') { foe.qi -= QI; s.cutin = { who: 'foe', name: m.name, at: s.t }; hitstop(s, m.cut); bump(s, 'cutin'); say(s, 'jianqi'); }
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
  if (me.stun > t + 200 || me.down > t) { foe.vx = 0; return; } // 不踩人: she waits him up
  // His blow coming within her reach: she may stand it off.
  if (me.act && ['light', 'heavy', 'air'].includes(me.act.k) && d < 170 && roll(s) < ai.block) { startFoe(s, 'block'); return; }
  if (cornered(s) && foe.moves >= M.edge.after && foe.cd.edge <= 0 && d < M.poke.reach + 20) { startEdge(s); return; }
  if (d < M.palm.reach + 16 && foe.bal <= M.palm.under && foe.cd.palm <= 0 && roll(s) < 0.45) { startPalm(s, 'close'); return; }
  if (foe.qi >= QI && d < M.jianqi.reach - 20 && roll(s) < 0.6) { startFoe(s, 'jianqi'); return; }
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
  if ((a.k === 'poke' || a.k === 'thrust' || a.k === 'jianqi') && ph === 'active') {
    const m = R.foe.moves[a.k];
    if (a.k === 'thrust' && !a.lunged) { a.lunged = true; foe.x -= side(s) * m.lunge; }
    a.hit = true;
    fx(s, 'qi', foe.x, a.k === 'jianqi' ? 40 : 120, { to: foe.x - side(s) * m.reach, big: a.k === 'jianqi' });
    if (dist(s) > m.reach || me.stun > s.t + 300 || me.down > s.t || safe(s)) return;
    const soft = foe.moves <= R.foe.ai.soft ? R.foe.ai.softBy : 1; // 头十招，她只使了五分力
    if (guarded(s, Math.round(m.dmg * soft * 0.25), m.push)) return;
    hurtMe(s, Math.round(m.dmg * soft), m.push, m.stun ?? 400, { down: m.down ?? 0 });
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
    if (dist(s) > m.reach + 10 || me.down > s.t) { say(s, 'palmMiss'); return; }
    if (safe(s)) { say(s, 'palmMiss'); return; }
    if (me.guard) { guarded(s, 6, m.push * 1.2); say(s, 'palmBlocked'); return; }
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
  if (k === 'jump') { if (me.air || s.in.crouch) return false; me.vy = R.me.jump; me.vx = s.in.dir * R.me.speed; me.air = true; me.airHit = false; me.hopCut = false; me.jumpAt = s.t; bump(s, 'jump'); return true; }
  if (k === 'dash' || k === 'backstep') {
    if (me.air) return false;
    const fwd = k === 'dash';
    me.act = { k, at: s.t, m: { startup: 0, active: fwd ? 220 : 260, recover: 60, cancel: fwd }, landed: fwd }; // a dash runs straight into a blow
    me.vx = (fwd ? side(s) : -side(s)) * (fwd ? R.me.dash : R.me.step);
    if (!fwd) { me.vy = 260; me.air = true; me.hopCut = true; me.jumpAt = -1e9; }
    bump(s, 'dash');
    fx(s, 'dust', me.x, 0, { small: true });
    return true;
  }
  if (k === 'roll') {
    if (me.air) return false;
    const back = s.in.dir !== 0 && s.in.dir === -side(s);
    me.act = { k, at: s.t, m: { startup: 0, active: R.me.roll.ms, recover: 80 }, dir: back ? -side(s) : side(s), through: !back };
    me.vx = me.act.dir * R.me.roll.speed;
    bump(s, 'roll');
    fx(s, 'dust', me.x, 0, { small: true });
    return true;
  }
  if (k === 'special' || k === 'palmfire') {
    const m = R.me[k], cdKey = k === 'special' ? 'cd' : 'cdPf';
    if (me[cdKey] > 0 || me.air) return false;
    me[cdKey] = m.cd;
    me.act = { k, at: s.t, m: { startup: m.startup, active: 0, recover: m.recover }, hit: false };
    me.vx = 0;
    bump(s, 'cast');
    return true;
  }
  if (k === 'super') {
    if (me.qi < QI || me.air) return false;
    const m = R.me.super;
    me.qi -= QI;
    s.supers += 1;
    me.act = { k, at: s.t, m: { startup: m.startup, active: 0, recover: m.recover }, hit: false };
    me.vx = 0;
    s.cutin = { who: 'me', name: m.name, at: s.t };
    hitstop(s, m.cut);
    bump(s, 'cutin');
    say(s, 'super');
    return true;
  }
  if (k === 'heavy' && me.air) { if (me.airHit) return false; me.airHit = true; me.act = { k: 'air', at: s.t, m: R.me.air, hit: false }; bump(s, 'swing'); return true; }
  if (me.air && k !== 'light') return false;
  me.act = { k, at: s.t, m: R.me[k], hit: false };
  if (!me.air) me.vx = 0;
  if (k === 'rise') { me.vx = side(s) * 90; me.vy = 520; me.air = true; me.airHit = true; bump(s, 'rise'); }
  bump(s, 'swing');
  return true;
}

/* May his blow now be cut short into the next? A 拳 that landed, past its active start. */
const cancellable = (a, t, next) => a && a.landed && t - a.at >= a.m.startup && (a.m.cancel || (next && a.m.cancelTo?.includes(next)));

function meStep(s) {
  const me = s.me, R = s.R, t = s.t;
  s.buf = s.buf.filter((b) => t - b.at <= BUF_MS);
  if (me.act && phaseOf(me.act, t) === 'done') me.act = null;
  if (me.act?.k === 'ying' && t - me.act.at >= me.act.m.recover) me.act = null;
  if (me.down && me.down <= t) { me.down = 0; bump(s, 'getup'); }
  // a 绝 cuts the pair's first key short while it is still winding up
  if (s.buf[0]?.k === 'super' && me.qi >= QI && me.act && phaseOf(me.act, t) === 'startup') me.act = null;
  const free = (!me.act || cancellable(me.act, t, s.buf[0]?.k)) && me.stun <= t && !me.down;
  if (free && s.buf.length) {
    const b = s.buf.shift(), was = me.act;
    me.act = null; // a 拳 that landed, cut short into the next
    if (!startMe(s, b.k)) me.act = was; // not now (in the air, cooling down): the press is spent
  }
  const toward = side(s);
  me.crouch = !me.air && s.in.crouch && !me.down;
  const back = s.in.dir !== 0 && s.in.dir === -toward;
  const threat = Boolean(s.foe.act && s.foe.act.k !== 'block') || s.shots.some((x) => x.who === 'foe');
  me.guard = !me.air && !me.act && !me.down && (me.stun <= t ? true : me.guard) && (s.in.block || (back && threat));
  if (!me.act && me.stun <= t && !me.air && !me.down) me.vx = s.in.block || me.crouch ? 0 : s.in.dir * R.me.speed;
  if (me.act?.k === 'roll' || me.act?.k === 'dash') me.vx = me.act.k === 'roll' ? me.act.dir * R.me.roll.speed * (1 - (t - me.act.at) / (R.me.roll.ms + 120)) : me.vx;
  // His blow's active frames: once a move.
  const a = me.act;
  if (a && !a.hit && ['light', 'heavy', 'air', 'rise'].includes(a.k) && phaseOf(a, t) === 'active') {
    const reach = a.m.reach, high = Math.abs(s.foe.y - me.y) < 120;
    if (dist(s) <= reach && high) { a.hit = true; a.landed = true; hurtFoe(s, a.m, { heavy: a.k === 'heavy' || a.k === 'rise' }); }
    else if (a.k !== 'air' || t - a.at > a.m.startup + a.m.active - STEP_MS) { a.hit = true; bump(s, 'whiff'); }
  }
  if (a && !a.hit && (a.k === 'special' || a.k === 'palmfire') && t - a.at >= a.m.startup) {
    a.hit = true;
    const m = R.me[a.k];
    s.n += 1;
    s.shots.push({ who: 'me', kind: m.kind, x: me.x + toward * 34, y: m.at ?? 22, vx: toward * m.speed, id: s.n });
    bump(s, a.k === 'special' ? 'fire' : 'palmfire');
  }
  if (a && !a.hit && a.k === 'super' && t - a.at >= a.m.startup) {
    a.hit = true;
    const m = R.me.super;
    // 两样: the earth wall up before him (her ice dies in it), and the fire along the boards under her.
    s.wall = { x: me.x + toward * 46, at: t, until: t + 1500 };
    s.n += 1;
    s.shots.push({ who: 'me', kind: 'wave', x: me.x + toward * 50, y: 30, vx: toward * m.speed, id: s.n, big: true });
    bump(s, 'wall');
  }
}

/* ── Bodies, shots, the edges ── */
function bodies(s, dt) {
  const k = dt / 1000, R = s.R, me = s.me, foe = s.foe;
  me.x += me.vx * k;
  if (me.air || me.y > 0) {
    me.vy -= GRAVITY * k;
    me.y += me.vy * k;
    if (me.y <= 0) {
      me.y = 0; me.vy = 0; me.air = false; me.airHit = false; bump(s, 'land'); fx(s, 'dust', me.x, 0);
      if (me.act?.k === 'air') me.act = null; // the kick ends on the boards: a 拳 can follow at once
    }
  } else if (me.stun > s.t || (me.act && me.act.k !== 'roll' && me.act.k !== 'dash') || me.down) me.vx *= Math.max(0, 1 - 9 * k);
  else if (me.act?.k === 'dash') me.vx *= Math.max(0, 1 - 2.5 * k);
  // Her slide: friction, less on the slick.
  if (!s.end) {
    foe.x += foe.vx * k;
    const fr = onOil(s, foe.x) ? 2.2 : 7.5;
    if (foe.act || foe.stun > s.t) foe.vx *= Math.max(0, 1 - fr * k);
    else if (Math.abs(foe.vx) > R.foe.speed + 1) foe.vx *= Math.max(0, 1 - fr * k);
    if (Math.abs(foe.vx) > 420 && (s.t / 60 | 0) !== ((s.t - dt) / 60 | 0)) fx(s, 'dust', foe.x, 0, { small: true });
  }
  // Never through each other: the order they stand in holds.
  const rolling = me.act?.k === 'roll' && me.act.through;
  if (me.act?.k === 'roll' && me.act.through && Math.sign(foe.x - me.x) !== s.order && Math.abs(foe.x - me.x) > 4) { s.order = Math.sign(foe.x - me.x); me.act.passed = true; }
  const sd = side(s), gap = (foe.x - me.x) * sd;
  if (gap < GAP && !rolling) {
    const push = (GAP - gap) / 2;
    me.x -= sd * push;
    foe.x += sd * push;
  }
  // The boards: he keeps them (the edge is hers to use); she keeps them but over the slick, where a slide takes her off.
  const lo = R.stage.left + 12, hi = R.stage.right - 12;
  me.x = Math.min(hi, Math.max(lo, me.x));
  if (!s.end) {
    const slipping = onOil(s, foe.x) && Math.abs(foe.vx) > 300;
    if ((foe.x < R.stage.left || foe.x > R.stage.right) && slipping && oilBehind({ ...s, foe: { ...foe, x: Math.min(R.stage.oil.to, Math.max(R.stage.oil.from, foe.x)) } })) out(s);
    else foe.x = Math.min(hi, Math.max(lo, foe.x));
    if (!s.end && !rolling && Math.abs(foe.x - me.x) < GAP - 1) { if (me.x <= lo + 0.5 || me.x >= hi - 0.5) foe.x = me.x + sd * GAP; else me.x = foe.x - sd * GAP; }
  }
  for (const who of [me, foe]) if (!who.act && who.stun <= s.t) who.face = Math.sign((who === me ? foe.x - me.x : me.x - foe.x)) || who.face;
}

function shotsStep(s, dt) {
  const k = dt / 1000, R = s.R, me = s.me, foe = s.foe;
  for (const x of s.shots) x.x += x.vx * k;
  // Fire meets ice: both gone in steam. The earth wall eats ice.
  for (const f of s.shots.filter((x) => x.who === 'me' && !x.gone)) for (const i of s.shots.filter((x) => x.who === 'foe' && !x.gone)) {
    if (Math.abs(f.x - i.x) < 26) { i.gone = true; if (!f.big) f.gone = true; fx(s, 'steam', (f.x + i.x) / 2, 60); bump(s, 'steam'); }
  }
  if (s.wall && s.t < s.wall.until) for (const i of s.shots.filter((x) => x.who === 'foe' && !x.gone)) if (Math.abs(i.x - s.wall.x) < 20) { i.gone = true; fx(s, 'spark', s.wall.x, 100); bump(s, 'block'); }
  if (s.wall && s.t >= s.wall.until) s.wall = null;
  for (const x of s.shots) {
    if (x.gone) continue;
    if (x.x < 0 || x.x > R.stage.w) { x.gone = true; continue; }
    if (x.who === 'foe' && Math.abs(x.x - me.x) < 26) {
      x.gone = true;
      if (me.y > 52 || me.crouch || me.down > s.t || safe(s)) continue; // jumped, ducked or rolled under it: it flies on
      const m = R.foe.moves.ice, soft = foe.moves <= R.foe.ai.soft ? R.foe.ai.softBy : 1;
      if (guarded(s, 1, 10)) continue;
      hurtMe(s, Math.max(1, Math.round(m.dmg * soft)), m.push, m.stun);
    }
    if (x.who === 'me' && !x.gone && Math.abs(x.x - foe.x) < 30 && !s.end) {
      x.gone = true;
      const m = x.kind === 'wave' ? R.me.super : x.kind === 'palmfire' ? R.me.palmfire : R.me.special;
      hurtFoe(s, m, { fire: x.kind === 'fire', big: x.kind === 'wave' });
    }
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
    if (foe.x < s.R.stage.left - 4 || foe.x > s.R.stage.right + 4) { foe.y = Math.max(-62, (foe.y ?? 0) - 340 * k); if (foe.y <= -62) foe.vx *= 1 - 14 * k; } // down on the frozen ground, on her feet
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
  if (s.freeze > 0) { s.freeze = Math.max(0, s.freeze - STEP_MS); return; } // hit-stop: the clock holds
  s.t += STEP_MS;
  if (s.cutin && s.t - s.cutin.at > 200) s.cutin = null;
  if (s.end) { endStep(s); return; }
  const me = s.me;
  me.cd = Math.max(0, me.cd - STEP_MS);
  me.cdPf = Math.max(0, me.cdPf - STEP_MS);
  meStep(s);
  if (!s.end) foeStep(s); // hooked this step: her slide is the end's now
  bodies(s, STEP_MS);
  shotsStep(s, STEP_MS);
  if (s.combo.n && s.foe.stun <= s.t && s.t - s.combo.at > 200) s.combo = { ...s.combo, n: 0 };
  if (me.hp <= 0 && !s.end) { s.end = { kind: 'down', at: s.t }; me.down = s.t + END_MS * 2; say(s, 'lost'); bump(s, 'down'); }
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
export const SOUNDS = ['swing', 'whiff', 'hit', 'heavy', 'hurt', 'block', 'jump', 'land', 'dash', 'roll', 'cast', 'fire', 'palmfire', 'ice', 'steam', 'tell', 'early', 'ying', 'glow', 'hold', 'palm', 'hook', 'rise', 'combo', 'cutin', 'super', 'wall', 'knock', 'getup', 'slip', 'down'];
export function sounds(b, a) {
  if (!b?.snd || !a?.snd) return [];
  return SOUNDS.filter((k) => (a.snd[k] ?? 0) > (b.snd[k] ?? 0));
}

/** May the board be left before the page's clock says so (stuck.js, 75 s unwon)? Never: a lost bout is dealt again, and
    the clock alone opens 「算了」 — the same on the Mac's story (whose board holds no state of ours) and the phone. */
export const stuck = () => false;

/** The line a state says now (its key), and how long ago. */
export const lineNow = (s) => s?.line ?? null;

/** The move list (the pause veil's, the phone's): each move's name and its keys, from the level's words. */
export const MOVES = [
  { k: 'light', keys: 'K', touch: '拳' }, { k: 'heavy', keys: 'L', touch: '腿' }, { k: 'special', keys: ';', touch: '火' },
  { k: 'roll', keys: 'O · A/D+O', touch: '迎' }, { k: 'dash', keys: 'D D · A A', touch: '▶▶ · ◀◀' }, { k: 'hop', keys: 'W 轻点 · 按住', touch: '▲' },
  { k: 'chain', keys: 'K K L → S D ;', touch: '拳 拳 腿 → 技' },
  { k: 'palmfire', keys: 'S D ;', touch: '技' }, { k: 'rise', keys: 'D S D L', touch: '▶ + 技' },
  { k: 'super', keys: 'O+; · S S K+L', touch: '绝' }, { k: 'guard', keys: 'A/D 背向她 · S 蹲', touch: '挡 · ▼' },
];
