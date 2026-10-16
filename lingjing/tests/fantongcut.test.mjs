// 喂饭桶 as a daily 割绳子 puzzle (2026-10-16): every generated level is proved before it is shown and
// a human-like player wins it — over many seeds, every tier and every element mix, at the bot's
// 10 ms clock and the page's 50 ms one — its three stars are reachable, generation is quick, the
// elements arrive one day at a time (the day's first puzzle features the new one and says so), a
// miss lays the level again, after four misses 「直接喂」 feeds it, and the rules keep the stars.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cut from '../scripts/games/fantongcut.js';
import { bot } from '../scripts/games/bots/fantongcut.js';
import { generate, FALLBACK, STEP_BUDGET } from '../scripts/games/rope-gen.js';
import { playOnce } from '../tools/board-bots.mjs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { VERBS } from '../scripts/rules.mjs';
import { puzzleOf } from '../scripts/rules/fantong.mjs';

const content = loadContent();
const MIXES = [[], ['gust'], ['gust', 'bubble'], ['gust', 'bubble', 'thorns'], ['gust', 'bubble', 'thorns', 'regrow']];
const MUSTS = [null, 'gust', 'bubble', 'thorns', 'regrow'];
const SEEDS = 40;

/* A day's opts, the way the rules hand them: tier and mix from the seed's index, the new element on some. */
const optsOf = (k) => { const d = k % 5; return { tier: (k >> 1) % 5, els: MIXES[d], must: k % 3 === 0 ? MUSTS[d] : null }; };

const made = Array.from({ length: SEEDS }, (_, k) => ({ k, ...generate(`t${k}`, optsOf(k)) }));

/* Played by the page's clock: 50 ms ticks, each move once the thing hung still 400 ms. */
function playAt(level, plan, step) {
  let s = cut.newGame('p', 1, { level: structuredClone(level), plan }), t = 0, calm = 0;
  while (t < 60000 && !s.won) {
    if (s.phase === 'play' && s.moves < plan.length && calm >= 400) {
      const m = plan[s.moves];
      const d = m.g === 'cut' ? { g: 'cut', v: String(m.v), k: String(Math.floor(s.swing.vines[m.v].joints.length / 2)) } : m.g === 'pop' ? { g: 'pop', i: '0' } : { g: m.g };
      s = cut.act(s, d).state; calm = 0;
    }
    s = cut.tick(s, step); t += step;
    calm = s.phase === 'play' && s.swing.bread.speed < 0.12 && Math.abs(s.swing.bread.angularSpeed) < 0.02 ? calm + step : 0;
    if (s.phase === 'miss') return s;
  }
  return s;
}

test(`the generator proves a level for nearly every seed (${SEEDS} seeds, every tier and mix), quickly`, () => {
  const proved = made.filter((m) => !m.fallback).length;
  assert.ok(proved / SEEDS >= 0.95, `proved ${proved}/${SEEDS}`);
  // The work is bounded in physics steps (the same on any machine; ~0.06 ms a step unloaded), and
  // the page makes it off its thread (rope-worker.js).
  const steps = made.map((m) => m.steps).sort((a, b) => a - b);
  assert.ok(steps.at(-1) <= STEP_BUDGET * 2 + 4000, `most steps ${steps.at(-1)}`);
  assert.ok(steps[SEEDS >> 1] < STEP_BUDGET / 2, `median steps ${steps[SEEDS >> 1]}`);
  for (const m of made.filter((x) => optsOf(x.k).must && !x.fallback)) {
    const L = m.level, must = optsOf(m.k).must;
    const has = { gust: Boolean(L.gust), bubble: Boolean(L.bubbles?.length), thorns: Boolean(L.thorns?.length), regrow: L.vines.some((v) => v.regrow) }[must];
    assert.ok(has, `t${m.k}: the new ${must} is in the day's first puzzle`);
  }
});

test('the same seed makes the same level', () => {
  assert.deepEqual(generate('t3', optsOf(3)).level, made[3].level);
});

test('every generated level is won by a human-like player (200 ms ± 40 hand, the bot harness)', () => {
  const lost = [];
  for (const m of made) {
    const r = playOnce(cut, bot, { seed: `t${m.k}`, deal: { level: m.level, plan: m.plan }, limit: 60000 });
    if (!r.won) lost.push(`t${m.k}`);
  }
  assert.deepEqual(lost, []);
});

