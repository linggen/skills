// 跳过 · 酬减半 — a board an errand needs may be skipped once stuck (Hanli 2026-10-27, stuck on 晒经's 华容道: 「华容道yinyue
// 提示也不太好用, 就是有点难, 让用户能跳过去, 就好了」). It counts for the errand — met and handed in, the errand's pay whole —
// and the board's own pay is cut (balance.json `play_pay.skip`); kept as skipped, not won. The story's own board keeps
// 「算了，往下走」 (skips.test.mjs); the ✕ on an errand's board stays 收手 (board-leave.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { look, move, task, win } from '../scripts/rules.mjs';
import { playGrant } from '../scripts/rules/playpay.mjs';
import { WORDS, cardHtml, skipButton, skipCutWord } from '../scripts/cards.js';

const content = loadContent();
const NOW = new Date('2026-10-27T09:00:00-03:00');
const ctx = { now: NOW };
const Q = 'guan-cangjing-shai';
const CUT = content.balance.play_pay.skip;

/* 晒经 held, standing at 藏经阁 (or `place`), 练气一层 with 体力 to spare. */
function shai(place = 'cangjing', { held = true } = {}) {
  let s = playTo(content, newState(content, 'zh', NOW), 'wm-chaifang', { now: NOW, policy: 'skip' }).state;
  s = { ...s, tier: 'qi', step: 1, progress: 100, stamina: 100, stamina_at: NOW.toISOString() };
  if (held) s.quests = { ...s.quests, [Q]: { took: '2026-10-27', have: {} } };
  const m = move(s, content, ctx, { place });
  assert.equal(m.result.ok, true, JSON.stringify(m.result));
  return { ...m.state, stamina: 100, stamina_at: NOW.toISOString() };
}
const skip = (s) => task(s, content, ctx, { action: 'skip', id: 'huarong' });

test('the world declares the cut: half', () => assert.equal(CUT, 0.5));

test('Look marks the errand\'s board skippable at its place, with the cut; not elsewhere, not with no errand', () => {
  const row = (s) => look(s, content, ctx).tasks.find((t) => t.id === 'huarong');
  assert.deepEqual(row(shai()).skip, { cut: 0.5 });
  assert.equal(row(shai()).leave, true, 'the ✕ stays 收手');
  assert.equal(row(shai('cangjing', { held: false }))?.skip, undefined, 'practice: no skip');
  assert.equal(row(shai('chaifang'))?.skip, undefined, 'the errand names 藏经阁 (`at`)');
});

test('skipped at 藏经阁: 晒经 is met and handed in, the errand paid whole, the board\'s own pay halved', () => {
  const s = shai();
  const full = playGrant(content, s, 'huarong', content.tasks.tasks.find((t) => t.id === 'huarong'), NOW, null);
  const r = skip(s);
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.equal(r.result.skipped, 'huarong');
  assert.equal(r.result.for, 'errand');
  assert.deepEqual({ progress: r.result.paid.progress, wealth: r.result.paid.wealth }, { progress: Math.round(full.progress * CUT), wealth: Math.round(full.wealth * CUT) });
  assert.ok(r.state.quests[Q].done_at, 'handed in');
  assert.deepEqual(r.state.quests[Q].skipped, [0], 'kept as skipped, not won');
  assert.equal(r.result.handed?.[0]?.id, Q);
  // The same errand won: the errand pays the same; only the board's share differs.
  const w = win(s, content, ctx, { id: 'huarong', stars: 3 });
  const d = task(w.state, content, ctx, { action: 'done', id: 'huarong' });
  assert.equal(d.result.ok, true, JSON.stringify(d.result));
  assert.deepEqual(r.result.handed[0].paid, d.result.handed[0].paid, 'the errand\'s pay is whole');
  assert.equal(d.result.paid.progress, full.progress);
  assert.equal(r.state.progress - s.progress, d.state.progress - s.progress - (full.progress - Math.round(full.progress * CUT)));
  assert.equal(d.state.quests[Q].skipped, undefined, 'a win is no skip');
});

test('the skip writes nothing to the task and keeps no replay; 体力 as a win; a second skip is refused', () => {
  const s = shai();
  const r = skip(s);
  assert.equal(r.state.tasks.huarong, s.tasks.huarong, 'the practice board is as it was');
  assert.deepEqual(r.state.skipped ?? [], s.skipped ?? [], 'never offered again as a story board');
  assert.ok(r.state.stamina < 100, 'a hosted board\'s 体力, as a win');
  assert.equal(r.state.plays.ids.huarong, 1, 'a play counted');
  assert.equal(skip(r.state).result.ok, false, 'the errand met: nothing to skip for');
});

test('refused away from the errand\'s place, and with no errand', () => {
  assert.equal(skip(shai('chaifang')).result.ok, false);
  assert.equal(skip(shai('cangjing', { held: false })).result.ok, false);
});

test('the bar: once stuck, 「跳过 · 酬减半」 beside the ✕ 收手; before, the slot stands empty', async () => {
  const mod = await import('../scripts/games/huarong.js');
  const state = mod.newGame('t', 1, {});
  const page = (g) => ({ lang: 'zh', words: WORDS.zh, content: {}, reading: null, boardFor: () => g,
    look: { tasks: [{ id: 'huarong', kind: 'board', game: 'huarong', title: '华容道 · 晒经', leave: true, skip: { cut: 0.5 } }], scene: { show: [] } } });
  const bar = (html) => html.slice(html.indexOf('<div class="gshell-tools">'), html.indexOf('</header>'));
  const fresh = bar(cardHtml({ card: 'board', id: 'huarong' }, page({ mod, state })));
  assert.match(fresh, /<span data-skip-slot="huarong" data-skip-icon data-skip-cut="0.5"><\/span><button[^>]*data-board-leave="huarong">✕<\/button><\/div>/);
  const stuck = bar(cardHtml({ card: 'board', id: 'huarong' }, page({ mod, state, shownAt: 0 })));
  assert.match(stuck, /data-skip-cut="0.5"><button type="button" class="gshell-btn gshell-skip" data-game-skip="huarong">跳过 · 酬减半<\/button><\/span><button[^>]*title="收手"[^>]*data-board-leave="huarong">✕<\/button>/);
  assert.equal(skipButton('x', 'en', true, '0.5').includes('Skip · half pay'), true, 'the page refills it from the slot\'s cut');
  assert.equal(skipCutWord(0.3, 'zh'), '跳过 · 酬3成');
});

test('the page: an errand skip says no word of hers and pays as 所得', () => {
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const on = page.slice(page.indexOf('async function onSkip(g)'), page.indexOf('async function errandSkipped('));
  assert.ok(on.indexOf("r.for === 'errand'") < on.indexOf("herSay.say('skipped'"));
  assert.match(page, /if \(cut == null\) herSay\.say\('stuck'/);
});
