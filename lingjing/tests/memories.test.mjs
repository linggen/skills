// 银月的记忆是彩色的 (哇时刻 ③, Hanli 2026-09-29: 「可以，都按你说的，终章全彩」).
// Everything in the game is ink; only her memories are in colour. 一鼎一尾一段记忆:
// a memory comes ONLY from the exit that brings a 鼎 home (never a verb, a
// grant, a made scene); Look names the unlocked ones and nothing of the rest;
// the stage plays it as ink blooming into colour (reduced motion: colour at
// once); the album in 录 is eight frames lit one by one; the book shows it as
// a colour plate; fragments are found by exploring; the finale turns the whole
// world to colour. The colour set is art/memories/ and nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { forLing, look, oddsOf, resolve, rollOf, story, VERBS } from '../scripts/rules.mjs';
import { albumOf, findFragment, grantMemory, lintMemories, memoriesLook, memoriesOf, playOf } from '../scripts/rules/memories.mjs';
import { withGuides } from '../scripts/rules/guide.mjs';
import { notePage } from '../scripts/rules/did.mjs';
import { albumHtml, colourOn, freshMemory, memoryCardHtml, replayOf } from '../scripts/memory.js';
import { luHtml } from '../scripts/lu.js';
import { CARD_KINDS, MAIN, PAGE_OWNS, stageSlots } from '../scripts/stage.mjs';
import { renderMarkdown } from '../scripts/read-md.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const doc = memoriesOf(content);
const NOW = new Date('2026-09-29T12:00:00');
const ctx = { now: NOW, quests: [] };

/* At 冀鼎 (the first 鼎), the peak of 练气, 银月 with the player. */
const atJi = (extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '01-ji', scene: '01-cauldron', place: 'zhangyuan', ended: ['00-prologue'],
  tier: 'qi', step: 8, progress: 130, name: '清玄', traits: ['wood', 'water', 'fire', 'earth'], stamina: 100, stamina_at: NOW.toISOString(),
  wealth: 300, bag: { 'foundation-pill': 1 }, companion: { joined: '2026-09-20', awake: true }, ...extra,
});
/* The try whose die lands (or not) under the chance (breakthrough.test.mjs). */
function tryThat(state, lands) {
  for (let k = 0; ; k += 1) {
    const t = { ...state, breakthrough: { ...state.breakthrough, tries: { foundation: k } } };
    if ((rollOf(t, 'foundation') < oddsOf(content, t, NOW, 'foundation').chance) === lands) return t;
  }
}
const takeJi = (s) => resolve(s, content, ctx, { exit: 'take' });

/* ── The unlock rule ── */

test('the first 鼎\'s exit brings memory 1 back — once — and says the one chat line', () => {
  const r = takeJi(tryThat(atJi(), true));
  assert.equal(r.result.ok, true);
  assert.deepEqual(r.state.memories, [1]);
  assert.deepEqual(r.state.memory_last, { n: 1, at: NOW.toISOString() });
  assert.deepEqual(r.result.memory, { n: 1, tail: 2, title: '一道光', say: '木牌亮了第二条尾巴。' });
  assert.equal(r.state.colour, undefined, 'one memory does not colour the world');
  // The same exit again (a replay, Go back): nothing new, nothing twice.
  const again = structuredClone(r.state);
  assert.equal(grantMemory(content, again, { id: 'take', memory: 1 }, new Date(NOW.getTime() + 60_000)), null);
  assert.deepEqual(again.memories, [1]);
  assert.deepEqual(again.memory_last, r.state.memory_last, 'nothing to play again');
});

test('a failed throw at the 鼎 gives no memory: the 鼎 is not home', () => {
  const r = takeJi(tryThat(atJi(), false));
  assert.equal(r.result.breakthrough.success, false);
  assert.equal(r.state.memories, undefined);
});

