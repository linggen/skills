// 古八 (h09) played (the per-回 plan, 2026-10-21): 09-dabi (年六 the 丹房 lesson and the 九节聚气 night), 09-qulao (瞿老's story
// and the night home), 09-cliff (筑基). Since 2026-10-28 (doc/gates-2026-10-27.md 古八 (a + c)) the book's three years have their
// scenes back, a stage quest each: 年六 09-shenshi (七层圆满), 年七 09-dingfeng (八层圆满) and 09-laba (the 腊八 final), 年八
// 09-yanceng (入秋, 九层圆满) — twenty classic boards. Fewer, better (Hanli: 「调息感觉太多了」):
// one board, 守炉 · 丹房看炉, which gives the 十年黄精 — the 九节聚气方's 君, fed to the 饭桶 for three 三转聚气丹 —
// and one fight, the 腊八 final on the way on. The 回家 night and the 筑基 stay read; the two stage quests stand.
import test from 'node:test';
import fs from 'node:fs';
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
const H09 = ['09-dabi', '09-shenshi', '09-dingfeng', '09-laba', '09-yanceng', '09-qulao', '09-shijie', '09-cliff']; // 09-shijie (the 160th step) split off 09-cliff's head, 2026-10-26; the years 2026-10-28
const YEARS = {
  '09-shenshi': ['shenshi-chu', 'shenshi-jiangtang', 'shenshi-canju', 'shenshi-zhique', 'shenshi-qinyan', 'shenshi-qingshen'],
  '09-dingfeng': ['dingfeng-qulao', 'dingfeng-yading', 'dingfeng-zhenyan', 'dingfeng-kunzhen', 'dingfeng-jintui', 'dingfeng-canju', 'dingfeng-songzhi'],
  '09-yanceng': ['yanceng-sunergou', 'yanceng-mingce', 'yanceng-ergou', 'yanceng-canju', 'yanceng-zhuochong', 'yanceng-xilang', 'yanceng-chu'],
};
const book = (n) => fs.readFileSync(new URL(`../story/jiuding-lu/${n}`, import.meta.url), 'utf8').split('\n');
const ZH = book('08-第八回.md'), EN = book('en/h09.md');
const paras = (field, ...lines) => assert.deepEqual([field.zh, field.en], [lines.map((n) => ZH[n - 1]).join('\n\n'), lines.map((n) => EN[n - 1]).join('\n\n')]);

test('古八 runs in the book\'s order — eight scenes, every one h09 — and the lint is clean', () => {
  const chain = [];
  for (let id = '09-dabi'; id && CH.scenes[id]?.hui === 'h09';) { chain.push(id); id = CH.scenes[id].exits.map((e) => e.next).find(Boolean); }
  assert.deepEqual(chain, H09);
  assert.deepEqual(lint(content), []);
});

test('the years\' passages are the book\'s, cut at its paragraph breaks; one reorder, 「那年冬天」 after the 讲堂 (¶41: 「七层的神识」)', () => {
  const sc = (id) => CH.scenes[id], ex = (id, e) => sc(id).exits.find((x) => x.id === e);
  paras(sc('09-shenshi').story, 29, 31, 33, 35, 37, 39, 41, 43, 45);
  paras(ex('09-shenshi', 'winter').story, 21, 25, 27);
  paras(sc('09-dingfeng').story, 49, 51, 53, 55, 57, 59, 61, 63);
  paras(ex('09-dingfeng', 'laba').story, 65);
  paras(sc('09-laba').story, 67, 69, 73, 75, 77);
  paras(ex('09-laba', 'dabi').story, 79, 81, 83, 85, 87, 89, 91, 93, 95);
  paras(sc('09-yanceng').story, 99);
  paras(ex('09-yanceng', 'ruqiu').story, 101, 103, 105, 107, 109, 111, 113, 115, 117, 119, 121, 177);
});

test('the boards: 考书 and 看炉 in 09-dabi, the years\' twenty in theirs — each way on waits on its last; the 大比 final is 09-laba\'s card fight', () => {
  const sc = CH.scenes['09-dabi'];
  assert.deepEqual(sc.show.filter((c) => c.card === 'board').map((c) => c.id), ['dabi-kaoshu', 'danfang-kanlu']);
  assert.deepEqual(sc.exits.map((e) => [e.id, e.next, e.needs]), [['on', '09-shenshi', { task: 'danfang-kanlu' }]]);
  for (const [id, ids] of Object.entries(YEARS)) {
    const y = CH.scenes[id];
    assert.deepEqual(y.show.filter((c) => c.card === 'board').map((c) => c.id), ids, id);
    assert.deepEqual(y.offers.tasks, ids, id);
    assert.deepEqual(y.exits.map((e) => e.needs), [{ task: ids.at(-1) }], `${id} waits on its last board`);
    for (const t of ids) assert.ok(content.tasks.tasks.some((x) => x.id === t), t);
  }
  assert.equal(Object.values(YEARS).flat().length, 20); // the years' 拼图 became 华容道, 2026-10-28 (Hanli: 「拼图也少一点」)
  const dabi = CH.scenes['09-laba'].exits.find((e) => e.id === 'dabi');
  assert.equal(dabi.needs, undefined, 'a fight\'s way on has nothing but the win before it');
  assert.ok(!(CH.scenes['09-laba'].show ?? []).some((c) => c.card === 'board'), '09-laba: the year\'s boards are 09-dingfeng\'s');
  assert.deepEqual([dabi.game.id, dabi.game.kind, dabi.game.creature, dabi.game.foe.party], ['dabi-final', 'duel', 'foe-jiuceng', []], 'alone on the stage');
  assert.deepEqual([dabi.mark, dabi.once, dabi.stay, dabi.grant.item, dabi.next], ['y-dabi', true, undefined, 'foundation-pill', '09-yanceng']);
  assert.deepEqual(CH.scenes['09-qulao'].show.filter((c) => c.card === 'board').map((c) => c.id), ['qulao-dan']);
  assert.deepEqual(CH.scenes['09-shijie'].show.filter((c) => c.card === 'board').map((c) => c.id), ['shijie-tiandan']);
  assert.ok(!(CH.scenes['09-cliff'].show ?? []).some((c) => c.card === 'board'), '09-cliff: no board');
  for (const id of ['09-qulao', '09-shijie', '09-cliff', ...Object.keys(YEARS)]) assert.ok(!CH.scenes[id].exits.some((e) => e.game), `${id}: no fight`);
  const t = content.tasks.tasks.find((x) => x.id === 'danfang-kanlu');
  assert.deepEqual([t.game, t.deal.lv, t.grant.progress, t.gives.bag], ['shoulu', 'danfang-kanlu', 5, 'huangjing-10']);
});

