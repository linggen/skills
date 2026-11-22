// The seals take turns (Hanli 2026-11-21, playing on his iPhone: 「目前我玩到的塔防里的结印都是剑印, 我们当时定的是, 剧情里没学结印前用简单的剑印.
// 老师教过其他手印后, 就换着用, 每个手印都在游戏里用到」 · 「可以, 做吧」): the dock's rotation itself is pinned in game-jieyin-helper-ux.test.mjs; here
// the way what he has learned REACHES a board — the one seam (mastery.js) carrying the 印谱 — and the phone dealing a board the story's marks as the Mac does.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';
import { bookView, seals } from '../scripts/rules/seals.mjs';
import { NONE, masteryFor } from '../scripts/games/jieyin/mastery.js';
import { duelId } from '../scripts/games/jieyin/helper.js';
import { gateOpen as gateShouqiang, offerJieyin as offerShouqiang } from '../scripts/games/shouqiang.js';
import { gateOpen as gateShoulu, offerJieyin as offerShoulu } from '../scripts/games/shoulu.js';
import { gateOpen as gateSadoushou, offerJieyin as offerSadoushou } from '../scripts/games/sadoushou.js';
import { jieyinOf, movesOf } from '../scripts/games/sadoushou/core.js';

const at = (p) => new URL(`../${p}`, import.meta.url);
const json = (p) => JSON.parse(fs.readFileSync(at(p), 'utf8'));
const content = loadContent();
const NOW = new Date(2026, 10, 21, 9, 0);
const jieyin = json('worlds/jiuding/levels/jieyin.json'), shouqiang = json('worlds/jiuding/levels/shouqiang.json'), sadoushou = json('worlds/jiuding/levels/sadoushou.json');
const save = (extra = {}) => ({ ...newState(content, 'zh', NOW), ...extra });
const BOOK = (s) => async (args) => seals(s, content, { now: NOW }, args).result; // the page's `sealBook`, answered by the real rules

test('the book reaches a board as `learned` through the one read mastery.js makes — seeds at once, a lesson once its 考 is passed, at 生 too; never from `bonus`', async () => {
  assert.deepEqual([...NONE.learned], [], 'no seam: none');
  assert.deepEqual((await masteryFor({})).learned, []);
  const fresh = await masteryFor({ sealBook: BOOK(save({ marks: [] })) });
  assert.deepEqual(fresh.learned, [], 'a save the story has not yet taught');
  const taught = save({ marks: ['qiajue-tight'] });
  assert.deepEqual((await masteryFor({ sealBook: BOOK(taught) })).learned, ['feijian', 'huodan'], 'the 讲堂\'s two, undated, at 生: learned though they lend no strength');
  const lesson = save({ marks: ['qiajue-tight'], seals: { book: { bingzhui: { at: NOW.toISOString(), via: 'lesson', hp: 4 } } } });
  const m = await masteryFor({ sealBook: BOOK(lesson) });
  assert.deepEqual(m.learned, ['feijian', 'huodan', 'bingzhui'], 'the book\'s order');
  assert.deepEqual(m.bonus, {}, 'all three still at 生: no strength — yet learned');
  assert.ok(!m.learned.includes('jinren'), 'a lesson not passed is not learned');
  assert.deepEqual((await masteryFor({ sealBook: async () => { throw new Error('far'); } })).learned, [], 'a book out of reach: the sword seal as ever');
  assert.deepEqual((await masteryFor({ sealBook: () => new Promise(() => {}) }, { ms: 30 })).learned, [], 'a slow one too');
});

test('the three hosts hand the dock the same list the same way (their `mastery`), and a host with none hands []', async () => {
  const learned = ['feijian', 'huodan', 'bingzhui'], mastery = { ...NONE, learned };
  const box = { ownerDocument: { defaultView: {} } }, game = { jieyinState: () => ({ on: true, ready: true }), jieyin: () => true, fizzle() {}, paused: () => false, picking: () => false, say() {} };
  const seen = [];
  const load = async () => ({ offerSeals: async (o) => { seen.push(o.learned); return null; } });
  await offerShouqiang({ jieyin: shouqiang.jieyin }, box, { lang: 'zh', game, marks: undefined, load, mastery });
  await offerShoulu(jieyin.hosts.shoulu, box, { lang: 'zh', now: () => ({ g: null }), marks: undefined, toast() {}, paused: () => false, aside: () => false, load, mastery: () => mastery });
  const ladder = sadoushou.levels.find((l) => !l.story);
  await offerSadoushou({ ...ladder, jieyin: jieyinOf(sadoushou, ladder) }, box, { lang: 'zh', game, marks: undefined, load, mastery });
  assert.deepEqual(seen, [learned, learned, learned]);
  await offerShouqiang({ jieyin: shouqiang.jieyin }, box, { lang: 'zh', game, load });
  assert.deepEqual(seen.at(-1), [], 'no book: the default seam says none');
});

