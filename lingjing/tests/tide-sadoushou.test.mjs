// 兽潮's 守山门 nights (scripts/games/sadoushou/tide.js): every night a new layout over a ladder row, only beasts of his 回,
// a 大妖 when asked and one is open, won by the kit's first-time human without 结印 (Hanli: 结印 is never needed to win)
// and lost by a player who never moves. The bigger sweep: tools/tide-prove-sadoushou.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tide, dealtOf } from '../scripts/games/sadoushou/tide.js';
import { sim, humanBot, BOTS, jieyinOf, jieyinState, newGame, step, aim } from '../scripts/games/sadoushou/core.js';
import { levelDealt, levelAsked, ladderOf } from '../scripts/games/sadoushou.js';

const at = (p) => new URL(`../${p}`, import.meta.url);
const table = JSON.parse(readFileSync(at('worlds/jiuding/levels/sadoushou.json'), 'utf8'));
const creatures = JSON.parse(readFileSync(at('worlds/jiuding/creatures.json'), 'utf8')).creatures;
const ORDER = { h01: 1, h02: 2, h03: 3, h04: 4, h05: 5, h06: 6, h11: 7, h07: 7, h09: 8 };
const hui = Object.fromEntries(creatures.map((c) => [c.id, c.hui]));
const openAt = (h) => (k) => Boolean(hui[k]) && ORDER[hui[k]] <= ORDER[h];
const only = (...ks) => (k) => ks.includes(k);
// his 回 by the book (creatures.json `hui`: 蠪侄 h04, so h05 has a 大妖), and one with none open (the plain-night fallback)
const OPEN = { h05: openAt('h05'), h07: openAt('h07'), h09: openAt('h09'), 'h05-no-boss': only('yezhu', 'zheng') };
const BOSSES = ['longzhi', 'heyu'];

test('the shape the rotation reads', () => {
  assert.equal(tide.game, 'sadoushou');
  assert.equal(tide.boss, true);
  assert.equal(typeof tide.night, 'function');
  assert.equal(typeof tide.prove, 'function');
  assert.equal(tide.night(table, { seed: 'x', tier: 0, boss: false, open: () => false }), null, 'nothing open: nothing fits');
  assert.equal(tide.night(table, { seed: 'x', tier: 0, boss: true, open: only('longzhi') }), null, 'a 大妖 alone is no night');
});

test('a night: a ladder row with the layout in `over`, deterministic, its beasts his 回\'s, a 大妖 iff asked and open', () => {
  const ladder = new Set(ladderOf(table).map((l) => l.id));
  for (const [h, open] of Object.entries(OPEN)) for (const boss of [false, true]) for (let i = 0; i < 12; i += 1) {
    const ask = { seed: `det|${h}|${i}`, tier: (i % 3) / 2, boss, open };
    const a = tide.night(table, ask), b = tide.night(table, ask);
    assert.deepEqual(a, b, 'the same ask, the same night');
    assert.ok(ladder.has(a.deal.lv), `${a.deal.lv}: a ladder row, never 守灶台`);
    assert.equal(a.deal.tide, true);
    assert.ok(a.kinds.every(open), `${h}: ${a.kinds}`);
    const level = dealtOf(table, a.deal);
    const sent = new Set([...level.waves.flatMap((w) => w.beasts.map(([k]) => k)), ...[level.boss].flat().filter(Boolean).map((x) => x.beast)]);
    assert.deepEqual([...sent].sort(), [...a.kinds].sort(), 'kinds: what the night sends');
    const bossOpen = BOSSES.some(open);
    assert.equal(a.boss, boss && bossOpen, `${h} boss=${boss}`);
    assert.equal([level.boss].flat().filter(Boolean).length, a.boss ? 1 : 0, 'one 大妖 on a boss night, none else');
    // the ladder's look, never 守灶台's: no own ground, no pieces, no belt icons; a night sky
    assert.ok(!level.art && !level.pieces && !level.words, 'no 守灶台 art');
    assert.ok(level.belt.lines.every((ln) => !ln.wall?.icon && !(ln.cards ?? []).some((c) => c.icon)));
    assert.match(level.sky, /-night$/);
    assert.ok(existsArt(`worlds/jiuding/art/backdrop/${level.sky}.webp`), level.sky);
    assert.ok(level.lead.length >= 2 && level.lead.every((l) => l.zh && l.en) && level.lead.at(-1).big);
    assert.ok(level.lead.some((l) => /山门/.test(l.zh)), 'framed at the 山门');
    assert.ok(level.waves.every((w) => !w.span || (w.span[0] <= -0.3 && w.span[1] >= 0.3)), 'every wave down the middle');
    assert.ok(level.belt.lines.every((ln) => ln.col === 'L' || ln.col === 'R'));
  }
});
const existsArt = (p) => { try { readFileSync(at(p)); return true; } catch { return false; } };

