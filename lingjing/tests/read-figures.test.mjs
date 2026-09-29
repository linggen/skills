// 图鉴 — the one picture system (Hanli, 2026-09-29: 「不用小人书的方式了，图片作为
// 图鉴」; 「确保故事中的图片，在游戏里可以直接用」). worlds/<world>/codex.json and the
// files it links resolve into one entry per subject (scripts/codex.js); the book
// sets a subject's card after the paragraph of its first appearance and a
// knowledge figure under every paragraph that names it; the game draws the same
// entries with the same renderer. The hero is never drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookEntries, fillHero, NEAR, renderMarkdown } from '../scripts/read-md.js';
import { codexHtml, codexOf, codexRaw, isSubject, ITEM_TAGS, lintCodex, resolveEntry, SUBJECTS } from '../scripts/codex.js';
import { cardHtml, WORDS } from '../scripts/cards.js';
import { marksSvg } from '../scripts/marks.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = path.join(ROOT, 'story/huxian-bing');
const book = JSON.parse(fs.readFileSync(path.join(BOOK, 'book.json'), 'utf8'));
const WORLD = path.join(ROOT, 'worlds', book.world);
const json = (f) => JSON.parse(fs.readFileSync(path.join(WORLD, f), 'utf8'));
const FILES = { codex: json('codex.json'), people: json('people.json'), creatures: json('creatures.json'), items: json('items.json'), arts: json('arts.json') };
const CODEX = codexOf(FILES);
const MEMORIES = json('memories.json').memories;
const exists = (f) => fs.existsSync(path.join(WORLD, f));
const chapters = bookEntries(book).map((c) => ({ ...c, md: fs.readFileSync(path.join(BOOK, c.file), 'utf8') }));
const GLOSS = /\]\{注=([^{}\n]+)\}/g;
const src = (f) => `../worlds/jiuding/${f}`;

/* ── The codex's data ── */

