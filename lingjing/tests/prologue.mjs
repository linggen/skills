// tests/prologue.mjs — the prologue walked the ordinary way (prologue-v3:
// story/jiuding-lu/notes/archive/prologue-1-source.md and prologue-2-source.md),
// for every test that needs a save at a point of it or past it. One walk, so a
// scene rewritten is one edit here, not one in every test file.
import assert from 'node:assert/strict';
import { resolve, task, VERBS, win } from '../scripts/rules.mjs';

/* The walk's birthday (named for v1, whose 木 水 火 土 it read under the retired
   rule): now 五行杂灵根 like every birthday, 木 and 水 tied to lead. */
export const V1_BIRTH = '1986-07-07';

/* `look` with `at` is 看 (rules/examine.mjs): a hotspot looked at, free. */
const FNS = { resolve, task, win, look: VERBS.look };

/* 石坳村 to the valley: the name card, the rent, the egg, the stele's rules,
   the clue at 黑松岭, the storm, the fall, the fox — and she joins at daybreak (`follow`). */
export const TO_VALLEY = [
  ['resolve', { exit: 'begin' }],
  ['resolve', { exit: 'endure' }],
  ['resolve', { exit: 'egg' }],
  ['resolve', { exit: 'go' }],
  ['resolve', { exit: 'lookout' }],
  ['resolve', { exit: 'rules' }],
  // 黑松岭: the tracks go on past the stone by the stream — found, the chase opens.
  ['look', { at: 'stone' }],
  ['resolve', { exit: 'carve' }],
  ['resolve', { exit: 'turn' }],
  ['resolve', { exit: 'check' }],
  ['resolve', { exit: 'save' }],
  ['resolve', { exit: 'share' }],
];
/* Up to 00-hall: out of the valley, the deer, the rent, her sleep in the
   token, half a year, 舅舅, the three trials. `won` sets a scene fight's win
   down as the page would record it. */
export const TO_HALL = [
  ...TO_VALLEY,
  ['resolve', { exit: 'follow' }],
  ['resolve', { exit: 'climb' }],
  ['resolve', { exit: 'left' }],
  ['resolve', { exit: 'dumb' }],
  ['resolve', { exit: 'visit' }],
  ['resolve', { exit: 'on' }],
  ['resolve', { exit: 'bath' }],
  ['resolve', { exit: 'on' }],
  ['resolve', { exit: 'go' }],
  ['resolve', { exit: 'go' }],
  ['resolve', { exit: 'steady' }],
  ['win', { id: 'gate-luoshu' }],
  ['task', { action: 'done', id: 'gate-luoshu' }],
  ['resolve', { exit: 'pass' }],
  ['won', { id: 'gate-longzhi' }],
  ['resolve', { exit: 'subdue' }],
];
/* The roots read: the outer court's first night (公中). */
export const TO_WAIMEN = [...TO_HALL, ['resolve', { exit: 'born', birth: V1_BIRTH }]];
/* The prologue ended: 公中 paid, the notice board, and chapter 1 opens. */
export const TO_OPEN = [...TO_WAIMEN, ['resolve', { exit: 'pay' }], ['resolve', { exit: 'rest' }]];

/* The world as the tests written before 第一章 · 外门 knew it: the prologue
   ended straight onto the open 徐 and the road to 冀 — no chapter between, no
   map shut by a chapter, 冀 not waiting on its rewrite. Their fixtures test
   the engine's roads, markets and fights on that spine; tests/waimen.test.mjs
   tests the chapter as shipped. Mutates and returns the content it is given. */
export function beforeChapterOne(content) {
  delete content.chapters['00-waimen'];
  delete content.chapters['00-prologue'].map;
  delete content.chapters['01-ji'].coming;
  return content;
}

/* Walk `steps` from `state`; every step must land. */
export function walk(state, steps, content, now) {
  let s = state;
  for (const [verb, args] of steps) {
    if (verb === 'won') { s = { ...s, wins: { ...s.wins, [args.id]: now.toISOString() } }; continue; }
    const out = FNS[verb](s, content, { now, quests: [] }, args);
    assert.equal(out.result.ok, true, `${verb} ${JSON.stringify(args)} at ${s.scene}: ${JSON.stringify(out.result)}`);
    s = out.state ?? s;
  }
  return s;
}
