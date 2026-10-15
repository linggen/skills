// The full stage (Hanli, 2026-10-14: the approved prototypes — 「可以，按你的意见」): a beat's
// words come up a sentence at a time by themselves, at the approved pace (about 165 ms a
// character, at least 2.6 s, and a pause at the end of the screen); a tap brings the next one
// sooner, holding pauses, 慢 · 中 · 快 is the viewer's own, and the beat read, the page goes on
// (lingjing.js storyDone → dialogue.js advance, the same step a tap was). The backdrop is the
// weather's painting from the world's declared table.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { END_PAUSE_MS, SPEEDS, WHOLE, createLines, keepSpeed, linesHtml, paceOf, paraHtml, screensOf, sentencesOf, speedNow, voiceOf, wholeNow } from '../scripts/lines.js';
import { DAYPARTS, WEATHER, backdropOf } from '../scripts/atmos.js';
import { KINDS } from '../scripts/rules/weather.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

test('a beat into sentences — a closing quote stays with its sentence — and the sentences into screens', () => {
  assert.deepEqual(sentencesOf('葛六笑了：「百日是打底子。我打了六年。」满廊的人笑了，葛六没笑：「……我当年，也这么说。」'),
    ['葛六笑了：「百日是打底子。', '我打了六年。」', '满廊的人笑了，葛六没笑：「……我当年，也这么说。」']);
  assert.deepEqual(sentencesOf('没有句号的一句'), ['没有句号的一句']);
  assert.deepEqual(sentencesOf('He ran. "Stop!" she said. Then quiet'), ['He ran.', '"Stop!" she said.', 'Then quiet']);
  assert.deepEqual(sentencesOf(''), []);
  const long = Array.from({ length: 6 }, (_, k) => `第${k}句写得长一些，长到一屏放不下太多这样的句子，读的人要歇一口气。`).join('');
  const screens = screensOf(long);
  assert.ok(screens.length > 1, 'a long paragraph is more than one screen');
  for (const s of screens) assert.ok(s.join('').length <= 120 || s.length === 1, 'a screen is a few lines, never a wall');
  assert.equal(screens.flat().join(''), long, 'nothing lost');
});

test('the pace: ~165 ms a character, never under 2.6 s nor over 11 s, the screen\'s end holds longer; the viewer\'s speed scales it', () => {
  assert.equal(paceOf('短。'), 2600);
  assert.equal(paceOf('一'.repeat(40)), 900 + 40 * 165);
  assert.equal(paceOf('一'.repeat(200)), 11000);
  assert.equal(paceOf('短。', { last: true }), 2600 + END_PAUSE_MS);
  assert.equal(paceOf('一'.repeat(40), { f: SPEEDS.fast }), Math.round((900 + 40 * 165) * SPEEDS.fast));
  // 2026-10-15, his: 「中可以用现在快的速度」 — 慢 the old 中 (×1), 中 the old 快 (×0.45); 快 is the whole passage at once
  assert.equal(SPEEDS.slow, 1);
  assert.equal(SPEEDS.mid, 0.45);
  assert.equal(WHOLE, 'fast');
  assert.equal(paceOf('短。', { f: SPEEDS.mid }), Math.round(2600 * 0.45), 'the floor scales with the speed: a short sentence 1.2 s at 中');
  assert.ok(paceOf('a'.repeat(60), { lang: 'en' }) < paceOf('一'.repeat(60)), 'English reads by the word');
  // 慢 中 快 is kept in this browser; storage off, it is 中
  const mem = new Map(), store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(speedNow(store), 'mid');
  keepSpeed('slow', store);
  assert.equal(speedNow(store), 'slow');
  keepSpeed('nonsense', store);
  assert.equal(speedNow(store), 'slow');
  assert.equal(speedNow({ getItem: () => { throw new Error('denied'); } }), 'mid');
  // 快 is kept like the others: every later passage opens whole until a speed is picked again
  assert.equal(wholeNow(store), false);
  keepSpeed('fast', store);
  assert.equal(wholeNow(store), true);
  assert.equal(wholeNow({ getItem: (k) => mem.get(k) ?? null }), true, 'read back on a reload');
  keepSpeed('mid', store);
  assert.equal(wholeNow(store), false);
  keepSpeed('fast', { setItem: () => { throw new Error('denied'); } }); // storage off: no throw
});

