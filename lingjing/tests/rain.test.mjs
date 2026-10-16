// 接雨 as 打地鼠 (Hanli 2026-10-16: 「要类似打地鼠, 一个或2个地方漏雨, 只能相应的盆」; 「直接放6个盆就好了」;
// 「失败你决定吧, 是否30, 你玩一下」): a leak pops up, its stain first; a basin goes only where it leaks now and
// comes back when the leak stops; FLOOD puddles before the rain stops lose the night and it starts again.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as rain from '../scripts/games/rain.js';
import { bot } from '../scripts/games/bots/rain.js';
import { playOnce, rng } from '../tools/board-bots.mjs';

const started = (seed) => rain.act(rain.newGame(seed), { g: 'start' }).state;
const SEEDS = Array.from({ length: 24 }, (_, i) => `seed-${i}|rain-basins`);
const live = (sched, t) => sched.leaks.filter((l) => t >= l.from && t < l.to);

test('the rain: one leak at a time at dusk, never more than two, never all the spots; each shows LEAD before its first drop', () => {
  for (const seed of SEEDS) {
    const { leaks } = rain.schedule(seed);
    assert.ok(leaks.length > rain.NEED + 10, 'leaks enough to miss some and still catch seventeen');
    for (let t = 0; t < rain.LIMIT; t += 50) assert.ok(live({ leaks }, t).length <= 2, `${seed} at ${t}`);
    for (let t = 0; t < rain.LIMIT * 0.2; t += 50) assert.ok(live({ leaks }, t).length <= 1, 'dusk: one at a time');
    assert.ok(leaks.some((l, i) => i && l.from < leaks[i - 1].to), 'toward the fifth watch, two at once');
    leaks.forEach((l, i) => {
      assert.equal(l.drops[0] - l.from, rain.LEAD);
      if (i) assert.ok(l.from - leaks[i - 1].from >= rain.LEAD, 'two leaks never begin within a hand\'s reach');
    });
  }
});

test('no situation forces a puddle: a hand that sets a basin as each stain shows keeps the floor bone dry, every night', () => {
  for (const seed of SEEDS) {
    let s = started(seed);
    while (!s.won) {
      for (let i = 0; i < rain.SPOTS.length; i++) if (s.basins[i] == null && rain.leakingAt(s.sched, i, s.t)) s = rain.act(s, { g: 'spot', i }).state;
      s = rain.tick(s, 50);
    }
    assert.equal(s.puddles, 0, seed);
    assert.equal(s.grade, 'dry');
    assert.equal(rain.fullCount(s), rain.NEED);
  }
});

test('the bot (a person\'s pace) is always dry: seventeen caught, no puddle, no flood', () => {
  for (const seed of ['bot-1', 'bot-2', 'bot-3', ...SEEDS.slice(0, 8)]) {
    let worst = 0;
    const r = playOnce(rain, (st) => { worst = Math.max(worst, st.puddles ?? 0, (st.floods ?? 0) * 99); return bot(st); }, { seed });
    assert.equal(r.won, true, seed);
    assert.equal(r.grade, 'dry', seed);
    assert.equal(worst, 0, seed);
  }
});

test('a basin goes only where it leaks now, comes back when the leak stops, and a dry tap costs a beat', () => {
  let s = started('a');
  const { leaks } = s.sched, l = leaks[0], dry = rain.SPOTS.findIndex((_, i) => i !== l.spot);
  s = rain.act(s, { g: 'spot', i: dry }).state;
  assert.equal(s.basins[dry], null, 'nothing set on a dry spot');
  assert.equal(s.note, 'wasted');
  s = rain.tick(s, l.from - s.t);
  const busy = rain.act(s, { g: 'spot', i: dry }).state;
  assert.equal(busy.note, 'wasted');
  assert.equal(rain.act(busy, { g: 'spot', i: l.spot }).state.basins[l.spot], null, 'busy a beat after a wasted trip');
  assert.equal(rain.act(rain.tick(busy, rain.MISS_MS), { g: 'spot', i: l.spot }).state.basins[l.spot], 0, 'and then free again');
  s = rain.act(s, { g: 'spot', i: l.spot }).state;
  assert.equal(s.basins[l.spot], 0);
  s = rain.tick(s, l.to - s.t);
  assert.equal(s.basins[l.spot], null, 'the leak stopped: the basin is back');
  assert.equal(rain.fullCount(s), 1, 'and counts toward the seventeen');
});

test('"cover everything at the start" holds no more than the live leaks, and ends wet or flooded', () => {
  for (const seed of SEEDS.slice(0, 8)) {
    let s = rain.tick(started(seed), s0(seed) + 100);
    for (let i = 0; i < rain.SPOTS.length; i++) s = rain.act(s, { g: 'spot', i }).state;
    assert.ok(s.basins.filter((b) => b != null).length <= live(s.sched, s.t).length, 'only where it leaks now');
    while (!s.won && s.t < rain.LIMIT && !s.floods) s = rain.tick(s, 50);
    assert.ok(s.floods > 0 || s.grade === 'wet', seed);
  }
  function s0(seed) { return rain.schedule(seed).leaks[0].from; }
});

