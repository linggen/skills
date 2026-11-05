// A board put away — 留, ✕, a win, a loss, walking away — stops fully (Hanli 11-05: 「Mac上游戏进行中, 点留, 页面切回来了, 但小游戏
// 似乎仍在后台跑, 能听见声音」): its loop, its timers, its rAF, its sound. The beat host takes down a board off the stage that is no
// longer the one in play; the page's 留 and ✕ take it down at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { beatHost } from '../scripts/beat-host.js';

function fakeDoc() {
  const hosts = [];
  const el = () => ({ firstChild: null, replaceChildren(n) { this.firstChild = n; } });
  return { hosts, createElement: () => el(), addHost(id) { const h = { ...el(), dataset: { mount: id } }; hosts.push(h); return h; }, querySelectorAll: () => hosts };
}
/* A game as the kits are: a ticker, a rAF loop and a sound bed while it plays, all let go on its signal. */
function liveGame(world) {
  return {
    meta: { id: 'td' },
    mount: (node, o) => new Promise((resolve) => {
      world.tickers += 1; world.raf += 1; world.sounding += 1;
      o.signal.addEventListener('abort', () => { world.tickers -= 1; world.raf -= 1; world.sounding -= 1; resolve({ left: true }); });
    }),
  };
}

for (const how of ['keep', 'close']) {
  test(`${how === 'keep' ? '留' : '✕'} on a board in play: off the stage it is taken down — no ticker, no rAF, no sound left`, () => {
    const world = { tickers: 0, raf: 0, sounding: 0 }, doc = fakeDoc();
    const g = { taskId: 'td-1', day: 'd', mod: liveGame(world), state: { won: false } };
    const host = beatHost({ boardFor: () => g, lang: () => 'zh', onSettled: () => {}, doc });
    doc.addHost('td-1');
    host.attach();
    assert.deepEqual(world, { tickers: 1, raf: 1, sounding: 1 }, 'playing');
    // The page puts it away (keepGame / skipGame set skipped and redraw): its card no longer hosts it.
    g.skipped = true;
    doc.hosts.length = 0;
    host.attach();
    assert.deepEqual(world, { tickers: 0, raf: 0, sounding: 0 }, 'taken down — before this, 留 left it running unseen, heard');
    assert.deepEqual(host.live(), []);
  });
}

test('a board in play that a redraw merely moved is never taken down', () => {
  const world = { tickers: 0, raf: 0, sounding: 0 }, doc = fakeDoc();
  const g = { taskId: 'td-2', day: 'd', mod: liveGame(world), state: { won: false } };
  const host = beatHost({ boardFor: () => g, lang: () => 'zh', onSettled: () => {}, doc });
  doc.addHost('td-2');
  host.attach();
  doc.hosts.length = 0; // a frame with no host (a popover over it): still his game
  host.attach();
  assert.equal(world.tickers, 1, 'still playing');
  doc.addHost('td-2');
  host.attach();
  assert.equal(world.tickers, 1, 'laid back, not dealt anew');
});

test('the page: 留 and ✕ take the play down at once (beats.leave), as 收手 does', () => {
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const keep = page.slice(page.indexOf('function keepGame(id)'), page.indexOf('async function onSkip('));
  assert.match(keep, /g\.skipped = true;\s*g\.state = \{ \.\.\.g\.state, live: false \};[^]*?beats\.leave\(id\);/);
  const skip = page.slice(page.indexOf('function skipGame(id)'), page.indexOf('function boardSkipped('));
  assert.match(skip, /beats\.leave\(id\);/);
  const leave = page.slice(page.indexOf('function leaveGame(id)'), page.indexOf('function skipGame(id)'));
  assert.match(leave, /beats\.leave\(id\);/, '✕ on a board he may put down (收手)');
  // The phone's board webview: the app's leave aborts the mount (games/phone/host.js), the same signal.
  const phone = fs.readFileSync(new URL('../scripts/games/phone/host.js', import.meta.url), 'utf8');
  assert.match(phone, /leave: \(\) => abort\?\.abort\(\)/);
});

test('a board lost off the stage stops at the loss: one `lost` report, never dealt again unseen (his log 11-05: twelve, one every ~50 s)', async () => {
  const doc = fakeDoc();
  let deals = 0;
  const losing = { meta: { id: 'td' }, mount: () => { deals += 1; return new Promise((r) => setTimeout(() => r({ won: false }), 5)); } };
  const g = { taskId: 'nianyao-1', day: 'd', mod: losing, state: { won: false } };
  const lost = [];
  const host = beatHost({ boardFor: () => g, lang: () => 'zh', onSettled: () => {}, onLost: (b) => lost.push(b.taskId), doc, againMs: 10 });
  doc.addHost('nianyao-1');
  host.attach();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(lost.length >= 1, true);
  const dealt = deals;
  doc.hosts.length = 0; // he walked off the stage with it running (or a popover took the card away)
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(deals <= dealt + 1, `not dealt again and again unseen (${deals - dealt} more)`);
  const reports = lost.length;
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(lost.length, reports, 'no more `lost` once it stopped');
  assert.deepEqual(host.live(), []);
});

