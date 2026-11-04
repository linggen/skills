// 跳过 · 酬减半 — a board an errand needs may be skipped once stuck (Hanli 2026-10-27, stuck on 晒经's 华容道: 「华容道yinyue
// 提示也不太好用, 就是有点难, 让用户能跳过去, 就好了」). It counts for the errand — met and handed in, the errand's pay whole —
// and the board's own pay is cut (balance.json `play_pay.skip`); kept as skipped, not won. The story's own board keeps
// 「算了，往下走」 (skips.test.mjs); the ✕ on an errand's board stays 收手 (board-leave.test.mjs).
// 2026-11-04 (Hanli at 执事堂's 象棋残局: 「点关闭, 结果给奖励了」): ✕ is never this skip. It is offered only once he is stuck
// — a loss on the board counted (`task lost`) — and as its own words under the board; before that `skip` is put down.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { look, move, task, win } from '../scripts/rules.mjs';
import { playGrant } from '../scripts/rules/playpay.mjs';
import { WORDS, cardHtml, skipCutWord } from '../scripts/cards.js';

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
/* …lost once there: stuck. */
const lost = (s) => { const r = task(s, content, ctx, { action: 'lost', id: 'huarong' }); assert.equal(r.result.ok, true, JSON.stringify(r.result)); return { ...r.state, stamina: 100 }; };
const stuck = (place, o) => lost(shai(place, o));

test('the world declares the cut: half', () => assert.equal(CUT, 0.5));

test('Look marks the errand\'s board skippable at its place, with the cut; not elsewhere, not with no errand', () => {
  const row = (s) => look(s, content, ctx).tasks.find((t) => t.id === 'huarong');
  assert.equal(row(shai()).skip, undefined, 'not before a loss there (2026-11-04)');
  assert.deepEqual(row(stuck()).skip, { cut: 0.5 });
  assert.equal(row(shai()).leave, true, 'the ✕ stays 收手');
  assert.equal(row(shai('cangjing', { held: false }))?.skip, undefined, 'practice: no skip');
  assert.equal(row(shai('chaifang'))?.skip, undefined, 'the errand names 藏经阁 (`at`)');
});

test('skipped at 藏经阁: 晒经 is met and handed in, the errand paid whole, the board\'s own pay halved', () => {
  const s = stuck();
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
  const s = stuck();
  const r = skip(s);
  assert.equal(r.state.tasks.huarong, s.tasks.huarong, 'the practice board is as it was');
  assert.deepEqual(r.state.skipped ?? [], s.skipped ?? [], 'never offered again as a story board');
  assert.ok(r.state.stamina < 100, 'a hosted board\'s 体力, as a win');
  assert.equal(r.state.plays.ids.huarong, 1, 'a play counted');
  assert.equal(skip(r.state).result.paid ?? null, null, 'the errand met: nothing to skip for, nothing paid');
  assert.equal(r.state.board_losses?.huarong, undefined, 'its losses forgotten');
});

test('✕ before he is stuck (2026-11-04): `skip` and `leave` put it down — nothing paid, no 体力, the errand still open', () => {
  const s = shai();
  for (const r of [skip(s), task(s, content, ctx, { action: 'leave', id: 'huarong' })]) {
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    assert.equal(r.result.left, 'huarong');
    assert.equal(r.result.paid ?? null, null);
    const after = r.state ?? s;
    assert.equal(after.progress, s.progress);
    assert.equal(after.wealth, s.wealth);
    assert.equal(after.stamina, s.stamina);
    assert.equal(after.quests[Q].done_at, undefined, 'the errand stays open');
  }
  // …and a board's own 跳过 sent as a win (grade `skipped`) is the same put-down.
  const w = win(s, content, ctx, { id: 'huarong', grade: 'skipped' });
  assert.equal(w.result.paid ?? null, null);
  assert.equal((w.state ?? s).quests[Q].done_at, undefined);
});

test('a loss counts only where the errand asks; a win clears it', () => {
  assert.equal(lost(shai('cangjing', { held: false })).board_losses?.huarong, undefined, 'practice: not counted');
  const s = stuck();
  assert.equal(s.board_losses.huarong, 1);
  const w = win(s, content, ctx, { id: 'huarong', stars: 3 });
  const d = task(w.state, content, ctx, { action: 'done', id: 'huarong' });
  assert.equal(d.result.ok, true, JSON.stringify(d.result));
  assert.equal(d.state.board_losses?.huarong, undefined);
});

