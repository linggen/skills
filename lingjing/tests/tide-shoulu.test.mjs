// 兽潮's 守炉 nights (scripts/games/shoulu/tide.js): every night a new 游戏厅-style layout — a road, talisman spots,
// 银月 — never a 守火 / 雪夜柴垛 board; deterministic per ask; only the beasts his 回 has met; a 大妖 when asked; and
// bot-proven: the human-like hand (core.js `human`, no 结印) wins every sampled layout on most sim seeds — seeds other
// than the ones night() proves on — and doing nothing loses. The wide sweep: tools/tide-prove-shoulu.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEASTS, TOWERS, beastsOf, layLevel, offRoad, sim } from '../scripts/games/shoulu/core.js';
import { ladderOf, leadSplit, levelAsked, levelAt, nextLv } from '../scripts/games/shoulu.js';
import { tide } from '../scripts/games/shoulu/tide.js';

const reg = JSON.parse(readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
const table = reg.games.find((g) => g.id === 'shoulu' && g.levels);
const places = new Set(JSON.parse(readFileSync(new URL('../worlds/jiuding/places/xu.json', import.meta.url), 'utf8')).places.map((x) => x.id));
const OPEN = { h05: ['yezhu', 'zheng'], h07: ['yezhu', 'zheng', 'qiuyu', 'heyu'], h09: ['yezhu', 'zheng', 'qiuyu', 'heyu', 'qique'] };
const ask = (hui, tier, boss, i) => ({ seed: `t|${hui}|${tier}|${boss}|${i}`, tier, boss, open: (k) => OPEN[hui].includes(k) });
const SIMS = ['s0', 's1', 's2', 's3']; // not night()'s own proving seeds (c0…)
const GROUNDS = new Set(['shiao', 'shanlu', 'shanlu-night', 'yaoyuan', 'yaoyuan-night', 'houshan', 'houshan-night', 'heisong']);

// the sample: 3 open sets × 3 tiers × boss or not × 4 seeds = 72 nights
const sample = [];
for (const hui of Object.keys(OPEN)) for (const tier of [0, 0.5, 1]) for (const boss of [false, true]) for (let i = 0; i < 4; i += 1) {
  const a = ask(hui, tier, boss, i);
  sample.push({ hui, tier, boss, a, got: tide.night(table, a) });
}

test('the export: game, boss, night, prove', () => {
  assert.equal(tide.game, 'shoulu');
  assert.equal(tide.boss, true);
  assert.equal(typeof tide.night, 'function');
  assert.equal(typeof tide.prove, 'function');
  assert.equal(tide.night(table, { seed: 'x', tier: 0, boss: false, open: () => false }), null, 'no 野猪 open: nothing fits');
});

test('every sampled night is a 游戏厅 守炉 level, sound, in the deal whole', () => {
  for (const { hui, a, got } of sample) {
    assert.ok(got, `${a.seed}: a night`);
    const { deal } = got, r = deal.levels[0];
    assert.equal(deal.tide, true);
    assert.equal(deal.levels.length, 1);
    assert.equal(deal.lv, r.id);
    assert.match(r.id, /^tide-[0-9a-f]{16}$/);
    assert.equal(levelAsked(deal, ''), r.id, 'the mount reads the id');
    assert.equal(levelAt(deal.levels, r.id), 0);
    assert.equal(nextLv(deal.levels, 0), 0, 'no 下一关');
    assert.equal(ladderOf(deal.levels).length, 0, 'off the ladder: no level select, no ladder number');
    assert.equal(r.story, null);
    // never 守火 / 雪夜柴垛: talismans and spots, 银月, no fire to feed, no one kept
    assert.ok(r.towers.length >= 2 && r.towers.includes('jian') && r.towers.includes('huo'), r.id);
    assert.ok(r.towers.every((k) => TOWERS[k]));
    assert.ok(!r.fire && !r.keep && !r.hero.who && r.hero.skills !== false && !r.snow && !r.trail, r.id);
    assert.ok(GROUNDS.has(r.ground), `${r.id}: ground ${r.ground}`);
    assert.ok(places.has(r.place), r.id);
    // the ladder's own soundness (tests/game-shoulu.test.mjs)
    const L = layLevel(r);
    const [sx, sy] = r.road[0];
    assert.ok(sx < 0 || sx > 600 || sy < 0, `${r.id}: the road comes in from off the board`);
    const end = r.road.at(-1);
    assert.ok(Math.hypot(end[0] - r.furnace[0], end[1] - r.furnace[1]) <= 40, `${r.id}: the road ends at the furnace`);
    assert.ok(r.spots.length >= 7);
    for (const [x, y] of r.spots) {
      const d = offRoad(L.road, x, y);
      assert.ok(d >= 40 && d <= 95, `${r.id}: spot ${x},${y} is ${Math.round(d)} off the road`);
      assert.ok(x >= 22 && x <= 578 && y >= 70 && y <= 738, `${r.id}: spot on the board`);
      assert.ok(Math.hypot(x - r.furnace[0], y - r.furnace[1]) > 60, `${r.id}: spot clear of the furnace`);
    }
    r.spots.forEach(([x, y], i) => r.spots.slice(i + 1).forEach(([x2, y2]) => assert.ok(Math.hypot(x - x2, y - y2) >= 50, `${r.id}: spots apart`)));
    assert.ok(offRoad(L.road, ...r.hero.at) < 2, `${r.id}: 银月 on the road`);
    // the lead: a story line for the shell's card, then the banner
    const { said, rest } = leadSplit(r.lead, 'zh');
    assert.ok(said && rest[0]?.big && r.lead.every((l) => l.zh && l.en), r.id);
    assert.ok(r.name.zh.includes(' · ') && r.name.en, r.id);
    // its beasts: open ones only; the answers offered
    const kinds = beastsOf(r);
    assert.deepEqual([...got.kinds].sort(), [...kinds].sort());
    assert.ok(kinds.every((k) => OPEN[hui].includes(k)), `${r.id}: ${kinds} ⊆ ${hui}`);
    assert.ok(kinds.includes('yezhu'));
    if (kinds.includes('zheng') || kinds.includes('qiuyu')) assert.ok(r.towers.includes('han'), `${r.id}: 寒符 for 狰 / 犰狳`);
    if (kinds.some((k) => BEASTS[k].fly)) assert.ok(r.air && (r.towers.includes('jian') || r.towers.includes('lei')), `${r.id}: fliers need a line and an answer`);
    // the last wave: an elite, or the 大妖
    const last = r.waves.at(-1);
    assert.ok(last.some((g) => BEASTS[g[0]].boss || g[4]?.elite), `${r.id}: the last wave's big one`);
  }
});

test('a 大妖 iff asked and open: one heyu, in the last wave, 结印 offered while it is up (pace rest)', () => {
  for (const { hui, boss, got } of sample) {
    const r = got.deal.levels[0], heyu = r.waves.flat().filter(([t]) => BEASTS[t].boss);
    const want = boss && OPEN[hui].includes('heyu');
    assert.equal(got.boss, want, r.id);
    assert.equal(heyu.length, want ? 1 : 0, r.id);
    if (!want) continue;
    assert.ok(r.waves.at(-1).some(([t]) => t === 'heyu'), `${r.id}: in the last wave`);
    assert.equal(heyu[0][1], 1);
    assert.ok(r.pace == null || r.pace === 'rest', `${r.id}: the default pace — the dock opens for the 大妖 (when boss|elite)`);
    assert.ok(r.hero.hair >= 1, `${r.id}: 狐毛 for the 大妖`);
  }
});

test('deterministic: the same ask deals the same night', () => {
  for (const { a, got } of sample.filter((_, i) => i % 9 === 0)) assert.deepEqual(tide.night(table, a), got);
});

test('the bot proof: the human hand wins every layout on most sim seeds (no 结印); nothing done loses', () => {
  let all = 0, won = 0;
  const cells = {};
  for (const { hui, tier, boss, got } of sample) {
    const r = got.deal.levels[0];
    const k = SIMS.filter((s) => sim(r, 'human', { seed: s }).result === 'win').length;
    assert.ok(k * 2 >= SIMS.length, `${r.id} (${hui} tier ${tier}${boss ? ' 大妖' : ''}): human won ${k}/${SIMS.length}`);
    all += SIMS.length; won += k;
    const c = (cells[`${hui} ${tier} ${boss ? 'boss' : '-'}`] ??= [0, 0]); c[0] += k; c[1] += SIMS.length;
    assert.notEqual(sim(r, 'none', { seed: 's0' }).result, 'win', `${r.id}: nothing done loses`);
    assert.equal(tide.prove(table, got.deal, 's0'), sim(r, 'human', { seed: 's0' }).result === 'win');
  }
  const rate = won / all;
  assert.ok(rate >= 0.75, `human ${Math.round(rate * 100)}%: ${JSON.stringify(cells)}`);
});

test('the climb: more beasts and tougher with the tier', () => {
  const load = (tier) => {
    const rs = sample.filter((s) => s.tier === tier && !s.boss).map((s) => s.got.deal.levels[0]);
    return rs.reduce((a, r) => a + r.waves.flat().reduce((b, [t, n]) => b + n * BEASTS[t].hp, 0) * r.hpMul, 0) / rs.length;
  };
  assert.ok(load(0) < load(0.5) && load(0.5) < load(1), `${load(0)} · ${load(0.5)} · ${load(1)}`);
});

test('200 seeds, 200 layouts: no two sigs alike; the sig leaves out the difficulty knobs', () => {
  const sigs = new Set(), ids = new Set();
  for (let i = 0; i < 200; i += 1) {
    const got = tide.night(table, { seed: `sig|${i}`, tier: 0, boss: false, open: (k) => OPEN.h05.includes(k) });
    sigs.add(got.sig); ids.add(got.deal.lv);
    assert.ok(!got.sig.includes('hpMul') && !got.sig.includes('difficulty'));
  }
  assert.equal(sigs.size, 200);
  assert.equal(ids.size, 200);
});
