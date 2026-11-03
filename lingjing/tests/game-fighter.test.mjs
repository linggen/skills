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
  for (const seed of ['snd', 'snd-2', 'snd-3']) playOnce(spy, bot, { seed, deal, limit: 120000 }); // v7: a bout may end by the 绝 before her palm
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

test('KOF\'s feet: a double tap runs in while held (v7: it stops when let go); a tap of W hops lower than a held jump; the roll goes through her blade untouched', () => {
  let s = dummy('dash', 400);
  const x0 = s.me.x;
  s = hand(s, [[{ g: 'walk', dir: 1 }, 30], [{ g: 'walk', dir: 0 }, 30], [{ g: 'walk', dir: 1 }, 260]]);
  assert.equal(s.snd.dash, 1);
  assert.ok(s.me.x - x0 > 100, `ran ${s.me.x - x0}`);
  const x1 = s.me.x;
  s = hand(s, [[{ g: 'walk', dir: 0 }, 300]]);
  assert.ok(s.me.x - x1 < 20, `let go, it stops (${s.me.x - x1})`);
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
  // In English, every line English: the keys' words and the touch buttons' faces too (Hanli 11-02: 「不少UI上没有英文」).
  for (const kind of ['desk', 'touch']) for (const l of F.moveLines(LEVEL, 'en', kind)) assert.ok(!/[\u3400-\u9fff]/.test(l), `${kind}: ${l}`);
});

/* The painted frames (tools/fighter-frames.py; Hanli 10-27: frame by frame, as KOF '97 is made). */
import { frameOf } from '../scripts/games/fighter/draw.js';
const CLIPS = {
  me: ['idle', 'walk', 'back', 'crouch', 'jump', 'air', 'light', 'lkick', 'hpunch', 'heavy', 'clight', 'clkick', 'chpunch', 'cheavy', 'blow', 'rise', 'cast', 'super', 'block', 'cblock', 'hit', 'knock', 'dash', 'roll', 'win', 'lose'],
  foe: ['idle', 'walk', 'back', 'poke', 'thrust', 'ice', 'edge', 'glow', 'hold', 'strike', 'block', 'hit', 'jianqi', 'slip', 'win', 'lose'],
};

test('every fighter has one painted sheet whose clips name only frames it holds, one for every state the board draws', () => {
  for (const who of ['me', 'foe']) {
    const look = LEVEL[who].look;
    assert.ok(look.sheet, who);
    const meta = read(`../worlds/jiuding/${look.sheet}.json`);
    assert.ok(fs.statSync(new URL(`../worlds/jiuding/${look.sheet}.webp`, import.meta.url)).size > 1000);
    assert.ok(meta.stand > 200, 'the standing figure is tall enough for the board');
    for (const c of CLIPS[who]) assert.ok(meta.clips[c], `${who} clip ${c}`);
    for (const [name, c] of Object.entries(meta.clips)) {
      for (const f of [...c.frames, ...(c.calm ?? [])]) assert.ok(meta.frames[f], `${who} ${name}: ${f}`);
      if (c.hit != null) assert.ok(c.hit < c.frames.length, `${who} ${name} hit`);
    }
    for (const [name, f] of Object.entries(meta.frames)) assert.equal(f.rect.length, 4, name);
  }
});

test('a blow shows its strike frame exactly while it can land; loops go round at their fps; reduced motion keeps the calm frames', () => {
  const clip = { frames: ['a', 'b', 'c', 'd'], hit: 1, fps: 10, calm: ['a', 'b'] };
  const m = { startup: 100, active: 80, recover: 200 };
  assert.equal(frameOf(clip, 10, m), 'a');
  assert.equal(frameOf(clip, 100, m), 'b');
  assert.equal(frameOf(clip, 230, m), 'b');
  assert.equal(frameOf(clip, 250, m), 'c');
  assert.equal(frameOf(clip, 400, m), 'd');
  assert.equal(frameOf(clip, 400, m, true), 'b');
  const loop = { frames: ['x', 'y', 'z'], fps: 10, loop: true };
  assert.deepEqual([0, 100, 200, 300].map((e) => frameOf(loop, e)), ['x', 'y', 'z', 'x']);
  assert.equal(frameOf({ frames: ['p', 'q'], fps: 10 }, 5000), 'q');
});

/* 流云剑 · 整座崖 (09-fangshi, 2026-10-28, Hanli: 「故事里的战斗可以用格斗」): 秦雁 on the cliff, 「这回的台子是整座崖，没有台边」
   — no slick, no edge push, no palm; a bout to stand through (`outlast`), ending as the book's 「头一场，不到二十招，她的剑尖便
   停在了他心口上」. A human-like hand stands it; a masher, a wall of blocks and an idle hand go down. */