test('memories come only from exits: no verb, no grant table, no made scene', () => {
  for (const v of Object.keys(VERBS)) assert.doesNotMatch(v, /memor|recall|colour/i, `verb ${v}`);
  assert.doesNotMatch(JSON.stringify(content.rewards), /"memory"/, 'no grant table names a memory');
  // A made scene that tries it (Ling writes those) grants nothing.
  const s = { ...atJi(), made: { at: 'made-x', scenes: { 'made-x': { id: 'made-x', chapter: 'made', at: 'zhangyuan', setup: { zh: '水边。' }, exits: [{ id: 'go', means: 'goes', memory: 1, stay: true }] } } } };
  const r = resolve(s, content, ctx, { exit: 'go' });
  assert.equal(r.result.ok, true);
  assert.equal(r.state.memories, undefined);
  assert.equal(r.result.memory, undefined);
  // An exit with no `memory`, or an unknown one, grants nothing.
  const t = atJi();
  assert.equal(grantMemory(content, t, { id: 'x' }, NOW), null);
  assert.equal(grantMemory(content, t, { id: 'x', memory: 42 }, NOW), null);
  assert.equal(t.memories, undefined);
});

test('the lint: one 鼎 one memory, in its own chapter, with its pictures — and memory 1 is the first 鼎\'s', () => {
  assert.deepEqual(lintMemories(content), []);
  const take = content.chapters['01-ji'].scenes['01-cauldron'].exits.find(e => e.id === 'take');
  assert.equal(take.memory, 1);
  const twice = structuredClone(content);
  twice.chapters['01-ji'].scenes['01-end'].exits[0].memory = 1;
  assert.ok(lintMemories(twice).some(p => /granted by 2 exits/.test(p)));
  const wrong = structuredClone(content);
  wrong.chapters['00-prologue'].scenes['00-shiao'].exits[0].memory = 2;
  assert.ok(lintMemories(wrong).some(p => /belongs to 02-yan/.test(p)));
  assert.ok(lintMemories(wrong).some(p => /has no picture yet/.test(p)), 'an unpainted memory cannot be granted');
  assert.equal(doc.memories.length, 9);
  assert.equal(doc.memories.filter(m => !m.finale).length, 8, 'eight 鼎, eight tails, eight memories');
  // 一章一图 (Hanli, 2026-09-29): one picture a memory — never a list of panels.
  for (const m of doc.memories) assert.ok(!('panels' in m) && (m.art == null || typeof m.art === 'string'), `memory ${m.n}: one picture`);
  const one = memoriesOf(content).memories[0];
  one.panels = [{ art: 'art/memories/1-a.webp' }];
  try { assert.ok(lintMemories(content).some(p => /one picture a memory/.test(p)), 'panels are refused'); } finally { delete one.panels; }
  assert.deepEqual(doc.memories.map(m => m.chapter), ['01-ji', '02-yan', '03-qing', '04-xu', '05-yang', '06-jing', '07-liang', '08-yong', '09-yu']);
});

/* ── What Ling is told ── */

test('Look names the memories unlocked — and nothing of one still locked', () => {
  const before = look(atJi(), content, ctx);
  assert.equal(before.memories, undefined);
  const after = forLing(look(takeJi(tryThat(atJi(), true)).state, content, ctx));
  assert.equal(after.memories.of, 8);
  assert.deepEqual(after.memories.have.map(m => [m.n, m.tail, m.title]), [[1, 2, '一道光']]);
  assert.match(after.memories.have[0].knows, /天下，该归于一/);
  const text = JSON.stringify(after);
  for (const m of doc.memories.slice(1)) {
    assert.ok(!text.includes(m.title.zh), `locked title ${m.title.zh}`);
    assert.ok(!text.includes(m.knows.zh), `locked knows ${m.n}`);
  }
  assert.ok(!/art\/memories/.test(text), 'Ling never gets the pictures');
});

test('Ling is handed the keep-quiet rule with the memory; a page tap tells her the one line', () => {
  const r = takeJi(tryThat(atJi(), true));
  const g = withGuides({ verb: 'resolve', said: '', result: r.result, state: {}, session: 's' });
  assert.match(g.result.guide.tell, /Keep quiet during a memory/);
  const noted = notePage('resolve', { exit: 'take' }, r.result, r.state, content, NOW);
  assert.match(noted.page_did.at(-1).what, /say only 「木牌亮了第二条尾巴。」/);
});

/* ── The stage: ink blooming into colour ── */

