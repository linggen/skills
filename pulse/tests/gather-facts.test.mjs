// What the greeting and the Needs you view are told: counts from the page's own
// cards, empties never counted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gatherFacts, lastGatherBlock } from '../scripts/gather-facts.js';

test('counts real cards only, by kind and source', () => {
  const f = gatherFacts({
    last_run_at: '2026-09-24T10:00:00Z',
    sections: {
      mentions: { cards: [{ type: 'reply_to_me', source: 'hn' }, { type: 'mention', sub: 'macapps' }, { type: 'empty', source: 'x' }] },
      replies_due: { cards: [{ type: 'reply', source: 'reddit' }] },
      discovery: { last_updated: '2026-09-24T11:00:00Z', cards: [{ type: 'discovery', sub: 'bsky' }, { type: 'discovery', source: 'hn' }, { type: 'empty', source: 'reddit' }] },
    },
  });
  assert.deepEqual(f, {
    at: '2026-09-24T11:00:00Z', replies_to_you: 2, mentions: 1, threads: 2,
    threads_by_source: { bluesky: 1, hn: 1 }, inbox_by_source: { hn: 1, reddit: 1 },
  });
});

test('a session that never gathered has no facts, and the block says first scan', () => {
  assert.equal(gatherFacts({ sections: {} }), null);
  assert.match(lastGatherBlock(null, ['hn', 'bluesky']), /first scan.*hn, bluesky/);
});
