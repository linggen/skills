// 银月 wears gear like him (Hanli 11-03, 「可以, 都按你说的做」; rules/wear.mjs): her own 法器 · 法衣 · 佩, any
// ordinary weapon, robe or pendant, her own things in the slot they name; what she wears is on her card (rewards.json
// `her_card.gear`, at most +1 攻 / +1 气血 a slot) and in the fight; one copy is worn in one place; a v15 save's one slot carries to the new three.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { everyJuan } from './prologue.mjs';
import { migrate, newState, STATE_VERSION } from '../scripts/state.mjs';
import { trade, VERBS } from '../scripts/rules.mjs';
import { fightSetup } from '../scripts/rules/cards.mjs';
import { herCard, herLifts } from '../scripts/rules/companion.mjs';
import { slotsUsed } from '../scripts/rules/pouch.mjs';
import { begin, minionLands } from '../scripts/battle.js';

const content = everyJuan(loadContent());
const NOW = new Date('2026-10-05T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const base = { ...newState(content, 'zh', NOW), seed: 'her-gear', scene: null, chapter: '02-yan', ended: ['00-prologue', '01-ji'], name: '清玄',
  traits: ['wood', 'water'], place: 'pengcheng', wealth: 5000, tier: 'foundation', step: 0, progress: 0, companion: { joined: '2026-09-20', awake: true } };
const at = (bag, more = {}) => ({ ...base, bag, ...more });
const use = (s, id, more = {}) => trade(s, content, ctx(), { action: 'use', id, ...more });
const realm = content.rewards.her_card.realm.foundation;

test('her three slots: an ordinary arm goes on her (`on: her`), hers in the slot it names; worn on her, no slot of the pouch', () => {
  let s = at({ 'iron-sword': 1, 'heyu-ao': 1, 'anhe-yu': 1, 'qi-silk': 1, 'moon-bell': 1, 'qi-pill': 1 });
  for (const id of ['iron-sword', 'heyu-ao', 'anhe-yu']) {
    const r = use(s, id, { on: 'her' });
    assert.equal(r.result.ok, true, id);
    assert.equal(r.result.on, 'her');
    s = r.state;
  }
  assert.deepEqual(s.wear, { 'yinyue.weapon': 'iron-sword', 'yinyue.robe': 'heyu-ao', 'yinyue.pendant': 'anhe-yu' });
  assert.equal(slotsUsed(content, s), 2, 'what she wears takes no slot: the silk and the pill do (her bell is free)');
  // Her own things: 银月铃 a 佩, 齐纨 a 法衣 (items.json `slot`), on her with or without `on`.
  const bell = use(s, 'moon-bell').state, silk = use(s, 'qi-silk').state;
  assert.equal(bell.wear['yinyue.pendant'], 'moon-bell', 'the bell takes her 佩 in place of the jade');
  assert.equal(silk.wear['yinyue.robe'], 'qi-silk');
  assert.equal(use(s, 'qi-silk', { on: 'you' }).state.wear.robe, undefined, 'hers never goes on him');
  // Not walking with him yet: no one to give it to.
  assert.equal(use(at({ 'iron-sword': 1 }, { companion: null }), 'iron-sword', { on: 'her' }).result.refused, 'no-companion');
  assert.equal(use(s, 'qi-pill', { on: 'her' }).result.refused, 'not-wearable');
  // 卸下 per slot: hers with `on: her`.
  const off = trade(s, content, ctx(), { action: 'remove', id: 'heyu-ao', on: 'her' });
  assert.deepEqual([off.result.ok, off.result.on, off.result.slot, off.state.wear['yinyue.robe']], [true, 'her', 'robe', undefined]);
  assert.equal(trade(s, content, ctx(), { action: 'remove', id: 'heyu-ao' }).result.refused, 'not-worn', 'his 卸下 is his slots');
});

