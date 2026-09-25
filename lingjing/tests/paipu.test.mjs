// 牌谱 (redesign-v2 § 五: 牌组就是你这一路的回忆) — every card he gains keeps
// where it came from (`card_from`); the 九鼎录 lists them. A save from before
// is read from what is known: the starter, 银月, a beast that walks with him.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { story } from '../scripts/rules.mjs';
import { cardBook, gainCard, starterOf, winCard } from '../scripts/rules/cards.mjs';
import { luHtml } from '../scripts/lu.js';

const content = loadContent();
const NOW = new Date('2026-09-25T10:00:00');
const ROOTS = [...content.traits.v1];
const player = (extra = {}) => ({ ...newState(content, 'zh', NOW), traits: ROOTS, place: 'sishui', ...extra });

test('an old save is read from what is known: the starter at the root test, the rest 旧日所得', () => {
  const s = player();
  const book = cardBook(content, s);
  const starter = new Set(starterOf(content, ROOTS));
  assert.ok(book.length >= starter.size && starter.size > 0);
  for (const c of book) assert.equal(c.from.how, starter.has(c.id) ? 'starter' : 'old');
});

test('a win keeps the beast and the place; a chance keeps the place; a grant its own how', () => {
  const s = player({ cards: starterOf(content, ROOTS) });
  const beast = content.creatures.creatures.find(c => c.deck);
  const won = winCard(content, s, beast, NOW);
  assert.ok(won, 'a card to win');
  assert.deepEqual(s.card_from[won.id], { how: 'win', creature: beast.id, day: '2026-09-25', place: 'sishui', chapter: s.chapter });
  const chance = winCard(content, s, { id: 'chance:sishui', root: ROOTS[0] }, NOW, 'chance', { how: 'chance' });
  assert.equal(s.card_from[chance.id].how, 'chance');
  const row = cardBook(content, s).find(c => c.id === won.id);
  assert.equal(row.from.creature, beast.name.zh, 'names resolved for the page');
  assert.equal(row.from.place, '泗水岸');
  assert.equal(gainCard(content, s, won.id, { how: 'story' }), null, 'a card held already is not gained twice');
  assert.equal(s.card_from[won.id].how, 'win', 'and keeps where it first came from');
});

test('the book hands the 牌谱 to the page, never to Ling\'s short read; 录 draws where each came from', () => {
  const s = player({ cards: starterOf(content, ROOTS) });
  const beast = content.creatures.creatures.find(c => c.deck);
  const won = winCard(content, s, beast, NOW);
  const full = story(s, content, { now: NOW, quests: [] }).result;
  assert.equal(full.cards.length, s.cards.length);
  assert.equal(story(s, content, { now: NOW, quests: [] }, { short: 'true' }).result.cards, undefined);
  const html = luHtml(full, { lang: 'zh', artBase: '../worlds/jiuding/' });
  assert.match(html, new RegExp(`牌谱 · ${s.cards.length}`));
  assert.match(html, new RegExp(`胜${beast.name.zh}所得 · 于泗水岸`));
  assert.match(html, /测灵根时所得/);
  assert.ok(html.includes(`>${won.name}</b>`));
});
