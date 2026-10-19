// The human-like player for 五子棋 (games/wuziqi.js; tools/board-bots.mjs).
// A casual player's eye: his own lines first, the rival's four nearly always, its open three about
// half the time, and now and then a second thought — no lookahead, no 跳三.
import { candidates, patternScore } from '../wuziqi.js';

const EYE = { seeFive: 0.95, seeFour: 0.85, seeThree: 0.55, slop: 0.2, noise: 150 };

/* `rand` defaults to Math.random; the sims pass a seeded one, `eye` a different hand. */
export function pick(board, rand = Math.random, eye = EYE) {
  const sc = candidates(board).map((i) => {
    const own = patternScore(board, i, 1), opp = patternScore(board, i, 2);
    let o = opp;
    if (opp >= 1e6 && rand() > eye.seeFive) o = 0;
    else if (opp >= 1e4 && opp < 1e6 && rand() > eye.seeFour) o = opp * 0.01;
    else if (opp >= 5000 && opp < 1e4 && rand() > eye.seeThree) o = opp * 0.05;
    return { i, s: own + o + rand() * eye.noise };
  }).sort((a, b) => b.s - a.s);
  if (sc[0].s >= 1e5 || rand() >= eye.slop) return sc[0].i;
  return sc[Math.min(sc.length - 1, 1 + Math.floor(rand() * 3))].i;
}

// Seeded by the game and the move, so a run replays (tests/board-bots.test.mjs).
function seeded(key) {
  let a = 0;
  for (const ch of key) a = Math.imul(a ^ ch.codePointAt(0), 2654435761) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* A loss or a draw: 再来一局 at once — never a dead end. */
export function bot(s) {
  if (s.outcome === 'lost' || s.outcome === 'draw') return { g: 'again' };
  if (s.outcome !== 'open') return null;
  return { g: 'play', i: String(pick(s.board, seeded(`${s.seed}|${s.moves}`))) };
}
