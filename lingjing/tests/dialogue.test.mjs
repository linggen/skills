// The story on the stage (Hanli, 2026-09-29: 「对话框先做，go」; since 2026-10-14 the full
// stage of the approved prototypes, no box): the book's passage for each beat is played on
// the stage itself, a paragraph at a time, its sentences coming up by themselves (lines.js)
// — a line spoken under its speaker's name (the hero's under the player's 名字, never a
// face; 银月's in her own colour), any other paragraph the book's words. The rules parse the
// beats (rules/tell.mjs beatsOf); the page plays them (dialogue.js), and a tap costs no model turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { resolve } from '../scripts/rules.mjs';
import { beatsOf, passageFor, playOf, tellOf } from '../scripts/rules/tell.mjs';
import { advance, atLast, beatKey, choicesUp, current, keepReading, loadReading, logHtml, logLinkHtml, ofPlay, playing, readingFor, showAll, storyHtml, toldSoFar, pacedAt, wholeBeats, wholeOf, withTold } from '../scripts/dialogue.js';
import { walk } from './prologue.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = { now: NOW, quests: [] };
const one = (beats, scene = 's') => withTold(null, [{ of: 'scene', id: 'x', beats }], scene);
const named = (lang = 'zh') => walk(newState(content, lang, NOW), [['resolve', { exit: 'begin' }], ['played']], content, NOW);

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
  const html = storyHtml(one([you]));
  assert.doesNotMatch(html, /<img/, 'no portrait for the hero');
  assert.match(html, /<p class="line spoken"><b class="who">沈小满<\/b><span class="s">嗯。<\/span><\/p>/, 'his line under his name');
});

test('银月\'s lines carry her face in the form her scene names (the fox in the valley) — on the stage, her own colour', () => {
  const s = named();
  const cliff = beatsOf(content, s, { of: 'scene', id: '00-cliff', text: '**银月**：让开。' })[0];
  assert.equal(cliff.who, 'yinyue');
  assert.equal(cliff.name, '银月');
  assert.equal(cliff.art, 'art/people/yinyue-fox.webp');
  // Her words play in place, silver-blue, under her name (proto k); her face is the footer's 木牌, not a box's.
  const html = storyHtml(one([cliff]), { herId: 'yinyue' });
  assert.match(html, /<p class="line yy"><b class="who">银月<\/b><span class="s">让开。<\/span><\/p>/);
  assert.doesNotMatch(html, /<img/);
  assert.match(storyHtml(one([{ ...cliff, who: 'masan', name: '马三' }]), { herId: 'yinyue' }), /class="line spoken"/, 'anyone else is spoken, not hers');
  // every 银月 line in the book resolves to her
  for (const sc of Object.values(content.chapters['00-prologue'].scenes)) {
    for (const pair of [sc.story, ...(sc.exits ?? []).map(e => e.story)].filter(Boolean)) {
      const beats = beatsOf(content, s, { of: 'scene', id: sc.id, text: pair.zh.replace(/⟪|⟫/g, '') });
      for (const b of beats.filter(b => b.name === '银月')) assert.equal(b.who, 'yinyue', sc.id);
    }
  }
});

