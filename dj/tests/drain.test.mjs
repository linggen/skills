// A finished Get run hands the agent facts; the words are the agent's.
import test from 'node:test';
import assert from 'node:assert/strict';

import { drainStep, drainMessage } from '../scripts/drain.js';

const item = (id, status, extra = {}) => ({ id, artist: 'A', title: `T${id}`, status, ...extra });

test('nothing is said while the run is going, then its facts once', () => {
  const seen = new Set();
  assert.equal(drainStep([item(1, 'running'), item(2, 'pending')], seen), null);
  assert.equal(drainStep([item(1, 'done', { file: 'A - T1.mp3' }), item(2, 'running')], seen), null);
  const facts = drainStep([item(1, 'done', { file: 'A - T1.mp3' }), item(2, 'error', { error: 'no playable source found' })], seen);
  assert.deepEqual(facts, { got: 1, got_names: ['A - T1'], failed: ['A - T2: no playable source found'], for_phone: undefined });
  assert.equal(drainStep([item(1, 'done'), item(2, 'error')], seen), null, 'said once');
});

test('finished rows from before the page looked are not a run', () => {
  assert.equal(drainStep([item(1, 'done'), item(2, 'error')], new Set()), null);
});

test('a run the user cancelled whole says nothing', () => {
  const seen = new Set();
  drainStep([item(1, 'pending')], seen);
  assert.equal(drainStep([item(1, 'cancelled')], seen), null);
});

test('the message is a tag and the facts, no sentence', () => {
  const m = drainMessage({ got: 2, got_names: ['A - B', 'C - D'], failed: [] });
  assert.match(m, /^\[DOWNLOADS\] \{/);
  assert.deepEqual(JSON.parse(m.slice('[DOWNLOADS] '.length)).got, 2);
});
