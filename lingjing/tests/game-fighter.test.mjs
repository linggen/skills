// 格斗 (games/fighter.js; Hanli 10-26: 「街霸好做吗? 拳皇之类的」 → 「好, 先做秦雁那一场」): the rules of a bout, the book's
// two reads (迎 the edge push · 勾 as she holds back the palm), the grade by whether the palm landed, and a human-like
// hand winning it in a few tries while a masher, a wall of blocks and an idle hand lose.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as F from '../scripts/games/fighter.js';
import { FOE, ME, STAGE } from '../scripts/games/fighter/core.js';
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
  s.me.x = 500; s.foe.x = 580; s.foe.bal = 50; s.foe.think = 0; s.foe.cd.ice = 9999; // the hook's 45 leaves her standing
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
  assert.ok(won.ms >= 10000 && won.ms <= 120000, `${won.ms} ms`); // her 稳 emptied may end it before the slick (11-03)
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
  // …and the book's line itself (an emptied 稳 may end the bots' bouts first, 11-03): 迎, the palm, the hook, the slip
  let b = atTheEdge('snd-slick');
  for (let t = 0; t < 4000 && b.edge?.phase !== 'tell'; t += 10) b = spy.tick(b, 10);
  b = spy.act(b, { g: 'light' }).state;
  for (let t = 0; t < 4000 && b.palm?.phase !== 'hold'; t += 10) b = spy.tick(b, 10);
  b = spy.act(b, { g: 'heavy' }).state;
  for (let t = 0; t < 6000 && !b.won; t += 10) b = spy.tick(b, 10);
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

