// 底册 · 看完烧了 (setpieces/diche.js): 古六's wm-laba, the page 阿禾 slipped under his bowl, burnt at the 灶口. The
// 底册 board (read each line twice, burn it) became a short 大场面 under the standing rule Hanli approved 2026-10-19:
// it plays AT the book's own sentence (`{景=diche}`, the page's beatPiece), at its own pace (~4 s); the words wait for
// it (「黑了」 as the paper curls); 跳过 stops at it; reduced motion and no WebGL show its last frame; painted, not drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { resolve, task, win } from '../scripts/rules.mjs';
import { playOf, tellOf } from '../scripts/rules/tell.mjs';
import { advance, current, emptyReading, fitMode, modeAt, withTold } from '../scripts/dialogue.js';
import { screensOf } from '../scripts/lines.js';
import { beatStepper } from '../scripts/setpiece.js';
import * as D from '../scripts/setpieces/diche.js';
import { TO_OPEN, walk } from './prologue.mjs';
import { earnedFor } from './earn.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = loadContent();
const NOW = new Date('2026-10-19T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const BOOK = { zh: read('story/jiuding-lu/06-第六回.md'), en: read('story/jiuding-lu/en/h08.md') };
const scene = content.chapters['00-waimen'].scenes['wm-laba'];
const PIECE = /\{景=([a-z]+)\}/g;

/* 古六's eve walked into 腊八: the passages owed at wm-laba, as the page plays them. */
function atLaba(lang) {
  let s = { ...walk(newState(content, lang, NOW), TO_OPEN, content, NOW), stamina: 100, stamina_at: NOW.toISOString() };
  s = { ...s, scene: 'wm-zhaojing', place: 'waimen', step: 4, progress: 0, done_scenes: ['wm-ahe', 'wm-chu', 'wm-qianye'], tell_owed: [] };
  for (const id of ['zhaojing-mirror']) {
    s = win({ ...s, tasks: { [id]: { status: 'offered' }, ...s.tasks } }, content, ctx(), { id }).state;
    s = task(s, content, ctx(), { action: 'done', id }).state;
  }
  const out = resolve(earnedFor(content, s, 'sleep'), content, ctx(), { exit: 'sleep' });
  assert.equal(out.result.ok, true, JSON.stringify(out.result).slice(0, 200));
  s = out.state;
  assert.equal(s.scene, 'wm-laba');
  return { s, tell: playOf(content, s, tellOf(content, s).tell) };
}
function readingAt(lang) {
  const { s, tell } = atLaba(lang);
  let r = withTold(emptyReading('wm-zhaojing'), tell, s.scene);
  for (let k = 0; k < 200 && current(r, lang).beat.piece !== 'diche'; k += 1) r = advance(r, lang);
  return r;
}

test('the line is the book\'s, verbatim (zh 06-第六回.md, en h08.md); the title names the moment', () => {
  for (const lang of ['zh', 'en']) assert.ok(BOOK[lang].includes(D.BEATS[0].line[lang]), `${lang}: 「${D.BEATS[0].line[lang]}」`);
  assert.deepEqual(D.BEATS.map((b) => b.id), ['shao']);
  assert.equal(D.TITLE.zh, '看完烧了');
});

test('the scene marks the book\'s own sentence, zh and en, in the book\'s passage the box plays', () => {
  for (const lang of ['zh', 'en']) {
    for (const field of ['story']) {
      const paras = scene[field][lang].split(/\n\n+/);
      const marked = paras.filter((p) => [...p.matchAll(PIECE)].length);
      assert.equal(marked.length, 1, `${field} ${lang}: one piece`);
      assert.ok(marked[0] === paras.at(-1) && marked[0].endsWith('{景=diche}'), `${field} ${lang}: the last paragraph, its end`);
      assert.ok(marked[0].startsWith(D.BEATS[0].line[lang]), `${field} ${lang}: on the burning sentence`);
    }
  }
  assert.equal(scene.show, undefined, 'no board: the piece is the moment');
});

test('it plays at its paragraph, once; the words wait for it (「黑了」 in one sentence); 跳过 stops at it and it reads in 自动', () => {
  for (const lang of ['zh', 'en']) {
    const { s, tell } = atLaba(lang);
    for (const t of tell) for (const b of t.beats[lang]) assert.doesNotMatch(b.text, /景=/, `${t.id}: the words only`);
    const got = tell.flatMap((t) => t.beats[lang].map((b) => b.piece)).filter(Boolean);
    assert.deepEqual(got, ['diche'], lang);
    const r = readingAt(lang);
    const beat = current(r, lang).beat;
    assert.equal(beat.piece, 'diche');
    for (const c of D.CUES) assert.equal(screensOf(beat.text, lang).flat().filter((x) => x.includes(c.text[lang])).length, 1, `${lang}: 「${c.text[lang]}」`);
    // 跳过 from the passage's first beat stops at the piece; there it reads in 自动.
    const start = { ...withTold(emptyReading('wm-zhaojing'), tell, s.scene) };
    const sk = fitMode({ ...start, i: tell.findIndex((t) => t.of === 'scene' && t.id === 'wm-laba'), j: 0 }, 'skip', { lang });
    assert.equal(current(sk, lang).beat.piece, 'diche', `${lang}: 跳过 stops at the burning`);
    assert.equal(modeAt(sk, 'fast', lang), 'mid', `${lang}: a piece's beat reads in 自动`);
  }
});

test('its own pace: ~4 s, never the words\' speed; the curl is cued after the page reaches the fire', () => {
  const end = D.BEATS.reduce((a, b) => a + b.ms, 0) / 1000;
  assert.ok(end >= 3 && end <= 4.5, `${end} s`);
  assert.doesNotMatch(read('scripts/setpieces/diche.js'), /SPEEDS|lines\.js/);
  for (const lang of ['zh', 'en']) assert.equal(D.tempoOf(lang), 1);
  assert.ok(D.CUES[0].t > 2.85 && D.CUES[0].t < end, 'the paper curls before 「黑了」 comes up');
  const st = beatStepper(D.BEATS);
  assert.deepEqual([st.start(), st.ended(), st.tap()], [{ start: 0 }, { hold: 0 }, { done: true }]);
});

test('painted, not drawn: every picture on disk at its size; the page keeps above the words and inside the frame at 1440 and 390', async () => {
  for (const [k, p] of Object.entries(D.ART)) assert.ok(fs.existsSync(path.join(ROOT, 'worlds/jiuding', p)), `${k} ${p} is on disk`);
  const src = read('scripts/setpieces/diche.js');
  assert.doesNotMatch(src, /\.(ellipse|circle|moveTo|lineTo|bezierCurveTo|quadraticCurveTo|poly|roundRect|arc)\(/, 'no shapes drawn');
  assert.doesNotMatch(src, /\bgsap\.(to|from|fromTo|timeline|delayedCall)\(/, 'every tween in the bag');
  assert.match(src, /destroy\(\) \{\s*bag\.killAll\(\);/);
  const credits = read('worlds/jiuding/art/CREDITS.md');
  for (const p of Object.values(D.ART)) assert.ok(credits.includes(path.basename(p)), `${p} credited`);
  for (const [w, h] of [[1440, 810], [390, 760]]) {
    const W = 1000, H = Math.round(W * h / w), L = D.layout(W, H);
    assert.ok(L.y - L.h / 2 > 0 && L.y + L.h / 2 < H * 0.72, `${w}: the page above the words (${((L.y + L.h / 2) / H).toFixed(2)})`);
    assert.ok(L.x > 0 && L.x < W && L.mouth[0] > 0 && L.mouth[0] < W && L.mouth[1] < H * 0.72, `${w}: the stove mouth in the frame, above the words`);
  }
  // No WebGL: the stove mouth where the camera ends, the painting only.
  for (const [W, H] of [[1000, 562], [1000, 2050]]) {
    const v = D.stillSvg('shao', { W, H });
    assert.ok(v.includes(D.ART.zao));
    assert.doesNotMatch(v, /<text|<path|<circle|<ellipse/);
  }
});
