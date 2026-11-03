// The 体力卡 is gone (Hanli 11-03: 「体力卡删掉」): the test-only card left the game for 2.0 — the item, its price, the four
// shelves, its effect and the 重置冷却 hook — and a save that held one drops it on load (state.mjs fitWorld RETIRED_ITEMS).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent, lint } from '../scripts/content.mjs';
import { RETIRED_ITEMS, fitWorld, migrate, newState } from '../scripts/state.mjs';
import * as events from '../scripts/rules/events.mjs';

const content = loadContent();
const T0 = new Date('2026-11-03T15:00:00');

test('the 体力卡 is nowhere: no item, no price, on no shelf, no effect, no reset hook', () => {
  assert.equal(content.items.items.find(i => i.id === 'tili-ka'), undefined);
  assert.equal(content.balance.prices?.['tili-ka'], undefined);
  const world = new URL('../worlds/', import.meta.url);
  for (const f of fs.readdirSync(world, { recursive: true }).filter(f => f.endsWith('.json') && !f.includes('levels/'))) {
    assert.doesNotMatch(fs.readFileSync(new URL(f, world), 'utf8'), /"tili-ka"/, f);
  }
  assert.ok(!content.items.items.some(i => i.effect?.stamina != null || i.effect?.reset != null), 'no stamina or reset effect');
  assert.equal(events.resetCooldowns, undefined);
  assert.equal(events.onCooldownReset, undefined);
  assert.deepEqual(lint(content), [], 'the content lint stays green');
});

test('a save that held one drops it on load; the rest of the bag is kept', () => {
  const s = { ...newState(content, 'zh', T0), bag: { 'tili-ka': 2, ganliang: 3 } };
  assert.deepEqual(fitWorld(s, content).bag, { ganliang: 3 });
  assert.deepEqual(migrate(s, content).bag, { ganliang: 3 }, 'the load path');
  const clean = { ...s, bag: { ganliang: 3 } };
  assert.equal(fitWorld(clean, content).bag, clean.bag, 'a bag without one is left as it was');
  assert.ok(RETIRED_ITEMS.includes('tili-ka'));
});
