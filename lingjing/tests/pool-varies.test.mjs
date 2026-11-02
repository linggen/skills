// 小游戏池 keeps only boards that differ each play (Hanli 2026-11-02, on 周衡's 灯谜 won four times: 「这个人参的灯谜我是否
// 玩过几次了?」): a board with one fixed content leaves the pool once won (rules/pool.mjs boardVaries · wonEver); one that
// varies stays; a deal that carries a content pool (`deal.pool`) varies — the 灯谜 comes back the day its deal has one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo } from '../scripts/rules.mjs';
import { PLAY_KINDS } from '../scripts/rules/aside.mjs';
import { boardVaries, stampPlay, wonEver } from '../scripts/rules/pool.mjs';

const content = loadContent();
const START = new Date(2026, 9, 20, 9, 0);
const BASE = (() => {
  process.env.LINGJING_STAMINA_LIMIT = '0';
  try { return playTo(content, newState(content, 'zh', START), 'wm-yaoyuan', { now: START }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
})();
const at = (place, extra = {}) => ({ ...structuredClone(BASE), quests: { ...(BASE.quests ?? {}), 'guan-shouchao': { done_at: START.toISOString() } },
  place, stamina: 100, stamina_at: START.toISOString(), ...extra });
/* Every 时辰 of a week: whether the tray ever stands `id`. */
const everIn = (c, s, id) => Array.from({ length: 84 }, (_, i) => new Date(2026, 9, 21 + Math.floor(i / 12), 1 + 2 * (i % 12), 10))
  .some(now => (look(structuredClone(s), c, { now, quests: [] }).tray ?? []).some(e => e.id === id));
const RIDDLE = 'zhishi-shen';
const task = (c, id) => c.tasks.tasks.find(t => t.id === id);

test('every hosted board says whether it varies: a content pool, a ladder, or `varies` plainly', () => {
  for (const t of content.tasks.tasks.filter(t => t.hosted && t.kind === 'board' && !t.stall)) {
    const inferred = (t.climb?.length ?? 0) > 1 || (t.deal?.levels?.length ?? 0) > 1 || ['pool', 'riddles', 'deck'].some(k => t.deal?.[k]);
    assert.ok(inferred || typeof t.varies === 'boolean', `${t.id}: declare \`varies\` (true or false)`);
  }
  assert.equal(boardVaries(task(content, RIDDLE)), false, '周衡\'s 灯谜: one riddle');
  for (const id of ['wuziqi', 'xiangqi', 'huarong', 'pintu', 'alchemy-daily', 'yaoyuan-zhuochong', 'chaifang-huangshulang']) assert.equal(boardVaries(task(content, id)), true, id);
  // The hook: a content pool in the deal wins over a plain `varies: false`.
  assert.equal(boardVaries({ varies: false, deal: { chat: 'shen', pool: true } }), true);
  assert.equal(boardVaries({ varies: false, deal: { riddles: ['a', 'b'] } }), true);
  assert.equal(boardVaries({ varies: false, deal: { pool: [] } }), false, 'an empty pool is no pool');
});

test('a fixed board once won is never drawn again; unwon, it is', () => {
  const s = at('zhishi');
  assert.ok(everIn(content, s, RIDDLE), 'unwon: in the row in some 时辰');
  assert.ok(!everIn(content, { ...s, pool_won: { [RIDDLE]: START.toISOString() } }, RIDDLE), 'won: never again');
  // A save from before the pool's own stamp: the best ★ the page kept on the win is a win (his four, 10-28 · 11-02).
  assert.ok(!everIn(content, { ...s, stars: { ...(s.stars ?? {}), [RIDDLE]: 3 } }, RIDDLE), 'won before (stars): never again');
});

test('a board that varies, won, is still drawn', () => {
  const s = at('zhishi');
  const ids = ['wuziqi', 'xiangqi', 'huarong'];
  const won = { ...s, pool_won: Object.fromEntries(ids.map(id => [id, START.toISOString()])), stars: Object.fromEntries(ids.map(id => [id, 3])) };
  assert.ok(ids.some(id => everIn(content, won, id)), 'a varying board stays in the pool once won');
});

test('the 灯谜 comes back once its deal carries a riddle pool (`deal.pool`)', () => {
  const pooled = structuredClone(content);
  task(pooled, RIDDLE).deal = { ...task(pooled, RIDDLE).deal, pool: true };
  assert.ok(everIn(pooled, at('zhishi', { pool_won: { [RIDDLE]: START.toISOString() } }), RIDDLE));
});

test('a board counted done is stamped won, apart from the 体力卡\'s cooldowns; a loss is not', () => {
  const s = at('zhishi'), now = new Date(2026, 9, 21, 9);
  const next = structuredClone(s);
  stampPlay(PLAY_KINDS, content, s, next, 'task', { action: 'done', id: RIDDLE }, now);
  assert.equal(next.pool_won?.[RIDDLE], now.toISOString());
  assert.ok(wonEver(next, RIDDLE));
  const lost = structuredClone(s);
  stampPlay(PLAY_KINDS, content, s, lost, 'task', { action: 'lost', id: RIDDLE }, now);
  assert.equal(lost.pool_won?.[RIDDLE], undefined);
  assert.ok(lost.pool_played?.[RIDDLE], 'played, though');
});
