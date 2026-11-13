// The pure helpers of tools/duel-audit.mjs (the card audit, 2026-11-12) and the --bare-gear strip of tools/story-fights.mjs.
// Fast on purpose: no long run lives here (the long runs are the tool's own).
import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetRow, cardPoints, carefulFor, effectValue, mirrorRate, paperTable, parTen, playSheets, ranks, scopeOf, sheetSetup, spearman, swapIns } from '../tools/duel-audit.mjs';
import { bareState, content, setupOf, FIGHTS, keyOf } from '../tools/story-fights.mjs';

const card = id => content.cards.cards.find(c => c.id === id);

test('points for the cost: a 3-damage blow at 2 is 1.25, a plain 1/2 at 1 is a little under the curve, a sweep is weighed per target', () => {
  assert.equal(cardPoints(card('huodan')).points, 1.25);
  assert.equal(cardPoints(card('xiaoyao')).points, 0.94);
  assert.equal(cardPoints(card('jinzhen')).points, 0.95); // sweep 2 at 3: 2 per target ÷ (0.7 × 3 × ...) = 4 / 4.2
  assert.equal(effectValue({ damage: 2, draw: 1 }), 3.2);
  assert.equal(cardPoints({ kind: 'minion', cost: 2, atk: 1, hp: 4, keywords: ['taunt'] }).points, 1.36); // 护主 is +1
});

test('the table holds only what can be in a deck, best value first', () => {
  const rows = paperTable();
  assert.ok(rows.length > 60);
  for (const bad of ['tengmiao_token', 'yijian', 'tuna', 'huiqi', 'tama-fu', 'niangbing']) assert.ok(!rows.some(r => r.id === bad), bad);
  assert.ok(rows.every((r, i) => !i || rows[i - 1].points >= r.points));
});

test('ranks share ties and spearman reads order only', () => {
  assert.deepEqual(ranks([5, 3, 3, 1]), [1, 2.5, 2.5, 4]);
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  assert.equal(spearman([1, 1, 1], [1, 2, 3]), 0);
});

test('the par ten follows the cost curve and never holds a card kept out; a swap takes the slots of its own cost', () => {
  const table = paperTable(), out = new Set(table.slice(0, 15).map(r => r.id));
  const ten = parTen(table, out);
  assert.equal(ten.length, 10);
  assert.ok(ten.every(id => !out.has(id)));
  assert.deepEqual(ten.map(id => card(id).cost), [1, 1, 2, 2, 2, 3, 3, 4, 4, 5]);
  assert.deepEqual(parTen(table, out, { bodies: true }).map(id => card(id).kind), Array(10).fill('minion'));
  const runs = swapIns(ten, card('huochai')); // cost 4: two slots
  assert.equal(runs.length, 2);
  assert.ok(runs.every(r => r.deck.includes('huochai') && r.deck.length === 10));
  assert.equal(swapIns(ten, card('liaotian')).length, 1); // cost 6 takes the dearest slot (5)
});

test('the careful line plays either seat to an end, and the same deal plays the same', () => {
  const ten = parTen(paperTable());
  const a = playSheets(ten, ten, 'mirror|1'), b = playSheets(ten, ten, 'mirror|1');
  assert.notEqual(a.outcome, 'open');
  assert.equal(a.outcome, b.outcome);
  assert.equal(a.turn, b.turn);
  const st = playSheets(ten, ten, 'mirror|2');
  assert.equal(carefulFor(st, st.whose), null); // a finished fight offers nothing
});

test('a mirror of a deck against itself is a coin: with the seats swapped it lands near even', () => {
  const ten = parTen(paperTable()), m = mirrorRate(ten, ten, 6);
  assert.equal(m.games, 12);
  assert.ok(m.win > 0.2 && m.win < 0.8, `win ${m.win}`);
});

test('--bare-gear: nothing worn, no talisman in the bag, no pill picked; default leaves the setup as it was', () => {
  const f = FIGHTS.find(x => keyOf(x) === 'qiuyu@09-lingcao/fight'), g = FIGHTS.find(x => keyOf(x) === 'heyu@mijing-anhe');
  const worn = setupOf(f, { party: [] }), bare = setupOf(f, { party: [], bare: true });
  assert.ok(worn.you.power > 0 && worn.you.armor > 0);
  assert.ok(!bare.you.power && !bare.you.armor && !bare.you.ward);
  assert.deepEqual(worn.foe, setupOf(f, { party: [], bare: false }).foe);
  assert.deepEqual(setupOf(g, { party: [] }).you.extra, ['tama-fu']);
  assert.deepEqual(setupOf(g, { party: [], bare: true }).you.extra, []);
  const st = bareState({ wear: { robe: 'grey-robe' }, bag: { 'grey-robe': 1, 'tama-fu': 1, stone: 3 }, pill_pick: ['mend-pill'] }, ['tama-fu']);
  assert.deepEqual(st, { wear: {}, bag: { stone: 3 } });
});

test('scope: the 卷一 ordinary deck cards, and why a card is left out', () => {
  const why = id => scopeOf(card(id));
  assert.equal(why('huodan').in, true);
  assert.equal(why('zheng').in, true); // a 卷一 legend, tamed
  assert.equal(why('huochai').why, 'no source'); // a gear's card
  assert.equal(why('yinyue').why, 'owner');
  assert.equal(why('wulei').why, 'foe art');
  assert.equal(why('tuou').why, 'foe art');
  assert.equal(why('bashe').why, 'later 卷');
});

test('sheets: a level is 20 + L 气血 and the realm of its level; fatigue off is the setup\'s own flag, on both seats', () => {
  const ten = parTen(paperTable());
  const s = sheetSetup(ten, ten, 'x', { levelYou: 9, levelFoe: 10, fatigue: false });
  assert.deepEqual([s.you.base, s.you.tier, s.foe.hp_fixed, s.foe.tier], [29, 'qi', 30, 'foundation']);
  assert.equal(s.you.fatigue, false);
  assert.equal(s.foe.fatigue, false);
  assert.equal(sheetSetup(ten, ten, 'x').you.fatigue, undefined);
});

test('the lookahead line plays either seat to an end; a level up is a seat with more 气血', () => {
  const ten = parTen(paperTable());
  assert.notEqual(playSheets(ten, ten, 'mirror|3', { line: 'lookahead' }).outcome, 'open');
  const m = mirrorRate(ten, ten, 3, { level: 5, levelB: 7 });
  assert.equal(m.games, 6);
});

test('deck cost by level: the beast ten is counted against the budget', () => {
  const f = FIGHTS.find(x => keyOf(x) === 'gui@sishui'), r = budgetRow(f);
  assert.equal(r.size, 10);
  assert.equal(r.diff, r.its - r.his);
  assert.equal(r.budget, Math.round(13 + 1.5 * r.foeLevel));
});