test('whose words: 银月 silver-blue (her id), a 前情 the teller\'s (Ling), a named speaker, else the book', () => {
  assert.equal(voiceOf({ who: 'yinyue', name: '银月', text: '……左边。' }, 'yinyue'), 'yy');
  assert.equal(voiceOf({ who: 'yinyue', name: '银月', text: 'x' }, null), 'spoken', 'no companion in this world: just a speaker');
  assert.equal(voiceOf({ text: 'x', recap: true }, 'yinyue'), 'ling');
  assert.equal(voiceOf({ name: '葛六', text: 'x' }), 'spoken');
  assert.equal(voiceOf({ text: 'x' }), 'told');
  const html = linesHtml({ text: '甲。乙。' });
  assert.equal(html, '<div class="screen" data-screen="0"><p class="line told"><span class="s">甲。</span><span class="s">乙。</span></p></div>');
});

/* A fake clock: setTimeout queues, run() fires the next one; `at` is its now (advance by hand). */
function clock() {
  let id = 0;
  const q = new Map();
  return {
    at: 0,
    now() { return this.at; },
    pending() { return [...q.values()].map((x) => x.ms); },
    setTimeout: (fn, ms) => { q.set(++id, { fn, ms }); return id; },
    clearTimeout: (k) => q.delete(k),
    next() { const [k, t] = [...q.entries()][0] ?? []; if (!k) return null; q.delete(k); t.fn(); return t.ms; },
    get size() { return q.size; },
  };
}
/* A screen's DOM, enough for the clock: screens of spans with classList and textContent. */
function fakeHost(screens) {
  const cls = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), toggle: (c, on) => (on ? s.add(c) : s.delete(c)), contains: (c) => s.has(c), s }; };
  const style = new Map();
  const host = { style: { setProperty: (k, v) => style.set(k, v), getPropertyValue: (k) => style.get(k) ?? '' }, classList: cls(), screens: screens.map((ss) => ({ hidden: false, classList: cls(), spans: ss.map((t) => ({ textContent: t, classList: cls() })) })) };
  host.querySelectorAll = (sel) => (sel === '.screen' ? host.screens.map((sc) => ({ ...sc, set hidden(v) { sc.hidden = v; }, get hidden() { return sc.hidden; }, querySelectorAll: () => sc.spans })) : []);
  const lit = () => host.screens.map((sc) => sc.spans.filter((x) => x.classList.contains('on')).length);
  return { host, lit };
}

test('the clock: sentence after sentence by itself, screen after screen, then the beat read — once', () => {
  const t = clock(), done = [];
  const lines = createLines({ onDone: (k, tapped) => done.push([k, Boolean(tapped)]), timer: t, f: () => 1 });
  const { host, lit } = fakeHost([['甲。', '乙。'], ['丙。']]);
  lines.sync(host, 'b1');
  assert.deepEqual(lit(), [0, 0], 'nothing lit before the lead-in');
  assert.equal(t.next(), 500);
  assert.deepEqual(lit(), [1, 0]);
  assert.equal(t.next(), 2600, 'its own pace');
  assert.deepEqual(lit(), [2, 0]);
  assert.equal(t.next(), 2600 + END_PAUSE_MS, 'the screen\'s last holds longer');
  t.next(); // the screen fades out, the next comes up
  assert.equal(host.screens[0].hidden, true);
  assert.deepEqual(lit(), [2, 1]);
  t.next();
  assert.deepEqual(done, [['b1', false]], 'read through: the page goes on');
  assert.ok(lines.done && host.classList.contains('done'));
  // the same beat repainted carries on; a tap on a read beat asks again (the way on, or the next beat)
  lines.sync(host, 'b1');
  lines.tap();
  assert.deepEqual(done.at(-1), ['b1', true]);
});

