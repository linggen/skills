import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meta, newGame, html, act, PUZZLES, parsePos, legalMoves, move, inCheck,
} from '../scripts/games/xiangqi.js';

const sq = (i) => String.fromCharCode(97 + (i % 9)) + Math.floor(i / 9);
const idx = (s) => (+s[1]) * 9 + (s.charCodeAt(0) - 97);
const xy = (i) => `${i % 9},${Math.floor(i / 9)}`;
const dests = (pos, from, side) => legalMoves(parsePos(pos), side)
  .filter(([f]) => f === idx(from)).map(([, t]) => sq(t)).sort();

// Independent exhaustive search: can red force mate within n red moves?
function mates(b, n) {
  if (n === 0) return false;
  return legalMoves(b, 'r').some(([f, t]) => blackLost(move(b, f, t), n - 1));
}
function blackLost(b, n) {
  const rs = legalMoves(b, 'b');
  return rs.length === 0 || rs.every(([f, t]) => mates(move(b, f, t), n));
}
function winningMove(b, left) {
  return legalMoves(b, 'r').find(([f, t]) => blackLost(move(b, f, t), left - 1));
}
function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}
function play(state, [f, t]) {
  const s1 = act(state, { g: 'pick', at: xy(f) }).state;
  assert.equal(s1.sel, f);
  return act(s1, { g: 'go', at: xy(t) });
}

test('meta and exports', () => {
  assert.equal(meta.id, 'xiangqi');
  assert.equal(meta.name.zh, '象棋残局');
  assert.ok(meta.how.zh && meta.how.en);
  assert.ok(PUZZLES[1].length >= 3 && PUZZLES[2].length >= 3 && PUZZLES[3].length >= 2);
});

test('horse leg blocking', () => {
  assert.deepEqual(dests('Kd9 Ne5 kf0', 'e5', 'r'), ['c4', 'c6', 'd3', 'd7', 'f3', 'f7', 'g4', 'g6']);
  // pawn on e4 hobbles the upward leg: d3 and f3 vanish
  assert.deepEqual(dests('Kd9 Ne5 Pe4 kf0', 'e5', 'r'), ['c4', 'c6', 'd7', 'f7', 'g4', 'g6']);
});

test('elephant eye blocking and river', () => {
  // c5 elephant: a3/e3 are across the river; eye d6 blocked stops e7
  assert.deepEqual(dests('Kd9 Bc5 Pd6 kf0', 'c5', 'r'), ['a7']);
  assert.deepEqual(dests('Kd9 Bc5 kf0', 'c5', 'r'), ['a7', 'e7']);
  // black elephant on e2 never reaches rank 5+
  assert.deepEqual(dests('Kd9 kf0 be2', 'e2', 'b'), ['c0', 'c4', 'g0', 'g4']);
});

test('cannon needs exactly one screen to capture', () => {
  assert.deepEqual(dests('Kd9 Ca5 re5 kf0', 'a5', 'r').filter((s) => s.endsWith('5')), ['b5', 'c5', 'd5']);
  const withScreen = dests('Kd9 Ca5 Pc5 re5 kf0', 'a5', 'r').filter((s) => s.endsWith('5'));
  assert.deepEqual(withScreen, ['b5', 'e5']);
  // two screens: no capture
  assert.ok(!dests('Kd9 Ca5 Pc5 nd5 re5 kf0', 'a5', 'r').includes('e5'));
});

test('flying general is forbidden', () => {
  assert.ok(!dests('Kd9 ke0', 'd9', 'r').includes('e9'));
  assert.ok(dests('Kd9 ke0 pe5', 'd9', 'r').includes('e9'));
  assert.equal(inCheck(parsePos('Ke9 ke0'), 'r'), true);
  // a screening piece may not step off the file
  assert.ok(!dests('Ke9 Re5 ke0', 'e5', 'r').includes('a5'));
});

test('soldiers: forward only, sideways after the river', () => {
  assert.deepEqual(dests('Kd9 Pc6 kf0', 'c6', 'r'), ['c5']);
  assert.deepEqual(dests('Kd9 Pc4 kf0', 'c4', 'r'), ['b4', 'c3', 'd4']);
  assert.deepEqual(dests('Kd9 Pa0 kf0', 'a0', 'r'), ['b0']);
  assert.deepEqual(dests('Kd9 kf0 pc3', 'c3', 'b'), ['c4']);
  assert.deepEqual(dests('Kd9 kf0 pc5', 'c5', 'b'), ['b5', 'c6', 'd5']);
});

