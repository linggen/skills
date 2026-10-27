// 嘀声 · 二十米往返跑 (games/shuttle.js): 今二's beep test, a 节奏 board (Hanli 10-27: 「这个小游戏连着出现, 换一个」 —
// it was 气走经脉 right after 卧推's).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sh from '../scripts/games/shuttle.js';
import { bot } from '../scripts/games/bots/shuttle.js';
import { loadContent } from '../scripts/content.mjs';

const start = () => sh.act(sh.newGame('t'), { g: 'start' }).state;
const run = (s, ms, step = 10) => { for (let t = 0; t < ms; t += step) s = sh.tick(s, step); return s; };

test('the task plays it: 节奏, pays nothing (今), its how goal first', () => {
  const c = loadContent(), t = c.tasks.tasks.find((x) => x.id === 'jin-didi');
  assert.equal(t.game, 'shuttle');
  assert.equal(c.games.games.find((g) => g.task === 'jin-didi').mechanic, '节奏');
  assert.deepEqual(t.grant, { table: 'task' });
  assert.ok(t.how.zh.length <= 40 && t.how.zh.startsWith('嘀声'), t.how.zh);
});

test('the first level is the easy one, and every level quicker and tighter than the last', () => {
  assert.ok(sh.STAGES[0].gap >= 1400 && sh.STAGES[0].win >= 280);
  for (let i = 1; i < sh.STAGES.length; i += 1) {
    assert.ok(sh.STAGES[i].gap < sh.STAGES[i - 1].gap);
    assert.ok(sh.STAGES[i].win <= sh.STAGES[i - 1].win);
  }
});

test('a turn on the beep counts; one too early, or none by the window\'s end, costs one of three', () => {
  let s = start();
  const g = sh.STAGES[0];
  s = run(s, g.gap - 100);
  s = sh.act(s, { g: 'turn' }).state;
  assert.equal(s.mark, 'hit');
  assert.equal(s.lives, 3);
  s = run(s, 200);
  assert.equal(s.laps, 1);
  // too early: the next beep is a whole length away
  s = sh.act(s, { g: 'turn' }).state;
  s = run(s, sh.DOUBLE_MS + 10);
  s = sh.act(s, { g: 'turn' }).state;
  assert.equal(s.lives, 2);
  assert.equal(s.note, 'early');
  s = run(s, g.gap);
  assert.equal(s.laps, 2, 'the missed length goes by; no second life for it');
  assert.equal(s.lives, 2);
  // late: no tap at all
  s = run(s, g.gap + g.win + 20);
  assert.equal(s.lives, 1);
  assert.equal(s.note, 'late');
});

test('three misses is 出局: that level again with all three; twice out and the page may offer its skip', () => {
  let s = start();
  assert.equal(sh.stuck(s), false);
  s = run(s, sh.STAGES[0].gap * 3 + sh.STAGES[0].win + 50);
  assert.equal(s.outs, 1);
  assert.equal(s.lives, 3);
  assert.equal(s.bi, 0);
  assert.equal(s.note, 'out');
  s = run(s, sh.AGAIN_MS + sh.STAGES[0].gap * 3 + sh.STAGES[0].win + 50);
  assert.equal(s.outs, 2);
  assert.equal(sh.stuck(s), true);
});

test('played clean on the beat it is won with three stars; it sounds each beep, turn and level', () => {
  let s = start(), heard = new Set();
  for (let i = 0; i < 200000 && !s.won; i += 10) {
    const a = bot(s, { lead: 0 });
    let b = s;
    if (a) { s = sh.act(s, a).state; for (const e of sh.sounds(b, s)) heard.add(e); }
    b = s; s = sh.tick(s, 10);
    for (const e of sh.sounds(b, s)) heard.add(e);
  }
  assert.equal(s.won, true);
  assert.equal(s.stars, 3);
  assert.equal(s.grade, 'clean');
  assert.equal(s.laps, sh.STAGES.reduce((n, x) => n + x.n, 0));
  for (const e of ['beat', 'turn', 'level']) assert.ok(heard.has(e), e);
  for (const e of heard) assert.ok(sh.meta.sounds.includes(e), e);
});

test('it draws in both languages: the court, the two lines, the ring on the line he runs to, the turn button', () => {
  let s = start();
  s = run(s, 400);
  for (const lang of ['zh', 'en']) {
    const h = sh.html(s, lang);
    assert.match(h, /jin-court\.webp/);
    assert.equal((h.match(/g-shuttle-line/g) ?? []).length, 2);
    assert.match(h, /g-shuttle-ring/);
    assert.match(h, /data-g="turn"/);
  }
  assert.match(sh.html(sh.newGame('x'), 'en'), /data-g="start"/);
});
