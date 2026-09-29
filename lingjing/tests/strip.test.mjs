// The strip's gains (lingjing.js paintRise): 修为 and 灵石 count up to what the
// save holds, and the last frame always lands on it — a hidden tab draws no
// frames, and the strip, redrawn only when its HTML changes, once kept a
// half-way count over the save for good (live, 2026-09-29).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
const body = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n}\n', src.indexOf(`function ${name}(`)) + 2);
const RISE_MS = Number(/RISE_MS = (\d+)/.exec(src)[1]);
const riseValue = new Function('RISE_MS', `${body('riseValue')}; return riseValue;`)(RISE_MS);

test('a gain counts up eased, never below where it began, and lands on the saved number', () => {
  const r = { from: 36, to: 55 };
  assert.equal(riseValue(r, -500, false).value, 36, 'not started yet: the old count');
  const mid = riseValue(r, RISE_MS / 2, false);
  assert.ok(mid.value > 36 && mid.value < 55 && mid.k < 1);
  assert.deepEqual(riseValue(r, RISE_MS, false), { k: 1, value: 55 });
  assert.deepEqual(riseValue(r, 99_999, false), { k: 1, value: 55 }, 'long after: the saved number');
  assert.deepEqual(riseValue(r, 10, true), { k: 1, value: 55 }, 'reduced motion: at once');
});

test('the frame that retires a gain writes the landed number first', () => {
  const paint = body('paintRise');
  const write = paint.indexOf('el.textContent = String(value)'), retire = paint.indexOf('if (age > GAIN_MS) { rising.delete(key); continue; }');
  assert.ok(write > 0 && retire > write, 'written, then let go');
});
