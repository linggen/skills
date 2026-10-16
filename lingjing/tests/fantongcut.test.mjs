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
  assert.deepEqual(seen, [[1, null, 0], [1, null, 0], [2, 'gust', 1], [2, null, 1], [3, 'bubble', 2], [3, null, 2], [4, 'thorns', 3], [4, null, 3], [5, 'regrow', 4], [5, null, 4], [6, null, 4], [6, null, 4]]);
  assert.equal(s.fantong.stars, 24);
  assert.equal(s.fantong.last.stars, 2);
  assert.equal(s.fantong.days, 6);
  assert.equal(feed(save(), NOW, { stars: 9 }).state.fantong.stars, 3, 'clamped to three');
});