test('one id space: a book seal\'s `move` is the host row\'s id AND its 手势斗法 id, in all three kits (the dock matches the book against either)', () => {
  const rows = [...jieyin.hosts.shoulu.moves, ...shouqiang.jieyin.moves, ...Object.values(sadoushou.jieyinSets).filter(Array.isArray).flat()];
  for (const r of rows) assert.equal(duelId(r), r.id, `${r.id}: the host's id is the dock's`);
  const hostIds = new Set(rows.map((r) => r.id));
  for (const r of content.chuanyin.book) for (const m of r.move) assert.ok(hostIds.has(m), `${r.id}: a kit resolves ${m}`);
});

// 2026-11-21: the Mac hands a board the story's marks (lingjing.js mountData `deal.marks ??= [...(look.marks ?? [])]`); the phone read none,
// so every `from`-gated move stood open there. It now takes them from the rules' book (games/phone/host.js dealOf) — the same `state.marks`.
test('the phone is dealt the marks the Mac is: the rules\' book and Look hold the same ones, and each host offers the same moves for the same save', () => {
  const ladder = sadoushou.levels.find((l) => !l.story), story = sadoushou.levels.find((l) => l.story);
  const hosts = {
    shouqiang: (marks) => shouqiang.jieyin.moves.filter((m) => gateShouqiang(m, marks)).map((m) => m.id),
    shoulu: (marks) => jieyin.hosts.shoulu.moves.filter((m) => gateShoulu(m, marks)).map((m) => m.id),
    'sadoushou full': (marks) => movesOf(sadoushou, ladder).filter((m) => gateSadoushou(m, marks)).map((m) => m.id),
    'sadoushou story': (marks) => movesOf(sadoushou, story).filter((m) => gateSadoushou(m, marks)).map((m) => m.id),
  };
  const saves = { 'a fresh save': [], 'taught tight': ['qiajue-tight'], 'taught loose': ['qiajue-loose'], 'other marks only': ['x', 'y'] };
  for (const [name, marks] of Object.entries(saves)) {
    const s = save({ marks });
    const mac = [...(look(s, content, { now: NOW, quests: [] }).marks ?? [])]; // lingjing.js: `[...(look?.marks ?? [])]`
    const phone = bookView(content, s, NOW).marks;                              // host.js: `[...book.marks]`
    assert.deepEqual(phone, mac, `${name}: the same marks`);
    assert.ok(Array.isArray(phone), 'always an array: a save with none gates, it does not open everything');
    for (const [h, offered] of Object.entries(hosts)) assert.deepEqual(offered(phone), offered(mac), `${name} · ${h}`);
  }
  assert.deepEqual(hosts.shouqiang([]), ['feijian', 'dianxue', 'zhangfeng', 'quanjin'], 'before 古六: the 小招 only, as the Mac');
  assert.deepEqual(hosts.shoulu([]), ['feijian']);
  assert.ok(hosts.shouqiang(undefined).length > hosts.shouqiang([]).length, 'what the phone dealt before: no marks, all open');
});

test('the phone host deals the marks at its ONE place, a story board only, from the book it also serves the board', () => {
  const src = fs.readFileSync(at('scripts/games/phone/host.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/ \/\/ .*$/gm, '');
  assert.equal([...src.matchAll(/\bmarks\b\s*\?\?=|\.marks\s*=/g)].length, 1, 'one place assigns a board\'s marks');
  assert.match(src, /async function dealOf\(/);
  assert.match(src, /const book = task\?\.id \? await bookRead\(\) : null;/, 'a story board only: the 游戏厅 has no save to gate by');
  assert.match(src, /d\.marks \?\?= \[\.\.\.book\.marks\]/);
  assert.match(src, /const dealt = await dealOf\(/);
  assert.equal([...src.matchAll(/rules\('seals', \{ action: 'book' \}\)/g)].length, 1, 'one book read of its own; mastery.js\'s first ask is served from it');
  assert.match(src, /BOOK_MS = 1500/, 'a board\'s start never hangs on the app');
});
