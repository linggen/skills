// 小队斗法 (cards.md § 5; Hanli 2026-10-16): a side is a row of members, each
// with its own deck drawn into one shared hand, one 灵力, a card played by its
// owner (cards.json `owner`), a member at 0 退 with its cards gone, 孙二狗's
// 嘲讽, 阿禾's heal and bind; a lone beast is a party of one. And the two verbs
// of a mortal's first hand: 一滚 (dodge) and 回气 (mana), and the 三试 that is
// passed by standing (`trial.survive`). Fixture cards only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, begin, endTurn, foeTurn, guardOf, legal, offers, view } from '../scripts/battle.js';

const CARDS = {
  cub: { id: 'cub', kind: 'minion', name: '小妖', cost: 1, element: 'wood', atk: 1, hp: 2 },
  bolt: { id: 'bolt', kind: 'spell', name: '火弹', cost: 2, element: 'fire', effect: { damage: 3 } },
  vine: { id: 'vine', kind: 'spell', name: '青藤缚', cost: 1, element: 'wood', owner: 'ahe', binds: true, effect: { damage: 2 } },
  mend: { id: 'mend', kind: 'spell', name: '青光', cost: 1, element: 'wood', owner: 'ahe', effect: { heal: 4 } },
  wall: { id: 'wall', kind: 'minion', name: '铁箍板', cost: 2, element: 'earth', owner: 'sun', atk: 0, hp: 5, keywords: ['taunt'] },
  roll: { id: 'roll', kind: 'spell', name: '一滚', cost: 0, element: null, effect: { dodge: 1 } },
  qi: { id: 'qi', kind: 'spell', name: '回气丹', cost: 0, element: null, effect: { mana: 2 } },
  claw: { id: 'claw', kind: 'spell', name: '爪', cost: 1, element: 'metal', effect: { damage: 4 } },
};
const AHE = { id: 'ahe', name: { zh: '阿禾' }, root: 'wood', hp: 0.6, deck: ['vine', 'mend', 'vine'] };
const SUN = { id: 'sun', name: { zh: '孙二狗' }, root: 'earth', hp: 0.8, taunt: true, deck: ['wall', 'wall'] };
const setup = (party = [], foe = {}) => ({
  mode: 'pve', seed: 'party',
  you: { tier: 'qi', step: 0, root: 'fire', deck: Array(10).fill('bolt'), party },
  foe: { tier: 'qi', root: 'metal', deck: Array(12).fill('cub'), ...foe },
});

test('a lone side is a party of one: no allies, the hand of three as before', () => {
  const st = begin(setup(), CARDS);
  assert.deepEqual(st.you.allies, []);
  assert.equal(st.you.hand.length, 3);
  assert.equal(view(st).you.allies, undefined);
});

test('each member brings its own deck into one shared hand: three from the lead, one each beside him', () => {
  const st = begin(setup([AHE, SUN]), CARDS);
  assert.equal(st.you.hand.length, 5);
  assert.ok(st.you.hand.some(id => CARDS[id].owner === 'ahe'));
  assert.ok(st.you.hand.some(id => CARDS[id].owner === 'sun'));
  assert.equal(st.you.allies.length, 2);
  assert.equal(st.you.allies[0].hpMax, Math.round(st.you.hpMax * 0.6));
  const v = view(st);
  assert.deepEqual(v.you.allies.map(a => a.id), ['ahe', 'sun']);
});

test('the draw goes round the row, one 灵力 for all', () => {
  const st = begin(setup([AHE]), CARDS);
  const drawn = () => st.log.filter(e => e.act === 'drew' && e.who === 'you').map(e => e.member ?? 'lead');
  const before = drawn().length;
  endTurn(st); foeTurn(st);
  endTurn(st); foeTurn(st);
  const after = drawn().slice(before);
  assert.deepEqual(after, ['lead', 'ahe'], 'the lead, then 阿禾');
  assert.equal(typeof st.you.mana, 'number');
});

test('孙二狗 stands as 嘲讽: the beast must hit him first while he stands', () => {
  const st = begin(setup([SUN], { deck: Array(12).fill('claw') }), CARDS);
  assert.deepEqual(guardOf(st.you), { kind: 'ally', index: 0 });
  st.whose = 'foe';
  st.foe.board.push({ id: 'cub', name: '小妖', element: 'wood', atk: 3, hp: 2, hpMax: 2, uid: 99, taunt: false, sick: false, struck: false });
  assert.equal(legal(st, { kind: 'attack', index: 0 }, 'foe'), 'taunt', 'not past the guard to the lead');
  assert.equal(legal(st, { kind: 'attack', index: 0, target: { kind: 'ally', index: 0 } }, 'foe'), null);
  const hp = st.you.allies[0].hp;
  act(st, { kind: 'attack', index: 0, target: { kind: 'ally', index: 0 } }, 'foe');
  assert.ok(st.you.allies[0].hp < hp, 'he takes it');
});

