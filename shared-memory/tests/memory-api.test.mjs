// The dashboard's memory calls: the path of a verb on the engine's own
// origin, and how memory's `{ok, data}` envelope is read. No browser, no
// engine: `fetch` is a stub that records what the page would have sent.
//
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  memoryPath,
  readEnvelope,
  fetchMemoryCount,
  fetchMemoryDays,
  fetchMemoryIssues,
  fetchMemoryStats,
} from '../scripts/memory-api.js';

function stubFetch(answer) {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url, init });
    if (answer instanceof Error) throw answer;
    return { ok: true, json: async () => answer };
  };
  return sent;
}

test('a verb lives under /mem/api/memory on the page\'s own origin', () => {
  assert.equal(memoryPath('count'), '/mem/api/memory/count');
  assert.equal(memoryPath('days'), '/mem/api/memory/days');
});

test('a success envelope gives its data; anything else gives null', () => {
  assert.deepEqual(readEnvelope({ ok: true, data: { count: 3 } }), { count: 3 });
  assert.equal(readEnvelope({ ok: false, error: 'x', code: 'BAD_REQUEST' }), null);
  assert.equal(readEnvelope({ ok: true }), null);
  assert.equal(readEnvelope(null), null);
});

test('count posts its filter as JSON and returns the data', async () => {
  const sent = stubFetch({ ok: true, data: { count: 7, latest_created_at: '2026-11-01T00:00:00Z' } });
  const out = await fetchMemoryCount({ tier: 'core' });
  assert.deepEqual(out, { count: 7, latest_created_at: '2026-11-01T00:00:00Z' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, '/mem/api/memory/count');
  assert.equal(sent[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(sent[0].init.body), { tier: 'core' });
});

test('count falls back to zero when memory cannot be reached', async () => {
  stubFetch(new Error('offline'));
  assert.deepEqual(await fetchMemoryCount({}), { count: 0, latest_created_at: null });
});

test('days, issues and stats go to their own verbs; a failed answer is null', async () => {
  let sent = stubFetch({ ok: true, data: { days: [] } });
  assert.deepEqual(await fetchMemoryDays(), { days: [] });
  assert.equal(sent[0].url, '/mem/api/memory/days');

  sent = stubFetch({ ok: true, data: { open_count: 0, issues: [] } });
  await fetchMemoryIssues('open');
  assert.equal(sent[0].url, '/mem/api/memory/issues');
  assert.deepEqual(JSON.parse(sent[0].init.body), { status: 'open', limit: 1000 });

  sent = stubFetch({ ok: false, error: 'nope', code: 'INTERNAL' });
  assert.equal(await fetchMemoryStats(), null);
  assert.equal(sent[0].url, '/mem/api/memory/stats');
});