test('a stage quest a year: 七层圆满 at 年六\'s winter, 八层圆满 before 年七\'s 腊月, 九层圆满 before 入秋 — no 古八 exit lifts him', () => {
  for (const id of H09) for (const e of CH.scenes[id].exits) assert.equal(e.rise, undefined, `${id}/${e.id} lifts no layer`);
  assert.deepEqual(content.ladder.caps.hui.h09.gates, [{ layer: 7, scene: '09-shenshi', exits: ['winter'] }, { layer: 8, scene: '09-dingfeng', exits: ['laba'] }, { layer: 9, scene: '09-yanceng', exits: ['ruqiu'] }]);
  assert.ok(content.balance.master.lines.gu.hours.fit.gates.includes('09-dingfeng'), 'the refit holds them (fit.gates)');
});

test('walking 古八: the boards, the 十年黄精 and the 饭桶\'s three; each year waits on its boards and its layer; the 腊八 final; 入秋 on to the cliff', () => {
  let s = at('09-dabi');
  s = play(play(s, 'dabi-kaoshu'), 'danfang-kanlu');
  assert.equal(s.bag['huangjing-10'], 1, 'the 君, the month\'s wage');
  const fed = fantong(s, content, ctx(), { action: 'feed', ids: 'huangjing-10' });
  assert.equal(fed.result.ok, true, JSON.stringify(fed.result).slice(0, 300));
  if (!fed.result.spat_back) {
    assert.deepEqual([fed.result.out.id, fed.result.out.n], ['qi-pill-3', 3]);
    assert.ok(fed.state.fantong.recipes.includes('jiujie'), 'kept in 录');
  }
  s = go(s, 'on');
  assert.equal(s.scene, '09-shenshi');
  for (const [id, exit, next] of [['09-shenshi', 'winter', '09-dingfeng'], ['09-dingfeng', 'laba', '09-laba']]) {
    assert.equal(resolve(s, content, ctx(), { exit }).result.ok, false, `${id}: the way on waits on its boards`);
    s = YEARS[id].reduce((x, b) => play(x, b), s);
    assert.equal(resolve({ ...s, progress: 0 }, content, ctx(), { exit }).result.refused, 'stage', `${id}: and on its layer`);
    s = go(s, exit);
    assert.equal(s.scene, next);
  }
  assert.equal(resolve(s, content, ctx(), { exit: 'dabi' }).result.refused, 'game-not-won', 'the 大比 waits on its final');
  assert.equal(look(s, content, ctx()).scene.exits.find((e) => e.id === 'dabi').duel.creature.id, 'foe-jiuceng');
  s = go({ ...s, wins: { ...s.wins, 'dabi-final': NOW.toISOString() } }, 'dabi');
  assert.equal(s.scene, '09-yanceng');
  assert.equal(s.bag['foundation-pill'], 1, 'the sect\'s one 一转, sealed again');
  assert.equal(resolve(s, content, ctx(), { exit: 'ruqiu' }).result.ok, false, '入秋 waits on 年八\'s boards');
  s = go(YEARS['09-yanceng'].reduce((x, b) => play(x, b), s), 'ruqiu');
  assert.equal(s.scene, '09-qulao');
});

test('the 九节 pot is the 回\'s own: before 古八 the 十年黄精 is only a herb', () => {
  const recipe = content.fantong.recipes.list.find((r) => r.id === 'jiujie');
  assert.deepEqual([recipe.in, recipe.out, recipe.n, recipe.hui], ['huangjing-10', 'qi-pill-3', 3, 'h09']);
  assert.equal(content.items.items.find((i) => i.id === 'huangjing-10').kind, 'material');
});

// 一剑出去 (09-dingfeng's last board, the way on waits on it): 照着走 level 4 where 几何冲刺 stood (2026-10-28, Hanli: 「气走经脉也少一点」)
// — the longest and quickest run yet, past 09-shenshi's level 3; a human-like hand walks it.
test('一剑出去 is 照着走 level 4, past 纸雀儿\'s 3, and a human-like hand walks it', async () => {
  const t = content.tasks.tasks.find((x) => x.id === 'dingfeng-songzhi');
  assert.deepEqual([t.game, t.deal.lv], ['simon', 4]);
  assert.equal(content.tasks.tasks.find((x) => x.id === 'shenshi-zhique').deal.lv, 3);
  const S = await import('../scripts/games/simon.js');
  const { bot } = await import('../scripts/games/bots/simon.js');
  const { playModule } = await import('../tools/board-bots.mjs');
  assert.ok(S.LEVELS[4].to > S.LEVELS[3].to && S.LEVELS[4].on < S.LEVELS[3].on);
  assert.ok(playModule(S, bot, { tries: 3, deal: t.deal, limit: 600000 }).won);
});
