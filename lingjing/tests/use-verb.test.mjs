import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState, threshold } from '../scripts/state.mjs';
import { useVerb } from '../scripts/rules/use-verb.mjs';
import { gearBrief } from '../scripts/rules/errands.mjs';
import { trade } from '../scripts/rules.mjs';
import { itemDoes, WORDS } from '../scripts/cards.js';
import { pouchHtml } from '../scripts/pouch.js';
import { walk, TO_WAIMEN } from './prologue.mjs';

const content = loadContent(), now = new Date('2026-11-10T12:00:00');

test('declared and default use verbs in both languages', () => {
  const charm = { use: { verb: { zh: '捏碎', en: 'Crush' } } };
  assert.deepEqual(useVerb(charm, 'zh'), { effect: '捏碎', button: '捏碎' });
  assert.deepEqual(useVerb(charm, 'en'), { effect: 'Crush', button: 'Crush' });
  assert.deepEqual(useVerb({ kind: 'pill' }, 'zh'), { effect: '服下', button: '服用' });
  assert.deepEqual(useVerb({ kind: 'pill' }, 'en'), { effect: 'Taken', button: 'Use' });
  assert.deepEqual(useVerb({}, 'zh'), { effect: '用了', button: '使用' });
  assert.deepEqual(useVerb({}, 'en'), { effect: 'Used', button: 'Use' });
});

test('pouch briefs and all progress lines carry the item verb', () => {
  const s = walk(newState(content, 'zh', now), TO_WAIMEN, content, now);
  s.bag = { 'chenlian-fu': 1, 'qi-pill': 1 };
  const bag = gearBrief(content, s).bag;
  const charm = bag.find(i => i.id === 'chenlian-fu'), pill = bag.find(i => i.id === 'qi-pill');
  assert.deepEqual(charm.use, { effect: '捏碎', button: '捏碎' });
  assert.deepEqual(pill.use, { effect: '服下', button: '服用' });
  const html = pouchHtml({ gear: gearBrief(content, s), look: { lang: 'zh', words: {} }, lang: 'zh', words: WORDS.zh, artBase: '../worlds/jiuding/' }, { sel: 'chenlian-fu' });
  assert.match(html, /data-use="chenlian-fu">捏碎/);
  assert.match(html, /捏碎：修为/);
  for (const extra of [{}, { wealth: 3 }, { full: true }, { capped: true }]) {
    const line = itemDoes({ progress: 10, ...extra }, { words: WORDS.zh, lang: 'zh' }, charm.use);
    assert.match(line, /捏碎/); assert.doesNotMatch(line, /服/);
  }
});

test('full cultivation refuses a charm without pill wording', () => {
  const s = walk(newState(content, 'zh', now), TO_WAIMEN, content, now);
  s.step = 1; s.progress = threshold(content, s); s.bag = { 'chenlian-fu': 1 };
  const result = trade(s, content, { now, quests: [] }, { action: 'use', id: 'chenlian-fu' }).result;
  assert.equal(result.refused, 'xw-full');
  assert.match(result.say, /捏碎/); assert.doesNotMatch(result.say, /服/);
});
