// 体力 by play time (Hanli 2026-11-02: 「体力是控制单次游戏时长的」 · 1 体力 ≈ 1 分钟; 2026-11-04: 「小游戏有一些时间比较长的,
// 你看一下体力扣的是否对」 · 「剧情保持不扣」 · 「可以, 2小时回满」). Every playable kind is priced by its own minutes
// (balance.json play_pay.minutes · game_minutes, state.mjs boardCost), each within ±50% of what he was measured playing it
// (tests/fixtures/play-minutes.json) or the design's guess where he has not; reading the story costs nothing; 闭关 fills
// the pool in two hours.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { boardCost, boardMinutes, newState, settleStamina, staminaCost } from '../scripts/state.mjs';
import { playGrant } from '../scripts/rules/playpay.mjs';

const content = loadContent();
const M = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/play-minutes.json'), 'utf8'));
const pp = content.balance.play_pay;
const live = (content.games.games ?? []).filter(g => !g.cut && !g.replaced && g.mechanic);
/* What a row of the fixture says he takes: the measured median where there are two plays or more, else the guess (`est`),
   else the one play. */
const truth = r => (r.n >= 2 && r.median != null ? r.median : r.est ?? r.median);
const near = (cost, minutes) => cost >= minutes * 0.5 && cost <= Math.max(1, minutes * 1.5);

test('every playable kind has its own price — none falls to the default', () => {
  for (const kind of new Set(live.map(g => g.mechanic))) {
    assert.ok(Number.isFinite(pp.minutes[kind]) && pp.minutes[kind] >= 1, `${kind}: priced in play_pay.minutes`);
    assert.ok(M.kinds[kind], `${kind}: measured or estimated in tests/fixtures/play-minutes.json`);
  }
  for (const id of Object.keys(pp.game_minutes)) assert.ok(live.some(g => g.id === id), `game_minutes.${id}: a live game`);
});

test('each kind and each priced game costs within ±50% of what he takes to play it', () => {
  for (const [kind, r] of Object.entries(M.kinds)) {
    const cost = boardCost(content, 'game', { mechanic: kind });
    assert.ok(near(cost, truth(r)), `${kind}: 体力 ${cost} against ${truth(r)} min`);
  }
  for (const [id, r] of Object.entries(M.games)) {
    const row = live.find(g => g.id === id);
    const cost = boardCost(content, 'game', row);
    assert.ok(near(cost, truth(r)), `${id}: 体力 ${cost} against ${truth(r)} min`);
  }
  assert.ok(near(staminaCost(content, 'duel'), truth(M.acts.duel)), 'a card fight');
  assert.ok(near(staminaCost(content, 'qiecuo'), truth(M.acts.qiecuo)), '切磋');
});

test('a board is priced by the game played: the 塔防 kits apart, 华容道 by its kind; with no board named, the default', () => {
  const row = id => live.find(g => g.id === id);
  assert.deepEqual(['shouqiang', 'shoulu', 'sadoushou', 'sadou'].map(id => boardCost(content, 'game', row(id))), [5, 3, 1, 2]);
  assert.equal(boardCost(content, 'game', row('huarong')), pp.minutes['解谜']);
  assert.equal(boardCost(content, 'game', row('jinchat')), 1);
  assert.equal(boardCost(content, 'game'), pp.minutes.default, '对对子 · 论道 · a 传闻 board: the default');
  assert.equal(boardMinutes(content, { id: 'nope', mechanic: 'nope' }), pp.minutes.default);
  // 兽潮 is priced the same way, by tonight's kit.
  assert.equal(content.rewards.stamina.cost.shouchao, 'board');
  assert.equal(boardCost(content, 'shouchao', row('shouqiang')), 5);
});

test('a board pays by what it costs: R × its 体力 (守墙 five times 撒豆成兵, at the same layer)', () => {
  const s = { ...newState(content, 'zh', new Date('2026-11-04T10:00:00')), tier: 'qi', step: 1 };
  const t = id => (content.tasks.tasks ?? []).find(x => x.id === id) ?? { id };
  const wall = live.find(g => g.id === 'shouqiang' && g.task), bean = live.find(g => g.id === 'sadoushou' && g.task);
  const gw = playGrant(content, s, wall.task, t(wall.task), new Date(), 3, { row: wall.id });
  const gb = playGrant(content, s, bean.task, t(bean.task), new Date(), 3, { row: bean.id });
  assert.equal(gw.stamina, 5); assert.equal(gb.stamina, 1);
  assert.ok(gw.progress >= gb.progress * 4, `守墙 ${gw.progress} vs 撒豆 ${gb.progress}`);
});

test('reading the story is free (「剧情保持不扣」): a scene\'s step costs 0 whatever its length', () => {
  assert.equal(content.rewards.stamina.cost.step, 0);
  const sc = Object.values(content.chapters).flatMap(ch => Object.values(ch.scenes ?? {})).find(x => (x.exits ?? []).some(e => e.next));
  assert.equal(staminaCost(content, 'step', 1, sc, sc.exits.find(e => e.next)), 0);
});

test('闭关 fills the whole pool in two hours, linear: 12 minutes +10, an hour +50 (「可以, 2小时回满」)', () => {
  assert.equal(content.rewards.stamina.refill.seclusion_hours, 2);
  const T0 = new Date('2026-11-04T10:00:00Z');
  const at = m => new Date(T0.getTime() + m * 60_000);
  const sit = () => ({ ...newState(content, 'zh', T0), stamina: 0, stamina_at: T0.toISOString(), seclusion: { since: T0.toISOString() } });
  for (const [m, want] of [[12, 10], [60, 50], [120, 100]]) {
    const s = sit();
    settleStamina(content, s, at(m));
    assert.equal(s.stamina, want, `${m} min`);
  }
  // Out of 闭关 nothing comes back by the clock.
  const s = { ...sit(), seclusion: null };
  settleStamina(content, s, at(120));
  assert.equal(s.stamina, 0);
});
