// 格斗's rounds (`level.rounds: { wins: 2 }`, best of three — 切磋's; fighter/core.js nextRound), the 旋踢 and the phone's
// one-thumb pairs (a slide from a key onto its pair). Run: node --test tests/fighter-rounds.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as F from '../scripts/games/fighter/core.js';
import { SLIDE, moveLines } from '../scripts/games/fighter.js';
import { roundWord, resolveClip } from '../scripts/games/fighter/draw.js';
import { bot } from '../scripts/games/bots/fighter.js';
import { playModule } from '../tools/board-bots.mjs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const REG = read('../worlds/jiuding/games.json');
const SPAR = { stage: { win: 'yield', timeUp: true, oil: false }, time: 60000, rounds: { wins: 2 } };
const run = (s, ms) => { let g = s; for (let t = 0; t < ms; t += 10) g = F.tick(g, 10); return g; };
/* A round ended by hand: hers (her 稳 emptied) or his (his 血). */
const endRound = (s, mine) => { const g = structuredClone(s); g.foe.think = 1e9; const ready = run(g, Math.max(0, g.intro - g.t)); if (mine) ready.foe.bal = 0; else ready.me.hp = 0; return past(run(ready, 20)); };
/* …and on to the moment the round is counted: the next one called, or the match over. */
const past = (s) => { let g = s; for (let t = 0; t < 5000 && g.end && g.live; t += 10) g = F.tick(g, 10); return g; };

test('rounds are a level\'s knob: the sparring row alone has it; no book scene plays more than one bout', () => {
  for (const g of REG.games.filter((x) => x.id === 'fighter')) for (const l of g.levels ?? []) {
    if (g.task === 'qiecuo') { assert.deepEqual(l.rounds, { wins: 2 }, l.id); assert.equal(l.stage.timeUp, true, l.id); assert.ok(l.time <= 60000, l.id); }
    else assert.equal(l.rounds, undefined, `${l.id}: a book scene, one bout`);
  }
  const one = F.newGame('x', 1, { levels: [{ ...SPAR, rounds: undefined }] });
  assert.equal(one.round, null);
  assert.equal(F.roundNow(one), null);
  assert.equal(endRound(one, true).won, true, 'no knob: the bout is over at its first end');
});

test('a human-like bot wins each sparring match and an idle hand loses', () => {
  const levels = REG.games.find((g) => g.id === 'fighter' && g.task === 'qiecuo').levels;
  for (const level of levels) {
    const opts = { deal: { levels: [level] }, limit: 240000 };
    assert.ok(playModule(F, bot, opts).won, level.id);
    assert.equal(playModule(F, () => null, { ...opts, tries: 1 }).won, false, level.id);
  }
});

test('best of three: two rounds his is the match; both whole again between rounds, the 气 kept, the call before the hands', () => {
  let s = F.newGame('r', 1, { levels: [SPAR] });
  assert.deepEqual(F.roundNow(s), { n: 1, me: 0, foe: 0, wins: 2, last: false });
  s.me.hp = 40; s.me.qi = 130; s.foe.qi = 70; s.me.x += 200;
  const x0 = F.newGame('r', 1, { levels: [SPAR] }).me.x;
  s = endRound(s, true);
  assert.deepEqual([s.live, s.won, s.lost, s.end], [true, false, false, null]);
  assert.deepEqual(F.roundNow(s), { n: 2, me: 1, foe: 0, wins: 2, last: false });
  assert.deepEqual([s.me.hp, s.foe.bal, s.me.x, s.me.qi, s.foe.qi], [s.R.me.hp, s.R.foe.bal, x0, 130, 70]);
  // its call: no press lands until it is over
  assert.ok(s.intro > s.t);
  assert.equal(F.act(s, { g: 'light' }).state, s);
  s = run(s, F.ROUND_MS);
  assert.notEqual(F.act(s, { g: 'light' }).state, s);
  s = endRound(s, true);
  assert.deepEqual([s.live, s.won, s.grade, s.stars], [false, true, 'clean', 3]);
});

test('one each: the third round is the last, and a match won after a round dropped is never three stars; two dropped is lost', () => {
  let s = endRound(endRound(F.newGame('d', 1, { levels: [SPAR] }), false), true);
  assert.deepEqual(F.roundNow(s), { n: 3, me: 1, foe: 1, wins: 2, last: true });
  assert.equal(roundWord(F.roundNow(s), 'zh'), '决胜回合');
  assert.equal(roundWord({ n: 2, last: false }, 'zh'), '第二回合');
  assert.equal(roundWord({ n: 2, last: false }, 'en'), 'Round 2');
  const won = endRound(s, true);
  assert.deepEqual([won.won, won.grade, won.stars], [true, 'clumsy', 2]);
  const lost = endRound(s, false);
  assert.deepEqual([lost.live, lost.won, lost.lost], [false, false, true]);
});

