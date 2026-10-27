// After a fight lost, the ways forward (rules/strengthen.mjs; Hanli 2026-10-27, lost to the 后山's 狼 at
// 练气一层 with the 弓 and 灰袍 still in the pouch: 「玩家战败, 卡在这里, 可以让yinyue给一点提示, 去增强战力,
// 或者得到卡片, 武器, 再来刷怪」). The order is a rule; these hold it to the fight's own numbers at the wm-chaifang
// gate (tools/story-fights.mjs h05g, the band's careful line), and the loss's result to carry it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { begin, act, foeTurn } from '../scripts/battle.js';
import { duel, fightSetup, strengthen } from '../scripts/rules.mjs';
import { encounterOf } from '../scripts/rules/world.mjs';
import { content, FIGHTS, foeOf, NOW, stateAt } from '../tools/story-fights.mjs';
import { lookahead } from '../scripts/fightline.js';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const SEEDS = 40;

/* A save at the gate as he had it: the 弓 and 灰袍 in the pouch, not worn; 136 灵石; on the 后山. */
function gateSave(extra = {}) {
  const s = stateAt('h05g');
  Object.assign(s, { wear: {}, wealth: 136, place: 'houshan', done_scenes: [...new Set([...(s.done_scenes ?? []), 'wm-zhoutian', 'wm-yaoyuan'])], stamina: 100, stamina_at: NOW.toISOString() }, extra);
  s.bag = { ...s.bag, 'old-bow': 1, 'grey-robe': 1 };
  delete s.fight;
  return s;
}

/* The share of fixed deals won at the gate's 后山 by the careful line, with the save as given. */
function rate(save, ids = ['lang', 'yezhu', 'fushe']) {
  let won = 0, n = 0;
  for (const id of ids) {
    const f = FIGHTS.find(x => x.id === id && x.pool === 'yaoyuan-wai');
    const real = setupFor(save, f);
    for (let k = 0; k < SEEDS; k += 1) {
      const st = begin({ ...real, seed: `strong|${k}` }, catalog);
      for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) { if (st.whose === 'foe') { foeTurn(st); continue; } act(st, lookahead(st), 'you'); }
      if (st.outcome === 'won') won += 1;
      n += 1;
    }
  }
  return won / n;
}
const setupFor = (save, f) => fightSetup(content, save, foeOf(f), NOW, `haunt:${f.id}`);

test('his save at the gate: put on the 弓 and 灰袍 first, then a card at the 外门库房, a pill, another beast, 闭关, 功课', () => {
  const way = strengthen(content, gateSave(), { now: NOW, game: { hunt: 'houshan' } });
  assert.deepEqual(way.map(o => o.kind), ['wear', 'wear', 'buy', 'buy', 'pills', 'another', 'seclude', 'gongke']);
  assert.deepEqual(way.filter(o => o.kind === 'wear').map(o => o.item).sort(), ['grey-robe', 'old-bow']);
  const buy = way.find(o => o.kind === 'buy');
  assert.equal(buy.card, 'caoren', 'a body that stands in front first');
  assert.equal(buy.place, 'zhishi');
  assert.ok(buy.steps > 0 && buy.price <= 136, JSON.stringify(buy));
  assert.ok(way.every(o => o.kind !== 'buy' || o.price <= 136));
});

test('what he cannot afford or already holds is never offered; the 坊市 below the gate is not in reach', () => {
  const poor = strengthen(content, gateSave({ wealth: 10, wear: { weapon: 'old-bow', robe: 'grey-robe' } }), { now: NOW });
  assert.ok(!poor.some(o => o.kind === 'buy' || o.kind === 'pills' || o.kind === 'wear'), JSON.stringify(poor));
  const held = strengthen(content, gateSave({ cards: [...stateAt('h05g').cards, 'caoren', 'sanhuo', 'tieji'] }), { now: NOW });
  assert.ok(!held.some(o => o.kind === 'buy'));
  assert.ok(strengthen(content, gateSave(), { now: NOW }).every(o => o.place !== 'fangshi'), '外门弟子无令不得下山');
});

test('the order holds on the fight: worn beats bare, and a card bought beats worn', () => {
  const bare = rate(gateSave());
  const worn = rate(gateSave({ wear: { weapon: 'old-bow', robe: 'grey-robe' } }));
  const bought = rate(gateSave({ wear: { weapon: 'old-bow', robe: 'grey-robe' }, cards: [...stateAt('h05g').cards, 'caoren'] }));
  const two = rate(gateSave({ wear: { weapon: 'old-bow', robe: 'grey-robe' }, cards: [...stateAt('h05g').cards, 'caoren', 'sanhuo'] }));
  assert.ok(worn >= bare + 0.12, `worn ${worn} vs bare ${bare}`);
  assert.ok(bought >= worn + 0.1, `a card bought ${bought} vs worn ${worn}`);
  assert.ok(two >= 0.75, `two cards bought win ${two} — the model's ~0.8 for a player who bought`);
});

test('a loss at the 后山 carries what beat him and the way forward', () => {
  let s = gateSave();
  const enc = encounterOf(content, s, NOW);
  assert.ok(enc?.game?.id?.startsWith('haunt:'), 'a beast is up on the 后山');
  const started = duel(s, content, { now: NOW, quests: [] }, { id: enc.game.id });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
  const st = begin(started.result.duel.setup, catalog), picks = [];
  for (let g = 0; g < 400 && st.outcome === 'open'; g += 1) { if (st.whose === 'foe') { foeTurn(st); continue; } act(st, { kind: 'end' }, 'you'); picks.push('end'); }
  const r = duel(started.state, content, { now: NOW, quests: [] }, { id: enc.game.id, picks: picks.join(',') }).result;
  assert.notEqual(r.outcome, 'won');
  assert.ok(r.beat && Number.isFinite(r.beat.foe_hp) && Number.isFinite(r.beat.guards), JSON.stringify(r.beat));
  assert.equal(r.way?.[0]?.kind, 'wear', JSON.stringify(r.way));
});
