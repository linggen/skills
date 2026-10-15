// The header's faces wait for the story to name them (live, 2026-10-15: 瞿老's face stood in 00-gate's
// header while the book still called him 「扫地的老头」). Look marks each person `named` (rules/look.mjs
// namedYet): true once a passed scene says the name, 'here' when only this one does (the page shows the
// face once the passage has said it — cards.js people), false while none has.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';
import { withTold } from '../scripts/dialogue.js';
import { WORDS, cardHtml as drawCard } from '../scripts/cards.js';

const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = () => ({ now: NOW, quests: [] });

test('00-gate: 瞿老 is in the scene but not yet named — his face waits; a face the book names stands', () => {
  const s = newState(content, 'zh', NOW);
  const gate = { ...s, chapter: '00-prologue', scene: '00-gate', place: content.chapters['00-prologue'].scenes['00-gate'].at ?? s.place, done_scenes: [] };
  const l = look(gate, content, ctx());
  const qu = l.scene.people.find((p) => p.id === 'qulao');
  assert.equal(qu?.named, false, JSON.stringify(qu));
  const html = drawCard({ card: 'people' }, { look: l, lang: 'zh', words: WORDS.zh, reading: null });
  assert.ok(!html.includes('瞿老'), 'no face for him yet');
  // once a passed scene has said his name, he stands
  const named = Object.values(content.chapters).flatMap((c) => Object.values(c.scenes)).find((sc) => sc.id !== '00-gate' && (sc.story?.zh ?? '').includes('瞿老'));
  assert.ok(named, 'some scene names him');
  const later = look({ ...gate, done_scenes: [...gate.done_scenes, named.id] }, content, ctx());
  assert.equal(later.scene.people.find((p) => p.id === 'qulao')?.named, true);
  assert.match(drawCard({ card: 'people' }, { look: later, lang: 'zh', words: WORDS.zh, reading: null }), /瞿老/);
});

test("'here': the face stands once the passage on show has said the name, or once it is read through", () => {
  const l = { scene: { people: [{ id: 'x', name: '瞿老', named: 'here' }] } };
  const page = (reading) => drawCard({ card: 'people' }, { look: l, lang: 'zh', words: WORDS.zh, reading });
  const r = (at) => ({ ...withTold(null, [{ of: 'scene', id: 's', beats: [{ text: '扫地的老头。' }, { text: '瞿老道：「来。」' }] }], 's'), i: 0, j: at });
  assert.ok(!page(r(0)).includes('瞿老'), 'before the name');
  assert.match(page(r(1)), /瞿老/, 'at the name');
  assert.match(page(null), /瞿老/, 'no passage playing');
});
