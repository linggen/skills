import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meta, newGame, html, act, isFive } from '../scripts/games/wuziqi.js';

const N = 15;
const idx = (r, c) => r * N + c;

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

function withStones(level, black, white, seed = 's') {
  const st = newGame(seed, level);
  for (const [r, c] of black) st.board[idx(r, c)] = 1;
  for (const [r, c] of white) st.board[idx(r, c)] = 2;
  st.moves = black.length + white.length;
  return st;
}

test('meta and fresh state', () => {
  assert.equal(meta.id, 'wuziqi');
  const st = newGame('x', 2);
  assert.equal(st.board.length, N * N);
  assert.equal(st.outcome, 'open');
  assert.equal(st.level, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(st)), st);
});

test('five detection in all four directions, and six counts', () => {
  const lines = {
    horizontal: [[5, 1], [5, 2], [5, 3], [5, 4], [5, 5]],
    vertical: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    diagonal: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
    anti: [[2, 10], [3, 9], [4, 8], [5, 7], [6, 6]],
    six: [[9, 0], [9, 1], [9, 2], [9, 3], [9, 4], [9, 5]],
  };
  for (const [name, cells] of Object.entries(lines)) {
    const b = new Array(N * N).fill(0);
    for (const [r, c] of cells) b[idx(r, c)] = 1;
    for (const [r, c] of cells) assert.ok(isFive(b, idx(r, c), 1), name);
    b[idx(...cells[2])] = 0;
    assert.ok(!isFive(b, idx(...cells[0]), 1), `${name} broken`);
  }
});

test('player making five wins via act', () => {
  const st = withStones(1, [[5, 1], [5, 2], [5, 3], [5, 4]], [[0, 0], [0, 10], [10, 0], [10, 10]]);
  const r = act(st, { g: 'play', i: idx(5, 5) });
  assert.equal(r.won, true);
  assert.equal(r.state.outcome, 'won');
  assert.match(html(r.state), /你胜了/);
  assert.match(html(r.state, 'en'), /You win/);
  assert.doesNotMatch(html(r.state), /data-g="play"/);
});

for (const level of [1, 2, 3]) {
  test(`level ${level} blocks a four`, () => {
    // Black has 3 on row 5 (cols 2-4), plays col 5 → four with col 1 and col 6 open ends; one gets blocked.
    const st = withStones(level, [[5, 2], [5, 3], [5, 4]], [[0, 0], [10, 10], [0, 10]]);
    const r = act(st, { g: 'play', i: idx(5, 5) });
    const w = r.state.last.i;
    assert.ok(w === idx(5, 1) || w === idx(5, 6), `blocked at ${w}`);
  });

  test(`level ${level} takes its own win over blocking`, () => {
    const st = withStones(level, [[5, 2], [5, 3], [5, 4], [0, 5]], [[8, 1], [8, 2], [8, 3], [8, 4]]);
    const r = act(st, { g: 'play', i: idx(5, 5) });
    assert.equal(r.state.outcome, 'lost');
    assert.ok([idx(8, 0), idx(8, 5)].includes(r.state.last.i));
    assert.match(html(r.state), /对手连成五子/);
    assert.match(html(r.state), /data-g="again"/);
  });
}

test('determinism: same seed and moves give the same game', () => {
  const play = () => {
    let st = newGame('seed-7', 2);
    for (const i of [60, 61, 49, 71, 38]) if (st.board[i] === 0) st = act(st, { g: 'play', i }).state;
    return st;
  };
  assert.deepEqual(play(), play());
});

// Scripted player: win > block white's five > extend its own longest line (centre-first ties).
function scripted(board) {
  const count = (i, who) => {
    let best = 0;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      let n = 1;
      for (const s of [1, -1]) {
        let r = Math.floor(i / N) + dr * s, c = (i % N) + dc * s;
        while (r >= 0 && r < N && c >= 0 && c < N && board[r * N + c] === who) { n++; r += dr * s; c += dc * s; }
      }
      best = Math.max(best, n);
    }
    return best;
  };
  let pick = -1, score = -1;
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0) continue;
    const r = Math.floor(i / N), c = i % N;
    let s = count(i, 1) * 100 - (Math.abs(r - 5) + Math.abs(c - 5));
    if (count(i, 1) >= 5) s += 1e6;
    else if (count(i, 2) >= 5) s += 1e5;
    if (s > score) { score = s; pick = i; }
  }
  return pick;
}

test('a scripted player beats level 1 within 30 moves; AI never plays on an occupied cell', () => {
  let wins = 0;
  for (let k = 0; k < 8; k++) {
    let st = newGame(`seed-${k}`, 1);
    for (let m = 0; m < 30 && st.outcome === 'open'; m++) {
      const i = scripted(st.board);
      const before = st.board;
      const r = act(st, { g: 'play', i });
      if (r.state.last.by === 'white') {
        const w = r.state.last.i;
        assert.equal(before[w], 0, 'white played an occupied cell');
        assert.notEqual(w, i);
        assert.equal(r.state.board.filter((v) => v !== 0).length, before.filter((v) => v !== 0).length + 2);
      }
      st = r.state;
      if (r.won) wins++;
    }
  }
  assert.ok(wins >= 1, `scripted player won ${wins} of 8`);
});

test("'again' after a loss deals a fresh board at the same level", () => {
  const st = withStones(2, [[5, 2], [5, 3], [5, 4], [0, 5]], [[8, 1], [8, 2], [8, 3], [8, 4]], 'base');
  const lost = act(st, { g: 'play', i: idx(5, 5) }).state;
  assert.equal(lost.outcome, 'lost');
  assert.equal(act(lost, { g: 'play', i: idx(1, 1) }).state, lost, 'no moves after the end');
  const r = act(lost, { g: 'again' });
  assert.equal(r.won, false);
  assert.equal(r.state.outcome, 'open');
  assert.equal(r.state.level, 2);
  assert.equal(r.state.again, 1);
  assert.equal(r.state.seed, 'base|again1');
  assert.ok(r.state.board.every((v) => v === 0));
  assert.match(html(r.state), /data-g="play" data-i="0"/);
  // 'again' is refused while a game is open.
  assert.equal(act(r.state, { g: 'again' }).state, r.state);
});

test('act never mutates its input; illegal moves return the same state', () => {
  const st = deepFreeze(newGame('frozen', 3));
  const r = act(st, { g: 'play', i: 60 });
  assert.equal(r.state.board[60], 1);
  assert.equal(st.board[60], 0);
  const f = deepFreeze(r.state);
  assert.equal(act(f, { g: 'play', i: 60 }).state, f);
  assert.equal(act(f, { g: 'play', i: 999 }).state, f);
  assert.equal(act(f, { g: 'nope' }).state, f);
  const r2 = act(f, { g: 'play', i: 0 });
  assert.equal(r2.state.moves, 4);
});

test('html: every empty cell is a play button; last move marked', () => {
  let st = newGame('h', 1);
  st = act(st, { g: 'play', i: 60 }).state;
  const out = html(st);
  assert.equal((out.match(/data-g="play"/g) || []).length, N * N - 2);
  assert.equal((out.match(/is-last/g) || []).length, 1);
  assert.match(out, /执黑落子/);
  assert.doesNotMatch(out, /data-g="again"/);
});
