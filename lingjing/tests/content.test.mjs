// The shipped content lints clean, and the lint catches what it exists to
// catch: a dead next, a grant over its cap, a missing language, a creature
// with no picture, a scene nobody can reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lint, listWorlds, loadContent, loadWorld } from '../scripts/content.mjs';

const fresh = () => loadContent();
const prologue = c => c.chapters['00-prologue'];
const has = (problems, text) => problems.some(p => p.includes(text));

test('every shipped world lints clean', () => {
  assert.deepEqual(listWorlds(), ['jiuding']);
  for (const id of listWorlds()) assert.deepEqual(lint(loadWorld(id)), [], id);
});

test('a world is loaded by its id, and an unknown id names the ones that exist', () => {
  assert.equal(loadWorld('jiuding').world.id, 'jiuding');
  assert.equal(loadWorld().world.title.zh, '九鼎');
  assert.throws(() => loadWorld('nowhere'), /unknown world nowhere; worlds: jiuding/);
  assert.throws(() => loadWorld('../jiuding'), /unknown world/);
});

test('a novel\'s name anywhere in the world is caught', () => {
  const c = fresh();
  prologue(c).scenes['00-river'].setup.zh += '，韩立在岸边。';
  assert.ok(has(lint(c), 'scenes.00-river.setup.zh: names 韩立 (凡人修仙传)'));
  const d = fresh();
  d.creatures.creatures[0].quote.en += ' Xiao Yan';
  assert.ok(!has(lint(d), 'names'), 'only the listed names, never a translation the list lacks');
  d.creatures.creatures[0].quote.zh += '萧炎';
  assert.ok(has(lint(d), 'names 萧炎 (斗破苍穹)'));
});

test('the world card needs a folder-shaped id and a bilingual title and style', () => {
  const c = fresh();
  c.world.id = 'Jiu Ding';
  delete c.world.style.en;
  const problems = lint(c);
  assert.ok(has(problems, 'world: id must be'));
  assert.ok(has(problems, 'world: style needs zh and en'));
});

test('the prologue runs from the river to its end', () => {
  const ch = prologue(fresh());
  const path = [];
  for (let id = ch.first_scene; id; ) {
    path.push(id);
    const scene = ch.scenes[id];
    const onward = scene.exits.find(e => e.next && scene.buttons.includes(e.id));
    id = onward?.next;
  }
  assert.deepEqual(path, ['00-river', '00-waking', '00-stone', '00-practice', '00-fuzhu', '00-north']);
  assert.ok(ch.scenes['00-north'].exits.some(e => e.ends === '00-prologue'));
});

test('feeding Fuzhu is an exit no button offers', () => {
  const fuzhu = prologue(fresh()).scenes['00-fuzhu'];
  assert.ok(fuzhu.exits.some(e => e.id === 'gift'));
  assert.ok(!fuzhu.buttons.includes('gift'));
});

test('a dead next is caught', () => {
  const c = fresh();
  prologue(c).scenes['00-river'].exits[0].next = '00-nowhere';
  assert.ok(has(lint(c), 'next 00-nowhere does not exist'));
});

test('a grant over its cap is caught', () => {
  const c = fresh();
  prologue(c).scenes['00-fuzhu'].exits[0].grant.progress = 999;
  assert.ok(has(lint(c), 'over the scene cap'));
});

test('a missing language is caught', () => {
  const c = fresh();
  delete prologue(c).scenes['00-river'].setup.en;
  assert.ok(has(lint(c), 'needs both zh and en'));
});

test('a creature without its picture is caught', () => {
  const c = fresh();
  delete c.creatures.creatures[0].art;
  assert.ok(has(lint(c), 'needs art and art_source'));
});

test('a scene nobody can reach is caught', () => {
  const c = fresh();
  prologue(c).scenes['00-stray'] = { id: '00-stray', chapter: '00-prologue', buttons: [], exits: [{ id: 'x', means: 'x', stay: true }] };
  assert.ok(has(lint(c), 'scene 00-stray: cannot be reached'));
});

test('a need without a refusal line is caught', () => {
  const c = fresh();
  delete prologue(c).scenes['00-practice'].exits[0].refuse;
  assert.ok(has(lint(c), 'a need needs a refusal line'));
});

