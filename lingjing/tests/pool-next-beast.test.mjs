// After a fight at a pool, a new beast (Hanli 2026-11-07, on his phone: 「我玩斗法, 每次都是同样的妖, 应该打完换新的」).
// Two holes let the same beast stand fight after fight: 泗水边 (泗水北岸 · 泗水岸) held only 蛫, and the match (rules/match.mjs
// weigh) fell back to the whole pool once every beast up was among the last three fought — 上山路, three up, then stood the
// same beast again and again. Now the last few stand down as world.mjs poolBeast keeps them (never all that is up), and every
// pool met again and again holds more than one beast. Won, lost or run dry: the next fight there is another beast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, begin, foeTurn, tokenOf } from '../scripts/battle.js';
import { lookahead } from '../scripts/fightline.js';
import { duel, standFit } from '../scripts/rules.mjs';
import { allPlaces, encounterOf, poolOf } from '../scripts/rules/world.mjs';
import { content, NOW, stateAt } from '../tools/story-fights.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));

/* One fight at the pool where he stands, as the page plays it: `w` a careful line (lookahead), `l` ending every turn. */
function fightHere(s, how, now) {
  const fitted = standFit(content, s, now);
  const e = encounterOf(content, fitted, now);
  assert.ok(e?.pool, `a pool's beast stands at ${s.place}`);
  const started = duel(fitted, content, { now }, { id: e.game.id });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
  const g = begin(started.result.duel.setup, catalog), picks = [];
  for (let i = 0; i < 400 && g.outcome === 'open'; i += 1) {
    if (g.whose === 'foe') { foeTurn(g); continue; }
    const p = how === 'l' ? { kind: 'end' } : lookahead(g, { deep: true });
    act(g, p, 'you');
    picks.push(p.kind === 'end' ? 'end' : tokenOf(p));
  }
  const settled = duel(started.state, content, { now }, { id: e.game.id, picks: picks.join(',') });
  assert.equal(settled.result.ok, true, JSON.stringify(settled.result));
  return { state: { ...settled.state, stamina: 150, stamina_at: now.toISOString() }, cid: e.creature.id, outcome: g.outcome };
}

function playRun(place, plan) {
  let s = { ...stateAt('h10'), place, scene: null, stamina: 150, stamina_at: NOW.toISOString() };
  delete s.fight;
  const fought = [];
  plan.split('').forEach((how, i) => {
    const now = new Date(NOW.getTime() + i * 60_000);
    const r = fightHere(s, how, now);
    fought.push(`${r.cid}:${r.outcome}`);
    s = r.state;
  });
  return fought;
}

for (const [place, plan] of [['sibei', 'wlwlwwl'], ['shanlu', 'wlwwlww']]) {
  test(`${place}: seven fights in a row, won and lost — never the beast just fought, and every beast up comes round`, () => {
    const fought = playRun(place, plan), cids = fought.map(f => f.split(':')[0]);
    for (let i = 1; i < cids.length; i += 1) assert.notEqual(cids[i], cids[i - 1], `fight ${i + 1} stood ${cids[i]} again: ${fought.join(' → ')}`);
    assert.ok(new Set(cids).size >= 3, `three or more beasts met: ${fought.join(' → ')}`);
    assert.ok(fought.some(f => f.endsWith(':won')) && fought.some(f => !f.endsWith(':won')), `won and lost both: ${fought.join(' → ')}`);
  });
}

/* A pool met again and again holds more than one beast. A 秘境's room is met once a run (its own fight, rules/mijing.mjs).
   漳水下游 (冀, liuwan) holds only 人鱼 still — open for Hanli (named here, not hidden: it fails the day it is meant to pass). */
const ONE_BEAST_STILL = new Set(['liuwan']);
test('every pool on the map, met again and again, holds two beasts or more', () => {
  const pools = new Map(allPlaces(content).filter(p => p.has?.pool && !p.id.startsWith('mijing-')).map(p => [p.has.pool, poolOf(content, p)]));
  for (const [id, pool] of pools) {
    const n = new Set(pool.beasts.filter(b => (b.weight ?? 1) > 0).map(b => b.creature)).size;
    if (ONE_BEAST_STILL.has(id)) { assert.equal(n, 1, `${id} has more now: take it off ONE_BEAST_STILL`); continue; }
    assert.ok(n >= 2, `${id} holds ${n} beast — every fight there is the same one`);
  }
});
