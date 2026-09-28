import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thinker, stillAsked } from '../scripts/think.js';
import * as xiangqi from '../scripts/games/xiangqi.js';

const mod = { meta: { id: 'fake' }, think: (s) => [s.n, s.n + 1] };
const quiet = (fn) => async () => {
  const warn = console.warn; console.warn = () => {};
  try { await fn(); } finally { console.warn = warn; }
};

// A Worker stand-in: records posts; the test answers (or kills) it by hand.
function fakeWorker() {
  const w = { posts: [], terminated: false, postMessage(m) { w.posts.push(m); }, terminate() { w.terminated = true; } };
  w.reply = (data) => w.onmessage({ data });
  return w;
}

test('thinker: asks the Worker by ticket and answers each ask with its own reply', async () => {
  const w = fakeWorker();
  let spawned = 0;
  const think = thinker(() => { spawned++; return w; });
  const a = think(mod, { n: 1 }), b = think(mod, { n: 5 });
  assert.equal(spawned, 1, 'one Worker for every ask');
  assert.deepEqual(w.posts.map((p) => [p.ticket, p.game, p.state.n]), [[1, 'fake', 1], [2, 'fake', 5]]);
  w.reply({ ticket: 2, move: [9, 9] });
  w.reply({ ticket: 1, move: [7, 7] });
  w.reply({ ticket: 1, move: [0, 0] }); // a second answer to a ticket is ignored
  w.reply({ ticket: 99, move: [0, 0] }); // an unknown ticket is ignored
  assert.deepEqual(await a, [7, 7]);
  assert.deepEqual(await b, [9, 9]);
});

test('thinker: no Worker (constructor throws) → thought inline', quiet(async () => {
  let tries = 0;
  const think = thinker(() => { tries++; throw new Error('no workers here'); });
  assert.deepEqual(await think(mod, { n: 3 }), [3, 4]);
  assert.deepEqual(await think(mod, { n: 4 }), [4, 5]);
  assert.equal(tries, 1, 'not tried again');
}));

test('thinker: a Worker that dies hands its held asks to the page, and later ones too', quiet(async () => {
  const w = fakeWorker();
  let tries = 0;
  const think = thinker(() => { tries++; return w; });
  const held = think(mod, { n: 2 });
  let prevented = false;
  w.onerror({ message: 'module failed', preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.ok(w.terminated);
  assert.deepEqual(await held, [2, 3]);
  assert.deepEqual(await think(mod, { n: 8 }), [8, 9]);
  assert.equal(tries, 1);
  assert.equal(w.posts.length, 1);
}));

test('thinker: an error answer is thought inline; an inline throw rejects', quiet(async () => {
  const w = fakeWorker();
  const think = thinker(() => w);
  const p = think(mod, { n: 6 });
  w.reply({ ticket: 1, error: 'boom' });
  assert.deepEqual(await p, [6, 7]);
  const bad = { meta: { id: 'bad' }, think: () => { throw new Error('nope'); } };
  const q = think(bad, {});
  w.reply({ ticket: 2, error: 'boom' });
  await assert.rejects(q, /nope/);
}));

test('stillAsked: a reply lands only on the same board, unmoved', () => {
  const asked = { wait: true };
  const g = { taskId: 't1', state: asked };
  const boards = new Map([['t1', g]]);
  assert.equal(stillAsked(boards, g, asked), true);
  g.state = { wait: false }; // reset (again) or moved meanwhile
  assert.equal(stillAsked(boards, g, asked), false);
  g.state = asked;
  boards.set('t1', { taskId: 't1', state: asked }); // re-dealt
  assert.equal(stillAsked(boards, g, asked), false);
  boards.clear(); // closed (another world)
  assert.equal(stillAsked(boards, g, asked), false);
});

test('think-worker: loads the game module by id and answers by ticket', async () => {
  const posts = [];
  globalThis.self = { postMessage: (m) => posts.push(m) };
  try {
    await import('../scripts/think-worker.js');
    const pz = xiangqi.PUZZLES[2].find((p) => p.id === 'chuanxin');
    let s = { ...xiangqi.newGame('w', 2), board: xiangqi.parsePos(pz.pos) };
    const [f, t] = xiangqi.legalMoves(s.board, 'r')[0];
    s = xiangqi.act(xiangqi.act(s, { g: 'pick', at: `${f % 9},${Math.floor(f / 9)}` }).state,
      { g: 'go', at: `${t % 9},${Math.floor(t / 9)}` }).state;
    assert.equal(s.wait, true);
    await self.onmessage({ data: { ticket: 4, game: 'xiangqi', state: s } });
    await self.onmessage({ data: { ticket: 5, game: '../x', state: s } });
    await self.onmessage({ data: { ticket: 6, game: 'nosuchgame', state: s } });
    assert.equal(posts[0].ticket, 4);
    assert.deepEqual(posts[0].move, xiangqi.think(s));
    assert.equal(posts[1].ticket, 5);
    assert.match(posts[1].error, /bad game id/);
    assert.equal(posts[2].ticket, 6);
    assert.ok(posts[2].error);
  } finally {
    delete globalThis.self;
  }
});