test('the codex lints clean: every kind known, every picture on disk, one entry per subject', () => {
  assert.deepEqual(lintCodex(FILES, exists), []);
  const kinds = Object.keys(FILES.codex.kinds);
  for (const k of SUBJECTS) assert.ok(kinds.includes(k), `kind ${k}`);
  for (const k of ['经脉', '穴位', '洛书', '五行']) assert.ok(kinds.includes(k), `knowledge kind ${k}`);
  for (const e of CODEX.values()) {
    assert.ok(kinds.includes(e.kind), `${e.id}: ${e.kind}`);
    assert.ok(e.name && !/[{}]/.test(e.name), `${e.id}: a name`);
    if (e.image) assert.ok(exists(e.image), `${e.id}: ${e.image}`);
  }
  // linked, not duplicated: every person, 山海经 creature, item and art is an entry
  for (const p of FILES.people.people) assert.equal(CODEX.get(p.id)?.kind, '人物', p.id);
  for (const c of FILES.creatures.creatures.filter((c) => !c.id.startsWith('foe-'))) assert.equal(CODEX.get(c.id)?.kind, '生物', c.id);
  // an item only when tagged 法宝 · 丹药 · 功法 · 信物 (his: 「鹿皮就不用图鉴了」)
  for (const i of FILES.items.items) {
    const tag = FILES.codex.entries[i.id]?.tag;
    assert.equal(CODEX.get(i.id)?.kind, ITEM_TAGS.includes(tag) ? '物品' : undefined, i.id);
  }
  for (const id of ['deer-hide', 'luobo', 'old-bow', 'bing']) assert.equal(CODEX.has(id), false, `${id}: everyday, no entry`);
  for (const id of ['fox-token', 'danlu', 'xisui-pill', 'mend-pill', 'tuna-jing', 'huangting', 'heluo']) assert.ok(ITEM_TAGS.includes(CODEX.get(id)?.tag), `${id}: a story object`);
  const untagged = structuredClone(FILES);
  untagged.codex.entries.bing = { kind: '物品', name: { zh: '饼', en: 'Flatbread' }, lines: { zh: ['x'], en: ['x'] } };
  assert.ok(lintCodex(untagged, exists).some((p) => /bing: an item's entry is tagged/.test(p)));
  for (const a of FILES.arts.arts) assert.equal(CODEX.get(a.id)?.kind, '武功', a.id);
  // a refused picture is a name card, and the lint catches a missing one
  const broken = structuredClone(FILES);
  broken.codex.entries['三关'].image = 'art/codex/nothing.svg';
  assert.ok(lintCodex(broken, exists).some((p) => /三关: picture art\/codex\/nothing\.svg is missing/.test(p)));
});

test('the hero has no entry and is never drawn; 阿禾 has two portraits, picked by the hero\'s gender', () => {
  for (const id of ['hero', 'player', '主角', '你']) assert.equal(CODEX.has(id), false);
  const bad = structuredClone(FILES);
  bad.codex.entries.hero = { kind: '人物', name: { zh: '你', en: 'You' }, lines: { zh: ['x'], en: ['x'] } };
  assert.ok(lintCodex(bad, exists).some((p) => /the hero has no entry/.test(p)));
  const ahe = FILES.codex.entries.ahe.by_hero;
  assert.ok(Object.hasOwn(ahe, 'male') && Object.hasOwn(ahe, 'female'), 'a portrait slot for each hero');
  const raw = codexRaw(FILES).get('ahe');
  assert.equal(resolveEntry(raw, { gender: 'male' }).image, ahe.male, 'beside a boy hero: the girl');
  assert.equal(resolveEntry(raw, { gender: 'female' }).image, ahe.female, 'beside a girl hero: the boy');
  assert.notEqual(ahe.male, ahe.female);
  // the address words fill (邻家{伴·孩} …)
  const say = (t) => t.replaceAll('{伴·孩}', '姑娘').replaceAll('{伴·她}', '她');
  assert.match(resolveEntry(raw, { gender: 'male', say }).lines[0], /邻家姑娘/);
});

/* ── The book ── */

test('no ::: 画 is left in the book: a story moment is never illustrated', () => {
  for (const c of chapters) assert.doesNotMatch(c.md, /^:::\s*画/m, c.file);
  assert.equal(fs.existsSync(path.join(WORLD, 'art/panels')) && fs.readdirSync(path.join(WORLD, 'art/panels')).some((f) => f.startsWith('00-')), false, 'the 28 prologue panels are gone');
});

test('every picture the book shows resolves through the codex (or is 银月\'s one memory plate)', () => {
  for (const c of chapters) {
    for (const [, id] of c.md.matchAll(GLOSS)) assert.ok(CODEX.has(id), `${c.file}: 注=${id} is a codex entry`);
    for (const [, n] of c.md.matchAll(/^:::\s*忆\s+(\d+)/gm)) assert.ok(MEMORIES.find((m) => m.n === Number(n))?.art, `${c.file}: 忆 ${n} is painted`);
    const html = renderMarkdown(fillHero(c.md, {}), { codex: CODEX, chapter: c.id, src, memory: (n) => MEMORIES.find((m) => m.n === n)?.art ?? null });
    const known = new Set([...CODEX.values()].map((e) => e.image).filter(Boolean).map(src));
    for (const [, s] of html.matchAll(/<img src="([^"]+)"/g)) assert.ok(known.has(s) || /art\/memories\//.test(s), `${c.file}: ${s} comes from the codex`);
  }
});

test('a subject\'s card stands once, after the paragraph of its first appearance; later mentions are links', () => {
  const firstIn = new Map(); // id → the chapter of its first gloss, in book order
  for (const c of chapters) for (const [, id] of c.md.matchAll(GLOSS)) if (!firstIn.has(id)) firstIn.set(id, c.id);
  for (const [id, ch] of firstIn) {
    const e = CODEX.get(id);
    if (isSubject(e)) assert.equal(e.first?.book, ch, `${id}: first glossed in ${ch}, the codex says ${e.first?.book}`);
  }
  const cards = new Map();
  for (const c of chapters) {
    const html = renderMarkdown(fillHero(c.md, { name: '秋白' }), { codex: CODEX, chapter: c.id, src });
    for (const [, id] of html.matchAll(/<figure class="codexcard first" data-codex="([^"]+)"/g)) cards.set(id, (cards.get(id) ?? 0) + 1);
    assert.doesNotMatch(html, /:::|\{注=/, `${c.file}: nothing left raw`);
  }
  for (const [id, ch] of firstIn) if (isSubject(CODEX.get(id))) assert.equal(cards.get(id), 1, `${id}: one card in the book (${ch})`);
  for (const id of ['masan', 'ahe', 'yinyue', 'fox-token', 'longzhi', 'sunergou']) assert.equal(cards.get(id), 1, `${id} is introduced`);
  // in one render: a card once; a mention by it plain words, a farther one a dotted link
  const md = '收租的，是[马三]{注=masan}。\n\n又是[马三]{注=masan}。';
  const html = renderMarkdown(md, { codex: CODEX, chapter: 'h01', src });
  assert.equal((html.match(/class="codexcard first"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /class="gloss"[^>]*data-codex="masan"/, 'the card is right there: no link');
  assert.equal((renderMarkdown(md, { codex: CODEX, chapter: 'h03', src }).match(/codexcard/g) ?? []).length, 0, 'another chapter: links only');
});

test('a mention right by its card reads plain; one farther on, or past a heading or a scene break, links to the pop-up (his, 2026-09-29)', () => {
  const links = (md) => (renderMarkdown(md, { codex: CODEX, chapter: 'h01', src }).match(/class="gloss"[^>]*data-codex="masan"/g) ?? []).length;
  const para = (n) => Array.from({ length: n }, (_, i) => `第${i}段。`).join('\n\n');
  assert.equal(links('是[马三]{注=masan}，[马三]{注=masan}。'), 0, 'the card\'s own paragraph');
  assert.equal(links(`是[马三]{注=masan}。\n\n${para(1)}\n\n[马三]{注=masan}。`), 0, `within ${NEAR} blocks`);
  assert.equal(links(`是[马三]{注=masan}。\n\n${para(NEAR)}\n\n[马三]{注=masan}。`), 1, 'farther on');
  assert.equal(links('是[马三]{注=masan}。\n\n## 二\n\n[马三]{注=masan}。'), 1, 'a new section');
  assert.equal(links('是[马三]{注=masan}。\n\n---\n\n[马三]{注=masan}。'), 1, 'past a scene break');
  assert.equal((renderMarkdown('[马三]{注=masan}。', { codex: CODEX, chapter: 'h03', src }).match(/data-codex="masan"/g) ?? []).length, 1, 'no card in this chapter: a link');
});

test('a knowledge figure stands under every paragraph that names it, marks and all', () => {
  const html = renderMarkdown('**银月**：[尾闾，夹脊，玉枕]{注=三关}。三道关。', { codex: CODEX, src, chapter: 'h03' });
  assert.match(html, /^<div class="noted"><p><b>银月<\/b>：<span class="gloss" role="button" tabindex="0" data-note="三关">尾闾，夹脊，玉枕<\/span>。三道关。<\/p><figure class="notefig" data-note="三关"><div class="pic"><img src="\.\.\/worlds\/jiuding\/art\/codex\/sanguan\.webp"/);
  assert.match(html, /<svg class="marks"/);
  assert.match(html, /<b>三关<\/b><span>督脉/);
  assert.doesNotMatch(html, /Codex/, 'a picture painted for us carries no credit line on the page');
  assert.doesNotMatch(html, /<text /, 'the picture carries its own painted labels: the marks draw none');
  assert.match(html, /data-scan="\.\.\/worlds\/jiuding\/art\/codex\/fanzhao-scan\.webp"/, '「原图」 opens the old plate');
  assert.match(renderMarkdown('[a]{注=三关}', { codex: codexOf(FILES, { lang: 'en' }), lang: 'en' }), /<b>The Three Passes<\/b>/);
  const ch = chapters.find((c) => c.id === 'h03');
  assert.equal((renderMarkdown(fillHero(ch.md, {}), { codex: CODEX, chapter: 'h03', src }).match(/class="notefig"/g) ?? []).length, 1);
});

test('an unknown entry, or no codex at all, reads as just the words', () => {
  for (const opts of [{}, { codex: CODEX }, { codex: new Map() }]) {
    assert.equal(renderMarkdown('他说[三道关]{注=没有这条}。', opts), '<p>他说三道关。</p>');
  }
  assert.equal(renderMarkdown('[x]{注=constructor}', { codex: {} }), '<p>x</p>', 'no prototype key is an entry');
  assert.equal(renderMarkdown('[<i>]{注=三关}', { codex: CODEX }).includes('<i>'), false, 'the words are escaped');
});

/* ── The game draws the same entries ── */

test('the game can draw every codex entry, with the book\'s own renderer', () => {
  const look = { lang: 'zh', world: { dir: 'worlds/jiuding' }, gender: 'male' };
  for (const e of CODEX.values()) {
    const html = cardHtml({ card: 'codex', id: e.id }, { look, lang: 'zh', words: WORDS.zh, content: {}, codex: CODEX });
    assert.ok(html.includes(codexHtml(e, { src, lang: 'zh' })), `${e.id}: the stage card is the book's card`);
    assert.match(html, e.image ? /<img src="\.\.\/worlds\/jiuding\// : /class="namecard"|class="notefig"/, `${e.id}: a picture or a name card`);
    assert.doesNotMatch(html, /undefined|NaN|\{[\w·]+\}/, e.id);
  }
  assert.match(cardHtml({ card: 'meet', id: 'masan' }, { look, lang: 'zh', words: WORDS.zh, content: {}, codex: CODEX }), /codexcard first/);
  assert.equal(cardHtml({ card: 'codex', id: 'nobody' }, { look, lang: 'zh', words: WORDS.zh, content: {}, codex: CODEX }), '');
});

/* ── The figure's marks ── */

test('marks: points and paths sit inside the picture, and paths go through points that exist', () => {
  for (const e of CODEX.values()) {
    const m = e.marks ?? {};
    const inside = ([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1;
    const ids = new Set((m.points ?? []).map((p) => p.id));
    assert.equal(ids.size, (m.points ?? []).length, `${e.id}: point ids are unique`);
    for (const p of m.points ?? []) assert.ok(p.id && p.label && inside([p.x, p.y]), `${e.id}: point ${p.id} in 0–1`);
    for (const p of m.paths ?? []) {
      assert.ok(p.d.length >= 2 && p.d.every(inside), `${e.id}: path ${p.id} in 0–1`);
      for (const t of p.through ?? []) assert.ok(ids.has(t), `${e.id}: path ${p.id} through ${t}`);
    }
    if (m.points?.length || m.paths?.length) assert.ok(m.ratio > 0, `${e.id}: ratio`);
  }
  // 三关 on his painted figure (the back): the marks sit on the three painted dots
  // (measured), 尾闾 lowest (the coccyx tip), 玉枕 highest (the back of the head).
  const m = CODEX.get('三关').marks;
  const pt = (id) => m.points.find((p) => p.id === id);
  assert.ok(pt('尾闾').y > pt('夹脊').y && pt('夹脊').y > pt('玉枕').y, 'the qi climbs');
  assert.deepEqual(m.points.map((p) => [p.id, p.x, p.y]), [['尾闾', 0.4943, 0.519], ['夹脊', 0.4943, 0.3182], ['玉枕', 0.4942, 0.1091]]);
  assert.equal(m.ratio, 0.75, '1448×1086');
  assert.equal(m.labels, false);
  assert.deepEqual(m.paths[0].through, ['尾闾', '夹脊', '玉枕']);
});

test('marksSvg draws the marks over the picture; the lights wait for the flow; channels in colour, arrows, labels either side', () => {
  assert.equal(marksSvg(undefined), '');
  assert.equal(marksSvg({}), '');
  const m = CODEX.get('三关').marks;
  const svg = marksSvg(m);
  assert.match(svg, /^<svg class="marks" viewBox="0 0 100 75\.00" aria-hidden="true">/);
  assert.equal((svg.match(/<path class="m-flow m-du"/g) ?? []).length, 1);
  assert.match(svg, /<marker id="m-arrow-du"/, 'arrows the way the qi runs');
  assert.equal((svg.match(/<circle /g) ?? []).length, 3);
  assert.doesNotMatch(svg, /<text /, 'labels: false — the painted labels stand');
  const t = Object.fromEntries([...svg.matchAll(/data-mark="([^"]+)" style="--t:([\d.]+)s"/g)].map(([, id, s]) => [id, Number(s)]));
  assert.ok(t['尾闾'] < t['夹脊'] && t['夹脊'] < t['玉枕'], 'the passes light one after another');
  // the loop: a second channel starts later, its own colour; a label sits right with side: 'r'
  const loop = marksSvg({ ratio: 1, points: [{ id: 'a', label: '甲', x: 0.6, y: 0.8, side: 'r' }, { id: 'b', label: { zh: '乙', en: 'B' }, x: 0.4, y: 0.3 }],
    paths: [{ id: 'du', tone: 'du', through: ['a'], d: [[0.6, 0.9], [0.6, 0.1]] }, { id: 'ren', tone: 'ren', at: 2.6, through: ['b'], d: [[0.4, 0.1], [0.4, 0.9]] }] });
  assert.match(loop, /class="m-flow m-ren"[^>]*style="--at:2\.60s"/);
  assert.match(loop, /<marker id="m-arrow-du"[\s\S]*<marker id="m-arrow-ren"/);
  assert.match(loop, /class="r">甲<\/text>/);
  const lt = Object.fromEntries([...loop.matchAll(/data-mark="([^"]+)" style="--t:([\d.]+)s"/g)].map(([, id, s]) => [id, Number(s)]));
  assert.ok(lt.b > lt.a, 'the front waits for the back');
  assert.match(marksSvg({ ratio: 1, points: [{ id: 'b', label: { zh: '乙', en: 'B' }, x: 0.4, y: 0.3 }] }, 'en'), />B</);
  assert.match(marksSvg({ ratio: 1, points: [{ id: 'a', label: '<x>', x: 0.5, y: 0.5 }] }), /&lt;x&gt;/);
});

test('the figure CSS is shared: the book and the game load the same codex.css', () => {
  for (const page of ['read.html', 'index.html']) assert.match(fs.readFileSync(path.join(ROOT, 'scripts', page), 'utf8'), /href="codex\.css"/, page);
  const css = fs.readFileSync(path.join(ROOT, 'scripts', 'codex.css'), 'utf8');
  for (const rule of ['.codexcard', '.namecard', '.notefig', '.marks', '.codexslot']) assert.ok(css.includes(rule), rule);
});

/* ── 录's 图鉴 ── */

test('录 holds a 图鉴: met entries by kind, the unmet as empty slots; a tap opens the card', async () => {
  const { loadContent } = await import('../scripts/content.mjs');
  const { newState } = await import('../scripts/state.mjs');
  const { story } = await import('../scripts/rules.mjs');
  const { luHtml } = await import('../scripts/lu.js');
  const { walk } = await import('./prologue.mjs');
  const content = loadContent();
  const NOW = new Date('2026-09-28T12:00:00');
  const fresh = newState(content, 'zh', NOW);
  const s = walk(fresh, [['resolve', { exit: 'name', value: '墨白', gender: 'male' }], ['resolve', { exit: 'endure' }]], content, NOW);
  const met = story(s, content, { now: NOW, quests: [] }).result.codex;
  for (const id of ['baba', 'masan', 'maxiaobao', 'ahe']) assert.ok(met.includes(id), `${id} met`);
  assert.ok(!met.includes('wupo') && !met.includes('longzhi'), 'not yet met');
  assert.equal(story(s, content, { now: NOW, quests: [] }, { short: 'true' }).result.codex, undefined, 'Ling\'s short book leaves it out');
  const book = story(s, content, { now: NOW, quests: [] }).result;
  const html = luHtml(book, { lang: 'zh', artBase: 'A/', codex: CODEX, codexKinds: FILES.codex.kinds });
  assert.match(html, /<section class="lusec lucodex"><h3>图鉴<\/h3>/);
  const people = [...CODEX.values()].filter((e) => e.kind === '人物').length;
  assert.match(html, new RegExp(`<h4>人物 <span class="dim">\\d+/${people}</span></h4>`));
  assert.match(html, /data-codex-open="masan"/);
  assert.doesNotMatch(html, /data-codex-open="wupo"/, 'an unmet entry is never named');
  assert.ok((html.match(/class="codexslot"/g) ?? []).length > 20, 'the unmet stand as empty slots');
  assert.match(luHtml(book, { lang: 'zh', artBase: 'A/', codex: CODEX, codexKinds: FILES.codex.kinds, codexOpen: 'masan' }), /<h3>图鉴<\/h3><figure class="codexcard" data-codex="masan"/);
  assert.match(luHtml(book, { lang: 'en', artBase: 'A/', codex: codexOf(FILES, { lang: 'en' }), codexKinds: FILES.codex.kinds }), /<h3>Codex<\/h3>[\s\S]*People/);
  // a creature's card carries its 山海经 line
  assert.match(codexHtml(CODEX.get('longzhi'), { src }), /九尾、九首、虎爪/);
  // 人物谱 is merged into the 图鉴 (his, 2026-09-29): no second list of the same people
  const known = { ...book, people: [{ id: 'masan', name: '马三', kind: 'story' }, { id: 'known:x', name: '渔人老七', kind: 'known' }] };
  const merged = luHtml(known, { lang: 'zh', artBase: 'A/', codex: CODEX, codexKinds: FILES.codex.kinds });
  assert.doesNotMatch(merged, /<h3>人物谱<\/h3>/);
  assert.doesNotMatch(merged, /class="luperson[^"]*"[^>]*><b>马三<\/b>/, 'one met with an entry is in the grid, not a name chip');
  assert.match(luHtml(known, { lang: 'zh', artBase: 'A/', codex: CODEX, codexKinds: FILES.codex.kinds }), /<section class="lusec lucodex">[\s\S]*<b>渔人老七<\/b>[\s\S]*<\/section>/, 'one with no entry stays a name, under the 图鉴');
  assert.match(luHtml(known, { lang: 'zh' }), /<h3>人物谱<\/h3>/, 'no 图鉴 at hand: the old list');
});

test('a repainted creature keeps its old woodcut as 「原图」; the prologue\'s people have their portraits', () => {
  const fuzhu = CODEX.get('fuzhu');
  assert.equal(fuzhu.image, 'art/creatures/fuzhu.webp');
  assert.equal(fuzhu.source.scan, 'art/fuzhu.webp');
  const html = codexHtml(fuzhu, { src });
  // 小狰 (Codex) with the 1725 woodcut as its 「原图」 — no painter's line, the classic and the edition only
  const zheng = CODEX.get('zheng');
  assert.equal(zheng.image, 'art/creatures/zheng.webp');
  assert.equal(zheng.source.scan, 'art/zheng.webp');
  assert.match(codexHtml(zheng, { src }), /《山海经 · 西次三经》 <button class="origscan" data-scan="\.\.\/worlds\/jiuding\/art\/zheng\.webp">原图</);
  assert.match(html, /<small>《山海经 · 中山经》 <button class="origscan"/, 'the classic it is drawn from, never the painter');
  assert.doesNotMatch(html, /重绘|Codex/);
  assert.match(html, /data-scan="\.\.\/worlds\/jiuding\/art\/fuzhu\.webp">原图</);
  for (const id of ['baba', 'mama', 'masan', 'maxiaobao', 'wupo', 'laozhou', 'qulao', 'yinyue', 'jiujiu', 'xuanchenzi', 'dushu', 'fox-token', 'xisui-pill', 'tuna-jing', 'danlu', 'huangting', 'heluo', 'mend-pill', 'moon-bell']) assert.ok(CODEX.get(id).image, `${id}: a portrait`);
});

test('every entry with a first appearance in the book is glossed there — a rewrite cannot drop its card', () => {
  for (const [id, e] of Object.entries(FILES.codex.entries)) {
    const ch = e.first?.book;
    if (!ch) continue;
    const c = chapters.find((x) => x.id === ch);
    assert.ok(c, `${id}: chapter ${ch} is in book.json`);
    assert.ok(c.md.includes(`{注=${id}}`), `${id}: glossed in ${c.file}`);
  }
});

test('the pop-up card carries its own width — an inline-size container sized by content measures 0 (the 狰 strip, 2026-09-29)', () => {
  const css = fs.readFileSync(new URL('../scripts/codex.css', import.meta.url), 'utf8');
  const rule = /\.boxcard \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(rule, /(^|;)\s*width: min\(760px, 94vw\)/);
  assert.match(rule, /max-height: 90vh/);
  assert.match(rule, /overflow: auto/);
  const js = fs.readFileSync(new URL('../scripts/read.js', import.meta.url), 'utf8');
  assert.match(js, /boxclose/, 'a × to close');
});

test('in every chapter no subject\'s link lies within NEAR blocks before or after its own card, in its section (他: 「检查一下其他的」)', () => {
  for (const c of chapters) {
    const blocks = renderMarkdown(fillHero(c.md, { name: '秋白' }), { codex: CODEX, chapter: c.id, src }).split('\n');
    let section = 0;
    const at = blocks.map((b) => ({ b, section: /^<h[1-6r]/.test(b) ? ++section : section }));
    at.forEach(({ b, section: s }, i) => {
      for (const [, id] of b.matchAll(/<figure class="codexcard first" data-codex="([^"]+)"/g)) {
        for (let j = Math.max(0, i - NEAR); j <= Math.min(at.length - 1, i + NEAR); j++) {
          if (at[j].section !== s) continue;
          assert.doesNotMatch(at[j].b, new RegExp(`class="gloss"[^>]*data-codex="${id}"`), `${c.file}: ${id} links right by its card`);
        }
      }
    });
  }
});