test('流云剑 · 整座崖: an outlast bout on the cliff — no slick, no edge, no palm; stood through, her point rests at his heart', () => {
  const r = REG.games.find((g) => g.task === 'fangshi-liuyun' && !g.replaced);
  assert.equal(r.id, 'fighter');
  assert.equal(r.mechanic, '格斗');
  assert.equal(r.group, 'h11');
  const L = r.levels[0], d = { levels: [L] };
  assert.equal(L.stage.oil, false);
  assert.ok(L.outlast.moves >= 15, 'twenty moves, as the book counts them');
  assert.match(L.won.clean.zh, /剑尖停在了他心口上/);
  assert.ok(L.lines.outlast.zh && L.lines.outlast.en);
  const task = TASKS.find((t) => t.id === 'fangshi-liuyun');
  assert.equal(task.game, 'fighter');
  assert.deepEqual(task.how, r.how);
  // A bout with no slick: the edge push and the palm never come, she never leaves the stage, and the end is 'outlast'.
  let s = F.newGame('cliff', 1, d), saw = { edge: false, palm: false };
  for (let t = 0; t < 120000 && s.live; t += 10) { const a = bot(s); if (a) s = press(s, a); s = run(s, 10); saw.edge ||= Boolean(s.edge); saw.palm ||= Boolean(s.palm); }
  assert.deepEqual(saw, { edge: false, palm: false });
  const h = playModule(F, bot, { tries: 3, deal: d, limit: 180000 });
  assert.ok(h.won, `lost all three: ${JSON.stringify(h.runs)}`);
  assert.ok(playModule(F, bot, { tries: 3, deal: d, limit: 180000, reaction: 320 }).won, 'a slower hand (320 ms) too');
  const mash = (x) => (x.end ? null : { g: (x.t / 150 | 0) % 2 ? 'light' : 'heavy' });
  const wall = (x) => (x.in.block ? null : { g: 'block', on: true });
  for (const [name, b] of [['mash', mash], ['wall', wall], ['idle', () => null]]) assert.ok(!playModule(F, b, { tries: 3, deal: d, limit: 180000 }).won, `${name} won`);
});

test('an outlast bout is graded by what is left of him; the 大比\'s bout (the slick) is untouched by it', () => {
  const L = REG.games.find((g) => g.task === 'fangshi-liuyun').levels[0];
  let s = F.newGame('g', 1, { levels: [L] });
  s = { ...s, me: { ...s.me, hp: 40 }, foe: { ...s.foe, moves: L.outlast.moves, act: null, stun: 0 } };
  s = run(s, 10);
  assert.equal(s.end?.kind, 'outlast');
  s = run(s, 3000);
  assert.deepEqual([s.won, s.grade, s.stars], [true, 'clumsy', 2]);
  assert.equal(LEVEL.outlast, undefined, '迎剑 is won only over the slick');
});

/* 秦雁's monthly bout (09-futian, 2026-10-28): the card duel (her outlast trial) as 格斗 — the cliff again, longer than 流云剑's
   twenty and harder; the way on waits on the board. */
test('撑过她的剑 · 你又跑: 09-futian\'s bout is a 格斗 board, a longer outlast than 流云剑\'s; a human-like hand stands it, the rest go down', () => {
  const r = REG.games.find((g) => g.task === 'futian-spar' && !g.replaced);
  const liu = REG.games.find((g) => g.task === 'fangshi-liuyun').levels[0];
  assert.deepEqual([r.id, r.mechanic, r.group, r.scene], ['fighter', '格斗', 'h11', '09-futian']);
  const L = r.levels[0], d = { levels: [L] };
  assert.equal(L.stage.oil, false);
  assert.ok(L.outlast.moves > liu.outlast.moves, 'more of her moves than 流云剑');
  assert.ok(L.foe.rules.moves.thrust.dmg > liu.foe.rules.moves.thrust.dmg, 'and heavier');
  const sc = read('../worlds/jiuding/chapters/00-zhuji/scenes/09-futian.json');
  assert.deepEqual(sc.show.at(-1), { card: 'board', id: 'futian-spar' }, 'the bout is the scene\'s last board');
  assert.equal(sc.exits[0].game, undefined, 'no card duel left: the bout is played once');
  assert.equal(sc.exits[0].needs.task, 'futian-spar');
  assert.ok(playModule(F, bot, { tries: 3, deal: d, limit: 180000 }).won, 'a human-like hand');
  assert.ok(playModule(F, bot, { tries: 3, deal: d, limit: 180000, reaction: 320 }).won, 'a slower hand (320 ms) too');
  const mash = (x) => (x.end ? null : { g: (x.t / 150 | 0) % 2 ? 'light' : 'heavy' });
  const wall = (x) => (x.in.block ? null : { g: 'block', on: true });
  for (const [name, b] of [['mash', mash], ['wall', wall], ['idle', () => null]]) assert.ok(!playModule(F, b, { tries: 3, deal: d, limit: 180000 }).won, `${name} won`);
});

