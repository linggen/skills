import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { autoOf, autoSteps, pace, whyLine } from '../scripts/games/jieyin/auto.js';
import { chooseBoard } from '../scripts/board-choice.js';

const kit = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/levels/jieyin.json', import.meta.url)));
const level = kit.levels.find((l) => l.id === 'jiangtang');

test('demo follows the lesson sequence; levels without the knob stay unchanged', () => {
  assert.equal(autoOf({ mode: 'one' }), null);
  const steps = autoSteps(kit, level, kit.sets[0]);
  assert.deepEqual(steps.filter((s) => s.kind === 'show').map((s) => s.seal), level.sequence);
  assert.ok(steps.filter((s) => s.kind === 'show').every((s) => s.ms === 2500));
  assert.match(whyLine('denied', 'en'), /Camera is off/);
});

test('choice marks only an unmet demo and preserves ordinary alternatives', () => {
  const row = { id: 'x', title: 'base', game: 'base', alt: [{ needs: { camera: true }, demo: true, game: 'alt' }] };
  assert.equal(chooseBoard(row, { camera: true }).deal.demo, undefined);
  assert.equal(chooseBoard(row, { camera: false }).deal.demo, true);
  assert.equal(chooseBoard({ ...row, alt: [{ needs: { camera: true }, game: 'alt' }] }, {}).game, 'base');
});

test('demo clock stops and resolves on skip', async () => {
  const clock = pace([{ ms: 10000 }], { apply: () => {} });
  await Promise.resolve();
  clock.stop();
  assert.equal(await clock.done, false);
});
