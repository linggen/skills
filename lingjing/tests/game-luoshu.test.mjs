import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meta, newGame, html, act, allSquares, isMagic } from '../scripts/games/luoshu.js';

function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}

// Any magic square consistent with the givens.
function solve(state) {
  return allSquares().find((sq) => state.givens.every((i) => sq[i] === state.cells[i]));
}

function play(state, sq) {
  let s = state, won = false;
  for (let i = 0; i < 9; i++) {
    if (s.cells[i]) continue;
    ({ state: s } = act(s, { g: 'pick', n: String(sq[i]) }));
    ({ state: s, won } = act(s, { g: 'cell', i: String(i) }));
  }
  return { state: s, won };
}

test('meta shape', () => {
  assert.equal(meta.id, 'luoshu');
  assert.ok(meta.name.zh && meta.name.en && meta.how.zh && meta.how.en);
});

test('deal is deterministic from seed and JSON-serializable', () => {
  assert.deepEqual(newGame('abc', 2), newGame('abc', 2));
  const s = newGame('abc', 1);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  const seeds = new Set(Array.from({ length: 20 }, (_, k) => JSON.stringify(newGame(`s${k}`).cells)));
  assert.ok(seeds.size > 1, 'different seeds deal different boards');
});

test('givens count by level, each deal solvable', () => {
  for (const [level, n] of [[1, 4], [2, 3], [3, 2]]) {
    for (let k = 0; k < 30; k++) {
      const s = newGame(`seed${k}`, level);
      assert.equal(s.givens.length, n);
      assert.equal(s.cells.filter(Boolean).length, n);
      assert.ok(solve(s), 'at least one solution');
    }
  }
});

test('solver-driven play-through wins', () => {
  for (const level of [1, 2, 3]) {
    const s0 = newGame('play', level);
    const { state, won } = play(s0, solve(s0));
    assert.equal(won, true);
    assert.equal(state.won, true);
    assert.ok(isMagic(state.cells));
    const after = act(state, { g: 'cell', i: '0' });
    assert.equal(after.state, state, 'no-op after win');
    assert.equal(after.won, false);
    assert.match(html(state, 'zh'), /封印已破/);
    assert.match(html(state, 'en'), /The seal gives way/);
    assert.doesNotMatch(html(state), /data-g="pick"/);
  }
});

test('wrong full grid is not won', () => {
  const s0 = newGame('wrong', 1);
  const sq = solve(s0);
  const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => !s0.givens.includes(i));
  const bad = sq.slice();
  [bad[free[0]], bad[free[1]]] = [bad[free[1]], bad[free[0]]];
  assert.ok(!isMagic(bad));
  const { state, won } = play(s0, bad);
  assert.equal(won, false);
  assert.equal(state.won, false);
  assert.ok(state.cells.every(Boolean), 'grid is full');
});

test('given cells cannot be changed; illegal acts return same state', () => {
  const s0 = newGame('lock', 1);
  const g = s0.givens[0];
  const r = act(s0, { g: 'cell', i: String(g) });
  assert.equal(r.state, s0);
  assert.equal(r.won, false);
  const picked = act(s0, { g: 'pick', n: String(s0.cells[g]) });
  assert.equal(picked.state, s0, 'cannot pick a used number');
  assert.equal(act(s0, { g: 'nope' }).state, s0);
  const empty = s0.cells.indexOf(0);
  assert.equal(act(s0, { g: 'cell', i: String(empty) }).state, s0, 'no pick → no place');
});

test('placed cell clears on tap', () => {
  const s0 = newGame('clear', 1);
  const empty = s0.cells.indexOf(0);
  const n = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((x) => !s0.cells.includes(x));
  let { state } = act(s0, { g: 'pick', n: String(n) });
  assert.equal(state.pick, n);
  ({ state } = act(state, { g: 'cell', i: String(empty) }));
  assert.equal(state.cells[empty], n);
  ({ state } = act(state, { g: 'cell', i: String(empty) }));
  assert.equal(state.cells[empty], 0);
});

test('html has data-g buttons', () => {
  const s = newGame('html', 2);
  const out = html(s, 'zh');
  assert.equal((out.match(/<button[^>]*data-g="cell"/g) || []).length, 9);
  assert.equal((out.match(/<button[^>]*data-g="pick"/g) || []).length, 9);
  assert.match(html(s, 'en'), /data-g="pick" data-n="5"/);
});

test('act never mutates input', () => {
  const s0 = deepFreeze(newGame('frozen', 3));
  const snap = JSON.stringify(s0);
  const sq = solve(s0);
  const i = s0.cells.indexOf(0);
  const a = act(s0, { g: 'pick', n: String(sq[i]) });
  deepFreeze(a.state);
  const b = act(a.state, { g: 'cell', i: String(i) });
  deepFreeze(b.state);
  act(b.state, { g: 'cell', i: String(i) });
  assert.equal(JSON.stringify(s0), snap);
  const { won } = play(s0, sq);
  assert.equal(won, true);
  assert.equal(JSON.stringify(s0), snap);
});
