// 兽潮 — the daily beast tide at 沉鼎观 (Hanli 2026-10-20: 「兽潮塔防可以作为游戏里才有的一个情节. 比如每天固定时间有
// 兽潮攻击沉鼎观. 在游戏里交代一下就好了」; 守墙关 「可以」; 「这几个主力游戏都有多个关卡, 以后要持续加关卡. 然后游戏里每次
// 出现一个关卡」). The window, the gate, the cost and pay, a night missed, the nights in order and the rise past
// them, the beasts by the 回 — the rules', with a fixed clock (rules/shouchao.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo, task, win } from '../scripts/rules.mjs';
import { beastOpen, riseOf, shouchaoHosted, tideRows, tonightLevel, wallKit } from '../scripts/rules/shouchao.mjs';
import { levelDealt } from '../scripts/games/shouqiang.js';
import { sceneGame, stageCards } from '../scripts/stage.mjs';

const content = loadContent();
const kit = wallKit(content);
const T = content.tasks.tasks.find((t) => t.shouchao);
const START = new Date(2026, 9, 20, 9, 0);
const day = (d, h, m = 0) => new Date(2026, 9, d, h, m);
const ctx = (now) => ({ now, quests: [] });
const offered = (s, now) => (look(s, content, ctx(now)).tasks ?? []).find((t) => t.id === T.id) ?? null;

const cache = new Map();
/* A save played to a scene (the story's own walk), stood at 沉鼎观's 外门 with a full pool. */
function at(target) {
  if (!cache.has(target)) {
    // The walk plays without 灵气 (as every walk does); the tide is checked with it on.
    process.env.LINGJING_STAMINA_LIMIT = '0';
    try { cache.set(target, playTo(content, newState(content, 'zh', START), target, { now: START }).state); } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  }
  return { ...structuredClone(cache.get(target)), place: 'waimen', stamina: 100, stamina_at: day(20, 17).toISOString() };
}
/* A night played to its end: the page's win with its stars, then counted. */
function night(s, now, stars = 3) {
  const w = win(s, content, ctx(now), { id: T.id, stars });
  assert.ok(w.result.ok, `win: ${JSON.stringify(w.result)}`);
  return task(w.state, content, ctx(now), { action: 'done', id: T.id });
}

test('the row: a board of 守墙关, 酉时, opened by 古四\'s 小周天, every tide row of beasts that have a 回', () => {
  assert.equal(T.game, 'shouqiang');
  assert.deepEqual(T.shouchao.hours, [17, 19]);
  assert.equal(T.shouchao.after, 'wm-zhoutian');
  assert.equal(content.chapters['00-waimen'].scenes['wm-zhoutian'].hui, 'h05', '小周天 is 古四\'s');
  assert.ok(content.rewards.stamina.cost[T.shouchao.cost] > 0, 'it costs 灵气');
  const rows = tideRows(kit);
  assert.ok(rows.length >= 5);
  for (const r of rows) for (const g of r.waves.flat()) assert.ok(content.creatures.creatures.find((c) => c.id === g[0])?.hui, `${r.id}: ${g[0]} has a 回`);
  assert.equal(T.shouchao.tell.length, 2, '银月\'s one telling');
});

test('the window opens and shuts on the clock (酉时), counted through its grace', () => {
  const s = at('wm-yaoyuan');
  assert.equal(offered(s, day(20, 16, 59)), null, '16:59 — not yet');
  const o = offered(s, day(20, 17, 0));
  assert.ok(o, '17:00 — the tide');
  assert.equal(o.hosted, true, 'a hosted board: shut on an empty pool (cards.js boardShut)');
  assert.ok(offered(s, day(20, 18, 59)), '18:59');
  assert.equal(offered(s, day(20, 19, 0)), null, '19:00 — gone');
  // A night begun at 18:55 still counts at 19:20; at 19:31 it does not.
  const w = win(s, content, ctx(day(20, 18, 55)), { id: T.id, stars: 2 });
  assert.ok(w.result.ok);
  assert.ok(task(w.state, content, ctx(day(20, 19, 20)), { action: 'done', id: T.id }).result.ok);
  assert.equal(task(w.state, content, ctx(day(20, 19, 31)), { action: 'done', id: T.id }).result.ok, false);
  // Only at 沉鼎观 (Look walks a 外门 disciple back inside, so asked of the rule itself).
  assert.deepEqual(Object.keys(shouchaoHosted(content, s, day(20, 17, 30))), [T.id]);
  assert.deepEqual(shouchaoHosted(content, { ...s, place: 'fangshi' }, day(20, 17, 30)), {});
});

