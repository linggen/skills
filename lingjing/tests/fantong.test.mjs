// 喂饭桶, free play (Hanli, 2026-10-15): the table is the world's (worlds/jiuding/fantong.json),
// the rules roll it (rules/fantong.mjs), the page only shows (fantong-free.js). One feed, then the
// bucket is full for `limit.cooldown_min`; inputs leave the bag, outputs go in; the 方子 are kept
// and shown in 录; now and then 银月 touches it and out comes 踏马的符.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { VERBS } from '../scripts/rules.mjs';
import { rollFeed, waitWords } from '../scripts/rules/fantong.mjs';
import { fantongHtml } from '../scripts/fantong-free.js';
import { pouchHtml } from '../scripts/pouch.js';
import { luHtml } from '../scripts/lu.js';
import { WORDS } from '../scripts/cards.js';

const content = loadContent();
const T = content.fantong;
const items = new Map(content.items.items.map(i => [i.id, i]));
const NOW = new Date('2026-10-15T09:00:00');
const at = (min) => new Date(NOW.getTime() + min * 60_000);
const ctx = (now = NOW) => ({ now, quests: [] });
const saveWith = (extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: 'wm-diyilu', place: 'chaifang',
  bag: { danlu: 1, 'yaodan-1': 2, ginseng: 1, 'fox-token': 1, 'tuna-jing': 1, 'old-bow': 1 }, wealth: 5,
  companion: { joined: '2026-10-01', asleep: true }, ...extra,
});
const feed = (s, args, now = NOW) => VERBS.fantong(s, content, ctx(now), { action: 'feed', ...args });

test('the table lints: every output is an item with a name in both tongues and one line of small print', () => {
  assert.ok(T, 'worlds/jiuding/fantong.json loads');
  assert.ok(items.has(T.needs.item), 'needs an item that exists');
  const outs = new Set();
  for (const [name, rows] of Object.entries(T.pools)) {
    assert.ok(rows.length, `${name} has rows`);
    for (const r of rows) { assert.ok(r.w > 0, `${name}/${r.item} weight`); outs.add(r.item); if (r.with) outs.add(r.with); }
  }
  for (const r of T.recipes.list) { outs.add(r.out); outs.add(r.best); assert.ok(items.has(r.in), r.in); }
  for (const e of T.events) { outs.add(e.out); assert.ok(e.say.zh && e.say.en, e.id); }
  for (const id of outs) {
    const it = items.get(id);
    assert.ok(it, `${id} is in items.json`);
    assert.ok(it.name?.zh && it.name?.en, `${id} name`);
    assert.ok(it.hint?.zh && it.hint?.en, `${id} hint`);
    assert.ok([...it.hint.zh].length <= 16, `${id}: one short line, not an explanation`);
    assert.ok(!it.story, `${id}: free play never hands out a story thing`);
  }
  for (const [k, v] of Object.entries(T.kinds)) {
    if (k === '_about') continue;
    for (const id of v.items ?? []) assert.ok(items.has(id), `${k}/${id}`);
    assert.ok(T.pools[v.useful] && T.pools[v.best], `${k} pools`);
    assert.equal(Object.values(v.grades).reduce((a, b) => a + b, 0), 100, `${k} grades sum to 100`);
  }
  for (const a of T.around.items) assert.ok(items.has(a.id), a.id);
  // 卷一's 逆天 is convenience: no output is a fight card or a worn arm.
  for (const id of outs) assert.ok(!['weapon', 'robe', 'pendant'].includes(items.get(id).kind), `${id} is not an arm`);
  assert.deepEqual(Object.keys(T.limit).filter(k => k !== '_about'), ['cooldown_min'], 'ships with the hour cooldown only');
});

test('the odds come out roughly as declared over many seeds', () => {
  for (const [kind, id] of [['junk', 'chaihuo'], ['herb', 'ginseng'], ['beast', 'yaodan-1']]) {
    const want = T.kinds[kind].grades, got = { junk: 0, useful: 0, best: 0 }, N = 4000;
    for (let i = 0; i < N; i++) got[rollFeed(T, { seed: `odds|${i}`, id }).grade]++;
    for (const g of Object.keys(got)) assert.ok(Math.abs((got[g] / N) * 100 - want[g]) < 3, `${kind} ${g}: ${(got[g] / N * 100).toFixed(1)} vs ${want[g]}`);
  }
  // 灵石 moves weight from junk to the good grades.
  const share = (lingshi) => { let good = 0; for (let i = 0; i < 3000; i++) if (rollFeed(T, { seed: `ls|${i}`, id: 'chaihuo', lingshi }).grade !== 'junk') good++; return good / 3000; };
  assert.ok(share(3) > share(0) + 0.25, 'three stones make good things far likelier');
  // The same seed, the same thing: the roll is the rules', deterministic.
  assert.deepEqual(rollFeed(T, { seed: 'same', id: 'ginseng' }), rollFeed(T, { seed: 'same', id: 'ginseng' }));
});

