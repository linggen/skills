// Every play pays a fixed 修为 (rules/playpay.mjs; Hanli 2026-11-02: 「不要按照百分比给.... 给太多了」 · 「我是说参考百分比的数值.
// 不能直接给百分比」, and the formula 「这套公式基本可以」): R(content level) × its 体力 × difficulty × ★ × the gap × the replay.
// A board costs its own minutes in 体力 (state.mjs boardCost; Hanli 2026-11-04: 「小游戏有一些时间比较长的, 你看一下体力扣的是否对」):
// at 练气一层 R is 2, so a 3-minute 解谜 pays 6 and a 1-minute 打地鼠 2; ★ and the same board again the same day scale it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { boardCost, newState, staminaCost } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { look, move, task, win, VERBS } from '../scripts/rules.mjs';
import { chorePlay, fightPlay, gapOf, levelOf, playGrant, rateAt, secludeHour, xiuweiOf } from '../scripts/rules/playpay.mjs';
import { gamesToday, plateDealt, plateKey } from '../scripts/rules/rotation.mjs';
import { placeOf } from '../scripts/rules/world.mjs';

const content = loadContent();
const plain = { ...content, happenings: null };
const NOW = new Date('2026-10-27T09:00:00-03:00');
const ctx = { now: NOW };
const PP = content.balance.play_pay, X = PP.xiuwei;
const BOARD = staminaCost(content, 'game');
const R = (L, realm = 0) => X.rate.base * X.rate.growth ** (L - 1) * X.rate.realm ** realm;

test('the formula\'s knobs: R by level, a 层 one level (L = realm × 9 + 层, 2026-11-10), the gap both ways', () => {
  assert.equal(X.rate.base, 2, 'xw_per_stamina: 2 修为 a 体力 at level 1');
  assert.deepEqual([BOARD, staminaCost(content, 'duel'), staminaCost(content, 'shouchao')], [3, 2, 3], 'the default board, a card fight, a 兽潮 night with no kit named');
  assert.deepEqual(levelOf(content, 'qi', 0), { level: 0, realm: 0 });
  assert.deepEqual(levelOf(content, 'qi', 4), { level: 4, realm: 0 });
  // 81 levels (Hanli 2026-11-10): every 层 its own, 段 display only — 筑基一层 L10 … 九层 L18 (until 11-10 each 层 at its 段's).
  assert.deepEqual([0, 2, 3, 8].map(k => levelOf(content, 'foundation', k).level), [10, 12, 13, 18], '筑基: one level a 层 past 练气九层');
  assert.deepEqual(levelOf(content, 'foundation', 0), { level: 10, realm: 1 });
  assert.deepEqual(levelOf(content, 'core', 8), { level: 27, realm: 2 });
  assert.equal(rateAt(content, 1), 2);
  assert.ok(Math.abs(rateAt(content, 12, 1) - R(12, 1)) < 1e-9);
  assert.equal(gapOf(content, 5, 5), 1);
  assert.ok(Math.abs(gapOf(content, 5, 3) - (1 - 2 * X.gap.below)) < 1e-9, 'two levels below him: −30%');
  assert.equal(gapOf(content, 20, 1), X.gap.floor, 'never under the floor');
  assert.ok(Math.abs(gapOf(content, 1, 2) - (1 + X.gap.above)) < 1e-9);
  assert.equal(gapOf(content, 1, 9), 1 + X.gap.cap, 'capped above');
  const s = { tier: 'qi', step: 1 };
  assert.equal(xiuweiOf(content, s, 4, { difficulty: 'boss' }), R(1) * 4 * X.difficulty.boss);
  assert.equal(xiuweiOf(content, s, 3, { first: true }), R(1) * 3 * (1 + X.difficulty.first_clear));
});

