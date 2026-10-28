// 古七 (h11) played (the per-回 plan, 2026-10-15, Wave 2 D; Hanli's 「4层突然到7层了」): the five years 09-year's
// 伏天 once jumped in one passage are scenes now — 09-snow · 09-jiuge · 09-furnace · 09-year · 09-lingcao ·
// 09-yishui · 09-xie · 09-futian — each layer (五, 六, 七) its own rise, one at a time, each behind the 阶段任务
// (圆满 of the layer held); eight boards each the book's own action (tasks/h11.json), two card fights (灵草谷's
// 犰狳, 崖顶's 秦雁), and saves from before the split land where they should.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, lint } from '../scripts/content.mjs';
import { fitWorld, newState } from '../scripts/state.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { health } from '../scripts/rules/health.mjs';
import { huiNow } from '../scripts/rules/hui.mjs';
import * as simon from '../scripts/games/simon.js';
import { earnedFor } from './earn.mjs';

const content = loadContent();
const CH = content.chapters['00-zhuji'];
const NOW = new Date('2026-10-15T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const must = (fn, s, args) => {
  const out = fn(fn === resolve ? earnedFor(content, s, args?.exit) : s, content, ctx(), args);
  assert.equal(out.result.ok, true, `${fn.name} ${JSON.stringify(args)} at ${s.scene}: ${JSON.stringify(out.result).slice(0, 300)}`);
  return out.state ?? s;
};
// 古七 opens at 练气四层 (古六 held him there), 外门 behind him.
const at = (scene, extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene, place: CH.scenes[scene].at, ended: ['00-prologue', '00-waimen'],
  tier: 'qi', step: 4, progress: 0, traits: ['wood', 'water', 'fire', 'earth', 'metal'], stamina: 100, stamina_at: NOW.toISOString(), done_scenes: ['wm-heluo'], ...extra,
});
const play = (s, id, grade) => must(task, must(win, { ...s, tasks: { [id]: { status: 'offered' }, ...s.tasks } }, { id, ...(grade ? { grade } : {}) }), { action: 'done', id });
const go = (s, exit) => { const n = must(resolve, s, { exit }); return { ...n, place: CH.scenes[n.scene]?.at ?? n.place, stamina: 100 }; };
const run = (mod, s, verbs) => verbs.reduce((x, d) => mod.act(x, d).state, s);
const liveUntil = (mod, s, step, done = (x) => x.won) => { let x = s; for (let i = 0; i < 6000 && !done(x); i += 1) x = step(mod.tick(x, 50)); return x; };

const H11 = ['09-snow', '09-jiuge', '09-furnace', '09-danfang', '09-year', '09-lingcao', '09-fangshi', '09-suifeng', '09-yishui', '09-xie', '09-nianyao', '09-futian'];
// 古七's years (doc/gates-2026-10-27.md 古七 (c), 2026-10-27): 09-suifeng (年四, 随风) off 09-yishui's head, 09-nianyao (年五, 碾药 and
// 阿禾's 筑基) off 09-futian's way on — each with seven classic boards before its gate.
const YEARS = { '09-suifeng': ['suifeng-qinyan', 'suifeng-yading', 'suifeng-yezi', 'suifeng-canju', 'suifeng-xunwei', 'suifeng-qulao', 'suifeng-shanmen'], '09-nianyao': ['nianyao-canju', 'nianyao-yaoyuan', 'nianyao-mindanshi', 'nianyao-niannian', 'nianyao-shuangma', 'nianyao-jingshi', 'nianyao-ahe'] };
// 全文后的小游戏 第二批 (2026-10-26): 09-danfang (闵丹师's pill) split off 09-year's head, 09-fangshi (钱掌柜 · 秦雁's 流云剑) off 09-yishui's.
// 09-snow has no board since 2026-10-19: its feeding is the 大场面 扔了干净 (tests/setpiece-huochai.test.mjs).
const BOARDS = { '09-jiuge': ['jiuge-yubu'], '09-furnace': ['furnace-recipe', 'furnace-ding'], '09-yishui': ['yishui-reed'] };
// 随叶 and 顺风溜 told again 2026-10-20 (the 调息 cut, Hanli: 「调息感觉太多了」): 禹步 is 09-jiuge's one board, 09-xie reads whole.
const FIGHTS = { '09-lingcao': ['fight', 'lingcao-qiuyu', 'qiuyu'], '09-futian': ['spar', 'futian-qinyan', 'foe-shijie'] };
// 认方 cut 2026-10-19 (the standing rule Hanli approved 10-19: a memory puzzle): 定风 is 09-furnace's one board.
BOARDS['09-furnace'] = ['furnace-ding'];
// 第二批 (2026-10-26): 瞿老 on 巽 before the 禹步, 邓执事 before 开春, 闵丹师 in 09-danfang, 看炉 in 09-year, 钱掌柜 and 流云剑 in 09-fangshi.
Object.assign(BOARDS, { '09-jiuge': ['jiuge-xunsi', 'jiuge-yubu'], '09-furnace': ['furnace-deng', 'furnace-ding'], '09-danfang': ['danfang-min'], '09-year': ['year-kanlu'], '09-fangshi': ['fangshi-qian', 'fangshi-liuyun'] }, YEARS);
const RISES = { '09-furnace/fire': 5, '09-year/futian': 5, '09-yishui/night': 6, '09-futian/spar': 7 };

