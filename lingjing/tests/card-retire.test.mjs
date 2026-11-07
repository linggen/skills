// No card that doubles a piece of gear (「给武器就不要给牌了吧, 重复有点」 ·
// 「火柴是一把剑, 重复的牌就不用了」).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent, lint } from '../scripts/content.mjs';
import { fitWorld } from '../scripts/state.mjs';
import { resolve } from '../scripts/rules.mjs';
import { spoilsHtml } from '../scripts/battle-card.js';
import { spoilGearHtml } from '../scripts/pouch.js';
import { WORDS } from '../scripts/cards.js';
import { crawlRules } from './crawl.mjs';

const content = loadContent();
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const name = (x) => x?.zh ?? x;

test('09-snow\'s 扔了干净 gives the sword 火柴 and no card; the card 火柴 is retired, the lint green', () => {
  const crawl = crawlRules(content);
  const got = crawl.states.get('00-zhuji/09-snow');
  assert.ok(got, 'the crawl reached 09-snow');
  const s = { ...got.s, stamina: 100, stamina_at: got.now.toISOString() };
  const r = resolve(s, content, { now: got.now, quests: [] }, { exit: 'feed' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.equal(r.state.bag['huochai-jian'], 1, 'the sword in the bag');
  assert.ok(!(r.state.cards ?? []).includes('huochai'), 'no card 火柴');
  assert.ok(!(r.state.cards_new ?? []).includes('huochai'));
  assert.equal(content.cards.cards.find((c) => c.id === 'huochai')?.gear, 'huochai-jian', 'the card is the sword\'s strike now, never handed over');
  assert.deepEqual(lint(content), []);
});

test('worn, the sword deals its strike into the fight deck as the card was (Hanli 11-03, option a); off the belt, not', async () => {
  const { strikeOf } = await import('../scripts/rules/cards.mjs');
  const { stateAt } = await import('../tools/story-fights.mjs');
  const s = stateAt('h10');
  assert.equal(s.wear.weapon, 'huochai-jian');
  assert.equal(strikeOf(content, s), 'huochai');
  assert.ok(!s.cards.includes('huochai'), 'never one of his cards');
  assert.equal(strikeOf(content, { ...s, wear: {} }), null, 'unworn: no strike');
  assert.equal(strikeOf(content, { ...s, wear: { weapon: 'iron-sword' } }), null, 'another sword: none');
});

test('no card doubles a piece of gear: none is named as a weapon, robe, pendant or treasure', () => {
  const gear = content.items.items.filter((i) => ['weapon', 'robe', 'pendant', 'shoes', 'treasure', 'artifact'].includes(i.kind) && !i.effect?.card && !i.effect?.wear);
  for (const c of content.cards.cards.filter((k) => !k.owner && !k.gear && k.from?.every((f) => f.kind !== 'member'))) {
    const twin = gear.find((i) => name(i.name) === name(c.name) && (i.effect?.atk != null || i.effect?.def != null || i.effect?.ward));
    assert.equal(twin, undefined, `card ${c.id} doubles ${twin?.id}`);
  }
});

test('a save that holds 火柴 (or 剑影, renamed onto it) drops it on load, from its cards, deck, 新 and records', () => {
  const s = { cards: ['huochai', 'mucao', 'jianying'], deck: ['huochai', 'mucao'], deck_out: ['huochai'], cards_new: ['huochai'], card_from: { huochai: 'x', mucao: 'y' }, card_stars: { huochai: 1 } };
  const f = fitWorld({ ...fitWorld({}, content), ...s }, content);
  assert.deepEqual(f.cards, ['mucao']);
  assert.deepEqual(f.deck, ['mucao']);
  assert.deepEqual(f.deck_out, []);
  assert.deepEqual(f.cards_new, []);
  assert.deepEqual(f.card_from, { mucao: 'y' });
  assert.deepEqual(f.card_stars, {});
});
