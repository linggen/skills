// The world map card: the frame around a province's places, and the card
// drawn from Look — points, no lines, the view toggle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { frameOf, inside, within } from '../scripts/atlas.js';
import { WORDS, cardHtml } from '../scripts/cards.js';
import { loadWorld } from '../scripts/content.mjs';

const ASPECT = 1.3645;

test('a frame holds every place, stays inside the map, and keeps a card shape', () => {
  const points = [[0.85, 0.27], [0.99, 0.29], [0.95, 0.39]];
  const f = frameOf(points, ASPECT);
  for (const p of points) assert.ok(inside(f, p), JSON.stringify({ f, p }));
  assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= 1 + 1e-9 && f.y + f.h <= 1 + 1e-9);
  const shape = (f.w * ASPECT) / f.h;
  assert.ok(shape >= 1.2 - 1e-9 && shape <= 1.9 + 1e-9, String(shape));
  // One place alone still shows a stretch of country around it.
  assert.ok(frameOf([[0.5, 0.5]], ASPECT).w >= 0.14);
  assert.deepEqual(frameOf([], ASPECT), { x: 0, y: 0, w: 1, h: 1 });
  assert.deepEqual(within({ x: 0.5, y: 0.5, w: 0.25, h: 0.5 }, [0.625, 0.75]), { left: 50, top: 50 });
});

test('the map card draws the province up close as points, and all nine at a tap', () => {
  const content = loadWorld('jiuding');
  const doc = content.places['青'];
  const look = {
    lang: 'zh',
    world: { dir: 'worlds/jiuding', atlas: content.world.atlas },
    place: {
      province: { id: '青', name: '青州' },
      places: doc.places.map(p => ({ id: p.id, name: p.name.zh, map: p.map, here: p.id === 'penglai', road: ['linzi', 'liubo', 'chengshan', 'laoshan'].includes(p.id), too_hard: false })),
    },
  };
  const ctx = view => ({ look, lang: 'zh', words: WORDS.zh, content, mapView: view });
  const near = cardHtml({ card: 'map' }, ctx('province'));
  assert.match(near, /<img src="\.\.\/worlds\/jiuding\/art\/map\/jiuzhou\.svg"/);
  assert.equal((near.match(/class="pt/g) ?? []).length, 9);
  assert.match(near, /<span class="pt here[^"]*"[^>]*><i><\/i><span>蓬莱<\/span>/);
  assert.match(near, /<button class="pt road[^"]*" data-go="liubo"/);
  assert.doesNotMatch(near, /data-say/, '去X is the page\'s own Move, never a word to Ling');
  assert.doesNotMatch(near, /<svg|<path|<line/);
  assert.match(near, /data-mapview="world">九州全图</);
  // The whole map: where the player is by the dot alone, and each province
  // with places opens up close; one without (雍) is only a name.
  const atlas = Object.fromEntries(Object.entries(content.places).map(([id, d]) => [id, { name: `${id}州`, places: d.places.map(p => ({ id: p.id, name: p.name.zh, map: p.map, too_hard: false })) }]));
  delete atlas['雍']; // every province has places now (chapters 4–9); one the atlas lacks is still only a name
  const whole = cardHtml({ card: 'map' }, { ...ctx('world'), atlas });
  assert.equal((whole.match(/class="pt/g) ?? []).length, 1);
  assert.match(whole, /<span class="pt here" style="[^"]*"><i><\/i><\/span>/);
  assert.doesNotMatch(whole, /<span>蓬莱<\/span>/);
  assert.equal((whole.match(/class="pv/g) ?? []).length, 9);
  assert.match(whole, /<button class="pv here" data-mapview="province"/);
  assert.match(whole, /<button class="pv" data-mapview="冀"/);
  assert.match(whole, /<span class="pv"[^>]*>雍<\/span>/);
  assert.match(whole, /class="act" data-mapview="province">青州</);
  // Another province up close: its places alike, a tap the page's own Move.
  const ji = cardHtml({ card: 'map' }, { ...ctx('冀'), atlas });
  assert.match(ji, /<div class="cardtitle">冀州<\/div>/);
  assert.equal((ji.match(/class="pt/g) ?? []).length, content.places['冀'].places.length);
  assert.doesNotMatch(ji, /class="pt (here|road)/);
  assert.match(ji, /data-go="ye"[^>]*><i><\/i><span>邺城/);
  assert.match(ji, /data-mapview="world">九州全图<\/button><button class="act" data-mapview="province">青州</);
});
