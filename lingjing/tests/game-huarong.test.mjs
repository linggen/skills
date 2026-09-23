import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meta, newGame, html, act, layouts, parseLayout, canMove } from '../scripts/games/huarong.js';

const SIZE = { k: [2, 2], v: [1, 2], h: [2, 1], s: [1, 1] };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Optimal single-step solutions (one block, one cell = one move).
const OPTIMAL = { 1: [12, 15, 19], 2: [29, 32, 40], 3: [63, 88, 115] };
const RANGE = { 1: [8, 20], 2: [20, 40], 3: [41, 200] };

// Shape-only key: identical pieces are interchangeable.
function key(blocks) {
  const g = Array(20).fill('.');
  for (const b of blocks) {
    const [w, h] = SIZE[b.t];
    for (let y = b.y; y < b.y + h; y++) for (let x = b.x; x < b.x + w; x++) g[y * 4 + x] = b.t;
  }
  return g.join('');
}

function solve(start) {
  const prev = new Map([[key(start), null]]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      if (s.some((b) => b.t === 'k' && b.x === 1 && b.y === 3)) {
        const path = [];
        for (let k = key(s); prev.get(k); k = prev.get(k).from) path.unshift(prev.get(k).step);
        return path;
      }
      for (const b of s)
        for (const dir of Object.keys(DIRS)) {
          if (!canMove(s, b.id, dir)) continue;
          const n = s.map((o) => (o.id === b.id ? { ...o, x: o.x + DIRS[dir][0], y: o.y + DIRS[dir][1] } : o));
          const k = key(n);
          if (prev.has(k)) continue;
          prev.set(k, { from: key(s), step: { id: b.id, dir } });
          next.push(n);
        }
    }
    frontier = next;
  }
  return null;
}

function deepFreeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

test('meta shape', () => {
  assert.equal(meta.id, 'huarong');
  assert.equal(meta.name.zh, '华容道');
  assert.ok(meta.how.zh && meta.how.en);
});

test('deal is deterministic and JSON-serializable', () => {
  for (const lv of [1, 2, 3]) {
    const a = newGame('seed-x', lv), b = newGame('seed-x', lv);
    assert.deepEqual(a, b);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
    assert.equal(a.level, lv);
    assert.equal(a.moves, 0);
    assert.equal(a.won, false);
  }
  const picks = new Set(Array.from({ length: 30 }, (_, i) => newGame(`s${i}`, 1).layout));
  assert.ok(picks.size > 1, 'different seeds reach different layouts');
  assert.equal(newGame('x', 9).level, 1, 'unknown level falls back to 1');
});

test('every layout is well-formed: one 2x2, two empty cells, 20 cells covered', () => {
  for (const list of Object.values(layouts))
    for (const grid of list) {
      assert.equal(grid.length, 20);
      assert.equal([...grid].filter((c) => c === '.').length, 2);
      const blocks = parseLayout(grid);
      assert.equal(blocks.filter((b) => b.t === 'k').length, 1);
      assert.equal(blocks.reduce((n, b) => n + SIZE[b.t][0] * SIZE[b.t][1], 0), 18);
      assert.equal(key(blocks).replace(/[khvs]/g, '#'), grid.replace(/[^.]/g, '#'));
    }
});

test('every layout is solvable by BFS within its level range', () => {
  for (const [lv, list] of Object.entries(layouts)) {
    list.forEach((grid, i) => {
      const path = solve(parseLayout(grid));
      assert.ok(path, `level ${lv} #${i} solvable`);
      assert.equal(path.length, OPTIMAL[lv][i], `level ${lv} #${i} optimal`);
      const [lo, hi] = RANGE[lv];
      assert.ok(path.length >= lo && path.length <= hi, `level ${lv} #${i} = ${path.length} in [${lo},${hi}]`);
    });
  }
});

test('replaying the BFS solution through act() wins', () => {
  for (const [lv, list] of Object.entries(layouts)) {
    list.forEach((grid, i) => {
      let state = { ...newGame('x', Number(lv)), layout: i, blocks: parseLayout(grid) };
      const path = solve(state.blocks);
      let won = false;
      path.forEach((step, n) => {
        assert.equal(won, false, 'not won before the last step');
        ({ state } = act(state, { g: 'block', b: String(step.id) }));
        if (state.sel !== step.id) ({ state } = act(state, { g: 'block', b: String(step.id) }));
        assert.equal(state.sel, step.id);
        ({ state, won } = act(state, { g: 'move', dir: step.dir }));
        assert.equal(state.moves, n + 1);
      });
      assert.equal(won, true, `level ${lv} #${i} won`);
      assert.equal(state.won, true);
      const after = act(state, { g: 'block', b: '1' });
      assert.equal(after.state, state, 'acts after winning are no-ops');
      assert.equal(after.won, false);
      assert.match(html(state, 'zh'), /出了秘境/);
      assert.match(html(state, 'en'), new RegExp(`Out of the hidden realm · ${state.moves} moves`));
    });
  }
});

