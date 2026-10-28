// 观内 thickened (Hanli 2026-10-27: 「目前就只能战斗刷经验吗? 好像没什么任务能做, 感觉卡在了一个小地图」 → 「可以, 加吧」):
// each place of the 观 keeps a pool of the kit's practice boards and today's stand there, turning with the day; and
// 执事堂's east wall posts three 杂役 a day from its pool — never a tag two days running, gone at day's end
// (rules/rotation.mjs, places xu.json `has.games_pool`, quests/wall.json).
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { look, move, quest, task, win } from '../scripts/rules.mjs';
import { placeOf } from '../scripts/rules/world.mjs';
import { gamesToday, lapseWall, poolToday, wallPosts, wallToday } from '../scripts/rules/rotation.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const content = loadContent();
const SAVE = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/waimen.json', import.meta.url), 'utf8'));
const day = (n, h = 10) => new Date(2026, 9, 27 + n, h);
const ctx = (now) => ({ now, quests: [] });
/* An 外门 disciple at 练气一层, rested, standing at `place`. */
const at = (place, now = day(0), extra = {}) => ({ ...SAVE, place, tier: 'qi', step: 1, progress: 100, stamina: 100, stamina_at: now.toISOString(), ...extra });
const GUAN = ['waimen', 'jiangtang', 'cangjing', 'chaifang', 'fantang', 'zhishi'];
const WALL = content.walls.find((w) => w.at === 'zhishi');
/* Walked to `place`, a road at a time where the way stops on him (a scene's place on the way). */
function walkTo(s, place, c) {
  for (let i = 0; i < 6 && s.place !== place; i += 1) s = ok(move({ ...s, stamina: 100 }, content, c, { place }), `to ${place}`);
  assert.equal(s.place, place);
  return s;
}
const ok = (out, what) => { assert.equal(out.result.ok, true, `${what}: ${JSON.stringify(out.result).slice(0, 300)}`); return out.state; };

test('each 观 place has a pool of two or three of the kit\'s practice boards, and today\'s stand there — another set another day', () => {
  for (const id of GUAN) {
    const p = placeOf(content, id), pool = p.has.games_pool;
    assert.ok(pool.from.length >= 2 && pool.from.length <= 3, id);
    // The kit's practice boards, and a place's own (柴房's 赶黄鼠狼, 10-27).
    for (const g of pool.from) assert.ok(['pintu', 'huarong', 'wuziqi', 'xiangqi', 'chaifang-huangshulang'].includes(g), `${id}: ${g} is one of the kit's practice boards`);
    const sets = new Set(Array.from({ length: 6 }, (_, n) => poolToday(p, day(n)).join('|')));
    assert.ok(sets.size >= 2, `${id} turns: ${[...sets]}`);
    for (let n = 0; n < 6; n += 1) assert.equal(poolToday(p, day(n)).length, pool.today, id);
    assert.equal(poolToday(p, day(0, 1)).join(), poolToday(p, day(0, 23)).join(), 'the same all day');
  }
  assert.ok(!GUAN.some((id) => gamesToday(content, placeOf(content, id), day(0)).includes('luoshu')), '洛书 stays at its one gate (Hanli 10-19)');
  // 象棋 has three endgames a level (games/xiangqi.js PUZZLES): one place of the 观, not spread over the pools.
  assert.deepEqual(GUAN.filter((id) => placeOf(content, id).has.games_pool.from.includes('xiangqi')), ['zhishi']);
});

test('the tray and Look show today\'s set: practice boards where he stands, the plate\'s tags for every place of the 观', () => {
  for (const n of [0, 1]) {
    const now = day(n), l = look(at('cangjing', now), content, ctx(now));
    const practice = l.tasks.filter((t) => t.practice).map((t) => t.id).sort();
    assert.deepEqual(practice, poolToday(placeOf(content, 'cangjing'), now).sort());
    const tag = l.boards.find((b) => b.id === 'cangjing');
    assert.deepEqual(tag.games.map((g) => g.id), poolToday(placeOf(content, 'cangjing'), now));
    assert.deepEqual(l.boards.find((b) => b.id === 'zhishi').games.map((g) => g.id), poolToday(placeOf(content, 'zhishi'), now), '周衡\'s 灯谜 is every day\'s: no caption');
    assert.ok(tag.games.every((g) => g.name && !g.name.includes(' · ')), JSON.stringify(tag));
    // …and the 药园's, whose 捉虫 turns with 拼图 (tests/yaoyuan-practice.test.mjs).
    assert.deepEqual(l.boards.map((b) => b.id).sort(), [...GUAN, 'yaoyuan'].sort());
  }
});

