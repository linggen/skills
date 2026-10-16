// The 第一回 playtest's polish round (2026-10-16): nothing on the stage looks live that is not, a stage
// with only things to look at never reads as stuck, the next 回's line fits a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lookHtml } from '../scripts/cards.js';

const read = (f) => fs.readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');
const W = { lookHead: '看', lookAt: '看看{label}' };

test('a choice tapped goes inert in that frame, and stays inert until the page has read what it did', () => {
  const src = read('lingjing.js');
  assert.match(src, /\['\[data-panel-exit\]', \(el\) => \{ if \(el\.matches\(':disabled'\)\) return; inertNow\(el\); run\(/, 'inert before the verb chain gets to it');
  assert.match(src, /function inertNow\(el\) \{\s*el\.classList\.add\('busy'\);[\s\S]*?b\.disabled = true;/);
  const tap = src.slice(src.indexOf('async function panelTap'), src.indexOf('function inertNow'));
  assert.match(tap, /try \{ await refresh\(\); \} finally \{ show\(\{ panelBusy: null \}\); \}/, 'busy until the re-read, not only the write');
  assert.doesNotMatch(tap, /keep\(\{ panelBusy: null, panelNote/, 'no longer cleared before the read');
  assert.match(read('lingjing.css'), /\.paneltap:disabled:not\(\.busy\)[^{]*\{ opacity: \.4;/, 'inert reads inert');
});

test('no way on yet, only things to look at: the chips not yet looked at beckon', () => {
  const scene = { look: [{ id: 'prints', label: '蹄印', found: true, text: '湿的' }, { id: 'stone', label: '石上的痕迹', found: false }] };
  const quiet = lookHtml(scene, null, W);
  assert.doesNotMatch(quiet, /beckon/, 'a way on stands: no cue');
  const html = lookHtml(scene, null, W, { beckon: true });
  assert.match(html, /class="lookchip beckon" data-look-at="stone"/);
  assert.doesNotMatch(html, /class="lookchip found beckon"/, 'one looked at already stays quiet');
  assert.match(read('cards.js'), /lookHtml\(ctx\.look\.scene, ctx\.lookBusy \?\? null, w, \{ beckon: !taps && !playing \}\)/);
  assert.match(read('lingjing.css'), /\.lookchip\.beckon \{ animation: lookBeckon/);
});

test('the 完 card\'s next-回 line stays on one line at a phone\'s width', () => {
  assert.match(read('story.css'), /@container scene \(max-width: 640px\) \{ \.focus \.card\.closecard \.closecoming \{ white-space: nowrap;[^}]*font-size: min\(13px, 3\.1cqi\); \} \}/);
});