test('…and at the page\'s 50 ms clock as at 10 ms; its three stars are reachable by its star plan', () => {
  for (const m of made) {
    for (const step of [10, 50]) assert.equal(playAt(m.level, m.plan, step).phase !== 'miss', true, `t${m.k} at ${step} ms`);
    const s = playAt(m.level, m.starPlan, 10);
    assert.ok(s.won, `t${m.k}: the star plan feeds it too`);
    assert.equal(s.stars, 3, `t${m.k}: three stars on the star plan`);
  }
});

test('the fallback level always works', () => {
  assert.ok(playAt(FALLBACK, [{ g: 'cut', v: 0 }], 50).won);
});

test('a miss lays the level again; after four misses 「直接喂」 feeds it, stars 0; drawn in both languages', () => {
  const m = made.find((x) => x.level.vines.length > 1 && !x.level.bubbles);
  let s = cut.newGame('x', 1, { level: structuredClone(m.level), plan: m.plan });
  for (const lang of ['zh', 'en']) assert.match(cut.html(s, lang), /data-g="cut"[^>]*data-g-swipe/);
  assert.equal(cut.stuck(s), false);
  assert.doesNotMatch(cut.html(s, 'zh'), /data-g="skip"/);
  s = { ...s, misses: cut.MAX_MISSES };
  assert.match(cut.html(s, 'zh'), /直接喂/);
  const fed = cut.act(s, { g: 'skip' }).state;
  assert.equal(fed.won, true); assert.equal(fed.stars, 0); assert.equal(fed.grade, 'skipped');
  // A fall to the floor: a miss, then laid again at once.
  let f = cut.newGame('y', 1, { level: { bread: [60, 150], vines: [{ at: [60, 34] }], mouth: [300, 358], stars: [[60, 200], [60, 250], [60, 300]] } });
  f = cut.act(f, { g: 'cut', v: '0', k: '2' }).state;
  for (let i = 0; i < 80 && f.phase === 'play'; i++) f = cut.tick(f, 50);
  assert.equal(f.phase, 'miss'); assert.equal(f.misses, 1);
  f = cut.tick(f, 800);
  assert.equal(f.phase, 'play'); assert.ok(f.swing.vines.every((v) => v.cut == null));
});

test('alone (the 游戏厅): a sample day per level, a mount of its own, registered', async () => {
  const s = cut.newGame('sample', 3);
  assert.ok(s.level.mouth && s.level.stars.length === 3);
  assert.equal(typeof cut.mount, 'function');
  const reg = (await import('../worlds/jiuding/games.json', { with: { type: 'json' } })).default;
  assert.ok(reg.games.some((g) => g.id === 'fantongcut'));
});

/* ── the rules: one element a day, the seed, the stars ── */

const T = content.fantong;
const NOW = new Date('2026-10-15T09:00:00');
const day = (k, h = 9) => new Date(NOW.getTime() + k * 86400000 + (h - 9) * 3600000);
const save = () => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: 'wm-diyilu', place: 'chaifang', bag: { danlu: 1 }, wealth: 0 });
const feed = (s, now, extra = {}) => VERBS.fantong(s, content, { now, quests: [] }, { action: 'feed', id: 'chaihuo', ...extra });

test('the elements come one a day: the day\'s first puzzle features the new one and says it; the rules keep the stars', () => {
  let s = save();
  const seen = [];
  for (let d = 0; d < 6; d++) {
    for (const h of [9, 11]) {
      const p = puzzleOf(T, s, day(d, h));
      seen.push([p.day, p.must, p.els.length]);
      if (p.must) assert.ok(p.teach, `day ${p.day}: ${p.must} is taught`);
      assert.match(p.seed, new RegExp(`\\|${s.fantong?.n ?? 0}$`), 'the seed carries the feed count');
      const r = feed(s, day(d, h), { stars: 2 });
      assert.ok(r.result.ok, JSON.stringify(r.result));
      s = r.state;
    }
  }
  assert.deepEqual(seen, [[1, null, 0], [1, null, 0], [2, 'gust', 1], [2, null, 1], [3, 'bubble', 2], [3, null, 2], [4, 'thorns', 3], [4, null, 3], [5, 'regrow', 4], [5, null, 4], [6, 'spring', 5], [6, null, 5]]);
  assert.equal(s.fantong.stars, 24);
  assert.equal(s.fantong.last.stars, 2);
  assert.equal(s.fantong.days, 6);
  assert.equal(feed(save(), NOW, { stars: 9 }).state.fantong.stars, 3, 'clamped to three');
});

