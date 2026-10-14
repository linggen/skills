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
import { beatsOf, passageFor, playOf, tellOf } from '../scripts/rules/tell.mjs';
import { advance, atLast, choicesUp, current, dialogHtml, keepReading, loadReading, logHtml, logLinkHtml, ofPlay, playing, readingFor, showAll, toldSoFar, withTold } from '../scripts/dialogue.js';
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

test('the last beat brings the choices up — inside the box, where 继续 stood; new passages in the same scene queue behind', () => {
  const beats = [{ text: 'a' }, { name: '马三', text: 'b' }, { text: 'c' }];
  let r = one(beats, 's1');
  assert.equal(choicesUp(r), false);
  assert.match(dialogHtml(r), /class="dlgnext" data-dlg-next[^>]*>继续 <span aria-hidden="true">▸<\/span>/, '「继续 ▸」, a control of its own');
  assert.match(dialogHtml(r, { lang: 'en' }), />Next <span aria-hidden="true">▸<\/span>/);
  assert.match(dialogHtml(r), /data-dlg-all>显示全文</);
  assert.match(dialogHtml(r), /data-dlg-log>回看</);
  assert.doesNotMatch(dialogHtml(r, { acts: '<button data-panel-exit="go">走</button>' }), /data-panel-exit/, 'no choices before the last beat');
  r = advance(advance(r));
  assert.equal(current(r).k, 2);
  assert.ok(playing(r) && choicesUp(r), 'the last beat stays up with the choices');
  const box = dialogHtml(r, { acts: '<button data-panel-exit="go">走</button>' });
  assert.match(box, /<div class="dlgacts panelcard"><button data-panel-exit="go">走<\/button><\/div>/, 'the choices in the box');
  assert.doesNotMatch(box, /data-dlg-next|data-dlg-all/, 'no 继续, no 显示全文 — and a tap on the text does not put the choices away');
  assert.match(box, /data-dlg-on/);
  assert.match(dialogHtml(r), /data-dlg-next/, 'no choices to offer: 继续 puts the box away');
  // a passage drawn while one plays (Ling Resolved what the player typed) queues behind it
  const mid = advance(one(beats, 's1'));
  const more = withTold(mid, [{ of: 'choice', id: 'x/y', beats: [{ text: 'd' }] }], 's1');
  assert.equal(current(more).k, 1, 'the one on show stays');
  assert.equal(current(more).n, 4);
  // a closed box — or one at its last beat — opens on the new beats, counted afresh
  for (const was of [{ ...mid, closed: true }, r]) {
    const again = withTold(was, [{ of: 'choice', id: 'x/y', beats: [{ text: 'd' }] }], 's1');
    assert.deepEqual([current(again).k, current(again).n, current(again).beat.text], [0, 1, 'd']);
    assert.ok(playing(again));
  }
  // a new scene begins a new reading
  assert.equal(current(withTold({ ...mid, closed: true }, [{ of: 'scene', id: 's2', beats: [{ text: 'x' }] }], 's2')).n, 1);
  // the scene's own passage told again (a new game) begins afresh
  assert.equal(current(withTold({ ...mid, closed: true }, [{ of: 'scene', id: 's1', beats: [{ text: 'z' }] }], 's1')).n, 1);
});

test('the count is the scene\'s own (2026-10-14: 00-masan opened on 「27 / 44」, replaying 00-shiao\'s last beat)', () => {
  const shiao = Array.from({ length: 26 }, (_, n) => ({ text: `石坳${n + 1}` }));
  const masan = [{ text: '马三来了。' }, { name: '马三', text: '租呢？' }];
  // 00-shiao played to its last beat (its choices up), then a choice taken: 00-masan starts at 1 / N
  let r = withTold(null, [{ of: 'scene', id: '00-shiao', beats: shiao }], '00-shiao', 'r1');
  while (!atLast(r)) r = advance(r);
  const next = withTold(r, [{ of: 'choice', id: '00-shiao/go', beats: [{ text: '那天傍晚。' }] }, { of: 'scene', id: '00-masan', beats: masan }], '00-masan', 'r1');
  assert.deepEqual([current(next).k, current(next).n, current(next).beat.text, current(next).before], [0, 3, '那天傍晚。', false]);
  assert.match(dialogHtml(next), /<span class="dlgcount">1 \/ 3<\/span>/);
  assert.ok(!flatTexts(next).includes('石坳26'), 'the last beat already seen does not play again');
  // left mid-passage (Ling moved on for a typed word): the rest of the old scene plays first,
  // from the beat AFTER the one on show, under 「上一景」 with a count of its own
  let mid = withTold(null, [{ of: 'scene', id: '00-shiao', beats: shiao.slice(0, 5) }], '00-shiao', 'r1');
  mid = advance(advance(mid)); // 石坳3 on show
  const carried = withTold(mid, [{ of: 'scene', id: '00-masan', beats: masan }], '00-masan', 'r1');
  assert.deepEqual([current(carried).beat.text, current(carried).k, current(carried).n, current(carried).before], ['石坳4', 0, 2, true]);
  assert.match(dialogHtml(carried), /<span class="dlgcount before">上一景 · 1 \/ 2<\/span>/);
  assert.match(dialogHtml(carried, { lang: 'en' }), /Before this · 1 \/ 2/);
  const own = advance(advance(carried));
  assert.deepEqual([current(own).beat.text, current(own).k, current(own).n, current(own).before], ['马三来了。', 0, 2, false]);
});
const flatTexts = (r) => r.items.flatMap((it) => (Array.isArray(it.beats) ? it.beats : it.beats.zh).map((b) => b.text));