test('a board at 练气一层: its 体力 × R, by its kind; ★ and the replay scaling it; 三层 at its own R; 零层 none', () => {
  const s = { tier: 'qi', step: 1, plays: null };
  const world = kind => ({ ...content, games: { games: [{ id: 'x', task: 'x', mechanic: kind }] } });
  const grant = (kind, stars, st = s) => playGrant(world(kind), st, 'x', { game: 'x' }, NOW, stars);
  const units = k => boardCost(content, 'game', { mechanic: k });
  for (const k of ['打地鼠', '割绳子', '格斗', '解谜', '你画我猜', '棋牌']) assert.equal(grant(k).progress, Math.round(R(1) * units(k) * X.board), k);
  assert.deepEqual(['打地鼠', '割绳子', '解谜'].map(units), [1, 2, 3], 'each its own minutes');
  assert.equal(grant('解谜', 1).progress, Math.round(R(1) * BOARD * X.board * PP.stars['1']), '★1');
  const again = { ...s, plays: { day: '2026-10-27', ids: { x: 1 } } };
  assert.equal(grant('解谜', null, again).progress, Math.round(R(1) * BOARD * X.board * PP.replay[1]), 'the same board again today');
  assert.equal(playGrant(content, { tier: 'qi', step: 0 }, 'pintu', { game: 'pintu' }, NOW)?.progress ?? 0, 0, '零层 pays no 修为');
  assert.equal(grant('棋牌', null, { tier: 'qi', step: 3, plays: null }).progress, Math.round(R(3) * BOARD * X.board), '三层: R(3)');
  assert.equal(playGrant(world('棋牌'), s, 'x', { game: 'x' }, NOW, null, { first: true }).progress, Math.round(R(1) * BOARD * 1.5 * X.board), 'a story board\'s first clear +50%');
  // A fixed number, not a share: the same at 练气一层 whatever the layer asks (a model's `need`).
  assert.equal(grant('棋牌', null, { ...s, need: 5000 }).progress, grant('棋牌').progress);
});

test('古四 at 146/470: the place games at 沉鼎观 each pay their formula number — the layer is sittings of play, not one', () => {
  // The boards standing at the 观's places by the plate's deal (a world without 观里的事: since 2026-11-10 rules/happenings.mjs deals the 观's through its happenings); the formula over them unchanged.
  let s = playTo(plain, newState(plain, 'zh', NOW), 'wm-chaifang', { now: NOW, policy: 'skip' }).state;
  s = { ...s, tier: 'qi', step: 1, progress: 146, stamina: 100 };
  let plays = 0;
  const seen = new Map();
  // The plate deals one practice board at a time (rules/rotation.mjs, 2026-11-04): each counted win deals the next, so
  // the 观's boards are played one after another — through the gated door every host plays by (VERBS).
  const key = plateKey(placeOf(plain, 'chaifang'));
  for (let k = 0; k < 6; k += 1) {
    const dealt = plateDealt(plain, s, key, NOW);
    const m = move(s, plain, ctx, { place: dealt.at });
    if (!m.result.ok) continue;
    s = m.state;
    for (const id of [dealt.game].filter((x) => plain.tasks.tasks.find((t) => t.id === x)?.kind === 'board')) {
      const w = VERBS.win(s, plain, ctx, { id, stars: 3 });
      if (!w.result.ok) continue;
      const d = VERBS.task({ ...w.state, stamina: 100 }, plain, ctx, { action: 'done', id });
      if (!d.result.ok) continue;
      const got = d.state.progress - w.state.progress;
      const n = seen.get(id) ?? 0; seen.set(id, n + 1);
      const cost = boardCost(plain, 'game', plain.games.games.find(g => g.task === id && !g.cut && !g.replaced));
      const want = Math.round(R(1) * cost * X.board * PP.replay[Math.min(n, PP.replay.length - 1)]);
      if (!d.result.handed?.length) assert.ok(Math.abs(got - want) <= 1, `${id} (play ${n + 1}): +${got}, the formula ${want}`);
      // …and the verb took that board's own 体力 (task done on a hosted board, state.mjs boardCost).
      if (plain.tasks.tasks.find((t) => t.id === id)?.hosted) assert.equal(d.state.stamina, 100 - cost, `${id}: ${cost} 体力`);
      s = d.state; plays += 1;
    }
  }
  assert.ok(plays >= 3, `${plays} plays`);
  // The layer asks sittings now (Hanli's formula): what is left of 一层 is more than a sitting's 100 体力 of boards.
  assert.ok((470 - 146) / (R(1) * BOARD / BOARD) > 100, 'more than one sitting');
  // …and the next is dealt: standing where it is, it is open as practice, in the tray.
  const next = plateDealt(plain, s, key, NOW);
  const l = look({ ...s, place: next.at }, plain, ctx);
  assert.ok(l.tasks.some((t) => t.practice && t.id === next.game), 'the place games stay open as practice, in the tray — one dealt at a time');
});