test('a tap brings the next sentence now; holding stops the clock, letting go goes on; 跳过 shows the beat whole', () => {
  const t = clock(), done = [];
  const lines = createLines({ onDone: (k) => done.push(k), timer: t, f: () => 1 });
  const { host, lit } = fakeHost([['甲。', '乙。', '丙。']]);
  lines.sync(host, 'b2');
  lines.tap();
  assert.deepEqual(lit(), [1]);
  lines.tap();
  assert.deepEqual(lit(), [2], 'no waiting for the clock');
  lines.hold(true);
  assert.equal(t.size, 0, 'held: nothing is timed');
  assert.ok(host.classList.contains('held'));
  lines.hold(false);
  assert.equal(t.next(), 600, 'let go: it goes on a moment later');
  assert.deepEqual(lit(), [3]);
  // a new beat starts from its first word; `instant` (跳过 on the 回's last beat) is read at once
  const b = fakeHost([['子。', '丑。']]);
  lines.sync(b.host, 'b3', { instant: true });
  assert.deepEqual(b.lit(), [2]);
  assert.deepEqual(done, ['b3']);
  lines.sync(null);
  assert.equal(lines.key, null, 'nothing on the stage: no clock');
});

test('快\'s paragraph: one beat whole, every sentence lit, the speaker kept, 银月\'s words silver-blue where they stand', () => {
  assert.equal(paraHtml({ text: '甲。乙。' }), '<p class="line told"><span class="s on">甲。</span><span class="s on">乙。</span></p>');
  assert.equal(paraHtml({ name: '葛六', text: '走。' }), '<p class="line spoken"><b class="who">葛六</b><span class="s on">走。</span></p>');
  assert.match(paraHtml({ text: '风停了。她说别回头。他走了。', asides: ['她说别回头。'] }), /<span class="s on"><span class="yy">她说别回头。<\/span><\/span>/);
  assert.match(paraHtml({ who: 'yinyue', name: '银月', text: '左边。' }, { herId: 'yinyue' }), /^<p class="line yy"><b class="who">银月<\/b>/);
  assert.equal(paraHtml({ text: '' }), '');
  assert.match(paraHtml({ text: '甲。' }, { place: '2.5' }), /^<p class="line told" data-beat="2\.5">/, 'its place, for 中 to pick up from');
});

test('快\'s column on the clock: shown at once, storyDone fires once by itself, and his tap is the way on', () => {
  const t = clock(), done = [];
  const lines = createLines({ onDone: (k, tapped) => done.push([k, Boolean(tapped)]), timer: t, f: () => 1 });
  const { host } = fakeHost([]); // the column has no screens to walk
  lines.sync(host, 'b|whole', { instant: true });
  assert.equal(t.size, 0, 'nothing timed');
  assert.ok(lines.done && host.classList.contains('done'), 'read at once: `.done` lights the choices');
  assert.deepEqual(done, [['b|whole', false]], 'storyDone hears it, once (lingjing.js holds a column until a tap)');
  lines.sync(host, 'b|whole', { instant: true });
  assert.equal(done.length, 1, 'a repaint is no second end');
  lines.tap();
  assert.deepEqual(done.at(-1), ['b|whole', true], '「接着往下」 or a key: the tap goes on');
});

test('快 on the page: opened before the paint, held for his tap, the voice stopped, a page\'s 亮相 above the band', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(src, /matchPace\(\);\n {2}beatPiece\(slots\);/, 'the passage matches the pace before anything of the beat plays');
  // read live at every paint, both ways (2026-10-15, his: 「由快切回中时, 仍然是全屏」)
  assert.match(src, /if \(!playing\(r\) \|\| wholeNow\(\) === Boolean\(r\.all\?\.whole\)\) return;\n {2}const next = wholeNow\(\) \? wholeOf\(r, lang\(\)\) : pacedAt\(r, beatInView\(\), lang\(\)\);/);
  assert.match(src, /function setSpeed\(v\) \{ keepSpeed\(v\); render\(\); \}/, 'a speed tap only keeps the choice; the paint does the rest');
  assert.match(src, /if \(r\.all\?\.whole && \(!tapped \|\|/, 'a column never goes on by itself');
  assert.match(src, /\['\[data-dlg-onward\]', \(\) => storyTap\(\)\]/);
  assert.match(src, /if \(!shown \|\| !playing\(r\) \|\| r\.all \|\| !dubOn\(\)\) return narrator\.sync\(null\);/, '配音 stops for a column (as for 跳过)');
  assert.match(src, /r\.all\?\.whole \? wholeBeats\(r, lang\(\)\) : \[current\(r, lang\(\)\)\.beat\]/, 'her lines in a column are copied to the chat as if played');
  const css = fs.readFileSync(path.join(ROOT, 'scripts/story.css'), 'utf8');
  assert.match(css, /\.story \.wholecol \{[^}]*top: var\(--band-top\)[^}]*overflow: hidden/, 'the column is the lower half\'s band, paged (pager.js), not a scroll');
  assert.match(css, /\.view \{ --band-top: 50%; \}/, 'the band starts halfway down the stage');
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/phone.css'), 'utf8'), /\.view \{ --band-top: 42%; \}/, 'a little taller on a phone, the picture still above');
  assert.match(css, /\.story\.whole::before[^{]*\{[^}]*rgba\(13, 17, 20, 0\) calc\(var\(--band-top\) - 12%\)[^}]*rgba\(13, 17, 20, \.8\)/, 'the ink wash behind the band only: the upper half keeps its picture');
});

