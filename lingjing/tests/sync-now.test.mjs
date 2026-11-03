// 同步 by hand (Hanli 11-03: 「给用户一个同步的按钮, 可以手动同步」): the edges' own sync, from settings — never under an
// open board, never a 测试存档; a free account is told it stays on this Mac; every outcome one line, zh and en.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SYNC_WORDS, answerPage, askPage, syncLine, syncNow } from '../scripts/sync-now.js';

/** BroadcastChannel in one process: every channel of a name hears the others. */
function fakeChannel() {
  const all = new Set();
  return class {
    constructor(name) { this.name = name; all.add(this); }
    postMessage(data) { for (const c of all) if (c !== this && c.name === this.name) queueMicrotask(() => c.onmessage?.({ data })); }
    close() { all.delete(this); }
  };
}

test('each outcome in one line, in both languages', () => {
  assert.equal(syncLine({ done: { action: 'pull' } }), '已同步 · 从云端拉取');
  assert.equal(syncLine({ done: { action: 'push', version: 3 } }), '已同步 · 推到云端');
  assert.equal(syncLine({ done: { action: 'nothing' } }), '云端已是最新');
  assert.equal(syncLine({ done: { action: 'local' } }), '仅本机 · 订阅后可存云端');
  assert.equal(syncLine(null), '连不上云端');
  assert.equal(syncLine({ done: { action: 'pull' }, conflicts: ['a'] }), '已同步 · 从云端拉取 · 另一份已另存');
  assert.equal(syncLine(null, { why: 'scratch', en: true }), 'A test save never syncs');
  for (const k of Object.keys(SYNC_WORDS.zh)) assert.ok(SYNC_WORDS.en[k], k);
});

test('a 测试存档 never syncs, and an open board holds it; no page open, it runs', async () => {
  const Channel = fakeChannel();
  let calls = 0;
  const sync = async () => { calls++; return { done: { action: 'nothing' } }; };
  const ask = () => askPage({ Channel, waitMs: 50 });
  const page = answerPage(() => ({ open: false, scratch: 'test' }), { Channel });
  assert.equal(await syncNow({ sync, signedIn: async () => true, ask }), '测试存档不同步');
  page.close();
  const playing = answerPage(() => ({ open: true, scratch: null }), { Channel });
  assert.equal(await syncNow({ sync, signedIn: async () => true, ask }), '先合上棋局再同步');
  playing.close();
  assert.equal(calls, 0);
  assert.equal(await syncNow({ sync, signedIn: async () => true, ask }), '云端已是最新');
  assert.equal(calls, 1);
});

test('signed out: it says the save stays here, and asks nothing of the site', async () => {
  let calls = 0;
  const line = await syncNow({ sync: async () => { calls++; return null; }, signedIn: async () => false, ask: async () => ({ open: false, scratch: null }) });
  assert.equal(line, '仅本机 · 登录后可存云端');
  assert.equal(calls, 0);
});