test('never two places: one copy on her is not on him (worn-elsewhere); two held, both worn; one sold, hers comes off', () => {
  const one = use(at({ 'iron-sword': 1 }), 'iron-sword', { on: 'her' }).state;
  const r = use(one, 'iron-sword');
  assert.equal(r.result.refused, 'worn-elsewhere');
  assert.equal(r.result.on, 'her');
  assert.equal(r.result.say, '这件已在她身上，先卸下。');
  const mine = use(at({ 'iron-sword': 1 }), 'iron-sword').state;
  assert.equal(use(mine, 'iron-sword', { on: 'her' }).result.refused, 'worn-elsewhere');
  const two = use(use(at({ 'iron-sword': 2 }), 'iron-sword').state, 'iron-sword', { on: 'her' }).state;
  assert.deepEqual(two.wear, { weapon: 'iron-sword', 'yinyue.weapon': 'iron-sword' });
  assert.equal(slotsUsed(content, two), 0, 'both worn: no slot (9fb2027d counts every wear slot)');
  const sold = trade(two, content, ctx(), { action: 'sell', id: 'iron-sword' });
  assert.equal(sold.result.ok, true);
  assert.deepEqual(sold.state.wear, { weapon: 'iron-sword' }, 'fewer held than worn: hers comes off first');
  // The gear panel offers only what lands: one copy on her — no 戴上 on him.
  const g = VERBS.gear(one, content, ctx()).result.gear, sword = g.bag.find(i => i.id === 'iron-sword');
  assert.equal(sword.wear_on, undefined);
  assert.deepEqual(sword.worn_on, [{ on: 'her', slot: 'weapon' }]);
  assert.deepEqual(VERBS.gear(at({ 'iron-sword': 1 }), content, ctx()).result.gear.bag.find(i => i.id === 'iron-sword').wear_on,
    [{ on: 'you', slot: 'weapon' }, { on: 'her', slot: 'weapon' }]);
});

test('on her card and in the fight: 器攻 2–3 → 攻 +1, a 法衣 → 气血 +1, 抗 → her blows of that element land lighter', () => {
  const s = [['iron-sword'], ['heyu-ao'], ['anhe-yu'], ['qi-silk']].reduce((st, [id]) => use(st, id, { on: 'her' }).state,
    at({ 'iron-sword': 1, 'heyu-ao': 1, 'anhe-yu': 1, 'qi-silk': 1 }));
  // 齐纨 took the 法衣 from 合窳皮袄: +1 气血 (its own lift); 铁剑 3 × 0.34 → +1 攻; 暗河玉 抗土 2 水 2 (rewards.json her_card.gear).
  assert.equal(s.wear['yinyue.robe'], 'qi-silk');
  const card = herCard(content, s), row = content.cards.cards.find(c => c.id === 'yinyue');
  assert.deepEqual([card.atk, card.hp, card.ward], [row.atk + realm.atk + 1, row.hp + realm.hp + 1, { earth: 2, water: 2 }]);
  const robed = use(use(s, 'heyu-ao', { on: 'her' }).state, 'iron-sword', { on: 'her' }).state;
  assert.equal(herCard(content, robed).hp, row.hp + realm.hp + 1, '合窳皮袄 防 2 × 0.5 → 气血 +1');
  assert.deepEqual(herLifts(content, s).yinyue, { atk: realm.atk + 1, hp: realm.hp + 1, ward: { earth: 2, water: 2 } });
  // The fight's door carries it (cards.mjs fightSetup `lifts`), and the battle lands it.
  const jingwei = content.creatures.creatures.find(c => c.id === 'jingwei');
  const setup = fightSetup(content, s, jingwei, NOW);
  assert.deepEqual(setup.you.lifts?.yinyue, herLifts(content, s).yinyue);
  const st = begin(setup, Object.fromEntries(content.cards.cards.map(c => [c.id, c])));
  assert.ok(st, 'a fight begins on these numbers');
  const side = { lifts: setup.you.lifts }, her = { id: 'yinyue' };
  assert.equal(minionLands(side, her, 5, 'earth'), 3);
  assert.equal(minionLands(side, her, 2, 'water'), 1, 'at least 1 lands');
  assert.equal(minionLands(side, her, 5, 'fire'), 5);
  assert.equal(minionLands({}, her, 5, 'earth'), 5);
  // Her old bell, worn, lifts nothing (no `lift`): her card as printed + realm.
  const belled = use(at({ 'moon-bell': 1 }), 'moon-bell').state;
  assert.deepEqual([herCard(content, belled).atk, herCard(content, belled).hp], [row.atk + realm.atk, row.hp + realm.hp]);
});

