// duel.js — 手势斗法 (doc/games.md § 手势斗法; Hanli 10-21: 「往前拍或者戳就是攻击. 复杂手印, 结成就自动攻击」): one grammar for
// every hand move — the shape picks the move, the motion throws it. Pure, as time passes: the hands each frame go in, the
// moves come out as events; what a move does to a beast is strike()'s, the game applies it. All numbers are data
// (worlds/jiuding/levels/jieyin.json `doufa`, `spells`, `moves`).
//
//   const d = duelStart(kit, { set })                    set: sets.js setOf (the 大招's sequence is that set's)
//   const { state, events, held } = duelStep(d, { world, image, handed, aspect, t }, dtMs, kit)
//   duelFill(state, kit, n | 'boss')                     灵力 up (a 大妖 steps out: `lingli.boss`)
//   strike(cast, beast, kit, now)                        what the cast does to that beast (combos, counter element)
//   laneOf(imageHand, kit)                               'left' | 'middle' | 'right' (mirrored, as the player sees)
//
// THE CAST EVENT (stable — 守墙关 and others take it):
//   { type: 'cast', tier: 'xiao' | 'fa' | 'da', move, element?, hand, lane, laneIndex, cost, heldMs?, left? }
//     move: 小招 feijian · dianxue · zhangfeng · quanjin; 法术 huodan · bingzhui · jinren · muteng · tuqiang; 大招 huodan4
//     hand: 'Left' | 'Right' (the player's own) or '#i'; lane: where the hand stood (thirds of the frame, mirrored)
//     heldMs / left: a 法术's time in the fist and what of it had not leaked (1 … 0)
// Other events: { type: 'wen' | 'kou' | 'fade' | 'drop', spell, hand } (spell.js), { type: 'dry', tier, move, hand }
// (not enough 灵力: nothing happens; a 法术 is checked at the 扣 — it pays there), { type: 'seal', seal, at } (the
// 大招's steps). The target is the game's: the beast tapped, else the nearest in the cast's lane.

import { handSeal, sealOf } from './judge.js';
import { poke, sizeOf, startPoke, thrustOf } from './motion.js';
import { shapeOf, spellStart, spellStep } from './spell.js';
import { start, step } from './sequence.js';
import { sealsFor, sequenceFor } from './sets.js';

const D = (kit) => kit.doufa;

/** A fresh duel: the 法术 the data offers, the 大招's sequence for this set, 灵力 at its start. */
export function duelStart(kit, { set = 'desk' } = {}) {
  const da = Object.entries(D(kit).da ?? {}).map(([id, x]) => ({ id, seq: sequenceFor(kit, x.move, set) }));
  return {
    set,
    spells: spellStart(kit, D(kit).fa),
    big: da.map((x) => ({ id: x.id, s: start({ mode: 'sequence', sequence: x.seq, forgive: true }) })), // stray seals are no 走火 here
    motion: {},
    lingli: { now: D(kit).lingli.start ?? D(kit).lingli.max, max: D(kit).lingli.max },
  };
}

/** 灵力 up by `n`, or to the boss's fill. */
export function duelFill(state, kit, n) {
  const add = n === 'boss' ? D(kit).lingli.boss : Number(n) || 0;
  return { ...state, lingli: { ...state.lingli, now: Math.min(state.lingli.max, state.lingli.now + add) } };
}

/** Where a hand stands, as the player sees it (mirrored): the frame's thirds. */
export function laneOf(hand, kit) {
  const lanes = D(kit).lanes ?? ['left', 'middle', 'right'];
  if (!hand?.length) return lanes[1];
  const x = 1 - [0, 5, 9, 13, 17].reduce((a, i) => a + hand[i].x / 5, 0);
  return lanes[Math.max(0, Math.min(lanes.length - 1, Math.floor(x * lanes.length)))];
}

const SMALL_SHAPES = ['jian', 'danjian', 'zhang'];

/** What one hand shows, for the moves: a fist, a spell's 文, a 小招's shape, open, or nothing. */
function moveShape(hand, kit, ids) {
  const s = shapeOf(hand, kit, ids);
  if (s && s !== 'song') return s;
  const small = Object.fromEntries(SMALL_SHAPES.filter((id) => kit.seals[id]).map((id) => [id, kit.seals[id]]));
  return handSeal(hand, small, kit.judge) ?? s;
}

const keyOf = (handed, i) => handed[i] ?? `#${i}`;

