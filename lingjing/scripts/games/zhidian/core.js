// core.js — 隔空指点's field (games/zhidian.js), pure: beasts crossing the 山道, the clock, the 火蛋s and the hits.
// Units: the field is 0…1 each way; time in ms. Every number is the level's (worlds/jiuding/levels/zhidian.json).
// The egg aims itself (Hanli 10-21: 「往前戳触发攻击, 但自动瞄准也可以」), by 守墙关's 结印 rule (shouqiang/core.js
// jieyinTarget): the beast the player tapped while it is in view, else the one nearest the bottom — 小满's side —
// and of those the one nearest getting away.
//
//   newField(level, seed) → state      tick(state, dt) → state (beasts walk, new ones come, the clock runs)
//   focus(state, id) → state (a tap on a beast)      targetOf(state) → beast | null
//   throwEgg(state) → { state, egg } (a 火蛋 at targetOf, in the air `eggMs`; egg null when no beast is in view)
//   land(state) → { state, events: [{ type: 'hit', beast } | { type: 'miss', at: { x, y } }] } (eggs that arrived)
//   over(state) → is the round done (time up, or the top star reached)      starsOf(hits, stars) → 0…3

function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed ?? 'zhidian')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const pickBy = (rows, r) => {
  let x = r * rows.reduce((t, f) => t + f.w, 0);
  return rows.find((f) => (x -= f.w) < 0) ?? rows.at(-1);
};

export function newField(level, seed) {
  return { level, rand: rng(seed), t: 0, next: 400, n: 0, beasts: [], eggs: [], hits: 0, shots: 0, focus: null };
}

function spawn(s) {
  const sp = s.level.spawn, r = s.rand;
  const dir = r() < 0.5 ? 1 : -1;
  const beast = {
    id: s.n, foe: pickBy(sp.foes, r()).id, dir, y: sp.lanes[Math.floor(r() * sp.lanes.length)],
    x: dir > 0 ? -sp.r : 1 + sp.r, speed: sp.speed[0] + r() * (sp.speed[1] - sp.speed[0]),
  };
  return { ...s, n: s.n + 1, beasts: [...s.beasts, beast], next: s.t + sp.everyMs + (r() * 2 - 1) * sp.jitter };
}

export function tick(state, dt) {
  const sp = state.level.spawn;
  let s = { ...state, t: state.t + dt };
  s.beasts = s.beasts.map((b) => ({ ...b, x: b.x + b.dir * b.speed * (dt / 1000) })).filter((b) => b.x > -sp.r * 2 && b.x < 1 + sp.r * 2);
  if (s.t >= s.next && s.beasts.length < sp.max && !over(s)) s = spawn(s);
  return s;
}

/** In view: far enough in from either side to be seen and struck. */
export const inView = (b) => b.x > 0.03 && b.x < 0.97;
const awayIn = (b) => (b.dir > 0 ? 1 - b.x : b.x); // how far it has left to cross

export const focus = (s, id) => ({ ...s, focus: s.beasts.some((b) => b.id === id) ? id : null });

export function targetOf(s) {
  const f = s.beasts.find((b) => b.id === s.focus && inView(b));
  if (f) return f;
  return s.beasts.filter(inView).sort((a, b) => b.y - a.y || awayIn(a) - awayIn(b))[0] ?? null;
}

/** Where a beast will be in `ms` (the egg flies there). */
export const ahead = (b, ms) => ({ x: b.x + b.dir * b.speed * (ms / 1000), y: b.y });

export function throwEgg(state) {
  const b = targetOf(state);
  if (!b) return { state, egg: null };
  const egg = { home: b.id, lands: state.t + state.level.eggMs, to: ahead(b, state.level.eggMs) };
  return { state: { ...state, shots: state.shots + 1, eggs: [...state.eggs, egg] }, egg };
}

export function land(state) {
  let s = state;
  const events = [];
  for (const egg of state.eggs.filter((e) => e.lands <= state.t)) {
    const b = s.beasts.find((x) => x.id === egg.home);
    if (b) s = { ...s, hits: s.hits + 1, beasts: s.beasts.filter((x) => x !== b), focus: s.focus === b.id ? null : s.focus };
    events.push(b ? { type: 'hit', beast: b } : { type: 'miss', at: egg.to });
  }
  return { state: { ...s, eggs: s.eggs.filter((e) => e.lands > state.t) }, events };
}

export const starsOf = (hits, [one, two, three] = []) => (hits >= three ? 3 : hits >= two ? 2 : hits >= one ? 1 : 0);
export const timeLeft = (s) => Math.max(0, s.level.seconds * 1000 - s.t);
export const over = (s) => timeLeft(s) <= 0 || starsOf(s.hits, s.level.stars) === 3;
