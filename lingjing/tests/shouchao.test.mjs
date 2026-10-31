// 兽潮 — the daily beast tide at 沉鼎观 (Hanli 2026-10-20: 「兽潮塔防可以作为游戏里才有的一个情节. 比如每天固定时间有
// 兽潮攻击沉鼎观. 在游戏里交代一下就好了」; 守墙关 「可以」; 「这几个主力游戏都有多个关卡, 以后要持续加关卡. 然后游戏里每次
// 出现一个关卡」; 2026-10-26 「好, 按这样改」: a cooldown, no clock window). The cooldown, the gate, the cost and pay, a
// night missed, the nights in order and the rise past them, the beasts by the 回 — the rules', with a fixed clock
// (rules/shouchao.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo, task, win } from '../scripts/rules.mjs';
import { beastOpen, shouchaoHosted, shouchaoWaiting, tideRows, tonight, wallKit } from '../scripts/rules/shouchao.mjs';
import { levelDealt } from '../scripts/games/shouqiang.js';
import { TIDES } from '../scripts/games/tide.js';
import { sceneGame, stageCards } from '../scripts/stage.mjs';
import { WORDS, trayHtml } from '../scripts/cards.js';

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
  // The 执事堂's errand (its first night) done — the hourly tide is what these tests ask of (tide-nights tests the errand).
  const s = structuredClone(cache.get(target));
  return { ...s, quests: { ...(s.quests ?? {}), 'guan-shouchao': { done_at: START.toISOString() } }, place: 'waimen', stamina: 100, stamina_at: day(20, 17).toISOString() };
}
/* A night played to its end: the page's win with its stars, then counted. */
function night(s, now, stars = 3) {
  const w = win(s, content, ctx(now), { id: T.id, stars });
  assert.ok(w.result.ok, `win: ${JSON.stringify(w.result)}`);
  return task(w.state, content, ctx(now), { action: 'done', id: T.id });
}

test('the row: a board of 守墙关, on a cooldown from balance.json, opened by 古四\'s 小周天, every tide row of beasts that have a 回', () => {
  assert.equal(T.game, 'shouqiang');
  assert.equal(content.balance.events.shouchao.every_h, 1, 'the cooldown is balance.json\'s, a cooldown event (rules/events.mjs)');
  assert.ok(!('every_h' in T.shouchao) && !('shouchao_h' in content.balance.cooldowns) && !('tide' in content.balance.play_pay), 'no clock of its own');
  assert.ok(!('hours' in T.shouchao) && !('grace_min' in T.shouchao), 'no clock window');
  assert.equal(T.shouchao.after, 'wm-zhoutian');
  assert.equal(content.chapters['00-waimen'].scenes['wm-zhoutian'].hui, 'h05', '小周天 is 古四\'s');
  assert.ok(content.rewards.stamina.cost[T.shouchao.cost] > 0, 'it costs 灵气');
  const rows = tideRows(kit);
  assert.ok(rows.length >= 5);
  for (const r of rows) for (const g of r.waves.flat()) assert.ok(content.creatures.creatures.find((c) => c.id === g[0])?.hui, `${r.id}: ${g[0]} has a 回`);
  assert.equal(T.shouchao.tell.length, 2, '银月\'s one telling');
});

test('offered at any hour — no clock window; only at 沉鼎观', () => {
  const s = at('wm-yaoyuan');
  for (const h of [3, 9, 13, 16, 17, 21, 23]) {
    const o = offered(s, day(20, h, 10));
    assert.ok(o, `${h}:10 — the tide`);
    assert.equal(o.hosted, true, 'a hosted board: shut on an empty pool (cards.js boardShut)');
  }
  // Only at 沉鼎观 (Look walks a 外门 disciple back inside, so asked of the rule itself).
  assert.deepEqual(Object.keys(shouchaoHosted(content, s, day(20, 10, 30))), [T.id]);
  assert.deepEqual(shouchaoHosted(content, { ...s, place: 'fangshi' }, day(20, 10, 30)), {});
});

