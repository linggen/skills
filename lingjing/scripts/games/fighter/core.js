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
// His hands — KOF '97's four buttons (Hanli 10-27: 「这个是按照拳皇97来的吗? 97那个就4个key?」); the mount maps keys, the phone
// buttons: light (A 轻拳, K) · lkick (B 轻腿, L) · hpunch (C 重拳, O) · heavy (D 重腿, ; — 勾 at her rear foot) · walk { dir }
// · crouch { on } (蹲: ducks her ice; held away from her with it, a low guard) · block { on } (standing away from her
// guards too) · jump · jumpRelease (W let go soon: a short hop). Two at once: A+B a roll (迎 — in along her blade and out
// past her, untouchable a moment; held away, a roll back; in the edge's push it is the book's 迎), C+D a blowback.
// Double-tap toward her: a dash in; away: a back-step (fast and pressing, not SF's spacing). The phone's skill (技):
// 掌心火, with ▶ (▲, ▼) 升勾, and with a stock full the 绝. `ying` is the roll by name (the bot), `super` the 绝 by name.
// Combos: a 轻拳 or 轻腿 that lands can be cut short into the next blow (K K L, K O …); a 重 that lands into a special
// or the 绝; a jump-in blow stuns long enough for a 拳 on landing. Blows into a foe still reeling count a chain
// (`combo`, 「2 连」…), each a little lighter on her 稳. Motions + 拳 (K or O; MOTION_MS): ↓→ 掌心火 (O: the heavier,
// slower one), →↓→ 升勾, ↓→↓→ the 绝 (one stock).
// Hits stop the clock a beat (`freeze`, hit-stop); a 绝 stops it for its cut-in.
//
// Two spells of the 结印 (Hanli 10-28: 「故事里的战斗可以用格斗」; 10-31 the xianxia moves): I 飞剑 — a flying sword leaves
// his hand, sweeps one loop over the stage (jieyin/flight.js draws it) and dives on her where she stands when it lands
// (`fly` ms later: a step back never outruns it, a guard takes its chip); U 符文 — a talisman laid at her feet that arms
// (`arm` ms, its circle drawn) and binds her where it lies (a stun, a little 稳), unless she has stepped off it or
// stands guarded. Each its own cooldown (`me.cdFj`, `me.cdFw`), shown on its button and a ring by his 气; each shows
// the 稳 it took as a number (fx `num`). A foe may cast the 飞剑 too (`foe.moves.feijian`, `ai.feijian`: 心魔, his own
// moves turned on him).
//
// Her moves (`foe.moves`) are data; two are tricks the book has (doc/games.md § 格斗):
//   edge   at the stage's edge, her point at his throat (Ahe's 底册: 「到了台边，往前送一寸」): a guard, then the push
//          (`tell`). A fresh press in the tell — 迎, forward, or any blow — takes him in along the flat of the blade (a cut
//          on the arm) and out on her far side, she where he stood. Too soon (`early`) and she waits again; nothing in
//          the tell and the inch comes.
//          It comes whenever he stands cornered (near the edge, or anywhere on the slick at it) past `after`: she
//          closes to a blade's length for it, and EDGE_LATE moves later nothing else comes first (2026-11-03, Hanli:
//          「好像卡住了」). K+L together too soon count as one early press. `hook` is the 升勾 by name (the phone's 勾).
//   palm   the green palm (左掌一翻，掌心里亮起一层青光): `glow` (she stands through any blow), `hold` — she holds back
//          three tenths (「她收了三分」), her weight on her rear foot — then `strike`, landing at that share and never the
//          last of him (大比不许伤人性命), and `after`, still loose. His 腿 in `hold` or `after` hooks her rear foot: over
//          the slick, she skids off the edge (the win); elsewhere she staggers and keeps her feet.
//   jianqi her 绝 when her 气 is full: 剑气三尺, a long low sweep of green that knocks him down.
// She never strikes a man who is down (「不踩人」), and the 雷符 in her sleeve is never drawn.
//
// The grade: `clean` when no palm landed on him, `clumsy` when one did (the level's `won` lines say which); stars 3
// clean, 2 clumsy, 1 clumsy with little left of him. Lost at hp 0.
//
// A bout to stand through (`outlast: { moves: N }`, 2026-10-28: 秦雁 on the cliff — 「这回的台子是整座崖，没有台边」): won
// when she has made N moves and he is still up (`end.kind` 'outlast'; her point comes to rest, the book's 「她的剑尖便停在了
// 他心口上」). Graded by what is left of him: `clean` from OUTLAST_CLEAN of his 血, else `clumsy`; stars 3 · 2 · 1 at
// OUTLAST_STARS. A stage with no slick (`stage.oil: false`) has no edge to leave by: she never goes off it.
//
// v7, KOF '97 brought in (Hanli 11-01: 「好多了. 都改一下吧, 尽量接近拳皇97」; doc/games.md § 格斗 v7):
//   feet    a double tap toward her runs (`ME.run`) while the way is held, and stops when it is let go; away, the
//           back-step; a quick tap up hops; A+B rolls.
//   high/low  a blow thrown crouching (↓ held) is low — `clight` · `clkick` · `chpunch` (an anti-air, `aa`) · `cheavy`
//           the 扫堂腿 (a sweep: `knock`s her down) — stood off only crouching; a jump-in blow (`high`) only standing.
//           Her guard has a height too (`foe.act.low`, read from his crouch by `ai.lowRead`); his guard crouching (↙)
//           stands off her sweep, standing her jump-in.
//   throws  ← or → with 重拳/重腿 within `ME.throw.reach`: a grab no guard stops (not in her stun, down or in the air);
//           hers (`FOE.moves.throw`) holds him `escape` ms, in which 重拳/重腿 breaks it (拆).
//   guard   each blow stood off fills the guard's meter (`gp`, refilling when left alone); full, the guard breaks (破防).
//           In a guard's stagger, A+B or C+D with a stock is a guard cancel (roll, blowback).
//   power   A stock spent on 爆气 (MAX: ◀ + 技, or ◀ + J on the keys) makes his blows heavier `ME.max.ms`, and the 绝 in it
//           costs nothing and lands heavier (and ends it); his 血 under `ME.last.under`, one 绝 with no stock (绝境).
//   feel    a blow into her wind-up is a counter (反击: heavier, longer); a knocked-down foe lies `down` ms and rises
//           untouchable a beat; the bout opens with its call (`intro`, the mount's), the KO slows (the mount's SLOW).
//   her     she jumps in (`ai.jump`), runs in (`ai.run`), mixes her sweep with the poke (`ai.sweep`), throws a guard
//           (`ai.throw`), meets his jump (`ai.aa`), rolls through his fire or out of a corner (`ai.roll`), breaks
//           his throw (`ai.tech`) — each a level's knob, by the foe in the book.

export const STEP_MS = 10; //   one physics step; tick(ms) runs as many as fit (the same ms → the same bout)
export const BUF_MS = 300; //   how long a press waits for his hands to be free (a chain's next blow, a fast thumb)
export const MOTION_MS = 320; // a motion's directions, read back from the press that ends it
export const PAIR_MS = 80; //   two keys at once (A+B a roll, C+D a blowback): as near together as KOF's
export const END_MS = 1700; //  the last frame (her slide off the edge, his fall) before the bout is over
export const GRAVITY = 2600;
export const GAP = 58; //       the least distance between two bodies
export const QI = 100; //   one stock of 气 (a 绝 costs one)
export const QI_MAX = 300; // three stocks
export const TAP_MS = 240; // a double tap (dash, back-step)
export const HOP_MS = 130; // W let go this soon: a short hop
export const INTRO_MS = 1300; // the bout's call before the hands are free (the mount sets it: `withIntro`)
export const WAKE_MS = 160;
export const EDGE_LATE = 4; //  her moves past the edge's `after` with him cornered and no edge: she stops all else and comes in //  a foe rising from the boards is untouchable this long

/* The stage, in units: the boards from `left` to `right`, the slick at the left edge (the corner he chose). */
export const STAGE = { w: 960, left: 140, right: 930, oil: { from: 140, to: 250 } };
export const OUTLAST_CLEAN = 0.6; // an outlast bout's `clean`: this share of his 血 or more left
export const OUTLAST_STARS = [0.6, 0.3]; // ★3 from the first share left, ★2 from the second, else ★1

/* His moves (frames in ms): startup · active · recover; reach in units (his feet to hers, where the blow lands); dmg to
   her 稳; push (units); stun on her; `lunge`: a 上步 — the step in during the startup, so the blow lands from further off
   (reach + lunge) — thrown walking toward her (KOF's → + a heavy), and only as far as she stands past the reach; `blocked`: what a guard adds to its recovery (a heavy
   stood off is unsafe, a light is not); `limb`: how far his arm or leg stays out past his body while it strikes and comes back (her blow lands
   on it: a whiffed heavy is punished). `cancel`: may be cut short into the next blow once it lands.
   2026-11-01 (Hanli: 「拳脚都很短, 很难打到对手」 · 「参考拳皇97」): KOF '97's roles — the lights short and quick (冲拳,
   弹腿), the heavies 上步 and long (上步冲拳, 上步侧踹 the longest poke); the lights reach where an unarmed foe stands to
   strike (her rest band, ~120–180), the heavies past it. Was light 108 · lkick 134 · hpunch 120 · heavy 134. */
