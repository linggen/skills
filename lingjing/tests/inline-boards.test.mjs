// A scene's boards inside its reading (Hanli, 2026-11-04: 「可以, 按你说的做」, after 「剧情任务不是读小说剧情时出现吗?」):
// a board stands at the line of the passage it stages, is played there, and the reading goes on after it — one at a
// time, the next hidden till the one before is won, put away (✕) or kept (留). rules/parts.mjs; the 年 pools first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { look, playTo, task, win } from '../scripts/rules.mjs';
import { fitWorld, migrate, newState } from '../scripts/state.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { afterParts, readThrough, sceneBoards } from '../scripts/rules/parts.mjs';
import { toldUpTo } from '../scripts/rules/progress.mjs';

const content = loadContent();
const NOW = new Date('2026-11-04T12:00:00Z');
const ctx = { now: NOW, quests: [] };
const scenes = Object.fromEntries(Object.values(content.chapters).flatMap((ch) => Object.values(ch.scenes)).map((sc) => [sc.id, sc]));
const taskOf = (id) => content.tasks.tasks.find((t) => t.id === id);
// The 年 pools, read through their boards since 11-04 (each its kept boards, in order).
const POOLS = {
  'wm-dianmao': ['dianmao-jiangtang', 'dianmao-canju', 'dianmao-sunergou', 'dianmao-ahe'],
  '09-suifeng': ['suifeng-yading', 'suifeng-yezi', 'suifeng-xunwei', 'suifeng-shanmen'],
  '09-nianyao': ['nianyao-niannian', 'nianyao-mindanshi', 'nianyao-yaoyuan', 'nianyao-ahe'],
  '09-shenshi': ['shenshi-jiangtang', 'shenshi-canju', 'shenshi-zhique', 'shenshi-qingshen'],
  '09-dingfeng': ['dingfeng-qulao', 'dingfeng-zhenyan', 'dingfeng-songzhi'],
  '09-yanceng': ['yanceng-chu', 'yanceng-mingce', 'yanceng-sunergou'],
};
const DROPPED = ['suifeng-qinyan', 'suifeng-canju', 'suifeng-qulao', 'nianyao-shuangma', 'nianyao-jingshi', 'dianmao-jingtai', 'dianmao-maxiaobao', 'dianmao-yaoyuan',
  'shenshi-chu', 'shenshi-qinyan', 'dingfeng-yading', 'dingfeng-kunzhen', 'dingfeng-jintui', 'dingfeng-canju', 'yanceng-ergou', 'yanceng-canju', 'yanceng-zhuochong', 'yanceng-xilang'];

/* A save standing at 09-suifeng, its passage owed (a seed's hand-over). */
const SUIFENG = (() => {
  const s = playTo(content, newState(content, 'zh', NOW), '09-suifeng', { now: NOW }).state;
  return { ...toldUpTo(content, s), place: scenes['09-suifeng'].at, stamina: 100, stamina_at: NOW.toISOString() };
})();
const boardsIn = (s) => (look(s, content, ctx).tasks ?? []).filter((t) => sceneBoards(scenes[s.scene]).includes(t.id) && t.status !== 'done').map((t) => t.id);
const told = (s) => { const t = tellOf(content, s); return { s: t ? { ...s, tell_owed: t.keep.tell_owed, told_scenes: t.keep.told_scenes } : s, items: t?.tell ?? [] }; };
const must = (out) => { assert.equal(out.result.ok, true, JSON.stringify(out.result)); return out.state; };
const won = (s, id) => must(task(must(win(s, content, ctx, { id })), content, ctx, { action: 'done', id }));

