// A breakthrough is told after its passage (the builder, 2026-11-12, at 筑基 in 第八回: the passage 「筑基天象」 was on page
// 2 of 22 and the top bar already read 「筑基 · 小成」 with the new 修为, the chat already had `[scene] breakthrough won 95%`
// and 「小满筑基成了。」). The rules and the save settle at once; only what the page SHOWS and TELLS waits: the header's bar
// (stage.mjs barHeld) and the report to Ling (queue.js tellMay) — both until the realm's seal goes up.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { barHeld, barOf } from '../scripts/stage.mjs';
import { tellMay } from '../scripts/queue.js';

const before = { tier: { id: 'qi9', name: '练气九层圆满', bar: true }, progress: 910, next: 910 };
const after = { name: '小满', world: { id: 'jiuding' }, tier: { id: 'zj1', name: '筑基 · 小成', duan: { at: 1 } }, progress: 56, next: 1170 };

test('while the seal is owed the header reads the bar as it stood before the throw', () => {
  const held = barHeld(after, before);
  const bar = barOf(held);
  assert.equal(bar.tier.name, '练气九层圆满');
  assert.equal(bar.progress, 910);
  assert.equal(bar.next, 910);
  assert.equal(bar.name, '小满', 'who he is does not change');
  assert.equal(held.world, after.world, 'the rest of the look is the look');
  assert.equal(after.progress, 56, 'the look itself is not rewritten');
});

test('no hold, no look: the very look comes back (the header redraws only when something changed)', () => {
  assert.equal(barHeld(after, null), after);
  assert.equal(barHeld(null, before), null);
  const bar = barOf(barHeld(after, null));
  assert.equal(bar.tier.name, '筑基 · 小成');
  assert.equal(bar.progress, 56);
});

test('a line beside the book has its own bar and no seal: nothing is held there', () => {
  const side = { ...after, scene: { line: 'jin' }, lines: { jin: { hero: '沈芒', tier: { id: 'x1', name: '新生一层' }, progress: 3, next: 20 } } };
  assert.equal(barHeld(side, before), side);
  assert.equal(barOf(barHeld(side, before)).name, '沈芒');
});

test('the report waits for the book, the seal and the set piece; a throw with no passage is due at once', () => {
  assert.equal(tellMay({ ahead: true }), false, 'the passage is owed, drawn or on page 2 of 22');
  assert.equal(tellMay({ seal: true }), false, 'the passage is told, the realm\'s seal still on its way (after the set piece)');
  assert.equal(tellMay({ piece: true }), false, 'a set piece playing is still the telling');
  assert.equal(tellMay({ ahead: true, seal: true, piece: true }), false);
  assert.equal(tellMay({}), true, 'skipped, left, or never played: due');
});

// The wiring, read off the page (the page cannot load here): one hold for the bar, one list for the report.
const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
const fn = (name) => page.slice(page.indexOf(name), page.indexOf(name) + 1800);

test('the page holds the bar from the rise and lets it go with the seal', () => {
  assert.match(page, /const headLook = \(\) => barHeld\(headLookOf\(\), barHold\);/, 'the strip and the header cards read the held look');
  assert.match(page, /holdBar\(prevBar\);\s*feat\('rise'/, 'the hold is taken from the bar a Look ago, before the seal is owed');
  assert.match(page, /featNow\(\.\.\.latest\); releaseBar\(\); return;/, 'the seal goes up and the bar changes with it');
});

test('the throw holds the bar before the Look, since the next scene may be on another line (筑基 → 今), where no rise is seen', () => {
  const throwTap = fn('async function throwTap');
  assert.match(throwTap, /const was = barOf\(look\);\s*const r = await write\('resolve'/, 'the bar as it stood, taken before the throw');
  assert.match(throwTap, /if \(b\?\.success && !was\.line\) holdBar\(\{ tier: was\.tier, progress: was\.progress, next: was\.next \}\);\s*const fell/, 'held before refresh() draws the new Look');
  assert.match(throwTap, /if \(b\.success\) releaseWhenTold\(\);/);
  const told = page.slice(page.indexOf('const exitTold'), page.indexOf('const exitTold') + 900);
  assert.match(told, /leadsIn\(readingHere\(\), look\?\.scene\?\.id, lastLook\(\)\?\.scene\?\.id\)/, 'the exit passage is told while the box leads into this scene from the last (the header\'s own rule)');
  assert.match(told, /tellMay\(\{ ahead: exitTold\(\), seal: riseWaits, piece: Boolean\(pieceOn\) \}\)/);
});

test('the throw tells Ling through the owed list, not at once; skip, leave and reload all send it once', () => {
  const throwTap = fn('async function throwTap');
  assert.doesNotMatch(throwTap.slice(0, throwTap.indexOf('/* The throw\'s own passage')), /await report\(`\[scene\] breakthrough/, 'no report at the throw');
  assert.match(throwTap, /tellAfter\(`\[scene\] breakthrough \$\{b\.success \? 'won' : 'failed'\} \$\{b\.chance\}%`\);/);
  const flush = fn('function flushTells');
  assert.match(flush, /if \(tellsRun\) return;\s*tellsRun = true;/, 'flagged before it starts: a run with nothing owed ends inside the call (a promise kept in the flag stayed set for ever — seen live)');
  assert.match(flush, /k < 2400 && !toldOver\(\)/, 'the same wait as the bar, and the same ten minutes the moments wait');
  assert.match(flush, /owedTells\.splice\(0\);\s*mirrorOwed\(\);\s*for \(const t of due\) await report\(t\);/, 'taken off the list (and the storage) before it is sent: never twice');
  assert.match(page, /recapWhenSettled\(greeted\);\s*\/\/ A result told after[^\n]*\n\s*flushTells\(\);/, 'a reloaded page sends what the closed one still owed');
  assert.match(page, /const OWED_KEY = `lingjing\.owed\.\$\{SCRATCH \|\| 'main'\}`;/, 'kept per save, a scratch save never reaches the main one');
});
