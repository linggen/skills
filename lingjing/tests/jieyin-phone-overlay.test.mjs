import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clampDock, foldDock } from '../scripts/games/jieyin/helper.js';

test('drag stays within the usable board, including an oversized dock', () => {
  const box = { left: 10, top: 30, right: 310, bottom: 500 };
  assert.deepEqual(clampDock({ x: -5, y: 800 }, box, { width: 100, height: 80 }), { x: 10, y: 420 });
  assert.deepEqual(clampDock({ x: 200, y: 90 }, box, { width: 100, height: 80 }), { x: 200, y: 90 });
  assert.deepEqual(clampDock({ x: 500, y: 500 }, box, { width: 400, height: 600 }), { x: 10, y: 30 });
});

test('fold toggles without affecting camera state', () => {
  assert.equal(foldDock(false), true);
  assert.equal(foldDock(foldDock(false)), false);
});

test('phone dock overlays the board rather than occupying its layout', () => {
  const css = readFileSync(new URL('../scripts/games/jieyin/helper.css', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../scripts/games/jieyin/helper.js', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 699px\)[\s\S]*?\.jyh-dock:not\(\[data-side\]\)[\s\S]*?position: absolute/);
  assert.match(js, /const s = phone \? null : sideOf\(host, doc\)/);
  assert.match(css, /is-folded[^\n]*\n[^\n]*\.jyh-video/);
  assert.doesNotMatch(css.slice(css.lastIndexOf('@media (max-width: 699px)')), /(?:gshell-stage|shouqiang-stage|sl-stage)\s*\{[^}]*height\s*:/);
});