test('one night a cooldown: refused inside it in the world\'s words, offered again once it has passed', () => {
  const s = at('wm-yaoyuan'), H = content.balance.events.shouchao.every_h;
  assert.equal(H, 1, 'an hour (Hanli 10-28: 「改成1小时一次也行」)');
  // Counted at 23:00: half an hour on, past midnight, it is still inside the cooldown (the task's day period never reopens it).
  const one = night(s, day(20, 23, 0));
  assert.ok(one.result.ok, JSON.stringify(one.result));
  const next = { ...structuredClone(one.state), stamina: 100 };
  const morning = day(20, 23, 30);
  assert.equal(shouchaoHosted(content, next, morning)[T.id], undefined, 'not offered half an hour on');
  const shut = win(next, content, ctx(morning), { id: T.id, stars: 3 }).result;
  assert.equal(shut.ok, false);
  assert.equal(shut.refused, 'shut');
  assert.equal(shut.say, T.shouchao.shut.zh, JSON.stringify(shut));
  assert.equal(shut.left_min, H * 60 - 30, 'the minutes left');
  // A win kept from before cannot be counted inside it either.
  const kept = { ...next, wins: { ...next.wins, [T.id]: morning.toISOString() } };
  assert.equal(task(kept, content, ctx(morning), { action: 'done', id: T.id }).result.refused, 'shut');
  // Just before it passes: still shut; at it: offered, the next night.
  const at23 = new Date(day(20, 23, 0).getTime() + H * 3600_000);
  assert.equal(shouchaoHosted(content, next, new Date(at23.getTime() - 60_000))[T.id], undefined);
  const o = offered(next, at23);
  assert.ok(o && o.status === 'offered', 'offered again');
  assert.equal(o.night, 2);
  assert.ok(night(next, at23).result.ok, 'and counted');
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

test('once a cooldown; a night missed costs nothing — the next one is the same night, the pay intact', () => {
  const s = at('wm-yaoyuan');
  const one = night(s, day(20, 17, 30));
  assert.equal(one.result.night, 1);
  assert.equal(offered(one.state, day(20, 18, 0))?.status ?? 'done', 'done', 'counted: done for tonight');
  assert.match(offered(one.state, day(20, 18, 0)).title, /第1潮/, 'named by the night just held');
  assert.equal(win(one.state, content, ctx(day(20, 18, 0)), { id: T.id, stars: 3 }).result.refused, 'shut', 'not twice a cooldown');
  assert.ok(offered(one.state, day(20, 18, 0)).wait_min > 0 && offered(one.state, day(20, 18, 0)).shut, 'the row says when it comes again');
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

test('each night is the next tide row; past them a night a 主力 塔防 kit makes, never a layout twice, never the same kit running', () => {
  let s = at('wm-yaoyuan');
  const seen = [];
  for (let d = 0; d < 8; d += 1) {
    const now = day(1 + d, 17, 20);
    const o = offered(s, now);
    seen.push({ lv: o.deal.lv, game: o.game, over: o.deal.over, deal: o.deal });
    const r = night(s, now);
    assert.ok(r.result.ok, JSON.stringify(r.result));
    s = { ...r.state, stamina: 100 };
  }
  // 古四: 野猪 and 狰 only — the three rows of them, then made nights (Hanli 10-28: 「最好不要反复」).
  assert.deepEqual(seen.slice(0, 3).map((x) => x.lv), ['shouchao-1', 'shouchao-2', 'shouchao-3']);
  const rows = seen.slice(0, 3).map((x) => kit.levels.find((l) => l.id === x.lv));
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i].waves.length >= rows[i - 1].waves.length && rows[i].tide > rows[i - 1].tide, `${rows[i].id} after ${rows[i - 1].id}`);
  const made = seen.slice(3);
  assert.ok(made.every((x) => x.deal.tide), 'made nights');
  const turning = T.shouchao.rotation.filter((k) => TIDES[k.game]).length;
  if (turning > 1) for (let i = 1; i < made.length; i += 1) assert.notEqual(made[i].game, made[i - 1].game, 'never the same kit two nights running');
  assert.equal(new Set(s.shouchao.seen).size, s.shouchao.seen.length, 'never the same layout twice');
  // The game lays a 守墙关 night over the row (games/shouqiang.js levelDealt): the night's title.
  const wall = made.find((x) => x.game === 'shouqiang');
  if (wall) assert.match(levelDealt(kit, wall.deal, '').title.zh, /第\d+潮/);
  // 银月 tells it once: the first night's lead, never after a night is won.
  assert.equal(seen[0].over.lead[0].zh, T.shouchao.tell[0].zh);
  assert.ok(seen.slice(1, 3).every((x) => !x.over.lead.some((l) => l.zh === T.shouchao.tell[0].zh)));
  // A row added later is played first, before the made nights go on.
  const later = { ...kit.levels.find((l) => l.id === 'shouchao-3'), id: 'shouchao-x', tide: 3.5 };
  kit.levels.push(later);
  try {
    assert.equal(tonight(content, s).row.id, 'shouchao-x');
  } finally { kit.levels.pop(); }
});

test('a row a story plays (`story` set) is never a night of the tide', () => {
  const s = at('wm-yaoyuan');
  const story = { ...kit.levels.find((l) => l.id === 'shouchao-1'), id: 'story-row', tide: 0.5, story: '09-furnace' };
  kit.levels.push(story);
  try {
    assert.ok(!tideRows(kit).some((l) => l.id === 'story-row'));
    assert.equal(tonight(content, s).row.id, 'shouchao-1');
  } finally { kit.levels.pop(); }
});

test('beasts only of his 回 or before — read in book order (h11 is 古七, h09 古八); the first 大妖 on night 4', () => {
  const s4 = at('wm-yaoyuan');
  assert.deepEqual(['yezhu', 'zheng', 'qiuyu', 'heyu', 'qique'].map((k) => beastOpen(content, s4, k)), [true, true, false, false, false]);
  // 古四's made nights never send a beast it has not met, nor a boss.
  const n4 = tonight(content, { ...s4, shouchao: { won: ['shouchao-1', 'shouchao-2', 'shouchao-3'], seen: [] } });
  assert.ok(n4.kinds.every((k) => ['yezhu', 'zheng', 'longzhi'].includes(k)), n4.kinds.join());
  // Night 4 is a 大妖's: at 古四 only 守山门's 蠪侄 (h04) is met, so it is 守山门's.
  assert.deepEqual([n4.game, n4.boss], ['sadoushou', true]);
  // 古七 (h11): 犰狳 and 合窳 (met in 古五's 秘境) yes, 鬿雀 (古八, h09) not yet.
  const s7 = at('09-snow');
  assert.deepEqual(['qiuyu', 'heyu', 'qique'].map((k) => beastOpen(content, s7, k)), [true, true, false]);
  // Night 4 is 犰狳's row, with the tide's first 大妖 — a young 合窳, small (`bossHp`), so 结印 has its moment.
  const four = tonight(content, { ...s7, shouchao: { won: ['shouchao-1', 'shouchao-2', 'shouchao-3'] } });
  assert.equal(four.row.id, 'shouchao-4');
  assert.equal(four.boss, true);
  assert.ok(four.row.bossHp < 0.5);
  const past = tonight(content, { ...s7, shouchao: { won: ['shouchao-1', 'shouchao-2', 'shouchao-3', 'shouchao-4'] } });
  assert.ok(!past.row && !past.kinds.includes('qique'), '山门 waits for 鬿雀');
  // 古八 (h09): the 山门 row with its 合窳.
  const s8 = at('09-qulao');
  assert.ok(beastOpen(content, s8, 'qique'));
  const won = { shouchao: { won: ['shouchao-1', 'shouchao-2', 'shouchao-3', 'shouchao-4'] } };
  assert.equal(tonight(content, { ...s8, ...won }).row.id, 'shanmen');
});

test('the night\'s board waits in the tray at 沉鼎观, titled by the night — never dealt by itself', () => {
  const s = at('wm-yaoyuan');
  const l = look(s, content, ctx(day(20, 17, 30)));
  const o = l.tasks.find((t) => t.id === T.id);
  assert.match(o.title, /兽潮 · 第1潮/);
  // Hanli 10-27: 「兽潮时间到了不要自动开始, 让玩家点击开始」 — its time come, it waits for his 开局.
  assert.equal(o.tide, true, 'Look marks the night\'s board');
  assert.ok(!stageCards(l).some((c) => c.card === 'board' && c.id === T.id), 'not on the stage by itself');
  // …never beside the scene card (Hanli, 2026-10-26: 「Mac上游戏界面需要独占UI」 — a board up takes the stage alone,
  // so a tide up by itself would hold the story): it waits in the tray's 开局, and opened it stands alone.
  const p = look(at('wm-luobo'), content, ctx(day(20, 17, 30)));
  assert.ok(p.scene?.panel, 'a scene card stands');
  assert.equal(sceneGame(p, { card: 'board', id: T.id }), false, 'the tide is not the scene\'s game');
  assert.equal(sceneGame(l, { card: 'board', id: T.id }), false, 'nor beside the scene\'s own game');
});

test('waiting out the cooldown: the row stands past midnight with the time left, and the page draws it in the world\'s words', () => {
  const s = at('wm-yaoyuan'), H = content.balance.events.shouchao.every_h;
  const one = night(s, day(20, 23, 30));
  const next = { ...structuredClone(one.state), stamina: 100 };
  // Just past midnight: still on Look, done, with the wait and the line.
  const row = offered(next, day(21, 0, 10));
  assert.ok(row, 'the row stands past midnight');
  assert.equal(row.status, 'done');
  assert.equal(row.wait_min, 20);
  assert.equal(row.shut, T.shouchao.shut.zh);
  assert.match(row.title, /第1潮/, 'named by the tide just held — no night');
  assert.equal(row.deal, undefined, 'nothing dealt');
  // Away from 沉鼎观 it does not wait there (offered only there either; asked of the rule, as Look walks him back inside).
  assert.equal(shouchaoWaiting(content, next, T.id, day(21, 0, 10)), true);
  assert.equal(shouchaoWaiting(content, { ...next, place: 'fangshi' }, T.id, day(21, 0, 10)), false);
  // Once it passes: offered again, no wait.
  const back = offered(next, new Date(day(20, 23, 30).getTime() + H * 3600_000));
  assert.equal(back.status, 'offered');
  assert.equal(back.wait_min, undefined);
  // Look's `waits` carries it in the one shape every cooldown has; the tray (cards.js) draws it — no 开局.
  const w = look(next, content, ctx(day(21, 0, 10))).waits?.find((x) => x.id === T.id);
  assert.deepEqual(w, { id: T.id, title: row.title, shut: row.shut, wait_min: row.wait_min });
  for (const [lang, chip] of [['zh', `约 ${Math.ceil(w.wait_min / 15)} 刻后`], ['en', `back in about ${w.wait_min} min`]]) {
    const html = trayHtml({ look: { tasks: [row], waits: [{ ...w, shut: T.shouchao.shut[lang] }] }, lang, words: WORDS[lang], qi: { st: 'full' } });
    assert.ok(html.includes(`data-wait="${T.id}"`), lang);
    assert.ok(html.includes(T.shouchao.shut[lang]) || lang === 'en', `${lang}: the world's line`);
    assert.ok(html.includes(chip), `${lang}: ${html}`);
    assert.doesNotMatch(html, /data-play/, 'nothing to start');
  }
  // Past it: no wait.
  assert.equal(look(next, content, ctx(new Date(day(20, 23, 30).getTime() + H * 3600_000))).waits?.find((x) => x.id === T.id), undefined);
  // The done task row itself never stands in the tray: the wait is the row.
  assert.equal(trayHtml({ look: { tasks: [row] }, lang: 'zh', words: WORDS.zh, qi: { st: 'full' } }), '');
});
