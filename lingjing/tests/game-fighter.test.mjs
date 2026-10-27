// 格斗 (games/fighter.js; Hanli 10-26: 「街霸好做吗? 拳皇之类的」 → 「好, 先做秦雁那一场」): the rules of a bout, the book's
// two reads (迎 the edge push · 勾 as she holds back the palm), the grade by whether the palm landed, and a human-like
// hand winning it in a few tries while a masher, a wall of blocks and an idle hand lose.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as F from '../scripts/games/fighter.js';
import { FOE, STAGE } from '../scripts/games/fighter/core.js';
import { bot } from '../scripts/games/bots/fighter.js';
import { playModule, playOnce } from '../tools/board-bots.mjs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const REG = read('../worlds/jiuding/games.json');
const TASKS = read('../worlds/jiuding/tasks/world.json').tasks;
const SCENE = read('../worlds/jiuding/chapters/00-waimen/scenes/wm-yingjian.json');
const row = REG.games.find((g) => g.scene === 'wm-yingjian');
const LEVEL = row.levels[0];
const deal = { levels: [LEVEL] };

const run = (s, ms) => F.tick(s, ms);
const press = (s, d) => F.act(s, d).state;
const until = (s, fn, limit = 20000) => { for (let t = 0; t < limit && !fn(s); t += 10) s = run(s, 10); assert.ok(fn(s), 'never came'); return s; };

/* His back to the oil corner, her at a blade's length, thirty moves in: the next thought is the edge push. */
function atTheEdge(seed = 'edge') {
  const s = F.newGame(seed, 1, deal);
  s.me.x = STAGE.left + 20; s.foe.x = s.me.x + 200; s.foe.moves = 30; s.foe.think = 0; s.foe.cd.ice = 9999;
  return until(s, (x) => x.edge);
}

test('秦雁\'s bout is a fighter board in wm-yingjian: its scene, task, won lines and stars kept', () => {
  assert.equal(row.id, 'fighter');
  assert.equal(row.mechanic, '格斗');
  assert.equal(row.task, 'yingjian-hook');
  assert.equal(row.stars, 3);
  for (const k of ['clean', 'clumsy', 'skipped']) assert.ok(LEVEL.won[k].zh && LEVEL.won[k].en, k);
  assert.match(LEVEL.won.clean.zh, /溜出了台沿/);
  assert.match(LEVEL.won.clumsy.zh, /只剩三分/);
  const task = TASKS.find((t) => t.id === 'yingjian-hook');
  assert.equal(task.game, 'fighter');
  assert.deepEqual(SCENE.show, [{ card: 'board', id: 'yingjian-hook' }]);
  assert.equal(SCENE.exits.find((e) => e.id === 'on').needs.task, 'yingjian-hook');
  assert.equal(F.meta.id, 'fighter');
  assert.equal(typeof F.mount, 'function');
  assert.equal(F.html, undefined, 'mount-only: the story lays it in a host, never as a pure board');
  for (const [k, v] of Object.entries(LEVEL.lines)) assert.ok(v.zh && v.en, `line ${k}`);
});

test('迎: a press before the push is early and she waits again; none in the push and the inch lands; one in it and he comes out on her far side', () => {
  let s = atTheEdge();
  assert.equal(s.edge.phase, 'guard');
  const at = s.edge.at;
  s = press(s, { g: 'light' });
  assert.equal(s.early, 1);
  assert.ok(s.edge.at >= at && s.edge.phase === 'guard', 'she waits again');
  // nothing in the tell: hurt, she steps back
  const hp = s.me.hp;
  s = until(s, (x) => !x.edge);
  assert.ok(s.me.hp <= hp - FOE.moves.edge.dmg, 'the inch lands');
  // again, answered this time
  s = atTheEdge('edge-2');
  s = until(s, (x) => x.edge?.phase === 'tell');
  const heels = s.me.x;
  s = press(s, { g: 'walk', dir: 1 });
  assert.equal(s.edge, null);
  assert.ok(s.foe.x < s.me.x, 'he is past her');
  assert.ok(Math.abs(s.foe.x - heels) < 10, 'she stands where his heels were: over the slick');
  assert.ok(F.tick(s, 10).palm || s.palm, 'she lets the scabbard go: the palm at once');
});

