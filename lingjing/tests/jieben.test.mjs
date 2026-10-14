// 节本 — the game plays its own cut of a book passage; the book is one tap away, at the box
// (Hanli, 2026-10-14: 「可以，先做古三」). A condensed passage is `story` (the cut, what the box
// plays and rhythm.mjs counts) beside `story_full` (the book's passage, word for word —
// scene-book-sync.test.mjs holds both to the book). Each beat of a cut names the book's paragraph
// it comes from (`at`), and 「读原著」 opens read.html at that 回 and paragraph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { beatsOf, passageFor, playOf, tellOf } from '../scripts/rules/tell.mjs';
import { advance, bookPlace, withTold } from '../scripts/dialogue.js';
import { readChipHtml, WORDS } from '../scripts/cards.js';
import { stretchesOf } from '../scripts/rhythm.mjs';
import { headOf, unitsOf } from '../scripts/jieben.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const NOW = new Date('2026-10-05T12:00:00');
const BOOK = JSON.parse(fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/book.json'), 'utf8'));
const entry = (hui) => BOOK.volumes.flatMap((v) => v.hui).find((h) => h.id === hui);
const join = (u, lang) => u.join(lang === 'en' ? ' ' : '');
// The book's paragraphs as read.js openAt reads them: their words, marks and punctuation aside.
const bookParas = (hui, lang) => fs.readFileSync(path.join(ROOT, 'story/jiuding-lu', lang === 'en' ? entry(hui).file_en : entry(hui).file), 'utf8')
  .split(/\n\s*\n/).map((p) => join(unitsOf(p, lang), lang));
const scenes = Object.values(content.chapters).flatMap((ch) => Object.values(ch.scenes ?? {}));
const cuts = scenes.flatMap((sc) => [
  [sc, sc.id, { of: 'scene', id: sc.id }, sc.story, sc.story_full],
  [sc, `${sc.id}/after`, { of: 'after', id: `${sc.id}/after` }, sc.story_after, sc.story_after_full],
  ...(sc.exits ?? []).map((x) => [sc, `${sc.id}/${x.id}`, { of: 'choice', id: `${sc.id}/${x.id}` }, x.story, x.story_full]),
]).filter(([, , , , full]) => full);

test('古三 plays the cut: every passage of 第三回 the book tells is condensed, to about a third', () => {
  const h04 = scenes.filter((sc) => sc.hui === 'h04');
  assert.deepEqual(h04.map((sc) => sc.id).sort(), ['00-gate', '00-hall', '00-longzhi', '00-luoshu', '00-mijing', '00-waimen']);
  let cut = 0, full = 0;
  for (const sc of h04) {
    assert.ok(sc.story_full, `${sc.id}: its passage is condensed`);
    for (const x of sc.exits) if (x.story && x.story.zh.length > 300) assert.ok(x.story_full, `${sc.id}/${x.id}: condensed`);
    for (const [, , , st, f] of cuts.filter(([s]) => s === sc)) { cut += unitsOf(st.zh, 'zh').length; full += unitsOf(f.zh, 'zh').length; }
  }
  assert.ok(cut / full < 0.4, `第三回 in the game: ${cut} of the book's ${full} characters`);
});

test('every beat of a cut names a paragraph the book holds — the one read.js opens at, zh and en', () => {
  for (const lang of ['zh', 'en']) {
    const s = newState(content, lang, NOW);
    for (const [sc, key, item, pair, full] of cuts) {
      const beats = beatsOf(content, s, { ...item, text: passageFor(content, s, pair), full: passageFor(content, s, full) });
      const paras = sc.hui && entry(sc.hui) ? bookParas(sc.hui, lang) : null;
      for (const b of beats) {
        assert.ok(b.at, `${key} ${lang}: 「${b.text.slice(0, 20)}」 names its paragraph`);
        // A branch the book never took (its passage is the game's own) has no paragraph there.
        if (paras && !/rush$/.test(key)) assert.ok(paras.some((p) => p.includes(join(unitsOf(b.at, lang), lang))), `${key} ${lang}: 「${b.at}」 is in the book`);
      }
    }
  }
  // An uncondensed passage's beats are the book's paragraphs themselves: no `at`.
  const s = newState(content, 'zh', NOW);
  assert.ok(playOf(content, s, tellOf(content, s).tell).every((t) => t.beats.zh.every((b) => !('at' in b))));
});

test('the cut is what the box plays: 00-gate opens on 第三回\'s words, the book\'s ride along only as anchors', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-prologue', scene: '00-gate', place: 'shanmen' };
  const told = tellOf(content, s).tell.find((t) => t.id === '00-gate');
  assert.ok(told.full, 'the rules carry the book\'s passage');
  const [item] = playOf(content, s, [told]);
  assert.ok(!('full' in item) && !('marked' in item), 'the page is handed beats, never the book\'s prose');
  const gate = scenes.find((sc) => sc.id === '00-gate');
  assert.equal(item.beats.zh.length, gate.story.zh.split('\n\n').length);
  assert.equal(item.beats.zh.length, item.beats.en.length, 'the same boxes in both languages');
  assert.equal(item.beats.zh[1].at, headOf(gate.story_full.zh.split('\n\n')[5], 'zh'), '沉鼎山\'s box opens the book at 沉鼎山');
});

test('读原著 opens the book at the box on show: its 回 and its paragraph', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-prologue', scene: '00-gate', place: 'shanmen' };
  let r = withTold(null, playOf(content, s, tellOf(content, s).tell.filter((t) => t.id === '00-gate')), '00-gate');
  r = advance(advance(r, 'zh'), 'zh');
  const place = bookPlace(r, 'zh');
  assert.equal(place.hui, 'h04');
  assert.equal(place.at, r.items[0].beats.zh[2].at);
  const html = readChipHtml({ words: WORDS.zh, lang: 'zh', reading: r });
  const href = new URLSearchParams(html.match(/href="read\.html\?([^"]*)"/)[1].replace(/&amp;/g, '&'));
  assert.equal(href.get('ch'), 'h04');
  assert.equal(href.get('at'), place.at);
  // Nothing told: the chip opens the book as before.
  assert.doesNotMatch(readChipHtml({ words: WORDS.zh, lang: 'zh', reading: null }), /[?&](ch|at)=/);
  // An uncondensed beat sends its own words; a catch-up its 回 alone.
  assert.equal(bookPlace({ items: [{ of: 'scene', id: 'x', hui: 'h01', beats: { zh: [{ text: '马三来了。' }] } }], i: 0, j: 0 }, 'zh').at, '马三来了');
  assert.deepEqual(bookPlace({ items: [{ of: 'catchup', id: 'catchup', hui: 'h01', beats: { zh: [{ text: '前情。', recap: true }] } }], i: 0, j: 0 }, 'zh'), { hui: 'h01' });
  // read.js finds the paragraph by the same words, and keeps `at` off every link it makes.
  const read = fs.readFileSync(path.join(ROOT, 'scripts/read.js'), 'utf8');
  assert.match(read, /if \(params\.get\('at'\)\) openAt\(params\.get\('at'\)\);/);
  assert.match(read, /q\.delete\('at'\)/);
});

test('rhythm counts the cut, never the book\'s passage beside it', () => {
  const ch = content.chapters['00-prologue'];
  const swollen = { ...ch, scenes: Object.fromEntries(Object.entries(ch.scenes).map(([id, sc]) => [id, sc.story_full ? { ...sc, story_full: { zh: sc.story_full.zh.repeat(5), en: '' } } : sc])) };
  assert.deepEqual(stretchesOf(swollen), stretchesOf(ch));
});