test('gated on 古四\'s 小周天: never before it, offered from the first night he has 灵力', () => {
  const before = at('wm-zhoutian');
  assert.ok(!before.done_scenes.includes('wm-zhoutian'));
  assert.equal(offered(before, day(20, 17, 30)), null);
  assert.equal(win(before, content, ctx(day(20, 17, 30)), { id: T.id, stars: 3 }).result.ok, false);
  assert.ok(offered(at('wm-yaoyuan'), day(20, 17, 30)));
});

test('it costs 灵气 and pays by stars: 修为, 灵石 by the small-game ranks, an herb from two stars', () => {
  const s = at('wm-yaoyuan'), cost = content.rewards.stamina.cost[T.shouchao.cost];
  const paid = {};
  for (const stars of [1, 2, 3]) {
    const r = night(s, day(20, 17, 30), stars);
    assert.ok(r.result.ok, JSON.stringify(r.result));
    assert.equal(r.state.stamina, s.stamina - cost, `${stars}★ took ${cost} 灵气`);
    assert.equal(r.result.stars, stars);
    assert.equal(r.result.paid.board.wealth, content.balance.boards[T.shouchao.pay[stars].rank]);
    paid[stars] = r.result.paid;
    const herbs = Object.keys(r.state.bag ?? {}).filter((id) => T.shouchao.herbs.includes(id) && (r.state.bag[id] ?? 0) > (s.bag?.[id] ?? 0));
    assert.equal(herbs.length, stars >= 2 ? 1 : 0, `${stars}★: herb ${herbs}`);
  }
  assert.ok(paid[1].wealth < paid[2].wealth && paid[2].wealth < paid[3].wealth, '灵石 rise with the stars');
  assert.ok(paid[1].progress <= paid[2].progress && paid[2].progress <= paid[3].progress, '修为 rise with the stars');
  // An empty pool: refused, nothing changes.
  const empty = night({ ...s, stamina: 0, resting: true }, day(20, 17, 30), 3);
  assert.equal(empty.result.ok, false);
  assert.equal(empty.result.refused, 'no-stamina');
});

test('once a night; a night missed costs nothing — the next one is the same night, the pay intact', () => {
  const s = at('wm-yaoyuan');
  const one = night(s, day(20, 17, 30));
  assert.equal(one.result.night, 1);
  assert.equal(offered(one.state, day(20, 18, 0))?.status ?? 'done', 'done', 'counted: done for tonight');
  assert.equal(win(one.state, content, ctx(day(20, 18, 0)), { id: T.id, stars: 3 }).result.ok, false, 'not twice a night');
  // Three nights missed: nothing taken, nothing lost; the tide is back, on night 2.
  const back = { ...structuredClone(one.state), stamina: 100 };
  const o = offered(back, day(24, 17, 10));
  assert.ok(o);
  assert.equal(o.night, 2);
  assert.equal(back.wealth, one.state.wealth);
  assert.equal(back.progress, one.state.progress);
  // A lost night (no win sent) moves nothing on.
  assert.equal(offered(back, day(25, 17, 10)).night, 2);
});

test('each night is the next tide row, harder; past them the tide keeps rising on the last that fits', () => {
  let s = at('wm-yaoyuan');
  const seen = [];
  for (let d = 0; d < 6; d += 1) {
    const now = day(1 + d, 17, 20);
    const o = offered(s, now);
    seen.push({ lv: o.deal.lv, rise: o.rise ?? 0, over: o.deal.over });
    const r = night(s, now);
    assert.ok(r.result.ok, JSON.stringify(r.result));
    s = { ...r.state, stamina: 100 };
  }
  // 古四: 野猪 and 狰 only — the three rows of them, then the rise on the third.
  assert.deepEqual(seen.map((x) => x.lv), ['shouchao-1', 'shouchao-2', 'shouchao-3', 'shouchao-3', 'shouchao-3', 'shouchao-3']);
  assert.deepEqual(seen.map((x) => x.rise), [0, 0, 0, 1, 2, 3]);
  const rows = seen.slice(0, 3).map((x) => kit.levels.find((l) => l.id === x.lv));
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i].waves.length >= rows[i - 1].waves.length && rows[i].tide > rows[i - 1].tide, `${rows[i].id} after ${rows[i - 1].id}`);
  const count = (o) => o.waves.flat().reduce((n, g) => n + g[1], 0) * (o.difficulty ?? 1);
  for (let i = 4; i < 6; i += 1) {
    const [a, b] = [seen[i - 1].over, seen[i].over];
    assert.ok(b.difficulty > a.difficulty && b.growth > a.growth && count(b) > count(a), `rise ${seen[i].rise} is harder`);
  }
  // The game lays the night over the row (games/shouqiang.js levelDealt): the rise's knobs, the night's title.
  const dealt = levelDealt(kit, { lv: seen[5].lv, over: seen[5].over }, '');
  assert.equal(dealt.difficulty, seen[5].over.difficulty);
  assert.match(dealt.title.zh, /第6夜/);
  // 银月 tells it once: the first night's lead, never after a night is won.
  assert.equal(seen[0].over.lead[0].zh, T.shouchao.tell[0].zh);
  assert.ok(seen.slice(1).every((x) => !x.over.lead.some((l) => l.zh === T.shouchao.tell[0].zh)));
  // A row added later is played first, before the rise goes on.
  const later = { ...kit.levels.find((l) => l.id === 'shouchao-3'), id: 'shouchao-x', tide: 3.5 };
  kit.levels.push(later);
  try {
    assert.equal(tonightLevel(content, s).row.id, 'shouchao-x');
    assert.equal(tonightLevel(content, s).rise, 0);
  } finally { kit.levels.pop(); }
});

