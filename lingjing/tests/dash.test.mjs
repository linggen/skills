// 几何冲刺 (games/dash.js; Hanli 10-27: 「调息的不太好玩, 能换成geometry dash那种蹦着躲避障碍的吗」): the classic one-button
// auto-runner on famidash's cube physics (MIT), its levels games.json's `dash` rows — each proved by its bot at a 10 ms and a
// 50 ms clock, by a human-like hand (tools/board-bots.mjs's 200 ms reaction), and never by doing nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as d from '../scripts/games/dash.js';
import { bot } from '../scripts/games/bots/dash.js';
import { playModule } from '../tools/board-bots.mjs';
import { loadContent } from '../scripts/content.mjs';

const reg = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
const ladder = d.ladderOf(reg);
const content = loadContent();

function play(L, policy, { step = 10, limit = 200000 } = {}) {
  let s = d.newGame('t', 1, { levels: [L] }), t = 0;
  while (t < limit && !s.won) {
    const a = policy(s);
    if (a?.hold) s = d.act(s, { g: 'hold' }).state; else if (a?.release) s = d.act(s, { g: 'release' }).state;
    s = d.tick(s, step); t += step;
  }
  return s;
}
const perfect = (s) => bot(s, { lead: 0 });
const flat = (things, extra = {}) => ({ id: 't', speed: 'normal', bpm: 120, len: 24, things, ...extra });

test('famidash\'s cube, on our 20-unit tile: its speeds, jump, gravity, fall cap, pad and orb, a 15/16-tile cube', () => {
  const k = 20 / 16;
  assert.equal(d.SPEEDS.normal, 166.0181582 * k);
  assert.equal(d.JUMP, 333.75 * k);
  assert.equal(d.GRAV, 1504.6875 * k);
  assert.equal(d.MAXFALL, 360 * k);
  assert.equal(d.SIZE, 15 * k);
  assert.ok(d.PAD > d.JUMP && d.ORB === d.JUMP);
  // a jump clears one spike, not a wall of four
  assert.ok(d.SPEEDS.normal * d.airtime() > 3 * d.TILE && d.SPEEDS.normal * d.airtime() < 5 * d.TILE);
});

test('a spike ends the attempt: the run starts over, the attempt counted; a press on the beat clears it', () => {
  const L = flat([[4, 's']]);
  let s = d.act(d.newGame('t', 1, { levels: [L] }), { g: 'hold' }).state;
  s = d.act(s, { g: 'release' }).state;
  while (s.deaths === 0 && s.clock < 20000) s = d.tick(s, 10);
  assert.equal(s.deaths, 1, 'never pressed: it runs into the spike');
  s = d.tick(s, 800);
  assert.equal(s.attempt, 2);
  assert.ok(s.x < d.TILE, 'from the start again');
  // the press that clears it falls on beat 4
  const won = play(L, perfect);
  assert.equal(won.won, true);
  assert.equal(won.attempt, 1);
  assert.equal(won.stars, 3);
});

test('holding jumps again on each landing (the cube\'s rule); a low roof wants no press under it', () => {
  let s = d.act(d.newGame('t', 1, { levels: [flat([])] }), { g: 'hold' }).state;
  s = d.tick(s, 3000);
  assert.ok(s.jumps >= 5, `held: ${s.jumps} jumps`);
  const roof = flat([[6, 'ceil', 6]]);
  let r = d.act(d.newGame('t', 1, { levels: [roof] }), { g: 'hold' }).state;
  while (r.deaths === 0 && r.clock < 20000) r = d.tick(r, 10);
  assert.equal(r.deaths, 1, 'holding under the roof: it hits it');
  assert.equal(play(roof, perfect).won, true);
});

test('a pad throws it over a wide pit; an orb pressed in the air carries it over one a jump can\'t', () => {
  const padded = flat([[6, 'pad']]);
  const p = play(padded, perfect);
  assert.equal(p.won, true); assert.ok(p.pads >= 1);
  const orbed = flat([[6, 'orb', 6]]);
  const o = play(orbed, perfect);
  assert.equal(o.won, true); assert.ok(o.orbs >= 1, 'the orb was taken');
  // one jump alone falls in
  const lay = d.layout(orbed), pit = lay.pits[0];
  assert.ok(pit.w > d.SPEEDS.normal * d.airtime() - d.SIZE, 'wider than a jump');
});