test('the 年 pools read through their kept boards: a part after each board but the last, every board staged at a line', () => {
  for (const [sid, ids] of Object.entries(POOLS)) {
    const sc = scenes[sid];
    assert.ok(readThrough(sc), sid);
    assert.deepEqual(sceneBoards(sc), ids, sid);
    assert.deepEqual(sc.offers.tasks, ids, `${sid}: offers what it shows`);
    assert.ok(afterParts(sc).length >= ids.length - 1 && afterParts(sc).length <= ids.length, `${sid}: ${afterParts(sc).length} parts for ${ids.length} boards`);
    assert.equal(sc.exits.find((e) => e.needs?.task).needs.task, ids.at(-1), `${sid}: the way on waits on the last`);
    for (const id of ids) assert.ok(!taskOf(id).cut, id);
    // No kit twice running.
    const kits = ids.map((id) => taskOf(id).game);
    for (let k = 1; k < kits.length; k += 1) assert.notEqual(kits[k], kits[k - 1], `${sid}: ${ids[k - 1]} → ${ids[k]}`);
  }
});

test('the boards let go are `cut` (the 游戏厅 keeps them under 旧版), and no scene shows one', () => {
  const shown = new Set(Object.values(scenes).flatMap(sceneBoards));
  for (const id of DROPPED) {
    assert.ok(taskOf(id)?.cut, `${id}: cut`);
    assert.ok(!shown.has(id), `${id}: shown nowhere`);
  }
});

test('an inline board is hidden before its line and shown at it, one at a time; a skip moves on; the reading goes on after each', () => {
  let s = SUIFENG;
  assert.deepEqual(boardsIn(s), [], 'nothing before the passage is told');
  let r = told(s); s = r.s;
  assert.deepEqual(r.items.map((i) => i.of), ['scene']);
  assert.match(r.items[0].text, /下个月，我再来。」$/, 'the first part ends at the notch');
  assert.deepEqual(boardsIn(s), ['suifeng-yading'], 'board 0 at its line, alone');
  s = won(s, 'suifeng-yading');
  assert.deepEqual(boardsIn(s), [], 'board 1 waits for its part');
  r = told(s); s = r.s;
  assert.deepEqual(r.items.map((i) => [i.of, i.id]), [['after', '09-suifeng/after']]);
  assert.match(r.items[0].text, /^年四开春，教的是随风。[\s\S]*像一个人牵着一条狗。$/);
  assert.deepEqual(boardsIn(s), ['suifeng-yezi']);
  // ✕: put away, the story moves on as after a win.
  s = must(task(s, content, ctx, { action: 'skip', id: 'suifeng-yezi' }));
  r = told(s); s = r.s;
  assert.deepEqual(r.items.map((i) => i.id), ['09-suifeng/after/1']);
  assert.match(r.items[0].text, /他还得等风。」$/);
  assert.deepEqual(boardsIn(s), ['suifeng-xunwei']);
  // 留: kept for later, the story moves on too.
  s = must(task(s, content, ctx, { action: 'keep', id: 'suifeng-xunwei' }));
  assert.ok(s.kept.some((e) => e.task === 'suifeng-xunwei'));
  r = told(s); s = r.s;
  assert.deepEqual(r.items.map((i) => i.id), ['09-suifeng/after/2']);
  assert.deepEqual(boardsIn(s), ['suifeng-shanmen']);
  s = won(s, 'suifeng-shanmen');
  r = told(s); s = r.s;
  assert.deepEqual(r.items.map((i) => i.id), ['09-suifeng/after/3']);
  assert.match(r.items[0].text, /^临走，他又添了一句[\s\S]*等它漏气。」$/);
  assert.equal(told(s).items.length, 0, 'nothing owed twice');
});

test('a later board is refused while one before it is still to play', () => {
  const { s } = told(SUIFENG);
  assert.equal(win(s, content, ctx, { id: 'suifeng-yezi' }).result.refused, 'board-waits');
});

