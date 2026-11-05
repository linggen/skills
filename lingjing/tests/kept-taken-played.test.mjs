// A kept board taken up, once played, is over (Hanli 2026-11-05, on the Mac: 「下面panel点开开局, 象棋残局玩完后, 下面的开局卡
// 还在啊」 — his log: `win xiangqi` · `task done xiangqi` at 20:29:10 and again at 20:29:29, +1 修为 · +1 灵石 each). The 残局
// taken up from 收着 at 执事堂 (rules/skips.mjs playKept) was marked `taken` there; the hosted board's done path paid and
// never cleared the mark, so it stood offered all evening — on every place's tray as the story's own board, won again and
// again for the day's 一成. Now: played — won, lost, ✕ or 留 — the mark goes (rules/locks.mjs `played`); it is played only
// where it was kept; and a board played today says what its next play pays before he plays it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { look, move, VERBS } from '../scripts/rules.mjs';
import { plateDealt, plateKey } from '../scripts/rules/rotation.mjs';
import { placeOf } from '../scripts/rules/world.mjs';
import { WORDS, shareChipHtml } from '../scripts/cards.js';

const content = loadContent();
const NOW = new Date('2026-10-27T09:00:00-03:00');
const ctx = { now: NOW };
const PLATE = plateKey(placeOf(content, 'cangjing'));
const go = (s, place) => { const m = move(s, content, ctx, { place }); assert.equal(m.result.ok, true, JSON.stringify(m.result)); return { ...m.state, stamina: 150 }; };
const run = (s, verb, args) => VERBS[verb](s, content, ctx, args);

/* At 执事堂 with 象棋 · 残局 dealt there, then kept (留) and taken up again (收着 → 玩): the board stands `taken`. */
function takenAtZhishi() {
  let s = playTo(content, newState(content, 'zh', NOW), 'wm-chaifang', { now: NOW, policy: 'skip' }).state;
  s = { ...s, tier: 'qi', step: 1, progress: 100, stamina: 150, stamina_at: NOW.toISOString() };
  for (let k = 0; k < 40; k += 1) {
    const d = plateDealt(content, s, PLATE, NOW);
    if (d.game === 'xiangqi' && d.at === 'zhishi') break;
    s = go(s, d.at);
    s = run(s, 'task', { action: 'leave', id: d.game }).state ?? s;
  }
  s = go(s, 'zhishi');
  const kept = run(s, 'task', { action: 'keep', id: 'xiangqi' });
  assert.equal(kept.result.ok, true, JSON.stringify(kept.result));
  const up = run(kept.state, 'task', { action: 'kept-play', id: 'xiangqi' });
  assert.equal(up.result.ok, true, JSON.stringify(up.result));
  assert.equal(up.state.tasks.xiangqi?.taken, 'zhishi', 'taken up where it was kept');
  return up.state;
}
const listed = (s) => { const l = look(s, content, ctx); return { tasks: (l.tasks ?? []).some((t) => t.id === 'xiangqi'), agenda: (l.agenda ?? []).some((i) => i.id === 'xiangqi') }; };

test('taken up, won and counted: the mark goes, the card goes, a second done is refused', () => {
  const s = takenAtZhishi();
  assert.deepEqual(listed(s), { tasks: true, agenda: true }, 'it stands at 执事堂, a tap away');
  const w = run(s, 'win', { id: 'xiangqi', stars: 3 });
  assert.equal(w.result.ok, true, JSON.stringify(w.result));
  const d = run(w.state, 'task', { action: 'done', id: 'xiangqi' });
  assert.equal(d.result.ok, true, JSON.stringify(d.result));
  assert.equal(d.state.tasks.xiangqi, undefined, 'played: the mark is gone');
  assert.deepEqual(listed(d.state), { tasks: false, agenda: false }, 'off the tray and the list at once');
  const again = run(run(d.state, 'win', { id: 'xiangqi', stars: 3 }).state ?? d.state, 'task', { action: 'done', id: 'xiangqi' });
  assert.equal(again.result.ok, false, 'never counted twice');
});

test('lost, ✕ or 留 on a board taken up: over all the same (留 puts it back on 收着)', () => {
  for (const action of ['lost', 'leave', 'keep']) {
    const r = run(takenAtZhishi(), 'task', { action, id: 'xiangqi' });
    assert.equal(r.result.ok, true, `${action}: ${JSON.stringify(r.result)}`);
    assert.ok(r.state, `${action}: written`);
    assert.equal(r.state.tasks?.xiangqi?.taken, undefined, `${action}: the mark is gone`);
    assert.equal(listed(r.state).agenda, false, `${action}: off the tray`);
    if (action === 'keep') assert.ok(r.state.kept.some((e) => e.task === 'xiangqi'), '留: on 收着 again');
  }
});

test('taken up at 执事堂, it is played there only: never another place\'s story card, never won there', () => {
  const s = go(takenAtZhishi(), 'cangjing');
  assert.deepEqual(listed(s), { tasks: false, agenda: false });
  assert.equal(run(s, 'win', { id: 'xiangqi', stars: 3 }).result.ok, false);
});

test('a board played today says what its next play pays — 「今日已玩 · 只给一成」 — before he plays it', () => {
  const s0 = takenAtZhishi();
  const s = { ...s0, plays: { day: '2026-10-27', ids: { xiangqi: 2 } } };
  const t = look(s, content, ctx).tasks.find((x) => x.id === 'xiangqi');
  assert.equal(t.share, 0.1);
  assert.equal(look(s0, content, ctx).tasks.find((x) => x.id === 'xiangqi').share, undefined, 'unplayed today: the full');
  assert.match(shareChipHtml(0.1, { lang: 'zh', words: WORDS.zh }), /今日已玩 · 只给一成/);
  assert.match(shareChipHtml(0.5, { lang: 'zh', words: WORDS.zh }), /只给五成/);
  assert.match(shareChipHtml(0.5, { lang: 'en', words: WORDS.en }), /Played today · pays 50%/);
  assert.equal(shareChipHtml(1, { lang: 'zh', words: WORDS.zh }), '');
});