test('勾 as she holds back: over the slick she skids off the edge — clean, three stars', () => {
  let s = atTheEdge('hook');
  s = until(s, (x) => x.edge?.phase === 'tell');
  s = press(s, { g: 'light' });
  s = until(s, (x) => x.palm?.phase === 'hold');
  s = press(s, { g: 'heavy' });
  s = until(s, (x) => x.won, 6000);
  assert.equal(s.grade, 'clean');
  assert.equal(s.stars, 3);
  assert.equal(s.palmLanded, 0);
});

test('the palm lands at three tenths and never ends him (大比不许伤人性命); hooked after it, the win is clumsy', () => {
  let s = atTheEdge('palm');
  s = until(s, (x) => x.edge?.phase === 'tell');
  s = press(s, { g: 'light' });
  s.me.hp = 5;
  s = until(s, (x) => x.palmLanded > 0);
  assert.equal(s.me.hp, 1, 'three tenths of a palm, and he is still on the stage');
  s = until(s, (x) => x.me.stun <= x.t);
  s = press(s, { g: 'heavy' });
  s = until(s, (x) => x.won, 6000);
  assert.equal(s.grade, 'clumsy');
  assert.ok(s.stars < 3);
});

test('a hook on dry stone staggers her, never takes her off; she never strikes a man who is down; the spell keeps its cooldown', () => {
  let s = F.newGame('dry', 1, deal);
  s.me.x = 500; s.foe.x = 580; s.foe.bal = 40; s.foe.think = 0; s.foe.cd.ice = 9999;
  s = until(s, (x) => x.palm?.phase === 'hold', 20000);
  s = press(s, { g: 'heavy' });
  s = run(s, 1500);
  assert.equal(s.end, null);
  assert.ok(!s.won && s.foe.x >= STAGE.left);
  // down: her hands stay still
  s = F.newGame('down', 1, deal);
  s.me.x = 400; s.foe.x = 560; s.me.stun = 4000; s.foe.think = 0;
  const moves = s.foe.moves;
  s = run(s, 3000);
  assert.equal(s.foe.moves, moves, '不踩人');
  // the spell
  s = F.newGame('cd', 1, deal);
  s = press(s, { g: 'special' });
  s = run(s, 600);
  assert.ok(s.me.cd > 0);
  const shots = s.snd.fire;
  s = press(s, { g: 'special' });
  s = run(s, 600);
  assert.equal(s.snd.fire, shots, 'not again before its cooldown');
});

test('both thumbs at once: walking holds while a blow is pressed; presses buffer through a move; the same hands, the same bout', () => {
  let s = F.newGame('hands', 1, deal);
  s = press(s, { g: 'walk', dir: 1 });
  s = press(s, { g: 'light' });
  assert.equal(s.in.dir, 1);
  s = run(s, 200);
  s = press(s, { g: 'light' }); // late in the jab: it waits in the buffer for his hands
  s = run(s, 400);
  assert.ok((s.snd.swing ?? 0) >= 2, 'the buffered jab came out');
  assert.equal(s.in.dir, 1);
  const a = playOnce(F, bot, { seed: 'same', limit: 90000 }), b = playOnce(F, bot, { seed: 'same', limit: 90000 });
  assert.deepEqual(a, b);
});

test('a human-like hand wins within three tries, in a bout of a minute or so; a masher, a wall of blocks and an idle hand lose', () => {
  const r = playModule(F, bot, { tries: 3, deal, limit: 180000 });
  assert.ok(r.won, `lost all three: ${JSON.stringify(r.runs)}`);
  const won = r.runs.at(-1);
  assert.ok(won.ms >= 20000 && won.ms <= 120000, `${won.ms} ms`);
  const slow = playModule(F, bot, { tries: 3, deal, limit: 180000, reaction: 320 });
  assert.ok(slow.won, 'a slower hand (320 ms) too');
  const mash = (s) => (s.end ? null : { g: (s.t / 150 | 0) % 2 ? 'light' : 'heavy' });
  const wall = (s) => (s.in.block ? null : { g: 'block', on: true });
  for (const [name, b] of [['mash', mash], ['wall', wall], ['idle', () => null]]) {
    const x = playModule(F, b, { tries: 3, deal, limit: 180000 });
    assert.ok(!x.won, `${name} won`);
  }
});

