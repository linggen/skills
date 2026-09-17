// The gate for 斗法, small enough to run with the rest. tools/duel-sim.mjs
// plays the same lines over every creature, root set, step and day; this
// keeps the shape of it honest on every change:
//
//   · one choice repeated does not win
//   · reading the creature does
//   · no fight is lost by birth — roots, a sword and 借势 beat every creature
//   · neither side wins by making the other spend 灵力 alone
import test from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, ELEMENTS, fight, foeOf, offers } from '../scripts/duel.js';
import { loadWorld } from '../scripts/content.mjs';

const content = loadWorld('jiuding');
const creatures = content.creatures.creatures;
const itemOf = id => content.items.items.find(i => i.id === id);
const ROOT_SETS = ELEMENTS.map(missing => ELEMENTS.filter(e => e !== missing));

const kitOf = (roots, step, extra = {}) => {
  const sword = itemOf(roots.includes('metal') ? 'bamboo-sword' : 'iron-sword');
  return {
    roots, tier: 'qi', step, arts: {}, charm: null,
    weapon: { id: sword.id, atk: sword.effect.atk }, sword: sword.effect.root, ...extra,
  };
};

/* Play a whole fight under one line of play. */
function play(foe, kit, pick) {
  const actions = [];
  for (let n = 0; n < 60; n += 1) {
    const f = fight(actions, foe, kit);
    if (f.outcome !== 'open') return f;
    const can = offers(actions, foe, kit).filter(o => o.ok);
    const next = pick(f, foe, kit, can, actions);
    if (!next) return f;
    actions.push(next);
  }
  return fight(actions, foe, kit);
}

/* One choice, over and over; when it cannot be played, the rote player waits. */
const always = token => (f, foe, kit, can) => (can.find(o => o.token === token) ?? can.find(o => o.kind === 'assist') ?? can[0])?.token;

/* 护体 against a gathered blow, 聚势 before the finishing one, and otherwise
   the blow that takes the most 气血 for the least 灵力 — which is the counter
   root where it is theirs, a borrowed one where 借势 is known, the blade into
   a warded hide, the 符 to finish. It asks duel.js what each choice would do,
   so the gate can never drift from the rules. */
function attentive(f, foe, kit, can, actions) {
  const has = t => can.some(o => o.token === t);
  if (f.foe.gather && has('assist:guard')) return 'assist:guard';
  const hits = can.filter(o => o.kind !== 'assist').map((o) => {
    const after = fight([...actions, o.token], foe, kit);
    return { ...o, dealt: f.foe.hp - after.foe.hp, spent: Math.max(0, f.you.qi - after.you.qi) };
  }).filter(o => o.dealt > 0).sort((a, b) => b.dealt / (b.spent + 1) - a.dealt / (a.spent + 1));
  const best = hits[0];
  if (!best) return can[0]?.token;
  if (!f.you.focus && has('assist:focus') && best.dealt < f.foe.hp && Math.round(best.dealt * 1.5) >= f.foe.hp) return 'assist:focus';
  if (has('talisman') && f.foe.hp <= 12) return 'talisman';
  return best.token;
}

/* Every creature, every root set, a few steps — at 练气, where the pools are
   tightest and the numbers bite hardest. */
function rate(pick, extra = {}) {
  let wins = 0, games = 0, dry = 0;
  const pairs = new Map();
  for (const c of creatures) {
    for (const roots of ROOT_SETS) {
      for (const step of [0, 4, 8]) {
        const f = play(foeOf(c, 'qi', step, `${step}|${c.id}`), kitOf(roots, step, extra), pick);
        games += 1;
        const key = `${c.id}|${roots.join('')}`;
        pairs.set(key, (pairs.get(key) ?? 0) + (f.outcome === 'won' ? 1 : 0));
        if (f.outcome === 'won') wins += 1;
        if (f.foe.qi <= 0 || (f.you.qi <= 0 && f.you.hp > 0)) dry += 1;
      }
    }
  }
  return { rate: wins / games, dry: dry / games, never: [...pairs].filter(([, w]) => !w).map(([k]) => k) };
}

test('斗法 is not a rolling game: one choice repeated does not win', () => {
  for (const el of ELEMENTS) {
    const r = rate(always(`cast:${el}`));
    assert.ok(r.rate < 0.3, `always ${el} wins ${(r.rate * 100).toFixed(1)}%`);
  }
  assert.ok(rate(always('strike')).rate < 0.3, 'always 物理');
  assert.ok(rate(always('assist:guard')).rate < 0.3, 'waiting a creature out is not a way to win');
});

test('斗法 rewards reading the creature, and no fight is lost by birth', () => {
  const smart = rate(attentive);
  assert.ok(smart.rate > 0.75, `the attentive line wins ${(smart.rate * 100).toFixed(1)}%`);
  assert.ok(smart.dry < 0.25, '灵力 alone does not decide it');
  // 借势 is the prologue's own art: with it, every creature can be beaten by
  // every birth — the root they lack is reached through the one that makes it.
  const born = rate(attentive, { arts: { jieshi: { effect: 'generate', ready: true } } });
  assert.deepEqual(born.never, [], 'a root, a sword and 借势 beat every creature');
});

test('every creature the world ships fights a way the rules know', () => {
  for (const c of creatures) {
    const foe = foeOf(c, 'qi', 0, 'x');
    assert.ok(foe.hp > 0 && foe.qi > 0 && foe.atk > 0 && foe.spell > 0, c.id);
    assert.ok(foe.pattern.length, c.id);
    assert.equal(BEATS[foe.root] !== undefined, true, c.id);
  }
});
