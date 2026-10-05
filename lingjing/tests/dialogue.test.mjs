// The dialogue box (Hanli, 2026-09-29: 「对话框先做，go」): the book's passage for
// each beat is played on the stage itself, a paragraph at a time — a line
// spoken under its speaker's name and 图鉴 portrait (the hero's under the
// player's 名字, never a face; 银月's in the form her scene names), any other
// paragraph a caption. The rules parse the beats (rules/tell.mjs beatsOf);
// the page plays them (dialogue.js), and a tap costs no model turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { resolve } from '../scripts/rules.mjs';
import { beatsOf, playOf, tellOf } from '../scripts/rules/tell.mjs';
import { advance, choicesUp, current, dialogHtml, keepReading, loadReading, logHtml, playing, skipAll, toldSoFar, withTold } from '../scripts/dialogue.js';
import { walk } from './prologue.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = { now: NOW, quests: [] };
const one = (beats, scene = 's') => withTold(null, [{ of: 'scene', id: 'x', beats }], scene);
const named = (lang = 'zh') => walk(newState(content, lang, NOW), [['resolve', { exit: 'begin' }]], content, NOW);

test('a paragraph `**名**：话` is a line spoken — its name and portrait; any other is narration, no face', () => {
  const s = named();
  const beats = beatsOf(content, s, { of: 'scene', id: '00-masan', text: '马三来了。\n\n**马三**：租呢？\n\n**爹**：（冲马三）您手劲真好。\n\n**勿入。**' });
  assert.deepEqual(beats[0], { text: '马三来了。' });
  assert.deepEqual(beats[1], { who: 'masan', name: '马三', art: 'art/people/masan.webp', text: '租呢？' });
  assert.deepEqual(beats[2], { who: 'baba', name: '爹', art: 'art/people/baba.webp', act: '冲马三', text: '您手劲真好。' });
  assert.deepEqual(beats[3], { text: '勿入。' }, 'bold with no colon is narration');
  // English: the colon inside the bold
  const en = beatsOf(content, named('en'), { of: 'scene', id: '00-masan', text: '**Father:** (to Ma San) Quite a grip.\n\nThe room goes quiet.' });
  assert.deepEqual(en[0], { who: 'baba', name: 'Father', art: 'art/people/baba.webp', act: 'to Ma San', text: 'Quite a grip.' });
  assert.deepEqual(en[1], { text: 'The room goes quiet.' });
  // someone the 图鉴 does not name speaks with a name and no face
  assert.deepEqual(beatsOf(content, s, { of: 'scene', id: '00-gate', text: '**扫地的老头**：沉鼎。' })[0], { name: '扫地的老头', text: '沉鼎。' });
});

test('the hero speaks as 沈小满 (Shen Xiaoman in English) and is never drawn; 阿禾 is the girl (fixed, 2026-09-30)', () => {
  const [you, ahe] = beatsOf(content, named('zh'), { of: 'scene', id: '00-dawn', text: '**你**：嗯。\n\n**阿禾**：你别死在里头啊。' });
  assert.deepEqual(you, { hero: true, name: '沈小满', text: '嗯。' });
  assert.equal(ahe.art, 'art/people/ahe-girl.webp');
  // an old save named on the card speaks as him too
  assert.equal(beatsOf(content, { ...named('zh'), name: '墨白', gender: 'female' }, { of: 'scene', id: '00-dawn', text: '**阿禾**：嗯。' })[0].art, 'art/people/ahe-girl.webp');
  const en = beatsOf(content, named('en'), { of: 'scene', id: '00-dawn', text: '**You:** Mm.' })[0];
  assert.deepEqual(en, { hero: true, name: 'Shen Xiaoman', text: 'Mm.' });
  const html = dialogHtml(one([you]));
  assert.doesNotMatch(html, /<img/, 'no portrait for the hero');
  assert.match(html, /class="dlgname hero">沈小满</);
});

test('银月\'s lines carry her face in the form her scene names: the fox in the valley', () => {
  const s = named();
  const cliff = beatsOf(content, s, { of: 'scene', id: '00-cliff', text: '**银月**：让开。' })[0];
  assert.equal(cliff.who, 'yinyue');
  assert.equal(cliff.name, '银月');
  assert.equal(cliff.art, 'art/people/yinyue-fox.webp');
  const html = dialogHtml(one([cliff]), { src: (f) => `../worlds/jiuding/${f}` });
  assert.match(html, /<img class="dlgface" src="\.\.\/worlds\/jiuding\/art\/people\/yinyue-fox\.webp" alt="银月">/);
  assert.match(html, /class="dlgname">银月</);
  // every 银月 line in the book resolves to her
  for (const sc of Object.values(content.chapters['00-prologue'].scenes)) {
    for (const pair of [sc.story, ...(sc.exits ?? []).map(e => e.story)].filter(Boolean)) {
      const beats = beatsOf(content, s, { of: 'scene', id: sc.id, text: pair.zh.replace(/⟪|⟫/g, '') });
      for (const b of beats.filter(b => b.name === '银月')) assert.equal(b.who, 'yinyue', sc.id);
    }
  }
});