test('慢 · 中 · 快 is felt at once: the running wait rescales on the tap, both ways; every wait and the fades follow', () => {
  const t = clock();
  let sp = 'slow';
  const lines = createLines({ timer: t, f: () => SPEEDS[sp] });
  const { host, lit } = fakeHost([['一'.repeat(40) + '。', '乙。'], ['丙。']]);
  lines.sync(host, 'b4');
  assert.equal(host.style.getPropertyValue('--pace'), '1', 'the fades at 慢');
  t.next(); // the lead-in: the first sentence lights
  assert.deepEqual(lit(), [1, 0]);
  const full = paceOf('一'.repeat(40) + '。');
  assert.deepEqual(t.pending(), [full]);
  // half of it gone, then 中: what is left runs at 中 — now, not from the next sentence
  t.at += full / 2;
  sp = 'mid';
  lines.sync(host, 'b4'); // setSpeed repaints: the same beat, synced again
  assert.deepEqual(t.pending(), [Math.round((full / 2) * SPEEDS.mid)]);
  assert.equal(host.style.getPropertyValue('--pace'), String(SPEEDS.mid), 'the fades quicken too');
  // and back up to 慢 a moment later: the rest stretches
  t.at += 100;
  sp = 'slow';
  lines.sync(host, 'b4');
  const left = Math.round((full / 2) * SPEEDS.mid) - 100;
  assert.deepEqual(t.pending(), [Math.round(left * (SPEEDS.slow / SPEEDS.mid))]);
  // the same speed again changes nothing
  lines.sync(host, 'b4');
  assert.deepEqual(t.pending(), [Math.round(left * (SPEEDS.slow / SPEEDS.mid))]);
  // a repaint on a new node carries the rescale too
  sp = 'slow';
  const again = fakeHost([['一'.repeat(40) + '。', '乙。'], ['丙。']]);
  lines.sync(again.host, 'b4');
  assert.equal(t.pending().length, 1, 'one wait, never two');
  assert.equal(again.host.style.getPropertyValue('--pace'), '1');
  // the fixed waits scale: the next sentence, the screen change, the next beat's lead-in, a let-go
  sp = 'mid';
  lines.sync(again.host, 'b4');
  t.next();
  assert.deepEqual(t.pending(), [Math.round(paceOf('乙。', { last: true }) * SPEEDS.mid)]);
  t.next();
  assert.deepEqual(t.pending(), [Math.round(420 * SPEEDS.mid)], 'the screen change at 中');
  const b = fakeHost([['子。']]);
  lines.sync(b.host, 'b5');
  assert.deepEqual(t.pending(), [Math.round(500 * SPEEDS.mid)], 'the lead-in at 中');
  sp = 'slow';
  lines.hold(true);
  lines.sync(b.host, 'b5');
  assert.equal(t.size, 0, 'held: a speed change times nothing');
  lines.hold(false);
  assert.deepEqual(t.pending(), [Math.round(600 * SPEEDS.slow)]);
});

