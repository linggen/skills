// The made world's map: rows by roads from the start, each road once, every
// place on the map even when no road reaches it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutRoads, placeWords } from '../scripts/roadmap.js';

// 《荆州泽国》 as it was played: the pool, the deep marsh, then two ways on.
const marsh = [
  { id: 'marsh-edge', roads: ['deep-marsh', 'reed-bank'] },
  { id: 'deep-marsh', roads: ['marsh-edge', 'beast-lair', 'fog-isle'] },
  { id: 'beast-lair', roads: ['deep-marsh'] },
  { id: 'fog-isle', roads: ['deep-marsh'] },
  { id: 'reed-bank', roads: ['marsh-edge'] },
];

test('rows follow the roads from the start', () => {
  const { at, rows, widest } = layoutRoads(marsh, 'beast-lair');
  assert.equal(rows, 4);
  assert.equal(widest, 2);
  assert.deepEqual(['beast-lair', 'deep-marsh', 'marsh-edge', 'reed-bank'].map((id) => at[id].row), [0, 1, 2, 3]);
  assert.equal(at['fog-isle'].row, 2);
  assert.equal(at['beast-lair'].x, 0.5, 'a place alone in its row stands in the middle');
  assert.ok(Object.values(at).every((p) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1));
});

test('each road is drawn once, and only between places on the map', () => {
  const { roads } = layoutRoads([...marsh.slice(0, 4), { id: 'reed-bank', roads: ['marsh-edge', 'zhangnan'] }], 'beast-lair');
  assert.equal(roads.length, 4);
  assert.ok(roads.every(([a, b]) => a < b));
  assert.ok(!roads.flat().includes('zhangnan'), 'a road out of the province is not drawn');
});

test('a row is ordered under the places it is reached from', () => {
  const places = [
    { id: 'top', roads: ['l', 'r'] },
    { id: 'l', roads: ['top', 'under-l'] },
    { id: 'r', roads: ['top', 'under-r'] },
    { id: 'under-r', roads: ['r'] },
    { id: 'under-l', roads: ['l'] },
  ];
  const { at } = layoutRoads(places, 'top');
  assert.ok(at.l.x < at.r.x);
  assert.ok(at['under-l'].x < at['under-r'].x, 'no roads cross');
});

test('an unknown start falls back to the first place; a place no road reaches still shows', () => {
  const { at, rows } = layoutRoads([...marsh, { id: 'island', roads: [] }], 'nowhere');
  assert.equal(at['marsh-edge'].row, 0);
  assert.equal(at.island.row, rows - 1);
  assert.equal(layoutRoads([], 'x').rows, 0);
});

test('positions spread like a painter reads them, and say themselves in words', () => {
  const { at } = layoutRoads(marsh, 'beast-lair');
  assert.deepEqual(['beast-lair', 'deep-marsh', 'marsh-edge', 'fog-isle', 'reed-bank'].map((id) => placeWords(at[id])),
    ['Top center', 'Upper center', 'Lower left', 'Lower right', 'Bottom center']);
  const star = [{ id: 'hub', roads: ['a', 'b', 'c'] }, { id: 'a', roads: ['hub'] }, { id: 'b', roads: ['hub'] }, { id: 'c', roads: ['hub'] }];
  const s = layoutRoads(star, 'hub').at;
  assert.equal(placeWords(s.hub), 'Upper center');
  assert.deepEqual(['a', 'b', 'c'].map((id) => placeWords(s[id])), ['Lower left', 'Lower center', 'Lower right']);
  assert.equal(placeWords({ x: 0.39, y: 0.5 }), 'Middle left of center');
});