test('a feed: the input leaves the bag, the output goes in with its name and small print, 灵石 are paid', () => {
  const s = saveWith();
  const out = feed(s, { id: 'yaodan-1', lingshi: 2 });
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  assert.equal(out.state.bag['yaodan-1'], 1);
  assert.equal(out.state.wealth, 3);
  const o = out.result.out;
  assert.ok(o.name && o.hint, 'name and hint shown');
  assert.equal(o.hint, items.get(o.id).hint.zh);
  assert.ok((out.state.bag[o.id] ?? 0) >= 1 || out.state.held?.[o.id], 'the output landed');
  assert.ok(out.result.say.includes(o.name) || out.result.her);
  assert.equal(out.state.fantong.n, 1);
  // 凡物 by the woodpile go in without leaving anything.
  const later = feed(out.state, { id: 'chaihuo' }, at(61));
  assert.equal(later.result.ok, true);
  assert.equal(later.state.bag.chaihuo, undefined);
});

test('what never goes in: the bucket itself, a key, a story thing, 《吐纳经》, 爹\'s bow, a thing not held', () => {
  const s = saveWith({ bag: { danlu: 1, 'fox-token': 1, 'tuna-jing': 1, 'old-bow': 1, 'zixu-zhi': 1 } });
  for (const id of ['danlu', 'fox-token', 'tuna-jing', 'old-bow', 'zixu-zhi', 'ginseng', 'nope']) {
    assert.equal(feed(s, { id }).result.refused, 'not-feedable', id);
  }
  const brief = VERBS.fantong(s, content, ctx(), { action: 'look' }).result.fantong;
  assert.deepEqual(brief.inputs.map(i => i.id), ['chaihuo', 'shizi', 'kuye'], 'only the woodpile is at hand');
  assert.equal(feed(saveWith({ wealth: 1 }), { id: 'chaihuo', lingshi: 2 }).result.refused, 'no-lingshi');
  assert.equal(VERBS.fantong(saveWith({ bag: {} }), content, ctx(), { action: 'look' }).result.refused, 'no-fantong', 'no 饭桶, no board');
});

test('one feed, then the bucket is full for the hour: refused with when, in 刻; fed again after 60 minutes', () => {
  const first = feed(saveWith(), { id: 'chaihuo' });
  assert.equal(first.result.ok, true);
  assert.ok(first.result.next_at);
  const soon = feed(first.state, { id: 'shizi' }, at(15));
  assert.equal(soon.result.refused, 'full');
  assert.equal(soon.result.say, '饭桶还撑着，三刻后再喂。');
  assert.equal(soon.state, null, 'a refusal writes nothing');
  assert.equal(feed(first.state, { id: 'shizi' }, at(59)).result.refused, 'full');
  assert.equal(feed(first.state, { id: 'shizi' }, at(60)).result.ok, true);
  const en = feed({ ...first.state, lang: 'en' }, { id: 'shizi' }, at(30));
  assert.match(en.result.say, /still full — feed it again in 30 minutes/);
  assert.equal(waitWords(150 * 60_000, 'zh'), '两个时辰');
  // The page's board reads the wait from the brief.
  const brief = VERBS.fantong(first.state, content, ctx(at(15)), { action: 'look' }).result.fantong;
  assert.equal(brief.ready, false);
  assert.match(fantongHtml(brief, { nowMs: at(15).getTime() }), /三刻后再喂/);
});

test('`limit.per_day` alone caps the day instead (the other shape the table allows)', () => {
  const t = structuredClone(content);
  t.fantong.limit = { per_day: 3 };
  let s = saveWith();
  for (let i = 0; i < 3; i++) { const r = VERBS.fantong(s, t, ctx(at(i)), { action: 'feed', id: 'kuye' }); assert.equal(r.result.ok, true); s = r.state; }
  const fourth = VERBS.fantong(s, t, ctx(at(5)), { action: 'feed', id: 'kuye' });
  assert.equal(fourth.result.refused, 'full');
  assert.match(fourth.result.say, /个时辰后再喂/);
  assert.equal(VERBS.fantong(s, t, ctx(new Date('2026-10-16T08:00:00')), { action: 'feed', id: 'kuye' }).result.ok, true, 'a new day');
});

