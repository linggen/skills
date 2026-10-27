// 古八 (h09) played (the per-回 plan, 2026-10-21): three scenes — 09-dabi (年六 the 丹房 lesson and the 九节聚气 night,
// 年七 the 大比), 09-qulao (瞿老's story and the night home), 09-cliff (筑基). Fewer, better (Hanli: 「调息感觉太多了」):
// one board, 守炉 · 丹房看炉, which gives the 十年黄精 — the 九节聚气方's 君, fed to the 饭桶 for three 三转聚气丹 —
// and one fight, the 腊八 final on the way on. The 回家 night and the 筑基 stay read; the two stage quests stand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, lint } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { fantong } from '../scripts/rules/fantong.mjs';
import { earnedFor } from './earn.mjs';

const content = loadContent();
const CH = content.chapters['00-zhuji'];
const NOW = new Date('2026-10-21T10:00:00');
const ctx = (now = NOW) => ({ now, quests: [] });
const must = (fn, s, args) => {
  const out = fn(fn === resolve ? earnedFor(content, s, args?.exit) : s, content, ctx(), args);
  assert.equal(out.result.ok, true, `${fn.name} ${JSON.stringify(args)} at ${s.scene}: ${JSON.stringify(out.result).slice(0, 300)}`);
  return out.state ?? s;
};
// 古八 opens at 练气六层圆满 behind 古七 (秦雁's bout); 七层 and 八层 are his to grind.
const at = (scene, extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene, place: CH.scenes[scene].at, ended: ['00-prologue', '00-waimen'],
  tier: 'qi', step: 6, progress: 0, traits: ['wood', 'water', 'fire', 'earth', 'metal'], stamina: 100, stamina_at: NOW.toISOString(),
  done_scenes: ['09-futian'], bag: { danlu: 1 }, ...extra,
});
const play = (s, id) => must(task, must(win, { ...s, tasks: { [id]: { status: 'offered' }, ...s.tasks } }, { id }), { action: 'done', id });
const go = (s, exit) => { const n = must(resolve, s, { exit }); return { ...n, place: CH.scenes[n.scene]?.at ?? n.place, stamina: 100 }; };
const H09 = ['09-dabi', '09-qulao', '09-shijie', '09-cliff']; // 09-shijie (the 160th step) split off 09-cliff's head, 2026-10-26

test('古八 runs in the book\'s order — four scenes, every one h09 — and the lint is clean', () => {
  const chain = [];
  for (let id = '09-dabi'; id && CH.scenes[id]?.hui === 'h09';) { chain.push(id); id = CH.scenes[id].exits.map((e) => e.next).find(Boolean); }
  assert.deepEqual(chain, H09);
  assert.deepEqual(lint(content), []);
});

test('one board and one fight, both in 09-dabi: 守炉 · 丹房看炉 shown and offered, the 大比 final the way on\'s card fight; the 回家 night and the 筑基 stay read', () => {
  const sc = CH.scenes['09-dabi'];
  // 全文后的小游戏 第二批 (2026-10-26): 闵丹师's 考书 before the 看炉; 瞿老's 用哪颗丹 and the 160th step's 恬惔虚无 after.
  assert.deepEqual(sc.show.filter((c) => c.card === 'board').map((c) => c.id), ['dabi-kaoshu', 'danfang-kanlu']);
  assert.deepEqual(sc.offers.tasks, ['dabi-kaoshu', 'danfang-kanlu']);
  const dabi = sc.exits.find((e) => e.id === 'dabi');
  assert.equal(dabi.needs, undefined, 'a fight\'s way on has nothing but the win before it');
  assert.deepEqual(sc.exits.find((e) => e.id === 'ruqiu').needs, { mark: 'y-dabi', task: 'danfang-kanlu' }, '入秋 waits on the 大比 and the 看炉');
  assert.deepEqual([dabi.game.id, dabi.game.kind, dabi.game.creature, dabi.game.foe.party], ['dabi-final', 'duel', 'foe-jiuceng', []], 'alone on the stage');
  assert.deepEqual([dabi.mark, dabi.once, dabi.stay, dabi.grant.item, dabi.was_rise], ['y-dabi', true, true, 'foundation-pill', 9], 'the way on as it was');
  assert.deepEqual(CH.scenes['09-qulao'].show.filter((c) => c.card === 'board').map((c) => c.id), ['qulao-dan']);
  assert.deepEqual(CH.scenes['09-shijie'].show.filter((c) => c.card === 'board').map((c) => c.id), ['shijie-tiandan']);
  assert.ok(!(CH.scenes['09-cliff'].show ?? []).some((c) => c.card === 'board'), '09-cliff: no board');
  for (const id of ['09-qulao', '09-shijie', '09-cliff']) assert.ok(!CH.scenes[id].exits.some((e) => e.game), `${id}: no fight`);
  const t = content.tasks.tasks.find((x) => x.id === 'danfang-kanlu');
  assert.deepEqual([t.game, t.deal.lv, t.grant.progress, t.gives.bag], ['shoulu', 'danfang-kanlu', 5, 'huangjing-10']);
  assert.ok(t.how.zh && t.how.en && t.title.en, 'says what it is in both languages');
});