test('显示全文 (2026-10-14: 跳过 dumped the rest into a panel, and closing it closed the box): the rest shows in the box, the choices at its end', () => {
  const beats = [{ text: 'a' }, { name: '马三', text: 'b' }, { text: 'c' }, { text: 'd' }];
  const r = advance(one(beats, 's1'));
  const all = showAll(r);
  assert.ok(playing(all), 'the box stays');
  assert.ok(choicesUp(all), 'the choices come up');
  const html = dialogHtml(all, { acts: '<button data-panel-exit="go">走</button>' });
  assert.match(html, /class="dlg told all choosing"/);
  assert.match(html, /<div class="dlgall"><div class="dlglogrow spoken"><b>马三<\/b><span>b<\/span><\/div><div class="dlglogrow"><span>c<\/span><\/div><div class="dlglogrow"><span>d<\/span><\/div><\/div>/, 'from the beat on show to the end, in order');
  assert.match(html, /<div class="dlgacts panelcard"><button data-panel-exit="go">走<\/button><\/div>/);
  assert.doesNotMatch(html, /data-dlg-all|dlglog"/, 'no panel, nothing more to show');
  assert.equal(showAll(all), all, 'once is enough');
  assert.equal(advance(all).closed, true, 'with no choices, 继续 puts it away');
  // a passage that comes after (a choice in the same scene) plays in the box as ever
  const then = withTold(all, [{ of: 'choice', id: 's1/x', beats: [{ text: 'e' }] }], 's1');
  assert.deepEqual([current(then).beat.text, then.all], ['e', null]);
  assert.doesNotMatch(dialogHtml(then), /dlgall/);
});

test('回看: what was told so far — the scenes before, then this one to the beat on show — with a plain close', () => {
  let r = withTold(null, [{ of: 'scene', id: 'a', beats: [{ text: '甲一' }, { text: '甲二' }] }], 'a', 'r1');
  r = advance(r);
  r = withTold(r, [{ of: 'scene', id: 'b', beats: [{ text: '乙一' }, { name: '马三', text: '乙二' }, { text: '乙三' }] }], 'b', 'r1');
  r = advance(r);
  const log = logHtml(r);
  assert.match(log, /aria-label="回看"/);
  assert.match(log, /data-dlg-logclose>✕ 收起</);
  assert.match(log, /甲一[\s\S]*甲二[\s\S]*dlglogscene now[\s\S]*乙一[\s\S]*乙二/, 'the scene before, then this one');
  assert.doesNotMatch(log, /乙三/, 'nothing not yet told');
  assert.match(logHtml(r, { lang: 'en' }), /aria-label="Look back"[\s\S]*✕ Close/);
  // the past is this play's: a Restart begins with none
  assert.deepEqual(withTold(r, [{ of: 'scene', id: 'a', beats: [{ text: 'x' }] }], 'a', 'r2').past, []);
  // kept short in this browser: the last six scenes
  let long = null;
  for (let n = 0; n < 9; n++) long = withTold(long, [{ of: 'scene', id: `s${n}`, beats: [{ text: `第${n}景` }] }], `s${n}`, 'r1');
  assert.equal(long.past.length, 6);
  assert.match(logLinkHtml({ ...r, closed: true }), /data-dlg-log>回看</);
});

test('a reading belongs to its play (Look\'s `run`): a forward move carries the unplayed beats; a Restart, Load or Undo drops them (2026-10-14)', () => {
  const beats = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
  const mid = advance(withTold(null, [{ of: 'scene', id: 'gate', beats }], 'gate', 'r1'));
  assert.equal(mid.run, 'r1');
  // (a) a forward move in the same play: the rest of the old scene plays first, from where it stood
  const on = withTold(mid, [{ of: 'scene', id: 'next', beats: [{ text: 'x' }] }], 'next', 'r1');
  assert.deepEqual([on.run, current(on).before, current(on).beat.text], ['r1', true, 'c'], 'from the beat after the one on show');
  // (b) the play replaced (init / load / undo: a new run): the old play's beats never lead in
  const anew = withTold(mid, [{ of: 'scene', id: 'opening', beats: [{ text: '蒙山脚下' }] }], 'opening', 'r2');
  assert.deepEqual([anew.run, current(anew).k, current(anew).n, current(anew).beat.text], ['r2', 0, 1, '蒙山脚下']);
  // (c) a restart into the same scene id: the old reading is not resumed, nor queued behind
  assert.equal(readingFor(mid, 'gate', 'r1'), mid);
  assert.equal(readingFor(mid, 'gate', 'r2'), null, 'the stage shows no old reading for the new play');
  const same = withTold(mid, [{ of: 'choice', id: 'gate/x', beats: [{ text: 'z' }] }], 'gate', 'r2');
  assert.deepEqual([current(same).k, current(same).n, current(same).beat.text], [0, 1, 'z']);
  assert.equal(ofPlay(mid, 'r2'), null);
  // A save from before runs (Look has none) keeps a reading with none — the first Look after
  // the update wipes nothing — but a reading with none never runs on into a play that has one.
  const old = { ...mid, run: undefined };
  assert.equal(readingFor(old, 'gate', null), old);
  assert.equal(withTold(old, [{ of: 'scene', id: 'next', beats: [{ text: 'x' }] }], 'next', null).items.length, 2, 'carried on');
  assert.equal(readingFor(old, 'gate', 'r1'), null);
  assert.equal(current(withTold(old, [{ of: 'scene', id: 'next', beats: [{ text: 'x' }] }], 'next', 'r1')).n, 1);
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
  assert.match(src, /if \(cardsAhead\(\) \|\| choicesInBox\(\)\) cards = cards\.filter\(\(c\) => c\.card !== 'panel'\);/, 'one text box: no scene card while the box tells, nor while its choices stand inside it');
  // the scene's choices come before the box's own taps: a choice inside the box resolves, never goes on
  assert.ok(src.indexOf("['[data-panel-exit]'") < src.indexOf("['[data-dlg-next]'"));
  assert.ok(src.indexOf("['[data-look-at]'") < src.indexOf("['[data-dlg-next]'"));
  const css = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.css'), 'utf8');
  assert.match(css, /\.view:has\(\.dlgwrap:not\(:empty\)\) \.slots \{ bottom:/);
  assert.match(css, /\.dlgwrap \{ left: 16px; right: 16px;/, 'narrow: 16px gutters');
});

test('the caption is no beat (2026-10-14: told three times) — the box plays the book alone; the caption stands under the place', () => {
  const s = named();
  const played = playOf(content, s, [{ of: 'scene', id: '00-luoshu', text: '甲。\n\n乙。' }, { of: 'choice', id: '00-luoshu/pass', text: '丙。' }]);
  assert.deepEqual(played[0].beats.zh.map((b) => b.text), ['甲。', '乙。']);
  assert.ok(played.every((t) => !t.beats.zh.some((b) => b.cap) && !t.beats.en.some((b) => b.cap)));
  const html = fs.readFileSync(path.join(ROOT, 'scripts/index.html'), 'utf8');
  assert.match(html, /<span class="place" id="place"><\/span><\/div><div class="placecap" id="placeCap"><\/div>/);
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(src, /\$\('placeCap'\)\.textContent = /);
});

test('the box says the book\'s words, not its reader marks: [词]{注=…}, [句]{典=…} and a bare {典=…} are the reader\'s links (2026-10-14: 赵昂 showed raw in 01-cauldron)', () => {
  const s = newState(content, 'zh', NOW);
  const scenes = Object.values(content.chapters).flatMap((c) => Object.values(c.scenes ?? {}));
  let n = 0;
  for (const sc of scenes) {
    for (const pair of [sc.story, ...(sc.exits ?? []).map((x) => x.story)]) {
      if (!pair?.zh || !/\{(?:注|典|音)=/.test(pair.zh)) continue;
      n++;
      assert.doesNotMatch(passageFor(content, s, pair), /\{(?:注|典|音)=|\]\{/, sc.id);
    }
  }
  assert.ok(n > 0, 'some passage carries a mark');
  assert.equal(passageFor(content, s, { zh: '「太一宫，[赵昂]{注=zhaoang}。」《抱朴子》{典=baopu-jishan}里说' }), '「太一宫，赵昂。」《抱朴子》里说');
});
