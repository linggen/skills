import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { fightSetup, lendOf } from '../scripts/rules/cards.mjs';
import { begin, act, foeTurn, tokenOf } from '../scripts/battle.js';
import { lookahead } from '../scripts/fightline.js';
import { playTo } from '../scripts/rules/progress.mjs';
import { duel } from '../scripts/rules.mjs';

const content = loadContent(), now = new Date('2026-10-21T11:40:00Z');
const state = newState(content, 'zh', now);
const beast = content.creatures.creatures.find(c => c.deck?.length && !c.person);
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const setup = n => fightSetup(content, { ...state, duel_lost: { [beast.id]: n } }, beast, now);

test('lend ladder caps and accumulates', () => {
  assert.equal(lendOf(content, 0), null);
  assert.deepEqual(lendOf(content, 1), { strike: 1 });
  assert.deepEqual(lendOf(content, 2), { strike: 1, hp: 2 });
  assert.deepEqual(lendOf(content, 99), { strike: 1, hp: 2, ward: 1 });
});
test('fight starts with its lend and no lend changes nothing', () => {
  const base = fightSetup(content, state, beast, now);
  assert.deepEqual(base, setup(0));
  const initial = begin(base, catalog);
  for (const n of [1, 2, 3]) {
    const s = begin(setup(n), catalog);
    assert.equal(s.you.powerHit, initial.you.powerHit + 1);
    assert.equal(s.you.hpMax, initial.you.hpMax + (n >= 2 ? 2 : 0));
    assert.equal(s.you.hp, initial.you.hp + (n >= 2 ? 2 : 0));
    if (n === 3) assert.equal(s.you.lendWard, 1);
    assert.equal(s.foe.lendWard, undefined);
  }
});
test('a settled loss is counted and a win clears the same beast', () => {
  process.env.LINGJING_STAMINA_LIMIT = '0';
  const at = playTo(content, newState(content, 'zh', now), '01-rise', { now });
  const game = content.chapters['01-ji'].scenes['01-rise'].exits.find(e => e.id === 'stand').game;
  const ctx = { now: at.now, quests: [] };
  const start = duel(at.state, content, ctx, { id: game.id });
  assert.equal(start.result.ok, true);
  const loss = duel(start.state, content, ctx, { id: game.id, picks: Array(80).fill('end').join(',') });
  assert.equal(loss.result.outcome, 'lost');
  assert.equal(loss.state.duel_lost[game.creature], 1);
  const again = duel(loss.state, content, ctx, { id: game.id });
  assert.equal(again.result.ok, true);
  const fight = begin(again.result.duel.setup, catalog), actions = [];
  for (let i = 0; i < 200 && fight.outcome === 'open'; i++) {
    if (fight.whose !== 'you') { foeTurn(fight); continue; }
    const a = lookahead(fight, { deep: true }); actions.push(tokenOf(a)); act(fight, a);
  }
  assert.equal(fight.outcome, 'won');
  const win = duel(again.state, content, ctx, { id: game.id, picks: actions.join(',') });
  assert.equal(win.result.outcome, 'won'); assert.equal(win.state.duel_lost[game.creature], undefined);
});

test('ward prevents one lethal blow', () => {
  const cat = { hit: { id: 'hit', kind: 'spell', cost: 0, effect: { damage: 30 } } };
  const st = begin({ mode: 'pvp', you: { tier: 'qi', deck: [] }, foe: { tier: 'qi', deck: [] }, lend: { ward: 1 } }, cat);
  st.whose = 'foe'; st.foe.hand = ['hit', 'hit'];
  assert.equal(act(st, { kind: 'play', index: 0 }, 'foe').ok, true);
  assert.equal(st.you.hp, 1); assert.equal(st.log.filter(x => x.act === 'ward').length, 1);
  assert.equal(act(st, { kind: 'play', index: 0 }, 'foe').ok, true);
  assert.equal(st.outcome, 'lost');
});
