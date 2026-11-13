// 卡册 (design.md § 斗法 v4 · 品 · 框 · the 卡册): the rules' `deck book` read (rules/cards.mjs kaceBrief) and the page's view
// of it (kace.js) — every card to collect, held in its frame, not held a dim back in its frame with where it is found.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld } from '../scripts/content.mjs';
import { deck, kaceBrief, whereOf } from '../scripts/rules/cards.mjs';
import { pinsOf } from '../scripts/rules/pin.mjs';
import { kaceHtml, KACE_WORDS } from '../scripts/kace.js';
import { WORDS as BW } from '../scripts/battle-card.js';

const content = loadWorld('jiuding');
const save = (o = {}) => ({ lang: 'zh', traits: ['fire'], cards: ['mucao', 'huodan', 'xiongzai', 'zheng', 'yinyue', 'qingteng'], cards_new: ['zheng'], bag: { talisman: 1 }, ...o });

test('`deck book` is a read: it answers the 卡册 and writes nothing', () => {
  const s = save(), before = JSON.stringify(s);
  const out = deck(s, content, { now: new Date('2026-11-12T08:00:00Z') }, { action: 'book' });
  assert.equal(out.state, null);
  assert.equal(out.result.ok, true);
  assert.equal(out.result.kace.of, 78);
  assert.equal(JSON.stringify(s), before);
});

test('held and not: a held card carries the face the hand shows; one not held only its name, 品 and where', () => {
  const k = kaceBrief(content, save());
  const by = Object.fromEntries(k.cards.map(c => [c.id, c]));
  assert.deepEqual(by.xiongzai, { id: 'xiongzai', name: '熊崽', held: true, cost: by.xiongzai.cost, kind: 'minion', element: by.xiongzai.element, atk: by.xiongzai.atk, hp: by.xiongzai.hp, art: by.xiongzai.art, is: by.xiongzai.is, pin: 'yin', where: '降服熊所得' });
  assert.equal(by.zheng.fresh, true, '新 until played, as the hand marks it');
  assert.equal(by.talisman.held, true, 'a 符 is held while it is in the bag');
  assert.equal(kaceBrief(content, save({ bag: {} })).cards.find(c => c.id === 'talisman').held, undefined);
  assert.deepEqual(Object.keys(by.huilang).sort(), ['id', 'name', 'pin', 'where']);
  assert.equal(k.held, 5);
  assert.deepEqual(k.counts.map(r => [r.pin, r.held, r.of]), [['fan', 3, 21], ['yin', 1, 26], ['jin', 0, 9], ['baoshi', 0, 4], ['zuanshi', 1, 18]]);
  assert.deepEqual(k.cards.map(c => c.pin), [...k.cards.map(c => c.pin)].sort((a, b) => ['fan', 'yin', 'jin', 'baoshi', 'zuanshi'].indexOf(a) - ['fan', 'yin', 'jin', 'baoshi', 'zuanshi'].indexOf(b)), 'by 品');
});

test('companions\' cards stand on their own leaf: shown, held or not, never counted', () => {
  const k = kaceBrief(content, save());
  assert.deepEqual(k.companions.map(m => [m.id, m.cards.length]), [['ahe', 9], ['sun', 2], ['yinyue', 1]]);
  assert.ok(k.companions.every(m => m.cards.every(c => c.cost != null && !('held' in c))), 'shown face up, never held or not');
  assert.ok(!k.cards.some(c => ['qingteng', 'yinyue', 'shangen'].includes(c.id)));
  for (const id of ['wulei', 'fenghuo', 'tengmiao_token']) assert.ok(!k.companions.some(m => m.cards.some(c => c.id === id)), `${id} is nobody's leaf`);
});

