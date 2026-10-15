// 古九's tester (2026-10-15): a new browser opened on a save with many passages owed read ~90 lines of
// 前情 — the catch-up folded every scene of the book into it. It recalls only the 回 it leads into.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { CATCHUP_LINES, tellOf } from '../scripts/rules/tell.mjs';

const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00');
const scenesOf = (ch) => Object.values(content.chapters[ch].scenes).filter((sc) => sc.story && sc.hui);

test('a long catch-up recalls only the 回 the whole passages stand in, never the whole book', () => {
  const all = [...scenesOf('00-prologue'), ...scenesOf('00-waimen')];
  const huis = [...new Set(all.map((sc) => sc.hui))];
  assert.ok(huis.length >= 3, 'several 回 to fold');
  const into = huis[huis.length - 1];
  const ofInto = all.filter((sc) => sc.hui === into);
  assert.ok(ofInto.length >= 3, `${into} has scenes enough`);
  // Every scene before, owed; the last two of the last 回 told whole.
  const owed = [...all.filter((sc) => sc.hui !== into), ...ofInto].map((sc) => `scene/${sc.id}`);
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: ofInto.at(-1).id, tell_owed: owed, told_scenes: [] };
  const { tell } = tellOf(content, s);
  const catchup = tell.find((t) => t.of === 'catchup');
  assert.ok(catchup, 'a catch-up');
  const lines = catchup.text.split('\n');
  const recalled = ofInto.slice(0, -2).filter((sc) => sc.recap?.zh).length;
  assert.ok(lines.length <= recalled, `${lines.length} lines, at most the ${recalled} scenes of ${into} before the whole passages`);
  assert.equal(catchup.hui, into);
});

test('with no scene of that 回 among the older passages, only the last few lines', () => {
  const all = scenesOf('00-prologue');
  const huis = [...new Set(all.map((sc) => sc.hui))];
  const into = huis[huis.length - 1];
  const before = all.filter((sc) => sc.hui !== into);
  const lastTwo = all.filter((sc) => sc.hui === into).slice(0, 2);
  const s = { ...newState(content, 'zh', NOW), tell_owed: [...before, ...lastTwo].map((sc) => `scene/${sc.id}`), told_scenes: [] };
  const catchup = tellOf(content, s).tell.find((t) => t.of === 'catchup');
  assert.ok(catchup);
  assert.ok(catchup.text.split('\n').length <= CATCHUP_LINES);
});
