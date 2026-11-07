// The 鞋 slot (Hanli 11-07: 「顺风溜鞋子，不能算法衣。装备栏加个鞋子吧」): the slots are the world's (items.json `slots`,
// rules/wear.mjs declareSlots); 顺风溜 is shoes, worn beside a 法衣, its 防 adding to 护体; a save that wore it as the
// 法衣 has it carried into the shoes slot, the 法衣 slot freed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { everyJuan } from './prologue.mjs';
import { migrate, newState } from '../scripts/state.mjs';
import { trade } from '../scripts/rules.mjs';
import { gearBrief } from '../scripts/rules/errands.mjs';
import { gearFight } from '../scripts/rules/cards.mjs';
import { ARM_SLOTS, GEAR_SLOTS } from '../scripts/rules/wear.mjs';
import { wayLine } from '../scripts/wayline.js';

const content = everyJuan(loadContent());
const NOW = new Date('2026-10-05T10:00:00');
const base = { ...newState(content, 'zh', NOW), seed: 'shoes', scene: null, chapter: '02-yan', ended: ['00-prologue', '01-ji'], name: '清玄',
  traits: ['wood'], place: 'pengcheng', tier: 'foundation', step: 0, progress: 0 };
const use = (s, id) => trade(s, content, { now: NOW, quests: [] }, { action: 'use', id, ...{} });

test('the slots are the data\'s: items.json `slots` in order, each with what it carries', () => {
  assert.deepEqual(GEAR_SLOTS, content.items.slots.map(s => s.id));
  assert.deepEqual([...ARM_SLOTS], content.items.slots.map(s => [s.id, s.arms]));
  assert.ok(GEAR_SLOTS.includes('shoes'));
  assert.equal(content.items.items.find(i => i.id === 'shunfeng-liu').kind, 'shoes');
  assert.deepEqual(content.items.items.find(i => i.id === 'shunfeng-liu').effect, { def: 1 }, 'its effect stays');
});

test('顺风溜 goes on the feet, beside a 法衣: both 防 make 护体; the panel names the slot 鞋', () => {
  let s = { ...base, bag: { 'shunfeng-liu': 1, 'grey-robe': 1 }, wear: {} };
  s = use(s, 'grey-robe').state;
  const r = use(s, 'shunfeng-liu');
  assert.equal(r.result.ok, true);
  assert.deepEqual(r.state.wear, { robe: 'grey-robe', shoes: 'shunfeng-liu' }, 'the robe stays on');
  const robeOnly = gearFight(content, { ...r.state, wear: { robe: 'grey-robe' } }).armor;
  assert.ok(gearFight(content, r.state).armor > robeOnly, 'the shoes add to 护体');
  const g = gearBrief(content, r.state);
  const shoes = g.slots.find(x => x.slot === 'shoes');
  assert.equal(shoes.name, '鞋');
  assert.equal(shoes.item.id, 'shunfeng-liu');
  assert.equal(gearBrief(content, { ...r.state, lang: 'en' }).slots.find(x => x.slot === 'shoes').name, 'Shoes');
  // Taken off: the slot is empty, the boots back in the bag.
  const off = trade(r.state, content, { now: NOW, quests: [] }, { action: 'remove', id: 'shunfeng-liu' }).state;
  assert.equal(off.wear.shoes, undefined);
  assert.equal(off.wear.robe, 'grey-robe');
});

test('an old save wearing 顺风溜 as its 法衣: carried into the shoes slot, the 法衣 slot freed; a save that fits is untouched', () => {
  const old = { ...base, bag: { 'shunfeng-liu': 1, 'grey-robe': 1 }, wear: { robe: 'shunfeng-liu', weapon: 'bamboo-sword' } };
  const m = migrate(old, content);
  assert.deepEqual(m.wear, { weapon: 'bamboo-sword', shoes: 'shunfeng-liu' });
  assert.equal(use(m, 'grey-robe').state.wear.robe, 'grey-robe', 'the 法衣 slot takes a robe again');
  assert.deepEqual(migrate(m, content).wear, m.wear, 'carried once');
  const fits = { ...base, bag: { 'grey-robe': 1 }, wear: { robe: 'grey-robe' } };
  assert.equal(migrate(fits, content).wear, fits.wear, 'the same object: nothing to carry');
  // Shoes already on and the old robe slot holding it too: the robe slot is freed, the shoes kept.
  assert.deepEqual(migrate({ ...old, bag: { 'shunfeng-liu': 2 }, wear: { robe: 'shunfeng-liu', shoes: 'shunfeng-liu' } }, content).wear, { shoes: 'shunfeng-liu' });
  // Hers the same.
  assert.deepEqual(migrate({ ...old, wear: { 'yinyue.robe': 'shunfeng-liu' } }, content).wear, { 'yinyue.shoes': 'shunfeng-liu' });
});

test('the way line names the slot 鞋', () => {
  const line = wayLine({ kind: 'wear', slot: 'shoes', does: { def: 1 } }, 'zh');
  assert.match(String(line), /鞋/);
});
