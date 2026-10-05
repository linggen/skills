// 鼎归 · 地图晕开 (哇时刻 ①, his 2026-09-29): the 九州 in ink as the save
// stands — mist (not walked, or shut by the chapter's map), a wash (walked),
// deep ink with a seal and a moon (its 鼎 home) — the moment a 鼎 comes home,
// 御剑 to a 鼎's place, and the 卷轴 that unrolls the whole map.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { VERBS } from '../scripts/rules.mjs';
import { beenOf, fly, homedOf, inkMapOf, jiudingBrief, markBeen, stateOf, unrolled } from '../scripts/rules/inkmap.mjs';
import { notePage } from '../scripts/rules/did.mjs';
import { freshHome, HOMING_MS, homingCardHtml, inkMapSvg, provinceLineHtml, shapesOf, unrollHtml } from '../scripts/inkmap.js';
import { CARD_KINDS, MAIN, PAGE_OWNS, stageSlots } from '../scripts/stage.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const NOW = new Date('2026-09-29T12:00:00Z');
const ctx = { now: NOW, quests: [] };
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'saves', `${name}.json`), 'utf8')).state;
const atlas = content.world.atlas;
const svgText = fs.readFileSync(path.join(content.dir ?? path.join(ROOT, 'worlds', 'jiuding'), atlas.file), 'utf8');

test('the map file has every province the world names, by the id world.json gives it', () => {
  const ids = Object.keys(content.dictionary.provinces);
  assert.deepEqual(Object.keys(atlas.shapes).sort(), ids.sort(), 'a shape for every province, none extra');
  assert.deepEqual(Object.keys(atlas.provinces).sort(), ids.sort());
  for (const [p, gid] of Object.entries(atlas.shapes)) assert.ok(svgText.includes(`id="${gid}"`), `${p}: ${gid} in ${atlas.file}`);
  const geo = shapesOf(svgText, atlas.shapes);
  for (const p of ids) assert.match(geo.provinces[p] ?? '', /^M/, `${p} has an outline`);
  assert.equal(new Set(Object.values(geo.provinces)).size, ids.length, 'nine different outlines');
  assert.ok(geo.rivers.length >= 10, `rivers ${geo.rivers.length}`);
  assert.ok(geo.waters.length >= 4, `waters ${geo.waters.length}`);
  assert.deepEqual([geo.w, geo.h].map(Math.round), [1440, 1056]);
});

test('province states: walked is a wash, a 鼎 home is ink, the rest mist — and a locked province is always mist', () => {
  const fresh = newState(content, 'zh', NOW);
  const a = inkMapOf(content, fresh, NOW);
  assert.equal(a.provinces['徐'].state, 'wash', 'the prologue stands in 徐');
  for (const p of ['冀', '兖', '青', '扬', '荆', '豫', '梁', '雍']) {
    assert.equal(a.provinces[p].state, 'mist');
    assert.equal(a.provinces[p].locked, true, `${p} is shut by the prologue's map`);
  }
  assert.deepEqual(a.homed, []);
  assert.equal(a.of, 9);

  const home = fixture('ji-home');
  const b = inkMapOf(content, home, NOW);
  assert.equal(b.provinces['冀'].state, 'ink');
  assert.equal(b.provinces['冀'].home.place.id, 'zhangyuan', 'found where the 鼎 was taken');
  assert.equal(b.provinces['冀'].home.memory, 1, 'its memory in the album');
  assert.ok(b.provinces['冀'].home.line.length > 4, 'one line of its story');
  assert.equal(b.provinces['徐'].state, 'wash');
  // 兖 is 卷二's (2026-10-05, world.mjs juanOpen): shut — greyed by the page — with the world's line for it.
  assert.equal(b.provinces['兖'].state, 'mist');
  assert.equal(b.provinces['兖'].locked, true, '卷二 waits');
  assert.equal(b.provinces['兖'].say, content.chapters['01-ji'].map.beyond.zh);
  assert.deepEqual(b.homed, ['冀']);
  assert.deepEqual(b.travel, ['冀']);

  // The chapter's map shuts 冀 (a save put back into 第一章 with the 冀鼎 home): mist, and no travel point.
  const shut = { ...home, chapter: '00-waimen', ended: ['00-prologue', '01-ji'], scene: null, place: 'waimen' };
  const c = inkMapOf(content, shut, NOW);
  assert.equal(c.provinces['冀'].locked, true);
  assert.equal(c.provinces['冀'].state, 'mist', 'never contradicts the lock');
  assert.deepEqual(c.travel, []);
  assert.equal(stateOf({ locked: true, home: true, been: true }), 'mist');
  assert.equal(stateOf({ locked: false, home: true, been: false }), 'ink');
  assert.equal(stateOf({ locked: false, home: false, been: true }), 'wash');
});

