// 烙饼 · 一鏊子 (games/laobing.js, 2026-10-16): the cooking-timer game the 饭桶 takes turns with.
// A perfect hand wins the best grade, an idle round loses; turning and taking off land by the golden
// stretch (raw before, scorched after, a white side not taken); wood makes the fire cook faster; the
// griddle grows from two breads to four; short of the quota another batch is one tap away and after
// the misses 「直接喂」; the 饭桶 hands the turns out by the rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as lb from '../scripts/games/laobing.js';
import { bot } from '../scripts/games/bots/laobing.js';
import { playOnce } from '../tools/board-bots.mjs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { VERBS } from '../scripts/rules.mjs';
import { puzzleOf } from '../scripts/rules/fantong.mjs';

const { BURN, CHAR, GOLD, HOT, HOT_MS, QUOTA, ROUND_MS, SIDE_MS, WHITE, WOOD } = lb;

/* Run the clock until the first bread is down, then return the state. */
function firstBread(seed = 'x') {
  let s = lb.newGame(seed);
  while (!s.spots[0].b) s = lb.tick(s, 10);
  return s;
}
/* Cook the bread at spot 0 until its down side reaches d. */
function cookTo(s, d) {
  while (s.spots[0].b.sides[s.spots[0].b.down] < d) s = lb.tick(s, 10);
  return s;
}
const tap = (s, i = 0) => lb.act(s, { g: 'bread', i: String(i) }).state;

test('a perfect hand (the bot at 200 ms) wins the best grade, every seed', () => {
  for (let k = 0; k < 20; k++) {
    const r = playOnce(lb, bot, { seed: `p${k}`, limit: ROUND_MS + 2000 });
    assert.ok(r.won, `p${k} won`);
    assert.equal(r.grade, 'golden', `p${k} golden`);
  }
});

test('an idle round loses: every bread scorches off, nothing golden, and it says another batch', () => {
  let s = lb.newGame('idle');
  while (s.phase === 'play') s = lb.tick(s, 50);
  assert.equal(s.phase, 'over'); assert.equal(s.won, false);
  assert.equal(lb.countOf(s, 'gold'), 0);
  assert.ok(lb.countOf(s, 'scorched') >= 6, `scorched ${lb.countOf(s, 'scorched')}`);
  assert.equal(s.misses, 1);
  for (const lang of ['zh', 'en']) assert.match(lb.html(s, lang), /data-g="retry"/);
  const again = lb.act(s, { g: 'retry' }).state;
  assert.equal(again.phase, 'play'); assert.equal(again.t, 0); assert.equal(again.plate.length, 0); assert.equal(again.misses, 1);
});

test('turning: a white side is not taken; before golden it turns and the bread comes off raw', () => {
  let s = firstBread();
  s = cookTo(s, WHITE * 0.5);
  const white = tap(s);
  assert.equal(white.spots[0].b.flipped, false); assert.equal(white.note, 'white');
  s = cookTo(s, (WHITE + GOLD) / 2);
  s = tap(s); // turned too soon
  assert.equal(s.spots[0].b.flipped, true);
  s = cookTo(s, (GOLD + BURN) / 2);
  s = tap(s);
  assert.equal(s.off.how, 'raw');
});

test('taking off: golden both sides is golden; a side left past BURN is scorched; past CHAR 娘 takes it herself', () => {
  let s = firstBread('g');
  s = tap(cookTo(s, (GOLD + BURN) / 2));
  s = tap(cookTo(s, (GOLD + BURN) / 2));
  assert.equal(s.off.how, 'gold'); assert.equal(s.plate.at(-1), 'gold');
  assert.equal(s.spots[0].b, null, 'the spot is empty');
  // new dough lands on it soon
  for (let k = 0; k < 120 && !s.spots[0].b; k++) s = lb.tick(s, 10);
  assert.ok(s.spots[0].b, 'new dough');
  let b = firstBread('s');
  b = tap(cookTo(b, (GOLD + BURN) / 2));
  b = tap(cookTo(b, BURN + 0.05));
  assert.equal(b.off.how, 'scorched');
  let c = cookTo(firstBread('c'), CHAR - 0.01);
  c = lb.tick(c, 200);
  assert.ok(c.plate.includes('scorched')); assert.equal(c.note, 'char');
});

test('the fire: a stick makes everything cook HOT× as fast for HOT_MS, sticks add up, three a round', () => {
  const s = firstBread('f');
  const cold = lb.tick(s, 1000).spots[0].b.sides[0] - s.spots[0].b.sides[0];
  let h = lb.act(s, { g: 'fire' }).state;
  assert.equal(h.wood, WOOD - 1);
  const hot = lb.tick(h, 1000).spots[0].b.sides[0] - h.spots[0].b.sides[0];
  assert.ok(Math.abs(hot / cold - HOT) < 0.01, `hot/cold ${hot / cold}`);
  h = lb.act(h, { g: 'fire' }).state;
  assert.equal(h.hotUntil, h.t + 2 * HOT_MS);
  h = lb.act(lb.act(h, { g: 'fire' }).state, { g: 'fire' }).state;
  assert.equal(h.wood, 0); assert.equal(h.note, 'nowood');
  const after = lb.tick(h, 2 * HOT_MS + 3 * HOT_MS);
  assert.equal(lb.heatOf(after), 1, 'the fire dies back');
  // the golden stretch is shorter in time with the fire up
  const b = s.spots[0].b;
  assert.ok(((BURN - GOLD) * SIDE_MS) / (b.rate * HOT) < ((BURN - GOLD) * SIDE_MS) / b.rate);
});

