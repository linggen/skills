// 格斗's reach and footsies (2026-11-01, Hanli on his iPhone: 「拳脚都很短, 很难打到对手」 · 「参考拳皇97 … 机器人也有点傻,
// 一直往前跑」). KOF '97's roles for 小满's blows — the lights (冲拳, 弹腿) short and quick, the heavies a 上步 (→ + the
// button: the step in, then the strike) and long, a blocked heavy unsafe, a whiffed limb hit; her mind keeps a range
// and sways in it instead of walking in. Every 格斗 level re-proven: the human-like hands (200 and 320 ms) win within
// three tries, a masher, a wall of blocks and an idle hand lose.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../scripts/games/fighter.js';
import { ME, GAP, limbOut, rulesOf } from '../scripts/games/fighter/core.js';
import { bot } from '../scripts/games/bots/fighter.js';
import { playModule } from '../tools/board-bots.mjs';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const LEVELS = content.games.games.filter((g) => g.mechanic === '格斗' && !g.replaced).flatMap((g) => g.levels ?? []);
const level = (id) => LEVELS.find((l) => l.id === id);

/* He at x, she `d` off, her mind asleep (she only stands). */
function apart(id, d, seed = 'reach') {
  const s = F.newGame(seed, 1, { levels: [level(id)] });
  s.me.x = 400; s.foe.x = 400 + d; s.foe.think = 1e9; s.foe.cd.ice = 1e9;
  return s;
}
const run = (s, ms) => { for (let t = 0; t < ms; t += 10) s = F.tick(s, 10); return s; };

test('the numbers: lights short and quick, heavies a 上步 and long — the heavy kick the longest poke; each longer than before', () => {
  assert.deepEqual([ME.light.reach, ME.lkick.reach, ME.hpunch.reach, ME.heavy.reach], [150, 166, 160, 176]);
  assert.deepEqual([ME.hpunch.lunge, ME.heavy.lunge], [36, 40]);
  const far = (k) => ME[k].reach + (ME[k].lunge ?? 0);
  assert.ok(far('heavy') > far('hpunch') && far('hpunch') > ME.lkick.reach && ME.lkick.reach > ME.light.reach);
  for (const [k, was] of [['light', 108], ['lkick', 134], ['hpunch', 120], ['heavy', 134]]) assert.ok(ME[k].reach > was, `${k} longer than ${was}`);
  assert.ok(ME.light.startup < ME.lkick.startup && ME.lkick.startup < ME.hpunch.startup && ME.hpunch.startup < ME.heavy.startup);
  for (const k of ['hpunch', 'heavy', 'blow']) assert.ok(ME[k].blocked > 0 && ME[k].limb > ME.light.limb, `${k}: unsafe on guard, its limb out`);
});

test('a 拳 lands from where an unarmed foe stands to strike (何七 at 145, past the old 108); a step further it misses', () => {
  let s = F.act(apart('heqi', 145), { g: 'light' }).state;
  s = run(s, 200);
  assert.ok(s.foe.bal < 100, 'the 冲拳 landed');
  s = F.act(apart('heqi', ME.light.reach + 12), { g: 'light' }).state;
  s = run(s, 200);
  assert.equal(s.foe.bal, 100, 'out of reach: a whiff');
});

test('上步: a heavy thrown walking at her steps in and lands from past its reach; thrown standing it whiffs there', () => {
  const d = ME.heavy.reach + 30;
  let s = apart('heqi', d);
  s = F.act(s, { g: 'walk', dir: 1 }).state;
  s = F.act(s, { g: 'heavy' }).state;
  s = run(s, 330);
  assert.ok(s.foe.bal < 100, 'the 上步侧踹 landed');
  let t = F.act(apart('heqi', d), { g: 'heavy' }).state;
  t = run(t, 330);
  assert.equal(t.foe.bal, 100, 'in place: short of her');
  // the step never goes through her
  let u = F.act(F.act(apart('heqi', GAP + 4), { g: 'walk', dir: 1 }).state, { g: 'heavy' }).state;
  u = run(u, 330);
  assert.ok(Math.abs(u.foe.x - u.me.x) >= GAP - 1);
});

test('a whiffed heavy leaves his leg out (her blow reaches it); a heavy she stands off leaves him open longer, a 拳 does not', () => {
  let s = F.act(apart('heqi', 260), { g: 'heavy' }).state;
  s = run(s, ME.heavy.startup + ME.heavy.active + 20);
  assert.equal(limbOut(s), ME.heavy.limb, 'his leg out as it comes back');
  s = run(s, ME.heavy.recover);
  assert.equal(limbOut(s), 0);
  // stood off: her guard up as it lands
  const guarded = (k) => {
    let g = apart('heqi', 120);
    g.foe.act = { k: 'block', at: 0, m: { startup: 0, active: 0, recover: 2000 }, hit: false };
    g = F.act(g, { g: k }).state;
    g = run(g, ME[k].startup + 20);
    return g.me.act?.m.recover ?? 0;
  };
  assert.equal(guarded('heavy'), ME.heavy.recover + ME.heavy.blocked);
  assert.equal(guarded('light'), ME.light.recover);
});

test('footsies: against a hand that stands still, no foe spends most of her free time walking in — she holds and gives ground too', () => {
  for (const L of LEVELS) {
    let s = F.newGame('adv', 1, { levels: [L] });
    const c = { adv: 0, still: 0 };
    for (let t = 0; t < 30000 && s.live && !s.end; t += 20) {
      s = F.tick(s, 20);
      const d = Math.abs(s.foe.x - s.me.x), v = s.foe.vx * -(s.order ?? 1);
      if (d < 330 && !s.foe.act && s.foe.stun <= s.t && !s.palm && !s.edge) c[v > 20 ? 'adv' : 'still'] += 1;
    }
    const share = c.adv / Math.max(1, c.adv + c.still);
    assert.ok(share < 0.6, `${L.id}: walks in ${Math.round(share * 100)}% of her free time`);
  }
});

test('her range by default sits just past his longest blow; a level may set its own (马小宝 at the mirror\'s length)', () => {
  const R = rulesOf(level('heqi'));
  assert.equal(R.foe.ai.range, undefined);
  assert.ok(rulesOf(level('juesai-ma')).foe.ai.range > ME.heavy.reach + ME.heavy.lunge);
  for (const L of LEVELS) for (const k of ['react', 'punish']) assert.ok(rulesOf(L).foe.ai[k] != null, `${L.id}: ${k} set`);
});

test('every 格斗 level: a human-like hand and a slower one win within three tries; a masher, a wall of blocks and an idle hand lose', () => {
  const mash = (x) => (x.end ? null : { g: (x.t / 150 | 0) % 2 ? 'light' : 'heavy' });
  const wall = (x) => (x.in.block ? null : { g: 'block', on: true });
  for (const L of LEVELS) {
    const o = { tries: 3, deal: { levels: [L] }, limit: 180000 };
    assert.ok(playModule(F, bot, o).won, `${L.id}: a human-like hand`);
    assert.ok(playModule(F, bot, { ...o, reaction: 320 }).won, `${L.id}: a 320 ms hand`);
    for (const [name, b] of [['mash', mash], ['wall', wall], ['idle', () => null]]) assert.ok(!playModule(F, b, o).won, `${L.id}: ${name} won`);
  }
});
