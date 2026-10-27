// 气走经脉's bot (tools/board-bots.mjs shape: `bot(state, see)` → { hold } | { release } | null), and
// a hand for sims: the same eye and rule with a person's delay, aim noise and lapses (`simulate`).
// The eye: the channel ahead, the way the screen draws it (walls, 关, the gold thread); the rule:
// aim a little ahead — at the gold thread where there is one, else the middle — kept inside the
// tightest part of the channel in the next half second; hold when the bead (and where it is going)
// is below the aim, let go when above.
import { BX, DRAG, GRAV, LIFT, PICKS, R, ROCK_R, STEP_MS, VMAX, W, goldAt, newGame, act, speedNow, tick, thingAt, wallsAt } from '../qimai.js';

const AHEAD_S = 0.25, WINDOW_S = 0.5, MARGIN = 3;

/** Where to aim at world x (what the eye reads off the channel ahead; `sight` caps how far it sees). */
export function aimAt(s, x, sight = W - BX) {
  const L = s.level, v = L.speed ?? 90, far = Math.min(v * WINDOW_S, sight);
  let lo = -Infinity, hi = Infinity;
  for (let k = 0; k <= far; k += 4) { const w = wallsAt(s.ch, x + k); lo = Math.max(lo, w.top + R + MARGIN); hi = Math.min(hi, w.bot - R - MARGIN); }
  const ax = x + Math.min(v * AHEAD_S, sight);
  let want = goldAt(L, s.ch, ax) ?? wallsAt(s.ch, ax).mid;
  // a stone in sight: pass it on the roomier side (the side the aim is on, when both are open)
  for (const rk of L.rocks ?? []) {
    const r = (rk.r ?? ROCK_R) + R + MARGIN + 2;
    if (rk.x + r < x || rk.x - r > x + far) continue;
    const { y } = thingAt(s.ch, rk, rk.r ?? ROCK_R), w = wallsAt(s.ch, rk.x);
    const up = y - r - (w.top + R + MARGIN), down = (w.bot - R - MARGIN) - (y + r);
    const over = up >= 0 && (down < 0 || (want <= y ? up >= 0 : up > down + 12));
    if (over) hi = Math.min(hi, y - r); else lo = Math.max(lo, y + r);
    want = over ? Math.min(want, y - r - 2) : Math.max(want, y + r + 2);
  }
  // a pickup in sight and in reach: go for it
  for (const k of PICKS) for (const [i, t] of (L[k] ?? []).entries()) {
    if (s.got?.[k]?.[i] || t.x < x || t.x > x + Math.min(v * 0.7, sight)) continue;
    const { y } = thingAt(s.ch, t);
    if (y >= lo && y <= hi) want = y;
  }
  return lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, want));
}

/** Hold or not, for a bead at (x, y) moving vy, given what is held now. */
export function decide(s, { x, y, vy, holding }, { kd = 0.3, db = 3, sight } = {}) {
  const u = (y - aimAt(s, x, sight)) + kd * vy;
  if (u > db) return true;
  if (u < -db) return false;
  return holding;
}

/** Carry the bead on `ms` under the input it has (no forces): where the hand will find it. */
export function ahead({ x, y, vy, holding }, ms, speed) {
  let t = 0;
  while (t < ms) { const dt = Math.min(STEP_MS, ms - t) / 1000; vy = Math.max(-VMAX, Math.min(VMAX, vy + ((holding ? -LIFT : GRAV) - DRAG * vy) * dt)); y += vy * dt; x += speed * dt; t += dt * 1000; }
  return { x, y, vy, holding };
}

const sightOf = (s, x) => { const d = (s.level.dark ?? []).find((z) => x >= z.from - 20 && x <= z.to); return d ? (d.r ?? 52) * 0.9 : undefined; };

/** board-bots' bot: decides on the board as it stands, the hand landing `see.lead` ms later. */
export function bot(s, see = {}) {
  if (!s.live || s.won || s.phase === 'cha') return s.holding ? { release: true } : null;
  if (s.phase === 'ready') return null;
  const p = ahead(s, see.lead ?? 0, speedNow(s));
  const want = decide(s, p, { sight: sightOf(s, p.x) });
  if (want && !s.holding) return { hold: {} };
  if (!want && s.holding) return { release: true };
  return null;
}

/* ── A person's hand, for tuning (node only) ──────────────────────────────────────────────── */

function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = Math.imul(a ^ ch.codePointAt(0), 2654435761) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

/** Hands for sims, like tools/play-human.mjs's: delay (ms, the eye-to-finger lag), its jitter, aim
    noise (u), a lapse rate (per second: the hand freezes 0.3–0.8 s), the aim's damping, and whether
    it predicts over its own lag (a practised hand does). */
export const HANDS = {
  perfect: { delay: 0, jitter: 0, noise: 0, lapse: 0, kd: 0.3, predict: true },
  practised: { delay: 200, jitter: 30, noise: 3, lapse: 0, kd: 0.3, predict: true },
  casual: { delay: 240, jitter: 50, noise: 6, lapse: 0.05, kd: 0.22, predict: false },
  sloppy: { delay: 320, jitter: 80, noise: 10, lapse: 0.15, kd: 0.15, predict: false },
  // node-only, fitted 10-19 to play-human's live casual hand on 9527 (its 30 ms look and the page's lag
  // on top of HANDS.casual): the 11 rows of games.md's first table, within a run or so a level. Tune with this.
  live: { delay: 280, jitter: 60, noise: 7, lapse: 0.07, kd: 0.2, predict: false, look: 40 },
  idle: { idle: true },
};

/** One run of a level by a hand, on a `step` ms clock, up to `limit` ms. */
export function simulate(level, hand = HANDS.casual, { seed = 'sim', step = 16, limit = 120000, look = hand.look ?? 33 } = {}) {
  const r = rng(`${seed}|${level.id}`);
  let s = newGame(seed, 1, { levels: [level] });
  const snaps = [];
  let t = 0, nextLook = 0, frozenUntil = 0, aimNoise = 0, noiseUntil = 0;
  while (t < limit && !s.won) {
    snaps.push({ t, x: s.x, y: s.y, vy: s.vy, holding: s.holding, phase: s.phase });
    while (snaps.length > 2 && snaps[1].t <= t - (hand.delay ?? 0) - 200) snaps.shift();
    if (!hand.idle && t >= nextLook) {
      nextLook = t + look;
      if (t >= frozenUntil) {
        if (r() < (hand.lapse ?? 0) * look / 1000) frozenUntil = t + 300 + r() * 500;
        else {
          const lag = Math.max(0, (hand.delay ?? 0) + gauss(r) * (hand.jitter ?? 0));
          const seen = [...snaps].reverse().find((p) => p.t <= t - lag) ?? snaps[0];
          if (t >= noiseUntil) { aimNoise = gauss(r) * (hand.noise ?? 0); noiseUntil = t + 400; }
          if (s.phase === 'play' || s.phase === 'ready') {
            const base = hand.predict ? ahead(seen, lag, speedNow(s)) : seen;
            const want = decide(s, { ...base, y: base.y + aimNoise, holding: s.holding }, { kd: hand.kd, sight: sightOf(s, base.x) });
            if (s.phase === 'ready' ? want : want !== s.holding) s = act(s, { g: want ? 'hold' : 'release' }).state;
          }
        }
      }
    }
    s = tick(s, step);
    t += step;
  }
  return { won: s.won, ms: t, stars: s.won ? s.stars : 0, touches: s.touches, chas: s.chas, x: Math.round(s.x) };
}
