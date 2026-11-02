// Every play pays a fixed 修为 (rules/playpay.mjs; Hanli 2026-11-02: 「不要按照百分比给.... 给太多了」 · 「我是说参考百分比的数值.
// 不能直接给百分比」, and the formula 「这套公式基本可以」): R(content level) × its 体力 × difficulty × ★ × the gap × the replay.
// A board costs 3 体力: at 练气一层 R is 2, so 6 a board, whatever its kind; ★ and the same board again the same day scale it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState, staminaCost } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { look, move, task, win } from '../scripts/rules.mjs';
import { gapOf, levelOf, playGrant, rateAt, sittingsAt, xiuweiOf } from '../scripts/rules/playpay.mjs';
import { gamesToday } from '../scripts/rules/rotation.mjs';
import { placeOf } from '../scripts/rules/world.mjs';

const content = loadContent();
const NOW = new Date('2026-10-27T09:00:00-03:00');
const ctx = { now: NOW };
const PP = content.balance.play_pay, X = PP.xiuwei;
const BOARD = staminaCost(content, 'game');
const R = (L, realm = 0) => X.rate.base * X.rate.growth ** (L - 1) * X.rate.realm ** realm;

test('the formula\'s knobs: R and S by level, a 练气 层 one level, a realm\'s step three, the gap both ways', () => {
  assert.equal(X.rate.base, 2, 'xw_per_stamina: 2 修为 a 体力 at level 1');
  assert.deepEqual([BOARD, staminaCost(content, 'duel'), staminaCost(content, 'shouchao')], [3, 4, 5]);
  assert.deepEqual(levelOf(content, 'qi', 0), { level: 0, realm: 0 });
  assert.deepEqual(levelOf(content, 'qi', 4), { level: 4, realm: 0 });
  assert.deepEqual(levelOf(content, 'foundation', 0), { level: 12, realm: 1 }, '筑基小成: three levels past 练气九层');
  assert.deepEqual(levelOf(content, 'core', 2), { level: 27, realm: 2 });
  assert.equal(rateAt(content, 1), 2);
  assert.ok(Math.abs(rateAt(content, 12, 1) - R(12, 1)) < 1e-9);
  assert.ok(Math.abs(sittingsAt(content, 1) - X.sittings.base) < 1e-9);
  assert.equal(gapOf(content, 5, 5), 1);
  assert.ok(Math.abs(gapOf(content, 5, 3) - (1 - 2 * X.gap.below)) < 1e-9, 'two levels below him: −30%');
  assert.equal(gapOf(content, 20, 1), X.gap.floor, 'never under the floor');
  assert.ok(Math.abs(gapOf(content, 1, 2) - (1 + X.gap.above)) < 1e-9);
  assert.equal(gapOf(content, 1, 9), 1 + X.gap.cap, 'capped above');
  const s = { tier: 'qi', step: 1 };
  assert.equal(xiuweiOf(content, s, 4, { difficulty: 'boss' }), R(1) * 4 * X.difficulty.boss);
  assert.equal(xiuweiOf(content, s, 3, { first: true }), R(1) * 3 * (1 + X.difficulty.first_clear));
});

test('a board at 练气一层: its 体力 × R, whatever its kind; ★ and the replay scaling it; 三层 at its own R; 零层 none', () => {
  const s = { tier: 'qi', step: 1, plays: null };
  const world = kind => ({ ...content, games: { games: [{ id: 'x', task: 'x', mechanic: kind }] } });
  const grant = (kind, stars, st = s) => playGrant(world(kind), st, 'x', { game: 'x' }, NOW, stars);
  for (const k of ['打地鼠', '割绳子', '格斗', '解谜', '你画我猜', '棋牌']) assert.equal(grant(k).progress, Math.round(R(1) * BOARD), k);
  assert.equal(grant('解谜', 1).progress, Math.round(R(1) * BOARD * PP.stars['1']), '★1');
  const again = { ...s, plays: { day: '2026-10-27', ids: { x: 1 } } };
  assert.equal(grant('解谜', null, again).progress, Math.round(R(1) * BOARD * PP.replay[1]), 'the same board again today');
  assert.equal(playGrant(content, { tier: 'qi', step: 0 }, 'pintu', { game: 'pintu' }, NOW)?.progress ?? 0, 0, '零层 pays no 修为');
  assert.equal(grant('棋牌', null, { tier: 'qi', step: 3, plays: null }).progress, Math.round(R(3) * BOARD), '三层: R(3)');
  assert.equal(playGrant(world('棋牌'), s, 'x', { game: 'x' }, NOW, null, { first: true }).progress, Math.round(R(1) * BOARD * 1.5), 'a story board\'s first clear +50%');
  // A fixed number, not a share: the same at 练气一层 whatever the layer asks (a model's `need`).
  assert.equal(grant('棋牌', null, { ...s, need: 5000 }).progress, grant('棋牌').progress);
});

test('古四 at 146/470: the place games at 沉鼎观 each pay their formula number — the layer is sittings of play, not one', () => {
  let s = playTo(content, newState(content, 'zh', NOW), 'wm-chaifang', { now: NOW, policy: 'skip' }).state;
  s = { ...s, tier: 'qi', step: 1, progress: 146, stamina: 100 };
  let plays = 0;
  const seen = new Map();
  const PLACES = ['chaifang', 'zhishi', 'cangjing', 'waimen', 'fantang', 'jiangtang'];
  for (const place of PLACES) {
    const m = move(s, content, ctx, { place });
    if (!m.result.ok) continue;
    s = m.state;
    const ids = gamesToday(content, placeOf(content, place), NOW).filter((id) => content.tasks.tasks.find((t) => t.id === id)?.kind === 'board');
    for (const id of ids) {
      const w = win(s, content, ctx, { id, stars: 3 });
      if (!w.result.ok) continue;
      const d = task({ ...w.state, stamina: 100 }, content, ctx, { action: 'done', id });
      if (!d.result.ok) continue;
      const got = d.state.progress - w.state.progress;
      const n = seen.get(id) ?? 0; seen.set(id, n + 1);
      const want = Math.round(R(1) * BOARD * PP.replay[Math.min(n, PP.replay.length - 1)]);
      if (!d.result.handed?.length) assert.ok(Math.abs(got - want) <= 1, `${id} (play ${n + 1}): +${got}, the formula ${want}`);
      s = d.state; plays += 1;
    }
  }
  assert.ok(plays >= 3, `${plays} plays`);
  // The layer asks sittings now (Hanli's formula): what is left of 一层 is more than a sitting's 100 体力 of boards.
  assert.ok((470 - 146) / (R(1) * BOARD / BOARD) > 100, 'more than one sitting');
  const l = look(s, content, ctx);
  assert.ok(l.tasks.some((t) => t.practice), 'the place games stay open as practice, in the tray');
});
