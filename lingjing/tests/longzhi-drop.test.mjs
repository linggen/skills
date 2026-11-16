// 蠪侄 carries `drops: jingjin`, a 卷二 item. While only 卷一 is open (rules/world.mjs ofJuan) it drops nowhere; the entry
// stays because 蠪侄 is fought outside the prologue's duel too, and the creature's `_drops` note says where it will apply
// (the builder, 2026-11-16).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { drop } from '../scripts/rules/arms.mjs';
import { creatureOf } from '../scripts/rules/world.mjs';

const content = loadContent();
const NOW = new Date('2026-11-16T09:00:00+08:00');
const longzhi = creatureOf(content, 'longzhi');

test('蠪侄\'s 精金 is a 卷二 drop: nothing lands from it while 卷一 alone is open', () => {
  assert.equal(longzhi.drops, 'jingjin');
  assert.equal(content.items.items.find((i) => i.id === 'jingjin').juan, 2);
  for (let d = 0; d < 30; d += 1) {
    const now = new Date(NOW.getTime() + d * 864e5);
    const got = drop(content, { ...newState(content, 'zh', now), bag: {} }, longzhi, now);
    assert.ok(got.every((x) => x.id !== 'jingjin'), `day ${d}`);
  }
});

test('the entry stays, with its note: 蠪侄 is met in 徐 and in the 打妖 errand, not only at the prologue gate', () => {
  assert.match(longzhi._drops, /xu-fuli-longzhi/);
  assert.match(longzhi._drops, /places\/xu\.json/);
  const place = content.places['徐'].places.find((p) => p.has?.creature === 'longzhi');
  assert.ok(place, 'a haunt of 蠪侄 in 徐');
  const errand = content.quests.find((q) => q.id === 'xu-fuli-longzhi');
  assert.ok(errand?.need.some((n) => n.kind === 'subdue' && n.creature === 'longzhi'));
});
