// 接雨 as 打地鼠 (Hanli 2026-10-16: 「要类似打地鼠, 一个或2个地方漏雨, 只能相应的盆」; 「直接放6个盆就好了」;
// 「失败你决定吧, 是否30, 你玩一下」): a leak pops up, its stain first; a basin goes only where it leaks now and
// comes back when the leak stops; FLOOD puddles before the rain stops lose the night and it starts again.
// Harder 10-19 (「同时放两个盆, 或者快一点」): after the first leaks they open in pairs, three toward the end.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as rain from '../scripts/games/rain.js';
import { bot } from '../scripts/games/bots/rain.js';
import { playOnce, rng } from '../tools/board-bots.mjs';

const started = (seed) => rain.act(rain.newGame(seed), { g: 'start' }).state;
const SEEDS = Array.from({ length: 24 }, (_, i) => `seed-${i}|rain-basins`);
const live = (sched, t) => sched.leaks.filter((l) => t >= l.from && t < l.to);

test('the rain: the first leaks alone, then two open together, from THREE up to three; each shows LEAD before its first drop (10-19)', () => {
  for (const seed of SEEDS) {
    const { leaks, thick, thicker } = rain.schedule(seed);
    assert.ok(leaks.length > rain.NEED + 10, 'leaks enough to miss some and still catch seventeen');
    for (let t = 0; t < rain.LIMIT; t += 50) assert.ok(live({ leaks }, t).length <= (t < rain.LIMIT * rain.THREE ? 2 : 3), `${seed} at ${t}`);
    for (let i = 0; i < rain.TEACH; i++) assert.ok(live({ leaks }, leaks[i].from + 10).length === 1 && leaks[i + 1].from >= leaks[i].to, 'the teaching leaks come alone');
    // After the teaching, every leak opens with another: two basins to set at once.
    const after = leaks.slice(rain.TEACH);
    for (const l of after) assert.ok(after.some((m) => m !== l && Math.abs(m.from - l.from) <= rain.JIT), `${seed}: a pair at ${l.from}`);
    assert.ok(thick != null && thick < 10000, 'two at once within the first ten seconds');
    assert.ok(thicker != null && thicker >= rain.LIMIT * rain.THREE, 'three only toward the fifth watch');
    assert.ok(leaks.some((l) => live({ leaks }, l.from + rain.JIT + 1).length === 3), 'and three do come');
    leaks.forEach((l) => {
      assert.equal(l.drops[0] - l.from, rain.LEAD);
      assert.ok(!leaks.some((m) => m !== l && m.spot === l.spot && m.from < l.to && l.from < m.to), 'never two leaks at one spot');
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
    assert.ok(t < 15000, `idle floods in ${t} ms`);
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

/* A hand of `react` ms (the FLOOD sim, rain.js): it taps a leak `react` (±150) after its stain shows, and
   ~0.35 s after its last tap — two stains seen together are tapped one after the other. */
function hand(seed, react) {
  const r = rng(`hand-${seed}-${react}`);
  let s = started(seed), t = 0, pending = null, last = -1e9, worst = 0;
  while (!s.won && !s.floods && t < 240000) {
    if (pending && t >= pending.at) { s = rain.act(s, pending.a).state; pending = null; last = t; }
    if (!pending) {
      const a = bot(s);
      if (a) pending = { a, at: Math.max(t, live(s.sched, s.t).find((l) => l.spot === a.i).from + react - 150 + r() * 300, last + 280 + r() * 140) };
    }
    s = rain.tick(s, 10); t += 10;
    worst = Math.max(worst, s.puddles);
  }
  return { s, worst };
}

test('a casual hand (0.6 s) never floods but sees puddles; a 1.3 s hand floods; a win after a flood is never dry', () => {
  let wet = 0;
  for (const seed of SEEDS.slice(0, 12)) {
    const { s, worst } = hand(seed, 600);
    assert.equal(s.won, true);
    assert.equal(s.floods, 0, seed);
    assert.ok(worst < rain.FLOOD - 8, `${seed}: ${worst} puddles, far from the line`);
    if (worst > 0) wet++;
  }
  assert.ok(wet >= 6, 'two at once: a casual hand leaves a puddle or two');
  const slow = SEEDS.slice(0, 12).filter((seed) => hand(seed, 1300).s.floods).length;
  assert.ok(slow >= 10, `a 1.3 s hand floods (${slow} of 12)`);
  // One leak short of seventeen on a second night, caught cleanly: still wet.
  const s = { ...started('a'), floods: 1, caught: rain.NEED - 1 };
  const l = s.sched.leaks[0];
  let w = rain.tick(s, l.from);
  w = rain.act(w, { g: 'spot', i: l.spot }).state;
  w = rain.tick(w, l.to - w.t);
  assert.equal(w.won, true);
  assert.equal(w.grade, 'wet');
});

test('the floor count shows the flood line and warns in its last five', () => {
  const s = started('a');
  assert.match(rain.html({ ...s, puddles: 4 }, 'zh'), new RegExp(`地上 <b>4</b> / ${rain.FLOOD}`));
  assert.doesNotMatch(rain.html({ ...s, puddles: 4 }, 'zh'), /is-wet/);
  assert.match(rain.html({ ...s, puddles: rain.DRY + 1 }, 'zh'), /class="is-wet"/);
  assert.match(rain.html({ ...s, puddles: rain.FLOOD - 5 }, 'zh'), /class="is-wet is-near"/);
  assert.doesNotMatch(rain.html({ ...s, puddles: rain.FLOOD - 6 }, 'zh'), /is-near/);
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

test('a tap just before a stain shows sets the basin: a pair\'s second leak may open JIT after the first', async () => {
  const rain = await import('../scripts/games/rain.js');
  let s = rain.act(rain.newGame('grace'), { g: 'start' }).state ?? rain.act(rain.newGame('grace'), { g: 'start' });
  const leak = s.sched.leaks[0];
  s = rain.tick(s, leak.from - s.t - 200);
  const r = rain.act(s, { g: 'spot', i: String(leak.spot) });
  assert.equal((r.state ?? r).basins[leak.spot], 0, 'placed 0.2 s early');
  const far = rain.tick(rain.act(rain.newGame('grace'), { g: 'start' }).state ?? rain.act(rain.newGame('grace'), { g: 'start' }), 0);
  const r2 = rain.act(far, { g: 'spot', i: String(leak.spot) });
  assert.equal((r2.state ?? r2).note, 'wasted', 'a tap long before its leak is still a wasted trip');
});
