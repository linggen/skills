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
import * as fantong from '../scripts/games/fantonghuochai.js';
import * as sui from '../scripts/games/leafsui.js';
import * as ding from '../scripts/games/leafding.js';
import * as yubu from '../scripts/games/yubujiuge.js';
import * as recipe from '../scripts/games/recipe.js';
import * as smell from '../scripts/games/huohousmell.js';
import * as reed from '../scripts/games/reed.js';
import * as wind from '../scripts/games/wind.js';
import { GRID } from '../scripts/games/yubu.js';
import { leafX, SUI } from '../scripts/games/leaf.js';
import { HEAVE, PINK } from '../scripts/games/reed.js';
import { windOf } from '../scripts/games/wind.js';
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

const H11 = ['09-snow', '09-jiuge', '09-furnace', '09-year', '09-lingcao', '09-yishui', '09-xie', '09-futian'];
const BOARDS = { '09-snow': ['snow-fantong'], '09-jiuge': ['jiuge-sui', 'jiuge-yubu'], '09-furnace': ['furnace-recipe', 'furnace-ding'], '09-year': ['year-smell'], '09-yishui': ['yishui-reed'], '09-xie': ['xie-wind'] };
const FIGHTS = { '09-lingcao': ['fight', 'lingcao-qiuyu', 'qiuyu'], '09-futian': ['spar', 'futian-qinyan', 'foe-shijie'] };
const RISES = { '09-furnace/fire': 5, '09-year/futian': 5, '09-yishui/night': 6, '09-futian/spar': 7 };

test('古七 runs in the book\'s order on the `next` chain — eight scenes, every one h11, then 古八\'s 09-dabi', () => {
  const chain = [];
  for (let id = '09-snow'; id && CH.scenes[id]?.hui === 'h11';) { chain.push(id); id = CH.scenes[id].exits.map((e) => e.next).find(Boolean); }
  assert.deepEqual(chain, H11);
  assert.equal(CH.scenes['09-futian'].exits.find((e) => e.id === 'spar').next, '09-dabi');
  assert.deepEqual(lint(content), []);
});

test('each scene\'s boards are its own (two at most), the ways on wait on the last; the fights are the exits\' card fights', () => {
  for (const [scene, ids] of Object.entries(BOARDS)) {
    const sc = CH.scenes[scene];
    assert.deepEqual(sc.show.filter((c) => c.card === 'board').map((c) => c.id), ids, scene);
    assert.deepEqual(sc.offers.tasks, ids);
    assert.ok(ids.length <= 2);
    for (const e of sc.exits.filter((x) => !x.stay)) assert.equal(e.needs?.task, ids.at(-1), `${scene}/${e.id} waits on its last board`);
    for (const id of ids) assert.ok(content.tasks.tasks.some((t) => t.id === id), `${id} in tasks/h11.json`);
  }
  for (const [scene, [exit, game, creature]] of Object.entries(FIGHTS)) {
    const g = CH.scenes[scene].exits.find((e) => e.id === exit).game;
    assert.deepEqual([g.id, g.kind, g.creature], [game, 'duel', creature]);
    assert.ok(content.creatures.creatures.some((c) => c.id === creature), 'no new creatures.json row: the beast exists');
  }
});

test('the layers come one at a time: 五层 at the 定风 morning, 六层 the night after 沂水, 七层 that autumn — no h11 exit jumps', () => {
  const rises = {};
  for (const id of H11) for (const e of CH.scenes[id].exits) if (e.rise != null) rises[`${id}/${e.id}`] = e.rise;
  assert.deepEqual(rises, RISES);
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
  for (const id of ['jiuge-sui', 'jiuge-yubu', 'furnace-ding', 'xie-wind']) assert.equal(t(id).grant.progress, 5, id);
  assert.equal(t('furnace-recipe').grant.item, 'qi-pill');
  assert.equal(t('year-smell').grant.wealth, 3);
  assert.equal(t('yishui-reed').grant.wealth, 2);
  assert.deepEqual(Object.values(t('jiuge-yubu').marks), ['yubu', 'yubu'], '古九\'s beach reads `yubu`');
  assert.equal(CH.scenes['09-snow'].exits[0].grant.item, 'huochai-jian');
  assert.equal(CH.scenes['09-xie'].exits[0].grant.item, 'shunfeng-liu');
  const lc = CH.scenes['09-lingcao'].exits[0].grant, sp = CH.scenes['09-futian'].exits[0].grant;
  assert.deepEqual([lc.progress, lc.wealth], [30, 20], '犰狳: a fight\'s 修为, the book\'s 「每人二十块灵石」');
  assert.deepEqual([sp.table, sp.progress, sp.wealth], ['trial', 30, 20]);
});

