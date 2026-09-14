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
