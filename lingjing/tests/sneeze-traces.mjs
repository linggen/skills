// The 时机 kit's (games/sneeze.js) recorded behaviour on its built-in level: seeded act/tick runs, each
// state and both languages' html after every op, hashed — tests/sneeze-levels.test.mjs holds the module
// to the hashes recorded from the board as it stood before levels came from data (2026-10-26).
import crypto from 'node:crypto';
import { playOnce, rng } from '../tools/board-bots.mjs';

/* JSON with sorted keys, so a hash reads the state, not the order its keys were spread in. */
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
    : JSON.stringify(v ?? null));
/* The state's fields as the board kept them before levels: a hash reads these, so a field the kit
   adds (the level it plays) rides free and "the same states" means equal on every one of them. */
const KEYS = ['seed', 'phase', 'live', 't', 'at', 'swings', 'held', 'k', 'part', 'hits', 'over', 'early', 'fx', 'note', 'won', 'grade'];
const old = (s) => Object.fromEntries(KEYS.map((k) => [k, s[k]]));
/* The hand that won the built-in level then (bots/sneeze.js as of 2026-10-26), frozen here so the
   record doesn't move when the bot learns other levels. */
const AH = 900;
function hand(s, { lead }) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  if (s.phase === 'face') return s.note === 'tell' ? { g: 'yield' } : null;
  if (s.phase === 'charm') return s.held == null ? { hold: { g: 'hold' } } : s.t - s.held + lead >= 650 ? { release: true } : null;
  if (s.phase === 'sneeze') return s.k === 2 && s.part === 'ah' && s.t - s.at + lead < AH - 150 ? { g: 'push' } : null;
  return null;
}
const VERBS = ['start', 'yield', 'hold', 'release', 'push'];
const TICKS = [10, 37, 50, 100, 250, 400];
const RIGHT = { ready: 'start', face: 'yield', sneeze: 'push' };

/* One seeded run: a hand that mostly plays the phase's verb, at random moments (early, late,
   short, long all come up), and sometimes any verb; `skipAt` skips after that many ops; `again`
   lets the count's last beat go by once before it presses there. */
function run(mod, seed, { ops = 1500, skipAt = -1, actP = 0.45, again = false } = {}) {
  const r = rng(seed), h = crypto.createHash('sha256');
  let s = mod.newGame(seed), sawAgain = !again;
  const see = () => h.update(canon([old(s), mod.html(s, 'zh'), mod.html(s, 'en'), mod.stuck(s), mod.gradeOf(s)]));
  see();
  for (let i = 0; i < ops; i += 1) {
    if (i === skipAt) s = mod.act(s, { g: 'skip' }).state;
    else if (r() >= actP || (s.phase === 'sneeze' && !sawAgain)) s = mod.tick(s, TICKS[Math.floor(r() * TICKS.length)]);
    else {
      const right = s.phase === 'charm' ? (s.held == null ? 'hold' : 'release') : RIGHT[s.phase];
      const g = right && r() < 0.7 ? right : VERBS[Math.floor(r() * VERBS.length)];
      s = mod.act(s, { g }).state;
    }
    sawAgain ||= s.note === 'again';
    see();
  }
  return { hash: h.digest('hex'), last: old(s) };
}

/* The old hand with no delay, every state hashed: the clean way through. */
function byBot(mod) {
  const h = crypto.createHash('sha256');
  let s = mod.newGame('bot');
  for (let t = 0; t < 20000 && !s.won; t += 10) {
    const a = hand(s, { lead: 0 });
    if (a) s = mod.act(s, a.hold ? { ...a.hold, g: 'hold' } : a.release ? { g: 'release' } : a).state;
    s = mod.tick(s, 10);
    h.update(canon([old(s), mod.html(s, 'zh'), mod.html(s, 'en')]));
  }
  return { hash: h.digest('hex'), last: old(s) };
}

export function traces(mod) {
  const runs = {};
  for (let i = 1; i <= 12; i += 1) runs[`r${i}`] = run(mod, `trace-${i}`, { skipAt: i === 12 ? 40 : -1, actP: [0.45, 0.2, 0.08][i % 3], again: i % 4 === 0 });
  runs.bot = byBot(mod);
  const bots = {};
  for (const step of [10, 50]) for (const seed of ['bot-1', 'bot-2', 'bot-3']) bots[`${step}|${seed}`] = playOnce(mod, hand, { seed, step });
  return { runs, bots };
}