test('the east wall posts three a day from its pool, all at once — never a tag two days running, another save another set', () => {
  assert.ok(WALL.pool.length >= 3 * WALL.posts);
  for (const seed of ['a', 'b', SAVE.seed ?? SAVE.created]) {
    let prev = [];
    for (let n = 0; n < 120; n += 1) {
      const posts = wallToday(WALL, { seed }, day(n));
      assert.equal(new Set(posts).size, 3);
      assert.ok(!posts.some((p) => prev.includes(p)), `${seed} day ${n}: ${posts} after ${prev}`);
      prev = posts;
    }
  }
  const differs = Array.from({ length: 8 }, (_, n) => wallToday(WALL, { seed: 'a' }, day(n)).join() !== wallToday(WALL, { seed: 'b' }, day(n)).join());
  assert.ok(differs.some(Boolean), 'two saves read two walls');
  const offers = (look(at('zhishi'), content, ctx(day(0))).offers ?? []).filter((o) => o.id.startsWith('wall-'));
  assert.deepEqual(offers.map((o) => o.id), wallToday(WALL, at('zhishi'), day(0)).map((e) => `wall-20261027-${e}`));
  for (const o of offers) {
    assert.match(o.say, /^东墙/, o.id);
    assert.equal(o.who, '执事堂 · 东墙杂役', 'its own giver, apart from the authored errands of the same wall');
    assert.ok(o.pays.progress > 0 && o.pays.wealth > 0, `${o.id} pays the wall share and 灵石: ${JSON.stringify(o.pays)}`);
  }
  // A day's three together pay about a day's 功课 (balance.json master wall.day, Hanli 10-27: the full errand rate was
  // half a layer a day): 练气一层 470 → 16 a tag, 47 the day's 功课.
  const day3 = offers.reduce((n, o) => n + o.pays.progress, 0), chore = Math.round(content.balance.play_pay.chore.day * 470);
  assert.equal(offers.length, 3);
  assert.ok(Math.abs(day3 - chore) <= 3, `a day's tags ${day3} against a day's 功课 ${chore}`);
  assert.ok(offers.every((o) => o.pays.progress === Math.round((content.balance.play_pay.wall.day / WALL.posts) * 470)), 'each tag a third of the day');
  assert.equal((look(at('cangjing'), content, ctx(day(0))).offers ?? []).filter((o) => o.id.startsWith('wall-')).length, 0, 'only at the wall');
});

test('a board tag is taken at the wall and met where it names, whatever that place\'s set today; a walk tag on the walk', () => {
  // Find a day whose wall has a board tag naming a board that place does not stand today, and a walk tag.
  let n = 0, board = null;
  for (; n < 60 && !board; n += 1) {
    board = wallPosts(content, at('zhishi', day(n)), day(n)).find((q) => q.need[0].kind === 'board' && !gamesToday(content, placeOf(content, q.need[0].at), day(n)).includes(q.need[0].task));
  }
  assert.ok(board, 'some day a tag sends him to a board off its place\'s set');
  const now = day(n - 1), c = ctx(now), need = board.need[0];
  let s = ok(quest(at('zhishi', now), content, c, { action: 'take', id: board.id }), 'take');
  s = walkTo(s, need.at, c);
  const l = look(s, content, c), row = l.tasks.find((t) => t.id === need.task);
  assert.ok(row && !row.practice, `${need.task} stands at ${need.at} for the tag`);
  assert.ok(row.title.endsWith(board.title.zh), row.title);
  const before = { progress: s.progress, wealth: s.wealth };
  s = ok(win({ ...s, stamina: 100 }, content, c, { id: need.task, stars: 3 }), 'win');
  s = ok(task({ ...s, stamina: 100 }, content, c, { action: 'done', id: need.task }), 'done');
  assert.ok(s.quests[board.id].done_at, 'met, it hands itself in');
  assert.ok(s.progress > before.progress && s.wealth > before.wealth);
  // A tag not up today is refused.
  const other = WALL.pool.find((e) => !wallToday(WALL, s, now).includes(e.id));
  assert.equal(quest(at('zhishi', now), content, c, { action: 'take', id: `wall-20261027-${other.id}` }).result.refused, 'not-posted');
  // A walk tag: fetch at one place, deliver at the other.
  let m = 0, walk = null;
  for (; m < 60 && !walk; m += 1) walk = wallPosts(content, at('zhishi', day(m)), day(m)).find((q) => q.need[0].kind === 'visit');
  const wnow = day(m - 1), wc = ctx(wnow);
  let w = ok(quest(at('zhishi', wnow), content, wc, { action: 'take', id: walk.id }), 'take walk');
  for (const v of walk.need) w = walkTo(w, v.place, wc);
  assert.ok(w.quests[walk.id].done_at, 'delivered, it hands itself in');
});

test('a tag lapses with its day: taken and undone, it is gone tomorrow, and the next day\'s wall stands', () => {
  const now = day(0), c = ctx(now), id = wallPosts(content, at('zhishi', now), now)[0].id;
  const s = ok(quest(at('zhishi', now), content, c, { action: 'take', id }), 'take');
  assert.ok(s.quests[id]);
  assert.equal(lapseWall(s, now), s, 'the same day, nothing moves');
  const next = lapseWall(s, day(1));
  assert.equal(next.quests[id], undefined);
  assert.ok(Object.keys(next.quests).every((q) => s.quests[q]), 'only the wall\'s tag leaves');
  const offers = look(next, content, ctx(day(1))).offers.filter((o) => o.id.startsWith('wall-'));
  assert.equal(offers.length, 3);
  assert.ok(!offers.some((o) => o.id.endsWith(id.replace(/^wall-\d+-/, ''))), 'never the same tag two days running');
});

test('the plate wears today\'s boards under each seal (Look\'s `boards`)', async () => {
  const { boardsById, plateHtml } = await import('../scripts/plate.js');
  const l = look(at('waimen'), content, ctx(day(0)));
  const plate = { spots: [{ id: 'cangjing', name: '藏经阁', at: [0.2, 0.3] }, { id: 'houshan', name: '后山', at: [0.5, 0.5] }] };
  const html = plateHtml(plate, { boards: boardsById(l) });
  const names = l.boards.find((b) => b.id === 'cangjing').games.map((g) => g.name).join(' · ');
  assert.ok(html.includes(`<small class="spotgames">${names}</small>`), html);
  assert.ok(!/后山<\/span><small/.test(html), 'a place with no pool wears nothing');
});