test('a 方子 found is kept on the save, said once, and shown in 录', () => {
  // Find a seed where 黄芪残株 lands its 方子, then play it through the verb.
  const s0 = saveWith({ bag: { danlu: 1, 'huangqi-canzhu': 3 } });
  let s = s0, found = null, now = NOW;
  for (let i = 0; i < 40 && !found; i++) {
    const r = feed(s, { id: 'huangqi-canzhu' }, now);
    assert.equal(r.result.ok, true);
    if (r.result.discovered) found = r;
    s = r.state; now = new Date(now.getTime() + 61 * 60_000);
    if (!s.bag['huangqi-canzhu']) s.bag['huangqi-canzhu'] = 1;
  }
  assert.ok(found, 'the 方子 lands within forty feeds');
  assert.ok(['mend-pill', 'mend-pill-3'].includes(found.result.out.id));
  assert.deepEqual(found.state.fantong.recipes, ['huangqi']);
  const again = feed(found.state, { id: 'huangqi-canzhu' }, new Date(now.getTime() + 61 * 60_000));
  assert.equal(again.result.discovered, undefined, 'said once');
  const book = VERBS.story(found.state, content, ctx(), {}).result;
  assert.deepEqual(book.fantong.map(r => [r.in, r.out]), [['黄芪残株', '回春丹']]);
  assert.match(luHtml(book), /饭桶方子[\s\S]*黄芪残株[\s\S]*回春丹/);
});

test('银月 touches it now and then — 踏马的符 and 「还不如我给你画」 — only while she walks with him', () => {
  let her = 0, none = 0;
  for (let i = 0; i < 2000; i++) {
    if (rollFeed(T, { seed: `y|${i}`, id: 'chaihuo', herHere: true }).event === 'yinyue') her++;
    if (rollFeed(T, { seed: `y|${i}`, id: 'chaihuo', herHere: false }).event) none++;
  }
  assert.ok(her > 60 && her < 190, `about 6%: ${her}/2000`);
  assert.equal(none, 0);
  // Through the verb: find a feed count where she reaches for it.
  let s = saveWith(), r = null, now = NOW;
  for (let i = 0; i < 200; i++) {
    r = feed(s, { id: 'chaihuo' }, now);
    if (r.result.her) break;
    s = r.state; now = new Date(now.getTime() + 61 * 60_000);
  }
  assert.equal(r.result.her, true);
  assert.equal(r.result.out.id, 'tama-defu');
  assert.match(r.result.say, /还不如我给你画/);
  // Not before she is found.
  let s2 = saveWith({ companion: {} }), now2 = NOW;
  for (let i = 0; i < 120; i++) { const x = feed(s2, { id: 'chaihuo' }, now2); assert.ok(!x.result.her); s2 = x.state; now2 = new Date(now2.getTime() + 61 * 60_000); }
});

test('a full pouch: the output waits at the abode and the line says so', () => {
  const full = saveWith({ bag: { danlu: 1, ...Object.fromEntries(['ganliang', 'luobo', 'qi-salt', 'sang-paper', 'juyou', 'dansha', 'shujin', 'langgan', 'lingzhi', 'ginseng', 'jade-fish', 'tongkuang', 'yaodan-2', 'yaodan-3', 'deer-hide', 'mend-pill', 'qi-pill', 'talisman', 'lianxi-fu', 'iron-sword', 'bamboo-sword', 'straw-cloak', 'jade-ring', 'hanyu', 'huojing', 'jingjin', 'leijimu', 'dingtai'].map(id => [id, 1])) } });
  const r = feed(full, { id: 'chaihuo' });
  assert.equal(r.result.ok, true);
  if (r.result.out.stored) assert.match(r.result.say, /储物袋已满/);
  assert.ok(r.result.out.stored || full.bag[r.result.out.id], 'stored, or stacked on one he holds');
});

test('the pouch shows the 饭桶 chip once he holds it, and its board in the grid\'s place', () => {
  const s = saveWith();
  const gear = VERBS.gear(s, content, ctx(), {}).result.gear;
  assert.equal(gear.fantong, true);
  assert.equal(VERBS.gear(saveWith({ bag: {} }), content, ctx(), {}).result.gear.fantong, undefined);
  const html = pouchHtml({ lang: 'zh', gear, words: WORDS.zh, look: {}, fantongPane: '<section class="ftong">board</section>' }, { pane: 'fantong' });
  assert.match(html, /data-pouch-pane="fantong"/);
  assert.match(html, /<section class="ftong">board<\/section>/);
  const brief = VERBS.fantong(s, content, ctx(), { action: 'look' }).result.fantong;
  const board = fantongHtml(brief, { ui: { sel: 'chaihuo' } });
  assert.match(board, /data-fantong-mouth/);
  assert.match(board, /data-fantong-pick="chaihuo"/);
  assert.match(board, /喂柴火棍/);
  assert.match(board, /g-scene/, 'the story\'s bucket drawing');
});