test('古七 runs in the book\'s order on the `next` chain — twelve scenes, every one h11, then 古八\'s 09-dabi', () => {
  const chain = [];
  for (let id = '09-snow'; id && CH.scenes[id]?.hui === 'h11';) { chain.push(id); id = CH.scenes[id].exits.map((e) => e.next).find(Boolean); }
  assert.deepEqual(chain, H11);
  assert.equal(CH.scenes['09-futian'].exits.find((e) => e.id === 'spar').next, '09-dabi');
  assert.deepEqual(lint(content), []);
});

test('each scene\'s boards are its own (two at most, the years\' seven aside), the ways on wait on the last; the fights are the exits\' card fights', () => {
  for (const [scene, ids] of Object.entries(BOARDS)) {
    const sc = CH.scenes[scene];
    assert.deepEqual(sc.show.filter((c) => c.card === 'board').map((c) => c.id), ids, scene);
    assert.deepEqual(sc.offers.tasks, ids);
    assert.ok(ids.length <= (YEARS[scene] ? 7 : 2), scene);
    for (const e of sc.exits.filter((x) => !x.stay)) assert.equal(e.needs?.task, ids.at(-1), `${scene}/${e.id} waits on its last board`);
    for (const id of ids) assert.ok(content.tasks.tasks.some((t) => t.id === id), `${id} in tasks/h11.json`);
  }
  for (const [scene, [exit, game, creature]] of Object.entries(FIGHTS)) {
    const g = CH.scenes[scene].exits.find((e) => e.id === exit).game;
    assert.deepEqual([g.id, g.kind, g.creature], [game, 'duel', creature]);
    assert.ok(content.creatures.creatures.some((c) => c.id === creature), 'no new creatures.json row: the beast exists');
  }
});

test('the layers are ground one at a time (2026-10-16: no story rise): 定风 waits on 四层圆满, 沂水 on 五层圆满, the autumn on 六层圆满 — no h11 exit lifts him', () => {
  const rises = {};
  for (const id of H11) for (const e of CH.scenes[id].exits) {
    assert.equal(e.rise, undefined, `${id}/${e.id} lifts no layer`);
    if (e.was_rise != null) rises[`${id}/${e.id}`] = e.was_rise;
  }
  assert.deepEqual(rises, RISES, 'the layers the book once lifted him to, kept (`was_rise`)');
  // Each rise waits on the 阶段任务 — the realm full at the layer below it. Declared on the exit (`_stage`) until the
  // ladder carries the gate (caps.hui.h11.gates); once it does, every rise is one of its gates.
  const gates = content.ladder.caps?.hui?.h11?.gates;
  for (const [key, layer] of Object.entries(RISES)) {
    const [sid, eid] = key.split('/');
    if (gates) assert.ok(gates.some((g) => g.scene === sid && g.exits.includes(eid) && g.layer === layer - 1), `${key} gated at ${layer - 1}层圆满`);
    else assert.match(CH.scenes[sid].exits.find((e) => e.id === eid)._stage, new RegExp(`练气${'一二三四五六七'[layer - 2]}层圆满`), key);
  }
});

