// The alchemy board: pairs vanish together, a mismatch moves the selection,
// and only the last pair wins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newBoard, tap } from '../scripts/board.js';

const herbs = 'abcdefghij'.split('').map((id) => ({ id, tile: id, label: id }));

test('a board holds each of eight herbs twice', () => {
  const b = newBoard(herbs, 'alchemy-first');
  assert.equal(b.tiles.length, 16);
  const counts = {};
  for (const t of b.tiles) counts[t.id] = (counts[t.id] ?? 0) + 1;
  assert.deepEqual(Object.values(counts), Array(8).fill(2));
});

test('a pair vanishes, a mismatch moves the selection, the last pair wins', () => {
  const b = newBoard(herbs, 'alchemy-first');
  const first = b.tiles.findIndex((t) => t.id !== b.tiles[0].id);
  assert.equal(tap(b, 0), false);
  assert.equal(tap(b, first), false, 'a mismatch');
  assert.equal(b.sel, first, 'the selection moved');
  const byHerb = {};
  b.tiles.forEach((t, i) => (byHerb[t.id] ??= []).push(i));
  b.sel = null;
  const pairs = Object.values(byHerb);
  pairs.slice(0, -1).forEach(([x, y]) => { tap(b, x); assert.equal(tap(b, y), false); });
  const [x, y] = pairs.at(-1);
  tap(b, x);
  assert.equal(tap(b, y), true);
  assert.equal(b.won, true);
  assert.equal(tap(b, 0), false, 'a cleared board takes no more taps');
});