test('留 on an errand\'s board (2026-11-04: 「点留没有用」): off the stage, on 收着; 玩 stands it again; met, it leaves 收着', () => {
  const s = shai();
  const onStage = (st) => (look(st, content, ctx).stage ?? []).some((c) => c.card === 'board' && c.id === 'huarong');
  assert.equal(onStage(s), true, 'the errand\'s board stands');
  const k = task(s, content, ctx, { action: 'keep', id: 'huarong' });
  assert.equal(k.result.ok, true, JSON.stringify(k.result));
  assert.equal(k.result.kept, 'huarong');
  assert.equal(k.result.skipped, undefined, 'not the story\'s: put down, so the page closes the card');
  assert.equal(onStage(k.state), false, 'kept: never dealt again on the stage by itself');
  assert.equal(look(k.state, content, ctx).tasks.find((t) => t.id === 'huarong').kept, true);
  assert.equal(k.state.progress, s.progress);
  assert.equal(k.state.quests[Q].done_at, undefined, 'the errand stays open');
  const p = task(k.state, content, ctx, { action: 'kept-play', id: 'huarong' });
  assert.equal(p.result.ok, true, JSON.stringify(p.result));
  assert.equal(onStage(p.state), true, 'taken up: it stands');
  // Kept, then the errand met by the paid skip: off 收着.
  const k2 = task(lost(s), content, ctx, { action: 'keep', id: 'huarong' }).state;
  const sk = skip(k2);
  assert.equal(sk.result.for, 'errand');
  assert.deepEqual((sk.state.kept ?? []).map((e) => e.task), (s.kept ?? []).map((e) => e.task));
});

test('away from the errand\'s place, and with no errand: no paid skip — put down (2026-11-04: was refused)', () => {
  for (const s of [shai('chaifang'), shai('cangjing', { held: false })]) {
    const r = skip(s);
    assert.equal(r.result.for, undefined);
    assert.equal(r.result.paid ?? null, null);
  }
});

test('the bar: 留 and ✕ from the first moment, ✕ always 不玩了; 「跳过 · 酬减半」 its own words under the board once stuck (2026-11-04)', async () => {
  const mod = await import('../scripts/games/huarong.js');
  const state = mod.newGame('t', 1, {});
  const page = (g, skipOn, lang = 'zh') => ({ lang, words: WORDS[lang], content: {}, reading: null, boardFor: () => g,
    look: { tasks: [{ id: 'huarong', kind: 'board', game: 'huarong', title: '华容道 · 晒经', leave: true, ...(skipOn ? { skip: { cut: 0.5 } } : {}) }], scene: { show: [] } } });
  const bar = (html) => html.slice(html.indexOf('<div class="gshell-tools">'), html.indexOf('</header>'));
  for (const on of [false, true]) {
    const html = cardHtml({ card: 'board', id: 'huarong' }, page({ mod, state }, on));
    const fresh = bar(html);
    assert.match(fresh, /<button[^>]*class="gshell-btn gshell-keep"[^>]*data-board-keep="huarong">留<\/button><button[^>]*class="gshell-btn gshell-close" title="不玩了"[^>]*data-board-close="huarong">✕<\/button><\/div>/);
    assert.equal((fresh.match(/✕/g) ?? []).length, 1, 'one ✕');
    assert.doesNotMatch(fresh.match(/<button[^>]*gshell-close[^>]*>/)[0], /跳过/, 'the ✕ never says skip');
    assert.equal(/<div class="gshell-tools"><button type="button" class="gshell-btn gshell-skiphalf" data-board-skiphalf="huarong">跳过 · 酬减半<\/button>/.test(fresh), on,
      on ? 'stuck: its words first in the bar' : 'not stuck: no paid skip');
  }
  assert.match(cardHtml({ card: 'board', id: 'huarong' }, page({ mod, state }, true, 'en')), /data-board-skiphalf="huarong">Skip · half pay<\/button>/);
  assert.equal(skipCutWord(0.5, 'en'), 'Skip · half pay');
  assert.equal(skipCutWord(0.3, 'zh'), '跳过 · 酬3成');
});

test('the page: an errand skip says no word of hers and pays as 所得', () => {
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const on = page.slice(page.indexOf('async function onSkip(g'), page.indexOf('async function errandSkipped('));
  assert.ok(on.indexOf("r.for === 'errand'") < on.indexOf("herSay.say('skipped'"));
});

test('the page: ✕ on a board he may put down is 收手, never the paid skip; the words button is the only way to it', () => {
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const close = page.slice(page.indexOf('function closeBoard('), page.indexOf('function skipHalf('));
  assert.match(close, /return leaveGame\(id\)/);
  assert.doesNotMatch(close, /skipGame/);
  assert.match(page, /\['\[data-board-skiphalf\]', \(el\) => skipHalf\(/);
  // A pure board's own loss (象棋残局 「未能将死」) reaches the rules, so he can be stuck there.
  assert.match(page.slice(page.indexOf('function gameAct('), page.indexOf('async function herNewLine(')), /turnedLost\(was, g\.state\)\) boardLostNow\(g\)/);
});
