// 观内 — 外门弟子，无令不得下山 (Hanli, 2026-10-15: 「可以，按你的建议做」). While he is an 外门
// disciple he roams INSIDE 沉鼎观; below the mountain opens only on a 执事堂 令 (one place, one
// errand, one at a time) or where the story's own scene stands. A save left outside goes home.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, move, quest, task, win } from '../scripts/rules.mjs';
import { resolve } from '../scripts/rules.mjs';
import { TO_OPEN, walk } from './prologue.mjs';

const content = loadContent();
const CH = content.chapters['00-waimen'];
const DAY1 = new Date('2026-09-29T09:00:00');
const ctx = () => ({ now: DAY1, quests: [] });
const must = (fn, s, args) => {
  const out = fn(s, content, ctx(), args);
  assert.equal(out.result.ok, true, `${fn.name} ${JSON.stringify(args)} at ${s.scene}@${s.place}: ${JSON.stringify(out.result).slice(0, 300)}`);
  return out.state ?? s;
};
const refused = (fn, s, args, code) => {
  const out = fn(s, content, ctx(), args);
  assert.equal(out.result.refused, code, JSON.stringify(out.result).slice(0, 300));
  return out.result;
};
const fresh = (s) => ({ ...s, stamina: 100, stamina_at: DAY1.toISOString() });
function step(s, exit) {
  if (exit === 'breathe') { s = must(win, s, { id: 'zhoutian-sanguan' }); s = must(task, s, { action: 'done', id: 'zhoutian-sanguan' }); }
  return must(resolve, s, { exit });
}
/* Past 入门第一课: the 观 is his to walk (the next scene waits at the 药园). */
const roaming = () => {
  let s = fresh(walk(newState(content, 'zh', DAY1), TO_OPEN, content, DAY1));
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
  return fresh(s);
};
const GUAN = ['waimen', 'fantang', 'jiangtang', 'chaifang', 'yanwu', 'zhengdian', 'zhishi', 'cangjing', 'yaoyuan', 'houshan', 'shanmen'];

test('the 外门 map is the 观: eleven places, home at 外门, every road between them both ways', () => {
  assert.deepEqual([...CH.map.places].sort(), [...GUAN].sort());
  assert.equal(CH.map.home, 'waimen');
  assert.match(CH.map.say.zh, /无令不得下山/);
  for (const id of ['fantang', 'yanwu', 'zhishi']) {
    const p = content.places['徐'].places.find((x) => x.id === id);
    assert.ok(p, id);
    for (const r of p.roads) assert.ok(content.places['徐'].places.find((x) => x.id === r).roads.includes(id), `${id} ↔ ${r}`);
  }
  // 卷一's later maps hold the new halls too.
  for (const ch of ['00-zhuji', '01-ji']) for (const id of ['fantang', 'yanwu', 'zhishi']) assert.ok(content.chapters[ch].map.places.includes(id), `${ch} ${id}`);
});

test('gating: he roams every 观 place; below the mountain is refused with the rule, greyed on the map', () => {
  let s = roaming();
  for (const id of ['fantang', 'yanwu', 'zhishi', 'cangjing', 'houshan', 'shanmen']) s = fresh(must(move, s, { place: id }));
  const no = refused(move, s, { place: 'fangshi' }, 'road-closed');
  assert.match(no.say, /外门弟子，无令不得下山/);
  refused(move, s, { place: 'dukou' }, 'road-closed');
  const l = look(s, content, ctx());
  assert.ok(l.place.places.find((p) => p.id === 'fangshi').closed, '坊市 greyed');
  assert.ok(!l.place.places.find((p) => p.id === 'zhishi').closed, '执事堂 open');
  assert.ok(!(l.director.near ?? []).some((p) => !GUAN.includes(p.id)), JSON.stringify(l.director.near));
});

test('errands: the east wall offers the 观\'s chores and the tags below the mountain; nothing beyond his realm', () => {
  const s = must(move, roaming(), { place: 'zhishi' });
  const ids = look(s, content, ctx()).offers.map((o) => o.id);
  for (const id of ['guan-chaifang-wood', 'guan-fantang-zhengti', 'guan-zhishi-ledger', 'guan-cangjing-shai', 'xu-dushu-boat', 'xu-elder-herb', 'xu-yunlong-herbs']) assert.ok(ids.includes(id), `${id} in ${ids}`);
  assert.ok(!ids.includes('xu-lvliang-look'), '吕梁洪 is beyond 练气 — its tag waits');
  // chores pay 灵石, the night's work 修为 (the numbers are the economy's)
  const all = content.quests;
  for (const q of all.filter((x) => x.id.startsWith('guan-'))) assert.ok(q.work === 'labor' ? q.grant.wealth > 0 : q.grant.progress > 0, q.id);
  // a chore is done in its own place, the 观's board there
  let c = must(quest, s, { action: 'take', id: 'guan-chaifang-wood' });
  c = fresh(must(move, c, { place: 'chaifang' }));
  c = must(win, c, { id: 'huarong' }); c = must(task, c, { action: 'done', id: 'huarong' });
  assert.ok(c.quests['guan-chaifang-wood'].done_at, 'stacked, it hands itself in');
});

