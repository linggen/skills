// A 试 (battle.js § trial): a story trial is passed, not won by a kill — the
// beast yields at `trial.yield` of its 气血, and a player still standing when
// its cards are spent has passed (not a withdrawal). 冰夷's dragons (古十)
// must be reliably passable with the hand the road deals by then.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, begin, foeTurn, offers } from '../scripts/battle.js';
import { loadContent } from '../scripts/content.mjs';
import { fightSetup } from '../scripts/rules.mjs';
import { creatureOf } from '../scripts/rules/world.mjs';
import { fightOnce, roadHand } from '../tools/trial-sim.mjs';
import fs from 'node:fs';

const content = loadContent();
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/ji-altar.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-09-29T11:00:00Z');

test('冰夷双龙 is a trial: it yields at 35% and is passed by outlasting it; the door carries it', () => {
  const dragons = creatureOf(content, 'foe-shuanglong');
  assert.equal(dragons.trial.yield, 0.35);
  assert.equal(dragons.trial.outlast, true);
  assert.ok(dragons.trial.goal.zh && dragons.trial.goal.en);
  assert.deepEqual(fightSetup(content, fixture, dragons, NOW).foe.trial, dragons.trial);
});

test('a trial yields when its 气血 falls to its mark — a win, logged as passed', () => {
  const setup = { mode: 'pve', seed: 'y', you: { tier: 'foundation', root: 'earth', deck: ['shuiwu', 'shuiwu', 'shuiwu'], extra: [] }, foe: { tier: 'foundation', root: 'water', deck: ['shuiwu', 'shuiwu', 'shuiwu', 'shuiwu', 'shuiwu', 'shuiwu'], trial: { yield: 0.5 } } };
  const st = begin(setup, catalog);
  const mark = st.foe.hpMax * 0.5;
  for (let g = 0; g < 60 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const o = offers(st).find(x => x.ok && x.action.kind !== 'end');
    act(st, o ? o.action : { kind: 'end' }, 'you');
  }
  assert.equal(st.outcome, 'won');
  assert.ok(st.foe.hp > 0 && st.foe.hp <= mark, `stopped at the mark, not at 0 (${st.foe.hp}/${st.foe.hpMax})`);
  assert.equal(st.log.find(t => t.act === 'trial-passed')?.how, 'yield');
});

test('a trial outlasted is passed: its cards spent while he stands is a win, not a withdrawal', () => {
  const setup = { mode: 'pve', seed: 'o', you: { tier: 'foundation', root: 'earth', deck: ['tuou', 'tuou'], extra: [] }, foe: { tier: 'foundation', root: 'water', deck: ['gupi', 'gupi', 'gupi', 'gupi'], trial: { outlast: true } } };
  const st = begin(setup, catalog);
  for (let g = 0; g < 80 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    act(st, { kind: 'end' }, 'you');
  }
  assert.equal(st.outcome, 'won');
  assert.equal(st.log.find(t => t.act === 'trial-passed')?.how, 'outlast');
  const plain = begin({ ...setup, foe: { ...setup.foe, trial: null } }, catalog);
  for (let g = 0; g < 80 && plain.outcome === 'open'; g += 1) {
    if (plain.whose === 'foe') { foeTurn(plain); continue; }
    act(plain, { kind: 'end' }, 'you');
  }
  assert.equal(plain.outcome, 'withdrew', 'an ordinary beast still withdraws');
});

test('the ji-altar save holds the road\'s hand, and a careful player passes the dragons ≥ 90% with it', () => {
  const road = roadHand(fixture);
  assert.deepEqual([...fixture.cards].sort(), [...road.cards].sort(), 'the fixture is the road hand (tools/trial-sim.mjs roadHand)');
  const dragons = creatureOf(content, 'foe-shuanglong');
  let won = 0;
  const n = 60;
  for (let k = 0; k < n; k += 1) if (fightOnce({ ...fightSetup(content, fixture, dragons, NOW), seed: `gate|${k}` }).outcome === 'won') won += 1;
  assert.ok(won / n >= 0.9, `passed ${won}/${n}`);
});

/* 蛫 (古七, wm-wangzuo `open`) is mandatory: its 12 cards and its 杀招 must
   not outlast a careful player. Live 2026-10-01 it was 9.8% (four taunt walls
   and a heal of 12 at half); weighed now like 狰 (≈77%) and 蠪侄 (≈77%). */
test('蛫 is a fair story fight: a careful player wins it about three times in four', () => {
  const gui = creatureOf(content, 'gui');
  const rate = (hand) => {
    let won = 0;
    const n = 120;
    for (let k = 0; k < n; k += 1) if (fightOnce({ ...fightSetup(content, hand, gui, NOW), seed: `trial|${k}` }).outcome === 'won') won += 1;
    return won / n;
  };
  const full = rate(roadHand(fixture)), then = rate(roadHand(fixture, NOW, 'gui'));
  assert.ok(full >= 0.65 && full <= 0.9, `the road hand wins ${(full * 100).toFixed(1)}%`);
  assert.ok(then >= 0.65, `the hand held at 古七 wins ${(then * 100).toFixed(1)}%`);
});

/* 三十招 (古六, wm-lun2): 秦雁 is a 试 passed by standing through her moves,
   as the book has it — never by driving her down. */
test('秦雁 is a dodge trial: outlasted, passed; no yield', () => {
  const qin = creatureOf(content, 'foe-shijie');
  assert.equal(qin.trial?.outlast, true);
  assert.equal(qin.trial?.yield, undefined, 'he never drives her down');
  assert.match(qin.trial.goal.zh, /三十招/);
  let won = 0;
  const n = 60, hand = roadHand(fixture, NOW, 'foe-shijie');
  for (let k = 0; k < n; k += 1) if (fightOnce({ ...fightSetup(content, hand, qin, NOW), seed: `trial|${k}` }).outcome === 'won') won += 1;
  assert.ok(won / n >= 0.9, `passed ${won}/${n}`);
});