test('places: a road to nowhere, a road that does not come back, a tier off the ladder, a scene at no place', () => {
  const c = fresh();
  const xu = c.places['徐'];
  xu.places[0].roads.push('atlantis');
  xu.places[1].roads = xu.places[1].roads.filter(r => r !== 'sishui');
  xu.places[2].tier = 9;
  prologue(c).scenes['00-river'].at = 'atlantis';
  const problems = lint(c);
  assert.ok(has(problems, 'place sishui: road to atlantis, which is not a place'));
  assert.ok(has(problems, 'place sishui: road to sibei does not come back'));
  assert.ok(has(problems, 'place pengcheng: tier 9 is not on the ladder'));
  assert.ok(has(problems, 'scene 00-river: at atlantis, which is not a place of 徐'));
  const d = fresh();
  for (const p of d.places['徐'].places) p.roads = p.roads.filter(r => r !== 'xushan');
  d.places['徐'].places.find(p => p.id === 'xushan').roads = [];
  assert.ok(has(lint(d), 'place xushan: no road reaches it from the start'));
});

test('the catalog: a price below its sell, a missing picture, a pill over its table, a bag that names no item', () => {
  const c = fresh();
  const item = id => c.items.items.find(i => i.id === id);
  item('qi-pill').buy = 10;
  item('ginseng').art = 'art/items/nothing.svg';
  item('lingzhi').effect = { progress: 99, table: 'puzzle' };
  item('moon-bell').effect = { wear: 'hat' };
  item('jade-fish').kind = 'relic';
  prologue(c).scenes['00-fuzhu'].exits.find(e => e.id === 'gift').needs.bag = 'unicorn-horn';
  c.tasks.tasks[0].gives = { bag: 'unicorn-horn' };
  const problems = lint(c);
  assert.ok(has(problems, 'item qi-pill: buys for 10, below its sell price 20'));
  assert.ok(has(problems, 'item ginseng: art art/items/nothing.svg is missing'));
  assert.ok(has(problems, 'item lingzhi: progress 99 is over the puzzle cap of 20'));
  assert.ok(has(problems, 'item moon-bell: cannot wear on hat'));
  assert.ok(has(problems, 'item jade-fish: unknown kind relic'));
  assert.ok(has(problems, 'unknown item unicorn-horn'));
  assert.ok(has(problems, 'gives unknown item unicorn-horn'));
});

test('a creature needs a root; a duel needs a known creature, a kind and its withdrawn line', () => {
  const c = fresh();
  c.creatures.creatures[0].root = 'plasma';
  const subdue = prologue(c).scenes['00-fuzhu'].exits.find(e => e.id === 'subdue');
  subdue.game = { id: 'subdue-x', kind: 'duel', creature: 'qilin' };
  delete subdue.withdrawn;
  prologue(c).scenes['00-fuzhu'].exits.find(e => e.id === 'around').game = { id: 'tickle-x', kind: 'tickle' };
  const problems = lint(c);
  assert.ok(has(problems, 'creature fuzhu: needs a root the traits know, not plasma'));
  assert.ok(has(problems, 'unknown game kind tickle'));
  assert.ok(has(problems, 'duels unknown creature qilin'));
  assert.ok(has(problems, 'a duel needs a withdrawn line'));
});

test('a road may cross into another province; a breakthrough needs its line and a gated chapter', () => {
  const c = fresh();
  assert.ok(c.places['徐'].places.find(p => p.id === 'sibei').roads.includes('zhangnan'));
  assert.deepEqual(lint(c), []);
  const take = c.chapters['01-ji'].scenes['01-cauldron'].exits.find(e => e.id === 'take');
  delete take.refuse;
  c.chapters['01-ji'].gate = 99;
  const problems = lint(c);
  assert.ok(has(problems, 'a breakthrough needs a refusal line'));
  assert.ok(has(problems, 'no tier on the ladder has gate 99'));
});

test('chapter 1 walks from the Zhang to the cauldron and ends', () => {
  const ch = fresh().chapters['01-ji'];
  assert.equal(ch.opens, '2026-10-01'); assert.equal(ch.gate, 1); assert.equal(ch.corridor, false);
  const at = Object.values(ch.scenes).map(s => `${s.id}@${s.at}`);
  assert.deepEqual(at, ['01-altar@hebo', '01-arrive@zhangnan', '01-cauldron@zhangyuan', '01-deep@zhangyuan', '01-end@zhangyuan', '01-ye@ye']);
  assert.ok(ch.scenes['01-end'].exits.some(e => e.ends === '01-ji'));
  assert.ok(ch.scenes['01-cauldron'].exits.find(e => e.id === 'take').breakthrough);
});
