// 游荡的怪 (Hanli, 2026-10-05: 一片地方一个游荡怪物池，可重复打): a stretch of country shares
// one pool of beasts (places/<p>.json `pools`, a place's `has.pool`); one is up at a time,
// fought as often as he likes — each settle draws the next — and paid by the haunt table.
// Bosses stay the story's one fight. 卷一's beasts, and a few added from 《山海经 · 北次三经》.
import { lookahead } from '../scripts/fightline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { act, battle, begin, foeTurn, offers, tokenOf } from '../scripts/battle.js';
import { duel, look } from '../scripts/rules.mjs';
import { allPlaces, encounterOf, foeOf, poolOf } from '../scripts/rules/world.mjs';
import { fightSetup } from '../scripts/rules/cards.mjs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const content = loadContent();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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
    // A player who thinks a turn ahead (fightline.js lookahead): the fights are tuned
    // to be lost by a careless line (tests/fight-band.test.mjs).
    const pick = line === 'pass' ? { kind: 'end' } : lookahead(st, { deep: true }), best = pick.kind === 'end' ? null : { action: pick };
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
  assert.deepEqual([...pooled].sort(), ['gui', 'heyu', 'lang', 'linghu', 'longzhi', 'qiuyu', 'renyu', 'tianma', 'xiong', 'yezhu', 'zheng',
    // 后山崖顶 grows with the 回 (2026-10-15, 不打重复的怪 — tests/bestiary.test.mjs)
    'chihu', 'shanli', 'mihou', 'fushe', 'congcong', 'xiegou', 'lingling', 'cangying', 'yuanhu', 'jingjing', 'chai', 'bibi', 'dangkang', 'geju', 'qique'].sort(), '+ 犰狳 and 合窳 in the 秘境\'s rooms (2026-10-15)');
  for (const id of pooled) {
    const c = content.creatures.creatures.find(x => x.id === id);
    assert.ok((c.juan ?? 1) === 1 && !c.person && !c.trial, id);
  }
  // The added beasts of 冀 are 《山海经》's, their lines quoted; found, not drawn — each wears a classical plate (2026-10-15).
  for (const id of ['tianma', 'linghu', 'renyu']) {
    const c = content.creatures.creatures.find(x => x.id === id);
    assert.match(c.source.zh, /北次三经/);
    assert.ok(c.quote.zh.includes(c.name.zh), `${id}'s quote names it`);
    assert.equal(c.unpainted, undefined);
    assert.ok(c.art && /Public domain/.test(c.art_source), `${id} wears its plate`);
    assert.ok(existsSync(join(ROOT, 'worlds/jiuding', c.art)), `${id}'s picture ships`);
  }
  // The 蒙山 hunter's beasts are ordinary animals, painted for the game.
  for (const id of ['yezhu', 'lang', 'xiong']) {
    const c = content.creatures.creatures.find(x => x.id === id);
    assert.ok(c.art && /FLUX/.test(c.art_source), `${id} is painted`);
    assert.ok(existsSync(join(ROOT, 'worlds/jiuding', c.art)), `${id}'s picture ships`);
  }
  // 天马 「其状如白犬而黑头」: white is 金 (Hanli 2026-10-05) — its root and its deck.
  const tianma = content.creatures.creatures.find(x => x.id === 'tianma'), catalogOf = id => content.cards.cards.find(x => x.id === id);
  assert.equal(tianma.root, 'metal');
  assert.ok(tianma.deck.every(id => catalogOf(id).element === 'metal'), 'a deck of 金');
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
    // A few wins in a row leave the stretch quiet for its rest (30 min; balance.json cooldowns.pool_rest_after, Hanli
    // 2026-10-27: 「做成打不完的」) — before that, the next beast stands at once.
    if (out.result.outcome === 'won' && s.duels['hunt:mengshan'].streak < content.balance.cooldowns.pool_rest_after) assert.ok(encounterOf(content, s, NOW), 'a win short of the streak: the next stands');
    if (out.result.outcome === 'won' && s.duels['hunt:mengshan'].streak >= content.balance.cooldowns.pool_rest_after) {
      assert.equal(encounterOf(content, s, NOW), null, 'quiet after the streak');
      s = { ...s, duels: { ...s.duels, 'hunt:mengshan': { ...s.duels['hunt:mengshan'], at: new Date(NOW.getTime() - 31 * 60000).toISOString() } } };
    }
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

