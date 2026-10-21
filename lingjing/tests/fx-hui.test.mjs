// A new 回 turns the page (fx-hui.js): within the seal's own time, the painting where the CSS still
// has it, and the page calls it once, with the seal, when 「新的一回」 rises.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUI_FX, HUI_MS, fyOf } from '../scripts/fx-hui.js';
import { frameOf } from '../scripts/setpieces/painted.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');

test('hui fx: the turn fits in the seal’s own time — paper over, held, the painting back', () => {
  const seal = Number(page.match(/const CHAPTER_SEAL_MS = (\d+);/)[1]);
  assert.ok(HUI_MS <= seal, `${HUI_MS} ms within the seal's ${seal}`);
  assert.ok(HUI_FX.hold >= 1, 'the blank page holds long enough to read the seal');
});

test('hui fx: the painting sits where the CSS still sits it (cover, center 40%), so the turn starts without a jump', () => {
  for (const [W, H] of [[1000, 560], [1000, 1800], [1000, 667]]) {
    const iw = 1536, ih = 1024;
    const f = frameOf({ s: 1, fx: 0.5, fy: fyOf(iw, ih, W, H) }, iw, ih, W, H);
    const s = Math.max(W / iw, H / ih);
    assert.ok(Math.abs(f.y - (H - ih * s) * 0.4) < 1e-6, `${W}×${H}: y`);
    assert.ok(Math.abs(f.x - (W - iw * s) * 0.5) < 1e-6, `${W}×${H}: x`);
  }
});

test('hui fx: 「新的一回」 turns the page, once, with its seal', () => {
  assert.equal(page.match(/huiTurn\(/g)?.length, 1);
  assert.match(page, /if \(kind === 'chapter'\) huiTurn\(\$\('view'\), [^\n]*, el\);/);
});
