// 按店进货 (Hanli, 2026-10-05): a shelf is a shop's, declared on its place — its name, its
// keeper, its goods — and the people and goods are the book's: 钱掌柜's 押宝 at the 坊市,
// 济世堂 at 彭城, the 货郎 at 石坳村, 邺城's tofu shop, tailor's, incense shop and inn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, trade } from '../scripts/rules.mjs';
import { placeOf } from '../scripts/rules/world.mjs';
import { shelfOf } from '../scripts/rules/look.mjs';
import * as yabao from '../scripts/games/yabao.js';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00+08:00');
const ctx = { now: NOW, quests: [] };
const jiScenes = Object.keys(content.chapters['01-ji'].scenes);
const at = (place, extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '01-ji', scene: null, place, tier: 'foundation', step: 0, progress: 0, wealth: 500,
  traits: ['wood', 'fire'], ended: ['00-prologue', '00-waimen', '00-zhuji', '01-ji'], done_scenes: jiScenes, ...extra,
});
const ids = s => look(s, content, ctx).place.shelf.map(i => i.id);

test('each shop sells its own goods, under its own name', () => {
  assert.deepEqual(ids(at('fangshi')), content.places['徐'].places.find(p => p.id === 'fangshi').has.shop.goods);
  assert.ok(ids(at('fangshi')).includes('qi-pill'), '钱掌柜: 聚气丹, one ring');
  assert.deepEqual(ids(at('pengcheng')).sort(), ['ginseng', 'lingzhi', 'mend-pill'], '济世堂, the apothecary');
  assert.notDeepEqual(ids(at('fangshi')), ids(at('pengcheng')), 'two shops of 徐, two shelves');
  const l = look(at('pengcheng'), content, ctx);
  assert.equal(l.place.shop.name, '济世堂');
  assert.equal(look(at('fangshi'), content, ctx).place.shop.name, '钱掌柜的摊子');
  for (const id of ['ye-caifeng', 'ye-xiangzhu', 'ye-kezhan', 'ye']) assert.ok(ids(at(id)).length, id);
  // Bought only where it is sold.
  const r = trade(at('pengcheng'), content, ctx, { action: 'buy', id: 'bamboo-sword' });
  assert.equal(r.result.refused, 'not-for-sale-here');
  assert.equal(trade(at('fangshi'), content, ctx, { action: 'buy', id: 'bamboo-sword' }).result.ok, true);
});

test('邺城\'s tofu shop is shut until the 漳水 is behind him, and says so', () => {
  const before = at('ye-doufu', { ended: ['00-prologue', '00-waimen', '00-zhuji'], done_scenes: [], scene: '01-ye' });
  const shut = look(before, content, ctx).place;
  assert.deepEqual(shut.shelf, []);
  assert.equal(shut.shop.open, false);
  assert.match(shut.shop.shut, /河伯定了/);
  assert.equal(trade(before, content, ctx, { action: 'buy', id: 'ganliang' }).result.refused, 'not-for-sale-here');
  assert.deepEqual(ids(at('ye-doufu')), ['ganliang']);
});

test('older data: `shop: true` is still the province\'s shelf by `sold`', () => {
  const p = { ...placeOf(content, 'fangshi'), has: { shop: true } };
  assert.deepEqual(shelfOf(content, p, at('fangshi'), NOW).map(i => i.id), shelfOf(content, '徐', at('fangshi'), NOW).map(i => i.id));
  assert.ok(shelfOf(content, '徐', at('fangshi'), NOW).some(i => i.id === 'jade-fish'));
});

test('before the 灵石 (the prologue\'s lock), a shop shows nothing to buy', () => {
  const s = { ...newState(content, 'zh', NOW), place: 'shiao' };
  const l = look(s, content, ctx);
  assert.deepEqual(l.place?.shelf ?? [], []);
  assert.deepEqual(ids(at('shiao')).sort(), ['duan-dao', 'ganliang', 'straw-cloak'], 'the pedlar, once he has stones');
});

test('冀\'s errands keep the story\'s time: the city before the 漳水, the city after', () => {
  const before = (place) => at(place, { ended: ['00-prologue', '00-waimen', '00-zhuji'], done_scenes: ['01-arrive', '01-ye'], scene: '01-altar' });
  const offered = s => (look(s, content, ctx).offers ?? []).map(o => o.id);
  assert.ok(offered(before('ye-kezhan')).includes('ji-kezhan-hebo'));
  assert.ok(!offered(at('ye-kezhan')).includes('ji-kezhan-hebo'), 'not after');
  assert.ok(offered(at('zhangnan')).includes('ji-liu-boat'));
  assert.ok(!offered(before('zhangnan')).includes('ji-liu-boat'), 'not before');
  assert.ok(offered(at('ye-doufu')).includes('ji-doufu-liuwan'));
});

test('押宝: three bets; a miss shows his habits, and the third, read right, is sure — a careless one loses the sitting', () => {
  for (let k = 0; k < 60; k += 1) {
    let g = yabao.newGame(`seed-${k}`);
    // bet on a door he cannot point at next, twice, then read the one left
    for (let n = 0; n < 2 && !g.won; n += 1) g = yabao.act(g, { g: 'bet', door: yabao.DOORS.find(d => d !== yabao.wayOf(g)) }).state;
    if (g.won) continue;
    const open = yabao.allowed(g);
    assert.ok(open.length >= 1 && open.length <= 2);
    if (open.length === 1) assert.equal(yabao.act(g, { g: 'bet', door: open[0] }).won, true, 'read right, sure');
    const wrong = yabao.DOORS.find(d => !open.includes(d));
    const lost = yabao.act(g, { g: 'bet', door: wrong }).state;
    assert.equal(lost.lost, true);
    assert.equal(yabao.act(lost, { g: 'bet', door: open[0] }).won, false, 'a lost sitting takes no more bets');
  }
  assert.match(yabao.html(yabao.newGame('x'), 'zh'), /明码标价/);
  assert.match(yabao.html(yabao.newGame('x'), 'en'), /data-g="bet"/);
  // Hosted at the 坊市: the day's board, its win a pill of one ring.
  const t = content.tasks.tasks.find(x => x.id === 'yabao');
  assert.deepEqual([t.hosted, t.period, t.grant.item], [true, 'day', 'qi-pill']);
  assert.ok(placeOf(content, 'fangshi').has.games.includes('yabao'));
});
