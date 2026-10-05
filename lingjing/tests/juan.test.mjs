// 卷一 is all there is (Hanli, 2026-10-05: 游戏只到卷一……地图上后面8个州显示灰色的，或者不能去就好了).
// The rules wall it by data alone: a chapter's `juan`, a thing's `juan`, the chapter's `map` —
// never a name in code (world.mjs juanOpen, ofJuan, shutSay).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, move } from '../scripts/rules.mjs';
import { juanOpen, ofJuan, provinceOpen, placeOf, allPlaces, encounterOf } from '../scripts/rules/world.mjs';
import { shelfOf } from '../scripts/rules/look.mjs';
import { pickSeed } from '../scripts/rules/tale.mjs';
import { dealMeet } from '../scripts/rules/road.mjs';
import { drop } from '../scripts/rules/arms.mjs';
import { inkMapOf } from '../scripts/rules/inkmap.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00+08:00');
const ctx = { now: NOW, quests: [] };
const JUAN_ONE = ['00-prologue', '00-waimen', '00-zhuji'];
const jiScenes = Object.keys(content.chapters['01-ji'].scenes);
/* After the Foundation, free in 卷一: 01-ji ended, 卷二 waiting (`coming`). */
const free = (place = 'ye', extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '01-ji', scene: null, place, tier: 'foundation', step: 0, progress: 0,
  traits: ['wood', 'fire'], ended: [...JUAN_ONE, '01-ji'], done_scenes: jiScenes, ...extra,
});
const juanOf = (list, id) => list.find(x => x.id === id)?.juan ?? 1;

test('卷一 is the one 卷 open: the chapters say their 卷, and the provinces beyond it are shut', () => {
  assert.equal(juanOpen(content, NOW), 1);
  for (const ch of Object.values(content.chapters)) assert.ok(Number.isInteger(ch.juan ?? 1), ch.id);
  assert.deepEqual(['00-prologue', '00-waimen', '00-zhuji', '01-ji'].map(id => content.chapters[id].juan), [1, 1, 1, 1]);
  const open = Object.keys(content.dictionary.provinces).filter(p => provinceOpen(content, p, NOW));
  assert.deepEqual(open.sort(), ['冀', '徐'].sort(), 'only 徐 and 冀');
  // With nothing waiting, every 卷 is open — the wall is the data's, not a constant.
  const all = { ...content, chapters: Object.fromEntries(Object.entries(content.chapters).map(([id, c]) => [id, { ...c, coming: undefined }])) };
  assert.equal(juanOpen(all, NOW), Infinity);
});

test('a road into a province of a later 卷 is refused in the world\'s words; a place 卷一\'s map leaves out, too', () => {
  const s = free('ye');
  // 邺城 → 濮阳 (兖): a road on the land, not open.
  const yan = move(s, content, ctx, { place: 'pushui' });
  assert.equal(yan.result.ok, false);
  assert.equal(yan.result.refused, 'road-closed');
  assert.equal(yan.result.say, content.chapters['01-ji'].map.beyond.zh);
  assert.equal(move(s, content, ctx, { province: '青' }).result.say, content.chapters['01-ji'].map.beyond.zh);
  // 云龙山 is 徐's, but not on 卷一's map.
  const off = move(free('pengcheng'), content, ctx, { place: 'yunlong' });
  assert.equal(off.result.refused, 'road-closed');
  assert.equal(off.result.say, content.chapters['01-ji'].map.say.zh);
  // The road north from 泗水北岸 is open, and 邺城 is reached on foot.
  const north = move(free('sibei'), content, ctx, { place: 'ye' });
  assert.equal(north.result.ok, true, JSON.stringify(north.result));
  assert.equal(north.state.place, 'ye');
});