test('every board pays what the plan names: 修为 for cultivation, a pill or 灵石 for the rest; the story things come with the ways on', () => {
  const t = (id) => content.tasks.tasks.find((x) => x.id === id);
  for (const id of ['jiuge-yubu', 'furnace-ding']) assert.equal(t(id).grant.progress, 5, id);
  for (const id of ['jiuge-sui', 'xie-wind']) assert.equal(t(id), undefined, `${id}: told (the 调息 cut)`);
  assert.equal(t('furnace-recipe').cut, '2026-10-19');
  assert.equal(CH.scenes['09-furnace'].exits[0].grant.item, 'qi-pill', '认方\'s 聚气丹 comes with the way on');
  assert.equal(t('year-smell').grant.wealth, 3);
  assert.equal(t('yishui-reed').grant.wealth, 2);
  assert.deepEqual(Object.values(t('jiuge-yubu').marks), ['yubu', 'yubu'], 'the mark `yubu` either way (no line reads it yet)');
  assert.equal(CH.scenes['09-snow'].exits[0].grant.item, 'huochai-jian');
  assert.equal(CH.scenes['09-xie'].exits[0].grant.item, 'shunfeng-liu');
  const lc = CH.scenes['09-lingcao'].exits[0].grant, sp = CH.scenes['09-futian'].exits[0].grant;
  assert.deepEqual([lc.progress, lc.wealth], [undefined, 20], '犰狳: the book\'s 「每人二十块灵石」 — no story 修为 (2026-10-16)');
  assert.deepEqual([sp.table, sp.progress, sp.wealth], ['trial', undefined, 20]);
});

test('walking 古七 by its boards and fights: 修为 rises at each cultivation board, the realm 四 → 五 → 六 by his own work behind each gate, never by a choice', () => {
  let s = at('09-snow');
  s = go(s, 'feed'); // 扔了干净 is a 大场面 on the way on (2026-10-19): nothing to play first
  assert.equal(s.bag['huochai-jian'], 1);
  assert.equal(s.scene, '09-jiuge');
  const p0 = s.progress;
  s = play(play(s, 'jiuge-xunsi'), 'jiuge-yubu', 'quiet');
  assert.ok(s.progress > p0, '禹步 raised 修为');
  s = go(s, 'down');
  assert.ok(s.marks.includes('yubu'));
  assert.equal(s.step, 4);
  s = play(play(s, 'furnace-deng'), 'furnace-ding'); // 守墙关 · 药园巡夜 · 开春 since the 调息 cut (2026-10-20): no grade
  s = go(s, 'fire');
  assert.ok(s.bag['qi-pill'] > 0, 'the way on: a 聚气丹 (认方 cut 2026-10-19)');
  assert.deepEqual([s.scene, s.step], ['09-danfang', 4], '定风 lifts nothing: 五层 is ground');
  s = go(play(s, 'danfang-min'), 'smell');
  assert.equal(s.scene, '09-year');
  s = go(play(s, 'year-kanlu'), 'qingming'); // 闻焦 cut 2026-10-19: told; 看炉 (2026-10-26) the nights
  s = go(s, 'futian');
  assert.deepEqual([s.scene, s.step], ['09-lingcao', 4], '伏天 moves nothing');
  const lc = look(s, content, ctx()).scene.exits.find((e) => e.id === 'fight');
  assert.equal(lc.duel.creature.id, 'qiuyu');
  s = go({ ...s, wins: { ...s.wins, 'lingcao-qiuyu': NOW.toISOString() } }, 'fight');
  assert.equal(s.scene, '09-fangshi');
  s = go(play(play(s, 'fangshi-qian'), 'fangshi-liuyun'), 'autumn');
  assert.deepEqual([s.scene, s.step], ['09-suifeng', 5], 'the boards\' 修为 banked past 四层 steps him once 伏天 is behind him — his own');
  s = go(YEARS['09-suifeng'].reduce((x, id) => play(x, id), s), 'on'); // 年四's seven boards (2026-10-27)
  assert.equal(s.scene, '09-yishui');
  s = go(play(s, 'yishui-reed', 'still'), 'night');
  assert.deepEqual([s.scene, s.step], ['09-xie', 5], '沂水 waited on 五层圆满, earned; it lifts nothing');
  s = go(s, 'go'); // 顺风溜 told (the 调息 cut): the boots with the way on
  assert.equal(s.bag['shunfeng-liu'], 1);
  assert.equal(s.scene, '09-nianyao');
  s = go(YEARS['09-nianyao'].reduce((x, id) => play(x, id), s), 'on'); // 年五's seven boards (2026-10-27)
  assert.equal(s.scene, '09-futian');
  const door = look(s, content, ctx()).scene.exits.find((e) => e.id === 'spar').duel;
  assert.match(door.creature.goal, /整座崖，没有台边/, '秦雁 on the 崖顶: the scene\'s goal over the 大比\'s');
  assert.equal(resolve(s, content, ctx(), { exit: 'spar' }).result.refused, 'game-not-won', 'the autumn waits on her bout');
  const before = s.progress;
  s = go({ ...s, wins: { ...s.wins, 'futian-qinyan': NOW.toISOString() } }, 'spar');
  assert.deepEqual([s.scene, s.step], ['09-dabi', 6], '那年秋天 — 古八 opens on 六层圆满, earned; 七层 is ground in 古八');
  assert.ok(s.progress >= before, 'the bout takes nothing');
});