/* 秦雁 in the gate pools (主力 spread, second pass, 2026-10-31): 秦雁 · 崖顶 (09-suifeng) and 秦雁 · 后山崖顶 (09-shenshi), each
   the cliff's outlast bout re-weighed on her painted sheet — 崖顶 between 流云剑's twenty and 撑过她的剑's twenty-four, 后山崖顶
   past both. Ids, pay and done lines kept; a human-like hand stands each, the rest go down. */
test('秦雁 in the pools: 崖顶 and 后山崖顶 are 格斗 outlast bouts on the climb; a human-like hand stands each, the rest go down', () => {
  const lv = (t) => REG.games.find((g) => g.task === t && !g.replaced);
  const liu = lv('fangshi-liuyun').levels[0], fu = lv('futian-spar').levels[0];
  const H09 = read('../worlds/jiuding/tasks/h09.json').tasks, H11 = read('../worlds/jiuding/tasks/h11.json').tasks;
  for (const [task, tasks, lo, hi] of [['suifeng-qinyan', H11, liu, fu], ['shenshi-qinyan', H09, fu, null]]) {
    const r = lv(task);
    assert.deepEqual([r.id, r.mechanic], ['fighter', '格斗'], task);
    const t = tasks.find((x) => x.id === task);
    assert.equal(t.game, 'fighter'); assert.deepEqual(t.how, r.how); assert.equal(t.deal, undefined);
    const L = r.levels[0], d = { levels: [L] };
    assert.equal(L.stage.oil, false);
    assert.equal(L.foe.look.sheet, 'art/games/fighter/qinyan', 'her painted sheet');
    assert.ok(L.outlast.moves > lo.outlast.moves && (!hi || L.outlast.moves < hi.outlast.moves), `${task}: ${L.outlast.moves} moves`);
    assert.ok(playModule(F, bot, { tries: 3, deal: d, limit: 180000 }).won, `${task}: a human-like hand`);
    assert.ok(playModule(F, bot, { tries: 3, deal: d, limit: 180000, reaction: 320 }).won, `${task}: a slower hand (320 ms) too`);
    const mash = (x) => (x.end ? null : { g: (x.t / 150 | 0) % 2 ? 'light' : 'heavy' });
    const wall = (x) => (x.in.block ? null : { g: 'block', on: true });
    for (const [name, b] of [['mash', mash], ['wall', wall], ['idle', () => null]]) assert.ok(!playModule(F, b, { tries: 3, deal: d, limit: 180000 }).won, `${task}: ${name} won`);
  }
});

/* ── v4 (10-31): the 结印's spells in the fighter — I 飞剑 · U 符文, each its cooldown, its number ── */

test('飞剑: I sends a flying sword that lands where she stands after its flight, shows the 稳 it took, and cools down', () => {
  let s = dummy('feijian', 320);
  const bal = s.foe.bal, M = s.R.me.feijian;
  s = press(s, { g: 'feijian' });
  s = run(s, M.startup + 20);
  const sword = s.shots.find((x) => x.kind === 'feijian' && x.who === 'me');
  assert.ok(sword, 'in the air');
  assert.equal(sword.land - sword.at, M.fly);
  s.foe.x -= 60; // she steps: it still finds her
  s = run(s, M.fly);
  assert.ok(s.foe.bal < bal, 'it lands');
  const num = s.fx.find((f) => f.kind === 'num');
  assert.equal(num.n, Math.round(bal - s.foe.bal), 'the number is the 稳 it took');
  assert.ok(s.me.cdFj > 0, 'cooling');
  const again = press(run(s, 600), { g: 'feijian' });
  assert.ok(!run(again, 300).shots.some((x) => x.kind === 'feijian'), 'not again while it cools');
  // a guard takes it as a chip
  let g = dummy('feijian-guard', 320);
  g = run(press(g, { g: 'feijian' }), M.startup + 20);
  g.foe.act = { k: 'block', at: g.t, m: { startup: 0, active: 0, recover: 5000 } };
  const b0 = g.foe.bal;
  g = run(g, M.fly);
  assert.ok(b0 - g.foe.bal < M.dmg * 0.5, 'stood off: a chip');
});

