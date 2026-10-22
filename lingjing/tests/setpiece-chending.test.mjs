// 沉鼎山 (setpieces/chending.js): the first sight of the mountain plays AT its paragraph —
// 00-gate's 「沉鼎山并不怎么高，只是陡。…小满张着嘴，半天合不上。」 — never before the 回's turn
// (今 · 一 · 完, 第三回's seal) or the passage's beat before it (the 节本's first, since 2026-10-14).
//
// An exit's `setpiece` is the picture of a choice: it plays after that choice's passage and
// before the next scene's (lingjing.js pieceAhead) — on 00-notice/go it would have played
// before 今 · 一, on j01-retest/finish before 第三回's first beat. So the scene passage marks
// the paragraph itself, `{景=chending}`, zh and en (rules/tell.mjs beatsOf `piece`), and the
// page plays the piece when the box comes to that beat (lingjing.js beatPiece), in the box's
// place. One mechanism for any scene; no scene is named in code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { resolve, task, win } from '../scripts/rules.mjs';
import { passageFor, playOf, tellOf } from '../scripts/rules/tell.mjs';
import { advance, current, emptyReading, withTold } from '../scripts/dialogue.js';
import { atTurn, boxGivesWay } from '../scripts/queue.js';
import { checkJieben } from '../scripts/jieben.mjs';
import { ART, ASPECT, BEATS, MARKS, SHOTS, TITLE, camSeconds, stillSvg } from '../scripts/setpieces/chending.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00');
const ctx = { now: NOW, quests: [] };
const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
const piece = fs.readFileSync(path.join(ROOT, 'scripts/setpieces/chending.js'), 'utf8');
const scenes = Object.values(content.chapters).flatMap((ch) => Object.values(ch.scenes ?? {}));
const PIECE = /\{景=([a-z]+)\}/g;

/* 古二's last choice → 今 · 一 → its game won → 古三's gate, as a save walks it. */
function atGate(lang) {
  let s = { ...newState(content, lang, NOW), chapter: '00-prologue', scene: '00-notice', place: 'shiao', done_scenes: ['00-uncle'] };
  s = { ...s, tasks: { ...s.tasks, 'notice-shuitong': { status: 'done' } } }; // 水桶落井 played (2026-10-20)
  s = resolve(s, content, ctx, { exit: 'go' }).state;
  // 今一's dawn run (边跑边念, 2026-10-20) is played before the track's way on
  s = win(s, content, ctx, { id: 'jin-toulan' }).state;
  s = task(s, content, ctx, { action: 'done', id: 'jin-toulan' }).state;
  s = resolve(s, content, ctx, { exit: 'on' }).state;
  // 六一七 · 别拍 (今's 聊天, 2026-10-22) at the anatomy scene's end; the retest is told
  s = win(s, content, ctx, { id: 'jin-chat-617' }).state;
  s = task(s, content, ctx, { action: 'done', id: 'jin-chat-617' }).state;
  s = resolve(s, content, ctx, { exit: 'on' }).state;
  return resolve(s, content, ctx, { exit: 'finish' }).state;
}

test('one beat, the book\'s paragraph verbatim in both languages', () => {
  assert.deepEqual(BEATS.map((b) => b.id), ['shan']);
  assert.equal(TITLE.zh, '沉鼎山');
  const zh = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/03-第三回.md'), 'utf8').split(/\n+/);
  const en = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/en/h04.md'), 'utf8').split(/\n+/);
  assert.ok(zh.includes(BEATS[0].line.zh), 'the zh line is a paragraph of 03-第三回.md');
  assert.ok(en.includes(BEATS[0].line.en), 'the en line is a paragraph of en/h04.md');
  assert.match(BEATS[0].line.zh, /^沉鼎山并不怎么高，只是陡。[\s\S]*小满张着嘴，半天合不上。$/);
  assert.ok(camSeconds(BEATS[0]) >= 8, 'a long look, never hurried');
});

