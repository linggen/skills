// A worn sword's strike is always in the ten a fight deals, and wearing it moves nothing else
// (cards.mjs fightDeck, 2026-11-04 — Hanli at 灵草谷: 「带了火柴还是遁走了」: with a hand of 22 the
// strike was dealt out by the curve, and dealing again took 金刃 out with it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { fightSetup } from '../scripts/rules.mjs';
import { cardCatalog, deckFor, fightDeck } from '../scripts/rules/cards.mjs';
import { foeOf, NOW, stateAt } from '../tools/story-fights.mjs';

const content = loadContent();
const catalog = cardCatalog(content);
// A 五层 hand of 22 at 灵草谷, as a player who has bought and hunted holds it.
const BIG = ['niangbing', 'tuna', 'yijian', 'zheng', 'jixiao', 'caoren', 'tongling', 'sanhuo', 'mucao', 'jingang', 'tieji', 'zhennu',
  'huoshe', 'huiqi', 'toulang', 'luoshi', 'huodan', 'jinren', 'bingzhui', 'tuqiang', 'mutang', 'yangzhen'];
const wearing = (weapon, cards = BIG) => {
  const s = stateAt('h11');
  return { ...s, cards: [...cards], wear: { ...s.wear, weapon }, bag: { ...s.bag, [weapon]: 1 } };
};

test('worn, 火柴\'s strike is in the ten; the other nine are the ten he would hold with another sword', () => {
  const armed = fightDeck(content, wearing('huochai-jian')), plain = deckFor(content, wearing('qingtong-jian'));
  assert.equal(armed.length, 10);
  assert.ok(armed.includes('huochai'), `no strike in ${armed}`);
  assert.equal(armed.filter((id, i) => id !== plain[i]).length, 1, `${plain} → ${armed}: only one place changed`);
  const out = plain.find((id) => !armed.includes(id));
  // the strike takes the place of the cheapest card, so no big one (金刃, 震怒, 落石) gives way to it
  assert.equal(catalog[out].cost, Math.min(...plain.map((id) => catalog[id].cost ?? 1)), `${out} went out`);
});

test('the fight is dealt the same ten (fightSetup); another sword deals no strike', () => {
  const foe = foeOf({ scene: '09-lingcao/fight' });
  assert.deepEqual(fightSetup(content, wearing('huochai-jian'), foe, NOW).you.deck, fightDeck(content, wearing('huochai-jian')));
  assert.ok(!fightSetup(content, wearing('qingtong-jian'), foe, NOW).you.deck.includes('huochai'));
});

test('every hand the road holds: worn, the strike is dealt — never more than once', () => {
  for (let n = 4; n <= BIG.length; n += 1) {
    const ten = fightDeck(content, wearing('huochai-jian', BIG.slice(0, n)));
    assert.equal(ten.filter((id) => id === 'huochai').length, 1, `${n} cards: ${ten}`);
  }
});

test('a picked ten (结丹 on) keeps his picks when a filled card can give way', () => {
  const s = { ...wearing('huochai-jian'), tier: 'core', step: 1 };
  const picks = deckFor(content, { ...s, deck: [] }).slice(0, 6);
  const ten = fightDeck(content, { ...s, deck: picks });
  assert.ok(ten.includes('huochai'));
  for (const id of picks) assert.ok(ten.includes(id), `his pick ${id} went out: ${ten}`);
});