test('a board lost costs its 体力 in full (it was played; the coordinator for Hanli, 2026-11-04); the story\'s own board nothing', () => {
  let s = playTo(content, newState(content, 'zh', NOW), 'wm-chaifang', { now: NOW, policy: 'skip' }).state;
  s = { ...s, tier: 'qi', step: 1, progress: 146, stamina: 100 };
  const m = move(s, content, ctx, { place: 'zhishi' });
  if (m.result.ok) s = { ...m.state, stamina: 100 };
  const id = gamesToday(content, placeOf(content, s.place), NOW).find((x) => content.tasks.tasks.find((t) => t.id === x)?.hosted);
  assert.ok(id, 'a hosted board here');
  const t = content.tasks.tasks.find((x) => x.id === id);
  const cost = boardCost(content, 'game', content.games.games.find((g) => g.task === id && !g.cut && !g.replaced));
  const lost = task(s, content, ctx, { action: 'lost', id });
  assert.equal(lost.result.ok, true, JSON.stringify(lost.result));
  assert.equal(lost.state.stamina, 100 - cost, `${id}: lost, ${cost} 体力`);
  assert.equal(lost.result.stamina, cost);
  // On a spent pool a loss still stands, and takes nothing more.
  const spent = task({ ...s, stamina: 0 }, content, ctx, { action: 'lost', id });
  assert.equal(spent.result.ok, true);
  assert.equal(spent.state.stamina, 0);
  assert.ok(t.hosted);
  // A story board (not hosted) lost: nothing.
  const story = content.tasks.tasks.find((x) => x.kind === 'board' && !x.hosted && !x.shouchao && !x.qiecuo);
  assert.equal(task(s, content, ctx, { action: 'lost', id: story.id }).state.stamina, 100, `${story.id}: free`);
});

test('only small games gain the board factor; a card fight its own (fight)', () => {
  const s = { tier: 'qi', step: 1 };
  const old = structuredClone(content);
  old.balance.play_pay.xiuwei.board = 1;
  // 1.5 (Hanli 2026-11-10 「把小游戏奖励修为提高到1.5呗」), 5 the same evening: the games carry the layer again (master._board).
  assert.equal(X.board, content.balance.master.xiuwei.board);
  assert.equal(xiuweiOf(content, s, 3, { board: true }), X.board * xiuweiOf(old, s, 3, { board: true }));
  assert.equal(fightPlay(content, s), fightPlay(old, s), 'a card fight never takes the board factor');
  const plain = structuredClone(content);
  plain.balance.play_pay.xiuwei.fight = 1;
  assert.equal(fightPlay(content, s), Math.round(X.fight * xiuweiOf(plain, s, 2)), 'a card fight takes its own (play_pay.xiuwei.fight, 「打一场才几点」)');
  assert.equal(chorePlay(content, s, 'day'), chorePlay(old, s, 'day'));
  assert.equal(secludeHour(content, s), secludeHour(old, s));
});
