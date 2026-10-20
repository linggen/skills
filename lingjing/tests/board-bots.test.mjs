// Layer 3's node half (tools/board-bots.mjs): every board module 卷一's story plays has a
// human-like bot (scripts/games/bots/<id>.js — ~200 ms reaction ± 40 ms, aiming ahead as a
// person learns a rhythm), and the bot wins within three tries. A module it cannot win fails
// by name (Hanli, 2026-10-15: 黑地十一步 could not be won by hand). The page half, on the live
// page with real pointer events, is `node tools/page-crawl.mjs --boards`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { juanOneModules, loadPair, playModule, playOnce } from '../tools/board-bots.mjs';

const modules = await juanOneModules();

test('every module 卷一\'s boards are played on has a bot', async () => {
  const missing = [];
  // A game a model plays the other half of (画猜: 银月 names the picture — `meta.ai`) has no bot to win it;
  // its page-side rules are tests/drawguess*.test.mjs's. A Phaser game (砸寨) is played by a bot of its own in headless
  // Chromium (`meta.bot`, its test plays every story level: tests/game-zhazhai.test.mjs).
  const own = (p) => p.mod?.meta?.bot && fs.existsSync(new URL(`../${p.mod.meta.bot}`, import.meta.url));
  for (const id of modules.keys()) { const p = await loadPair(id); if (!p.bot && !p.mod?.meta?.ai && !own(p)) missing.push(`${id} (${modules.get(id).join(', ')})`); }
  assert.deepEqual(missing, []);
});

for (const id of [...modules.keys()].sort()) {
  test(`${id}: a human-like bot wins it within three tries`, async () => {
    const { mod, bot, deal } = await loadPair(id);
    if (!bot) return;
    const r = playModule(mod, bot, { tries: 3, deal });
    assert.ok(r.won, `${id} (${modules.get(id).join(', ')}) was not won in 3 tries: ${JSON.stringify(r.runs)}`);
  });
}

// (「the human model is slow」 played 黑地十一步's walk; that board was deleted 2026-10-19 — the harness's reaction delay is
// still what every hand-like run in the qimai, fallrope and rain tests goes through.)
