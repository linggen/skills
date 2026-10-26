// The human-like player for 华容道 (games/huarong.js; tools/board-bots.mjs).
// Think it through: a breadth-first search over the board as it stands (shapes only — like pieces are
// interchangeable) gives the shortest way out; then pick the block, slide it, one step at a time.
// The plan is kept by board, so a look at a board already planned costs nothing.
import { canMove } from '../huarong.js';

const SIZE = { k: [2, 2], v: [1, 2], h: [2, 1], s: [1, 1] };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const EXIT = { x: 1, y: 3 };

/** A board by its shapes and by its blocks' ids (the step a plan names is by id). */
const shape = (blocks) => {
  const g = Array(20).fill('.');
  for (const b of blocks) {
    const [w, h] = SIZE[b.t];
    for (let y = b.y; y < b.y + h; y++) for (let x = b.x; x < b.x + w; x++) g[y * 4 + x] = b.t;
  }
  return g.join('');
};
const exact = (blocks) => blocks.map((b) => `${b.id}:${b.x},${b.y}`).join(' ');
const out = (blocks) => blocks.some((b) => b.t === 'k' && b.x === EXIT.x && b.y === EXIT.y);

const plans = new Map(); // exact board → the next { id, dir }

/** The shortest way out from `start`, as steps by id; null if there is none. */
export function solve(start) {
  const prev = new Map([[shape(start), null]]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      if (out(s)) {
        const path = [];
        for (let k = shape(s); prev.get(k); k = prev.get(k).from) path.unshift(prev.get(k).step);
        return path;
      }
      for (const b of s)
        for (const dir of Object.keys(DIRS)) {
          if (!canMove(s, b.id, dir)) continue;
          const n = s.map((o) => (o.id === b.id ? { ...o, x: o.x + DIRS[dir][0], y: o.y + DIRS[dir][1] } : o));
          const k = shape(n);
          if (prev.has(k)) continue;
          prev.set(k, { from: shape(s), step: { id: b.id, dir } });
          next.push(n);
        }
    }
    frontier = next;
  }
  return null;
}

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