/* ── round two (2026-10-16): no waiting, earned stars, the bubble swung into, the swipe ── */

test('no waiting: after a move the swing is felt a moment, then eases up to FAST× and back — under two seconds of clock', () => {
  const level = { bread: [180, 150], vines: [{ at: [50, 34] }, { at: [300, 34] }], mouth: [300, 358], stars: [[300, 200], [300, 250], [300, 300]] };
  let s = cut.newGame('w', 1, { level });
  assert.equal(cut.paceOf(s), 1, 'untouched: its own pace');
  s = cut.act(s, { g: 'cut', v: '0', k: '3' }).state;
  let wall = 0, still = 0;
  while (wall < 6000 && still < 400) { const pace = cut.paceOf(s); s = cut.tick(s, 50); wall += 50; still = s.swing.bread.speed < 0.12 ? still + 50 * pace : 0; }
  assert.ok(wall < 1900, `hangs still ${wall} ms of the clock after the cut`);
  assert.equal(cut.paceOf(s), 1, 'still: its own pace again');
});

test('earned stars: past the first day, at least 2 levels in 5 hide a 灵光 off the plain path', () => {
  const later = made.filter((m) => optsOf(m.k).els.includes('gust') && !m.fallback);
  const better = later.filter((m) => m.better).length;
  assert.ok(better / later.length >= 0.4, `${better}/${later.length}`);
});

test('the bubble hangs off the thing\'s own line: it must be swung in', () => {
  for (const m of made.filter((x) => x.level.bubbles?.length && !x.fallback && !x.eased)) {
    const [bx, by] = m.level.bubbles[0].at, [x0, y0] = m.level.bread;
    assert.ok(Math.hypot(bx - x0, by - y0) >= 60, `t${m.k}`);
    assert.ok(m.level.vines.length >= 2, `t${m.k}: two vines to swing from`);
  }
});

test('tier 0 is the very first feed only', () => {
  let s = save();
  assert.equal(puzzleOf(T, s, NOW).tier, 0);
  s = feed(s, NOW).state;
  assert.equal(puzzleOf(T, s, day(0, 11)).tier, 1);
});

test('a quick swipe cuts the first vine it crosses; a long deliberate one may cut the next; a still finger none', async () => {
  const { stroke, crosses, SECOND_PX, SECOND_MS } = await import('../scripts/games/swipe.js');
  const vine = (v) => ({ dataset: { g: 'cut', v: String(v), k: '3' } });
  let st = stroke(0, 0, null, 0);
  assert.equal(crosses(st, 10, 0, vine(0), 10), true, 'first vine');
  assert.equal(crosses(st, 24, 0, vine(1), 40), false, 'a flick: not the second');
  st = stroke(0, 0, null, 0);
  crosses(st, 10, 0, vine(0), 10);
  assert.equal(crosses(st, 10 + SECOND_PX + 2, 0, vine(1), 10 + SECOND_MS + 20), true, 'a long stroke goes on');
  st = stroke(5, 5, vine(0), 0);
  assert.equal(crosses(st, 6, 6, vine(1), 500), false, 'held still: nothing');
});

/* ── the module's newer tools (2026-10-16): 弹竹 · 双印 · 乌鸦 ── */

test('the new tools: each one\'s first day features it, met on the way (bounced off, gone through, a crow that would take it), and the bot wins', () => {
  const ALL = ['gust', 'bubble', 'thorns', 'regrow', 'spring', 'seals', 'crow'];
  for (const must of ['spring', 'seals', 'crow']) {
    for (let k = 0; k < 4; k++) {
      const m = generate(`tool${k}|${must}`, { tier: 2, els: ALL.slice(0, ALL.indexOf(must) + 1), must });
      assert.ok(!m.fallback, `${must} ${k}`);
      assert.ok({ spring: m.level.springs, seals: m.level.seals, crow: m.level.crows }[must]?.length, `${must} ${k}: in the level`);
      const r = playOnce(cut, bot, { seed: `tool${k}`, deal: { level: m.level, plan: m.plan }, limit: 60000 });
      assert.ok(r.won, `${must} ${k}: won`);
    }
  }
});