test('been: the provinces stood in are kept on the save, once each', () => {
  const s = { ...newState(content, 'zh', NOW), place: 'zhangyuan' };
  assert.equal(markBeen(content, s), true);
  assert.deepEqual(s.been, ['冀']);
  assert.equal(markBeen(content, s), false, 'once');
  s.place = 'shiao';
  assert.deepEqual([...beenOf(content, s)].sort(), ['冀', '徐'].sort(), 'here counts too');
  assert.deepEqual(homedOf(content, s), []);
});

test('Look carries 九鼎 home for the page, and Ling never gets it', () => {
  const r = VERBS.look(fixture('ji-home'), content, ctx, {});
  assert.deepEqual(r.result.jiuding, { homed: ['冀'], of: 9 });
  const atlasR = VERBS.atlas(fixture('ji-home'), content, ctx, {});
  assert.equal(atlasR.result.ink.provinces['冀'].state, 'ink');
  assert.deepEqual(atlasR.result.ink.shapes, atlas.shapes);
});

test('御剑: straight to a 鼎 come home for 1 体力; refused when not home, locked, held, or out of 体力', () => {
  const home = fixture('ji-home');
  const ok = fly(home, content, ctx, { province: '冀' });
  assert.equal(ok.result.ok, true);
  assert.equal(ok.state.place, 'zhangyuan');
  assert.equal(home.stamina - ok.state.stamina, 1, 'one point');
  assert.equal(ok.result.flew.from.id, 'sishui');
  const did = notePage('fly', { province: '冀' }, ok.result, ok.state, content, NOW);
  assert.match(did.page_did.at(-1).what, /御剑.*漳渊/, 'Ling reads what the page did');
  assert.equal(fly(home, content, ctx, { province: 'Ji' }).result.ok, true, 'by its English name too');
  assert.equal(fly(ok.state, content, ctx, { province: '冀' }).result.here, true, 'already there: nothing spent');

  assert.equal(fly(home, content, ctx, { province: '兖' }).result.refused, 'not-home');
  assert.equal(fly(newState(content, 'zh', NOW), content, ctx, { province: '冀' }).result.refused, 'not-home');
  const shut = { ...home, chapter: '00-waimen', ended: ['00-prologue', '01-ji'], scene: null, place: 'waimen' };
  const locked = fly(shut, content, ctx, { province: '冀' });
  assert.equal(locked.result.refused, 'locked', 'never through a locked region');
  assert.ok(locked.result.say, 'in the world\'s words');
  const empty = fly({ ...home, stamina: 0, stamina_at: NOW.toISOString(), resting: true }, content, ctx, { province: '冀' });
  assert.equal(empty.result.refused, 'no-stamina');
  assert.equal(fly({ ...home, fight: { game: 'x', at: NOW.toISOString() } }, content, ctx, { province: '冀' }).result.refused, 'in-a-fight');
  for (const r of [locked, empty]) assert.equal(r.state, null, 'a refusal changes nothing');
});

