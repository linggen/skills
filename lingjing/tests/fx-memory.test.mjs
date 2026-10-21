// 银月的记忆 in WebGL (fx-memory.js): the canvas takes over from the card's grey without a jump,
// keeps the card's clock (a redraw never restarts it), and ends on the colour the card already shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEM_FX, inkMatrix, memAt } from '../scripts/fx-memory.js';
import { BLOOM_MS } from '../scripts/memory.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* CSS: grayscale(1) then sepia(a), on one pixel. */
function css([r, g, b], a) {
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const S = [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]];
  return S.map((row) => (1 - a) * L + a * (row[0] + row[1] + row[2]) * L);
}
const apply = (m, [r, g, b]) => [0, 1, 2].map((i) => m[i * 5] * r + m[i * 5 + 1] * g + m[i * 5 + 2] * b + m[i * 5 + 4]);

test('memory fx: the grey ink matches the card’s CSS start (grayscale(1) sepia(.35)), so the canvas takes over without a jump', () => {
  const m = inkMatrix(0.35);
  assert.equal(m.length, 20);
  for (const px of [[1, 0, 0], [0, 1, 0], [0.2, 0.5, 0.9], [0.5, 0.5, 0.5]]) {
    apply(m, px).forEach((v, i) => assert.ok(Math.abs(v - css(px, 0.35)[i]) < 1e-9));
  }
  assert.deepEqual(m.slice(15), [0, 0, 0, 1, 0], 'alpha untouched');
});

test('memory fx: grey a breath, the colour soaks in within the bloom, then the canvas fades onto the card', () => {
  assert.equal(memAt(0).soak, 0);
  assert.equal(memAt(MEM_FX.hold * 1000).soak, 0);
  assert.ok(memAt(2000).soak > 0.3 && memAt(2000).soak < 1);
  assert.equal(memAt(BLOOM_MS).soak, 1, 'whole by the time the card’s own bloom is colour');
  assert.ok((MEM_FX.hold + MEM_FX.soak) * 1000 <= BLOOM_MS);
  assert.equal(memAt(BLOOM_MS).gone, 0);
  assert.equal(memAt(BLOOM_MS + MEM_FX.fade * 1000 + 1).gone, 1);
});

test('memory fx: the page starts the watcher once; the moment follows the card, never inside its markup', () => {
  const page = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.equal(page.match(/watchMemories\(\)/g)?.length, 1);
  const fx = fs.readFileSync(path.join(ROOT, 'scripts/fx-memory.js'), 'utf8');
  assert.match(fx, /--mem-age/);
  assert.match(fx, /rim: \{ color: 0xfff1c8, blend: 'add'/, 'a reward brightens: the rim is light');
});
