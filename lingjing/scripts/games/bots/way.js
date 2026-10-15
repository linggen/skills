// The human-like player for 认路 · 崖壁上一段划了一道 (games/way.js; tools/board-bots.mjs).
// Only what the fog has lifted is known: walk to the moss if it is in sight, else to the
// nearest mark not yet stepped on, else to the nearest unseen edge.
import * as way from '../way.js';
// (one namespace import: the install's link check reads only the first name of a `const W = 6, H = 5` export)
const { MAP, W, H } = way;

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function bot(s) {
  if (s.won) return null;
  const seen = new Set(s.seen), walked = new Set(s.walked);
  const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && seen.has(`${x},${y}`) && MAP[y][x] !== '#';
  const goals = [(k, c) => c === 'M', (k, c) => c === '*' && !walked.has(k), (k) => !walked.has(k)];
  for (const goal of goals) {
    const prev = new Map([[`${s.x},${s.y}`, null]]), q = [[s.x, s.y]];
    while (q.length) {
      const [x, y] = q.shift(), k = `${x},${y}`;
      if (prev.get(k) && goal(k, MAP[y][x])) {
        let c = k; while (prev.get(c).from !== `${s.x},${s.y}`) c = prev.get(c).from;
        return { g: 'go', d: prev.get(c).d };
      }
      for (const [d, [dx, dy]] of Object.entries(DIRS)) {
        const nk = `${x + dx},${y + dy}`;
        if (ok(x + dx, y + dy) && !prev.has(nk)) { prev.set(nk, { from: k, d }); q.push([x + dx, y + dy]); }
      }
    }
  }
  return null;
}
