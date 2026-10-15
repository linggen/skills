// 亮相 — a face comes on large at the book's own point (Hanli, 2026-10-13: 「人物卡应该放在亮相的位置.
// 亮相就是正式出场, 我们描写人物容貌等的地方」; 2026-10-14: 「每个人物亮相的时候, 应该有个大图在中间显示」).
//
// ONE mechanism, the book's: a face's 亮相 is the first paragraph of its `first.book` 回 that marks it
// `[名]{注=id}` — the paragraph its card stands after in the reader (read-md.js). The scene passage
// quoting that paragraph carries the same mark, zh and en, and no other scene paragraph marks that
// face; the box notes it on that beat (rules/tell.mjs beatsOf `notes`) and the page brings the face
// on large there and nowhere else (dialogue.js sightings). A name in passing brings no one on.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent, codexFiles } from '../scripts/content.mjs';
import { codexOf } from '../scripts/codex.js';
import { newState } from '../scripts/state.mjs';
import { beatsOf, passageFor, playOf, tellOf } from '../scripts/rules/tell.mjs';
import { advance, noted, sightNow, sightings, withTold } from '../scripts/dialogue.js';
import { SIGHT_KINDS } from '../scripts/sight.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const NOW = new Date('2026-10-05T12:00:00');
const BOOK = JSON.parse(fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/book.json'), 'utf8'));
const JUAN1 = BOOK.volumes.find((v) => v.id === 'juan1').hui;
const codex = codexOf(codexFiles(content), { lang: 'zh' });
const LANGS = ['zh', 'en'];

// 亮相 paragraphs of 卷一's book that no game passage plays (the game tells those 回 in its own
// cut): the book's card stands, the game has no beat for it. A scene that comes to quote one fails here.
const NOT_IN_GAME = new Set(['heyu', 'doufu-xishi', 'wuzhu']);

const GLOSS = /\[([^\]\n]+)\]\{注=([^{}\n]+)\}/g;
const norm = (t) => String(t).replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1').replace(/\{[^}\n]*\}/g, '').replace(/\*\*|⟪|⟫/g, '').replace(/^#.*$/gm, '').replace(/^>\s?/gm, '').replace(/---/g, '').replace(/\s+/g, '');
const bookFile = (hui, lang) => path.join(ROOT, 'story/jiuding-lu', lang === 'zh' ? JUAN1.find((h) => h.id === hui).file : `en/${hui}.md`);

// Every face of 卷一 with a picture: a person or a creature whose first appearance is a 卷一 回.
const faces = [...codex.values()].filter((e) => SIGHT_KINDS.has(e.kind) && e.image && JUAN1.some((h) => h.id === e.first?.book));

// The book's 亮相 of a face: the first paragraph of its 回 that marks it, the marked words, and the
// words right around them (an anchor that finds the same place in a scene, however it splits paragraphs).
function liangxiang(e, lang) {
  const para = fs.readFileSync(bookFile(e.first.book, lang), 'utf8').split(/\n+/).find((p) => [...p.matchAll(GLOSS)].some((m) => m[2] === e.id));
  if (!para) return null;
  const m = [...para.matchAll(GLOSS)].find((x) => x[2] === e.id);
  const head = norm(para.slice(0, m.index)).slice(-8);
  return { para, words: m[1], anchor: head + norm(m[1] + para.slice(m.index + m[0].length)).slice(0, 12), off: head.length };
}

// Every passage the box can play, in every scene of the world.
const passages = Object.values(content.chapters).flatMap((ch) => Object.values(ch.scenes ?? {})).flatMap((sc) => [
  [sc.id, sc.story], [`${sc.id}/after`, sc.story_after], ...(sc.exits ?? []).map((x) => [`${sc.id}/${x.id}`, x.story]),
].filter(([, p]) => p?.zh).map(([key, pair]) => ({ key, pair })));

// The scene paragraphs that carry a face's mark, and whether each stands where the book's 亮相 does.
function markedIn(e, lang, lx) {
  const out = [];
  for (const { key, pair } of passages) {
    const raw = pair[lang] ?? '';
    const at = lx ? norm(raw).indexOf(lx.anchor) : -1;
    for (const m of raw.matchAll(GLOSS)) {
      if (m[2] !== e.id) continue;
      out.push({ key, here: at >= 0 && norm(raw.slice(0, m.index)).length === at + lx.off && m[1] === lx.words });
    }
  }
  return out;
}
const quotes = (lx, lang) => passages.some(({ pair }) => lx && norm(pair[lang] ?? '').includes(lx.anchor));

test('every face of 卷一 with a picture has its 亮相 in the book, zh and en', () => {
  assert.ok(faces.length >= 30, `faces found: ${faces.length}`);
  for (const e of faces) for (const lang of LANGS) assert.ok(liangxiang(e, lang), `${e.id} (${e.name}): no {注=${e.id}} in ${e.first.book} (${lang})`);
  // A person of 卷一's cast the book tells of carries a first.book (so the reader cards them — and the game shows them).
  const ppl = content.people.people.filter((p) => p.art);
  for (const p of ppl) {
    const files = JUAN1.filter((h) => (p.line === 'jin') === h.file.startsWith('今线')).map((h) => fs.readFileSync(path.join(ROOT, 'story/jiuding-lu', h.file), 'utf8'));
    if (files.some((t) => t.includes(p.name.zh))) assert.ok(faces.some((e) => e.id === p.id), `${p.id} (${p.name.zh}) is in 卷一's book but has no 亮相 there`);
  }
});