test('a way on waits on its board: refused in the world\'s words until the board is counted', () => {
  for (const [scene, exit] of [['09-jiuge', 'down'], ['09-furnace', 'fire'], ['09-yishui', 'night']]) { // 09-xie/go waits on nothing since 顺风溜 was told (2026-10-20)
    const out = resolve(at(scene), content, ctx(), { exit });
    assert.equal(out.result.ok, false, `${scene}/${exit}`);
    assert.ok(out.result.say, `${scene}/${exit} says why`);
  }
});

test('saves from before the split: one past 09-year stays put; one in 09-year moves on to 灵草谷 (no catch-up rise since 2026-10-16); one in a scene given boards is offered them', () => {
  // The shape of a save that played the old 伏天 (四层 → 七层 in one passage) and stands on 古八's first scene.
  const past = at('09-dabi', { step: 7, progress: 0, marks: ['y-qingming', 'y-futian'], done_scenes: ['wm-heluo', '09-snow', '09-furnace', '09-year'], tasks: {} });
  const fitted = fitWorld(past, content);
  assert.deepEqual([fitted.scene, fitted.step], ['09-dabi', 7], 'never thrown back');
  assert.equal(huiNow(content, fitted), 'h09');
  assert.ok(look(fitted, content, ctx()).scene, 'Look stands');
  assert.deepEqual(health(content, fitted, NOW).filter((p) => p.level === 'error'), [], 'nothing broken');
  // Mid-09-year: the old furnace never rose him (the cap held 四层); 伏天 lands on 灵草谷, and lifts him to 五层 as the furnace would have.
  const mid = fitWorld(at('09-year', { marks: ['y-qingming'], done_scenes: ['wm-heluo', '09-snow', '09-furnace'] }), content);
  assert.equal(mid.tasks['year-smell'], undefined, '闻焦 cut 2026-10-19: no board offered there');
  assert.equal(mid.tasks['year-kanlu']?.status, 'offered', '看炉 (2026-10-26) is offered to a save standing here');
  const on = go(play(mid, 'year-kanlu'), 'futian');
  assert.deepEqual([on.scene, on.step], ['09-lingcao', 4]);
  // Standing in 09-furnace from before: its board is offered (认方 cut 2026-10-19: one held offered is let go), the way on is the 定风 morning.
  const fur = fitWorld(at('09-furnace', { tasks: { 'furnace-recipe': { status: 'offered' } } }), content);
  assert.deepEqual(['furnace-recipe', 'furnace-ding'].map((id) => fur.tasks[id]?.status), [undefined, 'offered']);
  // 第二批 (2026-10-26): 邓执事 splits it again — the passage word for word across story and story_after.
  const furnace = CH.scenes['09-furnace'];
  assert.match(`${furnace.story.zh}\n\n${furnace.story_after.zh}`, /足足九道。\n\n打这以后，饭桶吐一颗聚气丹[\s\S]*看落叶打转。$/, 'the passage whole, word for word');
});

/* ── the boards themselves ── */

