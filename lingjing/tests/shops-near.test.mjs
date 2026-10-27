// 铺子在哪 (Hanli, 2026-10-27: 「现在看地图也不知到商店在哪里」): rules/shops.mjs shopsNear lists
// every open shop he can walk to — its kind from its goods, how many roads away — and Look
// carries it as `shops`; the map, the 去往 list and the header draw its small seal (shopmark.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, SHOP_KINDS, shopKind, shopsNear } from '../scripts/rules.mjs';
import { pathOf, placeOf } from '../scripts/rules/world.mjs';
import { WORDS, cardHtml } from '../scripts/cards.js';
import { plateHtml } from '../scripts/plate.js';
import { shopHereHtml, shopMarkHtml, shopsById, shopTagHtml } from '../scripts/shopmark.js';
import { TO_OPEN, walk } from './prologue.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00+08:00');
const ctx = (now = NOW) => ({ now, quests: [] });
const jiScenes = Object.keys(content.chapters['01-ji'].scenes);
/* After 冀, at a place of 邺城, with stones to spend. */
const at = (place, extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '01-ji', scene: null, place, tier: 'foundation', step: 0, progress: 0, wealth: 500,
  traits: ['wood', 'fire'], ended: ['00-prologue', '00-waimen', '00-zhuji', '01-ji'], done_scenes: jiScenes, ...extra,
});
const byId = list => Object.fromEntries(list.map(s => [s.id, s]));

test('shopsNear: each open shop he can walk to, its kind from its goods, nearest first', () => {
  const s = at('ye'), list = shopsNear(content, s, NOW), shops = byId(list);
  // The output's shape, exactly.
  assert.deepEqual(Object.keys(shops['ye-caifeng']).sort(), ['goods', 'id', 'kind', 'label', 'mark', 'name', 'province', 'shop', 'steps']);
  assert.deepEqual(shops['ye-caifeng'], {
    id: 'ye-caifeng', name: '邺城 · 城南裁缝铺', province: '冀', shop: '城南裁缝铺',
    kind: 'yi', label: '衣铺', mark: '衣', steps: 1, goods: placeOf(content, 'ye-caifeng').has.shop.goods,
  });
  assert.equal(shops.ye.steps, 0, 'where he stands: 0 roads');
  assert.equal(shops.pengcheng.kind, 'yao', '彭城\'s 南门药铺: pills and herbs (herbs.json) are the apothecary\'s');
  assert.equal(shops.pengcheng.label, '药铺');
  assert.equal(shops['ye-kezhan'].kind, 'za', 'an inn\'s rations and pills: 杂货');
  // Steps are the roads Move walks (world.mjs pathOf).
  for (const sh of list.filter(x => x.steps)) assert.equal(sh.steps, pathOf(content, s, placeOf(content, 'ye'), placeOf(content, sh.id), NOW).length, sh.id);
  assert.deepEqual(list.map(x => x.steps), [...list.map(x => x.steps)].sort((a, b) => a - b), 'nearest first');
  // Every good is on the shelf right now.
  for (const sh of list) assert.ok(sh.goods.length, sh.id);
  for (const sh of list) assert.ok(SHOP_KINDS[sh.kind] && [...sh.label].length <= 2 && [...sh.mark].length === 1, `${sh.id}: short words`);
  // In English.
  const en = byId(shopsNear(content, { ...s, lang: 'en' }, NOW));
  assert.equal(en['ye-caifeng'].label, 'Clothier');
});

test('a shop shut until its scene is not listed; once open it is', () => {
  const before = at('ye-doufu', { ended: ['00-prologue', '00-waimen', '00-zhuji'], done_scenes: [], scene: '01-ye' });
  assert.equal(byId(shopsNear(content, before, NOW))['ye-doufu'], undefined, '豆腐坊 before the 漳水');
  const after = byId(shopsNear(content, at('ye-doufu'), NOW))['ye-doufu'];
  assert.equal(after.steps, 0);
  assert.equal(after.kind, 'liang');
});

