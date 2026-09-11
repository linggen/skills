// The shipped content lints clean, and the lint catches what it exists to
// catch: a dead next, a grant over its cap, a missing language, a creature
// with no picture, a scene nobody can reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lint, loadContent } from '../scripts/content.mjs';

const fresh = () => loadContent();
const prologue = c => c.chapters['00-prologue'];
const has = (problems, text) => problems.some(p => p.includes(text));

test('the shipped content lints clean', () => {
  assert.deepEqual(lint(fresh()), []);
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
  prologue(c).scenes['00-fuzhu'].exits[0].grant.xw = 999;
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
