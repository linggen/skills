// An errand's board, its ways out (Hanli's rule of 2026-11-03: every board has only ✕ and 留 at its top right, the
// per-board 跳过 and the stuck-only 「算了，往下走」 removed, and 「跳过没有奖励」 — a skip never pays stars or a grant).
// 2026-11-04, Hanli at 执事堂's 象棋残局 (wall-20261104-zhishi-canju): 「点留没有用」 · 「点关闭, 结果给奖励了」.
// - ✕ (`skip` or `leave`, and a board's own 跳过 sent as a win) puts an errand's board down: nothing paid, no 体力, the
//   errand still open. The 10-27 跳过 · 酬减半 (errandSkip, `play_pay.skip`) is gone, and its button with it.
// - 留 keeps it on 收着 and the stage never deals it again by itself (it came straight back: 「点留没有用」).
// - A loss on it costs its 体力 (`task lost`) as any lost board does; an older save's `board_losses` still loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { look, move, task, win } from '../scripts/rules.mjs';
import { WORDS, cardHtml } from '../scripts/cards.js';

const content = loadContent();
const NOW = new Date('2026-10-27T09:00:00-03:00');
const ctx = { now: NOW };
const Q = 'guan-cangjing-shai';

/* 晒经 held, standing at 藏经阁 (or `place`), 练气一层 with 体力 to spare. */
function shai(place = 'cangjing', { held = true } = {}) {
  let s = playTo(content, newState(content, 'zh', NOW), 'wm-chaifang', { now: NOW, policy: 'skip' }).state;
  s = { ...s, tier: 'qi', step: 1, progress: 100, stamina: 100, stamina_at: NOW.toISOString() };
  if (held) s.quests = { ...s.quests, [Q]: { took: '2026-10-27', have: {} } };
  const m = move(s, content, ctx, { place });
  assert.equal(m.result.ok, true, JSON.stringify(m.result));
  return { ...m.state, stamina: 100, stamina_at: NOW.toISOString() };
}
const act = (s, action) => task(s, content, ctx, { action, id: 'huarong' });
const lost = (s) => { const r = act(s, 'lost'); assert.equal(r.result.ok, true, JSON.stringify(r.result)); return r.state; };
const unpaid = (s, r) => {
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.equal(r.result.paid ?? null, null);
  assert.equal(r.result.for, undefined, 'never counted for the errand');
  const after = r.state ?? s;
  assert.equal(after.progress, s.progress);
  assert.equal(after.wealth, s.wealth);
  assert.equal(after.stamina, s.stamina);
  assert.equal(after.quests[Q].done_at, undefined, 'the errand stays open');
  assert.equal(after.quests[Q].skipped, undefined);
};

test('the paid skip is gone: the world declares no cut, Look offers no `skip`, before or after a loss', () => {
  assert.equal(content.balance.play_pay.skip, undefined);
  const row = (s) => look(s, content, ctx).tasks.find((t) => t.id === 'huarong');
  assert.equal(row(shai()).skip, undefined);
  assert.equal(row(lost(shai())).skip, undefined);
  assert.equal(row(shai()).leave, true, 'the ✕ is 收手');
});

test('✕ on an errand\'s board — `skip`, `leave`, a board\'s own 跳过 — puts it down: nothing paid, no 体力, the errand open', () => {
  for (const s of [shai(), lost(shai())]) {
    unpaid(s, act(s, 'skip'));
    unpaid(s, act(s, 'leave'));
    unpaid(s, win(s, content, ctx, { id: 'huarong', grade: 'skipped' }));
  }
});

test('a won errand\'s board still pays and meets the errand (only skips are unpaid)', () => {
  const w = win(shai(), content, ctx, { id: 'huarong', stars: 3 });
  const d = task(w.state, content, ctx, { action: 'done', id: 'huarong' });
  assert.equal(d.result.ok, true, JSON.stringify(d.result));
  assert.ok(d.result.paid.progress > 0);
  assert.ok(d.state.quests[Q].done_at, 'handed in');
});