test('a v15 save: her one slot moves to the slot her thing goes in — the bell a 佩, 齐纨 a 法衣 — never dropped', () => {
  const v15 = (wear, bag) => ({ ...at(bag), version: 15, wear });
  const bell = migrate(v15({ yinyue: 'moon-bell', weapon: 'iron-sword' }, { 'moon-bell': 1, 'iron-sword': 1 }), content);
  assert.equal(bell.version, STATE_VERSION);
  assert.equal(STATE_VERSION, 17); // v17 (2026-11-04): read_whole, the 年 pools read through their boards
  assert.deepEqual(bell.wear, { weapon: 'iron-sword', 'yinyue.pendant': 'moon-bell' });
  assert.equal(bell.her_slots, undefined, 'the mark is carried and gone');
  assert.deepEqual(migrate(v15({ yinyue: 'qi-silk' }, { 'qi-silk': 1 }), content).wear, { 'yinyue.robe': 'qi-silk' });
  assert.deepEqual(migrate(v15({ yinyue: 'yinyue-lingdang' }, { 'yinyue-lingdang': 1 }), content).wear, { 'yinyue.pendant': 'yinyue-lingdang' });
  assert.deepEqual(migrate(v15({ robe: 'grey-robe' }, { 'grey-robe': 1 }), content).wear, { robe: 'grey-robe' }, 'nothing of hers: as it was');
  // An older bundle writing her one slot on a v16 save (the phone before its rebuild): carried on the next load too.
  assert.deepEqual(migrate({ ...at({ 'moon-bell': 1 }), version: 16, wear: { yinyue: 'moon-bell' } }, content).wear, { 'yinyue.pendant': 'moon-bell' });
  // Once carried, carried: a v16 save meets the world again unchanged.
  assert.deepEqual(migrate(bell, content).wear, bell.wear);
});

test('the panel: her three slots, 戴上 · 法器 and 给银月 · 法器 side by side, 卸下 per slot — zh and en', async () => {
  const { WORDS } = await import('../scripts/cards.js');
  const { pouchHtml } = await import('../scripts/pouch.js');
  const s = use(at({ 'iron-sword': 1, 'bamboo-sword': 1 }), 'iron-sword', { on: 'her' }).state;
  for (const lang of ['zh', 'en']) {
    const zh = lang === 'zh';
    const gear = VERBS.gear({ ...s, lang }, content, ctx()).result.gear;
    assert.deepEqual(gear.her.slots.map(x => [x.slot, x.item?.id ?? null]), [['weapon', 'iron-sword'], ['robe', null], ['pendant', null], ['shoes', null]]);
    const c = { look: { lang, words: content.dictionary.words?.[lang] ?? {} }, gear, lang, words: WORDS[lang] };
    const h = pouchHtml(c, { sel: 'bamboo-sword' });
    // One named row a person (Hanli 11-03): hers is headed 银月, her cells say only the slot.
    const herRow = h.slice(h.indexOf(zh ? '<div class="pwhoname">银月</div>' : '<div class="pwhoname">Yinyue</div>'));
    assert.ok(herRow.length < h.length, 'her row, named');
    assert.match(herRow, zh ? /法器<\/span><b data-pouch-item="iron-sword"/ : /Weapon<\/span><b data-pouch-item="iron-sword"/);
    assert.match(h, /data-remove="iron-sword" data-on="her" data-slot="weapon"/);
    assert.match(herRow, zh ? /法衣<\/span><span class="dim">—/ : /Robe<\/span><span class="dim">—/);
    assert.match(h, zh ? /data-wear="bamboo-sword">戴上 · 法器</ : /data-wear="bamboo-sword">Wear · Weapon</);
    assert.match(h, zh ? /data-wear="bamboo-sword" data-on="her">给银月 · 法器</ : /data-wear="bamboo-sword" data-on="her">Give Yinyue · Weapon</);
    const sword = pouchHtml(c, { sel: 'iron-sword' });
    const detail = sword.slice(sword.indexOf('class="pdetail'));
    assert.doesNotMatch(detail, /data-wear="iron-sword"/, 'one copy, on her: no 戴上 anywhere');
    assert.match(detail, zh ? /data-on="her" data-slot="weapon">从银月身上卸下</ : /data-on="her" data-slot="weapon">Take it off Yinyue</);
    assert.match(sword, zh ? /银月的牌 \d+\/\d+/ : /Yinyue(?:'|&#39;)s card \d+\/\d+/);
    assert.doesNotMatch(h + sword, /undefined|\{[a-z]+\}|\[object/);
  }
});