test('the two stage quests stand: 八层圆满 before the 大比, 九层圆满 before 入秋 — no 古八 exit lifts him', () => {
  for (const id of H09) for (const e of CH.scenes[id].exits) assert.equal(e.rise, undefined, `${id}/${e.id} lifts no layer`);
  assert.deepEqual(content.ladder.caps.hui.h09.gates, [{ layer: 8, scene: '09-dabi', exits: ['dabi'] }, { layer: 9, scene: '09-dabi', exits: ['ruqiu'] }]);
});

test('walking 古八: the board gives the 十年黄精, the way on waits on the board and then the final; the 饭桶 turns the 黄精 into three 三转聚气丹', () => {
  let s = at('09-dabi');
  assert.equal(resolve(earnedFor(content, s, 'dabi'), content, ctx(), { exit: 'dabi' }).result.refused, 'game-not-won', 'the 大比 waits on its final');
  s = play(play(s, 'dabi-kaoshu'), 'danfang-kanlu');
  assert.equal(s.bag['huangjing-10'], 1, 'the 君, the month\'s wage');
  const door = look(s, content, ctx()).scene.exits.find((e) => e.id === 'dabi').duel;
  assert.equal(door.creature.id, 'foe-jiuceng');
  // The 方子: the 十年黄精 alone, every time — three 三转聚气丹 (fantong.json recipes `jiujie`).
  const fed = fantong(s, content, ctx(), { action: 'feed', ids: 'huangjing-10' });
  assert.equal(fed.result.ok, true, JSON.stringify(fed.result).slice(0, 300));
  if (!fed.result.spat_back) {
    assert.deepEqual([fed.result.out.id, fed.result.out.n], ['qi-pill-3', 3]);
    assert.equal(fed.state.bag['qi-pill-3'], 3);
    assert.ok(fed.state.fantong.recipes.includes('jiujie'), 'kept in 录');
  }
  s = go({ ...s, wins: { ...s.wins, 'dabi-final': NOW.toISOString() } }, 'dabi');
  assert.equal(s.scene, '09-dabi', 'the 大比 is a stay: 入秋 next');
  assert.equal(s.bag['foundation-pill'], 1, 'the sect\'s one 一转, sealed again');
  const noBoard = resolve(earnedFor(content, { ...s, tasks: {} }, 'ruqiu'), content, ctx(), { exit: 'ruqiu' });
  assert.equal(noBoard.result.ok, false, '入秋 waits on the 看炉');
  s = go(s, 'ruqiu');
  assert.equal(s.scene, '09-qulao');
});

test('the 九节 pot is the 回\'s own: before 古八 the 十年黄精 is only a herb', () => {
  const recipe = content.fantong.recipes.list.find((r) => r.id === 'jiujie');
  assert.deepEqual([recipe.in, recipe.out, recipe.n, recipe.hui], ['huangjing-10', 'qi-pill-3', 3, 'h09']);
  assert.equal(content.items.items.find((i) => i.id === 'huangjing-10').kind, 'material');
});
