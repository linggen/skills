// 青丘之主 and 腾云 (setpieces/yaowang.js, tengyun.js): 第一回's dawn in 银叶谷 (00-yinyue). Her boast
// made visible — the moon, nine tails, the 万妖 bowing, a peak falling, the slopes flowering — cut off by
// 「那你为什么吃我的饼？」; and her little cloud that pops. Each plays AT its paragraph (`{景=id}`, the
// page's beatPiece), inside the passage, at its own pace; the words wait for it. 跳过 stops at it, 全文's column
// ends before it (it reads in 自动), reduced motion shows its last frame, standing as long as the beat plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playOf, tellOf } from '../scripts/rules/tell.mjs';
import { advance, atLast, current, emptyReading, fitMode, modeAt, wholeBeats, withTold } from '../scripts/dialogue.js';
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
  // 二十问 · 银月 (2026-10-22) stands between the boast and the cloud: played, the rest of the dawn is owed with it.
  s = walk(s, [['win', { id: 'yinyue-what' }], ['task', { action: 'done', id: 'yinyue-what' }]], content, NOW);
  return { s, tell: playOf(content, s, tellOf(content, s).tell) };
}
/* The reading at the dawn's passage, walked to the beat carrying `id`. */
function readingAt(lang, id) {
  const { s, tell } = atDawn(lang);
  let r = withTold(emptyReading('00-cave'), tell, s.scene);
  for (let k = 0; k < 200 && current(r, lang).beat.piece !== id; k += 1) r = advance(r, lang);
  return r;
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
      // The dawn's passage runs across 二十问's board (10-22): the boast before it, the cloud after (`story_after`).
      const whole = `${scene[field][lang]}\n\n${scene[field === 'story' ? 'story_after' : 'story_after_full'][lang]}`;
      const marked = whole.split(/\n\n+/).map((p, k) => [k, [...p.matchAll(PIECE)].map((m) => m[1])]).filter(([, ids]) => ids.length);
      assert.deepEqual(marked.map(([, ids]) => ids.join()), ['yaowang', 'tengyun'], `${field} ${lang}: the boast first, then the cloud`);
    }
    const paras = `${scene.story[lang]}\n\n${scene.story_after[lang]}`.split(/\n\n+/);
    const boast = paras.find((p) => p.includes('{景=yaowang}')), cloud = paras.find((p) => p.includes('{景=tengyun}'));
    assert.match(boast, lang === 'zh' ? /本王乃青丘之主[\s\S]*——饿了。」\{景=yaowang\}$/ : /Lady of Qingqiu[\s\S]*I was hungry\."\{景=yaowang\}$/);
    assert.match(cloud, lang === 'zh' ? /腾起一团白蒙蒙的云气[\s\S]*「噗」的一声，散了/ : /a puff of milky cloud[\s\S]*\*pff\*/);
    assert.ok(checkJieben(scene.story[lang], scene.story_full[lang], lang).ok, `${lang}: the 节本 still keeps the book's words`);
    assert.ok(checkJieben(scene.story_after[lang], scene.story_after_full[lang], lang).ok, `${lang}: and after the board`);
  }
});

test('each plays at its own paragraph of the dawn\'s passage, once, and nowhere else', () => {
  for (const lang of ['zh', 'en']) {
    const { s, tell } = atDawn(lang);
    for (const t of tell) for (const b of t.beats[lang]) assert.doesNotMatch(b.text, /景=/, `${t.id}: the words only`);
    const dawn = tell.findIndex((t) => t.of === 'scene' && t.id === '00-yinyue');
    assert.ok(dawn >= 0);
    const after = tell.findIndex((t) => t.of === 'after' && t.id === '00-yinyue/after');
    assert.ok(after > dawn, 'the rest of the dawn after 二十问');
    const where = { yaowang: [dawn, scene.story[lang]], tengyun: [after, scene.story_after[lang]] };
    const want = ['yaowang', 'tengyun'].map((id) => [where[id][0], where[id][1].split(/\n\n+/).findIndex((p) => p.includes(`{景=${id}}`)), id]);
    const got = tell.flatMap((t, i) => t.beats[lang].map((b, j) => [i, j, b.piece])).filter(([, , p]) => p);
    assert.deepEqual(got, want, lang);
    // Walking the reading: the boast's beat comes before the cloud's, each once.
    let r = withTold(emptyReading('00-cave'), tell, s.scene);
    const seen = [];
    for (let k = 0; k < 400 && !r.closed; k += 1) { const p = current(r, lang).beat.piece; if (p) seen.push(p); r = advance(r, lang); }
    assert.deepEqual(seen, ['yaowang', 'tengyun'], lang);
  }
});

