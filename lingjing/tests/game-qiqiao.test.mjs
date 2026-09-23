import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meta, newGame, html, act, silhouettes } from '../scripts/games/qiqiao.js';

const AREA = { L: 2, M: 1, S: 0.5, Q: 1, P: 1 };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}
const area = (pts) => Math.abs(signedArea(pts));
const ccw = (pts) => (signedArea(pts) < 0 ? [...pts].reverse() : pts);

// Sutherland–Hodgman: intersection of two convex polygons (all tangram pieces are convex).
function clip(subject, clipper) {
  let out = ccw(subject);
  const c = ccw(clipper);
  for (let i = 0; i < c.length && out.length; i++) {
    const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length];
    const side = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return out.length >= 3 ? area(out) : 0;
}

function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
}

function solve(state) {
  const sil = silhouettes.find((s) => s.id === state.sil);
  let s = state, won = false;
  sil.slots.forEach((slot, i) => {
    const p = s.pieces.findIndex((pc, j) => pc.shape === slot.shape && !s.slots.includes(j));
    ({ state: s } = act(s, { g: 'piece', p: String(p) }));
    for (let k = 0; k < 16 && s.slots[i] == null; k++) {
      ({ state: s, won } = act(s, { g: 'slot', s: String(i) }));
      if (s.slots[i] != null) break;
      assert.equal(s.refused, 'turn');
      ({ state: s } = act(s, { g: k === 7 ? 'flip' : 'rotate' }));
    }
    assert.equal(s.slots[i], p, `slot ${i + 1} of ${sil.id} filled`);
  });
  return { s, won };
}

test('meta', () => {
  assert.equal(meta.id, 'qiqiao');
  assert.ok(meta.name.zh && meta.name.en && meta.how.zh && meta.how.en);
});

test('six or more silhouettes with sound geometry', () => {
  assert.ok(silhouettes.length >= 6);
  for (const sil of silhouettes) {
    assert.equal(sil.slots.length, 7, sil.id);
    const shapes = sil.slots.map((s) => s.shape).sort().join('');
    assert.equal(shapes, 'LLMPQSS', sil.id);
    let total = 0;
    sil.slots.forEach((s, i) => {
      assert.ok(near(area(s.points), AREA[s.shape]), `${sil.id} slot ${i + 1} area`);
      assert.ok(s.rot >= 0, `${sil.id} slot ${i + 1} is a congruent ${s.shape}`);
      total += area(s.points);
    });
    assert.ok(near(total, 8), `${sil.id} total area`);
    for (let i = 0; i < 7; i++)
      for (let j = i + 1; j < 7; j++)
        assert.ok(clip(sil.slots[i].points, sil.slots[j].points) < 1e-6, `${sil.id} slots ${i + 1}/${j + 1} overlap`);
  }
});

test('deterministic deal, level picks the pool', () => {
  assert.deepEqual(newGame('abc', 1), newGame('abc', 1));
  assert.deepEqual(newGame('abc', 3), newGame('abc', 3));
  const lv1 = new Set(), lv2 = new Set();
  for (let i = 0; i < 60; i++) { lv1.add(newGame(`s${i}`, 1).sil); lv2.add(newGame(`s${i}`, 2).sil); }
  assert.deepEqual([...lv1].sort(), ['house', 'square']);
  assert.deepEqual([...lv2].sort(), ['boat', 'cat', 'fish', 'mountain']);
  const g = newGame('x');
  assert.deepEqual(JSON.parse(JSON.stringify(g)), g);
  assert.equal(g.pieces.length, 7);
});

test('scripted solve wins every silhouette', () => {
  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    const g = newGame(`solve${i}`, 1 + (i % 3));
    seen.add(g.sil);
    const { s, won } = solve(g);
    assert.equal(won, true);
    assert.equal(s.won, true);
    assert.equal(act(s, { g: 'lift', s: '0' }).state, s, 'no-op after win');
    assert.match(html(s, 'zh'), /阵成/);
    assert.match(html(s, 'en'), /The formation holds/);
  }
  assert.equal(seen.size, silhouettes.length);
});

test('wrong shape refused', () => {
  const g = newGame('shape', 1);
  const sil = silhouettes.find((s) => s.id === g.sil);
  const qSlot = sil.slots.findIndex((s) => s.shape === 'Q');
  let { state } = act(g, { g: 'piece', p: '0' }); // a large triangle
  const r = act(state, { g: 'slot', s: String(qSlot) });
  assert.equal(r.won, false);
  assert.equal(r.state.refused, 'shape');
  assert.equal(r.state.slots[qSlot], null);
  assert.equal(r.state.sel, 0, 'piece stays in tray, still selected');
  assert.match(html(r.state, 'zh'), /形不合/);
});

test('wrong rotation refused, right rotation accepted', () => {
  const g = newGame('turn', 2);
  const sil = silhouettes.find((s) => s.id === g.sil);
  const i = sil.slots.findIndex((s) => s.shape === 'M');
  let { state } = act(g, { g: 'piece', p: '2' });
  const need = (sil.slots[i].rot - state.pieces[2].rot + 8) % 8;
  const off = need === 0 ? 1 : 0; // make it deliberately wrong
  for (let k = 0; k < off; k++) ({ state } = act(state, { g: 'rotate' }));
  const bad = act(state, { g: 'slot', s: String(i) });
  assert.equal(bad.state.refused, 'turn');
  assert.equal(bad.state.slots[i], null);
  let s = bad.state;
  while (s.pieces[2].rot !== sil.slots[i].rot) ({ state: s } = act(s, { g: 'piece', p: '2' }));
  const ok = act(s, { g: 'slot', s: String(i) });
  assert.equal(ok.state.slots[i], 2);
  assert.equal(ok.state.refused, null);
  const back = act(ok.state, { g: 'lift', s: String(i) });
  assert.equal(back.state.slots[i], null);
  assert.match(html(back.state), /data-g="piece" data-p="2"/);
});

test('act never mutates input; illegal is a no-op', () => {
  const g = deepFreeze(newGame('freeze', 2));
  const snap = JSON.stringify(g);
  const ops = [
    { g: 'piece', p: '6' }, { g: 'rotate' }, { g: 'flip' }, { g: 'slot', s: '3' },
    { g: 'lift', s: '3' }, { g: 'nonsense' }, { g: 'piece', p: '99' },
  ];
  let s = g;
  for (const op of ops) { s = deepFreeze(act(s, op).state); }
  assert.equal(JSON.stringify(g), snap);
  assert.equal(act(g, { g: 'rotate' }).state, g, 'rotate with nothing selected');
  assert.equal(act(g, { g: 'slot', s: '0' }).state, g, 'slot with nothing selected');
  assert.equal(act(g, { g: 'lift', s: '0' }).state, g, 'lift an empty slot');
  const { s: done } = solve(g);
  assert.equal(JSON.stringify(g), snap);
  assert.equal(done.won, true);
});

test('html renders tappable data-g buttons', () => {
  const g = newGame('ui', 1);
  const out = html(g, 'zh');
  assert.match(out, /class="g-qiqiao"/);
  assert.match(out, /<svg class="qq-board"/);
  assert.equal((out.match(/<button[^>]*data-g="piece"/g) || []).length, 7);
  assert.equal((out.match(/<button[^>]*data-g="slot"/g) || []).length, 7);
  assert.match(out, /<button[^>]*data-g="rotate"/);
  const { state } = act(g, { g: 'piece', p: '6' });
  assert.match(html(state, 'en'), /<button[^>]*data-g="flip"/);
  assert.doesNotMatch(html(g), /undefined|NaN/);
});
