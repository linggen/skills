// 撒豆成兵's 兽潮 nights (scripts/games/sadou/tide.js): every night a new run up the 山道 for the save, only the beasts
// of his 回, ending on an open 大妖, laid whole in `deal.over` on a row the phone already has, and winnable — a
// first-time human (core.js humanBot) wins every sampled night on at least half its runs, most of them overall, while
// the careless bot (walks into every hazard, stands under every slam) never wins one with ★★★ and loses some. The
// nights are made and played in workers (tools/tide-prove-sadou.mjs; its CLI sweeps 720).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tide } from '../scripts/games/sadou/tide.js';
import { levelDealt } from '../scripts/games/sadou.js';
import { faults, openAt, proveAll, table } from '../tools/tide-prove-sadou.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url);
const chars = readFileSync(at('scripts/games/sadou/font/chars.txt'), 'utf8');
const TIERS = [0, 0.5, 1], HUI = ['h05', 'h07', 'h09'], SEEDS = 8;
const sample = TIERS.flatMap((tier) => HUI.flatMap((hui) => Array.from({ length: 7 }, (_, i) => ({ seed: `t${i}`, tier, hui, seeds: SEEDS }))));
const more = Array.from({ length: 140 }, (_, i) => ({ seed: `sig${i}`, tier: TIERS[i % 3], hui: HUI[(i / 3 | 0) % 3], seeds: 0 }));
const runs = proveAll([...sample, ...more]);

test('the shape: game, no 结印 boss, night → { deal: { lv, over, tide }, sig, boss, kinds }, prove → boolean', () => {
  assert.equal(tide.game, 'sadou');
  assert.equal(tide.boss, false);
  const open = new Set(openAt('h07'));
  const n = tide.night(table, { seed: 'shape', tier: 0.3, boss: false, open: (k) => open.has(k) });
  assert.ok(n && n.deal.tide === true && typeof n.sig === 'string' && n.boss === false && Array.isArray(n.kinds));
  assert.ok(table.levels.some((l) => l.id === n.deal.lv), 'lv is a row the phone already has');
  assert.equal(typeof tide.prove(table, n.deal, 'x'), 'boolean');
  // the mount lays `over` on the row: the whole layout is the night's
  const level = levelDealt(table, n.deal, '');
  assert.deepEqual(level.track, n.deal.over.track);
  assert.equal(level.boss.beast, n.beast);
  assert.deepEqual(faults(level), []);
});

test('h05 (野猪 狰, and 蠪侄 met at h04): the run ends on 蠪侄; with no boss open there is no night', () => {
  assert.deepEqual(openAt('h05').sort(), ['longzhi', 'yezhu', 'zheng']);
  const open = new Set(openAt('h05'));
  for (const seed of ['a', 'b', 'c']) {
    const n = tide.night(table, { seed, tier: 0, boss: false, open: (k) => open.has(k) });
    assert.equal(n.beast, 'longzhi');
    assert.equal(n.deal.lv, 'heisong', 'its moments name 蠪侄');
  }
  assert.equal(tide.night(table, { seed: 'a', tier: 0, open: (k) => k === 'yezhu' || k === 'zheng' }), null);
});

test('the mount never offers 下一关 on a 兽潮 night', () => {
  const src = readFileSync(at('scripts/games/sadou.js'), 'utf8');
  assert.match(src, /const nx = data\.tide \? null :/);
});

test('every night: made, deterministic, kinds ⊆ open, the kit\'s rules for a level, its words in the canvas font', async () => {
  const rs = await runs;
  for (const r of rs) {
    assert.ok(!r.none, `${r.seed} ${r.tier} ${r.hui}: no night`);
    assert.ok(r.same, `${r.seed}: deterministic`);
    assert.equal(r.tide, true);
    for (const k of r.kinds) assert.ok(r.open.includes(k), `${r.seed} ${r.hui}: ${k} not open`);
    assert.ok(r.kinds.includes(r.beast));
    assert.deepEqual(r.faults, [], `${r.seed} ${r.tier} ${r.hui}`);
    assert.ok(r.good, `${r.seed}: the careful bot wins`);
    for (const ch of r.words.match(/[　-鿿＀-￯]/g)) assert.ok(chars.includes(ch), `font lacks ${ch}`);
  }
  for (const hui of HUI) assert.ok(rs.some((r) => r.hui === hui && r.kinds.includes('yezhu')));
  assert.ok(rs.some((r) => r.kinds.includes('qique')) && !rs.some((r) => r.hui !== 'h09' && r.kinds.includes('qique')));
  assert.ok(rs.some((r) => r.beast === 'heyu') && rs.some((r) => r.hui !== 'h05' && r.beast === 'longzhi'), 'both bosses come once open');
});

test(`${sample.length + more.length} nights, ${sample.length + more.length} layouts: every sig distinct`, async () => {
  const rs = await runs;
  assert.equal(new Set(rs.map((r) => r.sig)).size, rs.length);
});

test(`a first-timer wins every sampled night on ≥ half of ${SEEDS} runs, ≥ 80% overall, a little less as the tier climbs; the careless bot never ★★★ and loses some`, async () => {
  const rs = (await runs).slice(0, sample.length);
  for (const r of rs) assert.ok(r.human * 2 >= r.seeds, `${r.seed} tier ${r.tier} ${r.hui}: ${r.human}/${r.seeds}`);
  const rate = (xs) => xs.reduce((s, r) => s + r.human, 0) / xs.reduce((s, r) => s + r.seeds, 0);
  assert.ok(rate(rs) >= 0.8, `overall ${rate(rs).toFixed(2)}`);
  const byTier = TIERS.map((t) => rate(rs.filter((r) => r.tier === t)));
  assert.ok(byTier[2] <= byTier[0], `by tier ${byTier.map((v) => v.toFixed(2))}`);
  assert.ok(rs.every((r) => r.carelessStars < 3), 'careless ★★★');
  const all = await runs;
  assert.ok(all.some((r) => !r.careless), `careless wins ${all.filter((r) => r.careless).length}/${all.length}`);
});