test('a move plays its two passages in order — the choice\'s outcome, then the scene entered — one beat a tap', () => {
  // What the opening owed is drawn first, as the page does (石坳村's morning is `begin`'s passage since 接雨, 2026-10-14).
  const s = walk(tellOf(content, named()).keep, [['resolve', { exit: 'strike' }]], content, NOW);
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

test('the last beat brings the choices up — on the stage, its last line faint above them; new passages in the same scene queue behind', () => {
  const beats = [{ text: 'a' }, { name: '马三', text: 'b' }, { text: 'c' }];
  let r = one(beats, 's1');
  assert.equal(choicesUp(r), false);
  // The quiet controls: 回看 · 慢 中 快 · the count · 「跳过」 (Hanli, 2026-10-14: 「2改跳过」) — never 继续.
  assert.match(storyHtml(r), /<button class="q skip" data-dlg-all>跳过 <span aria-hidden="true">»<\/span><\/button>/);
  assert.match(storyHtml(r, { lang: 'en' }), /data-dlg-all>Skip </);
  assert.doesNotMatch(storyHtml(r), /继续|显示全文/);
  assert.match(storyHtml(r), /data-dlg-log>回看</);
  assert.match(storyHtml(r, { speed: 'fast' }), /<button data-dlg-speed="slow" aria-pressed="false">慢<\/button><button data-dlg-speed="mid" aria-pressed="false">中<\/button><button data-dlg-speed="fast" class="on" aria-pressed="true">快<\/button>/);
  assert.match(storyHtml(r), /class="story" data-dlg-on data-dlg-next data-story="\|s1\|0\|0\|zh"/, 'the whole stage is a tap, keyed by its beat');
  assert.doesNotMatch(storyHtml(r, { acts: '<button data-panel-exit="go">走</button>' }), /data-panel-exit/, 'no choices before the last beat');
  r = advance(advance(r));
  assert.equal(current(r).k, 2);
  assert.ok(playing(r) && choicesUp(r), 'the last beat stays up with the choices');
  const box = storyHtml(r, { acts: '<button data-panel-exit="go">走</button>' });
  assert.match(box, /<div class="ways"><div class="last">c<\/div><div class="wayacts"><button data-panel-exit="go">走<\/button><\/div><\/div>/, 'the choices on the stage, the last line above them');
  assert.match(box, /class="story choosing"/, 'they stand once the words are read (lines.js lights `.done`)');
  assert.doesNotMatch(box, /data-dlg-all/, 'nothing left to skip');
  assert.match(box, /data-dlg-on/);
  assert.doesNotMatch(storyHtml(r), /class="ways"/, 'no choices to offer: read through, the reading is put away by itself');
  assert.equal(advance(r).closed, true);
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
  assert.match(storyHtml(next), /<span class="count">1 \/ 3<\/span>/);
  assert.ok(!flatTexts(next).includes('石坳26'), 'the last beat already seen does not play again');
  // left mid-passage (Ling moved on for a typed word): the rest of the old scene plays first,
  // from the beat AFTER the one on show, under 「上一景」 with a count of its own
  let mid = withTold(null, [{ of: 'scene', id: '00-shiao', beats: shiao.slice(0, 5) }], '00-shiao', 'r1');
  mid = advance(advance(mid)); // 石坳3 on show
  const carried = withTold(mid, [{ of: 'scene', id: '00-masan', beats: masan }], '00-masan', 'r1');
  assert.deepEqual([current(carried).beat.text, current(carried).k, current(carried).n, current(carried).before], ['石坳4', 0, 2, true]);
  assert.match(storyHtml(carried), /<span class="count before">上一景 · 1 \/ 2<\/span>/);
  assert.match(storyHtml(carried, { lang: 'en' }), /Before this · 1 \/ 2/);
  const own = advance(advance(carried));
  assert.deepEqual([current(own).beat.text, current(own).k, current(own).n, current(own).before], ['马三来了。', 0, 2, false]);
});
const flatTexts = (r) => r.items.flatMap((it) => (Array.isArray(it.beats) ? it.beats : it.beats.zh).map((b) => b.text));

test('跳过 (2026-10-14; it was 显示全文 in the box): the stage stands on the 回\'s last beat shown whole, the choices at its end; what was skipped is in 回看', () => {
  const beats = [{ text: 'a' }, { name: '马三', text: 'b' }, { text: 'c' }, { text: 'd' }];
  const r = advance(one(beats, 's1'));
  const all = showAll(r);
  assert.ok(playing(all), 'the reading stays');
  assert.ok(choicesUp(all), 'the choices come up');
  const html = storyHtml(all, { acts: '<button data-panel-exit="go">走</button>' });
  assert.match(html, /class="story choosing shown"/);
  assert.match(beatKey(all), /\|all$/, 'the clock shows it whole at once (lingjing.js syncLines `instant`)');
  assert.match(html, /<span class="s">d<\/span>[\s\S]*<div class="ways"><div class="last">d<\/div><div class="wayacts"><button data-panel-exit="go">走<\/button><\/div><\/div>/);
  assert.doesNotMatch(html, /data-dlg-all/, 'nothing more to skip');
  assert.match(logHtml(all), /b[\s\S]*c[\s\S]*d/, '回看 holds the beats skipped');
  assert.equal(showAll(all), all, 'once is enough');
  assert.equal(advance(all).closed, true, 'with no choices, it is put away');
  // a passage that comes after (a choice in the same scene) plays as ever, a sentence at a time
  const then = withTold(all, [{ of: 'choice', id: 's1/x', beats: [{ text: 'e' }] }], 's1');
  assert.deepEqual([current(then).beat.text, then.all], ['e', null]);
  assert.doesNotMatch(storyHtml(then), /shown/);
  assert.doesNotMatch(beatKey(then), /all/);
});

test('快 (2026-10-15, his: 「快的速度, 不要一句一句显示, 直接都显示出来」): the rest of the passage at once, one column — speakers, her words, 亮相 cards, then the choices', () => {
  const beats = [{ text: '甲。' }, { name: '马三', text: '走吧。' }, { text: '风停了。她说别回头。', asides: ['她说别回头。'], notes: ['masan'] }, { text: '丁。' }];
  const faces = [{ id: 'masan', name: '马三', image: 'p/masan.webp', lines: ['卖饼的'] }];
  // tapped mid-passage (beat 2 of 4 on show): the remainder, from the beat on show to the end
  const mid = advance(one(beats, 's1'));
  const w = wholeOf(mid);
  assert.deepEqual([w.i, w.j, w.all], [0, 3, { i: 0, j: 1, whole: true }], 'the reading stands on the last beat; the column opens at the beat on show');
  assert.deepEqual(wholeBeats(w).map((b) => b.text), ['走吧。', '风停了。她说别回头。', '丁。']);
  assert.equal(wholeOf(w), w, 'once is enough');
  assert.ok(choicesUp(w), 'its end is the passage\'s end: the choices are up');
  assert.match(beatKey(w), /\|whole$/, 'a key of its own: the clock shows it at once (syncLines `instant`), and storyDone fires');
  const html = storyHtml(w, { acts: '<button data-panel-exit="go">走</button>', speed: 'fast', faces, src: (f) => `/w/${f}` });
  assert.match(html, /class="story choosing whole"/);
  assert.doesNotMatch(html, /甲。/, 'what was read already is not shown again');
  assert.match(html, /<p class="line spoken" data-beat="0\.1"><b class="who">马三<\/b><span class="s on">走吧。<\/span><\/p>/, 'paragraphs apart, the speaker kept');
  assert.match(html, /<span class="yy">她说别回头。<\/span>/, '⟪银月⟫ stays silver-blue');
  assert.match(html, /她说别回头。<\/span><\/span><\/p><figure class="wface" data-sight-id="masan"><img src="\/w\/p\/masan.webp" alt=""><figcaption><b>马三<\/b><span>卖饼的<\/span>/, 'his 亮相 card inline, after the paragraph that brings him on');
  assert.match(html, /丁。<\/span><\/p><\/div><div class="wayacts"><button data-panel-exit="go">走<\/button><\/div><\/div>/, 'the choices after the text, at the column\'s end');
  assert.doesNotMatch(html, /class="ways"|data-dlg-all|data-dlg-onward/, 'no faint last line, nothing to skip, no 接着 where the choices stand');
  assert.match(html, /<span class="count">2–4 \/ 4<\/span>/, 'the count names the beats the column holds');
  assert.match(html, /data-dlg-speed="fast" class="on"/);
  assert.match(logHtml(w), /甲。[\s\S]*走吧。[\s\S]*丁。/, '回看 holds them all');
  // no choices to offer: 「接着往下」, his own tap, is the way on; then the reading is put away
  assert.match(storyHtml(w), /<div class="onward"><button class="q" data-dlg-onward>接着往下 <span aria-hidden="true">›<\/span><\/button><\/div>/);
  assert.equal(advance(w).closed, true);
  // from the first beat, the whole passage
  assert.equal(wholeBeats(wholeOf(one(beats, 's1'))).length, 4);
  // a passage that comes after (the choice taken) begins afresh: a new column once 快 opens it
  const then = withTold(w, [{ of: 'choice', id: 's1/go', beats: [{ text: '戊。' }, { text: '己。' }] }], 's1');
  assert.deepEqual([current(then).beat.text, then.all], ['戊。', null], 'moved on, the old column is left behind');
  assert.deepEqual(wholeBeats(wholeOf(then)).map((b) => b.text), ['戊。', '己。']);
});

test('快 → 中 mid-passage (2026-10-15, his: 「由快切回中时, 仍然是全屏」): paced again at once, from the beat in view — never from the end', () => {
  const beats = [{ text: '甲。' }, { text: '乙。' }, { text: '丙。' }, { text: '丁。' }, { text: '戊。' }];
  const w = wholeOf(advance(one(beats, 's1')));
  assert.match(storyHtml(w), /<p class="line told" data-beat="0\.1">/, 'each paragraph names its beat');
  // he had scrolled to 丙 (the paragraph at the top of the column's view)
  const back = pacedAt(w, { i: 0, j: 2 });
  assert.deepEqual([back.i, back.j, back.all], [0, 2, null]);
  assert.equal(current(back).beat.text, '丙。');
  assert.doesNotMatch(storyHtml(back), /whole|wholecol/, 'the sentences again, not the column');
  assert.match(beatKey(back), /\|0\|2\|zh$/, 'a beat key of its own: the clock plays it from its first sentence');
  assert.equal(choicesUp(back), false, 'the choices wait for the end again');
  assert.match(logHtml(back), /甲。[\s\S]*乙。[\s\S]*丙。/, 'what stood above it is in 回看');
  // nothing known in view (or a place outside the column): from where the column opened
  assert.deepEqual([pacedAt(w).i, pacedAt(w).j], [0, 1]);
  assert.deepEqual([pacedAt(w, { i: 0, j: 0 }).j, pacedAt(w, { i: 7, j: 7 }).j], [1, 1]);
  assert.equal(pacedAt(back), back, 'a paced reading is left alone');
  // and back to 快: whole again from there
  assert.deepEqual(wholeBeats(wholeOf(back)).map((b) => b.text), ['丙。', '丁。', '戊。']);
});

test('快 never runs past a 回\'s turn: the column ends at the 回\'s last beat, 「接着往下」 goes on, and the next 回 opens as its own column', () => {
  const r = withTold(null, [{ of: 'scene', id: 'a', hui: 'h1', beats: [{ text: '一。' }, { text: '二。' }] }, { of: 'scene', id: 'b', hui: 'h2', beats: [{ text: '三。' }, { text: '四。' }] }], 'a');
  const w = wholeOf(r);
  assert.deepEqual(wholeBeats(w).map((b) => b.text), ['一。', '二。']);
  assert.equal(atLast(w), false);
  assert.match(storyHtml(w, { acts: '<button data-panel-exit="go">走</button>' }), /data-dlg-onward/, 'no choices before the reading\'s end');
  const next = advance(w);
  assert.deepEqual([current(next).beat.text, next.all], ['三。', null], 'the next 回 is a beat of its own, its voice and clock back');
  assert.deepEqual(wholeBeats(wholeOf(next)).map((b) => b.text), ['三。', '四。']);
  // after 跳过, 快 shows what 跳过 skipped as the column
  assert.deepEqual(wholeBeats(wholeOf(showAll(r))).map((b) => b.text), ['一。', '二。']);
});

test('回看: what was told so far — the scenes before, then this one to the beat on show — with a plain close', () => {
  let r = withTold(null, [{ of: 'scene', id: 'a', beats: [{ text: '甲一' }, { text: '甲二' }] }], 'a', 'r1');
  r = advance(r);
  r = withTold(r, [{ of: 'scene', id: 'b', beats: [{ text: '乙一' }, { name: '马三', text: '乙二' }, { text: '乙三' }] }], 'b', 'r1');
  r = advance(r);
  const log = logHtml(r);
  assert.match(log, /aria-label="回看"/);
  assert.match(log, /data-dlg-logclose>回到这里</);
  assert.match(log, /甲一[\s\S]*甲二[\s\S]*dlglogscene now[\s\S]*乙一[\s\S]*乙二/, 'the scene before, then this one');
  assert.doesNotMatch(log, /乙三/, 'nothing not yet told');
  assert.match(logHtml(r, { lang: 'en' }), /aria-label="Look back"[\s\S]*Back to it/);
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
  // A 前情 is the teller's (Ling's, bronze, proto k), marked so.
  assert.match(storyHtml(r), /<p class="line ling"><b class="who">Ling<\/b><span class="tag">前情<\/span><span class="s">马三来收租/);
  assert.match(storyHtml(r, { lang: 'en' }), /<span class="tag">Before this<\/span>/);
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

test('the story on the page: the whole stage, the keys that go on, and what it yields to (queue.js)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'scripts/index.html'), 'utf8');
  assert.match(html, /<div class="dlgwrap" id="dlg"><\/div>/);
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(src, /e\.key === ' ' \|\| e\.key === 'Enter'/);
  assert.match(src, /boxGivesWay\(\{ bout: Boolean\(bout\), appearing: Boolean\(view\.appearing\)/);
  assert.match(src, /cards = afterBook\(cards, cardsAhead\(\)\);/, 'the games wait for the book — none over the passage');
  assert.match(src, /if \(cardsAhead\(\) \|\| choicesInBox\(\)\) cards = cards\.filter\(\(c\) => c\.card !== 'panel'\);/, 'one text box: no scene card while the box tells, nor while its choices stand inside it');
  // the scene's choices come before the box's own taps: a choice inside the box resolves, never goes on
  assert.ok(src.indexOf("['[data-panel-exit]'") < src.indexOf("['[data-dlg-next]'"));
  assert.ok(src.indexOf("['[data-look-at]'") < src.indexOf("['[data-dlg-next]'"));
  // Read through, the page goes on by itself — the same advance a tap was — never past the way on.
  const done = src.slice(src.indexOf('function storyDone('), src.indexOf('function storyDone(') + 900);
  assert.match(done, /if \(last && \$\('dlg'\)\?\.querySelector\('\.story \.ways'\)\) return;/, 'the choices up: his tap');
  assert.match(done, /\(last && \(look\?\.tell_owed \|\| drawingTold\)\)/, 'never closes the reading while more is still to be drawn');
  assert.match(done, /nextBeat\(\);/);
  const css = fs.readFileSync(path.join(ROOT, 'scripts/story.css'), 'utf8');
  assert.match(css, /\.dlgwrap \{ position: absolute; inset: 0;/, 'the whole stage');
  assert.match(css, /body\.storying \.slots \{ visibility: hidden; \}/, 'nothing stands beside the story');
  assert.match(css, /\.story \.ways \{ bottom: 62px; max-height: calc\(100% - 62px - 5%\); padding: 0 16px; \}/, 'narrow: 16px gutters, capped to the stage');
  // Legible wherever the words stand (2026-10-15, his 「字看不清了, 上面的」: five choices pushed the faint
  // line into a bright sky): the block is capped to the stage (its choices scroll), carries its own ink
  // wash behind the words, and the faint line is dimmer than a read line but never faint past reading.
  assert.match(css, /\.story \.ways \{[^}]*max-height: calc\(100% - 70px - 7%\)[^}]*isolation: isolate/, 'the way on never climbs off the stage');
  assert.match(css, /\.story \.ways::before \{[^}]*z-index: -1[^}]*top: -150px[^}]*rgba\(13, 17, 20, \.78\) 150px/, 'its wash fades in above the faint line, dark behind it');
  assert.match(css, /\.story \.wayacts \{[^}]*min-height: 96px; overflow-y: auto/, 'the choices scroll, the words keep their place');
  assert.match(css, /\.story \.ways \.last \{[^}]*color: rgba\(241, 236, 225, \.74\)/, 'the faint line: dimmer, still ≥ 4.5:1 on its wash');
  assert.match(css, /\.story \.wayacts \.donote \{[^}]*color: #f6d3ca; background: rgba\(13, 17, 20, \.62\)/, 'a finding: light words on ink, not pink on paper');
  assert.match(css, /\.view\.jin \.story \.ways::before \{ display: none; \}/, '今线 keeps its pale stage');
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
      if (!pair?.zh || !/\{(?:注|典|音|景)=/.test(pair.zh)) continue;
      n++;
      assert.doesNotMatch(passageFor(content, s, pair), /\{(?:注|典|音|景)=|\]\{/, sc.id);
    }
  }
  assert.ok(n > 0, 'some passage carries a mark');
  assert.equal(passageFor(content, s, { zh: '「太一宫，[赵昂]{注=zhaoang}。」《抱朴子》{典=baopu-jishan}里说' }), '「太一宫，赵昂。」《抱朴子》里说');
});

test('跳过 stands only where it would skip something — not on a 回\'s last beat, where showAll stops (the crawler, 2026-10-15: 「9 / 9」 under 古三\'s header, a dead 跳过)', () => {
  // 今 · 一's last passage, then 古三's: the box at 今 · 一's last beat.
  const items = [{ of: 'choice', id: 'a/go', hui: 'j01', beats: { zh: [{ text: '1' }, { text: '2' }] } }, { of: 'scene', id: 'b', hui: 'h03', beats: { zh: [{ text: '3' }, { text: '4' }] } }];
  let r = withTold(null, items, 'b');
  assert.match(storyHtml(r), /data-dlg-all/, 'mid-回: something to skip');
  r = advance(r);
  assert.equal(showAll(r), r, 'the 回\'s last beat: nothing more to skip before its turn');
  assert.doesNotMatch(storyHtml(r), /data-dlg-all/, 'so no 跳过 there — the box\'s tap goes on');
  r = advance(r);
  assert.match(storyHtml(r), /data-dlg-all/, 'into the next 回: 跳过 again');
});

test('a tap on the story\'s own controls puts an open popover away first — 回看 under the 事 book left the book over the log\'s 合上 (the crawler, 2026-10-15)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const list = src.slice(src.indexOf('const CLICKS = ['), src.indexOf('\n];', src.indexOf('const CLICKS = [')));
  const at = (sel) => list.indexOf(`['${sel}'`);
  assert.ok(at('*') > at('[data-book]') && at('*') > at('[data-wx-clear]'), 'the popovers\' own taps first');
  for (const sel of ['[data-dlg-log]', '[data-dlg-all]', '[data-dlg-next]', '[data-panel-exit]']) assert.ok(at('*') < at(sel), `then the catch-all, before ${sel}`);
});
