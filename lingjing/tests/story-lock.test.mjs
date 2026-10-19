// The passage holds the page (Hanli, 2026-10-16: 「读剧情, 可以简单点, 把其他都lock, 玩家读完或跳过才能继续」)
// and the three ways to read (自动 · 全文 · 跳过, over 慢 · 中 · 快): while a passage is on the stage and not
// at its end, the footer's chips and roads, the header's cards and the tray are dimmed and do nothing;
// 跳过 is always in the story's own control; a reload opens on the same beat and the same page, and
// no passage is lost (2026-09-29: owed passages lost when only the scene's story replayed).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { advance, atLast, choicesUp, fitMode, keepReading, loadReading, logHtml, playing, storyHolds, storyHtml, withTold } from '../scripts/dialogue.js';
import { createPager } from '../scripts/pager.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const beats = (n, at = 'a') => Array.from({ length: n }, (_, k) => ({ text: `${at}${k}。` }));
const reading = () => withTold(null, [{ of: 'choice', id: 's0/go', beats: beats(3, 'x') }, { of: 'scene', id: 's1', beats: beats(4, 'y') }], 's1', 'run1');

test('locked while the passage plays; live once read to its end, skipped, or put away — and while not on the stage', () => {
  let r = reading();
  assert.equal(storyHolds(r), true);
  for (let k = 0; k < 5; k += 1) { r = advance(r); assert.equal(storyHolds(r), true, `beat ${k + 1}: still held`); }
  r = advance(r);
  assert.ok(atLast(r) && choicesUp(r));
  assert.equal(storyHolds(r), false, 'its last beat, the choices up: live');
  assert.equal(storyHolds(fitMode(reading(), 'skip')), false, '跳过: live at once');
  assert.equal(storyHolds(reading(), { shown: false }), false, 'a board or a fight over it: nothing held');
  const w = fitMode(reading(), 'fast');
  assert.equal(storyHolds(w, { lastPage: false }), true, '全文: held until its last page');
  assert.equal(storyHolds(w, { lastPage: true }), false);
});

test('跳过 is in the control on every beat, whatever way he reads, and it never loses a passage', () => {
  for (const speed of ['mid', 'fast', 'skip']) {
    let r = reading();
    for (let k = 0; k < 7; k += 1, r = advance(r)) assert.match(storyHtml(r, { speed }), /<button data-dlg-speed="skip"[^>]*>跳过<\/button>/, `${speed}, beat ${k}`);
  }
  const s = fitMode(reading(), 'skip');
  assert.ok(playing(s) && atLast(s) && choicesUp(s), 'straight to the end, the choices up');
  assert.match(logHtml(s), /x0。[\s\S]*x2。[\s\S]*y0。[\s\S]*y3。/, 'every beat of both passages in 回看');
});

test('a reload resumes the same beat (the reading, per save) and the same 全文 page (pager keep)', () => {
  const store = memStore();
  const r = advance(advance(advance(reading())));
  keepReading('rs', r, store);
  const back = loadReading('rs', store);
  assert.deepEqual([back.i, back.j, back.items.length, back.scene, back.run], [r.i, r.j, 2, 's1', 'run1'], 'the same passage, the same beat, nothing dropped');
  assert.equal(loadReading('other', store), null, 'per save');

  // The pager: a column of 6 sentences, 2 to a page; turned to page 2, then a fresh page (a reload) opens there.
  const kept = new Map(), keep = { load: (k) => kept.get(k) ?? null, save: (k, p) => kept.set(k, p) };
  const one = () => {
    const pager = createPager({ keep });
    pager.sync(fakeStory('k1'));
    return pager;
  };
  globalThis.getComputedStyle = () => ({ paddingTop: '0', paddingBottom: '0' });
  const a = one();
  assert.equal(a.pages, 3);
  assert.equal(a.page, 0);
  a.turn(1);
  assert.equal(kept.get('k1'), 1);
  const b = one();
  assert.equal(b.page, 1, 'reopened on the page he was on');
  const c = createPager({ keep });
  c.sync(fakeStory('k2'));
  assert.equal(c.page, 0, 'another passage opens on its first page');
});

