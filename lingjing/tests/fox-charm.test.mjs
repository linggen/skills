// The fox fight (00-fox, fox-bite) is a won fight like any other for the common 符 roll (rules/arms.mjs drop: one win in
// `growth.charm.fight_one_in`, by the day, the beast and the save) — its data notes said "nothing paid" and were wrong
// (the builder, 2026-11-16). It leaves no card, no loot and no 修为 or 灵石; only the roll. The roll itself is not changed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { duel, playTo } from '../scripts/rules.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();

test('a won fox fight rolls the common 符 (about one day in three), and pays nothing else', () => {
  const one = content.rewards.growth.charm.fight_one_in;
  let charms = 0;
  const days = 24;
  for (let d = 0; d < days; d += 1) {
    const now = new Date(2026, 9, 1 + d, 9), ctx = { now, quests: [] };
    const s = playTo(content, newState(content, 'zh', now), '00-fox', { now }).state;
    const begun = duel({ ...s, stamina: 100 }, content, ctx, { id: 'fox-bite' });
    const r = duel(begun.state, content, ctx, { id: 'fox-bite', picks: 'end,end,end' });
    assert.equal(r.result.outcome, 'won', `day ${d}`);
    const got = r.result.dropped ?? [];
    assert.ok(got.every((x) => x.id === 'talisman'), `day ${d}: only the 符 can come: ${JSON.stringify(got)}`);
    assert.ok(!r.result.paid, 'no 修为, no 灵石');
    assert.equal(r.state.progress ?? 0, s.progress ?? 0);
    assert.equal(r.state.wealth, s.wealth);
    assert.deepEqual(r.state.cards, s.cards, 'no card');
    charms += got.length;
  }
  assert.ok(one === 3 && charms >= 2 && charms <= days / 2, `about 1 in ${one}: ${charms} of ${days}`);
});

test('the notes say what happens: no loot, no card, no pay — and the 符 roll applies', () => {
  const fox = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/chapters/00-prologue/scenes/00-fox.json', import.meta.url), 'utf8'));
  const text = [JSON.stringify(fox), JSON.stringify(content.creatures.creatures.find((c) => c.id === 'foe-yinhu')), fs.readFileSync(new URL('../doc/games.md', import.meta.url), 'utf8')].join('\n');
  assert.ok(!/No loot, no card, nothing paid/.test(text), 'the old claim is gone');
  assert.equal((text.match(/common 符 roll/g) ?? []).length >= 2, true, 'the scene and the creature say it');
  assert.ok(!content.creatures.creatures.find((c) => c.id === 'foe-yinhu').loot, 'no loot');
});
