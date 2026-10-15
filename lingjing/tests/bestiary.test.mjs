// 不打重复的怪，不拿重复的物品 (Hanli, 2026-10-15: 「要确保有足够的怪, 物品让用户刷, 不要打重复的怪,
// 拿重复的物品」): the game's pace is about one 回 a week, so a player grinds fights and finds. The
// rules keep it varied, deterministically — creatures.json `_hunt` and `_loot`:
// · a pool never deals one of the last few beasts fought at that place while it holds more;
// · a beast never met weighs more; an entry may wait for a 回 and keep to night or day;
// · a beast's `loot` leans to things he never had, and a one-off had before comes as its worth;
// · every beast fought is the 图鉴's (state.beasts), every thing found is remembered (state.found).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { duel } from '../scripts/rules.mjs';
import { allPlaces, encounterOf, meetBeast, poolBeast, poolTally, rememberAt } from '../scripts/rules/world.mjs';
import { lootOf, convertDup, drop } from '../scripts/rules/arms.mjs';
import { seenOf } from '../scripts/rules/codex.mjs';
import { hasFound, stow } from '../scripts/rules/pouch.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const base = loadContent();
const NOW = new Date(2026, 9, 5, 10, 0, 0); // ten in the morning, local: day
const NIGHT = new Date(2026, 9, 5, 22, 0, 0);
const jiScenes = Object.keys(base.chapters['01-ji'].scenes);
const at = (content, place, extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '01-ji', scene: null, place, tier: 'foundation', step: 0, progress: 0, wealth: 10,
  traits: ['wood', 'fire'], ended: ['00-prologue', '00-waimen', '00-zhuji', '01-ji'], done_scenes: jiScenes,
  stamina: 100, stamina_at: NOW.toISOString(), ...extra,
});

/* A world with a test stretch: 蒙山's pool made six strong (real creatures of 卷一), so the
   memory and the weighting can be seen without leaning on today's roster. */
function withPool(beasts, extra = {}) {
  const content = structuredClone(base);
  const doc = Object.values(content.places).find(d => d.pools?.mengshan);
  doc.pools.mengshan = { ...doc.pools.mengshan, beasts, ...extra };
  return content;
}
const SIX = ['yezhu', 'lang', 'xiong', 'longzhi', 'qiuyu', 'heyu'].map(creature => ({ creature }));

/* The draws a player would see, settling fight after fight at one place without a battle:
   the hunt record moves exactly as tasks.mjs duel moves it. */
function walk(content, state, place, k, now = NOW, { won = true } = {}) {
  let s = structuredClone(state);
  const seen = [];
  for (let i = 0; i < k; i += 1) {
    const p = allPlaces(content).find(x => x.id === place);
    const cid = poolBeast(content, s, p, now);
    seen.push(cid);
    const rec = s.duels?.[`hunt:${place}`];
    const n = rec?.day === dayKey(now) ? rec.n ?? 0 : 0;
    s.duels = { ...s.duels, [`hunt:${place}`]: { day: dayKey(now), outcome: won ? 'won' : 'lost', n: n + 1, at: new Date(now.getTime() - 3600000).toISOString(), last: rememberAt(content, rec, cid) } };
    meetBeast(s, cid, won, now);
  }
  return { seen, state: s };
}

test('a pool never deals the same beast twice running while it holds more than one — over many saves', () => {
  const content = withPool(SIX);
  for (let seed = 0; seed < 40; seed += 1) {
    const { seen } = walk(content, at(content, 'mengshan', { name: `s${seed}`, seed: `s${seed}` }), 'mengshan', 20);
    for (let i = 1; i < seen.length; i += 1) assert.notEqual(seen[i], seen[i - 1], `seed ${seed}: ${seen.join(' ')}`);
    // the last `memory` (3) stand down: no beast back within three fights
    for (let i = 3; i < seen.length; i += 1) assert.ok(!seen.slice(i - 3, i).includes(seen[i]), `seed ${seed}: ${seen[i]} again within three — ${seen.join(' ')}`);
    assert.equal(new Set(seen).size, 6, `seed ${seed}: all six met in twenty — ${seen.join(' ')}`);
  }
});

