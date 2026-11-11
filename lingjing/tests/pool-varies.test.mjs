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
  // …each 时辰's own draw: a save that played nothing, taken as begun in it (an unplayed draw waits, rules/pool.mjs drawPool).
  .some(now => (look({ ...structuredClone(s), created: now.toISOString() }, c, { now, quests: [] }).tray ?? []).some(e => e.id === id));
const RIDDLE = 'zhishi-shen';
const task = (c, id) => c.tasks.tasks.find(t => t.id === id);
/* 周衡's 灯谜 as it stood before its riddle pool (deal.pool 'dengmi', 2026-11-02): the fixed board these tests stand on. */
const fixedContent = () => { const c = structuredClone(content); const { pool: _, ...deal } = task(c, RIDDLE).deal; task(c, RIDDLE).deal = deal; return c; };

test('every hosted board says whether it varies: a content pool, a ladder, or `varies` plainly', () => {
  for (const t of content.tasks.tasks.filter(t => t.hosted && t.kind === 'board' && !t.stall)) {
    const inferred = (t.climb?.length ?? 0) > 1 || (t.deal?.levels?.length ?? 0) > 1 || ['pool', 'riddles', 'deck'].some(k => t.deal?.[k]);
    assert.ok(inferred || typeof t.varies === 'boolean', `${t.id}: declare \`varies\` (true or false)`);
  }
  assert.equal(boardVaries(task(fixedContent(), RIDDLE)), false, '周衡\'s 灯谜 without its pool: one riddle');
  assert.equal(boardVaries(task(content, RIDDLE)), true, '周衡\'s 灯谜: its riddle pool (deal.pool)');
  for (const id of ['wuziqi', 'xiangqi', 'huarong', 'pintu', 'alchemy-daily', 'yaoyuan-zhuochong', 'chaifang-huangshulang']) assert.equal(boardVaries(task(content, id)), true, id);
  // The hook: a content pool in the deal wins over a plain `varies: false`.
  assert.equal(boardVaries({ varies: false, deal: { chat: 'shen', pool: true } }), true);
  assert.equal(boardVaries({ varies: false, deal: { riddles: ['a', 'b'] } }), true);
  assert.equal(boardVaries({ varies: false, deal: { pool: [] } }), false, 'an empty pool is no pool');
});

test('a fixed board once won is never drawn again; unwon, it is', () => {
  const s = at('zhishi'), fixed = fixedContent();
  assert.ok(everIn(fixed, s, RIDDLE), 'unwon: in the row in some 时辰');
  assert.ok(!everIn(fixed, { ...s, pool_won: { [RIDDLE]: START.toISOString() } }, RIDDLE), 'won: never again');
  // A save from before the pool's own stamp: the best ★ the page kept on the win is a win (his four, 10-28 · 11-02).
  assert.ok(!everIn(fixed, { ...s, stars: { ...(s.stars ?? {}), [RIDDLE]: 3 } }, RIDDLE), 'won before (stars): never again');
});

test('a board that varies, won, is still drawn', () => {
  const s = at('zhishi');
  const ids = ['wuziqi', 'xiangqi', 'huarong'];
  // Dealt on the plate (rules/rotation.mjs, 2026-11-04: one practice board at a time): 象棋 at 执事堂 — on a plate no
  // happening stands on (the 观's plate deals through 观里的事 since 2026-11-10, tested in happenings.test.mjs).
  const won = { ...s, pool_won: Object.fromEntries(ids.map(id => [id, START.toISOString()])), stars: Object.fromEntries(ids.map(id => [id, 3])), plate_deal: { guan: { n: 0, at: 'zhishi', game: 'xiangqi' } } };
  assert.ok(ids.some(id => everIn({ ...content, happenings: null }, won, id)), 'a varying board stays in the pool once won');
  // …and through a happening: 棋摊 deals 五子 won, again and again.
  const qitan = content.happenings.happenings.find(h => h.id === 'fantang-qitan');
  assert.ok(qitan.deals.some(d => d.task === 'wuziqi'), '五子 is 棋摊\'s');
});