export function duelStep(state, { world = [], image = [], handed = [], aspect = 4 / 3, t = 0 } = {}, dt, kit) {
  const d = D(kit), cost = d.lingli.cost, events = [];
  let lingli = { ...state.lingli, now: Math.min(state.lingli.max, state.lingli.now + (d.lingli.refill * dt) / 1000) };
  const pay = (tier) => (lingli.now >= cost[tier] ? ((lingli = { ...lingli, now: lingli.now - cost[tier] }), true) : false);
  const keys = world.map((_, i) => keyOf(handed, i));
  const shapes = world.map((h) => moveShape(h, kit, state.spells.ids));
  const laneAt = (key) => { const i = keys.indexOf(key); return laneOf(image[i] ?? world[i], kit); };
  const lanes = d.lanes ?? ['left', 'middle', 'right'];
  const cast = (more) => { const lane = laneAt(more.hand); events.push({ type: 'cast', lane, laneIndex: lanes.indexOf(lane), ...more }); };

  // The motion, each hand: a thrust (a jab of fingers, a push of a palm or fist) toward the lens.
  const motion = { ...state.motion }, thrusts = [];
  keys.forEach((key, i) => {
    const kind = thrustOf(shapes[i], d.thrust);
    const r = poke(motion[key] ?? startPoke(), { t, size: image[i] ? sizeOf(image[i]) : 0, sealed: kind != null }, d.motion);
    motion[key] = r.state;
    if (r.shot) thrusts.push({ key, kind, shape: shapes[i] });
  });
  for (const key of Object.keys(motion)) if (!keys.includes(key)) delete motion[key];

  // 法术: 文 → 扣 (pays) → a push releases it.
  const pushes = thrusts.filter((x) => x.kind === 'push').map((x) => x.key);
  const sp = spellStep(state.spells, { world, handed: keys, pushes }, dt, kit);
  let spells = sp.state;
  const released = new Set();
  for (const e of sp.events) {
    if (e.type === 'kou' && !pay('fa')) { // not enough 灵力 to hold it: the fist holds nothing
      events.push({ type: 'dry', tier: 'fa', move: e.spell, hand: e.hand });
      spells = { ...spells, hands: { ...spells.hands, [e.hand]: { ...spells.hands[e.hand], phase: 'idle', spell: null, t: 0 } } };
      continue;
    }
    if (e.type === 'cast') {
      released.add(e.hand);
      cast({ tier: 'fa', move: e.spell, element: d.elements?.[e.spell], hand: e.hand, cost: cost.fa, heldMs: e.heldMs, left: e.left });
      continue;
    }
    events.push(e);
  }

  // 小招: a thrust not spent letting a spell go, by the shape that made it (a fist holding a spell never punches).
  for (const th of thrusts) {
    if (released.has(th.key) || spells.hands[th.key]?.phase === 'kou') continue;
    const move = Object.entries(d.xiao).find(([, x]) => x.shape === th.shape && x.motion === th.kind)?.[0];
    if (!move) continue;
    if (!pay('xiao')) { events.push({ type: 'dry', tier: 'xiao', move, hand: th.key }); continue; }
    cast({ tier: 'xiao', move, hand: th.key, cost: cost.xiao });
  }

  // 大招: the seals in order, the last one fires it — no push.
  const seal = sealOf(world, sealsFor(kit, state.set), kit.judge, null, { image, aspect });
  const big = state.big.map((b) => {
    const r = step(b.s, seal ?? null, dt, kit.judge);
    for (const e of r.events) {
      if (e.type === 'seal') events.push({ type: 'seal', move: b.id, seal: e.seal, at: e.at });
      if (e.type !== 'cast') continue;
      if (!pay('da')) { events.push({ type: 'dry', tier: 'da', move: b.id, hand: keys[0] ?? '#0' }); continue; }
      cast({ tier: 'da', move: b.id, hand: keys[0] ?? '#0', cost: cost.da });
      spells = { ...spells, hands: Object.fromEntries(Object.entries(spells.hands).map(([k, h]) => [k, h.phase === 'wen' ? { ...h, phase: 'idle', spell: null } : h])) };
    }
    return { ...b, s: r.state };
  });

  const held = sp.held.filter((x) => spells.hands[x.hand]?.phase === 'kou');
  return { state: { ...state, spells, big, motion, lingli }, events, held };
}

/* ── What a cast does to a beast: the effect, the combo, the counter element ── */

/** The cast laid on one beast `{ element?, status: { name: untilMs } }` at `now`: { dmg, mult, counter, combo, status:
    { name: untilMs }, lane, push, near, wall, show, clear } — the game applies it (to the beast, or its whole lane). */
export function strike(cast, beast, kit, now = 0) {
  const d = D(kit), fx = d.effects?.[cast.move] ?? {};
  const has = (s) => (beast?.status?.[s] ?? 0) > now;
  const combo = (d.combos ?? []).find((c) => c.move === cast.move && has(c.on)) ?? null;
  const el = cast.element ?? d.elements?.[cast.move];
  const counter = Boolean(el && beast?.element && d.counter?.beats?.[el] === beast.element);
  const mult = (combo?.mult ?? 1) * (counter ? d.counter.mult : 1);
  const status = Object.fromEntries(Object.entries(fx.status ?? {}).map(([k, ms]) => [k, now + ms]));
  return {
    dmg: ((combo?.dmg ?? fx.dmg ?? 0) * mult), mult, counter, combo: combo?.id ?? null, status,
    lane: Boolean(combo?.lane ?? fx.lane), push: fx.push ?? 0, near: fx.near ?? null, wall: fx.wall ?? 0, show: combo?.show ?? null, clear: combo?.clear ?? null,
  };
}
