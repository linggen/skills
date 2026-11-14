// The pure helpers of tools/duel-audit.mjs (the card audit, 2026-11-12) and the --bare-gear strip of tools/story-fights.mjs.
// Fast on purpose: no long run lives here (the long runs are the tool's own).
import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetRow, cardPoints, carefulFor, effectValue, mirrorRate, paperTable, parTen, playSheets, ranks, scopeOf, sheetSetup, spearman, swapIns } from '../tools/duel-audit.mjs';
import { bareState, content, setupOf, roadState, foeOf, FIGHTS, keyOf } from '../tools/story-fights.mjs';
import { fightLevel, foeLevel } from '../scripts/rules/cards.mjs';
import { act, begin, foeStep, foeTurn, legal, simCopy } from '../scripts/battle.js';
import { lookaheadFor, mixFor, plainFor, movesOf } from '../scripts/fightline.js';

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
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

test('deck cost by level reports the current fair deck and historical budget', () => {
  const f = FIGHTS.find(x => keyOf(x) === 'gui@sishui'), r = budgetRow(f);
  assert.ok(r.size <= 15);
  assert.equal(r.diff, r.its - r.his);
  assert.equal(r.budget, Math.round(13 + 1.5 * r.foeLevel));
});

test('the fit: a gear multiplier rounds a worn thing\'s points to whole numbers and only where the even switch stands', async () => {
  const { withRules, EVEN, FIT } = await import('../tools/duel-lines.mjs');
  const f = FIGHTS.find(x => keyOf(x) === 'qiuyu@09-lingcao/fight');
  const at = (on, knobs) => withRules(on, () => { const s = setupOf(f, { party: [] }); return [s.you.power ?? 0, s.you.armor ?? 0]; }, knobs);
  assert.deepEqual(at(false, { gear: 0.25 }), at(false, {})); // switch off: the knob is not read
  const whole = at(true, {});
  assert.deepEqual(at(true, { gear: 0.5 }), whole.map(n => Math.round(n * 0.5)));
  assert.deepEqual(at(true, { gear: 0.25 }), whole.map(n => Math.round(n * 0.25)));
  assert.ok(EVEN && typeof FIT.gear === "number");
});

test('the fit: a beast\'s level steps by class and never leaves his realm', async () => {
  const { withRules } = await import('../tools/duel-lines.mjs');
  const { beastLevel, beastClamp } = await import('../scripts/rules/cards.mjs');
  const f = FIGHTS.find(x => keyOf(x) === 'cangying@yaoyuan-wai'), st = roadState(f, {}), beast = foeOf(f);
  const classes = [[1.3, 'weak'], [2.5, 'normal']];
  withRules(true, () => {
    assert.equal(beastLevel(content, st, beast), foeLevel(content, st, beast) + 1);
    assert.equal(beastClamp(content, st, beast), false);
  }, { by_hp: classes, step: { normal: 1 } });
  withRules(true, () => {
    assert.equal(beastLevel(content, st, beast), Math.min(foeLevel(content, st, beast) + 9, 9)); // the qi realm ends at 9
    assert.equal(beastClamp(content, st, beast), true);
  }, { by_hp: classes, step: { normal: 9 } });
  assert.equal(fightLevel(content, st), fightLevel(content, st));
});

test('the lines are seat-symmetric: asked for the foe seat they read the foe\'s hand, 灵力 and the other board', () => {
  const ten = parTen(paperTable());
  const st = begin(sheetSetup(ten, ten, 'seat|1'), catalog);
  act(st, { kind: 'end' }, 'you'); // the foe's turn
  assert.equal(st.whose, 'foe');
  for (const line of [carefulFor, lookaheadFor, plainFor]) {
    const a = line(st, 'foe');
    if (a) assert.equal(legal(st, a, 'foe'), null, `${line.name} gave a move the foe seat may not make`);
    if (a?.kind === 'play') assert.ok(st.foe.hand[a.index], 'a card of the foe\'s own hand');
  }
  assert.ok(movesOf(st, 'foe').every(a => legal(st, a, 'foe') === null));
  assert.equal(movesOf(st, 'you').length, 0); // it is not his turn
});

