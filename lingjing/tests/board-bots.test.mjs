// Layer 3's node half (tools/board-bots.mjs): every board module 卷一's story plays has a
// human-like bot (scripts/games/bots/<id>.js — ~200 ms reaction ± 40 ms, aiming ahead as a
// person learns a rhythm), and the bot wins within three tries. A module it cannot win fails
// by name (Hanli, 2026-10-15: 黑地十一步 could not be won by hand). The page half, on the live
// page with real pointer events, is `node tools/page-crawl.mjs --boards`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { juanOneModules, loadPair, playModule, playOnce } from '../tools/board-bots.mjs';

const modules = await juanOneModules();

test('every module 卷一\'s boards are played on has a bot', async () => {
  const missing = [];
  // A game a model plays the other half of (画猜: 银月 names the picture — `meta.ai`) has no bot to win it;
  // its page-side rules are tests/drawguess*.test.mjs's.
  for (const id of modules.keys()) { const p = await loadPair(id); if (!p.bot && !p.mod?.meta?.ai) missing.push(`${id} (${modules.get(id).join(', ')})`); }
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

test('the human model is slow: a bot that only reacts to the mark in the middle misses a swing a person must aim at', async () => {
  // 黑地十一步's walk, played by a bot that presses only once it SEES the mark in the band:
  // the hand lands ~200 ms late — the reaction is in the harness, not left to the bot.
  const { mod } = await loadPair('dark');
  const naive = (s) => (s.phase === 'ready' ? { g: 'start' } : s.phase === 'walk' && Math.abs(Math.sin((2 * Math.PI * s.st) / s.swing[Math.min(s.step, 10)])) < 0.12 ? { g: 'step' } : null);
  const r = playOnce(mod, naive, { seed: 'bot-1', limit: 60000 });
  assert.ok(r.won === false && r.acts > 0);
});