test('kind: one class over half the shelf, else 坊市 (three classes or more) or 杂货; a declared `kind` wins', () => {
  const items = ids => ids.map(id => content.items.items.find(i => i.id === id));
  assert.equal(shopKind(content, items(['grey-robe', 'straw-cloak'])), 'yi');
  assert.equal(shopKind(content, items(['iron-sword', 'pouch-mid', 'wangqi-1', 'mend-pill', 'huiqi-pill'])), 'shi');
  assert.equal(shopKind(content, items(['ganliang', 'mend-pill'])), 'za');
  assert.equal(shopKind(content, items(['talisman', 'wulei-fu', 'mend-pill'])), 'fu');
  assert.equal(shopKind(content, items(['ganliang', 'mend-pill']), 'liang'), 'liang');
  assert.equal(shopKind(content, items(['ganliang']), 'nonsense'), 'liang', 'an unknown declared kind is ignored');
  // No place's name in the rule.
  const src = fs.readFileSync(new URL('../scripts/rules/shops.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const p of Object.values(content.places).flatMap(d => d.places)) assert.ok(!src.includes(`'${p.id}'`), p.id);
});

test('the visiting pedlar is a shop only on his day, and the 坊市 below is not reachable while the 观 walls him in', () => {
  const START = new Date('2026-09-29T09:00:00'), HIS = new Date('2026-10-16T10:00:00'), AFTER = new Date('2026-10-17T10:00:00');
  const waimen = now => ({ ...walk(newState(content, 'zh', START), TO_OPEN, content, START), place: 'waimen', wealth: 500, stamina: 100, stamina_at: now.toISOString() });
  const on = byId(shopsNear(content, waimen(HIS), HIS));
  assert.equal(on.yanwu?.visitor, true);
  assert.equal(on.yanwu.shop, '货郎的担子');
  assert.ok(on.yanwu.steps >= 1);
  assert.equal(byId(shopsNear(content, waimen(AFTER), AFTER)).yanwu, undefined, 'off his day');
  assert.equal(on.fangshi, undefined, 'the 坊市 below: no way down from inside the 观');
});

test('Look carries `shops` exactly as shopsNear reads it; hidden before the 灵石 and with no place', () => {
  const s = at('ye');
  assert.deepEqual(look(s, content, ctx()).shops, shopsNear(content, s, NOW));
  const prologue = look({ ...newState(content, 'zh', NOW), place: 'shiao' }, content, ctx());
  assert.equal(prologue.shops, undefined, 'before the 灵石 a shop shows nothing (locks.mjs wealth)');
  assert.deepEqual(shopsNear(content, { ...s, place: null }, NOW), []);
});

test('the page: a seal on the map\'s dot, a tag in the list, 「有铺子」 where he stands', () => {
  const l = look(at('ye'), content, ctx());
  const map = cardHtml({ card: 'map' }, { look: l, words: WORDS.zh, lang: 'zh', content });
  assert.match(map, /class="shopmark k-yi"[^>]*>衣</, '裁缝铺 wears 衣 on the map');
  assert.match(map, /class="pt[^"]*\bshop\b[^"]*"[^>]*data-go="ye-caifeng"/, 'its dot a square seal');
  assert.match(map, /class="pt here shop[^"]*"/, 'where he stands, too (邺城\'s 东街市)');
  const shops = shopsById(l);
  assert.match(shopTagHtml(shops.get('ye-caifeng')), />衣铺</);
  assert.equal(shopMarkHtml(undefined), '');
  assert.match(shopHereHtml(l, 'zh'), /有铺子 · 坊市/, '邺城\'s 东街市');
  assert.equal(shopHereHtml(look(at('zhangnan'), content, ctx()), 'zh'), '', 'no shop where he stands');
  const plate = { name: 'x', aspect: 1.5, spots: [{ id: 'ye-caifeng', name: '裁缝铺', at: [0.5, 0.5] }] };
  assert.match(plateHtml(plate, { shops }), /spotname">裁缝铺<b class="shopmark k-yi"/);
});