test('符文: U lays a talisman at her feet; it binds her if she still stands on it when it arms, and fizzles if she stepped off', () => {
  const M = F.newGame('x', 1, deal).R.me.fuwen;
  let s = dummy('fuwen', 160);
  s = run(press(s, { g: 'fuwen' }), M.startup + 20);
  assert.equal(s.runes.length, 1);
  assert.ok(Math.abs(s.runes[0].x - s.foe.x) < 1, 'under her feet');
  const bal = s.foe.bal;
  s = run(s, M.arm);
  assert.ok(s.runes[0].bound, 'bound');
  assert.ok(s.foe.stun > s.t + M.bind / 2, 'held where she stands');
  assert.ok(s.foe.bal < bal && s.fx.some((f) => f.kind === 'num'), 'a little 稳, its number');
  let off = dummy('fuwen-off', 160);
  off = run(press(off, { g: 'fuwen' }), M.startup + 20);
  off.foe.x += M.r + 40;
  off = run(off, M.arm);
  assert.ok(off.runes[0].fizzled && !(off.foe.stun > off.t), 'stepped off: nothing');
  assert.ok(off.me.cdFw > 0);
});

test('a foe may cast the 飞剑 too (心魔): it comes down on him, and a guard stands it off', () => {
  const lv = { ...LEVEL, foe: { ...LEVEL.foe, rules: { ai: { feijian: 1, edge: false, palmOn: false } } } };
  let s = F.newGame('foe-sword', 1, { levels: [lv] });
  s.me.x = 300; s.foe.x = 640; s.foe.think = 0; s.foe.cd.feijian = 0; s.foe.cd.ice = 1e9;
  s = until(s, (x) => x.shots.some((y) => y.who === 'foe' && y.kind === 'feijian'));
  const hp = s.me.hp;
  s = press(s, { g: 'block', on: true });
  s = until(s, (x) => !x.shots.some((y) => y.kind === 'feijian'));
  assert.ok(hp - s.me.hp < s.R.foe.moves.feijian.dmg, 'guarded: a chip');
});

test('the spells are in the move list and the pad: I · U on the desk, 剑 · 符 on the phone', () => {
  const desk = F.moveLines(LEVEL, 'zh', 'desk').join('\n'), touch = F.moveLines(LEVEL, 'zh', 'touch').join('\n');
  assert.match(desk, /飞剑　I/); assert.match(desk, /符文　U/);
  assert.match(touch, /飞剑　剑/); assert.match(touch, /符文　符/);
  const src = fs.readFileSync(new URL('../scripts/games/fighter.js', import.meta.url), 'utf8');
  assert.match(src, /KeyI: 'feijian', KeyU: 'fuwen'/);
  assert.match(src, /gf-spells/);
  for (const e of ['feijian', 'rune', 'bind']) assert.ok(F.meta.sounds.includes(e), e);
  const snd = read('../scripts/games/kit/audio/sounds.json');
  for (const e of ['feijian', 'rune', 'bind']) assert.ok(snd.kits.fight.events[e], `sounds.json fight · ${e}`);
});

test('the round pad (touch): 8 ways by the thumb\'s angle, a diagonal two at once, nothing in the dead zone', () => {
  const r = 66, at = (deg, far = 50) => F.dialDirs(Math.cos((deg * Math.PI) / 180) * far, Math.sin((deg * Math.PI) / 180) * far, r);
  const sorted = (a) => [...a].sort();
  // screen angles, y down: 0 → · 90 ↓ · 180 ← · 270 ↑
  assert.deepEqual(at(0), ['right']);
  assert.deepEqual(sorted(at(45)), ['crouch', 'right']);
  assert.deepEqual(at(90), ['crouch']);
  assert.deepEqual(sorted(at(135)), ['crouch', 'left'], '↙ = left + crouch: the low guard');
  assert.deepEqual(at(180), ['left']);
  assert.deepEqual(at(-180), ['left']);
  assert.deepEqual(sorted(at(225)), ['jump', 'left'], '↖ = left + jump');
  assert.deepEqual(at(270), ['jump']);
  assert.deepEqual(sorted(at(315)), ['jump', 'right']);
  assert.deepEqual(at(20), ['right'], 'within 22.5° of → is →');
  assert.deepEqual(sorted(at(25)), ['crouch', 'right']);
  assert.deepEqual(at(200, 10), [], 'the dead zone: no way, walk 0 (▶▶ dash still reads)');
  assert.deepEqual(at(0, 200), ['right'], 'past the rim still counts');
  const src = fs.readFileSync(new URL('../scripts/games/fighter.js', import.meta.url), 'utf8');
  assert.match(src, /kind === 'touch' \? dial :/, 'the pad on touch only; the desk keeps its four buttons');
  assert.match(src, /dataset\.v = '4'/);
});