test('the ramp: two breads at first, three, then four; each its own pace; no dough in the last seconds', () => {
  let s = lb.newGame('ramp'), most = [0, 0, 0];
  const at = [1500, 13000, 24500];
  while (s.t < 26000) {
    s = lb.tick(s, 50);
    const busy = s.spots.filter((x) => x.b).length;
    at.forEach((t, i) => { if (s.t <= t + 50 && s.t >= t - 50) most[i] = Math.max(most[i], busy); });
  }
  assert.deepEqual(most.map((m, i) => m <= [2, 3, 4][i]), [true, true, true]);
  assert.equal(lb.spotsAt(0), 2); assert.equal(lb.spotsAt(lb.RAMP[0]), 3); assert.equal(lb.spotsAt(lb.RAMP[1]), 4);
  const rates = new Set(Array.from({ length: 6 }, (_, k) => lb.rateOf('ramp', k).toFixed(3)));
  assert.ok(rates.size >= 5, 'each bread its own pace');
  // A fourth bread lands on the fourth spot once it opens.
  let r = lb.newGame('ramp4');
  while (r.t < lb.RAMP[1] + 1500) r = lb.tick(r, 50);
  assert.ok(r.spots[3].b, 'a fourth bread');
});

test('grades: the quota wins; stars by golden over it and the bad ones', () => {
  const plate = (g, bad) => [...Array(g).fill('gold'), ...Array(bad).fill('scorched')];
  assert.equal(lb.gradeOf(plate(QUOTA - 1, 0)), null);
  assert.deepEqual(lb.gradeOf(plate(QUOTA, 3)), { stars: 1, grade: 'plain' });
  assert.deepEqual(lb.gradeOf(plate(QUOTA, 1)), { stars: 2, grade: 'good' });
  assert.deepEqual(lb.gradeOf(plate(QUOTA + 2, 0)), { stars: 3, grade: 'golden' });
});

test('stuck after the misses: 「直接喂」 (or 让娘来 alone) feeds it, stars 0; drawn in both languages, painted', () => {
  let s = { ...lb.newGame('st', 1, { item: { name: '柴火棍' } }), misses: lb.MAX_MISSES, phase: 'over', live: false, note: 'idle', left: QUOTA };
  assert.equal(lb.stuck(s), true);
  assert.match(lb.html(s, 'zh'), /直接喂/);
  assert.match(lb.html({ ...s, item: null }, 'zh'), /让娘来/);
  const fed = lb.act(s, { g: 'skip' }).state;
  assert.equal(fed.won, true); assert.equal(fed.stars, 0);
  const live = firstBread();
  for (const lang of ['zh', 'en']) {
    const h = lb.html(live, lang);
    assert.match(h, /data-g="bread" data-i="0"/); assert.match(h, /data-g="fire"/);
    assert.match(h, /art\/games\/laobing\/(griddle|raw|stove|fire)\.webp/);
    assert.doesNotMatch(h, /NaN|undefined/);
  }
});

test('alone (the 游戏厅): registered as a daily game, with a mount of its own', async () => {
  assert.equal(typeof lb.mount, 'function');
  const reg = (await import('../worlds/jiuding/games.json', { with: { type: 'json' } })).default;
  assert.ok(reg.games.some((g) => g.id === 'laobing' && g.group === 'daily'));
});

/* ── the 饭桶's turns (rules/fantong.mjs puzzleOf `game`) ── */
const content = loadContent();
const NOW = new Date('2026-10-15T09:00:00');
const day = (k, h = 9) => new Date(NOW.getTime() + k * 86400000 + (h - 9) * 3600000);
const save = () => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: 'wm-diyilu', place: 'chaifang', bag: { danlu: 1 }, wealth: 0 });
const feed = (s, now) => VERBS.fantong(s, content, { now, quests: [] }, { action: 'feed', id: 'chaihuo', stars: 2 });

test('the 饭桶 takes turns: 割绳子 first and on every teaching feed, else 烙饼 after 割绳子 and back', () => {
  let s = save();
  const seen = [];
  for (let d = 0; d < 10; d++) {
    for (const h of [9, 11]) {
      const p = puzzleOf(content.fantong, s, day(d, h));
      seen.push(p.game);
      if (p.must) assert.equal(p.game, 'fantongcut', `day ${p.day}: the new ${p.must} is met on the rope`);
      const r = feed(s, day(d, h));
      assert.ok(r.result.ok);
      assert.equal(r.state.fantong.last.game, p.game);
      s = r.state;
    }
  }
  assert.equal(seen[0], 'fantongcut'); assert.equal(seen[1], 'laobing', 'the first day\'s second feed bakes');
  assert.ok(seen.filter((g) => g === 'laobing').length >= 8, seen.join(' '));
  // A one-a-day hand: past the teaching days it alternates.
  let one = save();
  const daily = [];
  for (let d = 0; d < 12; d++) { daily.push(puzzleOf(content.fantong, one, day(d)).game); one = feed(one, day(d)).state; }
  assert.deepEqual(daily.slice(8), ['laobing', 'fantongcut', 'laobing', 'fantongcut']);
});