export const ME = {
  hp: 100, speed: 250, jump: 880, hop: 420, run: 520, step: 480,
  light: { startup: 60, active: 90, recover: 150, reach: 150, limb: 24, dmg: 3, push: 30, stun: 300, cancel: true, qi: 4 },
  heavy: { startup: 200, active: 110, recover: 360, reach: 176, lunge: 40, limb: 60, blocked: 200, dmg: 7, push: 80, stun: 460, hook: true, qi: 7, cancelTo: ['palmfire', 'palmfireH', 'rise', 'super'] },
  lkick: { startup: 80, active: 100, recover: 180, reach: 166, limb: 34, dmg: 3, push: 30, stun: 300, cancel: true, qi: 4 },
  hpunch: { startup: 170, active: 110, recover: 320, reach: 160, lunge: 36, limb: 50, blocked: 160, dmg: 7, push: 70, stun: 460, hook: true, qi: 7, cancelTo: ['palmfire', 'palmfireH', 'rise', 'super'] },
  blow: { startup: 200, active: 110, recover: 360, reach: 152, lunge: 30, limb: 40, blocked: 200, dmg: 8, push: 230, stun: 620, qi: 6 },
  air: { startup: 90, active: 260, recover: 120, reach: 150, dmg: 6, push: 40, stun: 560, qi: 6, high: true },
  rise: { startup: 110, active: 160, recover: 480, reach: 132, dmg: 11, push: 120, stun: 620, hook: true, qi: 9, lift: 520, aa: 260 },
  // crouching (↓ held as the button goes): the lows, stood off only low; `aa`: how high over him it still meets her
  clight: { startup: 50, active: 80, recover: 140, reach: 136, limb: 20, dmg: 2, push: 24, stun: 280, cancel: true, qi: 3, low: true },
  clkick: { startup: 80, active: 90, recover: 190, reach: 170, limb: 36, dmg: 3, push: 26, stun: 300, cancel: true, qi: 4, low: true },
  chpunch: { startup: 120, active: 130, recover: 300, reach: 140, limb: 30, blocked: 120, dmg: 6, push: 60, stun: 440, aa: 230, hook: true, qi: 6, cancelTo: ['palmfire', 'palmfireH', 'rise', 'super'] },
  cheavy: { startup: 150, active: 120, recover: 440, reach: 186, limb: 64, blocked: 260, dmg: 6, push: 40, stun: 300, low: true, knock: 900, hook: true, qi: 7 },
  throw: { reach: 96, startup: 40, active: 20, recover: 300, dmg: 9, push: 220, knock: 1000, qi: 8 },
  max: { ms: 10000, by: 1.25, super: 1.5 }, // 爆气: a stock for heavier blows a while; the 绝 in it the heaviest
  last: { under: 0.25, by: 1.3 }, //           绝境: under this share of his 血, one 绝 with no stock
  guard: { full: 100, rest: 700, refill: 40, broken: 900 }, // the guard's meter: full breaks it; `refill` a second after `rest`
  roll: { ms: 380, safe: 300, speed: 760 },
  special: { kind: 'fire', startup: 210, recover: 260, speed: 640, dmg: 6, push: 260, stun: 300, cd: 5000, qi: 5 },
  palmfire: { kind: 'palmfire', startup: 240, recover: 300, speed: 760, dmg: 8, push: 120, stun: 420, cd: 2200, at: 108, qi: 6 },
  palmfireH: { kind: 'palmfire', startup: 320, recover: 360, speed: 560, dmg: 11, push: 170, stun: 520, cd: 2200, at: 108, qi: 8, big: true },
  super: { name: { zh: '两样', en: 'Two at Once' }, maxName: { zh: '爆', en: 'MAX' }, lastName: { zh: '绝境', en: 'Last Stand' }, cut: 900, startup: 120, recover: 600, speed: 700, dmg: 26, push: 340, stun: 1000 },
  feijian: { startup: 240, recover: 280, fly: 950, dmg: 9, push: 120, stun: 460, cd: 6000, qi: 6 },
  fuwen: { startup: 200, recover: 260, arm: 650, r: 64, bind: 1100, dmg: 5, cd: 8000, qi: 6 },
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
    feijian: { startup: 420, recover: 520, fly: 950, dmg: 6, push: 90, stun: 380, cd: 7000 },
    // KOF '97's (v7): her sweep (low: stood off crouching; knocks him down), her jump-in (`air`: high — stood off
    // standing; `vy` up, at most `vx` across, never over him; the blow from `swing` units above the boards down), her
    // anti-air (`aa`: meets him in the air), her throw (no guard stops it; `escape` ms to break it), her roll and run.
    sweep: { startup: 420, active: 120, recover: 600, reach: 214, dmg: 4, push: 40, stun: 300, low: true, down: 900 },
    air: { vy: 900, vx: 420, swing: 170, reach: 150, dmg: 5, push: 50, stun: 480, high: true, land: 260 },
    aa: { startup: 150, active: 170, recover: 440, reach: 200, dmg: 5, push: 80, stun: 400, down: 800 },
    throw: { startup: 200, active: 40, recover: 420, reach: 100, dmg: 9, push: 60, down: 900, escape: 180 },
    roll: { ms: 420, safe: 320, speed: 720 },
    run: { speed: 440, ms: 900 },
  },
  // Her mind (decide below). A foe's level may lay its own on: how often she reads (`think`), blocks, how soft her first
  // `soft` moves are, when she drives (稳 under `drive`); the odds of each choice (`palm`, `qi`, `ice`, `back`, `thrust`,
  // `driveThrust`, `poke`); `chain`: a poke that lands runs on into a thrust; `qiGain` how fast her 气 fills, `qi0` what
  // she starts with; `edge` / `palmOn` false switch those tricks off (a foe with no blade at his throat).
  ai: { think: 300, block: 0.3, soft: 10, softBy: 0.5, drive: 40, palm: 0.45, qi: 0.6, ice: 0.5, back: 0.35, closePoke: 0.75,
    thrust: 0.3, driveThrust: 0.5, poke: 0.75, chain: 0, qiGain: 1, qi0: 0, edge: true, palmOn: true, chip: 0.25, feijian: 0, runeStep: 0.5, // chip: the share of a blow a guard still takes
    // v7's: the odds of each (秦雁's by default: fast and pressing); `guard`: her guard's meter fills this much slower
    jump: 0.12, run: 0.3, sweep: 0.3, throw: 0.5, aa: 0.5, roll: 0.12, lowRead: 0.6, tech: 0.3, wake: 0.3, guard: 1 },
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
    me: { x: mid - 70, y: 0, vx: 0, vy: 0, face: 1, hp: R.me.hp, act: null, stun: 0, cd: 0, cdPf: 0, cdFj: 0, cdFw: 0, guard: false, air: false, crouch: false, down: 0, qi: 0, airHit: false,
      running: false, gp: 0, gpAt: -1e9, max: 0, lastUsed: false },
    foe: { x: mid + 150, y: 0, vy: 0, air: false, vx: 0, face: -1, bal: R.foe.bal, act: null, stun: 0, down: 0, wake: -1e9, run: 0, gp: 0, gpAt: -1e9, think: 900, cd: { ice: 2500, palm: 0, edge: 0, feijian: 3000 }, moves: 0, qi: R.foe.ai.qi0 ?? 0 },
    in: { dir: 0, block: false, crouch: false }, buf: [], hist: [], last: {}, order: 1,
    shots: [], runes: [], fx: [], n: 0, freeze: 0,
    edge: null, palm: null, end: null, cutin: null, wall: null,
    palmLanded: 0, hooked: false, early: 0, parried: 0, supers: 0, best: 0,
    combo: { n: 0, at: 0, who: 'me' },
    cue: null, line: null, grab: null, intro: 0,
    snd: {}, tally: {}, // tally: what she chose (her mind's options, counted — tests/fighter-kof)
  };
}
/** The bout with its call (KOF's 「Ready · Go」): `ms` of it before the hands are free and she moves (the mount's). */
export function withIntro(state, ms = INTRO_MS) {
  const s = clone(state);
  s.intro = s.t + ms;
  s.foe.think += ms;
  return s;
}

/* ── Small helpers ── */
const clone = (s) => ({ ...s, me: { ...s.me }, foe: { ...s.foe, cd: { ...s.foe.cd } }, in: { ...s.in }, buf: [...s.buf], hist: [...s.hist], last: { ...s.last }, shots: s.shots.map((x) => ({ ...x })), runes: (s.runes ?? []).map((x) => ({ ...x })), fx: [...s.fx], snd: { ...s.snd }, combo: { ...s.combo }, tally: { ...s.tally } });
const tally = (s, k) => { s.tally[k] = (s.tally[k] ?? 0) + 1; };
const bump = (s, k) => { s.snd[k] = (s.snd[k] ?? 0) + 1; };
const say = (s, key) => { s.line = { key, at: s.t }; };
const say0 = (x, lang) => (x && typeof x === 'object' ? x[lang] ?? x.zh ?? '' : x ?? '');
const fx = (s, kind, x, y, extra = {}) => { s.n += 1; s.fx.push({ kind, x, y, at: s.t, id: s.n, ...extra }); if (s.fx.length > 28) s.fx.shift(); };
const side = (s) => s.order ?? (Math.sign(s.foe.x - s.me.x) || 1); // where she stands from him: kept, so a lunge never crosses him
const dist = (s) => Math.abs(s.foe.x - s.me.x);
const onOil = (s, x) => Boolean(s.R.stage.oil) && x >= s.R.stage.oil.from && x <= s.R.stage.oil.to; // a stage may have none (`oil: false`)
/** Did the bout end his way? (`end.won`; an old state's `out` was always his.) */
export const endWon = (e) => Boolean(e && (e.won ?? e.kind === 'out'));
const gainQi = (who, n) => { who.qi = Math.min(QI_MAX, (who.qi ?? 0) + n); };
/* Untouchable: the first part of a roll. */
const safe = (s) => s.me.act?.k === 'roll' && s.t - s.me.act.at < s.R.me.roll.safe;
/* Hers: her roll's first part, down on the boards, the beat she rises in (no blow lands on a fallen foe: KOF's). */
const foeSafe = (s) => { const f = s.foe; return f.down > s.t || s.t - f.wake < WAKE_MS || (f.act?.k === 'roll' && s.t - f.act.at < s.R.foe.moves.roll.safe); };
/** Is the 绝 his to throw now: a stock, 爆气 (it is paid), or 绝境 (his 血 low, once a bout)? */
export const superReady = (s) => s.me.qi >= QI || s.me.max > s.t || lastStand(s);
const lastStand = (s) => !s.me.lastUsed && s.me.hp > 0 && s.me.hp <= s.R.me.hp * (s.R.me.last?.under ?? 0);
/* Thrown at close range: on the boards, free (not reeling, not down, not rolling). */
const throwable = (who, t) => !who.air && !(who.y > 0) && who.stun <= t && !(who.down > t);
const hitstop = (s, ms) => { s.freeze = Math.max(s.freeze, ms); };
/** Over the slick: where she stands. */
export const foeOnOil = (s) => onOil(s, s.foe.x);
/* The slick lies at one edge: the left one when it is nearer the left. Its edge is at her back when he stands on the
   other side of her from it. */