test('a member at 0 is 退: their cards leave the hand, their deck stops; the fight goes on', () => {
  const st = begin(setup([AHE]), CARDS);
  st.you.hand.push('vine');
  st.whose = 'foe';
  st.foe.board.push({ id: 'cub', name: '小妖', element: 'metal', atk: 99, hp: 2, hpMax: 2, uid: 99, taunt: false, sick: false, struck: false });
  act(st, { kind: 'attack', index: 0, target: { kind: 'ally', index: 0 } }, 'foe');
  assert.equal(st.you.allies[0].gone, true);
  assert.ok(!st.you.hand.some(id => CARDS[id].owner === 'ahe'), 'her cards are gone from the hand');
  assert.equal(st.outcome, 'open', 'his fight goes on');
  assert.ok(st.log.some(e => e.act === 'ally-withdrew' && e.id === 'ahe'));
});

test("the lead's 退 is the side's: the fight is lost though a member stands", () => {
  const st = begin(setup([SUN], { deck: Array(12).fill('claw') }), CARDS);
  st.you.hp = 1;
  st.whose = 'foe';
  st.foe.hand = ['claw']; st.foe.mana = 5;
  act(st, { kind: 'play', index: 0 }, 'foe');
  assert.equal(st.outcome, 'lost');
});

test("阿禾's heal goes to the most wounded of the row", () => {
  const st = begin(setup([AHE]), CARDS);
  st.you.allies[0].hp = 2;
  st.you.hp = st.you.hpMax - 1;
  st.you.hand = ['mend']; st.you.mana = 5;
  act(st, { kind: 'play', index: 0 });
  assert.equal(st.you.allies[0].hp, 6);
});

test("阿禾's 青藤缚 still holds a sleeper (the 犰狳's 假睡), then the blows go in", () => {
  const FEINT = { turns: 2, lands: 1, pierce: ['metal'], pierce_binds: true };
  const st = begin(setup([AHE], { feint: FEINT, root: 'wood' }), CARDS);
  st.you.hand = ['vine', 'bolt']; st.you.mana = 10;
  act(st, { kind: 'play', index: 0 });
  assert.equal(st.foe.feint.bound, true);
  const hp = st.foe.hp;
  act(st, { kind: 'play', index: 0 });
  assert.ok(hp - st.foe.hp > 1, 'the fire went in whole');
});

test('一滚 turns the next blow at the lead aside; 回气丹 gives 灵力 back, never past the cap', () => {
  const st = begin(setup([], { deck: Array(12).fill('claw') }), CARDS);
  st.you.hand = ['roll', 'qi']; st.you.mana = 1;
  act(st, { kind: 'play', index: 0 });
  assert.equal(st.you.dodge, 1);
  act(st, { kind: 'play', index: 0 });
  assert.equal(st.you.mana, 3);
  const hp = st.you.hp;
  st.whose = 'foe'; st.foe.hand = ['claw']; st.foe.mana = 5;
  act(st, { kind: 'play', index: 0 }, 'foe');
  assert.equal(st.you.hp, hp, 'the claw missed');
  assert.ok(st.log.some(e => e.act === 'dodged'));
});

test('三试 is passed by standing: `trial.survive` N of its turns, and it is won', () => {
  const st = begin(setup([], { trial: { survive: 2 } }), CARDS);
  for (let g = 0; g < 10 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') foeTurn(st); else act(st, { kind: 'end' });
  }
  assert.equal(st.outcome, 'won');
  assert.ok(st.log.some(e => e.act === 'trial-passed' && e.how === 'survive'));
});

test('the page is offered only what its owner may play; a gone member offers nothing', () => {
  const st = begin(setup([AHE]), CARDS);
  st.you.mana = 5;
  st.you.allies[0].gone = true;
  st.you.hand = ['mend'];
  assert.equal(legal(st, { kind: 'play', index: 0 }), 'member-gone');
  assert.ok(!offers(st).some(o => o.ok && o.action.kind === 'play'));
});