test('no 古七 board draws its own skip (the page lays it), each says what it is in both languages, and a skip still draws a line', () => {
  const deal = content.tasks.tasks.find((x) => x.id === 'jiuge-yubu').deal;
  for (const mod of [simon]) { // the rest of 古七's old boards deleted 2026-10-19 (「没用在游戏中的, 都删了吧」); 喂饭桶 · 扔了干净 2026-10-20; 禹步 · 九格 (home-made) 2026-10-27
    const s = mod.newGame('t', 1, deal);
    for (const lang of ['zh', 'en']) {
      assert.doesNotMatch(mod.html(s, lang), /data-g="skip"/);
      assert.ok(mod.meta.name[lang] && mod.meta.how[lang]);
    }
    assert.equal(typeof mod.stuck, 'function');
    const left = { ...mod.act(s, { g: 'start' }).state, won: true, grade: null };
    assert.match(mod.html(left, 'zh'), /g-line-say">[^<]+/);
  }
});

test('禹步 · 照着走 (Simon, in 禹步 · 九格\'s place 2026-10-27): 瞿老 walks the nine squares each once, ending in 中五; a run grows 4 → 9; a wrong square trips and shows the run again; walked whole → quiet, 「猎户的脚」', () => {
  const t = content.tasks.tasks.find((x) => x.id === 'jiuge-yubu');
  assert.equal(t.game, 'simon');
  assert.deepEqual(simon.GRID, [4, 9, 2, 3, 5, 7, 8, 1, 6]);
  const watch = (s) => { while (s.phase === 'show') s = simon.tick(s, 50); return s; };
  let s = watch(run(simon, simon.newGame('a', 1, t.deal), [{ g: 'start' }]));
  assert.equal(s.level, 0);
  assert.deepEqual([...s.run].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(s.run[8], 5, 'ends in 中宫');
  assert.equal(s.len, 4);
  const wrong = s.run.find((v) => v !== s.run[0]);
  s = simon.act(s, { g: 'sq', n: String(wrong) }).state;
  assert.deepEqual([s.note, s.phase, s.trips], ['trip', 'show', 1]);
  assert.match(simon.html(s, 'zh'), /自己绊了自己一下/);
  s = simon.newGame('b', 1, t.deal);
  s = run(simon, s, [{ g: 'start' }]);
  while (!s.won) { s = watch(s); s = simon.act(s, { g: 'sq', n: String(s.run[s.i]) }).state; }
  assert.equal(s.len, 9);
  assert.equal(s.grade, 'quiet');
  assert.match(simon.html(s, 'zh'), /猎户的脚/);
  assert.equal(simon.newGame('c').level, 1, 'the 游戏厅 plays the kit\'s own ladder');
});

test('闻焦 has left 09-year: the passage whole (story_after merged, word for word), 伏天 waits on 清明 alone; an old save holding it offered lets it go', () => {
  const sc = CH.scenes['09-year'];
  assert.ok(!(sc.show ?? []).some((c) => c.id === 'year-smell') && !(sc.offers?.tasks ?? []).includes('year-smell'));
  assert.ok(!sc.exits.some((e) => e.needs?.task === 'year-smell'));
  // 第二批 (2026-10-26): 闵丹师's questions are 09-danfang's; 闻焦 still told, word for word, on 09-year's first lines.
  assert.match(CH.scenes['09-danfang'].story_after.zh, /头一回有人问到我答不上的。」$/);
  assert.match(sc.story.zh, /^就在闵丹师出神的当口，炉里的药气变了，多出了一丝焦。/);
  assert.equal(content.tasks.tasks.find((t) => t.id === 'year-smell').cut, '2026-10-19');
  assert.equal(content.games.games.find((g) => g.id === 'huohousmell' && g.replaced !== 'cut'), undefined, 'its game deleted 2026-10-19; the task id stays, cut');
  const old = fitWorld(at('09-year', { marks: ['y-qingming'], tasks: { 'year-smell': { status: 'offered' } }, tell_owed: ['after/09-year'] }), content);
  assert.equal(old.tasks['year-smell'], undefined, 'never winnable here now: let go');
  assert.deepEqual(old.tell_owed ?? [], [], 'the merged passage is owed nowhere');
  assert.equal(go(play(old, 'year-kanlu'), 'futian').scene, '09-lingcao');
});