test('walking 古七 by its boards and fights: 修为 rises at each cultivation board, the realm steps 四 → 五 → 六 → 七 one layer at a time', () => {
  let s = at('09-snow');
  s = go(play(s, 'snow-fantong'), 'feed');
  assert.equal(s.bag['huochai-jian'], 1);
  assert.equal(s.scene, '09-jiuge');
  const p0 = s.progress;
  s = play(s, 'jiuge-sui', 'follow');
  assert.ok(s.progress > p0, '随叶 raised 修为');
  assert.equal(s.tell_owed.at(-1), 'after/09-jiuge', 'the rest of the lesson is told right after the first board');
  s = go(play(s, 'jiuge-yubu', 'quiet'), 'down');
  assert.ok(s.marks.includes('yubu'));
  assert.equal(s.step, 4);
  s = play(play(s, 'furnace-recipe', 'clean'), 'furnace-ding', 'still');
  assert.ok(s.bag['qi-pill'] > 0, '认方: a 聚气丹');
  s = go(s, 'fire');
  assert.deepEqual([s.scene, s.step], ['09-year', 5]);
  s = go(play(s, 'year-smell', 'nose'), 'qingming');
  s = go(s, 'futian');
  assert.deepEqual([s.scene, s.step], ['09-lingcao', 5], '伏天 moves nothing now');
  const lc = look(s, content, ctx()).scene.exits.find((e) => e.id === 'fight');
  assert.equal(lc.duel.creature.id, 'qiuyu');
  s = go({ ...s, wins: { ...s.wins, 'lingcao-qiuyu': NOW.toISOString() } }, 'fight');
  assert.deepEqual([s.scene, s.step], ['09-yishui', 5]);
  s = go(play(s, 'yishui-reed', 'still'), 'night');
  assert.deepEqual([s.scene, s.step], ['09-xie', 6], '沂水 that night: 六层');
  s = go(play(s, 'xie-wind', 'read'), 'go');
  assert.equal(s.bag['shunfeng-liu'], 1);
  const door = look(s, content, ctx()).scene.exits.find((e) => e.id === 'spar').duel;
  assert.match(door.creature.goal, /整座崖，没有台边/, '秦雁 on the 崖顶: the scene\'s goal over the 大比\'s');
  assert.equal(resolve(s, content, ctx(), { exit: 'spar' }).result.refused, 'game-not-won', 'the autumn waits on her bout');
  const before = s.progress;
  s = go({ ...s, wins: { ...s.wins, 'futian-qinyan': NOW.toISOString() } }, 'spar');
  assert.deepEqual([s.scene, s.step], ['09-dabi', 7], '那年秋天，七层 — and 古八 opens');
  assert.ok(s.progress > 0 && before >= 0, 'the bout\'s 修为 lands in 七层');
});

test('a way on waits on its board: refused in the world\'s words until the board is counted', () => {
  for (const [scene, exit] of [['09-snow', 'feed'], ['09-jiuge', 'down'], ['09-furnace', 'fire'], ['09-yishui', 'night'], ['09-xie', 'go']]) {
    const out = resolve(at(scene), content, ctx(), { exit });
    assert.equal(out.result.ok, false, `${scene}/${exit}`);
    assert.ok(out.result.say, `${scene}/${exit} says why`);
  }
});

