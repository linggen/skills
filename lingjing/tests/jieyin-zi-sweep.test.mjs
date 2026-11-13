import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handSeal, makes } from '../scripts/games/jieyin/judge.js';
import { buildHand, poseOf } from '../scripts/games/jieyin/pose.js';
import { start, step } from '../scripts/games/jieyin/sequence.js';

const kit = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/levels/jieyin.json', import.meta.url)));
const { seals, judge: k } = kit;
const read = (h) => handSeal(h, seals, k);
const width = (h) => Math.hypot(h[5].x - h[17].x, h[5].y - h[17].y, h[5].z - h[17].z);
const shiftTip = (h, fraction) => h.map((p, i) => i === 4 ? { ...p, x: p.x + fraction * width(h) } : { ...p });
const rotate = (h, degrees) => { const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return h.map((p) => ({ ...p, x: p.x * c - p.y * s, y: p.x * s + p.y * c })); };

test('子 figure remains 子 under in-plane rotation and measured thumb displacement', () => {
  const h = poseOf(seals.zi);
  for (const angle of [-45, -30, -15, 0, 15, 30, 45]) assert.equal(read(rotate(h, angle)), 'zi', `${angle}°`);
  for (const [n, result] of [[-0.3, null], [-0.2, null], [-0.1, 'zi'], [0, 'zi'], [0.1, 'zi'], [0.2, 'zi'], [0.3, null]]) assert.equal(read(shiftTip(h, n)), result, `${n} palm widths`);
  for (const id of ['si', 'wu', 'shen', 'mao', 'yuqing', 'you']) assert.equal(read(poseOf(seals[id])), id);
  assert.equal(makes(poseOf(seals.zhang), seals.zi, k), false);
  assert.equal(makes(buildHand({ curl: ['index', 'middle', 'ring', 'pinky'] }), seals.zi, k), false);
});

test('all holds survive a brief neighbouring answer without counting its time; sustained changes still count', () => {
  for (const id of Object.keys(seals).filter((x) => seals[x].hands === 1)) {
    let s = start({ mode: 'one', sequence: [id] });
    for (const answer of [id, id, id]) s = step(s, answer, 67, k).state;
    const before = s.held;
    s = step(s, id === 'wu' ? 'zi' : 'wu', 67, k).state;
    assert.equal(s.cur, id); assert.equal(s.held, before);
    let r;
    for (let i = 0; i < 3; i++) { r = step(s, id, 67, k); s = r.state; }
    assert.ok(r.events.some((e) => e.type === 'done'), id);
  }
  let s = start({ mode: 'one', sequence: ['zi'] });
  for (const id of ['zi', 'zi', 'wu', 'wu', 'wu']) s = step(s, id, 67, k).state;
  assert.equal(s.cur, 'wu');
  let events = [];
  for (let i = 0; i < 10; i++) { const r = step(s, 'wu', 67, k); s = r.state; events.push(...r.events); }
  assert.ok(events.some((e) => e.type === 'miss'));
});