test('a boss night offers 结印 once the 大妖 is out (its `when`, boss by default); a plain night never asks for it', () => {
  const night = tide.night(table, { seed: 'jy', tier: 0.5, boss: true, open: OPEN.h07 });
  const level = levelDealt(table, night.deal, '');
  const jy = jieyinOf(table, level);
  assert.equal(jy.when, 'boss');
  assert.ok(jy.moves.length > 0);
  let offered = false, waves = false;
  for (let k = 0; k < 6 && !offered; k += 1) { // a few hands: one that lives to the 大妖
    const g = newGame(table, { ...level, jieyin: jy }, { seed: `jy${k}` }), bot = humanBot(`jy${k}`);
    for (let t = 0; t < 300 && g.phase !== 'won' && g.phase !== 'lost'; t += 1 / 30) {
      aim(g, bot(g)); step(g, 1 / 30); g.events.length = 0;
      if (g.phase === 'waves' && g.live.length && jieyinState(g).on) waves = true;
      if (g.phase === 'boss' && g.bosses.some((b) => b.hp > 0) && jieyinState(g).on) { offered = true; break; }
    }
  }
  assert.equal(waves, false, 'not offered on the waves (boss by default)');
  assert.ok(offered, 'offered while the 大妖 stands');
  const plain = levelDealt(table, tide.night(table, { seed: 'jy', tier: 0.5, boss: false, open: OPEN.h07 }).deal, '');
  assert.equal(plain.boss, null);
});

test('the sig: a structure fingerprint — distinct over 200 nights, the same seed at two tiers the same', () => {
  const sigs = new Set();
  for (let i = 0; i < 200; i += 1) sigs.add(tide.night(table, { seed: `sig|${i}`, tier: 0.5, boss: i % 3 === 0, open: OPEN.h09 }).sig);
  assert.equal(sigs.size, 200); // 720+ nights: tools/tide-prove-sadoushou.mjs --sigs
  const lo = tide.night(table, { seed: 'same', tier: 0, boss: true, open: OPEN.h09 });
  const hi = tide.night(table, { seed: 'same', tier: 1, boss: true, open: OPEN.h09 });
  assert.equal(lo.sig, hi.sig);
});

test('difficulty climbs with tier and plateaus at 1', () => {
  const sum = (tier) => {
    let s = 0;
    for (let i = 0; i < 12; i += 1) {
      const lv = dealtOf(table, tide.night(table, { seed: `climb|${i}`, tier, boss: true, open: OPEN.h07 }).deal);
      s += lv.difficulty * lv.waves.reduce((a, w) => a + w.speed, 0);
    }
    return s;
  };
  const [a, b, c, d] = [0, 0.5, 1, 3].map(sum);
  assert.ok(a < b && b < c, `${a} < ${b} < ${c}`);
  assert.equal(c, d, 'tier past 1 = 1');
});

test('the bot proof: every night won by the first-time human (no 结印) on at least half his tries, ≥ 75% overall; standing still loses', () => {
  const TRIES = 4;
  let won = 0, all = 0;
  const rows = [];
  for (const h of ['h05', 'h07', 'h09']) for (const boss of [false, true]) for (const tier of [0, 0.5, 1]) {
    let w = 0;
    for (let n = 0; n < 4; n += 1) {
      const night = tide.night(table, { seed: `proof|${h}|${boss}|${tier}|${n}`, tier, boss, open: OPEN[h] });
      const level = { ...levelDealt(table, night.deal, ''), jieyin: null };
      let k = 0;
      for (let i = 0; i < TRIES; i += 1) k += sim(table, level, humanBot(`test|${n}|${i}`), { seed: `test|${i}`, casts: false }).won ? 1 : 0;
      assert.ok(k * 2 >= TRIES, `${h} boss=${boss} tier=${tier} #${n}: won ${k}/${TRIES}`);
      assert.equal(sim(table, level, BOTS.idle, { seed: 'idle' }).won, false, `${h} #${n}: standing still must lose`);
      w += k;
    }
    won += w; all += 4 * TRIES;
    rows.push(`${h} b${boss ? 1 : 0} t${tier}: ${Math.round((100 * w) / (4 * TRIES))}%`);
  }
  console.log(`human-bot wins: ${rows.join(' · ')}`);
  assert.ok(won / all >= 0.75, `overall ${won}/${all}`);
});

test('tide.prove plays a dealt night once and says whether it was won', () => {
  const night = tide.night(table, { seed: 'prove', tier: 0.5, boss: true, open: OPEN.h07 });
  const runs = Array.from({ length: 6 }, (_, i) => tide.prove(table, night.deal, `p${i}`));
  assert.ok(runs.every((r) => typeof r === 'boolean'));
  assert.ok(runs.filter(Boolean).length >= 3);
  assert.equal(tide.prove(table, night.deal, 'p0'), runs[0], 'deterministic');
});

test('the mount lays `over` on the row (levelDealt), keeps 结印 on it, and a 兽潮 night offers no 下一关', () => {
  const row = levelAsked(table, { lv: 'songlin' }, '');
  assert.equal(levelDealt(table, { lv: 'songlin' }, ''), row, 'no over: the row itself');
  const over = { waves: [{ t: 1, beasts: [['yezhu', 5]], speed: 4 }], boss: null, sky: 'fog-night' };
  const dealt = levelDealt(table, { lv: 'songlin', over, tide: true }, '');
  assert.equal(dealt.id, 'songlin');
  assert.equal(dealt.waves, over.waves);
  assert.equal(dealt.boss, null);
  assert.equal(dealt.sky, 'fog-night');
  assert.equal(dealt.belt, row.belt, 'what over leaves is the row\'s');
  assert.equal(jieyinOf(table, dealt).when, 'boss', '结印 rides on the dealt level');
  assert.deepEqual(dealtOf(table, { lv: 'songlin', over }), dealt, 'tide.js reads a deal as the mount does');
  const src = readFileSync(at('scripts/games/sadoushou.js'), 'utf8');
  assert.match(src, /levelDealt\(kit, data, search\)/);
  assert.match(src, /jieyin: jieyinOf\(kit, dealt\)/);
  assert.match(src, /data\?\.tide \? null : nextOf\(kit, asked\)/, 'no 下一关 on a 兽潮 night');
});