test('a chain is made, not mashed: K K is two blows, she free a beat between; K O chains (a light cut short into a heavy); a 重 cancels into 掌心火', () => {
  // 11-05 (Hanli: 「只要把对手逼到角落, 一直点轻拳就能一直击中对方」): a light's hitstun ends before the next light lands
  let s = dummy('chain');
  s = hand(s, [[{ g: 'light' }, 150], [{ g: 'light' }, 150], [{ g: 'lkick' }, 260]]); // a hand's pace: apart enough never to read as K+L
  assert.equal(s.best, 1, 'a light into a light: no chain');
  assert.ok(ME.light.stun < ME.light.recover + ME.light.startup, 'the light\'s hitstun ends before the next light lands');
  s = hand(dummy('ko'), [[{ g: 'light' }, 120], [{ g: 'hpunch' }, 300]]);
  assert.equal(s.best, 2, 'K then O');
  assert.ok((s.snd.combo ?? 0) >= 1);
  // ; then S D + K: the 重腿 cut short into 掌心火
  s = dummy('cancel');
  s = hand(s, [[{ g: 'heavy' }, 200], down, up, fwd, [{ g: 'light' }, 400]]);
  assert.equal(s.snd.palmfire ?? 0, 1, '掌心火 came out of the 重腿');
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
  for (const want of ['掌心火', 'S D + K/O', '升勾', 'D S D + K/O', 'S D S D', 'K O', 'K+L', 'O+;']) assert.ok(lines.some((l) => l.includes(want)), want);
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
   past both. Ids, pay and done lines kept; a human-like hand stands each, the rest go down. Off the story since 2026-11-04
   (the 年 pools read through their boards: her bout is 09-fangshi's, and 「那一下午没比剑」) — the 游戏厅's 旧版 keeps both. */
test('秦雁 in the pools: 崖顶 and 后山崖顶 are 格斗 outlast bouts on the climb; a human-like hand stands each, the rest go down', () => {
  const lv = (t) => REG.games.find((g) => g.task === t && (!g.replaced || g.replaced === 'cut'));
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
  assert.match(src, /dataset\.v = '11'/);
  // 11-06 (the playbot at 375): the touch pad scales with a board narrower than it, every key inside.
  assert.match(src, /\.g-fighter\.is-touch \{ container-type: inline-size; \}/);
  assert.match(src, /@container \(max-width: 380px\)[^]*?--gfb: clamp\(34px, 12\.5cqi, 48px\)/);
  assert.match(src, /\.g-fighter\.is-touch button\.gf-cue \{ position: absolute; left: 50%; top: 50%;/, 'the touch cue overlays the positioned pad without moving its keys');
});

/* 2026-11-03 (Hanli: 「好像卡住了, 秦燕不会滑倒失败呢」 · 「kl翻滚这个也没告诉玩家啊」 · 「手机上组合键不太好操作」): the edge always
   comes to a cornered man, the cue says what to press while its window is open, and on the phone the cue is the button. */
import { cornered, endWon, EDGE_LATE } from '../scripts/games/fighter/core.js';
import { cueText } from '../scripts/games/fighter/draw.js';

/* A passive hand: back to the slick's corner, and there (`guard`: holding away from her). Each edge she starts, counted
   by her move count; his 血 kept so the bout runs on. */
function cornerWait(seed, { guard = false, ms = 90000 } = {}) {
  let s = F.newGame(seed, 1, deal);
  const at = [];
  for (let t = 0; t < ms && !s.end; t += 10) {
    s.me.hp = 100;
    if (!s.edge && s.in.dir !== -1) s = press(s, { g: 'walk', dir: -1 });
    if (guard && !s.in.block) s = press(s, { g: 'block', on: true });
    const had = s.edge;
    s = run(s, 10);
    if (!had && s.edge) at.push(s.foe.moves);
  }
  return at;
}

test('cornered and passive, he always gets her point at his throat: the first by EDGE_LATE moves past `after`, then again as it cools', () => {
  const M = FOE.moves.edge;
  for (const seed of ['c1', 'c2', 'c3', 'c4', 'c5']) for (const guard of [false, true]) {
    const at = cornerWait(seed, { guard });
    assert.ok(at.length >= 5, `${seed}/${guard}: only ${at.length} edges in 90 s`);
    assert.ok(at[0] <= M.after + EDGE_LATE + 1, `${seed}/${guard}: the first edge at move ${at[0]}`);
    for (let i = 1; i < at.length; i += 1) assert.ok(at[i] - at[i - 1] <= 12, `${seed}/${guard}: ${at[i] - at[i - 1]} moves between edges`);
  }
  // anywhere on the slick at the stage's edge is a corner (the slick is wider than `near`)
  const s = F.newGame('slick', 1, deal);
  s.me.x = STAGE.oil.to - 6; s.foe.x = s.me.x + 200;
  assert.equal(cornered(s), -1);
  s.me.x = STAGE.oil.to + 30;
  assert.equal(cornered(s), 0, 'off the slick, past `near`: not cornered');
});

test('she out of reach with him cornered past `after`: she closes in, and the edge comes', () => {
  let s = F.newGame('far', 1, deal);
  s.me.x = STAGE.left + 20; s.foe.x = s.me.x + 320; s.foe.moves = FOE.moves.edge.after + EDGE_LATE; s.foe.think = 0; s.foe.cd.ice = 9999;
  s = until(s, (x) => x.edge, 6000);
  assert.ok(Math.abs(s.foe.x - s.me.x) < FOE.moves.poke.reach + 20, 'her point at his throat, from a blade\'s length');
});

test('K+L together too soon is one early press, not two: the second pair does not give her the read', () => {
  let s = atTheEdge('pair');
  s = press(s, { g: 'light' }); s = press(s, { g: 'lkick' });
  assert.equal(s.early, 1);
  s = run(s, 200);
  s = press(s, { g: 'light' }); s = press(s, { g: 'lkick' });
  assert.equal(s.early, 2);
  assert.ok(s.edge, 'she waits again: no 「她看出来了」');
});

test('the cue says the keys on the desk while its window is open; after 迎 the hook\'s keys point toward her; replayed literally, they win', () => {
  let s = atTheEdge('cue');
  assert.equal(cueText(s, 'zh'), '', 'the guard: no cue yet');
  s = until(s, (x) => x.edge?.phase === 'tell');
  assert.equal(cueText(s, 'zh'), '迎 K+L');
  assert.equal(cueText(s, 'en'), 'In! K+L');
  assert.equal(cueText(s, 'zh', 'touch'), '迎');
  s = press(s, { g: 'light' }); s = press(s, { g: 'lkick' }); // K+L, as it says
  assert.equal(cueText(s, 'zh'), '', 'the window shut');
  s = until(s, (x) => x.palm?.phase === 'hold');
  const text = cueText(s, 'zh');
  assert.equal(text, '勾 A S A+K', 'she stands on his left now: A is toward her');
  const [f] = text.split(' ').slice(1);
  const dir = f === 'A' ? -1 : 1;
  for (const d of [{ g: 'walk', dir }, { g: 'walk', dir: 0 }, { g: 'crouch', on: true }, { g: 'crouch', on: false }, { g: 'walk', dir }, { g: 'light' }]) { s = press(s, d); s = run(s, 30); }
  s = until(s, (x) => x.won, 4000);
  assert.equal(s.end.kind, 'out');
  // every fighter level with the cues carries the keys
  for (const g of REG.games.filter((r) => r.mechanic === '格斗')) for (const lv of g.levels ?? []) {
    if (lv.cues?.ying) assert.equal(lv.cues.ying.keys, 'K+L', lv.id);
    if (lv.cues?.hook) assert.equal(lv.cues.hook.keys, '{f} S {f}+K', lv.id);
  }
});

test('a touch-only hand wins: it fights as a thumb does, and answers her point and her palm only by the cue\'s button (迎 · 勾)', () => {
  // the human-like hand's buttons, but in her edge and her palm nothing of its own: one tap of the cue, a beat late
  const touch = (s) => {
    if (s.edge || s.palm) {
      if (s.cue && s.t - s.cue.at >= 250 && !s.cueTapped?.includes(s.cue.at)) { s.cueTapped = [...(s.cueTapped ?? []), s.cue.at]; return { g: s.cue.k === 'ying' ? 'ying' : 'hook' }; }
      if (s.in.block) return { g: 'block', on: false };
      return s.in.dir ? { g: 'walk', dir: 0 } : null;
    }
    return bot(s);
  };
  let wins = 0;
  for (const seed of ['t1', 't2', 't3', 't4']) {
    let s = F.newGame(seed, 1, deal);
    for (let t = 0; t < 180000 && !s.won && !s.lost && !(s.end && !endWon(s.end) && s.t - s.end.at > 2000); t += 10) { const a = touch(s); if (a) s = press(s, a); s = run(s, 10); }
    if (s.won) { wins += 1; assert.ok(['out', 'spent'].includes(s.end.kind)); } // over the slick, or her 稳 emptied
  }
  assert.ok(wins >= 3, `a touch-only hand won ${wins} of 4`);
  const src = fs.readFileSync(new URL('../scripts/games/fighter.js', import.meta.url), 'utf8');
  assert.match(src, /class="gf-cue" data-k="cue" hidden/, 'the cue\'s button, on touch, hidden until its window');
  assert.match(src, /g: c === 'ying' \? 'ying' : 'hook'/);
});

/* 2026-11-03 (Hanli: 「手机上的游戏画面能再宽点, 两边目前黑的比较多」): on a phone on its side the field takes the screen's
   width (up to WIDE_MAX), drawing more of the world at each side, never stretched; the boards stay STAGE's. */
import { fieldOf, FIELD as FIELD_ART, WIDE_MAX, TOP_SHARE } from '../scripts/games/fighter/draw.js';

test('a wide phone draws the world wider, never stretched: the field\'s height fills, the boards keep their place', () => {
  const H = FIELD_ART.h, W = FIELD_ART.w;
  const iphone = fieldOf(852 * 2, (393 - 21) * 2); // 2.16:1 less the home band, at 2×
  assert.equal(iphone.k, (372 * 2) / H, 'scaled by the height: no stretch');
  assert.ok(iphone.edge > 100, `more world at each side: ${iphone.edge}`);
  assert.equal(iphone.left, 0, 'no bands');
  assert.ok(Math.abs((W + 2 * iphone.edge) * iphone.k - 852 * 2) < 1, 'edge to edge');
  assert.deepEqual(fieldOf(1600, 900), { k: 900 / H, edge: 0, left: 0, top: 0 }, '16:9 as before');
  const tall = fieldOf(960, 900);
  assert.equal(tall.edge, 0, 'narrower than 16:9: as before, the width rules');
  // …and set down in a taller field (an upright page, 11-05): a little sky above, the boards below, where the keys lie
  assert.ok(Math.abs(tall.top - (900 - H * tall.k) * TOP_SHARE) < 1e-9 && tall.top > 0);
  const ultra = fieldOf(3000, 540);
  assert.equal(ultra.edge, (H * WIDE_MAX - W) / 2, 'past WIDE_MAX the world stops widening');
  assert.ok(ultra.left > 0, '…and bands stand beside it');
  // the play area (the edge, the slick, the corner) is the rules' and untouched
  assert.deepEqual(STAGE, { w: 960, left: 140, right: 930, oil: { from: 140, to: 250 } });
  const host = fs.readFileSync(new URL('../scripts/games/phone/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(host, /g-fighter\.is-touch \{ width: min\(100%, calc\(\(100dvh - var\(--safe-b\)\) \* 16 \/ 9\)\); \}/, 'no 16:9 cap on the phone');
  assert.match(host, /--gf-h: min\(calc\(100dvh - var\(--safe-b\)\), calc\(100vw \* 9 \/ 16\)\); width: min\(100%, calc\(var\(--gf-h\) \* 2\.4\)\);/);
  const src = fs.readFileSync(new URL('../scripts/games/fighter.js', import.meta.url), 'utf8');
  assert.match(src, /h = r\.height > 0 \? Math\.max\(180, Math\.round\(r\.height \* dpr\)\)/, 'the canvas takes its box\'s shape');
  assert.equal(WIDE_MAX, 2.4);
});

test('on the Mac the story card gives the fighter the stage\'s height and width, up to 2.4:1 (Hanli 11-03: 「画面更大些」); the keys over it (11-05)', () => {
  const src = fs.readFileSync(new URL('../scripts/games/fighter.js', import.meta.url), 'utf8');
  assert.match(src, /\.g-fighter:not\(\.is-touch\) \.gf-field \{ aspect-ratio: auto; height: clamp\(calc\(100cqi \/ 2\.4\), var\(--gf-hm, 56\.25cqi\), 56\.25cqi\); \}/, 'from 16:9 to 2.4:1, 16:9 where the host sets no height');
  const shell = fs.readFileSync(new URL('../scripts/games/shell.css', import.meta.url), 'utf8');
  assert.match(shell, /\.focus \.card\.gamecard:has\(> \.gshell \.g-fighter\) \{ --gf-hm: max\(260px, calc\(100cqh - 112px\)\); max-width: min\(96%, calc\(var\(--gf-hm\) \* 2\.4 \+ 32px\)\); \}/, 'the stage\'s height, up to 96% of its width');
  assert.doesNotMatch(shell, /g-fighter\.pad-off\) \{ --gf-hm/, 'the keys take none of the field\'s height, shown or not');
  // The keys over the field, shown by default (Hanli 11-05: 「格斗的显示按键可以叠加到游戏上吗? 不要把游戏画面缩小. 按键可以默认显示」):
  // on a desk 「收起按键」 hides them, kept per browser (try-guarded); a touch screen keeps its pad.
  assert.match(src, /const padOn = kind === 'touch' \|\| padShown\(win\);/);
  assert.match(src, /export const PAD_KEY = 'lingjing\.fighter\.pad';/);
  assert.match(src, /const padShown = \(win\) => \{ try \{ return win\.localStorage\.getItem\(PAD_KEY\) !== '0'; \} catch \{ return true; \} \};/, 'shown unless hidden');
  assert.match(src, /\.g-fighter \.gf-pad \{ position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; pointer-events: none;/, 'over the field, its box letting taps through');
  assert.match(src, /\.g-fighter \.gf-pad > \* \{ pointer-events: auto; opacity: \.62; \}/, 'only the buttons take taps, see-through');
  assert.match(src, /\.g-fighter\.pad-off \.gf-pad \{ display: none; \}/);
  assert.match(src, /'收起按键'/);
  // …inside the Mac's window rule only: the phone and a narrow stage as they were
  assert.ok(shell.indexOf('.g-fighter) { --gf-hm') > shell.indexOf('@media (min-width: 900px)'));
});

/* 2026-11-03 (Hanli: 「敌人没血了还是不死呢, 卡住了吧」, 看他的脚 · 等风): in a bout the slick should end, an empty 稳 ends it
   too — a win below the book's way (`spent`: clumsy, two stars) — once the book's moment has been offered. */
const FUSHI = REG.games.find((g) => g.scene === 'wm-fushi' && g.id === 'fighter').levels[0];
test('稳 emptied ends a slick bout at once, at any move, as a two-star win (Hanli 11-03: 「血槽么....」)', () => {
  for (const lv of [LEVEL, FUSHI]) {
    for (const moves of [0, 30]) {
      let s = F.newGame('spent', 1, { levels: [lv] });
      s.foe.moves = moves; s.foe.bal = 0; s.foe.think = 1e9;
      s = run(s, 20);
      assert.equal(s.end?.kind, 'spent', `${lv.id} at move ${moves}: down at once`);
      s = until(s, (x) => x.won, 4000);
      assert.equal(s.grade, 'clumsy');
      assert.equal(s.stars, 2);
    }
    assert.ok(lv.won.spent.zh && lv.won.spent.en && lv.lines.spent.zh && lv.lines.spent.en, `${lv.id}: its words`);
  }
  // mid-trick too: her point at his throat goes with her
  let e = atTheEdge('spent-edge'); e.foe.bal = 0; e = run(e, 20);
  assert.equal(e.end?.kind, 'spent'); assert.equal(e.edge, null);
  // a sparring bout yields as ever; an outlast bout is ended by it too, never as `spent`: won early, paid as standing
  // through it (Hanli 11-05: 「格斗把对方血打空了都应该胜利」, ending the 11-03 rule that kept it going)
  const yieldLv = REG.games.find((g) => g.scene === 'wm-dabi' && g.id === 'fighter').levels[0];
  let y = F.newGame('y', 1, { levels: [yieldLv] }); y.foe.bal = 0; y = run(y, 50);
  assert.equal(y.end?.kind, 'yield');
  const outLv = REG.games.find((g) => g.levels?.some((l) => l.id === 'liuyun')).levels.find((l) => l.id === 'liuyun');
  let o = F.newGame('o', 1, { levels: [outLv] }); o.foe.bal = 0; o.foe.think = 1e9; o = run(o, 500);
  assert.equal(o.end?.kind, 'outlast', 'outlast: no spent end');
  assert.ok(o.end.won && o.end.early, 'outlast: won early');
});

test('看他的脚: his stamp over the grease, the 勾 cue shown, hooked — off the rim, clean, three stars', () => {
  let s = F.newGame('lu', 1, { levels: [FUSHI] });
  s.me.x = 770; s.foe.x = 870; s.foe.bal = 50; s.foe.think = 0; s.foe.cd.ice = 9999; s.foe.cd.palm = 0;
  s = until(s, (x) => x.palm?.phase === 'hold', 20000);
  assert.equal(s.cue?.k, 'hook', 'the 勾 cue is up');
  assert.match(cueText(s, 'zh'), /^勾 /, 'the desk names its keys');
  s = press(s, { g: 'hook' }); // the phone's 勾
  s = until(s, (x) => x.won, 6000);
  assert.equal(s.end.kind, 'out');
  assert.equal(s.grade, 'clean');
  assert.equal(s.stars, 3);
});

test('a touch-only hand wins 看他的脚: the stamp answered only by the cue\'s 勾 button', () => {
  const touch = (s) => {
    if (s.palm) {
      if (s.cue && s.t - s.cue.at >= 200 && !s.cueTapped?.includes(s.cue.at)) { s.cueTapped = [...(s.cueTapped ?? []), s.cue.at]; return { g: 'hook' }; }
      if (s.in.block) return { g: 'block', on: false };
      return s.in.dir ? { g: 'walk', dir: 0 } : null;
    }
    return bot(s);
  };
  let wins = 0;
  for (const seed of ['l1', 'l2', 'l3', 'l4']) {
    let s = F.newGame(seed, 1, { levels: [FUSHI] });
    for (let t = 0; t < 180000 && !s.won && !s.lost && !(s.end && !endWon(s.end) && s.t - s.end.at > 2000); t += 10) { const a = touch(s); if (a) s = press(s, a); s = run(s, 10); }
    if (s.won) wins += 1;
  }
  assert.ok(wins >= 3, `won ${wins} of 4`);
});

test('the line under the bout wraps on a narrow field, never squeezed, and no stop opens a line', async () => {
  const { wrapLine } = await import('../scripts/games/fighter/draw.js');
  const em = (t) => [...t].length * 31; // a 31-unit font: 12 px on a 370 px phone field
  const long = '一掌按在青石板上，土墙拱起——另一只手里已经冒出一团火。「两样！又是两样！」';
  const lines = wrapLine(em, long, 900);
  assert.ok(lines.length >= 2 && lines.length <= 3, JSON.stringify(lines));
  assert.equal(lines.join(''), long);
  for (const l of lines) assert.ok(em(l) <= 900 + 31, l);
  for (const l of lines.slice(1)) assert.ok(!'，。、；：！？…—）」』'.includes(l[0]), l);
  assert.deepEqual(wrapLine(em, '短句。', 900), ['短句。']);
  const src = fs.readFileSync(new URL('../scripts/games/fighter/draw.js', import.meta.url), 'utf8');
  assert.match(src, /lineBand\(ctx, text, text \? \(canvas\.getBoundingClientRect\(\)\.width \/ w\) \* k : 1\)/, 'the band is sized by the field\'s page width');
});