test('the ink map draws the three states; the moment draws the spread, the rivers, the seal, the moons', () => {
  const geo = shapesOf(svgText, atlas.shapes);
  const ink = inkMapOf(content, fixture('ji-home'), NOW);
  const names = { 冀: '冀州', 徐: '徐州' };
  const map = inkMapSvg(geo, ink, { names, labels: atlas.provinces });
  assert.equal((map.match(/class="pvfill s-ink/g) ?? []).length, 1);
  assert.equal((map.match(/class="pvfill s-wash/g) ?? []).length, 1);
  assert.equal((map.match(/class="pvedge s-mist/g) ?? []).length, 7, 'seven in mist, dashed');
  assert.match(map, /class="inkseal"/);
  assert.match(map, />冀<\/text>.*>州<\/text>.*>鼎<\/text>.*>归<\/text>/s, '「冀州 · 鼎归」');
  assert.match(map, /class="inkmoon"/);
  assert.doesNotMatch(map, /<img|href=/, 'no raster art');

  const frame = { x: 0.55, y: 0.25, w: 0.2, h: 0.2 };
  const card = homingCardHtml(geo, ink, { province: '冀', frame, age: 1500, names, labels: atlas.provinces });
  assert.match(card, /<feTurbulence[^>]*\/><feDisplacementMap/, 'rough ink-on-paper edges');
  assert.match(card, /<mask id="homing-spread"[\s\S]*class="spread"/, 'the spread is a mask');
  assert.match(card, /clip-path="url\(#homing-\d\)">[^]*?class="plate(?: bare)?" [^>]*mask="url\(#homing-spread\)"/, 'the painting revealed through the mask, clipped to the province');
  assert.match(card, /class="bleed"/, 'a darker bleed at the spreading edge');
  assert.doesNotMatch(card, /spill/, 'never a dark fill');
  const painted = homingCardHtml(geo, ink, { province: '冀', frame, paint: { href: 'art/map/x.webp' } });
  assert.match(painted, /<image class="plate" href="art\/map\/x.webp"[^>]*mask="url\(#homing-spread\)"/);
  assert.match(card, /class="rivers draw"><path d="[^"]+" pathLength="1"/, 'rivers draw themselves');
  assert.match(card, /class="inkseal thud"/);
  assert.match(card, /class="waters ripple"/);
  assert.match(card, /class="inkdrop"/);
  assert.match(card, /--cam: translate\(/, 'closes in on the province');
  assert.match(card, /九州的水涨了一寸/);
  assert.match(card, /九鼎 · 一／九/);
  assert.match(card, /--age:1500ms/);
  assert.match(card, /data-homing="冀"/, 'a tap skips');
  const still = homingCardHtml(geo, ink, { province: '冀', frame, age: 0, still: true, names });
  assert.match(still, /class="card homing still"/);
  assert.match(still, new RegExp(`--age:${HOMING_MS.end}ms`), 'reduced motion: the last frame at once');
  assert.match(still, /class="inkmap moment still"/);
  const css = fs.readFileSync(path.join(ROOT, 'scripts', 'inkmap.css'), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  for (const k of ['ink-spread', 'ink-river', 'ink-thud', 'ink-ripple', 'ink-moon', 'ink-zoom']) assert.match(css, new RegExp(`@keyframes ${k}`));
  assert.ok(HOMING_MS.end >= 6000 && HOMING_MS.end <= 8000, '~6–8 s');
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts', 'index.html'), 'utf8'), /href="inkmap.css"/);
});

test('the moment ranks after her memory in the main slot, and is the page\'s own', () => {
  assert.equal(CARD_KINDS.homing.holds, true);
  assert.ok(PAGE_OWNS.has('homing'));
  const rank = (k) => MAIN.findIndex((r) => r.kinds.includes(k));
  assert.equal(rank('memory'), 0);
  assert.equal(rank('homing'), 1);
  const look = { place: { id: 'x' } };
  const both = stageSlots(look, [{ card: 'homing', id: '冀' }, { card: 'memory', id: 1 }]);
  assert.equal(both.main[0].card, 'memory', 'memory first');
  assert.equal(both.queue[0].cards[0].card, 'homing', 'then the map');
  assert.equal(freshHome(null, { jiuding: { homed: ['冀'] } }), null, 'the first read plays nothing old');
  assert.equal(freshHome([], { jiuding: { homed: ['冀'] } }), '冀');
  assert.equal(freshHome(['冀'], { jiuding: { homed: ['冀'] } }), null);
});

test('a tapped province: its 鼎\'s line, 银月\'s memory in 录, and 御剑 when the rules allow', () => {
  const ink = inkMapOf(content, fixture('ji-home'), NOW);
  const ji = provinceLineHtml(ink, '冀', { name: '冀州' });
  assert.match(ji, /冀州 · 鼎归/);
  assert.match(ji, /data-lu-album="1"/);
  assert.match(ji, /data-fly="冀"/);
  assert.doesNotMatch(provinceLineHtml(ink, '兖', { name: '兖州' }), /data-fly/);
  const shut = inkMapOf(content, { ...fixture('ji-home'), chapter: '00-waimen', ended: ['00-prologue', '01-ji'], scene: null, place: 'waimen' }, NOW);
  assert.doesNotMatch(provinceLineHtml(shut, '冀', { name: '冀州' }), /data-fly/, 'no button into a locked region');
});

test('卷轴: a chapter that declares `unroll` asks once; the page marks it played', () => {
  const c = { ...content, chapters: { ...content.chapters, '01-ji': { ...content.chapters['01-ji'], unroll: true } } };
  const s = { ...fixture('ji-end') };
  assert.equal(jiudingBrief(c, s).unroll, '01-ji');
  assert.equal(jiudingBrief(content, s).unroll, undefined, 'no shipped chapter unrolls yet (第三章 is later)');
  const r = unrolled(s, c, ctx, { chapter: '01-ji' });
  assert.deepEqual(r.state.unrolled, ['01-ji']);
  assert.equal(jiudingBrief(c, r.state).unroll, undefined, 'never again');
  assert.equal(unrolled(s, content, ctx, { chapter: '01-ji' }).result.refused, 'no-unroll');
  const html = unrollHtml('<svg></svg>', { label: '九州' });
  assert.match(html, /class="rod l"[\s\S]*class="sheet"><svg><\/svg>[\s\S]*class="rod r"/);
  assert.match(unrollHtml('x', { still: true }), /class="unroll still"/);
  const css = fs.readFileSync(path.join(ROOT, 'scripts', 'inkmap.css'), 'utf8');
  assert.match(css, /@keyframes unroll-open \{ from \{ clip-path: inset\(0 100% 0 0\)/, 'left to right');
});

test('the WebGL moment (fx.js): the libraries load only when it plays, and the SVG moment stands in without WebGL', async () => {
  const fx = fs.readFileSync(path.join(ROOT, 'scripts', 'fx.js'), 'utf8');
  assert.doesNotMatch(fx, /^import [^\n]*vendor/m, 'no static import of a library');
  assert.match(fx, /import\(PIXI_URL\)/, 'Pixi by dynamic import()');
  assert.match(fx, /createElement\('script'\)/, 'GSAP by a script tag, on demand');
  for (const f of ['pixi-8.21.0.min.mjs', 'gsap-3.15.0.min.js']) {
    assert.ok(fx.includes(f), `fx.js names ${f}`);
    assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'vendor', f)), `vendor/${f}`);
  }
  assert.doesNotMatch(fx, /https?:\/\/(?!www\.w3\.org\/)/, 'never the network (an SVG namespace is not a fetch)');
  const { glOK } = await import('../scripts/fx.js');
  assert.equal(glOK(), false, 'no WebGL here: the page takes the SVG moment');
  const page = fs.readFileSync(path.join(ROOT, 'scripts', 'lingjing.js'), 'utf8');
  assert.match(page, /fx: glOK\(\) && !stillMotion\(\)/, 'reduced motion never starts WebGL');
  assert.match(page, /ctl\.destroy\(\)/, 'one Application per moment, destroyed');

  const geo = shapesOf(svgText, atlas.shapes);
  const ink = inkMapOf(content, fixture('ji-home'), NOW);
  const frame = { x: 0.55, y: 0.25, w: 0.2, h: 0.2 };
  const card = homingCardHtml(geo, ink, { province: '冀', frame, fx: true });
  assert.match(card, /class="card homing fx"/);
  assert.match(card, /<div class="homingmap" data-fx style="aspect-ratio:/, 'an empty box of the map\'s shape for the canvas');
  assert.doesNotMatch(card, /<svg/, 'no SVG moment under it');
  assert.match(card, /九州的水涨了一寸/, 'the words stay DOM');
  const over = inkMapSvg(geo, ink, { moment: { province: '冀', frame }, overlay: true, paint: { href: 'x.webp' } });
  assert.match(over, /class="inkmap moment overlay"/);
  assert.doesNotMatch(over, /class="paper"|<image|class="plate/, 'no paper, no painting: the canvas has those');
  assert.match(over, /class="inkseal thud"/);
  assert.match(over, /class="rivers draw"/);
});