test('its sounds: every name a bout makes is declared', () => {
  const heard = new Set();
  const hear = (s, n) => { for (const e of F.sounds(s, n)) heard.add(e); return n; };
  const spy = { ...F, tick: (s, ms) => hear(s, F.tick(s, ms)), act: (s, d) => { const r = F.act(s, d); hear(s, r.state); return r; } };
  playOnce(spy, bot, { seed: 'snd', deal, limit: 120000 });
  for (const e of heard) assert.ok(F.meta.sounds.includes(e), e);
  for (const e of ['hit', 'block', 'glow', 'hook', 'slip']) assert.ok(heard.has(e), `${e} sounded`);
});

/* ── v2/v3 (Hanli 10-27: 「组合技什么的都加一下」; KOF '97's four buttons: K 轻拳 · L 轻腿 · O 重拳 · ; 重腿) ── */

/* Her standing still close by, thinking of nothing for a while: a dummy for his hands. */
function dummy(seed = 'dummy', gap = 90) {
  const s = F.newGame(seed, 1, deal);
  s.me.x = 400; s.foe.x = 400 + gap; s.foe.think = 1e9; s.foe.cd.ice = 1e9;
  return s;
}
const hand = (s, list) => { for (const [d, ms] of list) { s = press(s, d); s = run(s, ms); } return s; };
const down = [{ g: 'crouch', on: true }, 30], up = [{ g: 'crouch', on: false }, 0];
const fwd = [{ g: 'walk', dir: 1 }, 30], stop = [{ g: 'walk', dir: 0 }, 0];

test('a chain: K K L into a reeling foe counts 「3 连」, each blow a little lighter; K O chains; a 重 cancels into 掌心火', () => {
  let s = dummy('chain');
  s = hand(s, [[{ g: 'light' }, 150], [{ g: 'light' }, 150], [{ g: 'lkick' }, 260]]); // a hand's pace: apart enough never to read as K+L
  assert.equal(s.best, 3, 'three in a chain');
  assert.ok((s.snd.combo ?? 0) >= 2);
  s = hand(dummy('ko'), [[{ g: 'light' }, 120], [{ g: 'hpunch' }, 300]]);
  assert.equal(s.best, 2, 'K then O');
  // ; then S D + K: the 重腿 cut short into 掌心火
  s = dummy('cancel');
  s = hand(s, [[{ g: 'heavy' }, 200], down, up, fwd, [{ g: 'light' }, 400]]);
  assert.equal(s.snd.palmfire ?? 0, 1, '掌心火 came out of the 重腿');
  assert.equal(s.best, 2);
});

test('motions + 拳: S D 掌心火 (O the heavier one), D S D 升勾, S D S D the 绝; a plain 拳 is a 拳; the phone\'s 技 gives them', () => {
  let s = hand(dummy('pf', 300), [down, up, fwd, stop, [{ g: 'light' }, 300]]);
  assert.equal(s.snd.palmfire, 1);
  assert.equal(s.me.act?.k === 'palmfire' || s.shots.some((x) => x.kind === 'palmfire') || (s.snd.palmfire === 1), true);
  s = hand(dummy('pfh', 300), [down, up, fwd, stop, [{ g: 'hpunch' }, 350]]);
  assert.ok(s.shots.some((x) => x.heavy) || (s.snd.palmfire === 1 && s.foe.bal < 100), 'O throws the heavier fire');
  s = hand(dummy('rise'), [fwd, stop, down, up, fwd, [{ g: 'light' }, 300]]);
  assert.equal(s.snd.rise, 1);
  s = dummy('sup'); s.me.qi = 100;
  s = hand(s, [down, up, fwd, stop, down, up, fwd, [{ g: 'light' }, 30]]);
  assert.ok(s.cutin, 'S D S D + 拳 with a stock: the 绝');
  s = hand(dummy('plain'), [[{ g: 'light' }, 300]]);
  assert.equal(s.snd.palmfire ?? 0, 0);
  s = hand(dummy('skill', 300), [[{ g: 'skill' }, 300]]);
  assert.equal(s.snd.palmfire, 1);
  s = hand(dummy('skill2'), [[{ g: 'walk', dir: 1 }, 20], [{ g: 'skill' }, 300]]);
  assert.equal(s.snd.rise, 1);
  s = dummy('skill3'); s.me.qi = 120;
  s = hand(s, [[{ g: 'skill' }, 30]]);
  assert.ok(s.cutin, 'with a stock full, 技 is the 绝');
});

