// 暴雨 · 拽爹上崖 — three pulls in the lulls; a pull into a gust slides him back;
// the minute's end saves him anyway (the book), graded rough.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, CALM, html, LIMIT, meta, NEED, newGame, schedule, segAt, tick, windAt } from '../scripts/games/storm.js';

const calmAt = (s, from = 0) => { for (let t = from; t < LIMIT; t += 50) if (windAt(s.sched, t) < CALM) return t; return -1; };
const gustAt = (s, from = 0) => { for (let t = from; t < LIMIT; t += 50) if (windAt(s.sched, t) > 0.6) return t; return -1; };
const run = (s, to) => tick(s, to - s.t);

test('meta in both languages; the schedule is the seed\'s', () => {
  assert.equal(meta.id, 'storm');
  assert.ok(meta.name.zh && meta.name.en && meta.how.zh && meta.how.en);
  assert.deepEqual(schedule('a'), schedule('a'));
  assert.notDeepEqual(schedule('a'), schedule('b'));
});

const nextLullAt = (s) => { const i = segAt(s.sched, s.t); for (let t = s.t; t < LIMIT; t += 50) if (segAt(s.sched, t) !== i && windAt(s.sched, t) < CALM) return t; return -1; };

test('three pulls, one in each lull, win cleanly', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    let s = act(newGame(`s${seed}`), { g: 'start' }).state, won = false;
    for (let i = 0; i < NEED; i += 1) {
      s = run(s, i ? nextLullAt(s) : calmAt(s, 10));
      const r = act(s, { g: 'pull' });
      s = r.state; won = r.won;
    }
    assert.ok(won, `seed ${seed}`);
    assert.equal(s.grade, s.t < 25000 ? 'clean' : 'steady');
  }
});

test('a second pull in the same lull counts for nothing', () => {
  let s = act(newGame('l'), { g: 'start' }).state;
  s = run(s, calmAt(s, 10));
  s = act(s, { g: 'pull' }).state;
  const r = act(tick(s, 20), { g: 'pull' });
  assert.equal(r.state.pulls, 1);
  assert.equal(r.state.note, 'regrip');
});

test('a pull into a gust slides him back and never below the start', () => {
  let s = act(newGame('g'), { g: 'start' }).state;
  s = run(s, gustAt(s));
  const r = act(s, { g: 'pull' });
  assert.equal(r.won, false);
  assert.equal(r.state.slips, 1);
  assert.equal(r.state.pulls, 0);
  assert.equal(r.state.note, 'slipped');
});

test('never a dead end: at the minute\'s end he is saved, rough', () => {
  let s = act(newGame('x'), { g: 'start' }).state;
  s = tick(s, LIMIT);
  assert.equal(s.won, true);
  assert.equal(s.grade, 'rough');
  assert.match(html(s, 'zh'), /塌了/);
});

test('nothing moves before the start; html in both languages', () => {
  const s = newGame('h');
  assert.equal(tick(s, 5000).t, 0);
  assert.equal(act(s, { g: 'pull' }).state, s);
  assert.match(html(s, 'zh'), /data-g="start"/);
  assert.match(html(act(s, { g: 'start' }).state, 'en'), /data-g="pull"/);
});
