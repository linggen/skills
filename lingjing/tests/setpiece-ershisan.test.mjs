// 二十三下 (setpieces/ershisan.js): 古五's wm-chu, the twenty-three blows at the 秘境's stone door. The reading cap (Hanli
// 2026-10-20: 「剧情连续阅读太长的地方, 你处理一下, 看是否可以加个小游戏等」; the standing rule of 10-19): wm-kaikai → 讲堂
// read 3,811 字 without play, and no kit's verb is a reckoning — so the book's own big moment is a short 大场面. It plays AT
// the book's own paragraph (`{景=ershisan}`, the page's beatPiece), at its own pace (~4.8 s); the words wait for it
// (「二十三」 once the last tap has landed); 跳过 stops at it; reduced motion and no WebGL show its last frame; painted.
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
import { checkJieben } from '../scripts/jieben.mjs';
import { beatStepper } from '../scripts/setpiece.js';
import { stretchesOf, RHYTHM_CAP } from '../scripts/rhythm.mjs';
import * as P from '../scripts/setpieces/ershisan.js';
import { TO_OPEN, walk } from './prologue.mjs';
import { earnedFor } from './earn.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = loadContent();
const NOW = new Date('2026-10-20T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const BOOK = { zh: read('story/jiuding-lu/05-第五回.md'), en: read('story/jiuding-lu/en/h07.md') };
const scene = content.chapters['00-waimen'].scenes['wm-chu'];
const PIECE = /\{景=([a-z]+)\}/g;

/* The 秘境's second night done (息壤 · 五门 won), the way on taken: the passages owed at wm-chu, as the page plays them. */
function atChu(lang) {
  let s = { ...walk(newState(content, lang, NOW), TO_OPEN, content, NOW), stamina: 100, stamina_at: NOW.toISOString() };
  s = { ...s, scene: 'wm-kaikai', place: 'mijing-shishi', step: 2, progress: 0, done_scenes: [...(s.done_scenes ?? []), 'wm-ahe', 'wm-mijing', 'wm-wangzuo', 'wm-kunzhen', 'wm-xirang'], tell_owed: [] };
  s = win({ ...s, tasks: { 'xirang-wumen': { status: 'offered' }, ...s.tasks } }, content, ctx(), { id: 'xirang-wumen' }).state;
  s = task(s, content, ctx(), { action: 'done', id: 'xirang-wumen' }).state;
  const out = resolve(earnedFor(content, s, 'sit'), content, ctx(), { exit: 'sit' });
  assert.equal(out.result.ok, true, JSON.stringify(out.result).slice(0, 200));
  s = out.state;
  assert.equal(s.scene, 'wm-chu');
  return { s, tell: playOf(content, s, tellOf(content, s).tell) };
}
function readingAt(lang) {
  const { s, tell } = atChu(lang);
  let r = withTold(emptyReading('wm-kaikai'), tell, s.scene);
  for (let k = 0; k < 200 && current(r, lang).beat.piece !== 'ershisan'; k += 1) r = advance(r, lang);
  return r;
}

test('the line is the book\'s, verbatim (zh 05-第五回.md, en h07.md); the title names the moment; 23 blows', () => {
  for (const lang of ['zh', 'en']) assert.ok(BOOK[lang].includes(P.BEATS[0].line[lang]), `${lang}: 「${P.BEATS[0].line[lang]}」`);
  assert.deepEqual(P.BEATS.map((b) => b.id), ['shu']);
  assert.equal(P.TITLE.zh, '二十三下');
  assert.equal(P.BLOWS.length, 23);
  assert.ok(P.BLOWS.every((t, k) => !k || t > P.BLOWS[k - 1]), 'one after another');
});

test('the scene marks the book\'s own paragraph, zh and en, in the game\'s cut (the paragraph that opens on the line) and the book\'s passage (the paragraph of the count); the 节本 still keeps the book\'s words', () => {
  for (const lang of ['zh', 'en']) {
    for (const field of ['story', 'story_full']) {
      const paras = scene[field][lang].split(/\n\n+/);
      const marked = paras.filter((p) => [...p.matchAll(PIECE)].length);
      assert.equal(marked.length, 1, `${field} ${lang}: one piece`);
      assert.ok(marked[0].endsWith('{景=ershisan}'), `${field} ${lang}: at the paragraph's end`);
      assert.ok(marked[0].includes(P.CUES[0].text[lang]), `${field} ${lang}: the count's paragraph`);
    }
    assert.ok(scene.story[lang].split(/\n\n+/).find((p) => p.includes('{景=')).startsWith(P.BEATS[0].line[lang]), `${lang}: the cut's paragraph opens on the first blow`);
    assert.ok(checkJieben(scene.story[lang], scene.story_full[lang], lang).ok, lang);
  }
  assert.equal(scene.show, undefined, 'no board: the piece is the moment');
});

test('it plays at its paragraph, once; the words wait for it (「二十三」 in one sentence); 跳过 stops at it and it reads in 自动', () => {
  for (const lang of ['zh', 'en']) {
    const { s, tell } = atChu(lang);
    for (const t of tell) for (const b of t.beats[lang]) assert.doesNotMatch(b.text, /景=/, `${t.id}: the words only`);
    const got = tell.flatMap((t) => t.beats[lang].map((b) => b.piece)).filter(Boolean);
    assert.deepEqual(got, ['ershisan'], lang);
    const r = readingAt(lang);
    const beat = current(r, lang).beat;
    assert.equal(beat.piece, 'ershisan');
    for (const c of P.CUES) assert.equal(screensOf(beat.text, lang).flat().filter((x) => x.includes(c.text[lang])).length, 1, `${lang}: 「${c.text[lang]}」`);
    const start = { ...withTold(emptyReading('wm-kaikai'), tell, s.scene) };
    const sk = fitMode({ ...start, i: tell.findIndex((t) => t.of === 'scene' && t.id === 'wm-chu'), j: 0 }, 'skip', { lang });
    assert.equal(current(sk, lang).beat.piece, 'ershisan', `${lang}: 跳过 stops at the blows`);
    assert.equal(modeAt(sk, 'fast', lang), 'mid', `${lang}: a piece's beat reads in 自动`);
  }
});

test('its own pace: ~4.8 s, never the words\' speed; 「二十三」 is cued after the last tap lands', () => {
  const end = P.BEATS.reduce((a, b) => a + b.ms, 0) / 1000;
  assert.ok(end >= 4 && end <= 5.5, `${end} s`);
  assert.doesNotMatch(read('scripts/setpieces/ershisan.js'), /SPEEDS|lines\.js/);
  for (const lang of ['zh', 'en']) assert.equal(P.tempoOf(lang), 1);
  assert.ok(P.CUES[0].t > P.BLOWS.at(-1) && P.CUES[0].t < end, 'the twenty-third lands before 「二十三」 comes up');
  const st = beatStepper(P.BEATS);
  assert.deepEqual([st.start(), st.ended(), st.tap()], [{ start: 0 }, { hold: 0 }, { done: true }]);
});

test('painted, not drawn: every picture on disk at its size; the blows land above the words and inside the frame at 1440 and 390', () => {
  for (const [k, p] of Object.entries(P.ART)) assert.ok(fs.existsSync(path.join(ROOT, 'worlds/jiuding', p)), `${k} ${p} is on disk`);
  const src = read('scripts/setpieces/ershisan.js');
  assert.doesNotMatch(src, /\.(ellipse|circle|moveTo|lineTo|bezierCurveTo|quadraticCurveTo|poly|roundRect|arc)\(/, 'no shapes drawn');
  assert.doesNotMatch(src, /\bgsap\.(to|from|fromTo|timeline|delayedCall)\(/, 'every tween in the bag');
  assert.match(src, /destroy\(\) \{\s*bag\.killAll\(\);/);
  const credits = read('worlds/jiuding/art/CREDITS.md');
  for (const p of Object.values(P.ART)) assert.ok(credits.includes(path.basename(p)), `${p} credited`);
  for (const [w, h] of [[1440, 810], [390, 760]]) {
    const W = 1000, H = Math.round(W * h / w), L = P.layout(W, H);
    assert.ok(L.hit[0] > L.h && L.hit[0] < W && L.hit[1] - L.h / 2 > 0 && L.hit[1] + L.h / 2 < H * (H > W ? 0.6 : 0.72), `${w}: the blows land above the words, in the frame`);
  }
  for (const [W, H] of [[1000, 562], [1000, 2050]]) {
    const v = P.stillSvg('shu', { W, H });
    assert.ok(v.includes(P.ART.ya));
    assert.doesNotMatch(v, /<text|<path|<circle|<ellipse/);
  }
});

// 喂息珠 (wm-luobo's 割绳子) was cut 2026-10-20 with the 饭桶's old play (Hanli: 「喂饭桶那个没啥玩的好像」): the
// blows' far side reads on to 讲堂 again, over the cap (doc/games.md § 读太长) until something else breaks it.
test('the reading cap: wm-kaikai → 讲堂 (3,811 字 on 10-20) stands under the cap up to the blows; past them it runs to 讲堂', () => {
  const parts = stretchesOf(content.chapters['00-waimen']);
  const at = parts.findIndex((p) => p.to === 'wm-chu{景=ershisan}');
  assert.ok(at > 0, 'the blows are a beat');
  assert.equal(parts[at].from, 'wm-kaikai');
  assert.ok(parts[at].chars <= RHYTHM_CAP, `${parts[at].from} → ${parts[at].to}: ${parts[at].chars}`);
  assert.equal(parts[at + 1].to, 'wm-qianye');
});