/* The piece's clock (s): where each beat starts as it plays — its own pace (`TEMPO`), never the words'. */
function pieceClock(P, lang) {
  const k = P.tempoOf(lang) / P.tempoOf('zh'), out = {};
  let t = 0;
  for (const b of P.BEATS) { out[b.id] = t; t += (b.ms / 1000) * k + (b.hold ?? 0) / 1000; }
  return { start: out, end: t - ((P.BEATS.at(-1).hold ?? 0) / 1000), tempo: P.tempoOf(lang) };
}
/* When each sentence comes up at 自动 with the piece under it: its reading pace, but never before the piece
   reached its cue (lingjing.js pieceGate) — and when the beat may end (the piece's last frame up). */
function shown(P, text, lang) {
  const clk = pieceClock(P, lang), f = SPEEDS.mid, out = [];
  let t = 0.5 * f;
  for (const screen of screensOf(text, lang)) {
    screen.forEach((s, i) => {
      const cue = P.CUES.find((c) => s.includes(c.text[lang]));
      if (cue) t = Math.max(t, clk.start[cue.beat] + (cue.t === 'end' ? 0 : cue.t * clk.tempo));
      out.push([t, s]);
      t += paceOf(s, { f, last: i === screen.length - 1, lang }) / 1000;
    });
  }
  return { out, ends: Math.max(t, clk.end), clk };
}

test('each plays at its own pace, apart from 自动\'s speed: the vision ~9 s before the cut, the cloud ~6 s', () => {
  for (const P of [Y, T]) assert.doesNotMatch(read(`scripts/setpieces/${P === Y ? 'yaowang' : 'tengyun'}.js`), /SPEEDS|lines\.js/, 'not tied to the words\' speed');
  for (const lang of ['zh', 'en']) {
    const y = pieceClock(Y, lang), t = pieceClock(T, lang);
    assert.ok(y.start.cut >= 8 && y.start.cut <= 12, `${lang}: the vision ${y.start.cut.toFixed(1)} s before the cut`);
    assert.ok(t.end >= 4 && t.end <= 7, `${lang}: the cloud ${t.end.toFixed(1)} s`);
  }
});