test('cell tap slides the selected block into an adjacent empty cell', () => {
  // 'GDHIBDEEB.YYACYYACF.': empties at (1,2) and (3,4); D is the v-block at (1,0).
  const s0 = { ...newGame('x', 1), layout: 0, blocks: parseLayout(layouts[1][0]) };
  const e = s0.blocks.find((b) => b.t === 'v' && b.x === 1 && b.y === 0);
  const s1 = act(s0, { g: 'block', b: String(e.id) }).state;
  assert.equal(act(s1, { g: 'cell', x: '3', y: '4' }).state, s1, 'non-adjacent empty cell is ignored');
  const r = act(s1, { g: 'cell', x: '1', y: '2' });
  assert.equal(r.state.moves, 1);
  assert.deepEqual(r.state.blocks.find((b) => b.id === e.id), { ...e, y: 1 });
  // With nothing selected, a cell only one block can reach slides that block.
  const f = s0.blocks.find((b) => b.x === 2 && b.y === 4);
  const r2 = act(s0, { g: 'cell', x: '3', y: '4' });
  assert.deepEqual(r2.state.blocks.find((b) => b.id === f.id), { ...f, x: 3 });
});

test('illegal actions return the same state', () => {
  const s0 = newGame('illegal', 1);
  const cases = [
    { g: 'move', dir: 'up' }, // nothing selected
    { g: 'block', b: '99' },
    { g: 'cell', x: '9', y: '0' },
    { g: 'nope' },
    {},
  ];
  for (const d of cases) {
    const r = act(s0, d);
    assert.equal(r.state, s0, JSON.stringify(d));
    assert.equal(r.won, false);
  }
  // Select the 2x2 and push it off the top of the board.
  const you = s0.blocks.find((b) => b.t === 'k');
  const sel = act(s0, { g: 'block', b: String(you.id) }).state;
  const blocked = Object.keys(DIRS).filter((d) => !canMove(sel.blocks, you.id, d));
  assert.ok(blocked.length > 0);
  for (const dir of blocked) {
    const r = act(sel, { g: 'move', dir });
    assert.equal(r.state, sel);
    assert.equal(r.state.moves, 0);
  }
  // Tapping an occupied cell is ignored.
  const r = act(sel, { g: 'cell', x: String(you.x), y: String(you.y) });
  assert.equal(r.state, sel);
});

test('act never mutates its input', () => {
  const s0 = deepFreeze(newGame('frozen', 2));
  const snap = JSON.stringify(s0);
  const path = solve(s0.blocks);
  let state = s0;
  for (const step of path.slice(0, 5)) {
    state = deepFreeze(act(state, { g: 'block', b: String(step.id) }).state);
    if (state.sel !== step.id) state = deepFreeze(act(state, { g: 'block', b: String(step.id) }).state);
    state = deepFreeze(act(state, { g: 'move', dir: step.dir }).state);
  }
  assert.equal(JSON.stringify(s0), snap);
  assert.equal(state.moves, 5);
});

test('html renders data-g buttons, grid placement, and the gold 2x2', () => {
  const s = newGame('html', 1);
  const out = html(s, 'zh');
  assert.match(out, /<button[^>]*data-g="block"[^>]*data-b="0"/);
  assert.match(out, /<button[^>]*data-g="move"[^>]*data-dir="up"/);
  assert.match(out, /<button[^>]*data-g="cell"[^>]*data-x="\d" data-y="\d"/);
  assert.equal((out.match(/data-g="cell"/g) || []).length, 2);
  assert.equal((out.match(/data-g="block"/g) || []).length, s.blocks.length);
  assert.match(out, /g-huarong-k[^"]*"[^>]*grid-column:\d \/ span 2;grid-row:\d \/ span 2/);
  assert.match(out, /g-huarong-exit/);
  assert.match(out, /步数 0/);
  assert.match(html(s, 'en'), /Moves 0/);
  assert.doesNotMatch(out, /\son[a-z]+=/i, 'no inline listeners');
  const sel = act(s, { g: 'block', b: '0' }).state;
  assert.match(html(sel), /is-sel/);
});