test('an idle hand floods the house well before the fifth watch; the same night starts again at once, no re-reading', () => {
  for (const seed of ['a', 'b', 'c']) {
    let s = started(seed), t = 0;
    while (!s.floods) { s = rain.tick(s, 50); t += 50; }
    assert.ok(t < 40000, `idle floods in ${t} ms`);
    assert.equal(s.won, false, 'not a win: a fail');
    assert.equal(s.live, true, 'the rain comes again by itself');
    assert.equal(s.puddles, 0);
    assert.ok(s.basins.every((b) => b == null));
    assert.equal(rain.fullCount(s), 0);
    assert.equal(s.note, 'flood');
    assert.match(rain.html(s, 'zh'), /屋里成河了/);
    assert.match(rain.html(s, 'en'), /The house is a river/);
    const calm = rain.tick(s, 1000);
    assert.equal(calm.note, 'flood', '娘\'s line stands a breath');
    assert.equal(calm.puddles, 0);
  }
  let s = started('a');
  assert.equal(rain.stuck(s), false);
  while (s.floods < 3) s = rain.tick(s, 50);
  assert.equal(s.won, false);
  assert.equal(rain.stuck(s), true, 'three nights lost: the page may offer its skip');
});

test('a casual hand (0.6 s to see and tap) never floods; a win after a flood is never dry', () => {
  for (const seed of SEEDS.slice(0, 12)) {
    const r = rng(`casual-${seed}`);
    let s = started(seed), t = 0, pending = null, next = 0;
    while (!s.won && t < 240000) {
      if (pending && t >= pending.at) { s = rain.act(s, pending.a).state; pending = null; next = t + 400; }
      if (!pending && t >= next) { const a = bot(s); if (a) pending = { a, at: t + 450 + r() * 300 }; }
      s = rain.tick(s, 10); t += 10;
    }
    assert.equal(s.won, true);
    assert.equal(s.floods, 0, seed);
  }
  // One leak short of seventeen on a second night, caught cleanly: still wet.
  const s = { ...started('a'), floods: 1, caught: rain.NEED - 1 };
  const l = s.sched.leaks[0];
  let w = rain.tick(s, l.from);
  w = rain.act(w, { g: 'spot', i: l.spot }).state;
  w = rain.tick(w, l.to - w.t);
  assert.equal(w.won, true);
  assert.equal(w.grade, 'wet');
});

test('the floor count shows the flood line and warns in its last ten', () => {
  const s = started('a');
  assert.match(rain.html({ ...s, puddles: 4 }, 'zh'), new RegExp(`地上 <b>4</b> / ${rain.FLOOD}`));
  assert.doesNotMatch(rain.html({ ...s, puddles: 4 }, 'zh'), /is-wet/);
  assert.match(rain.html({ ...s, puddles: rain.DRY + 1 }, 'zh'), /class="is-wet"/);
  assert.match(rain.html({ ...s, puddles: rain.FLOOD - 5 }, 'zh'), /class="is-wet is-near"/);
});

test('a board saved before the 打地鼠 rain starts fresh on the new one', () => {
  const old = { seed: 'a', sched: { windows: [], drips: [], shifts: [] }, t: 4000, k: 3, live: true, basins: [0, null, null, null, null, null], spare: 16, hand: [], banked: 0, puddles: 2, note: 'go', won: false, grade: null };
  const s = rain.tick(old, 50);
  assert.ok(s.sched.leaks);
  assert.equal(s.live, true);
  assert.ok(rain.html(old, 'zh').includes('g-rain-house'));
});

test('no dead tap: every tap on a spot changes what the board shows — a refused one shakes its spot (play-human 10-16)', () => {
  let s = started('a');
  const l = s.sched.leaks[0], dry = rain.SPOTS.findIndex((_, i) => i !== l.spot);
  s = rain.tick(s, l.from - s.t + 100);
  const tapShows = (st, i) => { const after = rain.act(st, { g: 'spot', i }).state; return { after, changed: rain.html(after, 'zh') !== rain.html(st, 'zh') }; };
  // a dry spot: the wasted trip
  let r = tapShows(s, dry);
  assert.ok(r.changed, 'a dry tap shows');
  assert.match(rain.html(r.after, 'zh'), /is-nope/);
  // again while the hand is busy, at the leak: it shakes, nothing set
  const busy = rain.tick(r.after, rain.NOPE_MS);
  r = tapShows(busy, l.spot);
  assert.ok(r.changed, 'a busy tap shows');
  assert.equal(r.after.basins[l.spot], null);
  // a basin already there
  const set = rain.act(rain.tick(busy, rain.MISS_MS), { g: 'spot', i: l.spot }).state;
  assert.equal(set.basins[l.spot], 0);
  r = tapShows(rain.tick(set, rain.NOPE_MS), l.spot);
  assert.ok(r.changed, 'a tap on its basin shows');
  // the shake passes
  assert.doesNotMatch(rain.html(rain.tick(r.after, rain.NOPE_MS), 'zh'), /is-nope/);
});
