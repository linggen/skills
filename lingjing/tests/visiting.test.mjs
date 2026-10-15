// 货郎上山 (Hanli, 2026-10-15: 「按A做, 货郎上山摆摊」). While an 外门 disciple may not go down
// (观内), the 坊市 is shut to him — so a pedlar comes up and sets up at the 演武场 for a day,
// every third day (places xu.json yanwu `has.visitor`, rules/visiting.mjs). He sells a small
// shelf at the catalog's prices, buys herbs and hides back below 钱掌柜's, plays no 押宝, and
// stands only while the walled map holds the player.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, trade, VERBS } from '../scripts/rules.mjs';
import { placeOf } from '../scripts/rules/world.mjs';
import { visitorGoods } from '../scripts/rules/visiting.mjs';
import { WORDS, bookPopHtml, cardHtml } from '../scripts/cards.js';
import { plateHtml } from '../scripts/plate.js';
import { TO_OPEN, walk } from './prologue.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const content = loadContent();
const START = new Date('2026-09-29T09:00:00');
// Every third local day from the data's offset: 10-16 is his, 10-15 one day before, 10-17 two after.
const HIS = new Date('2026-10-16T10:00:00'), EVE = new Date('2026-10-15T10:00:00'), AFTER = new Date('2026-10-17T10:00:00');
const VISITOR = placeOf(content, 'yanwu').has.visitor;
const ctx = now => ({ now, quests: [] });
/* An 外门 disciple standing at a place of the 观, rested, with stones to spend. */
const waimen = (place, now, extra = {}) => ({
  ...walk(newState(content, 'zh', START), TO_OPEN, content, START), place, wealth: 500, stamina: 100, stamina_at: now.toISOString(), ...extra,
});
const ids = (s, now) => look(s, content, ctx(now)).place.shelf.map(i => i.id);

test('the schedule: every third day, said as 「货郎今日上山 · 演武场」 or 「货郎 · n 日后上山」', () => {
  assert.equal(waimen('waimen', HIS).chapter, '00-waimen');
  const on = look(waimen('waimen', HIS), content, ctx(HIS)).visitors;
  assert.deepEqual(on, [{ place: { id: 'yanwu', name: '沉鼎观 · 演武场' }, today: true, say: '货郎今日上山 · 演武场' }]);
  assert.equal(look(waimen('waimen', EVE), content, ctx(EVE)).visitors[0].say, '货郎 · 1 日后上山');
  assert.equal(look(waimen('waimen', AFTER), content, ctx(AFTER)).visitors[0].in, 2);
  assert.equal(look(waimen('waimen', new Date('2026-10-19T08:00:00')), content, ctx(new Date('2026-10-19T08:00:00'))).visitors[0].today, true, 'three days on, again');
  const en = look({ ...waimen('waimen', HIS), lang: 'en' }, content, ctx(HIS)).visitors[0].say;
  assert.equal(en, 'The pedlar is up today · the training ground');
});

test('on his day the 演武场 has his shelf under his own name; on others nothing stands there', () => {
  const l = look(waimen('yanwu', HIS), content, ctx(HIS)).place;
  assert.deepEqual(l.shop.name, '货郎的担子');
  assert.equal(l.has.shop, true);
  assert.match(l.line, /摊钱/, 'his own line: he paid the 观 its 摊钱 (古六\'s precedent)');
  const shelf = l.shelf.map(i => i.id);
  for (const id of ['mend-pill', 'qi-pill', 'ganliang', 'straw-cloak']) assert.ok(shelf.includes(id), id);
  assert.equal(shelf.length, VISITOR.goods.length + 1, 'and one odd thing');
  assert.ok(VISITOR.odd.includes(shelf.at(-1)));
  assert.notDeepEqual(visitorGoods(VISITOR, HIS).at(-1), visitorGoods(VISITOR, new Date('2026-10-19T08:00:00')).at(-1), 'the odd thing turns with the visit');
  assert.equal(l.shelf.find(i => i.id === 'qi-pill').buy, 80, '聚气丹 at the catalog\'s price');
  assert.ok(!(placeOf(content, 'yanwu').has.games ?? []).length, 'no 押宝 inside the 观');
  // Off his day: no shop, no shelf, the place's own line.
  const off = look(waimen('yanwu', AFTER), content, ctx(AFTER)).place;
  assert.deepEqual(off.shelf, []);
  assert.equal(off.has.shop, false);
  assert.equal(off.shop, undefined);
  assert.match(off.line, /五行台/);
});

