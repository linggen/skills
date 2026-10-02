// 第一章 · 丹炉: the furnace is named 饭桶 (the book's 古六, story/jiuding-lu/04-第四回.md since old 古六 folded into 古四, Hanli
// 2026-09-29 「饭桶那段不错，用吧」). The grand names are refused on the scene card
// and grey out; 「你这饭桶」 clicks; typed words are taken only when they hold 饭桶;
// the name is kept on the save and shown with the furnace (bag, 图鉴 title).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, resolve, VERBS } from '../scripts/rules.mjs';
import { WORDS, cardHtml } from '../scripts/cards.js';
import { TO_OPEN, walk } from './prologue.mjs';

const content = loadContent();
const DAY1 = new Date('2026-09-29T09:00:00');
const ctx = () => ({ now: DAY1, quests: [] });
const atFurnace = (lang = 'zh') => ({
  ...walk(newState(content, lang, DAY1), TO_OPEN, content, DAY1),
  scene: 'wm-danlu', place: 'chaifang', stamina: 100, stamina_at: DAY1.toISOString(),
});
const GRAND = ['zhentian', 'jiuzhuan', 'qiankun'];

test('the scene card offers three grand names and 「你这饭桶」; the passage asks its name and the lid does not move', () => {
  const l = look(atFurnace(), content, ctx());
  assert.deepEqual(l.scene.panel.taps.map(t => t.label), ['镇天神炉', '九转金丹炉', '乾坤一炉', '你这饭桶']);
  assert.ok(l.scene.panel.taps.every(t => !t.spent));
  const scene = content.chapters['00-waimen'].scenes['wm-danlu'];
  assert.match(scene.story.zh, /你叫什么/);
  assert.doesNotMatch(JSON.stringify(scene), /你想了想/, 'the old passage is gone');
  const keep = scene.exits.find(e => e.id === 'keep');
  for (const joke of ['镇天神炉', '九转金丹炉', '说书先生', '你这饭桶，倒比我还难伺候', '咔哒', '偏偏是「饭桶」两个字']) assert.ok(keep.story.zh.includes(joke), joke);
});

test('a grand name is refused in its own line, nothing moves, and the choice greys out', () => {
  let s = atFurnace();
  const lines = new Set();
  for (const exit of GRAND) {
    const out = resolve(s, content, ctx(), { exit, said: exit });
    assert.equal(out.result.ok, false);
    assert.equal(out.result.refused, 'snubbed');
    assert.ok(out.result.say, exit);
    lines.add(out.result.say);
    s = out.state;
    assert.equal(s.scene, 'wm-danlu', 'the scene stays');
    assert.equal(s.bag.danlu ?? 0, 0, 'no furnace yet');
    assert.equal(s.furnace_name, undefined);
    const tap = look(s, content, ctx()).scene.panel.taps.find(t => t.id === exit);
    assert.equal(tap?.spent, true, `${exit}: greyed, not hidden`);
  }
  assert.equal(lines.size, 3, 'each grand name has its own line');
  const l = look(s, content, ctx());
  assert.equal(l.scene.panel.taps.find(t => t.id === 'keep').spent, undefined, '饭桶 is still open');
  const html = cardHtml({ card: 'panel' }, { look: l, lang: 'zh', words: WORDS.zh, content: {}, artBase: '', panelNote: '炉盖纹丝不动。' });
  assert.equal((html.match(/paneltap spent" data-panel-exit="[a-z]+" disabled/g) ?? []).length, 3, html);
  assert.match(html, /data-panel-exit="keep">你这饭桶</);
  assert.match(html, /donote">炉盖纹丝不动/);
});

test('「你这饭桶」 clicks: the name is saved, the furnace is in the bag as 小铜炉 · 饭桶, and the story moves on', () => {
  const out = resolve(atFurnace(), content, ctx(), { exit: 'keep', said: '你这饭桶' });
  assert.equal(out.result.ok, true, JSON.stringify(out.result).slice(0, 300));
  const s = out.state;
  assert.equal(s.furnace_name, '饭桶');
  assert.deepEqual(out.result.named, { field: 'furnace_name', value: '饭桶' });
  assert.equal(s.scene, 'wm-diyilu');
  assert.ok(s.bag.danlu > 0);
  const l = look(s, content, ctx());
  assert.equal(l.bag.find(b => b.id === 'danlu').name, '小铜炉 · 饭桶');
  assert.deepEqual(l.named, { danlu: '小铜炉 · 饭桶' }, 'the 图鉴 card title reads it');
  assert.equal(VERBS.gear(s, content).result.gear.bag.find(b => b.id === 'danlu').name, '小铜炉 · 饭桶');
});

test('typed to Ling: only a name holding 饭桶 is taken; anything else gets 纹丝不动', () => {
  for (const said of ['叫你镇天神炉', '就叫你金刚炉吧', '继续']) {
    const out = resolve(atFurnace(), content, ctx(), { exit: 'keep', said });
    assert.equal(out.result.refused, 'not-named', said);
    assert.match(out.result.say, /纹丝不动/);
  }
  assert.equal(resolve(atFurnace(), content, ctx(), { exit: 'keep' }).result.refused, 'not-named', 'no words, no name');
  for (const said of ['饭桶', '你这个饭桶！', '以后就叫你饭桶了']) {
    const out = resolve(atFurnace(), content, ctx(), { exit: 'keep', said });
    assert.equal(out.state.furnace_name, '饭桶', said);
  }
  const en = resolve(atFurnace('en'), content, ctx(), { exit: 'keep', said: 'You rice bucket' });
  assert.equal(en.state.furnace_name, '饭桶', 'the English tap names it too');
});

test('before it is named, the furnace is plain 小铜炉', () => {
  const s = { ...atFurnace(), bag: { ...atFurnace().bag, danlu: 1 } };
  const l = look(s, content, ctx());
  assert.equal(l.bag.find(b => b.id === 'danlu').name, '小铜炉');
  assert.equal(l.named, undefined);
});