test('a move plays its two passages in order — the choice\'s outcome, then the scene entered — one beat a tap', () => {
  const s = walk(named(), [['resolve', { exit: 'strike' }]], content, NOW);
  const { tell } = tellOf(content, s);
  const played = playOf(content, s, tell);
  assert.deepEqual(played.map(t => t.id), ['00-masan/strike', '00-dawn']);
  assert.ok(played.every(t => t.beats.zh.length && t.beats.en.length), 'both languages, for a switch mid-passage');
  let r = withTold(null, played, '00-dawn');
  const total = played.reduce((n, t) => n + t.beats.zh.length, 0);
  assert.equal(current(r).n, total);
  assert.ok(playing(r) && !choicesUp(r), 'the choices wait');
  const seen = [];
  for (let k = 0; k < total; k++) { const c = current(r); seen.push([c.beat.of, c.beat.text]); r = advance(r); }
  assert.equal(seen[0][0], 'choice');
  assert.equal(seen.at(-1)[0], 'scene');
  assert.match(seen.map(x => x[1]).join(''), /小满攥紧了拳头[\s\S]*阿禾/, 'the outcome, then the dawn');
  assert.ok(!playing(r), 'the last tap puts the box away');
  assert.ok(choicesUp(r));
  assert.equal(toldSoFar(r).length, total, 'the log holds them all');
  // the language switched mid-passage: it plays on in the other, from the same passage
  const mid = advance(withTold(null, played, '00-dawn'));
  assert.match(current(mid, 'en').beat.text ?? '', /\w/);
  assert.equal(current(mid, 'en').beat.of, 'choice');
});

test('the last beat brings the choices up; 跳过 shows the rest at once; new passages in the same scene queue behind', () => {
  const beats = [{ text: 'a' }, { name: '马三', text: 'b' }, { text: 'c' }];
  let r = one(beats, 's1');
  assert.equal(choicesUp(r), false);
  r = advance(advance(r));
  assert.equal(current(r).k, 2);
  assert.ok(playing(r) && choicesUp(r), 'the last beat stays up with the choices');
  assert.doesNotMatch(dialogHtml(r), /data-dlg-skip/, 'nothing left to skip');
  assert.match(dialogHtml(one(beats)), /data-dlg-skip/);
  const skipped = skipAll(one(beats, 's1'));
  assert.ok(!playing(skipped) && choicesUp(skipped));
  assert.match(logHtml(skipped), /data-dlg-from/);
  assert.equal((logHtml(skipped).match(/dlglogrow/g) ?? []).length, 3);
  // a passage drawn while one plays (Ling Resolved what the player typed) queues behind it
  const mid = advance(one(beats, 's1'));
  const more = withTold(mid, [{ of: 'choice', id: 'x/y', beats: [{ text: 'd' }] }], 's1');
  assert.equal(current(more).k, 1, 'the one on show stays');
  assert.equal(current(more).n, 4);
  // a new scene begins a new reading; a closed one opens on the new beats
  assert.equal(current(withTold({ ...mid, closed: true }, [{ of: 'scene', id: 's2', beats: [{ text: 'x' }] }], 's2')).n, 1);
  const again = withTold({ ...mid, closed: true }, [{ of: 'choice', id: 'x/y', beats: [{ text: 'd' }] }], 's1');
  assert.equal(current(again).k, 3);
  assert.ok(playing(again));
  // moved on to a new scene mid-passage: the rest of the old plays first, from where it stood
  const carried = withTold(mid, [{ of: 'scene', id: 's2', beats: [{ text: 'x' }] }], 's2');
  assert.equal(carried.scene, 's2');
  assert.deepEqual([current(carried).k, current(carried).n, current(carried).beat.text], [1, 4, 'b']);
  // the scene's own passage told again (a new game) begins afresh
  assert.equal(current(withTold({ ...mid, closed: true }, [{ of: 'scene', id: 's1', beats: [{ text: 'z' }] }], 's1')).n, 1);
});

