// The human-like player for 华容道 (games/huarong.js; tools/board-bots.mjs).
// Think it through: a breadth-first search over the board as it stands (shapes only — like pieces are
// interchangeable) gives the shortest way out; then pick the block, slide it, one step at a time.
// The plan is kept by board, so a look at a board already planned costs nothing.
// The search is the board's own (huarong.js `solve`, which its 问询 hint reads too).
import { solve } from '../huarong.js';

export { solve };

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const exact = (blocks) => blocks.map((b) => `${b.id}:${b.x},${b.y}`).join(' ');

const plans = new Map(); // exact board → the next { id, dir }

function planFor(blocks) {
  const key = exact(blocks);
  if (!plans.has(key)) {
    if (plans.size > 5000) plans.clear();
    let s = blocks;
    for (const step of solve(blocks) ?? []) {
      plans.set(exact(s), step);
      s = s.map((o) => (o.id === step.id ? { ...o, x: o.x + DIRS[step.dir][0], y: o.y + DIRS[step.dir][1] } : o));
    }
  }
  return plans.get(key) ?? null;
}

export function bot(s) {
  if (!s || s.won) return null;
  const step = planFor(s.blocks);
  if (!step) return null;
  return s.sel === step.id ? { g: 'move', dir: step.dir } : { g: 'block', b: String(step.id) };
}
