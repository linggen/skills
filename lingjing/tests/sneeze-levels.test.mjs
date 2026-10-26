// The 时机 kit (games/sneeze.js) plays any level from data: its built-in level plays exactly as the
// board did before levels came from data (the recorded runs, tests/sneeze-traces.mjs), and a second,
// different level — two tells, then a hold, its own numbers and lines — plays, settles, is won by the
// bot at a 10 ms and a 50 ms clock, and is never won by an idle hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as kit from '../scripts/games/sneeze.js';
import { bot } from '../scripts/games/bots/sneeze.js';
import { playOnce } from '../tools/board-bots.mjs';
import { traces } from './sneeze-traces.mjs';

const pair = (zh, en) => ({ zh, en });
const LEVEL = {
  id: 'two-tells',
  name: pair('两闪一按', 'Two dodges, one hold'),
  how: pair('闪两次，再按住数到一半。', 'Dodge twice, then hold for half a count.'),
  ready: pair('对面那人搓了搓手。', 'The one across rubs their hands.'),
  start: pair('来', 'Begin'),
  won: { clean: pair('干净利落。', 'Neatly done.'), clumsy: pair('磕磕绊绊，也算过了。', 'Stumbling, but through.'), skipped: pair('就算过了。', 'Let it pass.') },
  steps: [
    { kind: 'tell', guard: [700, 500], tell: 500, verb: pair('闪', 'Dodge'), lines: { guard: pair('他在等。', 'He waits.'), tell: pair('他抬手——', 'His hand rises —'), hit: pair('挨了一下。', 'It lands.'), early: pair('太早。', 'Too soon.'), done: pair('闪开了。', 'Dodged.') } },
    { kind: 'tell', guard: [400, 900, 600], tell: 450, verb: pair('再闪', 'Again'), lines: { guard: pair('他又在等。', 'He waits again.'), tell: pair('又来了——', 'Here it comes —'), hit: pair('又挨了一下。', 'It lands again.'), early: pair('又早了。', 'Too soon again.'), done: pair('又闪开了。', 'Dodged again.') } },
    { kind: 'hold', window: [400, 800], verb: pair('按住', 'Hold'), lines: { short: pair('太短。', 'Too short.'), over: pair('太长。', 'Too long.') } },
  ],
  art: { idle: 'sneeze/heqi-guard.webp' },
  grade: { hits: 0, over: 0, early: 0 },
  stuck: 3,
};
const deal = { levels: [LEVEL] };

const tickTo = (s, until, step = 10, limit = 20000) => { for (let t = 0; t < limit && !until(s); t += step) s = kit.tick(s, step); return s; };
const act = (s, g) => kit.act(s, { g }).state;
const words = (s) => kit.html(s, 'en') + kit.html(s, 'zh');

test('the built-in level plays exactly as before: every recorded run, state and html alike', () => {
  const want = JSON.parse(fs.readFileSync(new URL('./fixtures/sneeze-dabi.json', import.meta.url)));
  const got = traces(kit);
  for (const k of Object.keys(want.runs)) {
    assert.deepEqual(got.runs[k].last, want.runs[k].last, `${k}: its last state`);
    assert.equal(got.runs[k].hash, want.runs[k].hash, `${k}: every state and html on the way`);
  }
  assert.deepEqual(got.bots, want.bots);
  assert.equal(kit.newGame('x').level, undefined, 'the built-in level rides in no state');
  assert.deepEqual(kit.newGame('x', 1, { level: 'dabi' }), kit.newGame('x'));
});

test('a level from data: two tells, then a hold — its lines, its verbs, its numbers; settles clean', () => {
  let s = kit.newGame('a', 1, deal);
  assert.equal(s.level, LEVEL);
  assert.match(kit.html(s, 'en'), /The one across rubs their hands\.[\s\S]*Begin/);
  s = act(s, 'start');
  assert.equal(s.phase, 'face');
  assert.match(kit.html(s, 'en'), /He waits\.[\s\S]*Dodge/);
  s = tickTo(s, (x) => x.note === 'tell');
  assert.equal(s.t, 700, 'the first guard');
  assert.match(kit.html(s, 'zh'), /他抬手——/);
  s = act(s, 'yield');
  assert.equal(s.step, 1);
  assert.equal(s.phase, 'face');
  assert.match(kit.html(s, 'en'), /Dodged\.[\s\S]*Again/, 'the first tell\'s done line, the second\'s verb');
  s = kit.tick(s, 100);
  assert.match(kit.html(s, 'en'), /Dodged\./, 'it stands a moment');
  s = tickTo(s, (x) => x.note === 'tell');
  assert.equal(s.t - s.at, 400, 'the second tell\'s own guard');
  s = act(s, 'yield');
  assert.equal(s.phase, 'charm');
  assert.match(kit.html(s, 'en'), /Dodged again\.[\s\S]*data-g-hold="1"[^>]*>Hold/);
  s = act(s, 'hold');
  s = kit.tick(s, 600);
  s = act(s, 'release');
  assert.equal(s.won, true);
  assert.equal(s.grade, 'clean');
  assert.match(kit.html(s, 'en'), /Neatly done\./);
  assert.doesNotMatch(words(s), /undefined|NaN/);
});