const oilBehind = (s) => {
  if (!s.R.stage.oil) return false; // no slick (the cliff): no edge to leave by
  const oilAtLeft = s.R.stage.oil.from - s.R.stage.left <= s.R.stage.right - s.R.stage.oil.to;
  return onOil(s, s.foe.x) && side(s) === (oilAtLeft ? -1 : 1);
};
/** Near an edge of the stage with his back to it: -1 the left edge, 1 the right, 0 neither. */
export function cornered(s, near = s.R.foe.moves.edge.near) {
  const back = -side(s), oil = s.R.stage.oil;
  if (back < 0 && (s.me.x - s.R.stage.left <= near || (oil && onOil(s, s.me.x) && oil.from - s.R.stage.left <= near))) return -1;
  if (back > 0 && (s.R.stage.right - s.me.x <= near || (oil && onOil(s, s.me.x) && s.R.stage.right - oil.to <= near))) return 1;
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
const busy = (who, t) => Boolean(who.act) || who.stun > t || who.down > t;
const NORMALS = new Set(['light', 'lkick', 'hpunch', 'heavy', 'blow', 'clight', 'clkick', 'chpunch', 'cheavy']);
const STRIKES = new Set([...NORMALS, 'air', 'rise']); // his blows that land by reach
const HEAVIES = new Set(['heavy', 'rise', 'hpunch', 'blow', 'chpunch', 'cheavy']);
const CROUCH = { light: 'clight', lkick: 'clkick', hpunch: 'chpunch', heavy: 'cheavy' }; // a button with ↓ held
/** How far his arm or leg is out past his body now (a blow's `limb`, while it strikes and comes back): her blow lands on
    it from that much further off — a whiffed heavy is punished (KOF's hurtbox on the limb). */
export function limbOut(s) {
  const a = s.me.act;
  if (!a || !NORMALS.has(a.k)) return 0;
  const ph = phaseOf(a, s.t);
  return ph === 'active' || ph === 'recover' ? (a.m.limb ?? 0) : 0;
}

/* ── His hands ── */
const PRESS = new Set(['jump', 'light', 'lkick', 'hpunch', 'heavy', 'special', 'ying', 'hook', 'skill', 'super', 'feijian', 'fuwen', 'max']);
const PUNCH = new Set(['light', 'hpunch']);
const PAIRED = new Set(['super', 'roll', 'blow']); // a press that takes the place of the pair's first key
const tapped = (s, k) => s.hist.filter((h) => h.k === k && s.t - h.at <= TAP_MS).length >= 2;
/** The player's hand: `walk` { dir: -1 | 0 | 1 } (screen left/right), `crouch` { on }, `block` { on }, and the presses
    jump · light · heavy · special · ying · skill · super · max. Answers { state } (the same state when nothing changed).
    A press or a guard may carry what is held with it, as one thumb on the dial holds it (`crouch`: ↓, `dir`: ← →):
    { g: 'heavy', crouch: true } is the sweep, { g: 'block', on: true, crouch: true } the low guard (↙), `run` a
    double tap toward her by name (the bot's). */
export function act(state, d = {}) {
  if (!state || state.won || state.lost || state.end) return { state, won: false };
  if ((d.crouch != null || d.dir != null) && d.g !== 'walk' && d.g !== 'crouch') {
    let s0 = state;
    if (d.dir != null && Math.sign(d.dir) !== s0.in.dir) s0 = act(s0, { g: 'walk', dir: d.dir }).state;
    if (d.crouch != null && Boolean(d.crouch) !== s0.in.crouch) s0 = act(s0, { g: 'crouch', on: Boolean(d.crouch) }).state;
    const { crouch: _c, dir: _d, ...rest } = d;
    return act(s0, rest);
  }
  const g = d.g;
  if (g === 'run') { // a double tap toward her, by name
    const s = clone(state);
    s.in.dir = side(s);
    if (!s.edge) s.buf = [...s.buf, { k: 'dash', at: s.t }].slice(-3);
    return { state: s, won: false };
  }
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
    if (state.t < (state.intro ?? 0)) return { state, won: false }; // the bout's call: hands not yet free
    const s = clone(state);
    if (pressed(s, g)) return { state: s, won: false };
    // held in her throw: 重拳 or 重腿 breaks it (拆)
    if (s.grab && (g === 'hpunch' || g === 'heavy')) { tech(s); return { state: s, won: false }; }
    const k = read(s, g);
    s.last[g] = s.clock ?? 0;
    // a 绝 takes the place of the pair's first key, if it still waits
    if (k) s.buf = [...s.buf.filter((b) => s.t - b.at <= BUF_MS && !(PAIRED.has(k) && ['light', 'lkick', 'hpunch', 'heavy'].includes(b.k))), { k, at: s.t }].slice(-3);
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
  const pair = (a) => (s.clock ?? 0) - (s.last[a] ?? -1e9) <= PAIR_MS; // on the hands' clock: a hit-stop never joins two presses
  const can = superReady(s), back = s.in.dir !== 0 && s.in.dir === -side(s);
  if (g === 'super') return can ? 'super' : null;
  if (g === 'max') return full && !(me.max > s.t) ? 'max' : null;
  if (g === 'ying') return 'roll';
  if (g === 'hook') return 'rise'; // the 升勾 by name (the phone's 勾 button in her palm's window): no motion, no way to get wrong
  // KOF '97's four buttons (A 轻拳 K · B 轻腿 L · C 重拳 O · D 重腿 ;): A+B rolls, C+D blows her back
  if ((g === 'light' && pair('lkick')) || (g === 'lkick' && pair('light'))) return 'roll';
  if ((g === 'hpunch' && pair('heavy')) || (g === 'heavy' && pair('hpunch'))) return 'blow';
  // motion + 拳: ↓→↓→ the 绝 (a stock), →↓→ 升勾, ↓→ 掌心火 (C: the heavier, slower one)
  if (PUNCH.has(g)) {
    if (can && seq(s, ['d', 'f', 'd', 'f'])) return 'super';
    if (seq(s, ['f', 'd', 'f'])) return 'rise';
    if (seq(s, ['d', 'f'])) return g === 'hpunch' ? 'palmfireH' : 'palmfire';
  }
  // the phone's 技: 掌心火; with ▶ (or ▲, ▼) 升勾; a full stock, the 绝 — held away from her (◀ + 技), 爆气
  if (g === 'skill') {
    if (back && full && !(me.max > s.t) && !me.air) return 'max';
    return can ? 'super' : (s.in.dir === side(s) || s.in.crouch || me.air) ? 'rise' : 'palmfire';
  }
  return g;
}

/* A press while her point is at his throat answers the edge, and is spent there. */
function pressed(s, k) {
  const e = s.edge;
  if (!e || s.me.stun > s.t || s.me.down > s.t) return false;
  if (e.phase === 'guard') {
    if (s.t - (e.earlyAt ?? -1e9) <= PAIR_MS) return true; // K+L together: one press too soon, not two
    e.earlyAt = s.t;
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
  // a blow into his wind-up: a counter (KOF's) — heavier, and he reels longer
  const counter = me.act && STRIKES.has(me.act.k) && phaseOf(me.act, s.t) === 'startup';
  if (counter) { dmg = Math.round(dmg * 1.2); stun += 120; fx(s, 'counter', me.x, 210, { who: 'me' }); bump(s, 'counter'); }
  me.hp = Math.max(lethal ? 0 : 1, me.hp - dmg);
  me.act = null;
  me.running = false;
  s.grab = null;
  me.stun = s.t + stun;
  if (down) { me.down = s.t + down; me.stun = me.down + 200; bump(s, 'knock'); }
  me.vx = -side(s) * push * 4;
  gainQi(me, 6);
  gainQi(s.foe, 4 * (s.R.foe.ai.qiGain ?? 1));
  s.combo = { n: 0, at: s.t, who: 'me' };
  hitstop(s, down ? 110 : 70);
  fx(s, 'ink', me.x + side(s) * 18, me.y + (me.crouch ? 70 : 110));
  bump(s, 'hurt');
}
/* A blow he stands off: a chip of it, a step back, a moment's stiff arms (a wall of blocks wears down too). A low one
   (her sweep) is stood off only crouching, a high one (her jump-in) only standing. Each fills his guard's meter (`gp`);
   full, the guard breaks (破防) and he stands open. Answers whether he stood it off. */
function guarded(s, chip, push, { low = false, high = false, gp = 12 } = {}) {
  const me = s.me, G = s.R.me.guard;
  if (!me.guard) return false;
  if ((low && !me.crouch) || (high && me.crouch)) return false;
  me.hp = Math.max(0, me.hp - chip);
  me.stun = s.t + 140;
  me.gstun = me.stun; // a guard's stagger: a guard cancel may cut it (meStep)
  me.vx = -side(s) * push * 3;
  gainQi(me, 3);
  hitstop(s, 50);
  fx(s, 'spark', me.x + side(s) * 20, me.crouch ? 70 : 116);
  bump(s, 'block');
  me.gp = (me.gp ?? 0) + gp; me.gpAt = s.t;
  if (G && me.gp >= G.full) { // 破防
    me.gp = 0; me.guard = false; me.gstun = 0;
    me.stun = s.t + G.broken; me.broken = me.stun;
    s.foe.think = Math.min(s.foe.think, s.t + (s.R.foe.ai.react ?? 250)); // she sees him open
    fx(s, 'crush', me.x, 230, { who: 'me' });
    bump(s, 'crush');
    hitstop(s, 120);
  }
  return true;
}

/* What a blow of his does to her: her 稳, her stagger, how far she slides (looser, further; on the slick, further still). */
function hurtFoe(s, m, o = {}) {
  const was = s.foe.bal;
  hurtFoeBy(s, m, o);
  const lost = Math.round(was - s.foe.bal);
  if (o.num && lost > 0) fx(s, 'num', s.foe.x, 200, { n: lost, who: 'foe' });
}
function hurtFoeBy(s, m, { heavy = false, fire = false, big = false, pow = 1 } = {}) {
  const foe = s.foe, R = s.R, sd = side(s);
  if (foeSafe(s)) return; // down, rising, rolling: it passes over her
  const glow = s.palm?.phase === 'glow';
  const loose = s.palm && (s.palm.phase === 'hold' || s.palm.phase === 'after');
  if (heavy && m.hook && loose) return hook(s);
  // KOF's walk back is a guard: stepping away from him, free, she stands a blow off (`ai.backGuard` of the time)
  const backing = !foe.act && !foe.air && foe.stun <= s.t && foe.vx * sd > 10 && roll(s) < (R.foe.ai.backGuard ?? 0.7);
  // her guard's height: a low blow beats it standing, a jump-in crouching (the walk back stands)
  const stance = foe.act?.k === 'block' ? (foe.act.low ? 'low' : 'high') : backing ? 'high' : null;
  const stands = stance && !(stance === 'high' && m.low) && !(stance === 'low' && m.high);
  if (stands && !fire && !loose && !big) {
    foe.bal = Math.max(0, foe.bal - m.dmg * (m.kind ? 0.3 : 0.15)); // a special stood off still chips (KOF's)
    foe.vx = sd * m.push * 2.2;
    // KOF's frame disadvantage: a heavy stood off leaves him open a beat (`blocked`), a light is safe; she lets the guard
    // go and answers (decide: the riposte)
    if (m.blocked && s.me.act?.m === m) {
      s.me.act.m = { ...m, recover: m.recover + m.blocked };
      foe.act = null; foe.riposte = s.t; foe.think = Math.min(foe.think, s.t + (R.foe.ai.react ?? 250));
    }
    gainQi(s.me, 2);
    hitstop(s, 50);
    fx(s, 'spark', foe.x - sd * 22, stance === 'low' ? 60 : 110);
    bump(s, 'block');
    // her guard's meter: heavies and specials fill it, the lights hardly (a masher never breaks it); full, 破防
    const G = R.me.guard;
    foe.gp = (foe.gp ?? 0) + (m.gp ?? (m.dmg >= 6 ? 14 : 3)) / (R.foe.ai.guard ?? 1); foe.gpAt = s.t;
    if (G && foe.gp >= G.full) {
      foe.gp = 0; foe.act = null; foe.riposte = 0;
      foe.stun = s.t + G.broken;
      fx(s, 'crush', foe.x, 230, { who: 'foe' });
      bump(s, 'crush');
      hitstop(s, 120);
    }
    return;
  }
  // a chain: blows into a foe still reeling
  const chained = foe.stun > s.t && s.combo.who === 'me' && s.combo.n > 0;
  // `ai.burst`: a foe pinned by that many blows in a chain breaks out (气 burst) and throws him back — mashing one
  // button never holds her down for good (a level's knob; none by default)
  if (chained && s.combo.n >= (R.foe.ai.burst ?? Infinity)) { burst(s); return; }
  s.combo = { n: chained ? s.combo.n + 1 : 1, at: s.t, who: 'me' };
  s.best = Math.max(s.best, s.combo.n);
  if (s.combo.n >= 2) bump(s, 'combo');
  const scale = Math.pow(0.85, s.combo.n - 1);
  // a blow into her wind-up: a counter (反击) — heavier, and she reels longer; 爆气 makes every blow heavier
  // (only in the last beat of her wind-up: her long tells would make nearly every blow a counter)
  const counter = foe.act && !['block', 'edge', 'palm', 'roll', 'jump', 'land'].includes(foe.act.k) && phaseOf(foe.act, s.t) === 'startup' && foe.act.m.startup - (s.t - foe.act.at) <= 160;
  pow *= (s.me.max > s.t ? R.me.max?.by ?? 1 : 1) * (counter ? 1.2 : 1);
  if (counter) { fx(s, 'counter', foe.x, 210, { who: 'foe' }); bump(s, 'counter'); }
  foe.bal = Math.max(0, foe.bal - m.dmg * scale * (glow ? 0.5 : 1) * pow);
  gainQi(s.me, m.qi ?? 5);
  gainQi(foe, 3 * (R.foe.ai.qiGain ?? 1));
  hitstop(s, big ? 140 : heavy ? 90 : 65);
  fx(s, 'ink', foe.x - sd * 16, fire ? 24 : 112, { big: heavy || big });
  bump(s, big ? 'super' : heavy ? 'heavy' : 'hit');
  if (glow || (loose && !heavy && !big)) return; // she stands through it: the palm goes on
  if (s.palm) s.palm = null;
  if (s.edge) { s.edge = null; s.cue = null; }
  foe.act = null;
  foe.run = 0;
  foe.stun = s.t + m.stun + (counter ? 160 : 0);
  foe.hitAt = s.t;
  const looser = 1 + (R.foe.bal - foe.bal) / (R.foe.bal * 0.6);
  foe.vx = sd * m.push * 4 * (fire ? 1 : looser) * (onOil(s, foe.x) && !fire ? 1.6 : 1);
  // down: a sweep (`knock`) on the boards; any blow in the air brings her down where she lands
  if (foe.air) { foe.fell = true; foe.stun = s.t + 3000; }
  else if (m.knock) knockFoe(s, m.knock);
  if (m.lift) foe.lift = s.t;
  if (fire) { foe.hop = s.t; say(s, 'fireHop'); }
  // A big blow over the slick, its edge at her back: she skids off, as the hook takes her.
  if (big && oilBehind(s)) out(s);
}

/* Her down on the boards `ms`, then up (foeStep: her wake-up, untouchable a beat). */
function knockFoe(s, ms) {
  const foe = s.foe;
  foe.down = s.t + ms; foe.stun = foe.down; foe.act = null; foe.run = 0;
  bump(s, 'knock');
  fx(s, 'dust', foe.x, 0);
}
/* His throw lands: no guard stops it; a sharp foe may break it (`ai.tech`: both thrown apart). */
function throwFoe(s) {
  const foe = s.foe, R = s.R, m = R.me.throw, sd = side(s);
  if (!throwable(foe, s.t) || foeSafe(s) || dist(s) > m.reach + 10 || s.palm || s.edge) { bump(s, 'whiff'); return false; }
  if (roll(s) < (R.foe.ai.tech ?? 0)) {
    foe.act = null; foe.vx = sd * 520; s.me.vx = -sd * 520;
    fx(s, 'tech', (foe.x + s.me.x) / 2, 150); bump(s, 'tech'); tally(s, 'tech');
    return false;
  }
  s.combo = { n: 0, at: s.t, who: 'me' };
  const pow = s.me.max > s.t ? R.me.max?.by ?? 1 : 1;
  foe.bal = Math.max(0, foe.bal - m.dmg * pow);
  gainQi(s.me, m.qi ?? 6);
  gainQi(foe, 3 * (R.foe.ai.qiGain ?? 1));
  hitstop(s, 120);
  fx(s, 'ink', foe.x - sd * 10, 80, { big: true });
  fx(s, 'num', foe.x, 200, { n: Math.round(m.dmg * pow), who: 'foe' });
  bump(s, 'throw');
  foe.vx = sd * m.push;
  foe.hitAt = s.t;
  knockFoe(s, m.knock);
  return true;
}

/* Her burst out of a chain: her stagger gone, him thrown back a step and stiff a moment. */
function burst(s) {
  const me = s.me, foe = s.foe, sd = side(s);
  foe.stun = s.t; foe.act = null; foe.think = s.t + 200;
  s.combo = { n: 0, at: s.t, who: 'me' };
  me.act = null; me.stun = s.t + 420; me.vx = -sd * 900;
  hitstop(s, 90);
  fx(s, 'spark', foe.x - sd * 30, 110);
  if (s.level?.lines?.burst) say(s, 'burst');
  bump(s, 'block');
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
  s.end = { kind: 'out', at: s.t, from: foe.x, dir: sd, won: true };
  say(s, s.palmLanded ? 'outClumsy' : 'out');
  bump(s, 'slip');
}

/* ── Her moves ── */
function startFoe(s, k, quick = 1) {
  const foe = s.foe, m = s.R.foe.moves[k];
  foe.act = { k, at: s.t, m: { startup: Math.round((m.startup ?? 0) * quick), active: m.active ?? 0, recover: m.recover ?? m.hold ?? 0 }, hit: false, shot: 0 };
  foe.vx = 0;
  foe.run = 0;
  if (k !== 'block') { foe.moves += 1; bump(s, 'swing'); }
  if (['sweep', 'aa', 'throw'].includes(k)) tally(s, k);
  if (k !== 'jianqi' && s.level?.lines?.[`foe_${k}`]) say(s, `foe_${k}`); // a level's tell for a move (马小宝's blotches flush before the beam)
  if (k === 'thrust') bump(s, 'tell');
  if (k === 'ice') { bump(s, 'tell'); foe.cd.ice = m.cd; }
  if (k === 'feijian') { bump(s, 'tell'); foe.cd.feijian = m.cd; }
  if (k === 'jianqi') { foe.qi -= QI; s.cutin = { who: 'foe', name: m.name, at: s.t }; hitstop(s, m.cut); bump(s, 'cutin'); say(s, 'jianqi'); }
}

/* Her jump in (KOF's): up and across at him, never over him — she lands short of him; the blow (`air`) as she comes down. */
function startJump(s) {
  const foe = s.foe, M = s.R.foe.moves.air, up = (2 * M.vy) / GRAVITY;
  foe.act = { k: 'jump', at: s.t, m: { startup: 1e9, active: 0, recover: 0 }, hit: false };
  foe.air = true; foe.vy = M.vy; foe.run = 0;
  foe.vx = -side(s) * Math.min(M.vx, Math.max(0, dist(s) - GAP - 24) / up);
  bump(s, 'jump');
  tally(s, 'jump');
}
/* Her roll (A+B's): through him (or out of the corner), untouchable its first part. */
function startRoll(s, dir) {
  const foe = s.foe, m = s.R.foe.moves.roll;
  foe.act = { k: 'roll', at: s.t, m: { startup: 0, active: m.ms, recover: 90 }, hit: true, dir };
  foe.vx = dir * m.speed; foe.run = 0;
  bump(s, 'roll');
  fx(s, 'dust', foe.x, 0, { small: true });
  tally(s, 'roll');
}
/* Her run in: fast at him, a strike or a throw when she is there (decide). */
function startRun(s) {
  const foe = s.foe, m = s.R.foe.moves.run;
  foe.run = s.t + m.ms; foe.vx = -side(s) * m.speed; foe.think = s.t + 60;
  bump(s, 'dash');
  tally(s, 'run');
}
/* What she throws from where she stands, in close: her throw on a guard, her sweep or her poke (her mix of high and low). */
function closeIn(s) {
  const foe = s.foe, me = s.me, ai = s.R.foe.ai, M = s.R.foe.moves, d = dist(s);
  if (M.throw && d <= M.throw.reach + 6 && throwable(me, s.t) && (me.guard || !me.act) && roll(s) < (me.guard ? Math.max(ai.throw, 0.7) : ai.throw)) { startFoe(s, 'throw'); return true; }
  if (M.sweep && d <= M.sweep.reach && roll(s) < ai.sweep) { startFoe(s, 'sweep'); return true; }
  if (d <= M.poke.reach + 6) { startFoe(s, 'poke'); return true; }
  return false;
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

/* The edge is hers to start: his back to the stage's edge, `after` moves in, off its cooldown, a foe who has it. */
const edgeDue = (s) => s.R.foe.ai.edge !== false && Boolean(cornered(s)) && s.foe.moves >= s.R.foe.moves.edge.after && s.foe.cd.edge <= 0;

/* Her mind: every `think` ms while her hands are free, one choice — readable on purpose. */
function decide(s) {
  const foe = s.foe, me = s.me, R = s.R, ai = R.foe.ai, M = R.foe.moves, d = dist(s), t = s.t;
  foe.think = t + ai.think * (0.8 + roll(s) * 0.5);
  // 不踩人: she waits him up — but a guard broken open (破防) is hers to strike
  if (me.broken > t && !me.down) {
    if (d <= M.poke.reach) { startFoe(s, 'poke', ai.quick ?? 0.5); return; }
    if (M.run) { startRun(s); return; }
  }
  if ((me.stun > t + 200 && !(me.broken > t)) || me.down > t) { foe.vx = 0; foe.run = 0; return; }
  // Cornered and the edge long due (EDGE_LATE of her moves past `after`): nothing else first — she comes to his throat.
  if (edgeDue(s) && foe.moves >= M.edge.after + EDGE_LATE) {
    if (d < M.poke.reach + 20) { startEdge(s); return; }
    foe.run = 0; foe.vx = -side(s) * R.foe.speed; foe.think = t + 60; return;
  }
  // Running in: on, until she is there — then her strike, her sweep or her throw.
  if (foe.run > t) {
    if (d <= M.poke.reach && closeIn(s)) return;
    foe.vx = -side(s) * M.run.speed; foe.think = t + 60;
    return;
  }
  // His jump at her: she meets it (`ai.aa`, her rising cut), or stands it off below.
  if (me.air && !me.aaSeen) { // one look a jump
    me.aaSeen = true;
    if (M.aa && d < M.aa.reach + 90 && me.vx * side(s) >= 0 && roll(s) < ai.aa) { startFoe(s, 'aa', 0.8); return; }
  }
  // His blow coming, within its own reach (a 上步 heavy's step counted): she may stand it off — low against a low one
  // as often as she reads it (`ai.lowRead`). A hand that swings and swings (three blows in 1.5 s) is read: she guards it
  // far more often (`ai.read`).
  const pressing = (me.swings ?? []).filter((x) => t - x < 1500).length >= 3;
  if (me.act && (NORMALS.has(me.act.k) || me.act.k === 'air') && !me.act.whiff && d < (me.act.m.reach ?? 0) + (me.act.m.lunge ?? 0) + 20 && roll(s) < (pressing ? Math.max(ai.block, ai.read ?? 0.75) : ai.block)) {
    startFoe(s, 'block');
    const lr = ai.lowRead ?? 0.6;
    foe.act.low = me.act.k !== 'air' && (me.act.m.low ? roll(s) < lr : me.crouch && roll(s) < lr * 0.4);
    return;
  }
  // His blow gone by her (a whiff), his arm or leg still out — or one she just stood off: she punishes it (`ai.punish`), on
  // her own reaction (foeStep), quicker than her usual wind-up (`ai.quick`: she saw it coming).
  const whiffed = me.act?.whiff && !me.act.landed && !me.act.punished && phaseOf(me.act, t) === 'recover';
  const stood = foe.riposte && t - foe.riposte < 500;
  if (whiffed || stood) {
    if (whiffed) me.act.punished = true;
    foe.riposte = 0;
    if (roll(s) < (ai.punish ?? 0.5)) {
      const ext = limbOut(s);
      if (d <= M.poke.reach + ext) { startFoe(s, 'poke', ai.quick ?? 0.5); return; }
      if (d <= M.thrust.reach + M.thrust.lunge + ext) { startFoe(s, 'thrust', ai.quick ?? 0.5); return; }
    }
  }
  // Hit a moment ago: she gives ground (`ai.backHit`), then comes again.
  if (foe.hitAt && t - foe.hitAt < 900) {
    foe.hitAt = 0;
    if (roll(s) < (ai.backHit ?? 0.45)) { foe.vx = side(s) * R.foe.back; foe.think = t + 340; return; }
  }
  // A poke of hers just landed and she runs on (`ai.chain`): the thrust after it, at once.
  if (foe.chain && t - foe.chain < 600 && d <= M.thrust.reach) { foe.chain = 0; startFoe(s, 'thrust'); return; }
  foe.chain = 0;
  if (edgeDue(s)) {
    if (d < M.poke.reach + 20) { startEdge(s); return; }
    if (d < 330) { foe.vx = -side(s) * R.foe.speed; foe.think = t + ai.think * 0.4; return; } // in to a blade's length
  }
  if (ai.palmOn !== false && d < M.palm.reach + 16 && foe.bal <= M.palm.under && foe.cd.palm <= 0 && roll(s) < ai.palm) { startPalm(s, 'close'); return; }
  if (foe.qi >= QI && d < M.jianqi.reach - 20 && roll(s) < ai.qi) { startFoe(s, 'jianqi'); return; }
  if (ai.feijian > 0 && M.feijian && foe.cd.feijian <= 0 && d > 180 && roll(s) < ai.feijian) { startFoe(s, 'feijian'); return; }
  // His fire coming at her: through it in a roll (`ai.roll`), or over it (`ai.jump`).
  const fire = s.shots.find((x) => x.who === 'me' && x.kind !== 'feijian' && Math.sign(x.vx) === side(s) && Math.abs(x.x - foe.x) < 240);
  if (fire && !fire.seen) {
    fire.seen = true;
    if (M.roll && roll(s) < ai.roll * 2.5) { startRoll(s, -side(s)); return; }
    if (M.air && !fire.big && roll(s) < ai.jump * 2) { startJump(s); return; }
  }
  // Her back at the boards' end and him on her: out of the corner in a roll through him (`ai.roll`).
  const backTo = side(s) > 0 ? R.stage.right - foe.x : foe.x - R.stage.left;
  if (M.roll && backTo < 90 && d < 200 && !s.edge && roll(s) < ai.roll) { startRoll(s, -side(s)); return; }
  // In close, him guarding or standing: her throw (no guard stops it); a guard held and held, she runs in to it.
  if (M.throw && d <= M.throw.reach + 6 && throwable(me, t) && (me.guard || !me.act) && roll(s) < ai.throw) { startFoe(s, 'throw'); return; }
  // a guard held and held (a turtle, KOF's AI reads it): she runs in to throw it
  const holding = me.guard && t - (me.guardAt ?? t) > 700;
  if (M.throw && M.run && holding && !s.shots.some((x) => x.who === 'foe') && d < 330 && roll(s) < ai.throw) { startRun(s); return; }
  // A talisman under her feet: she may step off it before it arms.
  if ((s.runes ?? []).some((r) => !r.done && Math.abs(foe.x - r.x) <= s.R.me.fuwen.r) && roll(s) < (ai.runeStep ?? 0)) { foe.vx = side(s) * R.foe.back * 1.6; foe.think = t + 420; return; }
  if (ai.iceAt != null && d > ai.iceAt && foe.cd.ice <= 0 && roll(s) < ai.ice) { startFoe(s, 'ice'); return; } // a level's own range for her shot (马小宝 at the edge)
  if (d > 330) {
    if (foe.cd.ice <= 0 && roll(s) < ai.ice) { startFoe(s, 'ice'); return; }
    if (M.run && roll(s) < ai.run * 0.5) { startRun(s); return; }
    foe.vx = -side(s) * R.foe.speed;
    return;
  }
  // Footsies (2026-11-01, Hanli: 「机器人也有点傻, 一直往前跑」): she keeps her own range (`ai.range`, by default where
  // her poke just lands), coming on in steps with a pause between (`ai.pace`), and in it she waits, sways in and out,
  // and strikes; a mistake (`ai.err`) is a strike from where she stands, in range or not.
  // by default just past his longest blow (the 上步 heavy, its step counted), as KOF's footsies stand
  const range = ai.range ?? Math.max(M.poke.reach - 10, R.me.heavy.reach + (R.me.heavy.lunge ?? 0) + 10), band = ai.band ?? 24;
  if (roll(s) < (ai.err ?? 0)) { startFoe(s, roll(s) < 0.5 ? 'poke' : 'thrust'); return; }
  if (d > range + band) {
    if (M.air && d < 420 && roll(s) < ai.jump) { startJump(s); return; } // KOF's jump in, from past his reach
    if (M.run && roll(s) < ai.run * 0.6) { startRun(s); return; }
    if (roll(s) < (ai.pace ?? 0.3)) { foe.vx = 0; foe.think = t + ai.think * 0.7; return; }
    foe.vx = -side(s) * R.foe.speed;
    foe.think = t + ai.think * 0.6;
    return;
  }
  if (d < Math.min(120, range - band)) {
    const r = roll(s);
    if (r < ai.back) { foe.vx = side(s) * R.foe.back; foe.think = t + 380; return; } // back to her length of blade
    if (r < ai.closePoke && closeIn(s)) return;
    startFoe(s, r < ai.closePoke ? 'poke' : 'thrust');
    return;
  }
  const r = roll(s), driving = foe.bal <= ai.drive;
  if (M.air && roll(s) < ai.jump * 0.5) { startJump(s); return; }
  if (r < (driving ? ai.driveThrust : ai.thrust) && d <= M.thrust.reach + (M.thrust.lunge ?? 0)) startFoe(s, 'thrust');
  else if (r < ai.poke) {
    if (M.sweep && d <= M.sweep.reach && roll(s) < ai.sweep) startFoe(s, 'sweep'); // low, under his guard
    else if (d <= M.poke.reach + 6) startFoe(s, 'poke');
    else if (d <= M.thrust.reach + (M.thrust.lunge ?? 0) && roll(s) < 0.5) startFoe(s, 'thrust'); // her long one, from where she stands
    else { foe.vx = -side(s) * R.foe.speed; foe.think = t + ai.think * 0.5; } // a step in to her poke's length
  } else { // sway: a half step out or in about her range, then look again
    const out = d < range ? roll(s) < 0.7 : roll(s) < 0.3;
    foe.vx = (out ? side(s) : -side(s)) * R.foe.speed * 0.5;
    foe.think = t + ai.think * 0.8;
  }
}

/* What her blade does to him this step (her move's active frames, once a move). */
function foeStrikes(s) {
  const foe = s.foe, me = s.me, a = foe.act, R = s.R;
  if (!a || a.hit) return;
  const ph = phaseOf(a, s.t);
  if (a.k === 'jump') { // her jump-in: the blow as she comes down, high (stood off standing)
    const m = R.foe.moves.air;
    if (!a.swung && foe.vy < 0 && foe.y <= m.swing) { a.swung = s.t; foe.moves += 1; bump(s, 'swing'); }
    if (!a.swung || dist(s) > m.reach + limbOut(s) || me.y > 120 || me.down > s.t || me.stun > s.t + 300 || safe(s)) return;
    a.hit = true;
    if (guarded(s, Math.round(m.dmg * (R.foe.ai.chip ?? 0.25)), m.push, { high: true, gp: m.gp ?? 18 })) return;
    hurtMe(s, m.dmg, m.push, m.stun);
    return;
  }
  if (a.k === 'throw' && ph === 'active') { // her hands on him: held, he may break it (act: 重拳 or 重腿)
    a.hit = true;
    if (dist(s) > R.foe.moves.throw.reach + 8 || !throwable(me, s.t) || safe(s) || me.act?.k === 'backstep') { bump(s, 'whiff'); return; }
    const early = Math.max(s.last.hpunch ?? -1e9, s.last.heavy ?? -1e9); // pressed a beat before her hands came: broken at once
    me.act = null; me.running = false; me.vx = 0;
    if ((s.clock ?? 0) - early < 160) { tech(s); return; }
    s.grab = { at: s.t, until: s.t + R.foe.moves.throw.escape };
    me.stun = s.grab.until + 60;
    bump(s, 'tell');
    return;
  }
  if (a.k === 'ice') {
    const m = R.foe.moves.ice;
    while (a.shot < m.count && s.t - a.at >= m.startup + a.shot * m.gap) {
      a.shot += 1;
      s.n += 1;
      // `kind`: how it looks (ice · blade: 卢方's 金刃 along the boards · quake: 祁长松's stamp through the ground); `low`
      // ones are jumped, never ducked.
      s.shots.push({ who: 'foe', kind: m.kind ?? 'ice', mv: 'ice', from: foe.x - side(s) * 30, x: foe.x - side(s) * 30, y: m.at, vx: -side(s) * m.speed, id: s.n, ...(m.low ? { low: true } : {}) });
      bump(s, 'ice');
    }
    if (a.shot >= m.count) a.hit = true;
    return;
  }
  if (a.k === 'feijian' && s.t - a.at >= a.m.startup) {
    const m = R.foe.moves.feijian;
    a.hit = true; s.n += 1;
    s.shots.push({ who: 'foe', kind: 'feijian', x: foe.x, y: 150, vx: 0, from: { x: foe.x, y: 150 }, at: s.t, land: s.t + m.fly, id: s.n });
    bump(s, 'feijian');
    return;
  }
  if (a.k === 'jianqi' && R.foe.moves.jianqi.wave && ph === 'active') { // a mirror's 绝: the fire along the boards, as his
    const m = R.foe.moves.jianqi;
    a.hit = true; s.n += 1;
    s.shots.push({ who: 'foe', kind: 'wave', mv: 'jianqi', x: foe.x - side(s) * 50, y: 30, vx: -side(s) * (m.speed ?? 700), id: s.n, low: true, big: true });
    bump(s, 'super');
    return;
  }
  if (['poke', 'thrust', 'jianqi', 'sweep', 'aa'].includes(a.k) && ph === 'active') {
    const m = R.foe.moves[a.k];
    if (a.k === 'thrust' && !a.lunged) { a.lunged = true; foe.x -= side(s) * (m.lunge ?? 0); }
    a.hit = true;
    fx(s, 'qi', foe.x, a.k === 'jianqi' || a.k === 'sweep' ? 40 : a.k === 'aa' ? 200 : 120, { to: foe.x - side(s) * m.reach, big: a.k === 'jianqi' });
    // over it: a jump clears her sweep, and the poke and thrust go under him high in his jump; her rising cut meets him there
    const over = a.k === 'sweep' ? me.y > 40 : a.k === 'poke' || a.k === 'thrust' ? me.y > 110 : a.k === 'aa' ? !me.air && me.y < 20 : false; // her rising cut goes over a man on the boards
    if (over || dist(s) > m.reach + limbOut(s) || me.stun > s.t + 300 || me.down > s.t || safe(s)) return;
    const soft = foe.moves <= R.foe.ai.soft ? R.foe.ai.softBy : 1; // 头十招，她只使了五分力
    if (guarded(s, Math.round(m.dmg * soft * (R.foe.ai.chip ?? 0.25)), m.push, { low: Boolean(m.low), gp: m.gp ?? 8 + m.dmg * 2 })) return; // a blow stood off: its chip (`ai.chip`)
    hurtMe(s, Math.round(m.dmg * soft), m.push, m.stun ?? 400, { down: a.k === 'aa' ? (me.air ? m.down ?? 0 : 0) : m.down ?? 0 });
    if (a.k === 'poke' && R.foe.ai.chain > 0 && roll(s) < R.foe.ai.chain) { foe.chain = s.t; foe.think = s.t; a.m = { ...a.m, recover: Math.min(a.m.recover, 120) }; }
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
    if (me.guard) { guarded(s, 6, m.push * 1.2, { gp: 14 }); say(s, 'palmBlocked'); return; }
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

/* Her throw broken (拆): his hands up in time — both thrown apart, nothing taken. */
function tech(s) {
  const sd = side(s);
  s.grab = null;
  s.me.stun = s.t + 160; s.me.act = null; s.me.vx = -sd * 520;
  s.foe.vx = sd * 520;
  if (s.foe.act?.k === 'throw') s.foe.act = { ...s.foe.act, m: { ...s.foe.act.m, recover: 300 }, hit: true };
  fx(s, 'tech', (s.foe.x + s.me.x) / 2, 150);
  bump(s, 'tech');
  hitstop(s, 60);
}
/* Held out the time to break it: her throw lands, and he is down. */
function grabStep(s) {
  if (!s.grab || s.t < s.grab.until) return;
  const m = s.R.foe.moves.throw;
  s.grab = null;
  s.me.stun = s.t;
  hurtMe(s, m.dmg, m.push, 400, { down: m.down });
  bump(s, 'throw');
  fx(s, 'num', s.me.x, 200, { n: m.dmg, who: 'me' });
}

/* ── His moves ── */
function startMe(s, k) {
  const me = s.me, R = s.R;
  if (k === 'jump') { if (me.air || s.in.crouch) return false; me.vy = R.me.jump; me.vx = s.in.dir * (me.running ? R.me.speed * 1.4 : R.me.speed); me.air = true; me.airHit = false; me.hopCut = false; me.jumpAt = s.t; me.aaSeen = false; me.running = false; bump(s, 'jump'); return true; }
  // KOF's run (v7): a double tap toward her runs while the way is held (meStep), and any blow comes out of it
  if (k === 'dash') {
    if (me.air || me.act) return false;
    me.running = true;
    me.vx = side(s) * R.me.run;
    bump(s, 'dash');
    fx(s, 'dust', me.x, 0, { small: true });
    return true;
  }
  if (k === 'backstep') {
    if (me.air) return false;
    me.running = false;
    me.act = { k, at: s.t, m: { startup: 0, active: 260, recover: 60 } };
    me.vx = -side(s) * R.me.step;
    me.vy = 260; me.air = true; me.hopCut = true; me.jumpAt = -1e9;
    bump(s, 'dash');
    fx(s, 'dust', me.x, 0, { small: true });
    return true;
  }
  if (k === 'max') { // 爆气: a stock spent, his blows heavier a while — a flash, the bout held a beat
    if (me.qi < QI || me.air || me.max > s.t) return false;
    me.qi -= QI; me.max = s.t + R.me.max.ms; me.act = { k: 'max', at: s.t, m: { startup: 0, active: 0, recover: 260 } }; me.vx = 0;
    hitstop(s, 240);
    fx(s, 'max', me.x, 120);
    bump(s, 'max');
    say(s, 'max');
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
  if (k === 'special' || k === 'palmfire' || k === 'palmfireH') {
    const m = R.me[k], cdKey = k === 'special' ? 'cd' : 'cdPf';
    if (me[cdKey] > 0 || me.air) return false;
    me[cdKey] = m.cd;
    me.act = { k, at: s.t, m: { startup: m.startup, active: 0, recover: m.recover }, hit: false };
    me.vx = 0;
    bump(s, 'cast');
    return true;
  }
  if (k === 'feijian' || k === 'fuwen') {
    const m = R.me[k], cdKey = k === 'feijian' ? 'cdFj' : 'cdFw';
    if (!m || me[cdKey] > 0 || me.air) return false;
    me[cdKey] = m.cd;
    me.act = { k, at: s.t, m: { startup: m.startup, active: 0, recover: m.recover }, hit: false };
    me.vx = 0;
    bump(s, 'cast');
    return true;
  }
  if (k === 'super') {
    if (!superReady(s) || me.air) return false;
    const m = R.me.super;
    // paid by: 爆气 (it ends, the 绝 at its heaviest), a stock, or 绝境 (his 血 low: once, no stock)
    let pow = 1, how = 'stock';
    if (me.max > s.t) { me.max = 0; pow = R.me.max.super ?? 1.5; how = 'max'; }
    else if (me.qi >= QI) me.qi -= QI;
    else { me.lastUsed = true; pow = R.me.last.by ?? 1.3; how = 'last'; }
    s.supers += 1;
    me.act = { k, at: s.t, m: { startup: m.startup, active: 0, recover: m.recover }, hit: false, pow };
    me.vx = 0;
    const tag = how === 'max' ? m.maxName : how === 'last' ? m.lastName : null;
    s.cutin = { who: 'me', name: tag ? { zh: `${say0(m.name, 'zh')} · ${say0(tag, 'zh')}`, en: `${say0(m.name, 'en')} · ${say0(tag, 'en')}` } : m.name, at: s.t, how };
    hitstop(s, m.cut);
    bump(s, 'cutin');
    say(s, 'super');
    return true;
  }
  if (me.air && ['heavy', 'lkick', 'hpunch', 'light'].includes(k)) { if (me.airHit) return false; me.airHit = true; me.act = { k: 'air', at: s.t, m: R.me.air, hit: false }; bump(s, 'swing'); return true; } // a jump-in blow
  if (me.air) return false;
  // ← or → with 重拳/重腿, close: the throw (past its reach, the 上步 heavy)
  if ((k === 'hpunch' || k === 'heavy') && s.in.dir !== 0 && !s.in.crouch && R.me.throw && dist(s) <= R.me.throw.reach && throwable(s.foe, s.t) && !foeSafe(s) && !s.palm && !s.edge) {
    me.act = { k: 'throw', at: s.t, m: R.me.throw, hit: false }; me.vx = 0; me.running = false;
    bump(s, 'swing');
    return true;
  }
  if (s.in.crouch && CROUCH[k] && R.me[CROUCH[k]]) k = CROUCH[k]; // ↓ held: the crouching blow (low; 重腿 the sweep)
  const run = me.running;
  me.running = false;
  me.act = { k, at: s.t, m: R.me[k], hit: false, fwd: s.in.dir === side(s) || run }; // `fwd`: thrown walking at her — a 上步
  me.swings = [...(me.swings ?? []).filter((x) => s.t - x < 1500), s.t];
  if (!me.air) me.vx = run ? side(s) * R.me.run * 0.45 : 0; // out of a run, the blow slides on a little
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
  if (PAIRED.has(s.buf[0]?.k) && me.act && phaseOf(me.act, t) === 'startup' && NORMALS.has(me.act.k)) me.act = null;
  // a guard cancel (KOF's): in a guard's stagger, A+B or C+D with a stock — the roll or the blowback, at once
  const gc = ['roll', 'blow'].includes(s.buf[0]?.k) && me.gstun > t && me.stun > t && !me.down && me.qi >= QI && !s.grab;
  if (gc) { me.qi -= QI; me.stun = t; me.gstun = 0; fx(s, 'max', me.x, 120, { small: true }); bump(s, 'cutin'); tally(s, 'gc'); }
  const free = (!me.act || cancellable(me.act, t, s.buf[0]?.k)) && me.stun <= t && !me.down && !s.grab;
  if (free && s.buf.length) {
    const b = s.buf.shift(), was = me.act;
    me.act = null; // a 拳 that landed, cut short into the next
    if (!startMe(s, b.k)) me.act = was; // not now (in the air, cooling down): the press is spent
  }
  const toward = side(s);
  me.crouch = !me.air && s.in.crouch && !me.down;
  const back = s.in.dir !== 0 && s.in.dir === -toward;
  const threat = Boolean(s.foe.act && s.foe.act.k !== 'block') || s.shots.some((x) => x.who === 'foe');
  const was = me.guard;
  me.guard = !me.air && !me.act && !me.down && (me.stun <= t ? true : me.guard) && (s.in.block || (back && threat));
  if (me.guard && !was) me.guardAt = t; // since when (her read of a turtle)
  // the run: on while the way toward her is held; let go (or turned, crouched, struck), it stops
  if (me.running && (s.in.dir !== toward || me.act || me.stun > t || me.air || me.down || s.in.crouch || s.in.block)) me.running = false;
  if (!me.act && me.stun <= t && !me.air && !me.down) me.vx = s.in.block || me.crouch ? 0 : me.running ? toward * R.me.run : s.in.dir * R.me.speed;
  if (me.act?.k === 'roll') me.vx = me.act.dir * R.me.roll.speed * (1 - (t - me.act.at) / (R.me.roll.ms + 120));
  // His blow's active frames: once a move.
  const a = me.act;
  // 上步: a heavy's step in, spread over its startup (never into her: the bodies keep GAP)
  if (a?.m?.lunge && !a.hit && phaseOf(a, t) === 'startup') {
    if (a.stepTo == null) { const d0 = dist(s); a.stepTo = a.fwd && d0 > a.m.reach ? Math.min(a.m.lunge, d0 - a.m.reach + 12) : 0; } // toward her, the far heavy steps in; the close one needn't
    const go = Math.min(Math.max(0, dist(s) - GAP - 2), (a.stepTo * STEP_MS) / Math.max(STEP_MS, a.m.startup));
    me.x += toward * go;
  }
  if (a && !a.hit && a.k === 'throw' && phaseOf(a, t) === 'active') { a.hit = true; a.landed = throwFoe(s); }
  if (a && !a.hit && STRIKES.has(a.k) && phaseOf(a, t) === 'active') {
    // how high it meets her: about level, or (an anti-air, `aa`) up to that far over him; over a fallen foe it passes
    const reach = a.m.reach, dy = (s.foe.y ?? 0) - me.y, high = Math.abs(dy) < 120 || (a.m.aa && dy > 0 && dy < a.m.aa);
    if (dist(s) <= reach && high && !foeSafe(s)) { a.hit = true; a.landed = true; hurtFoe(s, a.m, { heavy: HEAVIES.has(a.k) }); }
    else if (a.k !== 'air' || t - a.at > a.m.startup + a.m.active - STEP_MS) { a.hit = true; a.whiff = t; bump(s, 'whiff'); }
  }
  if (a && !a.hit && (a.k === 'special' || a.k === 'palmfire' || a.k === 'palmfireH') && t - a.at >= a.m.startup) {
    a.hit = true;
    const m = R.me[a.k];
    s.n += 1;
    s.shots.push({ who: 'me', kind: m.kind, x: me.x + toward * 34, y: m.at ?? 22, vx: toward * m.speed, id: s.n, ...(m.big ? { heavy: true } : {}) });
    bump(s, a.k === 'special' ? 'fire' : 'palmfire');
  }
  if (a && !a.hit && (a.k === 'feijian' || a.k === 'fuwen') && t - a.at >= a.m.startup) {
    a.hit = true;
    const m = R.me[a.k];
    s.n += 1;
    if (a.k === 'feijian') { s.shots.push({ who: 'me', kind: 'feijian', x: me.x, y: 150, vx: 0, from: { x: me.x, y: 150 }, at: t, land: t + m.fly, id: s.n }); bump(s, 'feijian'); }
    else { s.runes.push({ who: 'me', x: s.foe.x, at: t, arm: t + m.arm, id: s.n }); bump(s, 'rune'); }
  }
  if (a && !a.hit && a.k === 'super' && t - a.at >= a.m.startup) {
    a.hit = true;
    const m = R.me.super;
    // 两样: the earth wall up before him (her ice dies in it), and the fire along the boards under her.
    s.wall = { x: me.x + toward * 46, at: t, until: t + 1500 };
    s.n += 1;
    s.shots.push({ who: 'me', kind: 'wave', x: me.x + toward * 50, y: 30, vx: toward * m.speed, id: s.n, big: true, pow: a.pow ?? 1 });
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
      me.y = 0; me.vy = 0; me.air = false; me.airHit = false; me.aaSeen = false; bump(s, 'land'); fx(s, 'dust', me.x, 0);
      if (me.act?.k === 'air') me.act = null; // the kick ends on the boards: a 拳 can follow at once
    }
  } else if (me.stun > s.t || (me.act && me.act.k !== 'roll' && me.act.k !== 'dash') || me.down) me.vx *= Math.max(0, 1 - 9 * k);
  else if (me.act?.k === 'dash') me.vx *= Math.max(0, 1 - 2.5 * k);
  // Her slide: friction, less on the slick.
  if (!s.end) {
    const ra = foe.act?.k === 'roll' ? foe.act : null;
    if (ra) foe.vx = ra.dir * R.foe.moves.roll.speed * Math.max(0, 1 - (s.t - ra.at) / (R.foe.moves.roll.ms + 120));
    foe.x += foe.vx * k;
    // in the air (her jump-in): up and down, her way across kept; down, she lands (struck up there: on her back)
    if (foe.air) {
      foe.vy -= GRAVITY * k; foe.y += foe.vy * k;
      if (foe.y <= 0) {
        foe.y = 0; foe.vy = 0; foe.air = false; foe.vx = 0; fx(s, 'dust', foe.x, 0, { small: true });
        if (foe.fell) { foe.fell = false; knockFoe(s, 700); }
        else if (foe.act?.k === 'jump') foe.act = { k: 'land', at: s.t, m: { startup: 0, active: 0, recover: R.foe.moves.air.land }, hit: true };
      }
    }
    const fr = onOil(s, foe.x) ? 2.2 : 7.5;
    if (foe.air || ra || foe.run > s.t) { /* her own way: the jump's arc, the roll, the run */ }
    else if (foe.act || foe.stun > s.t || foe.down > s.t) foe.vx *= Math.max(0, 1 - fr * k);
    else if (Math.abs(foe.vx) > R.foe.speed + 1) foe.vx *= Math.max(0, 1 - fr * k);
    if (Math.abs(foe.vx) > 420 && (s.t / 60 | 0) !== ((s.t - dt) / 60 | 0)) fx(s, 'dust', foe.x, 0, { small: true });
  }
  // Never through each other: the order they stand in holds — but by a roll (his, or hers through him).
  const rolling = (me.act?.k === 'roll' && me.act.through) || foe.act?.k === 'roll';
  if (rolling && Math.sign(foe.x - me.x) !== s.order && Math.abs(foe.x - me.x) > 4) { s.order = Math.sign(foe.x - me.x); if (me.act?.k === 'roll') me.act.passed = true; }
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
    if ((foe.x < R.stage.left || foe.x > R.stage.right) && slipping && R.stage.oil && oilBehind({ ...s, foe: { ...foe, x: Math.min(R.stage.oil.to, Math.max(R.stage.oil.from, foe.x)) } })) out(s);
    else foe.x = Math.min(hi, Math.max(lo, foe.x));
    if (!s.end && !rolling && Math.abs(foe.x - me.x) < GAP - 1) { if (me.x <= lo + 0.5 || me.x >= hi - 0.5) foe.x = me.x + sd * GAP; else me.x = foe.x - sd * GAP; }
  }
  for (const who of [me, foe]) if ((!who.act || who.act.k === 'land') && who.stun <= s.t && !(who.down > s.t)) who.face = Math.sign((who === me ? foe.x - me.x : me.x - foe.x)) || who.face;
}

/* 飞剑: a sword in the air lands where its mark stands when its time comes (the flight is the picture's). */
function swordsStep(s) {
  for (const x of s.shots) {
    if (x.kind !== 'feijian' || x.gone || s.t < x.land) continue;
    x.gone = true;
    if (s.end) continue;
    if (x.who === 'me') {
      fx(s, 'flash', s.foe.x, 120);
      hurtFoe(s, s.R.me.feijian, { num: true });
      continue;
    }
    const me = s.me, m = s.R.foe.moves.feijian;
    fx(s, 'flash', me.x, 120);
    if (me.down > s.t || safe(s)) continue;
    if (guarded(s, Math.round(m.dmg * (s.R.foe.ai.chip ?? 0.25)), m.push, { gp: 12 })) continue;
    hurtMe(s, m.dmg, m.push, m.stun);
    fx(s, 'num', me.x, 200, { n: m.dmg, who: 'me' });
  }
}
/* 符文: a talisman at her feet arms, then binds her if she still stands on it (a guard breaks it for a chip). */
function runesStep(s) {
  if (!s.runes?.length) return;
  const m = s.R.me.fuwen, foe = s.foe;
  for (const r of s.runes) {
    if (r.done || s.t < r.arm) continue;
    r.done = true;
    if (s.end) continue;
    if (Math.abs(foe.x - r.x) > m.r) { r.fizzled = true; bump(s, 'whiff'); continue; }
    r.bound = true;
    bump(s, 'bind');
    say(s, 'bind'); // the level's line, if it has one (何七's 喷嚏符: 「阿——嚏！」)
    fx(s, 'bind', r.x, 0);
    hurtFoe(s, { dmg: m.dmg, push: 0, stun: m.bind, qi: m.qi }, { num: true });
  }
  s.runes = s.runes.filter((r) => !r.done || s.t - r.arm < 600);
}

function shotsStep(s, dt) {
  const k = dt / 1000, R = s.R, me = s.me, foe = s.foe;
  swordsStep(s);
  runesStep(s);
  for (const x of s.shots) if (x.kind !== 'feijian') x.x += x.vx * k;
  // Fire meets ice: both gone in steam. The earth wall eats ice.
  const flat = (x) => !x.gone && x.kind !== 'feijian';
  for (const f of s.shots.filter((x) => x.who === 'me' && flat(x))) for (const i of s.shots.filter((x) => x.who === 'foe' && flat(x))) {
    if (Math.abs(f.x - i.x) < 26) { i.gone = true; if (!f.big) f.gone = true; fx(s, 'steam', (f.x + i.x) / 2, 60); bump(s, 'steam'); }
  }
  if (s.wall && s.t < s.wall.until) for (const i of s.shots.filter((x) => x.who === 'foe' && flat(x))) if (Math.abs(i.x - s.wall.x) < 20) { i.gone = true; fx(s, 'spark', s.wall.x, 100); bump(s, 'block'); }
  if (s.wall && s.t >= s.wall.until) s.wall = null;
  for (const x of s.shots) {
    if (x.gone || x.kind === 'feijian') continue;
    if (x.x < 0 || x.x > R.stage.w) { x.gone = true; continue; }
    if (x.who === 'foe' && Math.abs(x.x - me.x) < 26) {
      x.gone = true;
      if (me.y > 52 || (me.crouch && !x.low) || me.down > s.t || safe(s)) continue; // jumped, ducked or rolled under it: it flies on (a low one is jumped only)
      const m = R.foe.moves[x.mv ?? 'ice'] ?? R.foe.moves.ice, soft = foe.moves <= R.foe.ai.soft ? R.foe.ai.softBy : 1;
      if (!m.pierce && guarded(s, 1, 10, { gp: 6 })) continue; // `pierce`: no guard stops it (马小宝's mirror: 「光是躲不掉的」 — only ducked or jumped)
      hurtMe(s, Math.max(1, Math.round(m.dmg * soft)), m.push, m.stun ?? 400, { down: x.big ? m.down ?? 0 : 0 });
    }
    if (x.who === 'me' && !x.gone && Math.abs(x.x - foe.x) < 30 && !s.end) {
      x.gone = true;
      const m = x.kind === 'wave' ? R.me.super : x.kind === 'palmfire' ? (x.heavy ? R.me.palmfireH : R.me.palmfire) : R.me.special;
      // 护体灵光 (`foe.armor`, 祁长松's): a spell on him lands at that share
      const armor = R.foe.armor ?? 1;
      if (foeSafe(s)) { x.gone = false; continue; } // rolled through it, or down: it flies on
      hurtFoe(s, armor < 1 ? { ...m, dmg: m.dmg * armor } : m, { fire: x.kind === 'fire', big: x.kind === 'wave', num: x.kind !== 'fire', pow: x.pow ?? 1 });
    }
  }
  s.shots = s.shots.filter((x) => !x.gone);
}

function foeStep(s) {
  const foe = s.foe, t = s.t;
  for (const k of Object.keys(foe.cd)) foe.cd[k] = Math.max(0, foe.cd[k] - STEP_MS);
  if (s.edge) { edgeStep(s); return; }
  if (s.palm) { palmStep(s); if (!s.palm && foe.act?.k === 'palm') foe.act = null; else return; }
  if (foe.act && foe.act.k !== 'edge' && foe.act.k !== 'jump' && phaseOf(foe.act, t) === 'done') foe.act = null;
  if (foe.act?.k === 'jump' && !foe.air) foe.act = null;
  // up off the boards: untouchable a beat, and she may rise with her cut (`ai.wake`, KOF's reversal)
  if (foe.down && foe.down <= t) {
    foe.down = 0; foe.wake = t; bump(s, 'getup');
    foe.think = t + WAKE_MS;
    if (dist(s) < s.R.foe.moves.poke.reach && roll(s) < (s.R.foe.ai.wake ?? 0)) { foe.stun = t; startFoe(s, 'poke'); tally(s, 'wake'); }
  }
  if (s.grab) { grabStep(s); return; }
  foeStrikes(s);
  // his jump seen: she looks again on her reaction, whatever her rhythm (her anti-air)
  if (s.me.air && s.me.jumpAt > 0 && !s.me.aaSeen && !busy(foe, t)) foe.think = Math.min(foe.think, s.me.jumpAt + (s.R.foe.ai.react ?? 250));
  // his whiff seen: she looks again `ai.react` ms after it, whatever her rhythm (a sharp foe punishes, a sloppy one is late)
  const w = s.me.act?.whiff;
  if (w && !s.me.act.punished && !busy(foe, t)) foe.think = Math.min(foe.think, w + (s.R.foe.ai.react ?? 250));
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
  if (e.kind === 'outlast') {
    const left = s.me.hp / s.R.me.hp;
    s.won = true;
    s.grade = left >= OUTLAST_CLEAN ? 'clean' : 'clumsy';
    s.stars = left >= OUTLAST_STARS[0] ? 3 : left >= OUTLAST_STARS[1] ? 2 : 1;
  } else if (e.won) {
    s.won = true;
    // `level.clumsyUnder`: a bout with no palm (何七's, 马小宝's) is clumsy when he won with less than that share of his 血
    const worn = s.level?.clumsyUnder != null && s.me.hp / s.R.me.hp < s.level.clumsyUnder;
    s.grade = s.palmLanded || worn ? 'clumsy' : 'clean';
    s.stars = s.palmLanded || worn ? (s.me.hp >= 30 ? 2 : 1) : 3;
  } else s.lost = true;
}

/* A bout of sparring (`stage.win: 'yield'`, 切磋 at the 演武场): no slick to send her off — her 稳 gone, she yields
   (认输); and when the incense is out (`level.time`, `stage.timeUp`) the one standing looser loses, as a judge would
   call it. The story's bout keeps neither: over the slick, or his fall. */
function sparEnd(s) {
  const st = s.R.stage;
  if (st.win === 'yield' && s.foe.bal <= 0) { s.end = { kind: 'yield', at: s.t, won: true }; s.foe.vx = 0; say(s, 'yield'); bump(s, 'down'); return; }
  if (st.timeUp && s.t >= (s.level?.time ?? Infinity)) {
    const mine = s.me.hp / s.R.me.hp, hers = s.foe.bal / s.R.foe.bal, won = mine > hers;
    s.end = { kind: 'time', at: s.t, won };
    say(s, won ? 'timeWon' : 'timeLost');
    bump(s, 'down');
  }
}

function step(s) {
  s.clock = (s.clock ?? 0) + STEP_MS; // the hands' clock runs through a hit-stop
  if (s.freeze > 0) { s.freeze = Math.max(0, s.freeze - STEP_MS); return; } // hit-stop: the bout's clock holds
  s.t += STEP_MS;
  if (s.cutin && s.t - s.cutin.at > 200) s.cutin = null;
  if (s.end) { endStep(s); return; }
  const me = s.me;
  me.cd = Math.max(0, me.cd - STEP_MS);
  me.cdPf = Math.max(0, me.cdPf - STEP_MS);
  me.cdFj = Math.max(0, (me.cdFj ?? 0) - STEP_MS);
  me.cdFw = Math.max(0, (me.cdFw ?? 0) - STEP_MS);
  if (s.t < (s.intro ?? 0)) return; // the bout's call: neither moves yet
  meStep(s);
  if (!s.end) foeStep(s); // hooked this step: her slide is the end's now
  // the guards' meters fill back when left alone a moment
  const G = s.R.me.guard;
  if (G) for (const who of [me, s.foe]) if (who.gp > 0 && s.t - who.gpAt > G.rest) who.gp = Math.max(0, who.gp - (G.refill * STEP_MS) / 1000);
  if (me.max && me.max <= s.t) me.max = 0;
  bodies(s, STEP_MS);
  shotsStep(s, STEP_MS);
  if (s.combo.n && s.foe.stun <= s.t && s.t - s.combo.at > 200) s.combo = { ...s.combo, n: 0 };
  if (me.hp <= 0 && !s.end) { s.end = { kind: 'down', at: s.t, won: false }; me.down = s.t + END_MS * 2; say(s, 'lost'); bump(s, 'down'); }
  if (!s.end) sparEnd(s);
  if (!s.end && s.level.outlast?.moves && s.foe.moves >= s.level.outlast.moves && !busy(s.foe, s.t) && !s.edge && !s.palm) {
    s.end = { kind: 'outlast', at: s.t, won: true }; // she has made her moves and he stands: her point comes to rest
    s.foe.vx = 0; me.vx = 0;
    say(s, 'outlast');
  }
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
export const SOUNDS = ['swing', 'whiff', 'hit', 'heavy', 'hurt', 'block', 'jump', 'land', 'dash', 'roll', 'cast', 'fire', 'palmfire', 'ice', 'steam', 'tell', 'early', 'ying', 'glow', 'hold', 'palm', 'hook', 'rise', 'combo', 'cutin', 'super', 'wall', 'knock', 'getup', 'slip', 'down', 'feijian', 'rune', 'bind', 'throw', 'tech', 'counter', 'crush', 'max'];
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
  { k: 'light', keys: 'K', touch: { zh: '拳', en: 'LP' } }, { k: 'lkick', keys: 'L', touch: { zh: '腿', en: 'LK' } }, { k: 'hpunch', keys: 'O', touch: { zh: '重拳', en: 'HP' } }, { k: 'heavy', keys: ';', touch: { zh: '重腿', en: 'HK' } },
  { k: 'roll', keys: 'K+L · A/D+K+L', touch: { zh: '拳+腿', en: 'LP+LK' } }, { k: 'blow', keys: 'O+;', touch: { zh: '重拳+重腿', en: 'HP+HK' } },
  { k: 'dash', keys: { zh: 'D D 按住跑 · A A', en: 'D D, hold to run · A A' }, touch: { zh: '▶▶ 按住跑 · ◀◀', en: '▶▶, hold to run · ◀◀' } }, { k: 'hop', keys: { zh: 'W 轻点 · 按住', en: 'W tap · hold' }, touch: { zh: '▲ 轻点 · 按住', en: '▲ tap · hold' } },
  { k: 'low', keys: 'S + K/L/O', touch: { zh: '▼ + 拳/腿/重拳', en: '▼ + LP/LK/HP' }, name: { zh: '蹲击（下段）', en: 'Crouching blows (low)' } },
  { k: 'sweep', keys: 'S + ;', touch: { zh: '▼ + 重腿', en: '▼ + HK' }, name: { zh: '扫堂腿', en: 'Sweep' } },
  { k: 'throw', keys: { zh: 'A/D + O/; 贴身', en: 'A/D + O/; up close' }, touch: { zh: '◀/▶ + 重拳/重腿 贴身', en: '◀/▶ + HP/HK up close' }, name: { zh: '摔', en: 'Throw' } },
  { k: 'tech', keys: { zh: '被抓 O/;', en: 'when grabbed, O/;' }, touch: { zh: '被抓 重拳/重腿', en: 'when grabbed, HP/HK' }, name: { zh: '拆摔', en: 'Break a throw' } },
  { k: 'gc', keys: { zh: '挡中 K+L · O+;', en: 'while guarding, K+L · O+;' }, touch: { zh: '挡中 拳+腿', en: 'while guarding, LP+LK' }, name: { zh: '防御反击（一格气）', en: 'Guard cancel (a stock)' } },
  { k: 'chain', keys: { zh: 'K K L · K O · 跳 ; K', en: 'K K L · K O · jump ; K' }, touch: { zh: '拳 拳 腿', en: 'LP LP LK' } },
  { k: 'palmfire', keys: 'S D + K/O · J', touch: { zh: '技', en: 'SP' } }, { k: 'rise', keys: 'D S D + K/O · D+J', touch: { zh: '▶ + 技', en: '▶ + SP' } },
  { k: 'max', keys: 'A + J', touch: { zh: '◀ + 技', en: '◀ + SP' }, name: { zh: '爆气（一格气）', en: 'MAX mode (a stock)' } },
  { k: 'super', keys: 'S D S D + K/O · J', touch: { zh: '技（气满：绝）', en: 'SP (stocks full: Super)' }, name: { zh: '绝（血少：绝境）', en: 'Super (low health: Last Stand)' } },
  { k: 'feijian', keys: 'I', touch: { zh: '剑', en: 'FS' }, name: { zh: '飞剑', en: 'Flying sword' } }, { k: 'fuwen', keys: 'U', touch: { zh: '符', en: 'TL' }, name: { zh: '符文', en: 'Talisman' } }, { k: 'guard', keys: { zh: 'A/D 背向她 · S+背向 低挡', en: 'A/D away from her · S+away, low guard' }, touch: { zh: '◀/▶ 背向她', en: '◀/▶ away from her' } },
];
