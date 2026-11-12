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
  c.balance.cooldowns.fantong_min = NaN;
  const where = hardErrors(c).map(e => e.where);
  for (const w of ['balance.prices.mend-pill', 'balance.pay.scene.progress', 'balance.cooldowns.fantong_min']) assert.ok(where.includes(w), w);
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
  // Every derived number held exactly (2026-11-10): no fit any more — the hours are the curve's T(L), its one free constant
  // solved apart (tools/balance.mjs --solve), never by a dry run.
  const diff = all;
  assert.deepEqual(diff, [], diff.map(d => `${d.path}: ${JSON.stringify(d.was)} → ${JSON.stringify(d.now)}`).join('\n'));
  for (const o of next.overrides ?? []) assert.ok(o.path && o.why && 'value' in o, `an override says its path, value and why: ${JSON.stringify(o)}`);
});

test('the 层 climb across realms: every step asks more than the one before it, 筑基一层 more than 练气九层', () => {
  // On the curve (2026-11-10, 81 levels): every 层 asks more than the one before it, across realms too; a 段 more than the one
  // before. Until then a realm in 段 climbed by its 段, each the old step's 修为 (`master.lines.gu._need_stages`).
  const c = loadContent(), per = t => (t.display === 'stages' ? t.thresholds.length / c.ladder.phases.zh.length : 1);
  const all = c.ladder.tiers.flatMap(t => {
    const row = t.thresholds.filter((n, k) => !(t.zero && k === 0)), p = per(t);
    for (let k = 1; k < row.length; k++) if (k % p) assert.ok(row[k] > row[k - 1], `${t.id} 层 ${k}: ${row[k]} over ${row[k - 1]}`);
    return Array.from({ length: row.length / p }, (_, g) => row.slice(g * p, g * p + p).reduce((a, b) => a + b, 0));
  });
  for (let k = 1; k < all.length; k++) assert.ok(all[k] > all[k - 1], `step ${k}: ${all[k]} over ${all[k - 1]}`);
  // Every 层 its own (81 levels): strictly above the one before, 练气九层 → 筑基一层 included.
  const flat = c.ladder.tiers.flatMap(t => t.thresholds.filter((n, k) => !(t.zero && k === 0)));
  for (let k = 1; k < flat.length; k++) assert.ok(flat[k] > flat[k - 1], `level ${k + 1}: ${flat[k]} over ${flat[k - 1]}`);
});

// Batch 2 (Hanli 2026-11-10: 「丹药, 物品都给一个级别吧, 算数值的时候, 按照这个级别算」): a pill is its level's number, 闭关 rides
// where he stands — so a card's 「抵N日打坐」 holds at the pill's own level, and the card says so (「练气初层的人服一粒…层数高了，
// 抵得就少」): above it the same pill is worth fewer nights, never more.
test('a pill\'s card\'s 「抵N日打坐」 holds against N nights of 闭关 at its own level, and falls with the layer as its card says', async () => {
  const c = loadContent(), r = await measure(c);
  const said = r.claims.checked.filter(x => x.lang === 'zh' && x.ratio != null);
  assert.ok(said.length >= 3, 'the pills\' 「抵…日」 are weighed');
  for (const x of said) {
    assert.ok(x.levelled, `${x.id}: a levelled pill`);
    assert.ok(Math.abs(x.ratio - 1) < 0.1, `${x.id} 「${x.said}」: ${x.actual} against ${x.claimed}`);
    assert.match(x.text, /层数高了/, `${x.id}: its card says it falls with the layer`);
    for (let k = 1; k < x.drift.length; k++) assert.ok(x.drift[k].ratio <= x.drift[k - 1].ratio + 0.01, `${x.id} 「${x.said}」 at ${x.drift[k].layer}: ×${x.drift[k].ratio}`);
  }
  assert.equal(r.red.filter(x => x.src === 'claims').length, 0);
});

// 开炉 with 灵石 (Hanli 11-04: the cap 10 a 层, 「多放可以提升出品品质」): each sample pot is weighed again with stones, up to
// the save's own cap and 筑基圆满's 180, and none is a farm.
test('开炉 with 灵石: weighed up to the cap, and never a farm', async () => {
  const r = await measure(loadContent());
  const stoned = r.kailu.filter(x => x.fuel > 0);
  assert.ok(stoned.some(x => x.fuel >= 18), '筑基圆满 with its 18 pieces');
  assert.ok(stoned.every(x => Number.isFinite(x.gain)), 'each with what its stones add');
  const red = r.red.filter(x => x.src === 'kailu');
  assert.deepEqual(red.map(x => x.say), []);
});

// 2026-11-10 (Hanli: 「所有和数值相关的都应该有公式推到, 不能手动定」): the book declares sizes, never a 修为 number — one written in
// is a hard error (the master's one `told` aside). Each source is weighed against its own declared size (the same evening: the
// rule 「one source over 3 small games」 was red on 95 designed rows — every night's 闭关, the pills from 三转 up): a designed one
// (a night's 闭关, a 功课 period, a day's wall, the sized tables, a family pill by its 转) red only when the rules pay it more than
// its size; an authored one-off red only above its class's ceiling (balance.json master.xiuwei.classes). No list of ids.
test('an authored 修为 number is a hard error; a source is red only above its own declared size — an authored one over its class', async () => {
  const c = loadContent();
  c.tasks = structuredClone(c.tasks);
  c.tasks.tasks[0].grant = { table: 'task', progress: 5 };
  assert.ok(hardErrors(c).some(e => /authored 修为 number \(progress 5\)/.test(e.say)), 'a progress in the book');
  assert.deepEqual(hardErrors(loadContent()).filter(e => /authored 修为/.test(e.say)), [], 'the shipped book holds none');
  const r = await measure(loadContent());
  assert.ok(r.sources.length > 0 && r.sources.every(x => x.game > 0), 'every source weighed against a small game where it is met (the reference)');
  // Designed: never red where the rules pay what the size says.
  for (const x of r.sources.filter(y => ['闭关', '功课', 'wall', 'tale', 'tale_end', 'chance', 'meet'].includes(y.kind) || (y.kind === 'pill' && y.want != null))) {
    assert.ok(x.want != null && x.over === false, `${x.id}: ${x.xw} against its size ${x.want}`);
  }
  assert.ok(r.sources.some(x => x.kind === '闭关' && x.x > 0) && r.sources.filter(x => x.kind === '闭关').every(x => !r.red.some(y => y.src === 'sources' && y.id === x.id)), 'a night\'s 闭关 is never red');
  // The told 760: the one authored number, weighed as a scene's way on — over its class, red by design (its why in the master).
  const told = r.sources.find(x => x.kind === 'told');
  assert.equal(told?.id, 'wm-mingpai/over');
  assert.ok(told.over && r.red.some(x => x.src === 'sources' && x.id === 'wm-mingpai/over'), 'the told 760 is red: no exceptions list');
  for (const x of r.sources.filter(y => y.over)) assert.ok(r.red.some(y => y.src === 'sources' && y.id === x.id), x.id);
  // An authored one-off over its class is red: an errand sized past master.xiuwei.classes.errand.
  const big = loadContent();
  big.quests = structuredClone(big.quests);
  const q = big.quests.find(x => x.id === 'guan-xiqiang-xiong');
  q.grant.units = big.balance.master.xiuwei.classes.errand + 10;
  const rb = await measure(big);
  assert.ok(rb.red.some(y => y.src === 'sources' && y.id === q.id), 'an oversize errand is red');
  assert.ok(!r.red.some(y => y.src === 'sources' && y.id === q.id), 'the shipped one is not');
});