test('his live save (yading won, the rest offered, the passage still owed, away at 山门): the parts read on to the next board, the rest hidden', () => {
  const live = { ...SUIFENG, place: 'shanmen', tasks: { ...SUIFENG.tasks } };
  live.tasks['suifeng-yading'] = { status: 'done', period: 'once', done_at: NOW.toISOString() };
  for (const id of ['suifeng-yezi', 'suifeng-qinyan', 'suifeng-canju', 'suifeng-xunwei', 'suifeng-qulao', 'suifeng-shanmen']) live.tasks[id] = { status: 'offered' };
  let s = fitWorld(live, content);
  for (const id of ['suifeng-qinyan', 'suifeng-canju', 'suifeng-qulao']) assert.equal(s.tasks[id], undefined, `${id}: let go`);
  assert.equal(s.tasks['suifeng-yading'].status, 'done');
  assert.deepEqual(boardsIn(s), [], 'away from 后山: the passage waits for him, and so do its boards');
  s = { ...s, place: scenes['09-suifeng'].at };
  const r = told(s);
  assert.deepEqual(r.items.map((i) => i.id), ['09-suifeng', '09-suifeng/after'], 'the notch, then the leaf — yading already behind him');
  assert.deepEqual(boardsIn(r.s), ['suifeng-yezi']);
});

test('dropped boards in old saves: done stays done, offered or kept is let go quietly, a win it held with it', () => {
  const s = fitWorld({ ...SUIFENG, tasks: { ...SUIFENG.tasks, 'suifeng-qinyan': { status: 'done', period: 'once' }, 'suifeng-canju': { status: 'offered' } },
    kept: [{ task: 'suifeng-qulao', story: true, scene: '09-suifeng' }, { task: 'furnace-ding', story: true, scene: '09-lingcao' }], wins: { 'suifeng-canju': NOW.toISOString() } }, content);
  assert.equal(s.tasks['suifeng-qinyan'].status, 'done');
  assert.equal(s.tasks['suifeng-canju'], undefined);
  assert.deepEqual(s.kept.map((e) => e.task), ['furnace-ding']);
  assert.equal(s.wins?.['suifeng-canju'], undefined);
  assert.ok(look(s, content, ctx).ok !== false);
});

test('a save that read a pool\'s passage whole before the cut (v16) owes none of its parts again — no replay', () => {
  const { s: read } = told(SUIFENG);
  const old = migrate({ ...read, version: 16 }, content);
  assert.equal(old.read_whole, '09-suifeng');
  assert.equal(old.read_whole_check, undefined);
  const s = won(old, 'suifeng-yading');
  assert.equal(told(s).items.length, 0, 'the rest was read');
  assert.deepEqual(boardsIn(s), ['suifeng-yezi'], 'the next board stands at once');
  // …and one whose passage is still owed is not marked: it reads through.
  assert.equal(migrate({ ...SUIFENG, version: 16 }, content).read_whole, undefined);
});

test('a save from before the cut, a later board already won in the old order (09-nianyao\'s 东角那三棵禾, its first then): every part told once, none lost', () => {
  const s0 = playTo(content, newState(content, 'zh', NOW), '09-nianyao', { now: NOW }).state;
  let s = { ...toldUpTo(content, s0), place: scenes['09-nianyao'].at, stamina: 100, stamina_at: NOW.toISOString() };
  s = { ...s, tasks: { ...s.tasks, 'nianyao-yaoyuan': { status: 'done', period: 'once', done_at: NOW.toISOString() } } };
  const ids = [];
  let r = told(s); s = r.s; ids.push(...r.items.map((i) => i.id));
  for (const b of ['nianyao-niannian', 'nianyao-mindanshi', 'nianyao-ahe']) {
    assert.deepEqual(boardsIn(s), [b], `${b} stands next`);
    s = won(s, b);
    r = told(s); s = r.s; ids.push(...r.items.map((i) => i.id));
  }
  assert.deepEqual(ids, ['09-nianyao', '09-nianyao/after', '09-nianyao/after/1', '09-nianyao/after/2', '09-nianyao/after/3'], '阿禾\'s 筑基 and the east corner, each once');
});
