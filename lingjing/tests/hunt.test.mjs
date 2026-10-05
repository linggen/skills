// 游荡的怪 (Hanli, 2026-10-05: 一片地方一个游荡怪物池，可重复打): a stretch of country shares
// one pool of beasts (places/<p>.json `pools`, a place's `has.pool`); one is up at a time,
// fought as often as he likes — each settle draws the next — and paid by the haunt table.
// Bosses stay the story's one fight. 卷一's beasts, and a few added from 《山海经 · 北次三经》.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { act, battle, begin, foeTurn, offers, tokenOf } from '../scripts/battle.js';
import { duel, look } from '../scripts/rules.mjs';
import { allPlaces, encounterOf, poolOf } from '../scripts/rules/world.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00+08:00');
const ctx = { now: NOW, quests: [] };
const jiScenes = Object.keys(content.chapters['01-ji'].scenes);
const at = (place, extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '01-ji', scene: null, place, tier: 'foundation', step: 0, progress: 0, wealth: 10,
  traits: ['wood', 'fire'], ended: ['00-prologue', '00-waimen', '00-zhuji', '01-ji'], done_scenes: jiScenes,
  stamina: 100, stamina_at: NOW.toISOString(), ...extra,
});
const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));

/* Start a fight and play it out as the page would, then settle it (tests/rules.test.mjs fightOut). */
function fightOut(state, id, { line = null } = {}) {
  const started = duel(state, content, ctx, { id });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
  const { setup } = started.result.duel;
  const st = begin(setup, catalog);
  const actions = [];
  for (let guard = 0; guard < 160 && st.outcome === 'open'; guard += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const can = line === 'pass' ? [] : offers(st).filter(o => o.ok && o.action.kind !== 'end');
    const body = side => side.board.reduce((n, m) => n + m.atk + m.hp * 0.6, 0);
    const before = { hp: st.foe.hp, mine: body(st.you), theirs: body(st.foe) };
    const best = can.map(o => {
      const after = battle([...actions, tokenOf(o.action)], setup, catalog);
      return { o, worth: (before.hp - after.foe.hp) * 2 + (body(after.you) - before.mine) * 1.2 + (before.theirs - body(after.foe)) - (o.cost ?? 0) * 0.1 };
    }).sort((a, b) => b.worth - a.worth)[0]?.o;
    if (!best) { act(st, { kind: 'end' }, 'you'); actions.push('end'); continue; }
    act(st, best.action, 'you');
    actions.push(tokenOf(best.action));
  }
  const settled = duel(started.state, content, ctx, { id, picks: actions.join(',') });
  assert.equal(settled.result.ok, true, JSON.stringify(settled.result));
  return settled;
}

test('the pools are declared, of 卷一\'s beasts and a few added — none of a later 卷, no person, no boss', () => {
  const pooled = new Set();
  for (const p of allPlaces(content).filter(p => p.has?.pool)) {
    const pool = poolOf(content, p);
    assert.ok(pool, p.id);
    for (const b of pool.beasts) pooled.add(b.creature);
  }
  assert.deepEqual([...pooled].sort(), ['gui', 'lang', 'linghu', 'longzhi', 'renyu', 'tianma', 'xiong', 'yezhu', 'zheng'].sort());
  for (const id of pooled) {
    const c = content.creatures.creatures.find(x => x.id === id);
    assert.ok((c.juan ?? 1) === 1 && !c.person && !c.trial, id);
  }
  // The added beasts of 冀 are 《山海经》's, their lines quoted; not yet painted, and they claim no picture.
  for (const id of ['tianma', 'linghu', 'renyu']) {
    const c = content.creatures.creatures.find(x => x.id === id);
    assert.match(c.source.zh, /北次三经/);
    assert.ok(c.quote.zh.includes(c.name.zh), `${id}'s quote names it`);
    assert.equal(c.unpainted, true);
    assert.equal(c.art, undefined);
  }
});

test('a pool\'s beast is up where no scene runs, fought again and again: each settle draws the next, a win pays the haunt table', () => {
  let s = at('mengshan');
  const pool = poolOf(content, allPlaces(content).find(p => p.id === 'mengshan')).beasts.map(b => b.creature);
  const met = [];
  let wins = 0;
  for (let k = 0; k < 10; k += 1) {
    const e = encounterOf(content, s, NOW);
    assert.ok(e?.pool, 'a pool beast is up');
    assert.ok(pool.includes(e.creature.id), e.creature.id);
    met.push(e.creature.id);
    const out = fightOut(s, e.game.id);
    if (out.result.outcome === 'won') { wins += 1; assert.ok(out.result.paid, 'a win pays the haunt table'); }
    s = out.state;
    assert.equal(s.duels['hunt:mengshan'].n, k + 1, 'the next beast is drawn');
  }
  assert.ok(wins >= 1, `won ${wins} of 10`);
  assert.ok(new Set(met).size >= 2, `more than one beast of the pool met: ${met}`);
  // A loss does not shut the stretch for the day either.
  const lost = fightOut(s, encounterOf(content, s, NOW).game.id, { line: 'pass' });
  assert.notEqual(lost.result.outcome, 'won');
  assert.ok(encounterOf(content, lost.state, NOW)?.pool);
  // Look carries it as the place's own, under the stretch's name.
  const l = look(lost.state, content, ctx);
  assert.equal(l.place.encounter.pool.name, '蒙山');
  assert.equal(l.place.encounter.duel.stake, '蒙山前山');
});

test('狰 runs wild outside the herb garden, fought there — even by one whose 小狰 walks with him', () => {
  const s = at('houshan', { cast: ['zheng'] });
  let found = null;
  for (let n = 0; n < 12 && !found; n += 1) {
    const t = { ...s, duels: { 'hunt:houshan': { day: dayKey(NOW), outcome: 'won', n } } };
    const e = encounterOf(content, t, NOW);
    if (e?.creature.id === 'zheng') found = t;
  }
  assert.ok(found, '狰 is drawn there');
  const started = duel(found, content, ctx, { id: 'haunt:zheng' });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
});

test('an errand for a pool\'s beast points to its stretch', () => {
  const s = at('liuwan');
  const l = look(s, content, ctx);
  assert.ok((l.offers ?? []).some(o => o.id === 'ji-liuwan-renyu'));
  assert.equal(encounterOf(content, s, NOW).creature.id, 'renyu');
});