test('catch-up: past two passages owed, the older ones play as recap lines, marked 前情, then the last two whole', () => {
  let s = { ...named(), tell_owed: [], told_scenes: ['00-shiao', '00-masan'] };
  for (const exit of ['endure', 'egg']) s = resolve(s, content, ctx, { exit }).state;
  const played = playOf(content, s, tellOf(content, s).tell);
  assert.deepEqual(played.map(t => t.of), ['catchup', 'choice', 'scene']);
  assert.ok(played[0].beats.zh.every(b => b.recap && !b.name), 'a recap is narration');
  const r = withTold(null, played, '00-kitchen');
  assert.match(dialogHtml(r), /<span class="dlgrecap">前情<\/span>马三来收租/);
  assert.match(dialogHtml(r, { lang: 'en' }), /<span class="dlgrecap">Before this<\/span>/);
});

test('a passage\'s rules (---) are not beats', () => {
  assert.deepEqual(beatsOf(content, named(), { of: 'scene', id: '00-shiao', text: '甲。\n\n---\n\n乙。' }).map(b => b.text), ['甲。', '乙。']);
});

test('the reading is kept per save in this browser, and read back after a reload; storage off, the page still plays', () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const r = advance(one([{ text: 'a' }, { text: 'b' }, { text: 'c' }], '00-dawn'));
  keepReading('test', r, store);
  assert.ok(mem.has('lingjing.reading.test'), 'a scratch save keeps its own');
  assert.deepEqual(loadReading('test', store), r);
  assert.equal(loadReading(null, store), null, 'the player\'s own save is another key');
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(loadReading('test', broken), null);
  assert.doesNotThrow(() => keepReading('test', r, broken));
});

test('a tap costs no model turn: the scene card, the name and the birthday are page-only; the box never speaks to the chat', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  const body = (name) => {
    const at = src.indexOf(`async function ${name}(`);
    return src.slice(at, src.indexOf('\n}\n', at));
  };
  for (const fn of ['panelTap', 'valueTap', 'bornTap', 'watchTell']) {
    const b = body(fn);
    assert.ok(b.length > 40, fn);
    assert.doesNotMatch(b, /\breport\(|\bsay\(|sendHidden|deliver\(/, `${fn} sends nothing to the chat`);
  }
  assert.match(body('panelTap'), /write\('resolve'/);
  assert.match(body('watchTell'), /write\('tell'\)/);
  const box = fs.readFileSync(path.join(ROOT, 'scripts/dialogue.js'), 'utf8');
  assert.doesNotMatch(box, /report|sendHidden|fetch\(/);
});

test('the box on the page: its place in the view, the keys that go on, and what it yields to (queue.js)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'scripts/index.html'), 'utf8');
  assert.match(html, /<div class="dlgwrap" id="dlg"><\/div>/);
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(src, /e\.key === ' ' \|\| e\.key === 'Enter'/);
  assert.match(src, /boxGivesWay\(\{ bout: Boolean\(bout\), appearing: Boolean\(view\.appearing\)/);
  assert.match(src, /cards = afterBook\(cards, cardsAhead\(\), gamesEarly\(\)\);/, 'the games wait for the book — the scene\'s own come up past its caption');
  assert.match(src, /if \(cardsAhead\(\)\) cards = cards\.filter\(\(c\) => c\.card !== 'panel'\);/, 'one text box: no scene card while the box tells');
  const css = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.css'), 'utf8');
  assert.match(css, /\.view:has\(\.dlgwrap:not\(:empty\)\) \.slots \{ bottom:/);
  assert.match(css, /\.dlgwrap \{ left: 16px; right: 16px;/, 'narrow: 16px gutters');
});

test('one text box (Hanli, 2026-10-05): the scene card\'s caption is the first beat of the scene\'s passage, in both languages', () => {
  const s = named();
  const played = playOf(content, s, [{ of: 'scene', id: '00-luoshu', text: '甲。\n\n乙。' }, { of: 'choice', id: '00-luoshu/pass', text: '丙。' }]);
  const [cap, first] = played[0].beats.zh;
  assert.deepEqual(cap, { text: '二试，脑子。\n一面石壁，九个空格。\n「横竖斜，加起来都要一样。」', cap: true });
  assert.equal(first.text, '甲。');
  assert.ok(played[0].beats.en[0]?.cap || played[0].beats.en.length === 0, 'the other language opens on its own caption');
  assert.ok(!played[1].beats.zh.some(b => b.cap), 'a choice\'s passage has no caption');
  const r = withTold(null, played, '00-luoshu');
  assert.match(dialogHtml(r), /class="dlg told cap"/);
  assert.match(logHtml(advance(r)), /dlglogrow cap/);
});
