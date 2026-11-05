// 格斗's chain cap (Hanli 11-05 on the Mac: 「格斗可以卡bug, 我刚刚打出84连了」): a light cancelled into a light while she
// still reeled chained for ever. Now each blow of a chain stuns her a little shorter (comboStun) and past COMBO_CAP she
// bursts out — a 3–6 hit chain stays whole; and in a bout to stand through (秦雁's 二十四招), her 血 emptied anyway ends it
// early as won, paid as standing through it, never an empty bar that does nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../scripts/games/fighter.js';
import { COMBO_CAP, comboStun } from '../scripts/games/fighter/core.js';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const LEVELS = content.games.games.filter((g) => g.mechanic === '格斗' && !g.replaced).flatMap((g) => g.levels ?? []);
const level = (id) => LEVELS.find((l) => l.id === id);
const run = (s, ms) => { for (let t = 0; t < ms; t += 10) s = F.tick(s, 10); return s; };
const press = (s, d) => F.act(s, d).state;

/* The bout under way, then him close on her — in the corner by default (her back to the stage's right end, where no
   blow pushes her clear: where the 84 ran) — her mind asleep, so she only reels. */
function close(id, seed = 'cap', [mx, fx] = [820, 900]) {
  let s = F.newGame(seed, 1, { levels: [level(id)] });
  s = run(s, 1600);
  s.me.x = mx; s.foe.x = fx; s.foe.think = 1e9; s.foe.cd.ice = 1e9;
  return s;
}

test('the 84 loop: light into light at her, as fast as the hands allow, stops at the cap', () => {
  // Before the cap the same hands chained 199 in this corner (light · light kick every 100–150 ms, KOF's cancel).
  for (const [pat, gap] of [[['light'], 70], [['lkick'], 150], [['light', 'lkick'], 100]]) {
    let s = close('qinyan');
    for (let i = 0; i < 200 && !s.end; i += 1) { s = press(s, { g: pat[i % pat.length] }); s = run(s, gap); }
    assert.ok(s.best >= 6, `${pat}: a real chain still lands (${s.best})`);
    assert.ok(s.best <= COMBO_CAP, `${pat}: never past the cap: ${s.best}`);
  }
});

test('a 3–6 hit chain stays whole: the first three blows stun her in full, the scaling only bites further on', () => {
  assert.deepEqual([1, 2, 3].map(comboStun), [1, 1, 1]);
  assert.ok(comboStun(6) > 0.7 && comboStun(6) < 1);
  assert.ok(comboStun(20) >= 0.5);
});

test('no input sequence chains past the cap: a random search over the four buttons, crouch, walk and jump', () => {
  const MOVES = [
    { g: 'light' }, { g: 'lkick' }, { g: 'heavy' }, { g: 'hpunch' }, { g: 'light', crouch: true }, { g: 'lkick', crouch: true },
    { g: 'heavy', crouch: true }, { g: 'walk', dir: 1 }, { g: 'walk', dir: -1 }, { g: 'walk', dir: 0 }, { g: 'jump' },
  ];
  let rnd = 7;
  const r = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  let best = 0;
  for (let trial = 0; trial < 60; trial += 1) {
    let s = close('qinyan', `rand-${trial}`, trial % 2 ? [820, 900] : [400, 520]);
    for (let i = 0; i < 160 && !s.end; i += 1) {
      s = press(s, MOVES[Math.floor(r() * MOVES.length)]);
      s = run(s, 20 + Math.floor(r() * 120));
    }
    best = Math.max(best, s.best ?? 0);
  }
  assert.ok(best <= COMBO_CAP, `the longest chain found: ${best}`);
});

test('撑过她的剑: her 血 emptied before her 二十四招 ends the bout early — won, her sword sheathed with the level\'s line', () => {
  const lv = level('futian');
  assert.ok(lv?.outlast?.moves, 'the survival bout');
  assert.ok(lv.lines?.sheathe?.zh, 'its sheathe line');
  let s = close('futian', 'sheathe');
  s.foe.bal = 1;
  for (let i = 0; i < 40 && !s.end; i += 1) { s = press(s, { g: 'light' }); s = run(s, 120); }
  assert.ok(s.end, 'the bout ended');
  assert.equal(s.end.kind, 'outlast');
  assert.ok(s.end.early && s.end.won);
  s = run(s, 2500);
  assert.equal(s.won, true, 'won, as standing through it');
  assert.ok(s.stars >= 1);
});