test('no moving into check; mate and stalemate = no legal move', () => {
  // black king e0 cannot step to e1 into a rook's file
  assert.ok(!dests('Kd9 Re5 Ri1 ke0', 'e0', 'b').includes('e1'));
  assert.equal(legalMoves(parsePos('Kd9 Ra1 Ri0 ke0'), 'b').length, 0);
});

for (const [lv, list] of Object.entries(PUZZLES)) {
  for (const pz of list) {
    test(`puzzle ${pz.id}: legal start, forced mate in exactly ${pz.n}`, () => {
      const b = parsePos(pz.pos);
      assert.equal(pz.n, Number(lv));
      assert.equal(inCheck(b, 'r'), false, 'red to move must not be in check');
      assert.equal((b.match(/K/g) || []).length, 1);
      assert.equal((b.match(/k/g) || []).length, 1);
      assert.equal(mates(b, pz.n), true, 'forced mate within N');
      assert.equal(mates(b, pz.n - 1), false, 'no shorter mate');
    });

    test(`puzzle ${pz.id}: solution through act() wins`, () => {
      let s = newGame('x', Number(lv));
      s = { ...s, pid: list.indexOf(pz), board: parsePos(pz.pos) };
      let won = false;
      for (let k = 0; k < pz.n && !won; k++) {
        assert.equal(s.outcome, 'open');
        const m = winningMove(s.board, s.left);
        assert.ok(m, 'a winning move exists');
        ({ state: s, won } = play(s, m));
      }
      assert.equal(won, true);
      assert.equal(s.outcome, 'won');
      assert.match(html(s), /将死/);
    });
  }
}

test('newGame is deterministic by seed and level', () => {
  for (const lv of [1, 2, 3]) {
    const a = newGame('abc', lv), b = newGame('abc', lv);
    assert.deepEqual(a, b);
    assert.equal(a.n, lv);
    assert.equal(a.left, lv);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  }
  const seen = new Set();
  for (let k = 0; k < 40; k++) seen.add(newGame('s' + k, 2).pid);
  assert.equal(seen.size, PUZZLES[2].length);
  assert.equal(newGame('z').level, 1);
});

test('html: board, buttons, goal line', () => {
  let s = newGame('h', 2);
  const out = html(s);
  assert.match(out, /红先，2 步内将死/);
  assert.equal((out.match(/data-g="pick"/g) || []).length, (s.board.match(/[A-Z]/g) || []).length);
  assert.doesNotMatch(out, /data-g="go"/);
  assert.doesNotMatch(out, /\son[a-z]+=/);
  assert.match(out, /楚 河/);
  const red = s.board.search(/[A-Z]/);
  s = act(s, { g: 'pick', at: xy(red) }).state;
  const goCount = (html(s).match(/data-g="go"/g) || []).length;
  assert.equal(goCount, legalMoves(s.board, 'r').filter(([f]) => f === red).length);
  assert.match(html(s, 'en'), /mate in 2/);
});

test('wrong line fails, again resets the same puzzle', () => {
  const pid = PUZZLES[2].findIndex((p) => p.id === 'chuanxin');
  let s = { ...newGame('w', 2), pid, board: parsePos(PUZZLES[2][pid].pos) };
  const start = s;
  const bad = legalMoves(s.board, 'r').find(([f, t]) => !blackLost(move(s.board, f, t), 1));
  let r = play(s, bad);
  assert.equal(r.won, false);
  assert.equal(r.state.outcome, 'open');
  assert.equal(r.state.last.side, 'b', 'black replied');
  assert.equal(r.state.left, 1);
  r = play(r.state, legalMoves(r.state.board, 'r')[0]);
  assert.equal(r.won, false);
  assert.equal(r.state.outcome, 'lost');
  assert.match(html(r.state), /data-g="again"/);
  // no further moves once lost
  assert.equal(act(r.state, { g: 'pick', at: '4,9' }).state, r.state);
  const again = act(r.state, { g: 'again' });
  assert.equal(again.won, false);
  assert.deepEqual(again.state, start);
});

test('act ignores bad input and never mutates', () => {
  const s = deepFreeze(newGame('m', 3));
  const snap = JSON.stringify(s);
  assert.equal(act(s, { g: 'go', at: '0,0' }).state, s);
  assert.equal(act(s, { g: 'pick', at: '99,1' }).state, s);
  const black = s.board.search(/[a-z]/);
  assert.equal(act(s, { g: 'pick', at: xy(black) }).state.sel, null);
  const m = winningMove(s.board, s.left);
  const s1 = deepFreeze(act(s, { g: 'pick', at: xy(m[0]) }).state);
  act(s1, { g: 'go', at: xy(m[1]) });
  act(s1, { g: 'again' });
  assert.equal(JSON.stringify(s), snap);
});