test('the 令: taken at the 执事堂, the road to that one place opens; one at a time; spent once done and back inside', () => {
  let s = must(move, roaming(), { place: 'zhishi' });
  s = must(quest, s, { action: 'take', id: 'xu-dushu-boat' });
  assert.equal(s.pass.to, 'dukou');
  assert.ok(s.pass.places.includes('dukou'));
  assert.equal(look(s, content, ctx()).place.pass.to.id, 'dukou');
  const two = refused(quest, s, { action: 'take', id: 'xu-elder-herb' }, 'pass-held');
  assert.match(two.say, /令/);
  assert.ok(!look(s, content, ctx()).offers.some((o) => o.id === 'xu-elder-herb'), 'a second tag is not offered while one hangs at his belt');
  // down the mountain — only that way
  s = fresh(must(move, s, { place: 'dukou' }));
  assert.equal(s.place, 'dukou');
  refused(move, s, { place: 'sishui' }, 'road-closed');
  s = must(win, s, { id: 'huarong' }); s = must(task, s, { action: 'done', id: 'huarong' });
  assert.ok(s.quests['xu-dushu-boat'].done_at, 'the boat hauled, it hands itself in where he stands');
  assert.ok(s.pass, 'done, but still below: the way home stays open');
  s = fresh(must(move, s, { place: 'waimen' }));
  assert.equal(s.place, 'waimen');
  // back inside, the 令 is spent and the outside shuts again
  const after = look(s, content, ctx());
  assert.equal(after.place.pass, undefined);
  s = must(move, s, { place: 'shanmen' });
  assert.equal(s.pass, undefined);
  refused(move, s, { place: 'fangshi' }, 'road-closed');
  // and the next tag may be taken
  s = fresh(must(move, s, { place: 'zhishi' }));
  s = must(quest, s, { action: 'take', id: 'xu-elder-herb' });
  assert.equal(s.pass.to, 'pengcheng');
});

test('a 令 put down below the mountain still lets him walk home — never stranded', () => {
  let s = must(move, roaming(), { place: 'zhishi' });
  s = must(quest, s, { action: 'take', id: 'xu-dushu-boat' });
  s = fresh(must(move, s, { place: 'dukou' }));
  s = must(quest, s, { action: 'drop', id: 'xu-dushu-boat' });
  s = fresh(must(move, s, { place: 'waimen' }));
  s = must(move, s, { place: 'shanmen' });
  assert.equal(s.pass, undefined);
});

test('an old save standing below the mountain without a 令 is put back at 外门, told once in the world\'s words', () => {
  const s = { ...roaming(), place: 'fangshi' };
  const l = look(s, content, ctx());
  assert.equal(l.place.id, 'waimen');
  assert.match(l.place.returned, /无令不得下山/);
  assert.match(look(s, content, { ...ctx() }).place.returned, /回到了外门/);
  // the move it makes next is written from 外门, and walking on lets the line go
  const on = must(move, s, { place: 'fantang' });
  assert.equal(on.place, 'fantang');
  assert.equal(look(on, content, ctx()).place.returned, undefined);
  // an older save that took a tag below the mountain before the wall is given its 令
  const held = { ...roaming(), place: 'waimen', quests: { 'xu-dushu-boat': { took: '2026-09-28', have: {} } } };
  assert.equal(look(held, content, ctx()).place.pass.to.id, 'dukou');
  assert.equal(must(move, held, { place: 'dukou' }).place, 'dukou');
});

test('the story opens its own way: the 秘境\'s 石门 while its scene is ahead', () => {
  const s = { ...roaming(), scene: 'wm-mijing', place: 'waimen' };
  const way = look(s, content, ctx()).waypoint;
  assert.equal(way.place.id, 'shimen');
  assert.equal(must(move, s, { place: 'shimen' }).place, 'shimen');
  refused(move, s, { place: 'pengcheng' }, 'road-closed');
});