test('the memory crosses midnight: the day\'s count starts again, the last beasts still stand down', () => {
  const content = withPool(SIX);
  const { seen, state } = walk(content, at(content, 'mengshan'), 'mengshan', 3);
  const tomorrow = new Date(NOW.getTime() + 86400000);
  const next = poolBeast(content, state, allPlaces(content).find(p => p.id === 'mengshan'), tomorrow);
  assert.ok(!seen.includes(next), `${next} came back the next morning after ${seen}`);
});

test('a pool of one deals its one; a pool of two alternates', () => {
  const one = withPool([{ creature: 'yezhu' }]);
  assert.deepEqual([...new Set(walk(one, at(one, 'mengshan'), 'mengshan', 6).seen)], ['yezhu']);
  const two = withPool([{ creature: 'yezhu' }, { creature: 'lang' }]);
  const { seen } = walk(two, at(two, 'mengshan'), 'mengshan', 8);
  for (let i = 1; i < seen.length; i += 1) assert.notEqual(seen[i], seen[i - 1], seen.join(' '));
});

test('a beast never met is drawn first: in a fresh save the first fights at a stretch are new beasts', () => {
  const content = withPool(SIX.map(b => ({ ...b, weight: 1 })), { memory: 0 });
  let fresh = 0, total = 0;
  for (let seed = 0; seed < 60; seed += 1) {
    const s = at(content, 'mengshan', { name: `f${seed}`, seed: `f${seed}` });
    // four of the six met already; the two unmet weigh three each against one: 6 of 10
    for (const id of ['yezhu', 'lang', 'xiong', 'longzhi']) meetBeast(s, id, true, NOW);
    const cid = poolBeast(content, s, allPlaces(content).find(p => p.id === 'mengshan'), NOW);
    total += 1; if (['qiuyu', 'heyu'].includes(cid)) fresh += 1;
  }
  assert.ok(fresh / total > 0.45, `unmet drawn ${fresh} of ${total}`);
});

test('an entry waits for its 回 and keeps to its hour', () => {
  const content = withPool([{ creature: 'yezhu' }, { creature: 'lang', when: 'night' }, { creature: 'xiong', from: 'h10' }]);
  const place = allPlaces(content).find(p => p.id === 'mengshan');
  // 古九 (h10) reached, by day: 野猪 and 熊, never the night's 狼
  const day = new Set(walk(content, at(content, 'mengshan'), 'mengshan', 12).seen);
  assert.deepEqual([...day].sort(), ['xiong', 'yezhu']);
  const night = new Set(walk(content, at(content, 'mengshan'), 'mengshan', 12, NIGHT).seen);
  assert.deepEqual([...night].sort(), ['lang', 'xiong', 'yezhu']);
  // a save in the prologue (h01) has not reached 古九: no 熊
  const early = { ...at(content, 'mengshan'), chapter: '00-prologue', ended: [], done_scenes: [] };
  for (let n = 0; n < 12; n += 1) assert.notEqual(poolBeast(content, { ...early, duels: { 'hunt:mengshan': { day: dayKey(NOW), n } } }, place, NOW), 'xiong');
  // the stretch's count holds what its 回 holds, any hour
  assert.deepEqual(poolTally(content, at(content, 'mengshan'), place, NOW), { met: 0, of: 3 });
  assert.deepEqual(poolTally(content, early, place, NOW), { met: 0, of: 2 });
});