test('a level from data: too early, too late, too short, too long — its own rule and grade', () => {
  let s = act(kit.newGame('b', 1, deal), 'start');
  s = act(s, 'yield');
  assert.equal(s.early, 1);
  assert.match(kit.html(s, 'en'), /Too soon\./);
  s = tickTo(s, (x) => x.hits === 1);
  assert.equal(s.t, 1200, 'guard 700 + tell 500, then the swing repeats');
  assert.match(kit.html(s, 'en'), /It lands\./);
  s = tickTo(s, (x) => x.note === 'tell');
  assert.equal(s.t - s.at, 500, 'the next guard in the cycle');
  s = act(s, 'yield');
  assert.equal(s.step, 1);
  s = tickTo(s, (x) => x.note === 'tell');
  s = act(s, 'yield');
  s = act(s, 'hold'); s = kit.tick(s, 200); s = act(s, 'release');
  assert.equal(s.phase, 'charm');
  assert.match(kit.html(s, 'en'), /Too short\./);
  assert.equal(s.over, 0, 'short is only said');
  s = act(s, 'hold'); s = kit.tick(s, 900); s = act(s, 'release');
  assert.equal(s.over, 1);
  assert.match(kit.html(s, 'en'), /Too long\./);
  assert.equal(kit.stuck(s), false);
  assert.equal(kit.stuck({ ...s, hits: 2 }), true, 'its own stuck count (3)');
  s = act(s, 'hold'); s = kit.tick(s, 500); s = act(s, 'release');
  assert.equal(s.won, true);
  assert.equal(s.grade, 'clumsy');
  assert.equal(kit.gradeOf({ ...s, hits: 0, over: 0, early: 1 }), 'clumsy', 'its grade allows no early press');
  assert.equal(kit.gradeOf({ ...kit.newGame('c'), early: 1 }), 'clean', 'the built-in grade allows one');
});

test('the bot wins a level from data, and the built-in one, at a 10 ms and a 50 ms clock', () => {
  for (const d of [deal, undefined]) for (const step of [10, 50]) for (const seed of ['bot-1', 'bot-2', 'bot-3']) {
    const r = playOnce(kit, bot, { seed, step, deal: d });
    assert.ok(r.won, `${d ? LEVEL.id : 'dabi'} at ${step} ms (${seed}): ${JSON.stringify(r)}`);
  }
});

test('an idle hand never wins, any level; it gets stuck', () => {
  for (const d of [deal, undefined]) {
    let s = act(kit.newGame('idle', 1, d), 'start');
    for (let t = 0; t < 240000; t += 50) s = kit.tick(s, 50);
    assert.equal(s.won, false);
    assert.equal(kit.stuck(s), true);
  }
});

test('a missing art piece is not drawn; a level with none draws the bare paper', () => {
  const bare = { ...LEVEL, art: undefined };
  let s = act(kit.newGame('d', 1, { levels: [bare] }), 'start');
  for (let i = 0; i < 40; i += 1) { s = kit.tick(s, 50); assert.doesNotMatch(kit.html(s), /<image|undefined|NaN/); }
  s = act(kit.newGame('d', 1, deal), 'start');
  s = tickTo(s, (x) => x.note === 'tell');
  assert.equal((kit.html(s).match(/<image/g) ?? []).length, 1, 'only the idle foe, also in its tell (no pose given)');
});

test('where the level comes from: a deal\'s levels[0] or level object; the registry\'s rows by id', async () => {
  assert.equal(kit.newGame('e', 1, { level: LEVEL }).level, LEVEL);
  assert.equal(await kit.levelFor({ data: { levels: [LEVEL] } }), LEVEL);
  assert.equal(await kit.levelFor({}), kit.LEVEL);
  assert.equal(await kit.levelFor({ data: { level: 'dabi' } }), kit.LEVEL);
  const reg = { games: [{ id: 'sneeze', name: pair('甲', 'A'), levels: [LEVEL] }, { id: 'rain', levels: [{ id: 'x' }] }] };
  assert.deepEqual(kit.ladderOf(reg).map((l) => l.id), ['two-tells']);
  assert.equal(kit.ladderOf(reg)[0].name.en, LEVEL.name.en, 'a level\'s own name');
  assert.equal(kit.ladderOf({ games: [{ id: 'sneeze', name: pair('甲', 'A'), levels: [{ id: 'y' }] }] })[0].name.en, 'A', 'else its row\'s');
});
