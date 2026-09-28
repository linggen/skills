// tests/prologue.mjs — the prologue walked the ordinary way (doc/drafts/prologue-v1.md),
// for every test that needs a save at a point of it or past it. One walk, so
// a scene rewritten is one edit here, not one in every test file.
import assert from 'node:assert/strict';
import { resolve, task, win } from '../scripts/rules.mjs';

/* A birthday whose roots read 木 水 火 土, in that order — the four of v1. */
export const V1_BIRTH = '1986-07-07';

const FNS = { resolve, task, win };

/* The steps, in order: [verb, args]. `won` sets a scene fight's win down as the page would record it. */
export const TO_HALL = [
  ['resolve', { exit: 'reach' }],
  ['resolve', { exit: 'name', value: '青玄', gender: 'female' }],
  ['resolve', { exit: 'uphill' }],
  ['resolve', { exit: 'help' }],
  ['resolve', { exit: 'climb' }],
  ['win', { id: 'gate-luoshu' }],
  ['task', { action: 'done', id: 'gate-luoshu' }],
  ['resolve', { exit: 'pass' }],
  ['won', { id: 'gate-longzhi' }],
  ['resolve', { exit: 'subdue' }],
];
export const TO_FUZHU = [
  ...TO_HALL,
  ['resolve', { exit: 'born', birth: V1_BIRTH }],
  ['win', { id: 'alchemy-first' }],
  ['task', { action: 'done', id: 'alchemy-first' }],
  ['resolve', { exit: 'set-out' }],
];
export const TO_OPEN = [...TO_FUZHU, ['resolve', { exit: 'gift' }], ['resolve', { exit: 'rest' }]];

/* Walk `steps` from `state`; every step must land. */
export function walk(state, steps, content, now) {
  let s = state;
  for (const [verb, args] of steps) {
    if (verb === 'won') { s = { ...s, wins: { ...s.wins, [args.id]: now.toISOString() } }; continue; }
    const out = FNS[verb](s, content, { now, quests: [] }, args);
    assert.equal(out.result.ok, true, `${verb} ${JSON.stringify(args)}: ${JSON.stringify(out.result)}`);
    s = out.state ?? s;
  }
  return s;
}
