// core.js — 隔空指点's field (games/zhidian.js), pure: beasts crossing the 山道, the clock, the 火蛋s and the hits.
// Units: the field is 0…1 each way; time in ms. Every number is the level's (worlds/jiuding/levels/zhidian.json).
//
//   newField(level, seed) → state      tick(state, dt) → state (beasts walk, new ones come, the clock runs)
//   throwAt(state, aim) → state (a 火蛋 in the air for `eggMs`)
//   land(state) → { state, events: [{ type: 'hit', beast, aim } | { type: 'miss', aim }] } (eggs that arrived)
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
  return { level, rand: rng(seed), t: 0, next: 400, n: 0, beasts: [], eggs: [], hits: 0, shots: 0 };
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

export const throwAt = (s, aim) => ({ ...s, shots: s.shots + 1, eggs: [...s.eggs, { aim, lands: s.t + s.level.eggMs }] });

/** The beast a 火蛋 at `aim` strikes: the nearest within its radius (the field is 4:3 — x counts a third wider). */
export function struck(beasts, aim, r) {
  const d = (b) => Math.hypot((b.x - aim.x) * (4 / 3), b.y - aim.y);
  return beasts.filter((b) => d(b) < r * (4 / 3)).sort((a, b) => d(a) - d(b))[0] ?? null;
}

export function land(state) {
  let s = state;
  const events = [];
  for (const egg of state.eggs.filter((e) => e.lands <= state.t)) {
    const b = struck(s.beasts, egg.aim, s.level.spawn.r);
    if (b) s = { ...s, hits: s.hits + 1, beasts: s.beasts.filter((x) => x !== b) };
    events.push(b ? { type: 'hit', beast: b, aim: egg.aim } : { type: 'miss', aim: egg.aim });
  }
  return { state: { ...s, eggs: s.eggs.filter((e) => e.lands > state.t) }, events };
}

export const starsOf = (hits, [one, two, three] = []) => (hits >= three ? 3 : hits >= two ? 2 : hits >= one ? 1 : 0);
export const timeLeft = (s) => Math.max(0, s.level.seconds * 1000 - s.t);
export const over = (s) => timeLeft(s) <= 0 || starsOf(s.hits, s.level.stars) === 3;