test('a row a story plays (`story` set) is never a night of the tide', () => {
  const s = at('wm-yaoyuan');
  const story = { ...kit.levels.find((l) => l.id === 'shouchao-1'), id: 'story-row', tide: 0.5, story: '09-furnace' };
  kit.levels.push(story);
  try {
    assert.ok(!tideRows(kit).some((l) => l.id === 'story-row'));
    assert.equal(tonightLevel(content, s).row.id, 'shouchao-1');
  } finally { kit.levels.pop(); }
});

test('beasts only of his 回 or before — read in book order (h11 is 古七, h09 古八)', () => {
  const s4 = at('wm-yaoyuan');
  assert.deepEqual(['yezhu', 'zheng', 'qiuyu', 'heyu', 'qique'].map((k) => beastOpen(content, s4, k)), [true, true, false, false, false]);
  const kinds = (lv) => new Set(lv.waves.flat().map((g) => g[0]));
  // 古四's rise never sends a beast it has not met, nor a boss.
  const rise = riseOf(content, s4, kit, kit.levels.find((l) => l.id === 'shouchao-3'), 4, T.shouchao.rise);
  assert.deepEqual([...kinds(rise)].sort(), ['yezhu', 'zheng']);
  // 古七 (h11): 犰狳 and 合窳 (met in 古五's 秘境) yes, 鬿雀 (古八, h09) not yet.
  const s7 = at('09-snow');
  assert.deepEqual(['qiuyu', 'heyu', 'qique'].map((k) => beastOpen(content, s7, k)), [true, true, false]);
  assert.equal(tonightLevel(content, { ...s7, shouchao: { won: ['shouchao-1', 'shouchao-2', 'shouchao-3'] } }).row.id, 'shouchao-4');
  assert.equal(tonightLevel(content, { ...s7, shouchao: { won: ['shouchao-1', 'shouchao-2', 'shouchao-3', 'shouchao-4'] } }).rise, 1, '山门 waits for 鬿雀');
  // 古八 (h09): the 山门 row with its 合窳, and past it a boss of his 回.
  const s8 = at('09-qulao');
  assert.ok(beastOpen(content, s8, 'qique'));
  const won = { shouchao: { won: ['shouchao-1', 'shouchao-2', 'shouchao-3', 'shouchao-4'] } };
  assert.equal(tonightLevel(content, { ...s8, ...won }).row.id, 'shanmen');
  const past = riseOf(content, s8, kit, kit.levels.find((l) => l.id === 'shanmen'), 2, T.shouchao.rise);
  assert.ok(kinds(past).has('heyu'), 'the boss, of his 回');
});

test('on the stage: the night\'s board stands at 沉鼎观 in the window, titled by the night', () => {
  const s = at('wm-yaoyuan');
  const l = look(s, content, ctx(day(20, 17, 30)));
  const o = l.tasks.find((t) => t.id === T.id);
  assert.match(o.title, /兽潮 · 第1夜/);
  assert.ok(stageCards(l).some((c) => c.card === 'board' && c.id === T.id), 'a board card');
  // …standing with the scene card, never queued behind it for the whole window (古五's 柴房: its choices stand).
  const p = look(at('wm-luobo'), content, ctx(day(20, 17, 30)));
  assert.ok(p.scene?.panel, 'a scene card stands');
  assert.ok(sceneGame(p, { card: 'board', id: T.id }), 'the tide with the scene card');
});