test('the incense is each round\'s own: out, the round goes to the one with more left; equal shares are hers', () => {
  let s = F.newGame('t', 1, { levels: [SPAR] });
  s.foe.think = 1e9; s.foe.bal = 50; s.me.hp = 80;
  s = run(s, SPAR.time + 20);
  assert.deepEqual([s.end?.kind, s.end?.won], ['time', true]);
  s = past(s);
  assert.equal(F.roundNow(s).me, 1);
  // round two: its incense is new — a minute more, not out at once
  s.foe.think = 1e9;
  s = run(s, 30000);
  assert.equal(s.end, null);
  s = run(s, 30010);
  assert.deepEqual([s.end?.kind, s.end?.won], ['time', false], 'both whole: a tie is the judge\'s — hers');
});

test('旋踢: ↓← + 腿, or the phone\'s ▼ + 技 — it steps in, puts her down, and is his own painted clip', () => {
  const fresh = () => { const s = F.newGame('k', 1, { levels: [{ stage: { win: 'yield', oil: false } }] }); s.foe.think = 1e9; return s; };
  const press = (s, d) => F.act(s, d).state;
  // the phone: ▼ held, 技
  let s = press(fresh(), { g: 'skill', crouch: true });
  s = run(s, 20);
  assert.equal(s.me.act?.k, 'spin');
  const x0 = s.me.x, d0 = s.foe.x - s.me.x;
  assert.ok(d0 > F.ME.spin.reach, 'out of its reach standing');
  s = run(s, F.ME.spin.startup + F.ME.spin.active);
  assert.ok(s.me.x > x0 + 20, 'it stepped in with no way held');
  assert.ok(s.foe.bal < s.R.foe.bal && s.foe.down > s.t, 'landed: she is down');
  // the keys: S, A, then L
  let k = press(press(press(fresh(), { g: 'crouch', on: true }), { g: 'walk', dir: -1 }), { g: 'crouch', on: false });
  k = run(press(k, { g: 'lkick' }), 20);
  assert.equal(k.me.act?.k, 'spin');
  // ▶ + 技 is still the 升勾, 技 alone the 掌心火; a stock full, ▼ + 技 is the 绝 as ever
  assert.equal(run(press(fresh(), { g: 'skill', dir: 1 }), 20).me.act?.k, 'rise');
  assert.equal(run(press(fresh(), { g: 'skill' }), 20).me.act?.k, 'palmfire');
  const full = fresh(); full.me.qi = F.QI;
  assert.equal(run(press(full, { g: 'skill', crouch: true }), 20).me.act?.k, 'super');
  // a 拳 or a 重 that lands cuts short into it
  assert.ok(F.CANCEL_LIGHT.includes('spin') && F.CANCEL_HEAVY.includes('spin'));
  // his sheet paints it; a sheet without it shows the 重腿
  const sheet = read('../worlds/jiuding/art/games/fighter/xiaoman.json');
  assert.equal(resolveClip(sheet, 'me', 'spin')[0], 'spin');
  const { spin: _gone, ...rest } = sheet.clips;
  assert.equal(resolveClip({ ...sheet, clips: rest }, 'me', 'spin')[0], 'heavy');
  for (const lang of ['zh', 'en']) assert.ok(moveLines({}, lang, 'touch').some((l) => /旋踢|Spin kick/.test(l)));
});

test('one thumb, two keys (the phone): a slide from 拳 onto 腿 rolls, from 重拳 onto 重腿 blows her back — though the first key\'s blow began', () => {
  assert.deepEqual(SLIDE, { light: ['lkick', 'ying'], lkick: ['light', 'ying'], hpunch: ['heavy', 'blow'], heavy: ['hpunch', 'blow'] });
  const fresh = () => { const s = F.newGame('s', 1, { levels: [{ stage: { win: 'yield', oil: false } }] }); s.foe.think = 1e9; return s; };
  for (const [first, [, named], want] of [['light', SLIDE.light, 'roll'], ['lkick', SLIDE.lkick, 'roll'], ['hpunch', SLIDE.hpunch, 'blow'], ['heavy', SLIDE.heavy, 'blow']]) {
    // a thumb takes ~150 ms from one key to the next: the first blow is past its wind-up (a light's is 60 ms)
    let s = run(F.act(fresh(), { g: first }).state, 150);
    assert.equal(s.me.act?.k, first);
    s = run(F.act(s, { g: named, cut: true }).state, 20);
    assert.equal(s.me.act?.k, want, `${first} → ${want}`);
  }
  // the keys' own pair is as tight as ever: the same press 150 ms late, not slid, waits for the blow to end
  let s = run(F.act(fresh(), { g: 'light' }).state, 150);
  s = run(F.act(s, { g: 'ying' }).state, 20);
  assert.equal(s.me.act?.k, 'light');
  // past SLIDE_MS it is no pair
  let late = run(F.act(fresh(), { g: 'heavy' }).state, F.SLIDE_MS + 40);
  late = run(F.act(late, { g: 'blow', cut: true }).state, 20);
  assert.equal(late.me.act?.k, 'heavy');
});