test('the map: the eight provinces past 卷一 are greyed (locked) and say why; 徐 and 冀 are open — while 01-ji runs and after it', () => {
  for (const s of [free('ye'), free('ye', { ended: JUAN_ONE, done_scenes: [] , scene: '01-ye' })]) {
    const ink = inkMapOf(content, s, NOW);
    for (const p of ['兖', '青', '扬', '荆', '豫', '梁', '雍']) {
      assert.equal(ink.provinces[p].locked, true, p);
      assert.equal(ink.provinces[p].say, content.chapters['01-ji'].map.beyond.zh, p);
    }
    assert.equal(ink.provinces['徐'].locked, false);
    assert.equal(ink.provinces['冀'].locked, false);
  }
  // On the province card the places beyond 卷一's map are greyed (closed).
  const place = look(free('pengcheng'), content, ctx).place;
  assert.equal(place.places.find(p => p.id === 'yunlong').closed, true);
  assert.equal(place.places.find(p => p.id === 'sishui').closed, undefined);
});

test('nothing of a later 卷 is met, sold, found, dropped or told', () => {
  const later = content.creatures.creatures.filter(c => (c.juan ?? 1) > 1).map(c => c.id);
  assert.ok(later.includes('wuzhiqi') && later.includes('fuzhu') && later.includes('paoxiao') && later.includes('jingwei'));
  // No place of 卷一's map holds a later beast.
  const map = content.chapters['01-ji'].map.places;
  for (const id of map) assert.ok(!later.includes(placeOf(content, id).has?.creature), id);
  // A haunt of a later beast, stood in anyway, holds nothing.
  assert.equal(encounterOf(content, free('sikou'), NOW), null, '无支祁 is 卷四\'s');
  // No shelf sells a thing of a later 卷.
  for (const p of allPlaces(content).filter(p => p.has?.shop)) {
    for (const i of shelfOf(content, p.province, free(p.id), NOW)) assert.ok((i.juan ?? 1) <= 1, `${p.id}: ${i.id}`);
  }
  // A seed of a later 卷 is never the day's.
  for (let d = 1; d <= 40; d += 1) {
    const now = new Date(Date.UTC(2026, 9, d, 4));
    for (const place of ['ye', 'sishui']) {
      const seed = pickSeed(content, free(place), now);
      if (!seed) continue;
      const prov = placeOf(content, place).province;
      assert.ok(ofJuan(content, content.seeds[prov].seeds.find(x => x.id === seed.id), now), `${place} ${seed.id}`);
    }
  }
  // The road deals no later beast and no later find.
  for (let d = 1; d <= 40; d += 1) {
    const now = new Date(Date.UTC(2026, 9, d, 4));
    for (const place of map) {
      const m = dealMeet(content, { ...free(place), meets: null, chance: null }, { now, quests: [] });
      if (m?.kind === 'beast') assert.ok(!later.includes(m.creature), `${place}: ${m.creature}`);
      if (m?.kind === 'find') {
        const f = content.meets.finds[m.find][m.n];
        assert.ok(!f.item || juanOf(content.items.items, f.item) <= 1, `${place}: ${f.item}`);
      }
    }
  }
  // A beast that carries a thing of a later 卷 leaves it behind.
  const carrier = { id: 'test-beast', drops: ['huojing', 'lingzhi'] };
  const got = drop(content, free('ye'), carrier, NOW).map(g => g.id);
  assert.ok(got.includes('lingzhi') && !got.includes('huojing'), JSON.stringify(got));
});

test('the lint holds the wall: a 卷一 errand asks for no later beast and pays no later thing', async () => {
  const { lint } = await import('../scripts/content.mjs');
  assert.deepEqual(lint(content), []);
  const bad = loadContent();
  bad.quests[0] = { ...bad.quests[0], need: [{ kind: 'subdue', creature: 'wuzhiqi', n: 1 }] };
  assert.ok(lint(bad).some(p => p.includes('asks for wuzhiqi, of a later 卷')));
  const odd = loadContent();
  odd.creatures.creatures[0].juan = 0;
  assert.ok(lint(odd).some(p => p.includes('is not a 卷 number')));
});