test('a loss costs the board\'s 体力 and is counted nowhere else; an older save\'s `board_losses` loads and changes nothing', () => {
  const s = shai();
  const l = act(s, 'lost');
  assert.ok(l.result.stamina > 0, JSON.stringify(l.result));
  assert.equal(l.state.board_losses, undefined, 'no stuck count is kept');
  const old = { ...s, board_losses: { huarong: { quest: Q, n: 2 } } };
  assert.equal(look(old, content, ctx).ok ?? true, true);
  unpaid(old, act(old, 'skip'));
});

test('留 on an errand\'s board (「点留没有用」): off the stage, on 收着; 玩 stands it again; won, it leaves 收着', () => {
  const s = shai();
  const onStage = (st) => (look(st, content, ctx).stage ?? []).some((c) => c.card === 'board' && c.id === 'huarong');
  assert.equal(onStage(s), true, 'the errand\'s board stands');
  const k = act(s, 'keep');
  assert.equal(k.result.ok, true, JSON.stringify(k.result));
  assert.equal(k.result.kept, 'huarong');
  assert.equal(k.result.skipped, undefined, 'not the story\'s: put down, so the page closes the card');
  assert.equal(onStage(k.state), false, 'kept: never dealt again on the stage by itself');
  assert.equal(look(k.state, content, ctx).tasks.find((t) => t.id === 'huarong').kept, true);
  assert.equal(k.state.progress, s.progress);
  assert.equal(k.state.quests[Q].done_at, undefined, 'the errand stays open');
  const p = act(k.state, 'kept-play');
  assert.equal(p.result.ok, true, JSON.stringify(p.result));
  assert.equal(onStage(p.state), true, 'taken up: it stands');
  // Kept, then won from the tray's 开局 for its errand: off 收着.
  const w = win(k.state, content, ctx, { id: 'huarong', stars: 3 });
  const d = task(w.state, content, ctx, { action: 'done', id: 'huarong' });
  assert.equal(d.result.ok, true, JSON.stringify(d.result));
  assert.equal((d.state.kept ?? []).some((e) => e.task === 'huarong'), false);
});

test('留 again on a kept board taken up from the tray: put down again, nothing doubled (not a refusal that leaves it standing)', () => {
  const k = act(shai(), 'keep');
  const again = act(k.state, 'keep');
  assert.equal(again.result.ok, true, JSON.stringify(again.result));
  assert.equal(again.result.kept, 'huarong');
  assert.equal(again.result.skipped, undefined);
  assert.equal(again.state, null, 'nothing written');
  assert.equal(k.state.kept.filter((e) => e.task === 'huarong').length, 1);
});

test('the bar: only 留 and ✕, ✕ always 不玩了 — no 跳过 words button, in either tongue', async () => {
  const mod = await import('../scripts/games/huarong.js');
  const state = mod.newGame('t', 1, {});
  for (const lang of ['zh', 'en']) {
    const page = { lang, words: WORDS[lang], content: {}, reading: null, boardFor: () => ({ mod, state }),
      look: { tasks: [{ id: 'huarong', kind: 'board', game: 'huarong', title: '华容道 · 晒经', leave: true, skip: { cut: 0.5 } }], scene: { show: [] } } };
    const html = cardHtml({ card: 'board', id: 'huarong' }, page);
    const bar = html.slice(html.indexOf('<div class="gshell-tools">'), html.indexOf('</header>'));
    assert.equal((bar.match(/✕/g) ?? []).length, 1, 'one ✕');
    assert.match(bar, /data-board-keep="huarong"/);
    assert.doesNotMatch(html, /skiphalf|跳过 · 酬|Skip · half/, 'no paid skip, even from an older Look');
  }
});

test('the page: ✕ on a board he may put down is 收手; nothing on the page pays a skip', () => {
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const close = page.slice(page.indexOf('function closeBoard('), page.indexOf('function keepGame('));
  assert.match(close, /return leaveGame\(id\)/);
  assert.doesNotMatch(page, /skipHalf|errandSkipped|data-board-skiphalf/);
  // A pure board's own loss (象棋残局 「未能将死」) reaches the rules: it costs its 体力.
  assert.match(page.slice(page.indexOf('function gameAct('), page.indexOf('async function herNewLine(')), /turnedLost\(was, g\.state\)\) boardLostNow\(g\)/);
});