test('a beast seat named by `ai` plays that line; with none named the foe policy plays as it did', () => {
  const ten = parTen(paperTable());
  const play = ai => { const st = begin({ ...sheetSetup(ten, ten, 'ai|1'), foe: { ...sheetSetup(ten, ten, 'ai|1').foe, ...(ai ? { ai } : {}) } }, catalog); for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) { if (st.whose === 'foe') foeTurn(st); else act(st, carefulFor(st, 'you') ?? { kind: 'end' }, 'you'); } return st; };
  const base = play(null), again = play(null), careful = play('careful'), look = play('lookahead');
  assert.deepEqual([base.outcome, base.turn], [again.outcome, again.turn]);
  for (const st of [careful, look]) assert.notEqual(st.outcome, 'open');
  assert.equal(simCopy(begin({ ...sheetSetup(ten, ten, 'ai|2'), foe: { ...sheetSetup(ten, ten, 'ai|2').foe, ai: 'careful' } }, catalog)).foe.ai, null); // a thinking copy holds the base policy
});

test('the fit, third try: the beast\'s line follows its level, the class shifts a rung, and it stays on the three lines', async () => {
  const { lineByLevel, LINE_LADDER } = await import('../scripts/rules/cards.mjs');
  const ai = { by_level: [3, 7], class_step: { weak: -1, normal: 0, strong: 1 } };
  const at = (level, rank) => lineByLevel(ai, level, rank);
  assert.deepEqual([1, 3, 7].map(l => at(l, 'normal')), ['foe', 'careful', 'lookahead']); // the thresholds are inclusive
  assert.deepEqual([1, 3, 7].map(l => at(l, 'weak')), ['foe', 'foe', 'careful']); // weak: a rung down, clamped at the foe policy
  assert.deepEqual([1, 3, 7].map(l => at(l, 'strong')), ['careful', 'lookahead', 'lookahead']); // strong: a rung up, clamped at lookahead
  assert.equal(lineByLevel({ weak: 'careful' }, 5, 'weak'), 'careful'); // the by-class shape still reads
  assert.equal(lineByLevel(undefined, 5, 'weak'), null);
  assert.deepEqual(LINE_LADDER, ['foe', 'careful', 'lookahead']);
});

test('a proposal weighed in memory: withCards changes card fields for one run and puts them back', async () => {
  const { withCards } = await import('../tools/duel-lines.mjs');
  const before = [content.cards.cards.find(c => c.id === 'huochai').atk, content.cards.cards.find(c => c.id === 'huochai').hp];
  withCards({ huochai: { atk: 4, hp: 3 } }, () => assert.deepEqual([card('huochai').atk, card('huochai').hp], [4, 3]));
  assert.deepEqual([card('huochai').atk, card('huochai').hp], before);
  assert.throws(() => withCards({ nope: { atk: 1 } }, () => 0), /no card/);
});

test('the third fit through the real door: the beast\'s seat is named by its level and class, only where the even switch stands', async () => {
  const { withRules, FIT_BY_LEVEL: FIT } = await import('../tools/duel-lines.mjs');
  const line = key => setupOf(FIGHTS.find(x => keyOf(x) === key), { party: [] }).foe.ai ?? 'foe';
  const keys = ['yezhu@mengshan', 'lang@mengshan', 'gui@sishui']; // weak at level 1 · normal at 2 · strong at 10 (+1)
  assert.deepEqual(keys.map(k => withRules(false, () => line(k), FIT)), ['foe', 'foe', 'foe']); // switch off: nothing is read
  assert.deepEqual(keys.map(k => withRules(true, () => line(k), FIT)), ['careful', 'lookahead', 'lookahead']);
});