test('each face is marked on exactly one scene paragraph — the one quoting the book\'s 亮相, zh and en', () => {
  const absent = new Set();
  for (const e of faces) for (const lang of LANGS) {
    const lx = liangxiang(e, lang);
    const marks = markedIn(e, lang, lx);
    if (!quotes(lx, lang)) {
      absent.add(e.id);
      assert.deepEqual(marks, [], `${e.id} (${lang}): no scene plays its 亮相, so no scene may mark it`);
      continue;
    }
    assert.equal(marks.length, 1, `${e.id} (${e.name}, ${lang}): marked ${marks.length} times in scenes (${marks.map((m) => m.key).join(', ') || 'none'}) — mark the paragraph quoting the book's 亮相 「${lx.para.replace(GLOSS, '$1').slice(0, 24)}…」, once`);
    assert.ok(marks[0].here, `${e.id} (${lang}): ${marks[0].key} marks it, but not at the book's 亮相 words 「${lx.words}」`);
  }
  assert.deepEqual([...absent].sort(), [...NOT_IN_GAME].sort(), 'the 亮相 the game does not play: exactly these');
});

test('the marks change no word the box plays: beats are the same text with or without them', () => {
  for (const lang of LANGS) {
    const s = newState(content, lang, NOW);
    for (const { key, pair } of passages) {
      if (!pair[lang]) continue;
      const [sid, eid] = key.split('/');
      const item = { of: eid ? (eid === 'after' ? 'after' : 'choice') : 'scene', id: eid ? key : sid };
      const plainBeats = beatsOf(content, s, { ...item, text: passageFor(content, s, pair) });
      const markedBeats = beatsOf(content, s, { ...item, text: passageFor(content, s, pair), marked: passageFor(content, s, pair, { notes: true }) });
      // a 景 mark is a beat's piece (setpiece-chending.test.mjs); her ⟪…⟫ are its `asides` (lines.test.mjs)
      assert.deepEqual(markedBeats.map(({ notes, piece, asides, ...b }) => b), plainBeats, key);
      for (const b of markedBeats) assert.doesNotMatch(b.text, /\{(?:注|景)=|\]\{|⟪|⟫/, key);
      for (const b of markedBeats) for (const a of b.asides ?? []) assert.ok(b.text.includes(a), `${key}: her words 「${a}」 stand in the beat`);
    }
  }
});

// A passage read through the box, as the page reads it: its beats, then the large card at each beat.
const readOf = (lang, key) => {
  const s = newState(content, lang, NOW), { pair } = passages.find((p) => p.key === key);
  const [sid, eid] = key.split('/');
  const item = { of: eid ? (eid === 'after' ? 'after' : 'choice') : 'scene', id: eid ? key : sid, text: passageFor(content, s, pair), marked: passageFor(content, s, pair, { notes: true }) };
  return withTold(null, [{ ...item, beats: { [lang]: beatsOf(content, s, item) } }], sid);
};
const shown = (r, lang) => {
  const entries = noted(r, lang).map((id) => codex.get(id)).filter((e) => e && SIGHT_KINDS.has(e.kind));
  const out = [];
  for (let x = r, k = 0; k < 400 && !x.closed; k += 1, x = advance(x, lang)) for (const e of sightNow(x, entries, lang)) out.push([k, e.id]);
  return out;
};

test('秦雁 comes on large at her 亮相 on the 台 — not at 「小满对的，是秦雁。」 before it', () => {
  const r = readOf('zh', 'wm-lun2');
  const beats = r.items[0].beats.zh;
  const at = shown(r, 'zh').filter(([, id]) => id === 'neimen-shijie');
  assert.equal(at.length, 1, 'once');
  assert.match(beats[at[0][0]].text, /^小满跟着上了台。秦雁比他高半个头/);
  assert.ok(beats.findIndex((b) => b.text === '小满对的，是秦雁。') < at[0][0], 'her first mention comes before, and brings nothing');
});

test('every face whose 亮相 the game plays comes on large exactly once, at that beat (zh and en)', () => {
  for (const e of faces) for (const lang of LANGS) {
    const lx = liangxiang(e, lang);
    if (!quotes(lx, lang)) continue;
    const { key } = markedIn(e, lang, lx)[0];
    const r = readOf(lang, key), beats = r.items[0].beats[lang];
    const at = shown(r, lang).filter(([, id]) => id === e.id);
    assert.equal(at.length, 1, `${e.id} ${lang} in ${key}`);
    assert.ok(norm(beats[at[0][0]].text).includes(norm(lx.words)), `${e.id} ${lang}: the beat names 「${lx.words}」`);
  }
});

test('the rules hand the page the notes: the opening\'s first passage brings 沈小满 on at 「这个少年」, zh and en', () => {
  for (const lang of LANGS) {
    const s = newState(content, lang, NOW);
    const played = playOf(content, s, tellOf(content, s).tell);
    assert.ok(played.every((t) => !('marked' in t)), 'the marked words stay in the rules');
    const r = withTold(null, played, s.scene);
    assert.deepEqual(noted(r, lang), ['xiaoman'], lang);
    const at = shown(r, lang);
    assert.equal(at.length, 1);
    assert.match(r.items[0].beats[lang][at[0][0]].text, lang === 'zh' ? /^这个少年，姓沈，名小满/ : /^The boy/);
  }
});