test('a pool fight settled is remembered by the place and the 图鉴; the result says a first meeting, a first win and the count', () => {
  const content = withPool([{ creature: 'yezhu' }, { creature: 'lang' }]);
  let s = at(content, 'mengshan');
  const up = encounterOf(content, s, NOW);
  assert.equal(up.new, true, 'an unmet beast is marked new on its card');
  assert.deepEqual({ met: up.pool.met, of: up.pool.of }, { met: 0, of: 2 });
  assert.ok(!seenOf(content, s).includes(up.creature.id));
  const started = duel(s, content, { now: NOW, quests: [] }, { id: up.game.id });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
  // settle by passing: a loss is a meeting, not a win
  const out = duel(started.state, content, { now: NOW, quests: [] }, { id: up.game.id, picks: Array(40).fill('end').join(',') });
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  s = out.state;
  assert.deepEqual(s.duels['hunt:mengshan'].last, [up.creature.id]);
  assert.equal(s.beasts[up.creature.id].met, 1);
  assert.equal(out.result.first_met, true);
  assert.equal(out.result.first_win, undefined);
  assert.deepEqual(out.result.tally, { met: 1, of: 2 });
  assert.ok(seenOf(content, s).includes(up.creature.id), 'a pool beast fought is in the 图鉴');
  // and the next one up is the other
  assert.notEqual(encounterOf(content, s, NOW).creature.id, up.creature.id);
});

test('loot leans to things never had; a one-off had before comes as its worth', () => {
  const content = structuredClone(base);
  const items = content.items.items;
  const hide = items.find(i => i.id === 'deer-hide'), one = items.find(i => i.id === 'bamboo-sword') ?? items.find(i => i.kind === 'weapon');
  one.once = true;
  const beast = { id: 'yezhu', loot: [{ item: 'ginseng', w: 1 }, { item: hide.id, w: 1 }] };
  // ginseng had, the hide never: the hide comes three times as often
  let hides = 0;
  for (let seed = 0; seed < 80; seed += 1) {
    const s = at(content, 'mengshan', { name: `l${seed}`, seed: `l${seed}`, bag: { ginseng: 1 } });
    if (lootOf(content, s, beast, NOW).item === hide.id) hides += 1;
  }
  assert.ok(hides > 45, `the thing never had came ${hides} of 80`);
  // a one-off had before is not a second copy
  const s = at(content, 'mengshan', { found: { [one.id]: 1 } });
  const row = lootOf(content, s, { id: 'x', loot: [{ item: one.id }] }, NOW);
  assert.equal(row.dup, true);
  const before = s.wealth, got = convertDup(content, s, row);
  assert.equal(s.bag[one.id] ?? 0, 0, 'no second copy');
  assert.equal(got.instead_of.id, one.id);
  assert.equal(s.wealth - before, one.sell ?? 0, 'its market price in 灵石');
  // a row may name what it becomes instead
  const t = at(content, 'mengshan', { found: { [one.id]: 1 } });
  const alt = convertDup(content, t, { item: one.id, dup: { item: 'ginseng', n: 2 } });
  assert.equal(t.bag.ginseng, 2);
  assert.equal(alt.instead_of.id, one.id);
});

test('a win of the wild drops its loot; the first of a thing is marked new and remembered after it is sold', () => {
  const content = structuredClone(base);
  const s = at(content, 'mengshan');
  const got = drop(content, s, { id: 'yezhu', loot: [{ item: 'deer-hide' }] }, NOW, { loot: true });
  // (a 符 may come beside it on a lucky win — rewards.json growth.charm)
  assert.deepEqual(got.filter(g => g.id === 'deer-hide').map(g => [g.id, g.new]), [['deer-hide', true]]);
  delete s.bag['deer-hide'];
  assert.ok(hasFound(s, 'deer-hide'), 'remembered after it left the bag');
  assert.equal(stow(content, s, 'deer-hide').new, undefined, 'the second is not new');
  // a story's fight (no loot) leaves only its drops
  const story = at(content, 'mengshan');
  assert.ok(!drop(content, story, { id: 'yezhu', loot: [{ item: 'deer-hide' }] }, NOW).some(g => g.id === 'deer-hide'));
});
