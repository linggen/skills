// 扔了干净 (setpieces/huochai.js): 第七回's 饭桶 eats the gourd and the shards and spits out 火柴 (09-snow).
// Hanli 10-19: 「「扔了干净」这一幕改成大场面」 — it was the board 喂饭桶 · 扔了干净 (snow-fantong, row fantonghuochai).
// It plays AT the chewing paragraph of the way on (`{景=huochai}`, the page's beatPiece), at its own pace; the words
// wait for it; 跳过 and a double tap only bring its last frame; reduced motion shows still frames. The board is
// `cut` (kept for the 游戏厅 under 旧版, its row `replaced: "setpiece"`); a save holding it offered loads and goes on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { fitWorld, newState } from '../scripts/state.mjs';
import { resolve } from '../scripts/rules.mjs';
import { playOf, tellOf } from '../scripts/rules/tell.mjs';
import { advance, current, emptyReading, fitMode, modeAt, wholeBeats, withTold } from '../scripts/dialogue.js';
import { paceOf, screensOf, SPEEDS } from '../scripts/lines.js';
import { beatStepper } from '../scripts/setpiece.js';
import * as P from '../scripts/setpieces/huochai.js';
import { earnedFor } from './earn.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = loadContent();
const CH = content.chapters['00-zhuji'];
const NOW = new Date('2026-10-19T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const BOOK = { zh: read('story/jiuding-lu/07-第七回.md'), en: read('story/jiuding-lu/en/h11.md') };
const paraOf = (lang, head) => BOOK[lang].split('\n').find((l) => l.startsWith(head));
const BOOK_PARAS = {
  zh: [paraOf('zh', '他摸进柴房，按开饭桶'), paraOf('zh', '饭桶嚼了很久')],
  en: [paraOf('en', 'He slipped into the woodshed, opened the Rice Bucket'), paraOf('en', 'The Rice Bucket chewed for a long time')],
};
const scene = CH.scenes['09-snow'];
const feed = scene.exits.find((e) => e.id === 'feed');
const PIECE = /\{景=([a-z]+)\}/g;

/* A save at 09-snow, 古七's first scene (as tests/gu7.test.mjs stands it). */
const at = (lang = 'zh', extra = {}) => ({
  ...newState(content, lang, NOW), chapter: '00-zhuji', scene: '09-snow', place: 'chaifang', ended: ['00-prologue', '00-waimen'],
  tier: 'qi', step: 4, progress: 0, traits: ['wood', 'water', 'fire', 'earth', 'metal'], stamina: 100, stamina_at: NOW.toISOString(), done_scenes: ['wm-heluo'],
  bag: { 'chitong-hulu': 1 }, ...extra,
});
const fed = (s) => {
  const out = resolve(earnedFor(content, s, 'feed'), content, ctx(), { exit: 'feed' });
  assert.equal(out.result.ok, true, JSON.stringify(out.result).slice(0, 300));
  return out.state;
};
/* The passages owed once 「扔进饭桶」 is taken, as the page plays them. */
function afterFeed(lang) {
  const s = fed(at(lang));
  return { s, tell: playOf(content, s, tellOf(content, s).tell) };
}
function readingAtPiece(lang) {
  const { s, tell } = afterFeed(lang);
  let r = withTold(emptyReading('09-snow'), tell, s.scene);
  for (let k = 0; k < 200 && current(r, lang).beat.piece !== 'huochai'; k += 1) r = advance(r, lang);
  return r;
}
const at_ = (cs, re) => cs.find(([, s]) => re.test(s))?.[0];

test('the lines are the book\'s, verbatim, in its order (zh 07-第七回.md, en h11.md); five beats, the sword fourth', () => {
  for (const lang of ['zh', 'en']) {
    let from = -1;
    for (const b of P.BEATS) {
      const k = BOOK[lang].indexOf(b.line[lang]);
      assert.ok(k >= 0, `${b.id} ${lang}: 「${b.line[lang]}」 is the book's`);
      assert.ok(k > from, `${b.id} ${lang}: after the beat before it`);
      from = k;
    }
  }
  assert.deepEqual(P.BEATS.map((b) => b.id), ['feed', 'chew', 'breaths', 'sword', 'dive']);
  assert.match(P.BEATS[3].line.zh, /「咔哒」[\s\S]*「笃」[\s\S]*剑柄还在嗡嗡地颤。$/);
  assert.equal(P.TITLE.zh, '扔了干净');
});

test('the way on tells the book\'s two paragraphs, the chewing one marked `{景=huochai}` (zh and en); the scene offers no board', () => {
  for (const lang of ['zh', 'en']) {
    for (const field of ['story']) {
      const paras = feed[field][lang].split(/\n\n+/);
      const marked = paras.map((p, k) => [k, [...p.matchAll(PIECE)].map((m) => m[1])]).filter(([, ids]) => ids.length);
      assert.deepEqual(marked, [[1, ['huochai']]], `${field} ${lang}: the chewing paragraph, once`);
      assert.equal(paras[0], BOOK_PARAS[lang][0], `${field} ${lang}: 「他摸进柴房…」 word for word`);
      assert.equal(paras[1], `${BOOK_PARAS[lang][1]}{景=huochai}`, `${field} ${lang}: 「饭桶嚼了很久…」 word for word, the tag at its end`);
    }
    // The sword's paragraph is still the way on's, after the piece.
    assert.match(feed.story[lang], lang === 'zh' ? /\{景=huochai\}\n\n他拔出剑来，[^\n]*一口剑，三尺来长/ : /\{景=huochai\}\n\nHe pulled the sword out\.[^\n]*A sword, about three feet long/);
  }
  assert.ok(!(scene.show ?? []).some((c) => c.card === 'board'), 'no board on the stage');
  assert.deepEqual(scene.offers?.tasks ?? [], []);
  assert.equal(feed.needs, undefined, 'the way on waits on nothing');
  assert.equal(feed.grant.item, 'huochai-jian', '火柴 handed over as before');
});

test('the old board is gone (2026-10-20, Hanli: 「试做或者不要的, 可以删了吧?」): no task, no 游戏厅 row, no module', () => {
  assert.equal(content.tasks.tasks.find((x) => x.id === 'snow-fantong'), undefined);
  assert.equal(content.games.games.find((g) => g.id === 'fantonghuochai'), undefined);
  assert.ok(!fs.existsSync(path.join(ROOT, 'scripts/games/fantonghuochai.js')));
});

test('it plays at its paragraph of the way on\'s passage, once, and nowhere else', () => {
  for (const lang of ['zh', 'en']) {
    const { s, tell } = afterFeed(lang);
    assert.equal(s.scene, '09-jiuge');
    assert.equal(s.bag['huochai-jian'], 1);
    for (const t of tell) for (const b of t.beats[lang]) assert.doesNotMatch(b.text, /景=/, `${t.id}: the words only`);
    const got = tell.flatMap((t, i) => t.beats[lang].map((b, j) => [i, j, b.piece, b.text])).filter(([, , p]) => p);
    assert.equal(got.length, 1, lang);
    assert.equal(got[0][2], 'huochai');
    assert.match(tell[got[0][0]].id, /^09-snow\/feed/, `${lang}: on the way on's passage`);
    assert.equal(got[0][1], 1, `${lang}: its second paragraph`);
    let r = withTold(emptyReading('09-snow'), tell, s.scene);
    const seen = [];
    for (let k = 0; k < 400 && !r.closed; k += 1) { const p = current(r, lang).beat.piece; if (p) seen.push(p); r = advance(r, lang); }
    assert.deepEqual(seen, ['huochai'], lang);
  }
});

/* The piece's clock (s): where each beat starts as it plays — its own pace (`TEMPO`), never the words'. */
function pieceClock(lang) {
  const k = P.tempoOf(lang), out = {};
  let t = 0;
  for (const b of P.BEATS) { out[b.id] = t; t += (b.ms / 1000) * k + (b.hold ?? 0) / 1000; }
  return { start: out, end: t, tempo: k };
}
/* When each sentence comes up at 自动 with the piece under it (lingjing.js pieceGate), and when the beat may end. */
function shown(text, lang) {
  const clk = pieceClock(lang), f = SPEEDS.mid, out = [];
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

test('its own pace, apart from 自动\'s speed: ~10–14 s, the sword at the snap after the five breaths', () => {
  assert.doesNotMatch(read('scripts/setpieces/huochai.js'), /SPEEDS|lines\.js/, 'not tied to the words\' speed');
  for (const lang of ['zh', 'en']) {
    const c = pieceClock(lang);
    assert.ok(c.end >= 10 && c.end <= 14, `${lang}: ${c.end.toFixed(1)} s`);
    assert.ok(c.start.sword >= 8 && c.start.sword <= 11, `${lang}: the snap ${c.start.sword.toFixed(1)} s in`);
    assert.ok(c.end - c.start.sword <= 4.2, `${lang}: the sword and the dive close it`);
  }
  // Every beat runs straight into the next (no page hold between them), and stands its length when still.
  for (const b of P.BEATS) assert.equal(b.hold, 0, b.id);
});

test('the words wait for the picture: 「饭桶嚼了很久」 as it chews, 「末了…「咔哒」」 at the snap, 「扎进了柴堆」 as he leaps', () => {
  for (const lang of ['zh', 'en']) {
    const beat = current(readingAtPiece(lang), lang).beat;
    assert.equal(beat.piece, 'huochai');
    for (const c of P.CUES) assert.equal(screensOf(beat.text, lang).flat().filter((s) => s.includes(c.text[lang])).length, 1, `${lang}: 「${c.text[lang]}」 in one sentence`);
    const { out, clk, ends } = shown(beat.text, lang);
    const snap = clk.start.sword + 0.05 * clk.tempo;
    const last = at_(out, lang === 'zh' ? /咔哒/ : /click/);
    assert.ok(last >= snap && last < snap + 0.3, `${lang}: 「咔哒」 at ${last.toFixed(1)} s, the lid snaps at ${snap.toFixed(1)} s`);
    const dive = at_(out, lang === 'zh' ? /柴堆/ : /woodpile/);
    assert.ok(dive >= clk.start.dive && dive <= clk.end, `${lang}: 小狰 at ${dive.toFixed(1)} s, as he leaps`);
    const chew = at_(out, lang === 'zh' ? /嚼了很久/ : /chewed for a long time/);
    assert.ok(chew >= clk.start.chew, `${lang}: 「饭桶嚼了很久」 once it chews (${chew.toFixed(1)} s)`);
    assert.ok(ends >= clk.end, `${lang}: the paragraph ends after the piece's last frame`);
  }
});

test('跳过 skips words only: it stops at the piece\'s beat; 全文\'s column ends before it and the piece reads in 自动', () => {
  for (const lang of ['zh', 'en']) {
    const { s, tell } = afterFeed(lang);
    let r = withTold(emptyReading('09-snow'), tell, s.scene);
    r = { ...r, i: tell.findIndex((t) => /^09-snow\/feed/.test(t.id)), j: 0 };
    const s1 = fitMode(r, 'skip', { lang });
    assert.equal(current(s1, lang).beat.piece, 'huochai', `${lang}: 跳过 stops at the piece`);
    assert.equal(s1.all, null, `${lang}: from its first word, not shown whole`);
    assert.equal(modeAt(s1, 'fast', lang), 'mid', `${lang}: the piece's beat reads in 自动`);
    assert.equal(fitMode(s1, 'fast', { lang }), s1, `${lang}: 全文 leaves it in 自动`);
    const s2 = fitMode(s1, 'skip', { lang });
    assert.ok(!current(s2, lang).beat.piece, `${lang}: then on past it`);
    const w1 = fitMode(r, 'fast', { lang });
    assert.ok(w1.all?.whole && !wholeBeats(w1, lang).some((b) => b.piece), `${lang}: no piece in the column`);
    assert.equal(current(advance(w1, lang), lang).beat.piece, 'huochai', `${lang}: 接着往下 → the piece's beat`);
  }
  // The page (generic, tests/setpiece-yaowang.test.mjs holds its shape): 跳过 and a double tap bring the last frame.
  const page = read('scripts/lingjing.js');
  assert.match(page, /function skipPassage\(\) \{\n[^\n]*\n  if \(piecePlays\(\)\) \{ pieceToEnd\(\); return; \}/);
  assert.match(page, /if \(now - gateTapAt < DOUBLE_TAP_MS\) \{ gateTapAt = 0; pieceToEnd\(\); \}/);
  assert.doesNotMatch(page, /huochai/, 'no piece named in code');
});

test('reduced motion: still frames, each standing its beat\'s length; no WebGL: the paintings, composed where each beat ends', () => {
  const st = beatStepper(P.BEATS);
  const evs = [st.start()];
  for (let i = 0; i < P.BEATS.length; i += 1) evs.push(st.ended(), st.tap());
  assert.deepEqual(evs.at(-1), { done: true });
  assert.equal(evs.filter((e) => 'start' in e).length, 5, 'five frames');
  for (const [W, H] of [[1000, 562], [1000, 1949]]) {
    for (const b of P.BEATS) {
      const v = P.stillSvg(b.id, { W, H });
      for (const k of ['shed', 'body', 'lid']) assert.ok(v.includes(P.ART[k]), `${b.id}: ${k} in the still`);
      assert.equal(v.includes(P.ART.sword), ['sword', 'dive'].includes(b.id), `${b.id}: the sword in the door from the snap on`);
      assert.doesNotMatch(v, /<text|<path|<circle|<ellipse|<polygon|<line/, 'paintings only');
    }
  }
});

test('painted, not drawn: every picture on disk at its size; the pot, the door and the woodpile in the frame, above the words, at 1440 and at 390', () => {
  for (const [k, p] of Object.entries(P.ART)) assert.ok(fs.existsSync(path.join(ROOT, 'worlds/jiuding', p)), `${k} ${p} is on disk`);
  const src = read('scripts/setpieces/huochai.js');
  assert.doesNotMatch(src, /\.(ellipse|circle|moveTo|lineTo|bezierCurveTo|quadraticCurveTo|poly|roundRect|arc)\(/, 'no shapes drawn');
  assert.doesNotMatch(src, /\bgsap\.(to|from|fromTo|timeline|delayedCall)\(/, 'every tween in the bag');
  assert.match(src, /destroy\(\) \{\s*bag\.killAll\(\);/);
  assert.ok(read('tools/paint-huochai.py').includes('KEPT = {'), 'the seeds recorded');
  assert.match(read('worlds/jiuding/art/CREDITS.md'), /huochai-body\.webp/);
  for (const [w, h] of [[1440, 810], [390, 760]]) {
    const W = 1000, H = Math.round(W * h / w), S = P.shots(W, H), L = P.layout();
    const inFrame = (view, uv, what, below = 0.76) => {
      const [x, y] = P.onFrame(view, uv, W, H);
      assert.ok(x > 0 && x < W && y > 0 && y <= H * below, `${w}: ${what} at (${(x / W).toFixed(2)}, ${(y / H).toFixed(2)})`);
    };
    const uv = ([x, y]) => [x / L.iw, y / L.ih];
    for (const id of ['feed', 'chew', 'breaths']) inFrame(S[id][1], uv(L.foot), `${id}: the pot's foot`);
    inFrame(S.sword[1], uv(L.door), 'the sword in the door');
    inFrame(S.dive[1], uv(L.pile), 'the woodpile');
  }
});

test('an old save: holding the board offered, it loads, lets the board go, and 「扔进饭桶」 goes on; one that played it keeps it done', () => {
  const old = { ...at('zh'), tasks: { 'snow-fantong': { status: 'offered' } } };
  const fit = fitWorld(old, content);
  assert.equal(fit.tasks['snow-fantong'], undefined, 'never winnable here now: let go');
  const on = fed(fit);
  assert.equal(on.scene, '09-jiuge');
  assert.equal(on.bag['huochai-jian'], 1);
  const played = fitWorld({ ...at('zh'), tasks: { 'snow-fantong': { status: 'done' } } }, content);
  assert.equal(played.tasks['snow-fantong'].status, 'done', 'what was done stays, for the record');
  // A save from before, standing past the scene, owes nothing new.
  assert.equal(fed(played).scene, '09-jiuge');
});

test('setpiece.html plays it by name, like yaowang', () => {
  const html = read('scripts/setpiece.html');
  assert.match(html, /import\(`\.\/setpieces\/\$\{name\}\.js`\)/);
  assert.equal('huochai'.replace(/[^a-z]/g, ''), 'huochai');
});