test('practice: back to the last checkpoint passed after a hit; a practice win is a ★1', () => {
  const L = flat([[4, 's'], [14, 's'], [20, 's']], { len: 28, cps: [10] });
  let s = d.act(d.newGame('t', 1, { levels: [L] }), { g: 'practice' }).state;
  assert.equal(s.practice, true);
  // play it right to beat 12, then let go into the spike at 14
  s = d.act(s, { g: 'hold' }).state; s = d.act(s, { g: 'release' }).state;
  const cp = d.layout(L).cps[0];
  while (s.x < cp + d.TILE && s.clock < 20000) { const a = perfect(s); if (a?.hold) d.act(s, { g: 'hold' }); else if (a?.release) d.act(s, { g: 'release' }); s = d.tick(s, 10); }
  assert.equal(s.cpAt, cp);
  if (s.holding) d.act(s, { g: 'release' });
  while (s.deaths === 0 && s.clock < 40000) s = d.tick(s, 10);
  s = d.tick(s, 800);
  assert.ok(Math.abs(s.x - cp) < d.TILE, 'from the checkpoint');
  while (!s.won && s.clock < 80000) { const a = perfect(s); if (a?.hold) d.act(s, { g: 'hold' }); else if (a?.release) d.act(s, { g: 'release' }); s = d.tick(s, 10); }
  assert.equal(s.won, true);
  assert.equal(s.stars, 1);
});

test('the beat is the music: a kick each beat and a tick each off-beat, by where the runner is', () => {
  const L = flat([], { len: 8 });
  let s = d.act(d.newGame('t', 1, { levels: [L] }), { g: 'hold' }).state;
  s = d.act(s, { g: 'release' }).state;
  const heard = [];
  while (!s.won) { const b = d.soundSnap(s); s = d.tick(s, 10); heard.push(...d.sounds(b, d.soundSnap(s))); }
  assert.equal(heard.filter((e) => e === 'beat').length, 7);
  assert.ok(heard.filter((e) => e === 'off').length >= 7);
  for (const e of heard) assert.ok(d.meta.sounds.includes(e), e);
});

for (const L of ladder) {
  test(`${L.id}: its bot clears it at a 10 ms and a 50 ms clock alike, first try; doing nothing never does`, () => {
    for (const step of [10, 50]) {
      const s = play(L, perfect, { step });
      assert.ok(s.won, `${L.id} at ${step} ms: ${Math.round(s.x)} of ${Math.round(s.lay.end)}`);
      assert.equal(s.attempt, 1, `${L.id} at ${step} ms`);
    }
    const idle = play(L, () => null, { limit: 40000 });
    assert.equal(idle.won, false);
  });
}

test('a human-like hand (200 ms reaction, tools/board-bots.mjs) clears every level within five tries', () => {
  for (const L of ladder) {
    const r = playModule(d, bot, { tries: 5, deal: { levels: [L] }, limit: 200000 });
    assert.ok(r.won, `${L.id}: ${JSON.stringify(r.runs.map((x) => x.ms))}`);
  }
});

test('the story\'s boards: each task plays its own row\'s level, its how first in the row and on the task, the pay as 调息\'s', () => {
  const rows = reg.games.filter((g) => g.id === 'dash' && g.task);
  assert.ok(rows.length >= 1);
  const ids = new Set();
  for (const r of rows) {
    const t = content.tasks.tasks.find((x) => x.id === r.task);
    assert.equal(t.game, 'dash', r.task);
    assert.equal(r.mechanic, '几何冲刺');
    assert.deepEqual(t.how, r.how, `${r.task}: one how-line`);
    assert.equal(r.data.level, r.levels[0].id);
    assert.ok(!ids.has(r.levels[0].id)); ids.add(r.levels[0].id);
    if (t.marks) for (const k of [1, 2, 3]) assert.ok(Object.hasOwn(t.marks, r.levels[0].grades?.[k]), `${r.task}: ★${k}`);
  }
  const pp = content.balance.play_pay;
  assert.equal(pp.minutes['几何冲刺'], pp.minutes['调息']);
  assert.equal(pp.wealth['几何冲刺'], pp.wealth['调息']);
  // the first one met is the easiest: slow, single spikes and low blocks, far apart
  const first = ladder[0];
  assert.equal(first.speed, 'slow');
  assert.ok(first.things.every(([, k]) => k === 's' || k === 'b'));
});

test('painted, never bare shapes: the board draws the kit\'s painted spike, block, pad and orb and 气走经脉\'s pearl', () => {
  const L = flat([[2, 's'], [6, 'b'], [10, 'pad'], [16, 'orb', 6]], { len: 30 });
  const h = d.html(d.newGame('t', 1, { levels: [L] }), 'zh');
  for (const art of ['dash/art/spike.webp', 'dash/art/block.webp', 'dash/art/pad.webp', 'dash/art/orb.webp', 'qimai/art/pearl.webp', 'qimai/art/sky-']) assert.ok(h.includes(art), art);
  for (const f of ['spike', 'block', 'pad', 'orb']) assert.ok(fs.existsSync(new URL(`../scripts/games/dash/art/${f}.webp`, import.meta.url)), f);
  assert.match(h, /第 1 次/);
  assert.match(d.html(d.newGame('t', 1, { levels: [L] }), 'en'), /Attempt 1/);
});