test('two buttons at once: K+L rolls (迎), O+; blows her back; 气 in three stocks, a 绝 costs one and cuts in', () => {
  let s = dummy('roll', 80);
  const order = s.order;
  s = hand(s, [[{ g: 'light' }, 0], [{ g: 'lkick' }, 500]]);
  assert.equal(s.snd.roll, 1);
  assert.equal(s.order, -order, 'past her');
  s = dummy('blow', 100);
  const x0 = s.foe.x;
  s = hand(s, [[{ g: 'hpunch' }, 0], [{ g: 'heavy' }, 600]]);
  assert.ok(s.foe.x - x0 > 120, `blown back ${s.foe.x - x0}`);
  s = dummy('qi');
  s = hand(s, [[{ g: 'light' }, 300]]);
  assert.ok(s.me.qi > 0);
  s.me.qi = 250;
  s = press(s, { g: 'super' });
  s = run(s, 30);
  assert.ok(s.cutin && s.cutin.who === 'me', 'the cut-in');
  assert.equal(s.me.qi, 150, 'one stock spent');
  s = run(s, 2000);
  assert.ok((s.snd.super ?? 0) >= 1, 'the fire wave landed');
  s = dummy('none'); s.me.qi = 60;
  s = hand(s, [[{ g: 'super' }, 300]]);
  assert.equal(s.supers, 0, 'nothing without a stock');
  s = dummy('cap'); s.me.qi = 298;
  s = hand(s, [[{ g: 'light' }, 300]]);
  assert.equal(s.me.qi, 300, 'three stocks at most');
});

test('KOF\'s feet: a double tap dashes in; a tap of W hops lower than a held jump; the roll goes through her blade untouched', () => {
  let s = dummy('dash', 300);
  const x0 = s.me.x;
  s = hand(s, [[{ g: 'walk', dir: 1 }, 30], [{ g: 'walk', dir: 0 }, 30], [{ g: 'walk', dir: 1 }, 10], [{ g: 'walk', dir: 0 }, 300]]);
  assert.equal(s.snd.dash, 1);
  assert.ok(s.me.x - x0 > 100, `dashed ${s.me.x - x0}`);
  const peak = (release) => { let t = dummy('hop', 400), top = 0; t = press(t, { g: 'jump' }); t = run(t, 40); if (release) t = press(t, { g: 'jumpRelease' }); for (let i = 0; i < 80; i += 1) { t = run(t, 10); top = Math.max(top, t.me.y); } return top; };
  assert.ok(peak(true) < peak(false) * 0.6, 'a hop is low');
  s = dummy('safe', 150); s.foe.think = 0;
  s = until(s, (x) => x.foe.act && ['poke', 'thrust'].includes(x.foe.act.k), 4000);
  s = until(s, (x) => x.t - x.foe.act.at >= x.foe.act.m.startup - 60, 2000);
  const hp = s.me.hp;
  s = press(s, { g: 'ying' });
  s = run(s, 250);
  assert.equal(s.me.hp, hp, 'rolled through the blade');
});

test('the move list names every move with its keys, for the pause veil', () => {
  const lines = F.moveLines(LEVEL, 'zh', 'desk');
  for (const want of ['掌心火', 'S D + K/O', '升勾', 'D S D + K/O', 'S D S D', 'K K L', 'K+L', 'O+;']) assert.ok(lines.some((l) => l.includes(want)), want);
  assert.ok(F.moveLines(LEVEL, 'zh', 'touch').some((l) => l.includes('技')));
});
