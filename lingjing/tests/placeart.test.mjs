// The place's painting (placeart.js): declared once per location, found by the scene's place
// and its spot within it, a room says so, a night painting only where one was painted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeArtOf } from '../scripts/placeart.js';

const table = { places: {
  chaifang: { at: 'chaifang', indoor: true, day: 'a/chaifang.webp', night: 'a/chaifang-night.webp' },
  'chaifang-back': { at: 'chaifang', match: ['柴房后面', '后院'], day: 'a/back.webp' },
  'chaifang-door': { at: 'chaifang', match: ['柴房'], day: 'a/door.webp' },
  'jin-stacks': { scape: ['stacks'], indoor: true, day: 'a/stacks.webp' },
  'jin-dark': { scape: ['dark'], indoor: true, night: 'a/stacks-night.webp' },
} };

test('a scene takes its spot\'s painting, else the place\'s own', () => {
  assert.equal(placeArtOf(table, { at: 'chaifang', name: '沉鼎观 · 柴房后面 · 泥地里' }).id, 'chaifang-back');
  assert.equal(placeArtOf(table, { at: 'chaifang', name: '沉鼎观 · 外门后院 · 柴堆' }).id, 'chaifang-back');
  // the longest token wins: 柴房后面 over 柴房
  assert.equal(placeArtOf(table, { at: 'chaifang', name: '沉鼎观 · 柴房' }).id, 'chaifang-door');
  assert.equal(placeArtOf(table, { at: 'chaifang', name: '' }).id, 'chaifang');
  assert.equal(placeArtOf(table, { at: 'chaifang' }).id, 'chaifang');
  assert.equal(placeArtOf(table, { at: 'nowhere', name: '柴房' }), null);
  assert.equal(placeArtOf(null, { at: 'chaifang' }), null);
});

test('a room says so; outdoors is the default', () => {
  assert.equal(placeArtOf(table, { at: 'chaifang' }).indoor, true);
  assert.equal(placeArtOf(table, { at: 'chaifang', name: '柴房后面' }).indoor, false);
});

test('night: its own painting where one was painted, else the day one; a night-only place by day too', () => {
  assert.deepEqual(placeArtOf(table, { at: 'chaifang' }, false), { id: 'chaifang', src: 'a/chaifang-night.webp', indoor: true, night: true });
  assert.equal(placeArtOf(table, { at: 'chaifang' }, true).src, 'a/chaifang.webp');
  assert.deepEqual(placeArtOf(table, { at: 'chaifang', name: '柴房后面' }, false), { id: 'chaifang-back', src: 'a/back.webp', indoor: false, night: false });
  assert.equal(placeArtOf(table, { scape: 'dark' }, true).src, 'a/stacks-night.webp');
});

test('a 今线 scene goes by its scape, not its place', () => {
  assert.equal(placeArtOf(table, { at: 'chaifang', scape: 'stacks' }).id, 'jin-stacks');
  assert.equal(placeArtOf(table, { scape: 'track' }), null);
});

test('the stage: a festival over the place outdoors, the place over the 节气 and the weather; 今线 only its place', async () => {
  const { stagePick, indoorOf } = await import('../scripts/atmos.js');
  const tb = { kinds: { clear: { day: 'c-d', night: 'c-n' } }, terms: { lidong: 't-lidong' } };
  const art = placeArtOf(table, { at: 'chaifang' });
  const place = { id: 'chaifang', backdrop: art.src, indoor: art.indoor };
  assert.deepEqual(stagePick({ place, table: tb, term: 'lidong', weather: { kind: 'clear' } }), { tier: 'place', art: 'a/chaifang.webp' });
  // 柴房 is a room: on a festival day it keeps its own painting (Hanli, 2026-10-15: 「节日画只在户外显示」); outdoors the festival wins.
  assert.deepEqual(stagePick({ place, table: tb, festival: { backdrop: 'f' }, weather: { kind: 'clear' } }), { tier: 'place', art: 'a/chaifang.webp' });
  assert.deepEqual(stagePick({ place: { ...place, indoor: false }, table: tb, festival: { backdrop: 'f' }, weather: { kind: 'clear' } }), { tier: 'festival', art: 'f' });
  assert.deepEqual(stagePick({ place: { id: 'x' }, table: tb, term: 'lidong', weather: { kind: 'clear' } }), { tier: 'term', art: 't-lidong' });
  assert.equal(indoorOf(null, place), true);
  const jin = placeArtOf(table, { scape: 'stacks' });
  assert.deepEqual(stagePick({ scene: { line: 'jin' }, place: { backdrop: jin.src }, table: tb }), { tier: 'place', art: 'a/stacks.webp' });
  assert.deepEqual(stagePick({ scene: { line: 'jin' }, place: {}, table: tb }), { tier: null, art: null });
});

test('卷一: every scene stands at a painted place, and every painting is on disk', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const world = new URL('../worlds/jiuding/', import.meta.url).pathname;
  const tb = JSON.parse(fs.readFileSync(path.join(world, 'backdrops.json'), 'utf8'));
  for (const [id, e] of Object.entries(tb.places)) {
    assert.ok(e.day || e.night, id);
    for (const f of [e.day, e.night].filter(Boolean)) assert.ok(fs.existsSync(path.join(world, f)), `${id}: ${f}`);
    assert.equal(typeof e.indoor, 'boolean', `${id} says whether it is a room`);
  }
  const chapters = ['00-prologue', '00-waimen', '00-zhuji'];
  let n = 0;
  for (const ch of chapters) for (const f of fs.readdirSync(path.join(world, 'chapters', ch, 'scenes'))) {
    const s = JSON.parse(fs.readFileSync(path.join(world, 'chapters', ch, 'scenes', f), 'utf8'));
    const got = placeArtOf(tb, { at: s.at ?? null, name: s.place?.zh ?? '', scape: s.scape ?? null });
    assert.ok(got, `${ch}/${f} (${s.place?.zh}) has a painting`);
    n++;
  }
  assert.ok(n > 60);
  // a few spots, by their names
  const at = (a, name) => placeArtOf(tb, { at: a, name }).id;
  assert.equal(at('shiao', '石坳村 · 灶间'), 'shiao-zaojian');
  assert.equal(at('chaifang', '沉鼎观 · 柴房后面 · 泥地里'), 'chaifang-back');
  assert.equal(at('zhengdian', '沉鼎观 · 大比 · 对秦雁'), 'yanwu');
  assert.equal(at('shimen', '沉鼎秘境 · 石室'), 'mijing-shishi');
  assert.equal(placeArtOf(tb, { scape: 'dark' }, true).night, true, '古籍部 at night is the night painting');
});

// 卷一's own province (Hanli 10-27 at 渡口: 「背景图片啥的不太匹配吧」 — the place had none, the 节气's autumn wood stood in):
// every place of 徐 has its own painting, and the file is there.
test('every place of 徐 has a painting of its own, on disk', async () => {
  const fs = await import('node:fs');
  const dir = new URL('../worlds/jiuding/', import.meta.url);
  const backdrops = JSON.parse(fs.readFileSync(new URL('backdrops.json', dir), 'utf8'));
  const xu = JSON.parse(fs.readFileSync(new URL('places/xu.json', dir), 'utf8'));
  for (const p of xu.places) {
    const art = placeArtOf(backdrops, { at: p.id, name: '' });
    assert.ok(art, `${p.id} has no painting`);
    assert.ok(fs.existsSync(new URL(art.src, dir)), `${p.id}: ${art.src} missing`);
  }
});