test('painted, not drawn: the painting on disk, the camera inside it, a push from the two of them up into the fog', () => {
  for (const p of Object.values(ART)) assert.ok(fs.existsSync(path.join(ROOT, 'worlds/jiuding', p)), `${p} is on disk`);
  assert.equal(ASPECT, 9 / 16);
  const [from, to] = SHOTS.shan;
  for (const v of [from, to]) {
    assert.ok(v.s >= 1 && v.s <= 3, `zoom ${v.s} never shows past the painting`);
    assert.ok(v.fx > 0 && v.fx < 1 && v.fy > 0 && v.fy < 1);
  }
  assert.ok(to.s > from.s, 'a push, not a pull');
  assert.ok(from.fy > MARKS.stairFoot[1] && to.fy < MARKS.stairFoot[1], 'from the bank up the stair');
  assert.ok(Math.abs(to.fy - MARKS.stairTop[1]) < 0.05, 'ending where the stair goes into the fog');
  const pts = Object.values(MARKS).flatMap((m) => (Array.isArray(m[0]) ? m : [m]));
  for (const [u, v] of pts) assert.ok(u > 0 && u < 1 && v > 0 && v < 1, 'marks inside the painting');
  assert.doesNotMatch(piece, /\.(ellipse|circle|moveTo|lineTo|bezierCurveTo|quadraticCurveTo|poly|roundRect)\(/, 'no strokes or shapes drawn in code');
  assert.doesNotMatch(piece, /\bgsap\.(to|from|fromTo|timeline|delayedCall)\(/, 'its tweens go through the bag');
  assert.match(piece, /destroy\(\) \{\s*bag\.killAll\(\);/);
  const svg = stillSvg('shan', { W: 1000, H: 562 });
  assert.match(svg, /^<svg class="spstill"/);
  assert.ok(svg.includes(ART.a));
  assert.doesNotMatch(svg, /<text/);
});

test('the scene marks the paragraph, zh and en, and every 景 mark names a piece that exists', () => {
  const gate = scenes.find((sc) => sc.id === '00-gate');
  // 00-gate plays the game's cut (节本, jieben.mjs) with the book's passage beside it: the book's
  // paragraph is the piece's line, word for word; the box's is its cut, and both carry the mark.
  // Since 泗水路 (2026-10-22) the passage is split after the road: 沉鼎山 is in the rest (`story_after`), after the board.
  for (const lang of ['zh', 'en']) {
    assert.doesNotMatch(`${gate.story[lang]}${gate.story_full[lang]}`, /\{景=/, `${lang}: the road, before the board, marks nothing`);
    const book = gate.story_after_full[lang].split(/\n+/).filter((p) => /\{景=/.test(p));
    assert.equal(book.length, 1, `${lang}: one paragraph of the book's passage`);
    assert.equal(book[0].replace(PIECE, ''), BEATS[0].line[lang], `${lang}: the book's paragraph is the piece's line`);
    const marked = gate.story_after[lang].split(/\n+/).filter((p) => /\{景=/.test(p));
    assert.equal(marked.length, 1, `${lang}: one paragraph`);
    assert.ok(checkJieben(marked[0], BEATS[0].line[lang], lang).ok, `${lang}: the box's paragraph is cut from the piece's line`);
    assert.ok(marked[0].startsWith(lang === 'zh' ? '沉鼎山并不怎么高，只是陡。' : "Sunken Cauldron Mountain wasn't very tall, only steep."), lang);
  }
  for (const sc of scenes) {
    for (const pair of [sc.story, sc.story_after, ...(sc.exits ?? []).map((x) => x.story)]) {
      for (const lang of ['zh', 'en']) {
        for (const m of String(pair?.[lang] ?? '').matchAll(PIECE)) assert.ok(fs.existsSync(path.join(ROOT, 'scripts/setpieces', `${m[1]}.js`)), `${sc.id}: setpieces/${m[1]}.js`);
      }
      if (pair?.zh) assert.equal((pair.zh.match(PIECE) ?? []).length, (pair.en?.match(PIECE) ?? []).length, `${sc.id}: zh and en mark alike`);
    }
  }
  // Not on an exit: that plays before the scene's passage.
  for (const [sid, eid] of [['00-notice', 'go'], ['j01-retest', 'finish']]) {
    assert.equal(scenes.find((sc) => sc.id === sid).exits.find((x) => x.id === eid).setpiece, undefined, `${sid}/${eid} declares no piece`);
  }
});

test('the box never says the mark; the beat carries the piece, at its own paragraph, after the 回\'s turn and 泗水路', () => {
  for (const lang of ['zh', 'en']) {
    const s = atGate(lang);
    assert.equal(s.scene, '00-gate');
    const told = tellOf(content, s).tell;
    const tell = playOf(content, s, told);
    for (const t of told) assert.doesNotMatch(t.text, /\{景=|景=/, `${t.id}: the words only`);
    const gate = scenes.find((sc) => sc.id === '00-gate');
    assert.doesNotMatch(passageFor(content, s, gate.story), /\{景=/);
    const at = tell.findIndex((t) => t.of === 'scene' && t.id === '00-gate');
    assert.ok(at > 0, 'the gate\'s passage, after what leads into it');
    assert.equal(tell[at - 1].hui, 'j01', '今 · 一\'s last words first');
    assert.equal(tell[at].hui, 'h04', 'then 第三回\'s');
    assert.ok(tell.every((t) => t.beats[lang].every((b) => !b.piece)), 'the road, before 泗水路, carries no piece');
    // 泗水路 won: the rest of the passage is told, and only that one beat of it carries the piece — the paragraph.
    const won = task(win(tellOf(content, s).keep, content, ctx, { id: 'gate-sishui' }).state, content, ctx, { action: 'done', id: 'gate-sishui' }).state;
    const rest = playOf(content, won, tellOf(content, won).tell);
    const after = rest.findIndex((t) => t.of === 'after' && t.id === '00-gate/after');
    assert.ok(after >= 0, 'the rest of 00-gate, after its board');
    assert.equal(rest[after].hui, 'h04');
    for (const t of rest) assert.doesNotMatch(t.text ?? '', /\{景=|景=/, `${t.id}: the words only`);
    const paras = gate.story_after[lang].split(/\n\n+/);
    const k = paras.findIndex((p) => /\{景=/.test(p));
    const pieces = rest.flatMap((t, i) => t.beats[lang].map((b, j) => [i, j, b])).filter(([, , b]) => b.piece);
    assert.deepEqual(pieces.map(([i, j, b]) => [i, j, b.piece]), [[after, k, 'chending']], lang);
    assert.equal(pieces[0][2].text, paras[k].replace(PIECE, ''), 'the beat says the paragraph, the mark gone');
    for (const b of rest[after].beats[lang === 'zh' ? 'en' : 'zh']) if (b.piece) assert.equal(b.piece, 'chending', 'the other language marks the same beat');
    // Walking the box: the piece's beat is reached once, at its paragraph.
    let r = withTold(emptyReading('00-gate'), rest, won.scene);
    const seen = [];
    for (let n = 0; n < 400 && !r.closed; n += 1) { const c = current(r, lang); seen.push([r.i, r.j, c.beat.piece ?? null]); r = advance(r, lang); }
    const first = seen.findIndex(([, , p]) => p);
    assert.deepEqual(seen[first].slice(0, 2), [after, k]);
    assert.equal(seen.filter(([, , p]) => p).length, 1, 'once');
  }
});

test('the page lays it under that beat\'s words, as the whole stage: never at the 回\'s turn, never over a game or another moment', () => {
  // At the turn (今 · 一 · 完 up, 第三回's seal owed) the box steps aside, so no beat of it is on show.
  assert.equal(boxGivesWay({ huiTurn: atTurn({ closeUp: true, sealOwed: true }) }), true);
  const fn = src.slice(src.indexOf('function beatPiece('), src.indexOf('function beatPiece(') + 900);
  assert.match(fn, /if \(pieceOn \|\| !playing\(r\) \|\| boxYields\(slots\) \|\| momentPending\.size \|\| stageBusy\(\)\) return dropBeatPiece\(\);/, 'only where the story shows the beat, nothing else up or on its way');
  assert.match(fn, /const beat = r\.all\?\.whole \? null : current\(r, lang\(\)\)\.beat;\s*if \(!beat\?\.piece \|\| beat\.recap\) return dropBeatPiece\(\);/, 'the next beat takes it away; 全文\'s column holds no piece (its beat reads in 自动)');
  assert.match(fn, /layBeatPiece\(key, beat\.piece, again\)/, 'its painting under the beat; the words are the beat\'s own (a 节本 cut), never the book\'s longer paragraph');
  assert.match(fn, /done\.add\(key\)/, 'the camera once a save');
  const lay = src.slice(src.indexOf('async function layBeatPiece('), src.indexOf('async function layBeatPiece(') + 1200);
  assert.match(lay, /playSetPiece\(box, id, \{ lang: lang\(\), still: still \|\| stillMotion\(\), cover: true, auto: true, hold: 600 \}\)/, 'the whole stage, no letterbox');
  assert.match(lay, /def\.TITLE/, 'its name upright in the corner (proto e)');
  // Before the story is drawn, the same render.
  assert.match(src, /beatPiece\(slots\);\n {2}const box = dialogBoxHtml\(slots\);/);
  assert.match(src, /const momentUp = \(\) => Boolean\(pieceOn \|\|/);
  assert.doesNotMatch(fn, /00-gate|chending/, 'no scene named in code');
});