test('the page wires it: the guard, what it locks, its calls, its look, the hint', () => {
  const js = src('lingjing.js'), css = src('story.css');
  assert.match(js, /const STORY_LOCKED = '#footRow, #footChips, #headCards, \.tray';/);
  assert.match(js, /document\.addEventListener\('click', \(e\) => \{\n {2}if \(!document\.body\.classList\.contains\('storylock'\) \|\| !e\.target\.closest\?\.\(STORY_LOCKED\)\) return;\n {2}e\.preventDefault\(\);\n {2}e\.stopImmediatePropagation\(\);/, 'a tap there does nothing else');
  assert.match(js, /\}, \{ capture: true \}\);/, 'caught before the page\'s own click list');
  assert.match(js, /pager\.sync\(el\);\n {2}syncLock\(\);/, 'after every paint of the story');
  assert.match(js, /onPage: \(\) => \{ pageSight\(\); syncLock\(\); \}, keep: pageStore/, 'and every page turned; the page kept');
  assert.match(js, /const next = fitMode\(r, mode, \{ lang: lang\(\), at: beatInView\(\) \}\);/, 'the passage fitted to the way he reads before the paint');
  assert.match(css, /body\.storylock :is\(#footRow, #footChips, #headCards, \.tray\) \{ opacity: \.4;/, 'dimmed, never hidden or disabled');
  assert.match(css, /\.slotfoot > \.lockhint \{/);
  assert.doesNotMatch(js, /\[data-dlg-all\]/, 'no 跳过 of its own: it is in the control');
  assert.match(js, /lines\.sync\(null\); pager\.sync\(null\); syncLock\(\); return;/, 'a passage gone from the stage lets the page go');
  assert.match(js, /holdLing\(on\);/, 'and Ling\'s hands with it (rules/reading.mjs)');
  assert.match(js, /verb\('reading', \{ hold: on \? 1 : 0 \}\)\.then\(\(r\) => \{ back\(\); if \(!on && r\?\.held\) report\('\[scene\] read'\); \}\)/, 'held meanwhile, she hears [scene] read');
  // 银月 into the 木牌 with the hold, out once the rules answered its end (Hanli, 2026-10-19).
  assert.match(js, /if \(on && !presenceHeld\) \{ presenceHeld = true;/);
});

/* A story element with a 全文 column of six one-line sentences, 40px each, in a 90px band. */
function fakeStory(key) {
  const cls = () => { const s = new Set(); return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), toggle: (c, on) => (on ? s.add(c) : s.delete(c)), contains: (c) => s.has(c) }; };
  const rect = (top, h) => ({ top, bottom: top + h, left: 0, right: 100, width: 100, height: h });
  const sents = [], lines = [];
  for (let p = 0; p < 3; p += 1) {
    const ss = [0, 1].map((k) => ({ classList: cls(), getClientRects: () => [rect((p * 2 + k) * 40, 40)] }));
    sents.push(...ss);
    lines.push({ classList: cls(), dataset: {}, getBoundingClientRect: () => rect(p * 80, 80), querySelectorAll: () => ss });
  }
  const text = { getBoundingClientRect: () => rect(0, 240), querySelectorAll: () => lines };
  const pgn = { textContent: '' }, prev = { disabled: false }, next = { disabled: false };
  const pagerEl = { hidden: true, querySelector: (q) => (q === '.pgn' ? pgn : q.includes('-1') ? prev : next) };
  const story = { dataset: { story: key }, classList: cls(), querySelector: (q) => (q === '.wholecol' ? col : q === '.pager' ? pagerEl : null) };
  const col = {
    isConnected: true, clientWidth: 300, clientHeight: 94, scrollHeight: 94, scrollTop: 0, classList: cls(),
    querySelector: (q) => (q === '.wholetext' ? text : null),
    querySelectorAll: (q) => (q.includes('.line') && !q.includes('data-') ? lines.filter((l) => !q.includes(':not(.pg-off)') || !l.classList.contains('pg-off')) : []),
    closest: () => story,
  };
  return story;
}
