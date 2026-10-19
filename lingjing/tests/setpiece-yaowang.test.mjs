// 青丘之主 and 腾云 (setpieces/yaowang.js, tengyun.js): 第一回's dawn in 银叶谷 (00-yinyue). Her boast
// made visible — the moon, nine tails, the 万妖 bowing, a peak falling, the slopes flowering — cut off by
// 「那你为什么吃我的饼？」; and her little cloud that pops. Each plays AT its paragraph (`{景=id}`, the
// page's beatPiece), inside the passage: 全文 lays the first under the column, 跳过 skips it with the
// passage, reduced motion shows its last frame, standing as long as the beat would have played.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playOf, tellOf } from '../scripts/rules/tell.mjs';
import { advance, atLast, current, emptyReading, fitMode, wholeBeats, withTold } from '../scripts/dialogue.js';
import { paceOf, screensOf, SPEEDS } from '../scripts/lines.js';
import { checkJieben } from '../scripts/jieben.mjs';
import { beatStepper } from '../scripts/setpiece.js';
import * as Y from '../scripts/setpieces/yaowang.js';
import * as T from '../scripts/setpieces/tengyun.js';
import { TO_VALLEY, walk } from './prologue.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = loadContent();
const NOW = new Date('2026-10-16T10:00:00');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const BOOK = { zh: read('story/jiuding-lu/01-第一回.md'), en: read('story/jiuding-lu/en/h01.md') };
const page = read('scripts/lingjing.js'), runner = read('scripts/setpiece.js');
const scene = Object.values(content.chapters).flatMap((ch) => Object.values(ch.scenes ?? {})).find((sc) => sc.id === '00-yinyue');
const PIECE = /\{景=([a-z]+)\}/g;
const PIECES = { yaowang: Y, tengyun: T };

/* The prologue walked to the dawn: the passages owed there, as the page plays them. */
function atDawn(lang) {
  let s = newState(content, lang, NOW);
  s = walk(s, TO_VALLEY, content, NOW);
  assert.equal(s.scene, '00-yinyue');
  return { s, tell: playOf(content, s, tellOf(content, s).tell) };
}
/* The reading at the dawn's passage, walked to the beat carrying `id`. */
function readingAt(lang, id) {
  const { s, tell } = atDawn(lang);
  let r = withTold(emptyReading('00-cave'), tell, s.scene);
  for (let k = 0; k < 200 && current(r, lang).beat.piece !== id; k += 1) r = advance(r, lang);
  return r;
}
/* When each sentence of a beat comes up at 自动 (lines.js: the clock's lead, then each sentence's pace). */
function cues(text, lang) {
  const f = SPEEDS.mid, out = [];
  let t = 500 * f;
  for (const screen of screensOf(text, lang)) {
    screen.forEach((s, i) => { out.push([t / 1000, s]); t += paceOf(s, { f, last: i === screen.length - 1, lang }); });
    t += 420 * f;
  }
  return out;
}
const at = (cs, re) => cs.find(([, s]) => re.test(s))?.[0];

test('the lines are the book\'s, verbatim, in its order (zh 01-第一回.md, en h01.md)', () => {
  for (const [id, P] of Object.entries(PIECES)) {
    for (const lang of ['zh', 'en']) {
      let from = -1;
      for (const b of P.BEATS) {
        const k = BOOK[lang].indexOf(b.line[lang]);
        assert.ok(k >= 0, `${id}/${b.id} ${lang}: 「${b.line[lang]}」 is the book's`);
        assert.ok(k > from, `${id}/${b.id} ${lang}: after the beat before it`);
        from = k;
      }
    }
  }
  assert.deepEqual(Y.BEATS.map((b) => b.id), ['vision', 'cut']);
  assert.match(Y.BEATS[0].line.zh, /^本王乃青丘之主[\s\S]*一笑则花开——$/);
  assert.match(Y.BEATS[1].line.zh, /那你为什么吃我的饼？」她道：「——饿了。」$/);
  assert.equal(Y.TITLE.zh, '青丘之主');
  assert.equal(T.TITLE.zh, '腾云');
});

