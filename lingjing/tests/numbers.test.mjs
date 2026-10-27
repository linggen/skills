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

// 数值系统 phase 2 (Hanli 2026-10-27: 「数值系统继续做吧」): the master table (balance.json `master`) is the numbers' one source.
// Every number it derives — the 层, the hours (fitted to the 回 bands), the shares, a pill's 修为, the shop prices — is
// what `node tools/numbers.mjs --apply` makes of it: a hand-set number would show here as a row the dry run would change.
test('the master table and balance.json agree: node tools/numbers.mjs --apply is a dry run with nothing to change', async () => {
  const { applied } = await import('../tools/numbers.mjs');
  const { diff: all, next } = applied();
  // The fitted hours (master hours.fit) move with the book — a scene or a board added shifts a 回's days: they are held by
  // the bands (balance.test.mjs), and --apply --write re-fits them. Every other derived number is held exactly.
  const diff = all.filter(d => d.path !== 'play_pay.hours.qi');
  assert.deepEqual(diff, [], diff.map(d => `${d.path}: ${JSON.stringify(d.was)} → ${JSON.stringify(d.now)}`).join('\n'));
  for (const o of next.overrides ?? []) assert.ok(o.path && o.why && 'value' in o, `an override says its path, value and why: ${JSON.stringify(o)}`);
});

test('the 层 climb across realms: every step asks more than the one before it, 筑基小成 more than 练气九层', () => {
  const c = loadContent(), all = c.ladder.tiers.flatMap(t => t.thresholds.filter((n, k) => !(t.zero && k === 0)));
  for (let k = 1; k < all.length; k++) assert.ok(all[k] > all[k - 1], `step ${k}: ${all[k]} over ${all[k - 1]}`);
});

test('a pill is its 转\'s share of the layer at every layer, and its card\'s 「抵N日打坐」 holds against N nights of 闭关 there', async () => {
  const c = loadContent(), r = await measure(c);
  for (const p of r.pills.filter(x => x.want_pct != null)) assert.ok(Math.abs(p.pct / p.want_pct - 1) < 0.05, `${p.name}: ${p.pct} of the layer, its 转 asks ${p.want_pct}`);
  const said = r.claims.checked.filter(x => x.lang === 'zh' && x.ratio != null);
  assert.ok(said.length >= 3, 'the pills\' 「抵…日」 are weighed');
  for (const x of said) {
    assert.ok(Math.abs(x.ratio - 1) < 0.1, `${x.id} 「${x.said}」: ${x.actual} against ${x.claimed}`);
    for (const d of x.drift) assert.ok(Math.abs(d.ratio - 1) < 0.1, `${x.id} 「${x.said}」 at ${d.layer}: ×${d.ratio}`);
  }
});
