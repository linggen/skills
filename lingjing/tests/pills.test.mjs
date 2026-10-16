// 丹囊 (Hanli 2026-10-16: 灵石 buys pills): up to three pills from the bag into a fight, each a free
// action, one a turn — 回春丹 气血 to the member chosen, 回气丹 灵力 now; a pill taken leaves the bag;
// the pick is remembered; a beast never has one; prices live in balance.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actionOf, begin, legal, offers, tokenOf, view } from '../scripts/battle.js';
import { loadContent, lint } from '../scripts/content.mjs';
import { fightSetup, pouchFor } from '../scripts/rules/cards.mjs';
import { duel, trade } from '../scripts/rules.mjs';
import { fitWorld, newState } from '../scripts/state.mjs';
import { creatureOf } from '../scripts/rules/world.mjs';

const CARDS = { bolt: { id: 'bolt', kind: 'spell', name: '火弹', cost: 2, element: 'fire', effect: { damage: 3 } } };
const setup = (pouch, party = []) => ({
  mode: 'pve', seed: 'pills',
  you: { tier: 'qi', step: 0, root: 'fire', deck: Array(10).fill('bolt'), pouch, party },
  foe: { tier: 'qi', root: 'metal', deck: Array(12).fill('bolt') },
});
const AHE = { id: 'ahe', root: 'wood', hp: 0.4, deck: ['bolt'] };

test('a pill is a free action, one a turn: 回春丹 to the member chosen, 回气丹 灵力 now (never past the cap)', () => {
  const st = begin(setup([{ id: 'mend-pill', heal: 6 }, { id: 'huiqi-pill', mana: 2 }, { id: 'mend-pill', heal: 6 }], [AHE]), CARDS);
  st.you.hp = 5; st.you.allies[0].hp = 2;
  const mana = st.you.mana;
  assert.equal(legal(st, { kind: 'pill', index: 0, target: { kind: 'ally', index: 0 } }), null);
  act(st, { kind: 'pill', index: 0, target: { kind: 'ally', index: 0 } });
  assert.equal(st.you.allies[0].hp, 8, 'to 阿禾');
  assert.equal(st.you.mana, mana, 'no 灵力 spent');
  assert.equal(legal(st, { kind: 'pill', index: 0 }), 'pill-used', 'one a turn');
  st.you.pillUsed = false; st.you.mana = st.you.manaCap - 1;
  act(st, { kind: 'pill', index: 0 });
  assert.equal(st.you.mana, st.you.manaCap, 'capped');
  assert.equal(legal(st, { kind: 'pill', index: 0, target: { kind: 'ally', index: 0 } }), 'pill-used');
  st.you.pillUsed = false;
  act(st, { kind: 'pill', index: 0 });
  assert.equal(st.you.hp, 11, 'to himself when no one is chosen');
  assert.equal(view(st).you.pouch.length, 0);
  assert.equal(st.log.filter(e => e.act === 'pill').length, 3);
});

test('the wire: pill:0 and pill:0@a1 go and come back the same; offers list every pill and its places', () => {
  for (const t of ['pill:0', 'pill:2@a1']) assert.equal(tokenOf(actionOf(t)), t);
  const st = begin(setup([{ id: 'mend-pill', heal: 6 }, { id: 'huiqi-pill', mana: 2 }], [AHE]), CARDS);
  const pills = offers(st).filter(o => o.action.kind === 'pill');
  assert.equal(pills.length, 3, 'the heal at him and at 阿禾, the 回气丹 at him');
  assert.ok(st.foe.pouch.length === 0, 'a beast never has a pouch');
});

const content = loadContent();
const NOW = new Date('2026-10-16T10:00:00Z');

test('prices are one source (balance.json): 回春丹 15, 回气丹 10, folded onto the items; the lint holds', () => {
  const item = id => content.items.items.find(i => i.id === id);
  assert.equal(item('mend-pill').buy, content.balance.prices['mend-pill'].buy);
  assert.equal(item('mend-pill').buy, 15);
  assert.equal(item('huiqi-pill').buy, 10);
  assert.deepEqual(lint(content).filter(x => /price|fight effect/.test(x)), []);
});

test('the door carries his pick as the bag holds it; a pill taken is gone from the bag; the pick is remembered', () => {
  const s0 = { ...newState(content, 'zh', NOW), traits: ['metal', 'wood', 'water', 'fire', 'earth'], cards: ['niangbing', 'yijian', 'tuna', 'mucao'], bag: { 'mend-pill': 1, 'huiqi-pill': 3 }, pill_pick: ['mend-pill', 'mend-pill', 'huiqi-pill', 'huiqi-pill'] };
  assert.deepEqual(pouchFor(content, s0).map(p => p.id), ['mend-pill', 'huiqi-pill', 'huiqi-pill'], 'one 回春丹 held, three at most');
  const set = fightSetup(content, s0, creatureOf(content, 'yezhu'), NOW);
  assert.deepEqual(set.you.pouch, [{ id: 'mend-pill', heal: 10 }, { id: 'huiqi-pill', mana: 3 }, { id: 'huiqi-pill', mana: 3 }]);
});

test('bought at the stall, carried in, one eaten: 灵石 and the bag both drop', () => {
  const c = { now: NOW, quests: [] };
  let s = { ...fitWorld({ ...newState(content, 'zh', NOW), traits: ['metal', 'wood', 'water', 'fire', 'earth'], chapter: '01-ji', scene: null, place: 'fangshi', wealth: 100, cards: ['niangbing', 'yijian', 'tuna', 'mucao', 'huodan', 'jinren'], ended: ['00-prologue', '00-waimen', '00-zhuji'] }, content), stamina: 100 };
  for (const id of ['mend-pill', 'huiqi-pill']) { const r = trade(s, content, c, { action: 'buy', id }); assert.equal(r.result.ok, true, JSON.stringify(r.result)); s = r.state; }
  assert.equal(s.wealth, 100 - 15 - 10);
  assert.deepEqual([s.bag['mend-pill'], s.bag['huiqi-pill']], [1, 1]);
  // a beast at the stall's road: any haunt will do — the door carries the two
  s = { ...s, place: 'fuli' };
  const door = duel(s, content, c, { id: 'haunt:longzhi', pills: 'mend-pill,huiqi-pill' });
  assert.equal(door.result.ok, true, JSON.stringify(door.result));
  assert.deepEqual(door.state.pill_pick, ['mend-pill', 'huiqi-pill']);
  assert.deepEqual(door.result.duel.setup.you.pouch.map(p => p.id), ['mend-pill', 'huiqi-pill']);
  const out = duel(door.state, content, c, { id: 'haunt:longzhi', picks: 'pill:1,end,end,end,end,end,end,end,end,end,end,end,end,end,end,end' });
  assert.equal(out.result.ok, true, JSON.stringify(out.result).slice(0, 300));
  assert.equal(out.state.bag['huiqi-pill'] ?? 0, 0, 'the 回气丹 eaten is gone');
  assert.equal(out.state.bag['mend-pill'], 1, 'the 回春丹 not eaten stays');
});
