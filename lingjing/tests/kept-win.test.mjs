// A board won on an empty pool is kept, not counted, until 体力 is back
// (tasks.mjs taskDone) — and the page says so, or it reads 0/1 as if nothing
// happened (his 五子 at 桑间, 2026-09-24: it looked broken). While the pool is
// empty, a board whose win costs 体力 is not dealt at all: 闭关 is offered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, bookPopHtml, cardHtml, trayHtml } from '../scripts/cards.js';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00');

test('the book: an errand\'s board won but not counted is marked kept, not a bare 0/1', () => {
  const s = { ...newState(content, 'zh', NOW), name: '清玄', traits: ['wood'], place: 'pengcheng', chapter: '02-yan', scene: null, ended: ['00-prologue', '01-ji'],
    quests: { 'xu-yunlong-herbs': { took: '2026-10-05', have: {} } }, wins: { 'alchemy-first': NOW.toISOString() } };
  const row = look(s, content, { now: NOW, quests: [] }).book.find(b => b.id === 'xu-yunlong-herbs');
  assert.deepEqual(row.need[0], { kind: 'board', have: 0, n: 1, kept: true });
  const plain = look({ ...s, wins: {} }, content, { now: NOW, quests: [] }).book.find(b => b.id === 'xu-yunlong-herbs');
  assert.equal(plain.need[0].kept, undefined);
  for (const lang of ['zh', 'en']) {
    const l = look({ ...s, lang }, content, { now: NOW, quests: [] });
    assert.ok(bookPopHtml({ look: l, lang, words: WORDS[lang] }).includes(WORDS[lang].keptWin), lang);
  }
});

const ctxOf = (tasks, empty, lang = 'zh') => ({ look: { tasks, lang }, lang, words: WORDS[lang], qi: { st: empty ? 'empty' : 'full' }, boardFor: () => null });
const wuzi = extra => ({ id: 'wuziqi', title: '五子', kind: 'board', game: 'wuziqi', status: 'offered', hosted: true, won: false, ...extra });

test('the stage and the tray: a kept win says it waits for 体力; an empty pool shuts a hosted board and offers 闭关', () => {
  for (const lang of ['zh', 'en']) {
    const w = WORDS[lang];
    assert.ok(cardHtml({ card: 'board', id: 'wuziqi' }, ctxOf([wuzi({ won: true })], true, lang)).includes(w.keptWin));
    const shut = cardHtml({ card: 'board', id: 'wuziqi' }, ctxOf([wuzi()], true, lang));
    assert.ok(shut.includes(w.emptyNoPlay) && shut.includes('data-seclude-open'), lang);
    assert.ok(!cardHtml({ card: 'board', id: 'wuziqi' }, ctxOf([wuzi()], false, lang)).includes(w.emptyNoPlay), 'a full pool deals it');
    const tray = trayHtml(ctxOf([wuzi()], true, lang));
    assert.match(tray, /data-play="wuziqi" disabled/);
    assert.ok(tray.includes(w.emptyShut));
    assert.ok(trayHtml(ctxOf([wuzi({ won: true })], true, lang)).includes(w.keptWin));
    // A story board (not hosted, not an errand's) is left alone: the scene pays it.
    assert.doesNotMatch(trayHtml(ctxOf([wuzi({ hosted: false })], true, lang)), /disabled/);
  }
});