test('狰 runs wild outside the herb garden — but once his 小狰 walks with him, it is never drawn there (Hanli, 2026-10-15: 「不是早就收服了?」)', () => {
  const draws = (cast) => Array.from({ length: 24 }, (_, n) => encounterOf(content, { ...at('houshan', { cast }), duels: { 'hunt:houshan': { day: dayKey(NOW), outcome: 'won', n } } }, NOW)?.creature.id);
  const wild = draws([]);
  assert.ok(wild.includes('zheng'), '狰 is drawn there before it is tamed');
  const found = { ...at('houshan'), duels: { 'hunt:houshan': { day: dayKey(NOW), outcome: 'won', n: wild.indexOf('zheng') } } };
  assert.equal(duel(found, content, ctx, { id: 'haunt:zheng' }).result.ok, true);
  const tamed = draws(['zheng']);
  assert.ok(!tamed.includes('zheng'), 'a tamed beast is never a pool\'s');
  assert.ok(tamed.every(Boolean), 'the rest of the pool still deals');
});

/* 蠪侄 and 狰 are the story's fights too (古三's wood, the 药园): the pool deals them its own
   deck, weighed in 蛫's band (Hanli 2026-10-05), and the scenes keep the creature's — declared on
   the pool entry (world.mjs foeOf), never by name in code. */
test('蠪侄 and 狰 of a pool fight with the pool\'s deck; their story fights keep their own', () => {
  const story = { longzhi: ['00-prologue', '00-longzhi'], zheng: ['00-waimen', 'wm-yaoyuan'] };
  for (const [id, place] of [['longzhi', 'shanlu'], ['zheng', 'houshan']]) {
    const own = content.creatures.creatures.find(c => c.id === id).deck;
    const entry = poolOf(content, allPlaces(content).find(p => p.id === place)).beasts.find(b => b.creature === id);
    assert.ok(entry.deck, `${id}: the pool declares its deck`);
    assert.notDeepEqual([...entry.deck].sort(), [...own].sort(), `${id}: the pool's deck is not the story's`);
    // The pool's door deals the pool's deck, and the save keeps it to the settle.
    let up = null;
    for (let n = 0; n < 16 && !up; n += 1) {
      const t = at(place, { duels: { [`hunt:${place}`]: { day: dayKey(NOW), outcome: 'won', n } } });
      if (encounterOf(content, t, NOW)?.creature.id === id) up = t;
    }
    assert.ok(up, `${id} is drawn at ${place}`);
    const started = duel(up, content, ctx, { id: `haunt:${id}` });
    assert.equal(started.result.ok, true, JSON.stringify(started.result));
    // …and grows with the party beside him (party.json `roaming`: its own cards again, per member).
    const more = (content.party.roaming?.cards ?? 0) * (started.result.duel.setup.you.party?.length ?? 0);
    const dealt = started.result.duel.setup.foe.deck;
    assert.deepEqual(dealt.slice(0, entry.deck.length), entry.deck, `${id}: the pool's door`);
    assert.equal(dealt.length, entry.deck.length + more, `${id}: the pool's deck, and ${more} more for the party`);
    assert.deepEqual(started.state.fight.setup.foe.deck, dealt, `${id}: kept on the save`);
    // The story's fight — the scene's own game, no \`hunt\` — deals its own deck (the scene's `foe.deck`, else
    // the creature's). 狰 is won at the 药园 with a 萝卜, not fought (cards.md § 1): its scene has no fight.
    const [ch, sc] = story[id];
    const game = content.chapters[ch].scenes[sc].exits.map(e => e.game).find(g => g?.creature === id);
    if (id === 'zheng') { assert.equal(game, undefined, '小狰 is won with a 萝卜'); continue; }
    assert.ok(game && !game.hunt, `${id}: ${sc} fights it`);
    const kept = game.foe?.deck ?? own;
    assert.deepEqual(foeOf(content, game).deck, kept, `${id}: ${sc} keeps its deck`);
    assert.deepEqual(fightSetup(content, at(place), foeOf(content, game), NOW, game.id).foe.deck, kept);
  }
});

test('an errand for a pool\'s beast points to its stretch', () => {
  const s = at('liuwan');
  const l = look(s, content, ctx);
  assert.ok((l.offers ?? []).some(o => o.id === 'ji-liuwan-renyu'));
  assert.equal(encounterOf(content, s, NOW).creature.id, 'renyu');
});