test('the fades follow the speed: story.css times them by --pace', () => {
  const css = fs.readFileSync(path.join(ROOT, 'scripts/story.css'), 'utf8');
  assert.match(css, /\.story \.s \{[^}]*transition:[^}]*var\(--pace/);
  assert.match(css, /\.story \.screen \{[^}]*transition:[^}]*var\(--pace/);
});

test('the backdrop: the world declares a painting for every weather × day and night; each is on disk', () => {
  const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'worlds/jiuding/backdrops.json'), 'utf8'));
  assert.deepEqual(Object.keys(table.kinds).sort(), [...KINDS].sort(), 'every kind the weather knows');
  assert.deepEqual(Object.keys(WEATHER).sort(), [...KINDS].sort());
  for (const k of KINDS) {
    for (const p of DAYPARTS) {
      const f = table.kinds[k][p];
      assert.ok(f && fs.existsSync(path.join(ROOT, 'worlds/jiuding', f)), `${k}/${p}: ${f}`);
      assert.equal(backdropOf(table, k, p === 'day'), f);
    }
  }
  assert.equal(backdropOf(table, 'nonsense', true), table.kinds.clear.day, 'an unknown sky: the clear one');
  assert.equal(backdropOf(null, 'rain', true), null, 'no table: the paper');
  // No backdrop file is named in the page: the table is data.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.doesNotMatch(src, /chendingshan|art\/setpiece\//);
});

test('her words inside a told beat (⟪…⟫ in the book) come up silver-blue, in place', async () => {
  const { linesHtml, asideRanges, markAsides } = await import('../scripts/lines.js');
  const text = '便在这时，银月在他耳边道：「往左偏半寸。」她的声音很轻。';
  assert.deepEqual(asideRanges(text, ['「往左偏半寸。」']), [[13, 21]]);
  assert.equal(markAsides('她说「好。」', 0, [[2, 6]]), '她说<span class="yy">「好。」</span>');
  const html = linesHtml({ text, asides: ['「往左偏半寸。」'] });
  assert.match(html, /<span class="yy">「往左偏半寸。」<\/span>/);
  assert.doesNotMatch(linesHtml({ text }), /class="yy"/, 'no asides, no colour');
  // a whole paragraph of hers
  assert.match(linesHtml({ text: '「那头鹿。」', asides: ['「那头鹿。」'] }), /<span class="s"><span class="yy">「那头鹿。」<\/span><\/span>/);
});

test('the beats carry her ⟪…⟫ as asides: the 00-deer passage', async () => {
  const { loadWorld } = await import('../scripts/content.mjs');
  const { beatsOf, passageFor } = await import('../scripts/rules/tell.mjs');
  const content = loadWorld('jiuding');
  const sc = Object.values(content.chapters).map((c) => c.scenes?.['00-deer']).find(Boolean);
  const s = { lang: 'zh', name: '小满' };
  const item = { of: 'scene', id: '00-deer', text: passageFor(content, s, sc.story), marked: passageFor(content, s, sc.story, { notes: true }) };
  const beats = beatsOf(content, s, item);
  const hers = beats.find((b) => b.asides?.includes('「那头鹿。」'));
  assert.ok(hers, 'the deer line is hers');
  assert.equal(hers.text, '「那头鹿。」');
  assert.ok(beats.every((b) => !/[⟪⟫]/.test(b.text)), 'no mark is ever shown');
});

test('English sentences keep their space when laid side by side (快\'s column, a screen); Chinese closes up', async () => {
  const { joinSentences } = await import('../scripts/lines.js');
  const en = { text: 'It was Shen who found the way out of the valley. He plucked a hair from his head. "Here," she said.' };
  const text = (html) => html.replace(/<[^>]+>/g, '').replaceAll('&quot;', '"');
  assert.equal(text(paraHtml(en)), en.text);
  assert.equal(text(linesHtml(en, { lang: 'en' })), en.text);
  const zh = { text: '他转过身。「路在这儿。」银月已经站在他身后了。' };
  assert.equal(text(paraHtml(zh)), zh.text);
  assert.equal(joinSentences(['A.', 'B.']), 'A. B.');
  assert.equal(joinSentences(['甲。', '乙。']), '甲。乙。');
});