test('saves from before the split: one past 09-year stays put; one in 09-year moves on to 灵草谷 and is caught up to 五层; one in a scene given boards is offered them', () => {
  // The shape of a save that played the old 伏天 (四层 → 七层 in one passage) and stands on 古八's first scene.
  const past = at('09-dabi', { step: 7, progress: 0, marks: ['y-qingming', 'y-futian'], done_scenes: ['wm-heluo', '09-snow', '09-furnace', '09-year'], tasks: {} });
  const fitted = fitWorld(past, content);
  assert.deepEqual([fitted.scene, fitted.step], ['09-dabi', 7], 'never thrown back');
  assert.equal(huiNow(content, fitted), 'h09');
  assert.ok(look(fitted, content, ctx()).scene, 'Look stands');
  assert.deepEqual(health(content, fitted, NOW).filter((p) => p.level === 'error'), [], 'nothing broken');
  // Mid-09-year: the old furnace never rose him (the cap held 四层); 伏天 lands on 灵草谷, and lifts him to 五层 as the furnace would have.
  const mid = fitWorld(at('09-year', { marks: ['y-qingming'], done_scenes: ['wm-heluo', '09-snow', '09-furnace'] }), content);
  assert.equal(mid.tasks['year-smell']?.status, 'offered', 'the board 09-year was given is offered to a save standing there');
  const on = go(play(mid, 'year-smell'), 'futian');
  assert.deepEqual([on.scene, on.step], ['09-lingcao', 5]);
  // Standing in 09-furnace from before: its boards are offered, the way on is the 定风 morning.
  const fur = fitWorld(at('09-furnace', { tasks: {} }), content);
  assert.deepEqual(['furnace-recipe', 'furnace-ding'].map((id) => fur.tasks[id]?.status), ['offered', 'offered']);
});

/* ── the boards themselves ── */