test('every where line is a place, a beast or a 重 from the data — never a number that reads as a chance', () => {
  for (const lang of ['zh', 'en']) {
    const k = kaceBrief(content, save({ lang }));
    for (const c of k.cards) {
      assert.ok(c.where && c.where.length > 1, `${c.id} has a where (${lang})`);
      assert.doesNotMatch(c.where, /%|％|\d+\s*\/\s*\d+|分之|几率|概率|掉率|chance|odds|\bin \d+/i, `${c.id}: ${c.where}`);
      assert.doesNotMatch(c.where, /undefined|null|\{/, `${c.id}: ${c.where}`);
    }
  }
  assert.equal(whereOf(content, content.cards.cards.find(c => c.id === 'jiushou'), 'zh'), '三重 · 石室 · 大妖蠪侄手中的牌');
  assert.equal(whereOf(content, content.cards.cards.find(c => c.id === 'jingwei'), 'zh'), '卷二 · 收服精卫');
  assert.equal(whereOf(content, content.cards.cards.find(c => c.id === 'luying'), 'zh'), '胜秦雁所得');
  assert.equal(whereOf(content, content.cards.cards.find(c => c.id === 'qingteng'), 'zh'), null);
});

/* ── The page's view ── */
const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, { ...x, name: x.name.zh }]));
const ctx = { lang: 'zh', words: BW.zh, catalog, pins: pinsOf(content), artBase: '' };

test('the 卡册: held faces in their frames, dim backs in theirs with the where line, counts by 品 and overall', () => {
  const html = kaceHtml(kaceBrief(content, save()), ctx);
  assert.match(html, /卡册 · 已得 5\/78/);
  for (const [name, n] of [['凡', '3/21'], ['银', '1/26'], ['金', '0/9'], ['宝石', '0/4'], ['钻石', '1/18']]) assert.match(html, new RegExp(`${name} <span class="kcount">${n}</span>`));
  assert.match(html, /data-kace-card="xiongzai"><span class="bleaf pin-yin"><i class="bpin"/, 'held, framed');
  assert.match(html, /data-kace-card="huilang"><span class="bleaf kback pin-jin"><i class="bpin" aria-hidden="true"><\/i><span class="kseal" aria-hidden="true"><\/span><b class="kname">灰狼<\/b><small class="kwhere">狼手中的牌<\/small>/, 'not held: a back in its frame, where');
  assert.match(html, /data-kace-card="wudao"><span class="bleaf kback"><span class="kseal"/, 'a 凡 back has no frame');
  assert.match(html, /data-kace-card="zheng">[\s\S]*?<b class="deckfresh">新<\/b>/);
  assert.doesNotMatch(html, /<button[^>]*data-kace-card/, 'a card is not a button: nothing to tap on it');
  assert.match(html, /data-pouch-pane="deck"/, 'the way back to the 牌组');
});

test('the 卡册\'s leaves: one 品, or the companions\' — each a tap that shows, the counts kept off the companions', () => {
  const k = kaceBrief(content, save());
  const one = kaceHtml(k, ctx, 'baoshi');
  assert.equal((one.match(/<section class="kgrade"/g) ?? []).length, 1);
  assert.match(one, /class="kleaf on" data-kace-leaf="baoshi"/);
  const comp = kaceHtml(k, ctx, 'companions');
  assert.match(comp, new RegExp(KACE_WORDS.zh.compNote));
  assert.match(comp, /data-kace-member="ahe"/);
  assert.match(comp, /data-kace-card="yinyue"><span class="bleaf"/, '银月\'s card face up, plain (a companion\'s has no 品)');
  assert.match(comp, /data-kace-card="qingguang"><span class="bleaf">/, 'every companion card face up');
  assert.doesNotMatch(comp.slice(comp.indexOf('data-kace-member')), /kback|kcount/, 'no back, no count on their leaf');
  assert.doesNotMatch(kaceHtml(k, ctx, 'nonsense'), /class="kleaf on" data-kace-leaf="nonsense"/);
  assert.match(kaceHtml(null, ctx), /class="loading"/);
  const en = kaceHtml(kaceBrief(content, save({ lang: 'en' })), { ...ctx, lang: 'en' });
  assert.match(en, /Collection · 5\/78/); assert.match(en, /Silver <span class="kcount">1\/26<\/span>/);
});