test('the words wait for the picture: 「统御万妖」 with the 万妖, 「——饿了」 right after the cut; the cloud\'s 「扑通」 as she lands', () => {
  for (const lang of ['zh', 'en']) {
    for (const [id, P] of Object.entries(PIECES)) {
      const beat = current(readingAt(lang, id), lang).beat;
      // Every cue is in one sentence of the game's paragraph.
      for (const c of P.CUES) assert.equal(screensOf(beat.text, lang).flat().filter((s) => s.includes(c.text[lang])).length, 1, `${id} ${lang}: 「${c.text[lang]}」 in one sentence`);
    }
    const { out, clk, ends } = shown(Y, current(readingAt(lang, 'yaowang'), lang).beat.text, lang);
    const hungry = at(out, lang === 'zh' ? /饿了/ : /hungry/), cutDone = clk.start.cut + (1.2 + 0.1) * clk.tempo;
    assert.ok(hungry >= cutDone && hungry < cutDone + 0.3, `${lang}: 「饿了」 at ${hungry.toFixed(1)} s, the cave back at ${cutDone.toFixed(1)} s`);
    assert.ok(hungry >= 8 && hungry <= 13, `${lang}: the punchline ${hungry.toFixed(1)} s in`);
    assert.ok(ends >= clk.end, `${lang}: the paragraph ends after the piece's last frame`);
    const c = shown(T, current(readingAt(lang, 'tengyun'), lang).beat.text, lang);
    const land = at(c.out, lang === 'zh' ? /扑通/ : /thump/);
    assert.ok(land >= c.clk.end - 2.5 && land <= c.clk.end + 0.5, `${lang}: 「扑通」 at ${land.toFixed(1)} s, the cloud ends ${c.clk.end.toFixed(1)} s`);
  }
  // The page: the clock's gate is the piece's, a tap during it brings its last frame, the paragraph waits for it.
  assert.match(page, /gate: pieceGate/);
  // A tap at the words' wait does nothing; a double tap brings the last frame.
  assert.match(page, /if \(piecePlays\(\)\) \{\n\s+if \(lines\.key && \$\('dlg'\)\?\.querySelector\('\.story'\) && lines\.tap\(\)\) return;\n\s+const now = performance\.now\(\);\n\s+if \(now - gateTapAt < DOUBLE_TAP_MS\) \{ gateTapAt = 0; pieceToEnd\(\); \} else gateTapAt = now;/);
  assert.match(read('scripts/story.css'), /\.story \{[^}]*touch-action: manipulation;/, 'a double tap never zooms');
  assert.match(page, /const held = piecePlays\(\) \|\|/);
  assert.match(runner, /get ended\(\) \{ return lastBeat\(\); \}/);
});

test('跳过 skips words only: it stops at each piece\'s beat; 全文\'s column ends before it and the piece reads in 自动', () => {
  for (const lang of ['zh', 'en']) {
    const { s, tell } = atDawn(lang);
    let r = withTold(emptyReading('00-cave'), tell, s.scene);
    r = { ...r, i: tell.findIndex((t) => t.of === 'scene' && t.id === '00-yinyue'), j: 0 };
    // 跳过 from the passage's first beat: onto the boast, then onto the cloud, then the end.
    const s1 = fitMode(r, 'skip', { lang });
    assert.equal(current(s1, lang).beat.piece, 'yaowang', `${lang}: 跳过 stops at the boast`);
    assert.equal(s1.all, null, `${lang}: from its first word, not shown whole`);
    assert.equal(modeAt(s1, 'fast', lang), 'mid', `${lang}: a piece's beat reads in 自动`);
    assert.equal(fitMode(s1, 'fast', { lang }), s1, `${lang}: 全文 leaves the piece's beat in 自动`);
    const s2 = fitMode(s1, 'skip', { lang });
    assert.equal(current(s2, lang).beat.piece, 'tengyun', `${lang}: then at the cloud`);
    const s3 = fitMode(s2, 'skip', { lang });
    assert.ok(atLast(s3, lang) && !current(s3, lang).beat.piece, `${lang}: then the end`);
    // 全文: the column runs up to the beat before the boast; on from it, the beat after the boast up to before the cloud.
    const w1 = fitMode(r, 'fast', { lang });
    assert.ok(w1.all?.whole && !wholeBeats(w1, lang).some((b) => b.piece), `${lang}: no piece in the column`);
    assert.equal(current(advance(w1, lang), lang).beat.piece, 'yaowang', `${lang}: 接着往下 → the boast's beat`);
    const w2 = fitMode(advance(s1, lang), 'fast', { lang });
    assert.ok(!wholeBeats(w2, lang).some((b) => b.piece) && current(advance(w2, lang), lang).beat.piece === 'tengyun', `${lang}: and so for the cloud`);
    // A column kept from before (a reload) over the boast is cut where it stands.
    const kept = { ...r, all: { i: r.i, j: 0, whole: true }, i: s3.i, j: s3.j };
    assert.ok(!wholeBeats(fitMode(kept, 'fast', { lang }), lang).some((b) => b.piece), `${lang}: a kept column cut before the piece`);
  }
  // The page drops the piece when the beat on show carries none, and plays it only where the story shows it.
  const fn = page.slice(page.indexOf('function beatPiece('), page.indexOf('function beatPiece(') + 900);
  assert.match(fn, /if \(!beat\?\.piece \|\| beat\.recap\) return dropBeatPiece\(\);/);
  assert.doesNotMatch(fn, /yaowang|tengyun|00-yinyue/, 'no scene or piece named in code');
  assert.match(page, /function skipPassage\(\) \{\n[^\n]*\n  if \(piecePlays\(\)\) \{ pieceToEnd\(\); return; \}/, '跳过 during a piece: its last frame');
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

test('a tall frame (a phone) gets a range between the far and the near, so no paper shows between them; a wide one none', () => {
  assert.equal(Y.layout(1000, 625).mid, null);
  for (const H of [1500, 1895, 2164]) {
    const L = Y.layout(1000, H), m = L.mid;
    assert.ok(m, `H ${H}`);
    const farFoot = L.far.y - L.far.h * L.far.ay + L.far.h * 0.88; // the far range's misty foot
    const midPeaks = m.y - m.h * m.ay + m.h * 0.4, midFoot = m.y - m.h * m.ay + m.h * 0.88;
    const nearValley = L.near.y - L.near.h * L.near.ay + L.near.h * 0.55;
    assert.ok(midPeaks <= farFoot, `H ${H}: the mid range's peaks reach up past the far one's foot`);
    assert.ok(midFoot >= nearValley - 1, `H ${H}: the mid range's foot reaches the near one's valleys`);
  }
});
