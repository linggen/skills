// 数值系统 (tools/numbers.mjs, design.md § 数值系统): the world's numbers carry no hard error — a NaN, a negative, a
// price for a thing that is not there, a shop buying back over its price, a layer cheaper than the one below. The
// red list (outliers, text against numbers) is for Hanli to read on the 游戏厅's 数值 page; it never fails a push.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { hardErrors, measure } from '../tools/numbers.mjs';

test('no hard error in the world\'s numbers', () => {
  const errs = hardErrors(loadContent());
  assert.deepEqual(errs, [], errs.map(e => `${e.where}: ${e.say}`).join('\n'));
});

test('a hard error is caught: a NaN price, a negative pay, a buy-back over the price', () => {
  const c = loadContent();
  c.balance = structuredClone(c.balance);
  c.balance.prices['mend-pill'] = { buy: 10, sell: 12 };
  c.balance.pay.scene.progress = -1;
  c.balance.cooldowns.rerun_h = NaN;
  const where = hardErrors(c).map(e => e.where);
  for (const w of ['balance.prices.mend-pill', 'balance.pay.scene.progress', 'balance.cooldowns.rerun_h']) assert.ok(where.includes(w), w);
});

test('the report weighs every source in the layer\'s units, and reads a text that states an amount', async () => {
  const r = await measure(loadContent());
  assert.ok(r.layers.length >= 10 && r.layers.every(l => Number.isFinite(l.need)), 'every layer');
  for (const src of ['pills', 'boards', 'errands', 'shops', 'gear', 'cards', 'paces']) assert.ok(r[src].length > 0, src);
  const paying = new Set(r.layers.filter(l => l.need > 0).map(l => l.name));
  assert.ok(r.boards.filter(b => paying.has(b.layer)).every(b => Number.isFinite(b.xw) && Number.isFinite(b.pct)), 'a board met on a layer has its share');
  assert.ok(r.claims.checked.some(c => c.lang === 'zh' && c.subject && c.claimed != null), 'a 「抵…日」 claim is weighed');
});