test('no 古七 board draws its own skip (the page lays it), each says what it is in both languages, and a skip still draws a line', () => {
  for (const mod of [fantong, sui, ding, yubu, recipe, smell, reed, wind]) {
    const s = mod.newGame('t');
    for (const lang of ['zh', 'en']) {
      assert.doesNotMatch(mod.html(s, lang), /data-g="skip"/);
      assert.ok(mod.meta.name[lang] && mod.meta.how[lang]);
    }
    assert.equal(typeof mod.stuck, 'function');
    const left = { ...mod.act(s, { g: 'start' }).state, won: true, grade: null };
    assert.match(mod.html(left, 'zh'), /g-line-say">[^<]+/);
  }
});

test('喂饭桶 · 扔了干净: the lid opens at once; the gourd, then the shards — the red light in the door', () => {
  const s = run(fantong, fantong.newGame('a'), [{ g: 'press' }, { g: 'feed', f: 'gourd' }, { g: 'feed', f: 'shards' }]);
  assert.equal(s.won, true);
  assert.match(fantong.html(s, 'zh'), /钉在了门板上/);
});

test('随叶: following the leaf down lands it on the broom tip (follow); cutting blows it off', () => {
  const follow = liveUntil(sui, run(sui, sui.newGame('a'), [{ g: 'start' }]), (x) => {
    const want = Math.sign(leafX(`${x.seed}|${x.drop}`, x.t - x.at + 150) + x.gust - x.bx);
    return want === x.dir ? x : want === 0 ? sui.act(x, { g: 'release' }).state : sui.act(x, { g: 'hold', dir: want < 0 ? 'l' : 'r' }).state;
  });
  assert.equal(follow.grade, 'follow');
  const cut = run(sui, sui.newGame('b'), [{ g: 'start' }, { g: 'chop' }]);
  assert.equal(cut.note, 'cut');
  assert.notEqual(cut.gust, 0, 'the blade\'s wind pushes it off');
  assert.ok(SUI.fall > 5000, 'a fall long enough to follow');
});

test('定风: a step while the leaves spin is the eye turning with them; the step in the rise wins; idle, the leaf slaps the face', () => {
  let s = run(ding, ding.newGame('a'), [{ g: 'start' }, { g: 'step' }]);
  assert.equal(s.eyes, 1);
  s = liveUntil(ding, s, (x) => (x.note === 'rise' ? ding.act(x, { g: 'step' }).state : x));
  assert.equal(s.grade, 'shaky');
  assert.equal(liveUntil(ding, run(ding, ding.newGame('b'), [{ g: 'start' }]), (x) => (x.note === 'rise' ? ding.act(x, { g: 'step' }).state : x)).grade, 'still');
  const idle = liveUntil(ding, run(ding, ding.newGame('c'), [{ g: 'start' }]), (x) => x, (x) => x.slaps >= 1);
  assert.equal(idle.note, 'slap');
});

test('禹步: 左脚 · 右脚绕 · the next square, 一 to 九, on the 洛书 (戴九履一) → quiet; a beat out of order trips', () => {
  assert.deepEqual(GRID, [4, 9, 2, 3, 5, 7, 8, 1, 6]);
  let s = run(yubu, yubu.newGame('a'), [{ g: 'start' }, { g: 'right' }]);
  assert.equal(s.note, 'trip');
  s = yubu.newGame('b');
  s = run(yubu, s, [{ g: 'start' }]);
  for (let k = 1; k <= 9; k += 1) { for (const d of [{ g: 'left' }, { g: 'right' }, { g: 'sq', n: String(k) }]) { s = yubu.tick(s, 300); s = yubu.act(s, d).state; } }
  assert.equal(s.grade, 'quiet');
  assert.match(yubu.html(s, 'zh'), /猎户的脚/);
});

test('认方: the three recipes from the footprints — 黄精+灵石, 黄芪+灵力, 紫玉参+灵力; mixed any other way is ash', () => {
  let s = run(recipe, recipe.newGame('a'), [{ g: 'start' }, { g: 'heap', h: 'huangqi' }, { g: 'yin', y: 'stone' }, { g: 'feed' }]);
  assert.equal(s.note, 'again');
  for (const r of recipe.RECIPES) s = run(recipe, s, [{ g: 'heap', h: r.heap }, { g: 'yin', y: r.yin }, { g: 'feed' }]);
  assert.equal(s.won, true);
  assert.equal(s.grade, 'clean', 'one ash is forgiven');
  assert.match(recipe.html(recipe.act(recipe.newGame('c'), { g: 'start' }).state, 'zh'), /黄精、一块灵石 —— <b>聚气丹<\/b>/);
});

test('闻焦: speaking in the bitter or the sweet is early; in the scorch\'s half breath it wins; idle, the batch is lost', () => {
  let s = run(smell, smell.newGame('a'), [{ g: 'start' }, { g: 'say' }]);
  assert.equal(s.note, 'early');
  s = liveUntil(smell, s, (x) => (x.note === 'jiao' ? smell.act(x, { g: 'say' }).state : x));
  assert.equal(s.grade, 'late');
  const idle = liveUntil(smell, run(smell, smell.newGame('b'), [{ g: 'start' }]), (x) => x, (x) => x.lost >= 1);
  assert.equal(idle.note, 'lost');
});

test('芦苇里那一等: a sword let go during the charges glances off the hide; in the pink instant it goes in', () => {
  let s = run(reed, reed.newGame('a'), [{ g: 'start' }, { g: 'throw' }]);
  assert.equal(s.note, 'glance');
  s = liveUntil(reed, s, (x) => (reed.pinkNow(x) ? reed.act(x, { g: 'throw' }).state : x));
  assert.equal(s.grade, 'hasty');
  const clean = liveUntil(reed, run(reed, reed.newGame('b'), [{ g: 'start' }]), (x) => (reed.pinkNow(x) ? reed.act(x, { g: 'throw' }).state : x));
  assert.equal(clean.grade, 'still');
  assert.match(reed.html(clean, 'zh'), /粉红的肉里钻了进去/);
  assert.ok(PINK >= 450 && HEAVE.every((h) => h > PINK), 'a moment a person can catch');
});

test('顺风溜: facing into the wind and stepping back glides; any other way is 「噗，噗」; three glides end it', () => {
  let s = run(wind, wind.newGame('a'), [{ g: 'start' }, { g: 'face', d: 's' }, { g: 'back' }]);
  assert.equal(s.note, 'puff', 'the first night\'s wind is north: facing south and stepping back goes nowhere');
  assert.equal(windOf('a', 0), 'n');
  while (!s.won) { const w = windOf(s.seed, s.k); s = run(wind, s, [{ g: 'face', d: w }, { g: 'back' }]); }
  assert.equal(s.grade, 'puff');
  assert.ok(s.qi <= 0.5 + 1e-9, 'three glides and a puff: half the 丹田 and more');
});