test('the fourth fit: skill by standing is read off the data, set by the door, and only where the even switch stands', async () => {
  const { lineByStanding, beastLevel } = await import('../scripts/rules/cards.mjs');
  const { standingOf, foeOf: foeAt, roadState: roadAt } = await import('../tools/story-fights.mjs');
  const { withRules, FIT } = await import('../tools/duel-lines.mjs');
  const by = FIT.ai.by_standing;
  assert.deepEqual([[1, 'roaming'], [4, 'roaming'], [5, 'roaming'], [9, 'roaming']].map(([l, s]) => lineByStanding(by, s, l)), ['foe', 'foe', 'careful', 'careful']); // careful from 练气五层
  assert.deepEqual(['room', 'xiong', 'boss', 'story', 'nothing'].map(s => lineByStanding(by, s, 3)), ['foe', 'lookahead', 'lookahead', 'foe', null]);
  const at = key => FIGHTS.find(x => keyOf(x) === key);
  assert.deepEqual(['lang@mengshan', 'qiuyu@mijing-anhe', 'heyu@mijing-anhe', 'qiuyu@mijing-ya', 'gui@wm-wangzuo/open', 'qiuyu@09-lingcao/fight', 'foe-yinhu@00-fox/save'].map(k => standingOf(at(k))),
    ['roaming', 'room', 'xiong', 'xiong', 'story', null, null]); // a marked fight (band · teach · trial) keeps its own say; a scene is the story's
  const line = key => setupOf(at(key), { party: [] }).foe.ai ?? 'foe';
  const keys = ['lang@mengshan', 'renyu@sishui', 'qiuyu@mijing-anhe', 'heyu@mijing-anhe', 'gui@wm-wangzuo/open', 'qiuyu@09-lingcao/fight'];
  assert.deepEqual(keys.map(k => withRules(false, () => line(k), FIT)), keys.map(() => 'foe')); // switch off: nothing is read
  assert.deepEqual(keys.map(k => withRules(true, () => line(k), FIT)), ['foe', 'careful', 'foe', 'lookahead', 'foe', 'careful']);
  // The game's own door stamps the standing (rules/world.mjs foeOf), only with the switch on.
  const { gameFoe } = await import('../scripts/rules/world.mjs');
  const games = [{ creature: 'lang', hunt: 'mengshan' }, { creature: 'gui' }, { creature: 'heyu', mijing: true, standing: 'xiong' }];
  assert.deepEqual(games.map(g => withRules(false, () => gameFoe(content, g).standing, FIT)), [undefined, undefined, undefined]);
  assert.deepEqual(games.map(g => withRules(true, () => gameFoe(content, g).standing, FIT)), ['roaming', 'story', 'xiong']);
  // The ruling changes no level.
  const boss = at('gui@wm-wangzuo/open'), st = roadAt(boss, {}), b = foeAt(boss);
  withRules(true, () => assert.equal(beastLevel(content, st, b), foeLevel(content, st, b)), FIT);
});

test('mix endpoints, deterministic coin and registry on both seats', () => {
  const ten = parTen(paperTable());
  for (let i = 0; i < 3; i++) {
    const st = begin(sheetSetup(ten, ten, `find|${i}`), catalog);
    for (const who of ['you', 'foe']) {
      if (who === 'foe') act(st, { kind: 'end' }, 'you');
      assert.deepEqual(mixFor(st, who, { wit: 0 }), carefulFor(st, who));
      assert.deepEqual(mixFor(st, who, { wit: 1 }), lookaheadFor(st, who));
      assert.deepEqual(mixFor(st, who, { wit: 0.3 }), mixFor(st, who, { wit: 0.3 }));
    }
  }
  const setup = sheetSetup(ten, ten, 'registry');
  setup.foe.ai = 'mix'; setup.foe.wit = 0;
  const st = begin(setup, catalog); act(st, { kind: 'end' }, 'you');
  const expected = carefulFor(st, 'foe');
  assert.deepEqual(foeStep(st), expected ?? { kind: 'end' });
  assert.throws(() => mixFor(st, 'foe', { wit: 2 }), /wit/);
});

test('mix chooses lookahead at approximately its wit when the lines differ', () => {
  const ten = parTen(paperTable()), st = begin(sheetSetup(ten, ten, 'find|0'), catalog);
  const careful = carefulFor(st), look = lookaheadFor(st);
  assert.notDeepEqual(careful, look);
  let chosen = 0;
  for (let i = 0; i < 400; i++) {
    st.turnMoves = i;
    if (JSON.stringify(mixFor(st, 'you', { wit: 0.3 })) === JSON.stringify(look)) chosen++;
  }
  assert.ok(Math.abs(chosen / 400 - 0.3) < 0.04, `share ${chosen / 400}`);
});
