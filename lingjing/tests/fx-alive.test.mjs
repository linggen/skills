// 画活 (fx-alive.js, design.md § 画面效果): which paintings move is data (backdrops.json `alive`),
// and the motion is a pure function the canvas only draws — small, rooted, never past its box.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRID, KINDS, aliveOf, fitOf, motionAt, touched } from '../scripts/fx-alive.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORLD = path.join(ROOT, 'worlds/jiuding');
const table = JSON.parse(fs.readFileSync(path.join(WORLD, 'backdrops.json'), 'utf8'));

test('alive: every row names a painting that exists, a known kind and a box inside it — none dropped', () => {
  const rows = Object.entries(table.alive);
  assert.ok(rows.length >= 20, 'the places and the skies are declared');
  for (const [art, list] of rows) {
    assert.ok(fs.existsSync(path.join(WORLD, art)), `${art} exists`);
    assert.equal(aliveOf(table, art).length, list.length, `${art}: every row is good`);
  }
  assert.ok(aliveOf(table, 'art/creatures/fuzhu.webp', { creature: true }).some((r) => r.kind === 'breathe'), 'a beast breathes by default');
  assert.deepEqual(aliveOf(table, 'art/creatures/fuzhu.webp'), [], 'a backdrop never takes the beasts’ row');
  assert.deepEqual(aliveOf(table, 'art/places/jiangtang.webp'), [], 'a painting without a row stands still');
});

test('alive: bad rows drop, amp is held to 0–2', () => {
  const t = { alive: { a: [{ kind: 'wobble', box: [0, 0, 1, 1] }, { kind: 'sway', box: [0.5, 0, 0.2, 1] }, { kind: 'sway', box: [0, 0, 1, 1.4] }, { kind: 'water', box: [0, 0.5, 1, 1], amp: 9 }] } };
  assert.deepEqual(aliveOf(t, 'a'), [{ kind: 'water', box: [0, 0.5, 1, 1], amp: 2 }]);
});

const sweep = (regions, fn) => {
  for (let t = 0; t < 12; t += 0.37) for (let u = 0; u <= 1; u += 0.05) for (let v = 0; v <= 1; v += 0.05) fn(u, v, t, motionAt(regions, u, v, t, { force: 1, sign: 1 }));
};

test('alive: nothing moves outside its box, and nothing moves far (ink, not a cartoon)', () => {
  for (const kind of Object.keys(KINDS)) {
    const box = [0.3, 0.3, 0.7, 0.7], r = [{ kind, box, amp: 2 }];
    let most = 0;
    sweep(r, (u, v, t, [dx, dy]) => {
      if (u < 0.3 || u > 0.7 || v < 0.3 || v > 0.7) assert.deepEqual([dx, dy], [0, 0], `${kind} still outside its box`);
      most = Math.max(most, Math.abs(dx), Math.abs(dy));
    });
    assert.ok(most > 0, `${kind} moves`);
    assert.ok(most < 0.04, `${kind} at its strongest moves under 4% of the painting (${most.toFixed(4)})`);
  }
});

test('alive: a tree sways from its root and cloth from where it hangs', () => {
  const tree = [{ kind: 'sway', box: [0, 0.2, 1, 0.8], amp: 1 }], cloth = [{ kind: 'cloth', box: [0, 0.2, 1, 0.8], amp: 1 }];
  let root = 0, crown = 0, hang = 0, hem = 0;
  for (let t = 0; t < 10; t += 0.25) {
    root = Math.max(root, Math.abs(motionAt(tree, 0.5, 0.8, t)[0]));
    crown = Math.max(crown, Math.abs(motionAt(tree, 0.5, 0.35, t)[0]));
    hang = Math.max(hang, Math.abs(motionAt(cloth, 0.5, 0.2, t)[0]));
    hem = Math.max(hem, Math.abs(motionAt(cloth, 0.5, 0.65, t)[0]));
  }
  assert.equal(root, 0, 'the root holds');
  assert.equal(hang, 0, 'the rail holds');
  assert.ok(crown > 0.003 && hem > 0.001, 'the crown and the hem move');
});

test('alive: the wind leans a tree its way', () => {
  const tree = [{ kind: 'sway', box: [0, 0.2, 1, 0.8], amp: 1 }];
  let right = 0, left = 0;
  for (let t = 0; t < 20; t += 0.1) { right += motionAt(tree, 0.5, 0.3, t, { force: 1, sign: 1 })[0]; left += motionAt(tree, 0.5, 0.3, t, { force: 1, sign: -1 })[0]; }
  assert.ok(right > 0 && left < 0);
});

test('alive: a frame bends only the grid inside some box; the fit matches the CSS still (cover, center 40%)', () => {
  assert.equal(touched([]).length, 0);
  const all = touched([{ kind: 'water', box: [0, 0, 1, 1] }]);
  assert.ok(all.length > GRID.x * GRID.y * 0.7 && all.length < GRID.x * GRID.y, "the feathered rim stays put");
  assert.ok(touched([{ kind: 'water', box: [0, 0.5, 1, 1] }]).length < all.length * 0.6);
  // A 1536×1024 painting in a phone's tall stage: as tall as the stage, centred across.
  const f = fitOf(1536, 1024, 390, 700);
  assert.equal(f.sy * 1024, 700);
  assert.ok(Math.abs(f.x - (390 - 1536 * f.sx) / 2) < 1e-9);
  // In a wide one: as wide, and 40% of the overflow above.
  const g = fitOf(1536, 1024, 1600, 600);
  assert.equal(g.sx * 1536, 1600);
  assert.ok(Math.abs(g.y - (600 - 1024 * g.sy) * 0.4) < 1e-9);
  assert.deepEqual(fitOf(100, 50, 200, 200, { fit: 'fill' }), { sx: 2, sy: 4, x: 0, y: 0 });
});

test('alive: the page wires it in one line each — the backdrop, the 出场, the struck plate', () => {
  const page = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(page, /liveBackdrop\(bd, src, authored\?\.backdrops, art\)/);
  assert.match(page, /liveCreature\(el, authored\.backdrops, c\.art\)/);
  const anim = fs.readFileSync(path.join(ROOT, 'scripts/battle-anim.js'), 'utf8');
  assert.match(anim, /squash\(el\);/);
});