test('buy and sell at his pole: catalog prices to buy, herbs and hides bought back below 钱掌柜', () => {
  const s = waimen('yanwu', HIS, { bag: { 'deer-hide': 1, 'qi-pill': 1 } });
  const bought = trade(s, content, ctx(HIS), { action: 'buy', id: 'qi-pill' });
  assert.equal(bought.result.ok, true, JSON.stringify(bought.result));
  assert.equal(bought.state.wealth, 420);
  assert.equal(bought.state.bag['qi-pill'], 2);
  const sold = trade(s, content, ctx(HIS), { action: 'sell', id: 'deer-hide' });
  assert.equal(sold.result.ok, true, JSON.stringify(sold.result));
  assert.equal(sold.result.paid.wealth, 12, '鹿皮: 20 at 钱掌柜, 12 here');
  assert.equal(sold.state.wealth, 512);
  const pill = trade(s, content, ctx(HIS), { action: 'sell', id: 'qi-pill' });
  assert.equal(pill.result.refused, 'not-bought-here');
  assert.match(pill.result.say, /药材皮货我收/);
  // The bag's 卖 quotes his price, and only for what he buys.
  const gear = VERBS.gear(s, content, ctx(HIS)).result.gear;
  assert.equal(gear.market, true);
  assert.equal(gear.bag.find(i => i.id === 'deer-hide').sell, 12);
  assert.equal(gear.bag.find(i => i.id === 'qi-pill').sell, null);
  assert.equal(look(s, content, ctx(HIS)).place.shelf.find(i => i.id === 'qi-pill').sell, null, 'his shelf offers no 卖 for a pill');
  // 钱掌柜 below pays the catalog's price, as before.
  const below = { ...s, chapter: '01-ji', ended: ['00-prologue', '00-waimen', '00-zhuji'], place: 'fangshi' };
  assert.equal(trade(below, content, ctx(HIS), { action: 'sell', id: 'deer-hide' }).result.paid.wealth, 20);
});

test('off his day neither buy nor sell lands at the 演武场, and the refusal says when he comes', () => {
  const s = waimen('yanwu', AFTER, { bag: { 'deer-hide': 1 } });
  for (const action of ['buy', 'sell']) {
    const r = trade(s, content, ctx(AFTER), { action, id: action === 'buy' ? 'qi-pill' : 'deer-hide' });
    assert.equal(r.result.refused, 'no-market', action);
    assert.equal(r.result.say, '货郎 · 2 日后上山', action);
  }
  assert.equal(VERBS.gear(s, content, ctx(AFTER)).result.gear.market, undefined);
});

test('事 and 下一步 mention him; the map seal at his spot wears a mark on his day', () => {
  for (const [now, text] of [[HIS, '货郎今日上山 · 演武场'], [AFTER, '货郎 · 2 日后上山']]) {
    const l = look(waimen('waimen', now), content, ctx(now));
    assert.ok(bookPopHtml({ look: l, lang: 'zh', words: WORDS.zh }).includes(text), `事: ${text}`);
    assert.ok(cardHtml({ card: 'next' }, { look: l, words: WORDS.zh, lang: 'zh' }).includes(text), `下一步: ${text}`);
  }
  const on = look(waimen('waimen', HIS), content, ctx(HIS));
  assert.match(cardHtml({ card: 'next' }, { look: on, words: WORDS.zh, lang: 'zh' }), /data-go="yanwu"/, 'one tap to his pole');
  const spot = id => on.place.plate.spots.find(s => s.id === id);
  assert.equal(spot('yanwu').visitor, true);
  assert.equal(spot('waimen').visitor, undefined);
  assert.match(plateHtml(on.place.plate, { src: 'x.webp' }), /class="spot visitor"/);
  const off = look(waimen('waimen', AFTER), content, ctx(AFTER));
  assert.equal(off.place.plate.spots.find(s => s.id === 'yanwu').visitor, undefined);
});

test('not outside the 外门 stretch: below the wall (冀\'s map) and in the 序章 he never comes', () => {
  const ji = { ...newState(content, 'zh', HIS), chapter: '01-ji', scene: null, place: 'yanwu', wealth: 500, ended: ['00-prologue', '00-waimen', '00-zhuji'], stamina: 100, stamina_at: HIS.toISOString() };
  const l = look(ji, content, ctx(HIS));
  assert.equal(l.visitors, undefined);
  assert.deepEqual(l.place.shelf, []);
  assert.equal(trade(ji, content, ctx(HIS), { action: 'buy', id: 'qi-pill' }).result.refused, 'no-market');
  const prologue = look({ ...newState(content, 'zh', HIS), stamina: 100, stamina_at: HIS.toISOString() }, content, ctx(HIS));
  assert.equal(prologue.visitors, undefined);
  assert.deepEqual(ids(waimen('yanwu', HIS), HIS).length > 0, true, 'while inside, it does');
});
