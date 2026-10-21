// 老井 under the 河伯 night's lock (2026-10-21): 01-laojing is a scene of the `hebo` key beat, so no
// shelf is reachable from 01-altar to 01-laojing. The seed reached 01-end at most clocks but stuck on
// 老井 at some: his ten are a seeded draw (cards.mjs autoDeck), a few hands win him bare under 10% a
// day, and the 回春丹 it held were spent on 双龙. The bands are weighed for a player who carries two
// pills (tests/fight-band.test.mjs), so the forward run now does too: it keeps two fights' worth from
// the last shelf on the road (邺城) and carries two through a door it cannot win bare
// (rules/progress.mjs `stock` · `pouch`). The clocks below are the two that stuck, and one that did not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();

test('01-laojing stands inside the 河伯 night\'s lock', () => {
  const beat = (content.chapters['01-ji'].beats ?? []).find(b => b.id === 'hebo');
  assert.ok(beat?.scenes.includes('01-laojing'));
});

for (const clock of ['2026-10-21T14:00:00', '2026-10-05T12:00:00', '2026-10-21T11:40:00']) {
  test(`a forward run reaches 01-end through the lock, 老井 won (${clock})`, () => {
    const now = new Date(clock);
    const out = playTo(content, newState(content, 'zh', now), '01-end', { now });
    assert.equal(out.state.scene, '01-end');
    assert.ok(out.state.done_scenes.includes('01-laojing'), '老井\'s scene is behind him');
    assert.equal(out.state.duels?.['foe-laojing']?.outcome, 'won', '老井 was fought and won');
  });
}