test('the 灯谜 comes back once its deal carries a riddle pool (`deal.pool`)', () => {
  const pooled = structuredClone(content);
  task(pooled, RIDDLE).deal = { ...task(pooled, RIDDLE).deal, pool: true };
  assert.ok(everIn(pooled, at('zhishi', { pool_won: { [RIDDLE]: START.toISOString() } }), RIDDLE));
});

test('a board counted done is stamped won, apart from the draw\'s rest; a loss is not', () => {
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

/* ── The win counter a content pool deals by (the mini-games dev's ask, 11-02): Look's deal carries the save's seed and
   `n`, his wins of the board before this play; an older save won by its ★ alone counts one. ── */
const pooledContent = () => { const c = structuredClone(content); task(c, RIDDLE).deal = { ...task(c, RIDDLE).deal, pool: 'dengmi' }; return c; };
const dealIn = (c, s, now = new Date(2026, 9, 21, 19, 10)) => {
  const l = look(structuredClone(s), c, { now, quests: [] });
  return (l.tasks ?? []).find(t => t.id === RIDDLE)?.deal ?? null;
};

test('a deal with a content pool carries the seed and his wins before this play', () => {
  const c = pooledContent(), s = at('zhishi');
  const fresh = dealIn(c, s);
  assert.ok(fresh, 'the 灯谜 stands at 执事堂 with its deal');
  assert.equal(fresh.n, 0, 'a fresh save: none');
  assert.equal(fresh.seed, s.seed ?? fresh.seed);
  assert.equal(typeof fresh.seed, 'string');
  assert.equal(fresh.pool, 'dengmi');
  // One win (the board counted done, as the gated verb stamps it): n 1, and a loss never counts.
  const won = structuredClone(s);
  stampPlay(PLAY_KINDS, c, s, won, 'task', { action: 'done', id: RIDDLE }, new Date(2026, 9, 21, 9));
  assert.equal(won.pool_wins[RIDDLE], 1);
  assert.equal(dealIn(c, won).n, 1);
  const lost = structuredClone(won);
  stampPlay(PLAY_KINDS, c, won, lost, 'task', { action: 'lost', id: RIDDLE }, new Date(2026, 9, 21, 10));
  assert.equal(lost.pool_wins[RIDDLE], 1);
  const twice = structuredClone(won);
  stampPlay(PLAY_KINDS, c, won, twice, 'task', { action: 'done', id: RIDDLE }, new Date(2026, 9, 21, 11));
  assert.equal(dealIn(c, twice).n, 2);
});

test('an older save won by its ★ alone counts one — and its next win two, never its first again', () => {
  const c = pooledContent(), s = at('zhishi', { stars: { [RIDDLE]: 3 } });
  assert.ok(dealIn(c, s).n >= 1);
  const next = structuredClone(s);
  stampPlay(PLAY_KINDS, c, s, next, 'task', { action: 'done', id: RIDDLE }, new Date(2026, 9, 21, 9));
  assert.equal(next.pool_wins[RIDDLE], 2);
});

test('a deal without a pool is as it was: no seed, no n', () => {
  const fixed = fixedContent(), d = dealIn(fixed, at('zhishi'));
  assert.deepEqual(d, task(fixed, RIDDLE).deal);
});

test('the board on the rules\' deal: a fresh save\'s first play asks 人参; a save that has won draws its pool (jinchat-games.js poolPick)', async () => {
  const { poolPick, poolPlay } = await import('../scripts/games/jinchat-games.js');
  const fs = await import('node:fs');
  const reg = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
  const shen = reg.games.find(g => g.id === 'jinchat' && !g.task).data.chats.shen.game;
  const POOL = JSON.parse(fs.readFileSync(new URL(`../worlds/jiuding/${shen.pool}.json`, import.meta.url), 'utf8'));
  const fresh = dealIn(content, at('zhishi'));
  assert.equal(fresh.n, 0);
  assert.equal(poolPick(shen, POOL, poolPlay(fresh, 'zh')).riddle, 'own', 'a fresh save: 人参');
  const won = dealIn(content, at('zhishi', { stars: { [RIDDLE]: 3 } }));
  assert.ok(won.n >= 1);
  assert.ok(POOL.zh.some(r => r.id === poolPick(shen, POOL, poolPlay(won, 'zh')).riddle), 'won before: a pool riddle');
});