test('the scene marks the boast and the cloud, zh and en, in the game\'s cut and the book\'s passage', () => {
  for (const lang of ['zh', 'en']) {
    for (const field of ['story', 'story_full']) {
      const marked = scene[field][lang].split(/\n\n+/).map((p, k) => [k, [...p.matchAll(PIECE)].map((m) => m[1])]).filter(([, ids]) => ids.length);
      assert.deepEqual(marked.map(([, ids]) => ids.join()), ['yaowang', 'tengyun'], `${field} ${lang}: the boast first, then the cloud`);
    }
    const paras = scene.story[lang].split(/\n\n+/);
    const boast = paras.find((p) => p.includes('{景=yaowang}')), cloud = paras.find((p) => p.includes('{景=tengyun}'));
    assert.match(boast, lang === 'zh' ? /本王乃青丘之主[\s\S]*——饿了。」\{景=yaowang\}$/ : /Lady of Qingqiu[\s\S]*I was hungry\."\{景=yaowang\}$/);
    assert.match(cloud, lang === 'zh' ? /腾起一团白蒙蒙的云气[\s\S]*「噗」的一声，散了/ : /a puff of milky cloud[\s\S]*\*pff\*/);
    assert.ok(checkJieben(scene.story[lang], scene.story_full[lang], lang).ok, `${lang}: the 节本 still keeps the book's words`);
  }
});

test('each plays at its own paragraph of the dawn\'s passage, once, and nowhere else', () => {
  for (const lang of ['zh', 'en']) {
    const { s, tell } = atDawn(lang);
    for (const t of tell) for (const b of t.beats[lang]) assert.doesNotMatch(b.text, /景=/, `${t.id}: the words only`);
    const dawn = tell.findIndex((t) => t.of === 'scene' && t.id === '00-yinyue');
    assert.ok(dawn >= 0);
    const paras = scene.story[lang].split(/\n\n+/);
    const want = ['yaowang', 'tengyun'].map((id) => [dawn, paras.findIndex((p) => p.includes(`{景=${id}}`)), id]);
    const got = tell.flatMap((t, i) => t.beats[lang].map((b, j) => [i, j, b.piece])).filter(([, , p]) => p);
    assert.deepEqual(got, want, lang);
    // Walking the reading: the boast's beat comes before the cloud's, each once.
    let r = withTold(emptyReading('00-cave'), tell, s.scene);
    const seen = [];
    for (let k = 0; k < 400 && !r.closed; k += 1) { const p = current(r, lang).beat.piece; if (p) seen.push(p); r = advance(r, lang); }
    assert.deepEqual(seen, ['yaowang', 'tengyun'], lang);
  }
});

test('the vision keeps time with the words at 自动: it opens on 「本王乃…」 and the cave is back as 「——饿了」 comes up', () => {
  for (const lang of ['zh', 'en']) {
    const text = readingAt(lang, 'yaowang');
    const beat = current(text, lang).beat;
    const cs = cues(beat.text, lang);
    const boast = at(cs, lang === 'zh' ? /本王乃/ : /This queen is/), hungry = at(cs, lang === 'zh' ? /饿了/ : /hungry/);
    const tempo = Y.tempoOf(lang);
    const [vision, cut] = Y.BEATS;
    const opens = 1.3 * tempo, cutDone = (vision.ms / 1000) * tempo + vision.hold / 1000 + (cut.ms / 1000) * Math.min(1, tempo);
    assert.ok(Math.abs(opens - boast) < 0.6, `${lang}: the vision opens at ${opens.toFixed(1)} s, the boast at ${boast.toFixed(1)} s`);
    assert.ok(cutDone <= hungry + 0.5 && cutDone >= hungry - 1.5, `${lang}: the cave back at ${cutDone.toFixed(1)} s, 「饿了」 at ${hungry.toFixed(1)} s`);
    assert.ok((vision.ms / 1000) * tempo - 1.3 * tempo >= 3, `${lang}: the vision holds the whole stage for seconds, not a flash`);
  }
  // The cloud: up as she stamps, popped as 「散了」 is read, down by 「扑通」.
  const cs = cues(readingAt('zh', 'tengyun') && current(readingAt('zh', 'tengyun'), 'zh').beat.text, 'zh');
  // The piece's own marks, at its tempo (tengyun.js: the stamp at 2.2 s, the pop at 7.0 s, ×tempoOf).
  const t = T.tempoOf('zh'), stamp = 2.2 * t, pop = 7.0 * t;
  assert.ok(at(cs, /跺/) <= stamp + 0.5 && Math.abs(at(cs, /散了/) - pop) < 1.2 && at(cs, /扑通/) >= pop - 0.5, `the cloud's cues against the words: 跺 ${at(cs, /跺/).toFixed(1)}, 散了 ${at(cs, /散了/).toFixed(1)}, 扑通 ${at(cs, /扑通/).toFixed(1)}; pop ${pop.toFixed(1)}`);
});

test('跳过 skips the piece with the passage; 全文 lays the boast under the column', () => {
  for (const lang of ['zh', 'en']) {
    const r = readingAt(lang, 'yaowang');
    assert.equal(current(r, lang).beat.piece, 'yaowang');
    const skipped = fitMode(r, 'skip', { lang });
    assert.ok(atLast(skipped, lang) || skipped.closed || skipped.i > r.i, `${lang}: 跳过 goes to the passage's end`);
    assert.equal(current(skipped, lang).beat.piece, undefined, `${lang}: no piece on the beat it stands on`);
    const whole = fitMode(r, 'fast', { lang });
    assert.equal(wholeBeats(whole, lang).find((b) => b.piece && !b.recap)?.piece, 'yaowang', `${lang}: the column's first piece`);
  }
  // The page drops the piece when the beat on show carries none (跳过's last beat), and plays it only where the story shows it.
  const fn = page.slice(page.indexOf('function beatPiece('), page.indexOf('function beatPiece(') + 900);
  assert.match(fn, /if \(!beat\?\.piece \|\| beat\.recap\) return dropBeatPiece\(\);/);
  assert.doesNotMatch(fn, /yaowang|tengyun|00-yinyue/, 'no scene or piece named in code');
});

test('reduced motion: the last frame, standing as long as the beat would play', () => {
  const lay = page.slice(page.indexOf('async function layBeatPiece('), page.indexOf('async function layBeatPiece(') + 1200);
  assert.match(lay, /still: still \|\| stillMotion\(\)/);
  assert.match(page, /const stillMotion = \(\) => window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches;/);
  assert.match(runner, /if \(still\) tl\.progress\(1\); else tl\.play\(\);/, 'still: each beat jumps to its last frame');
  assert.match(runner, /b\.hold != null \? b\.hold \+ \(still \|\| !scene \? b\.ms : 0\)/, 'and the vision\'s still stands its length before the cut');
  // The beats run as the stepper says: vision, held, cut, done.
  const st = beatStepper(Y.BEATS);
  assert.deepEqual([st.start(), st.ended(), st.tap(), st.ended(), st.tap()], [{ start: 0 }, { hold: 0 }, { start: 1 }, { hold: 1 }, { done: true }]);
  // No WebGL: the stills are the paintings, composed where the beat ends — at a desk's width and a phone's.
  for (const [W, H] of [[1000, 562], [1000, 2050]]) {
    const v = Y.stillSvg('vision', { W, H });
    assert.equal((v.match(new RegExp(Y.ART.tail, 'g')) ?? []).length, 9, 'nine tails');
    for (const k of ['sky', 'moon', 'ridge', 'yao', 'peak', 'flower']) assert.ok(v.includes(Y.ART[k]), `${k} in the vision's still`);
    assert.ok(!v.includes(Y.ART.cave), 'the vision\'s still is the vision');
    assert.ok(Y.stillSvg('cut', { W, H }).includes(Y.ART.cave), 'the cut\'s still is the cave mouth');
    const c = T.stillSvg('yun', { W, H });
    assert.ok(c.includes(T.ART.sit) && c.includes(T.ART.ring) && !c.includes(T.ART.stand) && !c.includes(T.ART.cloud), 'sat down in the lit rings, the cloud gone');
    for (const s of [v, c]) assert.doesNotMatch(s, /<text|<path|<circle|<ellipse/, 'paintings only');
  }
});

test('painted, not drawn: every picture on disk at its size; the fan fits the frame at 1440 and at 390', () => {
  for (const [id, P] of Object.entries(PIECES)) {
    for (const [k, p] of Object.entries(P.ART)) assert.ok(fs.existsSync(path.join(ROOT, 'worlds/jiuding', p)), `${id}: ${k} ${p} is on disk`);
    const src = read(`scripts/setpieces/${id}.js`);
    assert.doesNotMatch(src, /\.(ellipse|circle|moveTo|lineTo|bezierCurveTo|quadraticCurveTo|poly|roundRect|arc)\(/, `${id}: no shapes drawn`);
    assert.doesNotMatch(src, /\bgsap\.(to|from|fromTo|timeline|delayedCall)\(/, `${id}: every tween in the bag`);
    assert.match(src, /destroy\(\) \{\s*bag\.killAll\(\);/);
  }
  assert.equal(Y.TAILS.length, 9, 'nine tails, one painting laid nine times');
  for (const [w, h] of [[1440, 810], [390, 760]]) {
    const W = 1000, H = Math.round(W * h / w), L = Y.layout(W, H);
    for (const t of L.tails) {
      const tipX = t.x + Math.sin(t.rot) * t.len, tipY = t.y - Math.cos(t.rot) * t.len;
      assert.ok(tipX > -W * 0.02 && tipX < W * 1.02 && tipY > 0, `${w}: a tail's tip inside the frame (${tipX.toFixed(0)}, ${tipY.toFixed(0)})`);
    }
    assert.ok(L.moon.y - L.moon.d / 2 > 0, `${w}: the whole moon in the sky`);
    assert.ok(L.near.y + L.near.h * (1 - L.near.ay) >= H, `${w}: the near ridges reach the foot of the frame`);
    const C = T.layout(W, H);
    assert.ok(C.y - C.h - C.rise > 0 && C.y < H, `${w}: she stays in the frame at the top of her rise`);
    // In the game the beat's words stand over the stage's lower third: what the boast and the cloud show keeps above it.
    for (const f of L.flowers) assert.ok(f.y < H * 0.8, `${w}: the flowers above the words (${(f.y / H).toFixed(2)})`);
    assert.ok(L.moon.x > W * 0.6, `${w}: the moon clear of the piece's name in the left corner`);
    assert.ok(C.y <= H * 0.72, `${w}: her feet above the words (${(C.y / H).toFixed(2)})`);
  }
});
