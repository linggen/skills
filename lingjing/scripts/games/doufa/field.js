// field.js — 法术试炼's field (games/doufa.js): beasts walking down three lanes, and what a cast does to them. Pure but for
// the seeded dice; the numbers are worlds/jiuding/levels/doufa.json (the field) and jieyin.json `doufa` (the moves, via
// duel.js strike()). y runs 0 (the top, where beasts step out) → 1 (小满's feet).
//
//   fieldStart(level, seed)                    → field
//   fieldTick(field, dtMs, level)              → { field, events: [{ type: 'spawn' | 'boss' | 'escape', beast }] }
//   targetOf(field, cast, focusId)             → the beast a single-target cast goes to: the tapped one, else the
//                                                nearest (lowest) in the cast's lane, else the nearest anywhere
//   applyCast(field, cast, kit, focusId)       → { field, hits: [{ id, dmg, counter, combo }], show: { lane, wall, steam,
//                                                target } } — hits laid on by strike() (combos, counter element)

import { rng } from '../seeded.js';
import { strike } from '../jieyin/duel.js';

const LANES = 3;

export function fieldStart(level, seed = 'doufa') {
  return { t: 0, next: level.spawn.first ?? level.spawn.everyMs, beasts: [], walls: [0, 0, 0], kills: 0, escaped: 0, bossOut: false, uid: 0, rnd: rng(seed) };
}

const pick = (list, r) => {
  const total = list.reduce((a, x) => a + (x.w ?? 1), 0);
  let n = r * total;
  return list.find((x) => (n -= x.w ?? 1) < 0) ?? list.at(-1);
};

const beastOf = (f, kind, lane, boss = false) => ({ id: ++f.uid, kind: kind.id, lane, y: 0.02, hp: kind.hp, max: kind.hp, speed: kind.speed, element: kind.element, status: {}, boss });

/** How fast a beast walks now: held still by a freeze, a stun or a root; slowed by a chill. */
function paceOf(b, t) {
  const on = (s) => (b.status[s] ?? 0) > t;
  if (on('frozen') || on('stunned') || on('rooted')) return 0;
  return on('chilled') ? 0.5 : 1;
}

export function fieldTick(field, dt, level) {
  const f = { ...field, t: field.t + dt, beasts: field.beasts.map((b) => ({ ...b })) }, events = [];
  for (const b of f.beasts) {
    const wall = f.walls[b.lane] > f.t ? level.wallY - 0.03 : Infinity;
    b.y = Math.min(wall, b.y + (b.speed * paceOf(b, f.t) * dt) / 1000);
  }
  const got = f.beasts.filter((b) => b.y >= level.goalY);
  for (const b of got) events.push({ type: 'escape', beast: b });
  f.escaped += got.length;
  f.beasts = f.beasts.filter((b) => b.y < level.goalY);
  if (level.boss && !f.bossOut && f.t >= level.boss.at * 1000) {
    f.bossOut = true;
    const b = beastOf(f, level.boss, 1, true);
    f.beasts.push(b);
    events.push({ type: 'boss', beast: b });
  }
  if (f.t >= f.next) {
    f.next = f.t + level.spawn.everyMs + (f.rnd() * 2 - 1) * (level.spawn.jitter ?? 0);
    if (f.beasts.length < level.spawn.max) {
      const b = beastOf(f, pick(level.foes, f.rnd()), Math.floor(f.rnd() * LANES));
      f.beasts.push(b);
      events.push({ type: 'spawn', beast: b });
    }
  }
  return { field: f, events };
}

const nearest = (list) => list.reduce((m, b) => (!m || b.y > m.y ? b : m), null);

export function targetOf(field, cast, focusId = null) {
  const focus = field.beasts.find((b) => b.id === focusId);
  if (focus) return focus;
  return nearest(field.beasts.filter((b) => b.lane === cast.laneIndex)) ?? nearest(field.beasts);
}

/** The cast on the field: one beast, or its lane (a lane move, a combo that spreads, 拳劲 near 小满's feet). */
export function applyCast(field, cast, kit, focusId = null) {
  const f = { ...field, beasts: field.beasts.map((b) => ({ ...b, status: { ...b.status } })), walls: [...field.walls] };
  const fx = kit.doufa.effects[cast.move] ?? {};
  const lane = cast.laneIndex >= 0 ? cast.laneIndex : 1;
  if (fx.wall) { f.walls[lane] = f.t + fx.wall; return { field: f, hits: [], show: { lane, wall: true } }; }
  const target = fx.lane ? nearest(f.beasts.filter((b) => b.lane === lane)) : targetOf(f, cast, focusId);
  const first = target ? strike(cast, target, kit, f.t) : strike(cast, null, kit, f.t);
  // A lane move strikes the cast's own lane; a combo that spreads (steam) the lane of the beast it burst on.
  const across = fx.lane ? lane : first.lane ? target?.lane ?? lane : null;
  const struck = across != null ? f.beasts.filter((b) => b.lane === across && (first.near == null || b.y > 1 - first.near)) : target ? [f.beasts.find((b) => b.id === target.id)] : [];
  const hits = [];
  for (const b of struck) {
    const s = b.id === target?.id ? first : strike(cast, b, kit, f.t);
    b.hp -= s.dmg;
    if (s.push) b.y = Math.max(0.02, b.y - s.push);
    if (s.clear) delete b.status[s.clear];
    Object.assign(b.status, s.status);
    hits.push({ id: b.id, dmg: s.dmg, counter: s.counter, combo: s.combo });
  }
  const dead = f.beasts.filter((b) => b.hp <= 0);
  f.kills += dead.length;
  f.beasts = f.beasts.filter((b) => b.hp > 0);
  return { field: f, hits, dead: dead.map((b) => b.id), show: { lane: across ?? target?.lane ?? lane, steam: first.show === 'steam', target: target?.id ?? null } };
}