test('the memory holds the main slot, the page\'s own, never Ling\'s to Show', () => {
  assert.equal(CARD_KINDS.memory.holds, true);
  assert.ok(PAGE_OWNS.has('memory'));
  assert.deepEqual(MAIN[0].kinds, ['memory']);
  const l = look(atJi(), content, ctx);
  const slots = stageSlots(l, [{ card: 'memory', id: 1 }, ...(l.stage ?? [])]);
  assert.deepEqual(slots.main, [{ card: 'memory', id: 1 }]);
});

test('the bloom: a colour picture that starts as ink; her lines only; reduced motion shows colour at once', () => {
  const s = takeJi(tryThat(atJi(), true)).state;
  const play = playOf(content, s, 1);
  assert.equal(playOf(content, atJi(), 1), null, 'nothing to play before it is unlocked');
  const html = memoryCardHtml(play, { artBase: '../worlds/jiuding/', age: 1200 });
  assert.match(html, /<img class="memart bloom" src="\.\.\/worlds\/jiuding\/art\/memories\/1-a\.webp"/);
  assert.match(html, /--mem-age:-1200ms/, 'a redraw carries the bloom on, never restarts it');
  assert.match(html, /<p style="--k:0">……光。<\/p>/);
  assert.match(html, /第二条尾巴/);
  assert.doesNotMatch(html, /data-mem-next/, 'one picture: nothing after it');
  assert.match(html, /data-mem-close/);
  assert.match(html, /「天下，该归于一。」/, 'her three lines under the one picture');
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  const still = memoryCardHtml(play, { still: true });
  assert.doesNotMatch(still, /bloom|--mem-age/);
  assert.match(still, /class="card memory still"/);
  assert.doesNotMatch(html, /undefined|NaN|\{\w+\}/);
  const css = fs.readFileSync(path.join(ROOT, 'scripts', 'memory.css'), 'utf8');
  assert.match(css, /@keyframes mem-bloom\s*{\s*0% { filter: grayscale\(1\)/, 'it begins as ink');
  assert.match(css, /100% { filter: none; }/, 'and ends in full colour');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) {\s*\.memart\.bloom, \.memlines p { animation: none; filter: none; }/);
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts', 'index.html'), 'utf8'), /href="memory\.css"/);
});

test('the page plays a memory once, only when fresh', () => {
  const l = { memories: { last: { n: 1, at: NOW.toISOString() } } };
  assert.deepEqual(freshMemory(l, null, NOW.getTime() + 5000), { n: 1, at: NOW.toISOString() });
  assert.equal(freshMemory(l, NOW.toISOString(), NOW.getTime() + 5000), null, 'already played');
  assert.equal(freshMemory(l, null, NOW.getTime() + 3600_000), null, 'a reload an hour later plays nothing');
  assert.equal(freshMemory({}, null), null);
});

/* ── The album ── */

test('the album: eight dark frames before (the beta\'s teaser), then lit one by one; a lit one replays', () => {
  const none = albumOf(content, atJi());
  assert.equal(none.frames.length, 8);
  assert.ok(none.frames.every(f => !f.lit && !f.art && !f.title), 'a dark frame is its tail and nothing else');
  assert.deepEqual(none.frames.map(f => f.tail), [2, 3, 4, 5, 6, 7, 8, 9]);
  const dark = albumHtml(none, { lang: 'zh' });
  assert.equal((dark.match(/class="memframe dark"/g) ?? []).length, 8);
  assert.equal((dark.match(/<svg class="memtailsvg"/g) ?? []).length, 8, 'an empty frame shows a tail\'s outline');
  assert.doesNotMatch(dark, /<img/);
  const s = takeJi(tryThat(atJi(), true)).state;
  const one = albumOf(content, s);
  assert.equal(one.frames.filter(f => f.lit).length, 1);
  const html = albumHtml(one, { artBase: 'A/', lang: 'zh' });
  assert.match(html, /<button class="memframe lit" data-mem-replay="1"[^>]*><img class="memart" src="A\/art\/memories\/1-a\.webp"/);
  assert.equal((html.match(/class="memframe dark"/g) ?? []).length, 7);
  assert.equal(replayOf(one, '1').art, 'art/memories/1-a.webp');
  assert.equal(replayOf(one, '2'), null, 'a dark frame cannot be played');
  // In the 录 book, from the rules' `story`.
  const book = story(s, content, ctx).result;
  assert.deepEqual(book.album.frames[0].title, '一道光');
  assert.match(luHtml(book, { lang: 'zh', artBase: 'A/' }), /银月的记忆[\s\S]*data-mem-replay="1"/);
  assert.equal(story(s, content, ctx, { short: 'true' }).result.album, undefined, 'Ling\'s short book leaves it out');
  assert.match(albumHtml(albumOf(content, { ...atJi(), lang: 'en' }), { lang: 'en' }), /Yinyue’s memories[\s\S]*Tail 2 · not yet remembered/);
});

/* ── The book ── */

test('the book: ::: 忆 n is memory n\'s one colour plate; 第四回 carries memory 1 at the first 鼎, once', () => {
  const memory = (n) => doc.memories.find(m => m.n === n)?.art ?? null;
  const html = renderMarkdown('前。\n::: 忆 1 九天之上\n\n::: 忆 2\n后。', { memory });
  assert.match(html, /<figure class="panel memplate"><img src="art\/memories\/1-a\.webp" alt="九天之上" loading="lazy"><figcaption>九天之上<\/figcaption><\/figure>/);
  assert.equal((html.match(/memplate/g) ?? []).length, 1, 'an unpainted memory is left out, never shown as text');
  assert.equal(renderMarkdown('::: 忆 1\n\n一段。'), '<p>一段。</p>', 'no resolver: left out');
  const ch = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/04-第四回.md'), 'utf8');
  const at = ch.indexOf('::: 忆 1 ');
  assert.ok(at > ch.indexOf('第二条，亮了。') && at > ch.indexOf('本王想起来一点了'), 'memory 1 is where the second tail lights');
  assert.equal((ch.match(/^::: 忆 /gm) ?? []).length, 1, '银月一鼎一图: one plate in the 回');
});

/* ── Fragments ── */

test('fragments: a place may declare one; found where he stops, once; the album adds its line', () => {
  const place = { id: 'test-place', fragment: { id: 'red-thread', art: 'art/memories/fragments/red-thread.webp', thing: { zh: '一根红线', en: 'a red thread' }, memory: 2 } };
  const s = atJi();
  const f = findFragment(content, s, place);
  assert.deepEqual(f, { id: 'red-thread', thing: '一根红线', line: '好像……在哪里见过。' });
  assert.deepEqual(s.fragments, ['red-thread']);
  assert.equal(findFragment(content, s, place), null, 'found once');
  assert.equal(findFragment(content, s, { id: 'bare' }), null);
  assert.equal(memoriesLook(content, s).fragments, 1);
  // Declared on a real place, the album shows it with its line.
  const c = structuredClone(content);
  c.places['徐'].places[0].fragment = place.fragment;
  const album = albumOf(c, s);
  assert.deepEqual(album.fragments, [{ id: 'red-thread', art: place.fragment.art, thing: '一根红线', line: '好像……在哪里见过。' }]);
  assert.match(albumHtml(album), /<img class="fragart"[^>]*alt="一根红线"[^>]*><span>好像……在哪里见过。<\/span>/);
  // The data is checked: its art under art/memories/fragments/ on disk, an id, the thing in both languages.
  const bad = lintMemories(c);
  assert.ok(bad.some(p => /fragment: art art\/memories\/fragments\/red-thread\.webp is not on disk/.test(p)), bad.join('\n'));
  c.places['徐'].places[0].fragment = { id: 'Bad Id', art: 'art/panels/x.webp', thing: { zh: '线' }, memory: 12 };
  const worse = lintMemories(c).join('\n');
  for (const want of ['needs a lowercase id', 'art/memories/fragments/<id>.webp', 'thing needs zh and en', 'unknown memory 12']) assert.match(worse, new RegExp(want.replace(/[/.<>]/g, '\\$&')));
  // Nothing is placed yet: the first ones come with the whole map (第三章).
  assert.ok(Object.values(content.places).every(d => d.places.every(p => !p.fragment)));
});

/* ── The finale: the whole ink world turns colour ── */

test('the finale\'s memory sets the colour flag; Look carries it; the page drops the ink everywhere', () => {
  const s = { ...atJi(), memories: [1, 2, 3, 4, 5, 6, 7, 8] };
  const nine = grantMemory(content, s, { id: 'home', memory: 9 }, NOW);
  assert.equal(nine.colour, true);
  assert.equal(s.colour, true);
  const l = look(s, content, ctx);
  assert.equal(l.memories.colour, true);
  assert.equal(colourOn(l), true);
  assert.equal(colourOn(look(atJi(), content, ctx)), false);
  assert.equal(albumOf(content, s).finale, true);
  // Lit before its picture is painted (only a scratch save gets there): its name, never a broken picture.
  const bare = albumHtml(albumOf(content, { ...s, memories: [1, 2] }), { lang: 'zh' });
  assert.match(bare, /<div class="memframe lit bare"><svg[^]*<span>第三条尾巴 · 青丘<\/span><\/div>/);
  assert.doesNotMatch(bare, /data-mem-replay="2"/);
  assert.equal(doc.memories.filter(m => m.colour).map(m => m.n).join(), '9', 'only the finale colours the world');
  const css = fs.readFileSync(path.join(ROOT, 'scripts', 'memory.css'), 'utf8');
  assert.match(css, /@layer ink {\s*html:not\(\.colour\) body img:not\(\.memart\):not\(\.fragart\) { filter: grayscale\(1\)/, 'every other picture is ink');
  assert.match(css, /html\.colour body img:not\(\.memart\) { filter: saturate/, 'until the finale');
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts', 'lingjing.js'), 'utf8'), /classList\.toggle\('colour', colourOn\(look\)\)/);
});

/* ── Only her memories are colour ── */

const artDir = path.join(content.dir, 'art');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test('the colour set is art/memories/ alone: memories point only there, nothing else does', () => {
  for (const m of doc.memories) if (m.art) assert.match(m.art, /^art\/memories\/[\w-]+\.webp$/);
  const painted = new Set(doc.memories.map(m => m.art).filter(Boolean));
  for (const f of fs.readdirSync(path.join(artDir, 'memories')).filter(f => f.endsWith('.webp'))) assert.ok(painted.has(`art/memories/${f}`), `${f} is a memory's`);
  assert.deepEqual(lintMemories(content), []);
  const c = structuredClone(content);
  c.items.items[0].art = 'art/memories/1-a.webp';
  assert.ok(lintMemories(c).some(p => /only memories\.json/.test(p)), 'an item wearing memory art is refused');
});

/* A picture's colour, decoded by dwebp at 64×64: the mean chroma (0 grey …
   1 pure colour) and the share of pixels with real colour in them. */
function colourOf(file) {
  const r = spawnSync('dwebp', [file, '-ppm', '-scale', '64', '64', '-o', '-'], { maxBuffer: 1 << 24 });
  if (r.status !== 0) return null;
  const buf = r.stdout;
  let at = 0;
  for (let fields = 0; fields < 4; fields += 1) { while (/\s/.test(String.fromCharCode(buf[at]))) at += 1; while (!/\s/.test(String.fromCharCode(buf[at]))) at += 1; }
  const px = buf.subarray(at + 1), n = Math.floor(px.length / 3);
  let sum = 0, vivid = 0;
  for (let i = 0; i < n * 3; i += 3) {
    const c = (Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2])) / 255;
    sum += c; if (c > 0.25) vivid += 1;
  }
  return { mean: sum / n, vivid: vivid / n };
}

/* The rest of the art is ink with, here and there, a touch of wash (a red
   pill, a brown hide — measured 2026-09-29: up to 7% vivid pixels); the page
   greys every picture but hers (memory.css `@layer ink`, tested above), so
   what is measured here is the other side: a memory must read as colour. */
test('measured: every memory picture is painted in colour, not ink', (t) => {
  if (spawnSync('dwebp', ['-version']).status !== 0) return t.skip('dwebp not installed');
  for (const f of fs.readdirSync(path.join(artDir, 'memories')).filter(f => f.endsWith('.webp'))) {
    const c = colourOf(path.join(artDir, 'memories', f));
    assert.ok(c.mean > 0.12 && c.vivid > 0.08, `${f} must be colour (mean ${c.mean.toFixed(3)}, vivid ${c.vivid.toFixed(3)})`);
  }
});
