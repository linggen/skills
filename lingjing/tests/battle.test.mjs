// 斗法 v3 — the card game's rules, held to what design.md says they are.
// Cards here are fixtures: the engine must not care which cards exist, only
// that a card is a row of data with one effect from the closed vocabulary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, EFFECTS, MODES, OVER, POWER_COST, REALMS, UNDER, act, battle, begin, bodyOf, clash, foeTurn, legal, offers, shuffle, suppression, view } from '../scripts/battle.js';

const CARDS = {
  // 随从
  deer: { id: 'deer', kind: 'minion', name: '夫诸', cost: 3, element: 'water', atk: 3, hp: 4 },
  guard: { id: 'guard', kind: 'minion', name: '山鬼', cost: 2, element: 'earth', atk: 1, hp: 4, keywords: ['taunt'] },
  crier: { id: 'crier', kind: 'minion', name: '银月', cost: 2, element: 'metal', atk: 3, hp: 4, keywords: ['battlecry'], effect: { heal: 2 } },
  cub: { id: 'cub', kind: 'minion', name: '小妖', cost: 1, element: 'wood', atk: 1, hp: 1 },
  kui5: { id: 'kui5', kind: 'minion', name: '夔', cost: 5, element: 'water', atk: 4, hp: 6, keywords: ['taunt'] },
  // 功法
  bolt: { id: 'bolt', kind: 'spell', name: '火弹术', cost: 2, element: 'fire', effect: { damage: 3 } },
  rain: { id: 'rain', kind: 'spell', name: '金针雨', cost: 3, element: 'metal', effect: { sweep: 2 } },
  study: { id: 'study', kind: 'spell', name: '悟道', cost: 1, element: null, effect: { draw: 2 } },
  grow: { id: 'grow', kind: 'spell', name: '培元', cost: 1, element: 'wood', effect: { buff: { atk: 1, hp: 1 } } },
};

const deck = (...ids) => ids;
const setupOf = (over = {}) => ({
  mode: 'pve', seed: 'seed-1',
  you: { tier: 'qi', step: 0, root: 'fire', deck: deck('bolt', 'deer', 'guard', 'cub', 'study', 'rain', 'grow', 'crier', 'cub', 'bolt') },
  foe: { tier: 'qi', root: 'wood', deck: deck('cub', 'cub', 'deer', 'cub', 'guard', 'cub', 'cub', 'deer') },
  ...over,
});

/* A fight begun by hand, so a test can put the board where it wants it. */
function opened(over = {}, hand = null) {
  const st = begin(setupOf(over), CARDS);
  if (hand) st.you.hand = [...hand];
  return st;
}

test('the shuffle is the seed: two runs of the same fight deal the same cards', () => {
  const a = shuffle(['a', 'b', 'c', 'd', 'e', 'f'], 'day|kui|qingxuan');
  const b = shuffle(['a', 'b', 'c', 'd', 'e', 'f'], 'day|kui|qingxuan');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, shuffle(['a', 'b', 'c', 'd', 'e', 'f'], 'day|kui|other'));
  assert.deepEqual([...a].sort(), ['a', 'b', 'c', 'd', 'e', 'f'], 'every card is still in there');
});

test('五行: a blow lands heavier into what it overcomes and lighter into what overcomes it', () => {
  // ×1.5 / ×0.75, not double and half: at double, the deck of the countering
  // root won 92.9% and the countered one 18.3% — choosing the root played the
  // game for you (the gate, 2026-09-18).
  assert.deepEqual([OVER, UNDER], [1.5, 0.75]);
  assert.equal(clash('metal', 'wood'), OVER, '金克木');
  assert.equal(clash('wood', 'metal'), UNDER);
  assert.equal(clash('water', 'metal'), 1, 'neither way: 金生水, but 生 is not 克');
  assert.equal(clash('water', 'earth'), UNDER, '土克水, so water into earth lands lighter');
  for (const [element, beaten] of Object.entries(BEATS)) assert.equal(clash(element, beaten), OVER, element);
});

test('the opening: a hand each, you one card richer, and the first mana crystal', () => {
  const st = begin(setupOf(), CARDS);
  assert.equal(st.you.hand.length, MODES.pve.hand + MODES.pve.headStart, 'you are the protagonist: one card more');
  assert.equal(st.foe.hand.length, MODES.pve.foeHand);
  assert.equal(st.whose, 'you');
  // Two crystals on the first turn, not one: six turns is too short to spend
  // the first one passing (2026-09-18).
  assert.equal(st.you.manaMax, MODES.pve.startMana);
  assert.equal(st.you.mana, MODES.pve.startMana);
  assert.equal(MODES.pve.foeDeck, 12, 'twelve: at eight it ran dry before it could be beaten');
});

test('灵力 grows a crystal a round and refills, and a card that costs more waits', () => {
  const st = opened({}, ['kui5', 'cub']);
  assert.equal(legal(st, { kind: 'play', index: 0 }), 'no-mana', '夔 costs 5, the first round has 2');
  assert.equal(legal(st, { kind: 'play', index: 1 }), null);
  act(st, { kind: 'play', index: 1 });
  assert.equal(st.you.mana, 1);
  act(st, { kind: 'end' });
  while (st.whose === 'foe') { /* the creature's policy runs in battle(); here we just hand the turn back */ st.whose = 'you'; st.you.manaMax = Math.min(st.you.manaCap, st.you.manaMax + 1); st.you.mana = st.you.manaMax; }
  assert.equal(st.you.mana, MODES.pve.startMana + 1, 'refilled, one crystal richer');
});

test('a minion arrives winded, strikes once a round, and both sides take the blow', () => {
  const st = opened({}, ['deer']);
  st.you.mana = 9;
  act(st, { kind: 'play', index: 0 });
  assert.equal(legal(st, { kind: 'attack', index: 0 }), 'just-arrived');
  st.you.board[0].sick = false;
  st.foe.board.push({ id: 'guard', name: '山鬼', element: 'earth', atk: 1, hp: 4, hpMax: 4, taunt: true, sick: false, struck: false });
  act(st, { kind: 'attack', index: 0, target: { kind: 'minion', index: 0 } });
  assert.equal(st.foe.board[0].hp, 2, '水 3 into 土 is halved — 土克水');
  assert.equal(st.you.board[0].hp, 2, 'and the answer, 土 1 into 水, lands heavier');
  assert.equal(legal(st, { kind: 'attack', index: 0 }), 'already-struck');
});

test('护主 stands in the way of the hero, and of the hero power', () => {
  const st = opened({}, ['bolt']);
  st.you.mana = 9;
  st.you.board.push({ id: 'deer', name: '夫诸', element: 'water', atk: 3, hp: 4, hpMax: 4, taunt: false, sick: false, struck: false });
  st.foe.board.push({ id: 'guard', name: '山鬼', element: 'earth', atk: 1, hp: 4, hpMax: 4, taunt: true, sick: false, struck: false });
  assert.equal(legal(st, { kind: 'attack', index: 0 }), 'taunt');
  assert.equal(legal(st, { kind: 'power' }), 'taunt');
  assert.equal(legal(st, { kind: 'attack', index: 0, target: { kind: 'minion', index: 0 } }), null);
  // a 法术 may still be pointed where it likes
  assert.equal(legal(st, { kind: 'play', index: 0 }), null, 'a spell is not stopped by 护主');
});

test('入阵 fires on arrival, and a 功法 spends itself', () => {
  const st = opened({}, ['crier', 'bolt']);
  st.you.mana = 9;
  st.you.hp = st.you.hpMax - 5;
  act(st, { kind: 'play', index: 0 });
  assert.equal(st.you.hp, st.you.hpMax - 3, '入阵 healed 2');
  assert.equal(st.you.board.length, 1);
  const before = st.foe.hp;
  act(st, { kind: 'play', index: 0 }); // bolt is now index 0
  assert.equal(st.foe.hp, before - 3, '火 into 木 is neither way — 金克木, not 火');
  assert.equal(st.you.hand.length, 0, 'both cards are spent');
});

test('the closed vocabulary: sweep, draw and buff each do one thing', () => {
  const st = opened({}, ['rain', 'study', 'grow']);
  st.you.mana = 9;
  st.foe.board.push(
    { id: 'cub', name: '小妖', element: 'wood', atk: 1, hp: 1, hpMax: 1, taunt: false, sick: false, struck: false },
    { id: 'deer', name: '夫诸', element: 'water', atk: 3, hp: 4, hpMax: 4, taunt: false, sick: false, struck: false },
  );
  act(st, { kind: 'play', index: 0 });
  assert.equal(st.foe.board.length, 1, '金 2 doubled into 木 drove the cub off');
  assert.equal(st.foe.board[0].hp, 2, 'and 2 into 水 is 2');
  const hand = st.you.hand.length;
  act(st, { kind: 'play', index: 0 }); // study
  assert.equal(st.you.hand.length, hand - 1 + 2, 'drew two');
  st.you.board.push({ id: 'cub', name: '小妖', element: 'wood', atk: 1, hp: 1, hpMax: 1, taunt: false, sick: false, struck: false });
  const grow = st.you.hand.indexOf('grow');
  act(st, { kind: 'play', index: grow, target: { kind: 'minion', index: 0 } });
  assert.deepEqual([st.you.board[0].atk, st.you.board[0].hp], [2, 2]);
  assert.deepEqual(Object.keys(EFFECTS).sort(), ['buff', 'damage', 'draw', 'heal', 'rally', 'summon', 'sweep'], 'the vocabulary stays closed');
});

test('召唤 fills the bench to its limit; 齐心 lifts everyone standing', () => {
  const CARDS2 = {
    ...CARDS,
    sprout: { id: 'sprout', kind: 'spell', name: '春生', cost: 3, element: 'wood', effect: { summon: { id: 'cub', n: 3 } } },
    rally: { id: 'rally', kind: 'spell', name: '风茂', cost: 3, element: 'wood', effect: { rally: { atk: 1, hp: 1 } } },
  };
  const st = begin({ ...setupOf(), you: { ...setupOf().you, deck: ['sprout'] } }, CARDS2);
  st.you.hand = ['sprout', 'rally'];
  st.you.mana = 9;
  act(st, { kind: 'play', index: 0 });
  assert.equal(st.you.board.length, 3, 'three arrived');
  assert.ok(st.you.board.every(m => m.sick), 'and every one of them is winded');
  act(st, { kind: 'play', index: 0 });
  assert.deepEqual(st.you.board.map(m => [m.atk, m.hp]), [[2, 2], [2, 2], [2, 2]]);
  // the bench holds three, no more
  st.you.hand = ['sprout'];
  act(st, { kind: 'play', index: 0 });
  assert.equal(st.you.board.length, MODES.pve.board, 'the bench holds what the mode says, no more');
});

test('主灵根一击: once a round, two 灵力, and it wears the player\'s own root', () => {
  const st = opened({}, []);
  st.you.mana = 9;
  const before = st.foe.hp;
  act(st, { kind: 'power' });
  assert.equal(st.foe.hp, before - REALMS.qi.power, '火 into 木 is neither way');
  assert.equal(st.you.mana, 9 - POWER_COST);
  assert.equal(legal(st, { kind: 'power' }), 'power-used');
});

test('反噬: a deck run dry costs one, then two, then three', () => {
  const st = opened({}, []);
  st.you.deck = [];
  st.foe.deck = ['cub', 'cub', 'cub', 'cub'];
  const hp = st.you.hp;
  const round = () => { act(st, { kind: 'end' }, 'you'); act(st, { kind: 'end' }, 'foe'); };
  round();
  assert.equal(st.you.hp, hp - 1, 'the first draw on an empty deck costs one');
  round();
  assert.equal(st.you.hp, hp - 3, 'then two');
  round();
  assert.equal(st.you.hp, hp - 6, 'then three');
  assert.equal(st.you.fatigue, 3);
});

test('a minion at 0 withdraws — nothing in this world dies', () => {
  const st = opened({}, ['bolt']);
  st.you.mana = 9;
  st.foe.board.push({ id: 'cub', name: '小妖', element: 'wood', atk: 1, hp: 1, hpMax: 1, taunt: false, sick: false, struck: false });
  act(st, { kind: 'play', index: 0, target: { kind: 'minion', index: 0 } });
  assert.equal(st.foe.board.length, 0);
  assert.ok(st.log.some(l => l.act === 'withdrew'), 'the log says withdrew');
  assert.ok(!st.log.some(l => String(l.act).includes('kill') || String(l.act).includes('death')));
});

test('境界压制 is PvE only: a realm above lands harder and takes less', () => {
  assert.deepEqual(suppression('core', 'foundation'), [1.5, 0.7]);
  assert.deepEqual(suppression('core', 'qi'), [2, 0.5]);
  assert.deepEqual(suppression('qi', 'core'), [0.5, 2], 'a challenge above your station bites');
  assert.deepEqual(suppression('qi', 'qi'), [1, 1]);
  const pve = begin(setupOf({ you: { tier: 'core', root: 'fire', deck: ['bolt'] }, foe: { tier: 'qi', root: 'wood', deck: ['cub'] } }), CARDS);
  assert.deepEqual(pve.scale, { you: 2, foe: 0.5 });
  const pvp = begin(setupOf({ mode: 'pvp', you: { tier: 'core', root: 'fire', deck: ['bolt'] }, foe: { tier: 'qi', root: 'wood', deck: ['cub'] } }), CARDS);
  assert.deepEqual(pvp.scale, { you: 1, foe: 1 }, 'PvP is level: fairness comes from the curve, not the realm');
});

test('the creature plays its own eight cards and the fight ends inside eight rounds', () => {
  // A player who does nothing but end the turn still reaches an end: the
  // creature runs its deck dry and withdraws, or it wins.
  const out = battle(Array.from({ length: 30 }, () => ({ kind: 'end' })), setupOf(), CARDS);
  assert.notEqual(out.outcome, 'open', 'no fight runs forever');
  assert.ok(out.turn <= 20, `ended in ${out.turn} half-turns`);
});

test('offers draws every choice with its why, and refuses nothing silently', () => {
  const st = opened({}, ['deer', 'bolt', 'grow']);
  const all = offers(st);
  // 培元 wants a friendly minion and the rank is empty: it still gets a row,
  // or the card face would have no refusal to draw and would look playable.
  const grow = all.find(o => o.id === 'grow');
  assert.equal(grow.why, 'no-friendly');
  assert.ok(all.some(o => o.action.kind === 'end' && o.ok), 'ending the turn is always there');
  const deer = all.find(o => o.id === 'deer');
  assert.equal(deer.why, 'no-mana', 'a card out of reach says why, on the card');
  for (const o of all) assert.ok(o.ok === (o.why === null), 'ok and why never disagree');
});

test('a refused action changes nothing and says which action it was', () => {
  const out = battle([{ kind: 'attack', index: 0 }], setupOf(), CARDS);
  assert.equal(out.refused.why, 'not-on-board');
  assert.equal(out.outcome, 'open');
});

test('view hands the page what it draws, and never the deck itself', () => {
  const v = view(begin(setupOf(), CARDS));
  assert.equal(typeof v.foe.deck, 'number', 'the creature\'s deck is a count, not a list');
  assert.ok(Array.isArray(v.you.hand), 'your own hand is yours to see');
  assert.deepEqual(Object.keys(v).sort(), ['foe', 'log', 'outcome', 'scale', 'turn', 'whose', 'you']);
});

/* 杀招 (battle.js § 杀招): at half its 气血 the beast gathers, spends its next
   turn playing nothing, and lets go the turn after — once, the blow taking a
   护主 first. The page draws the numbers from the same rules. */
const SIG = { id: 'thunder', name: { zh: '雷霆', en: 'Thunderclap' }, effect: { damage: 6 } };
const sigFight = (over = {}) => opened({ foe: { tier: 'qi', root: 'wood', deck: deck('cub', 'cub', 'deer', 'cub', 'guard', 'cub', 'cub', 'deer'), signature: SIG, ...over } });

test('杀招: the beast gathers at half its 气血, plays nothing that turn, and lets go the turn after — once', () => {
  const st = sigFight();
  st.you.mana = 9;
  st.you.hand = ['bolt', 'bolt', 'bolt'];
  const half = st.foe.hpMax / 2;
  while (st.foe.hp > half) assert.ok(act(st, { kind: 'play', index: 0 }, 'you').ok);
  assert.equal(view(st).foe.charge, 'gathering');
  assert.ok(st.log.some(t => t.act === 'charge' && t.id === 'thunder'));
  const handBefore = st.foe.hand.length;
  const hpBefore = st.you.hp;
  act(st, { kind: 'end' }, 'you');
  {
    foeTurn(st);
    assert.equal(st.foe.hand.length, handBefore + 1, 'it drew and played nothing while gathering');
    assert.equal(st.foe.played.length, 0);
    assert.equal(st.you.hp, hpBefore, 'nothing has landed yet');
    assert.equal(view(st).foe.charge, 'ready');
    act(st, { kind: 'end' }, 'you'); // the key turn, spent doing nothing
    assert.equal(st.you.hp, hpBefore - 6, 'it let go at the start of its turn');
    assert.equal(view(st).foe.charge, 'spent');
    foeTurn(st);
    act(st, { kind: 'end' }, 'you');
    assert.equal(st.log.filter(t => t.act === 'unleash').length, 1, 'once a fight');
  }
});

test('杀招: a 护主 standing when it lets go takes the blow', () => {
  const st = sigFight();
  st.you.mana = 9;
  st.you.hand = ['bolt', 'bolt', 'bolt', 'guard'];
  while (st.foe.hp > st.foe.hpMax / 2) act(st, { kind: 'play', index: 0 }, 'you');
  act(st, { kind: 'end' }, 'you');
  foeTurn(st);
  const i = st.you.hand.indexOf('guard');
  st.you.mana = 9;
  assert.ok(act(st, { kind: 'play', index: i }, 'you').ok);
  const hp = st.you.hp;
  act(st, { kind: 'end' }, 'you');
  assert.equal(st.you.hp, hp, 'the hero untouched');
  assert.ok(st.log.some(t => t.act === 'withdrew' && t.id === 'guard'), 'the guard took 6 and went down');
});

test('杀招: a fight locked without one never gathers — old setups replay as they were', () => {
  const st = opened();
  st.you.mana = 9;
  st.you.hand = ['bolt', 'bolt', 'bolt'];
  for (let i = 0; i < 3; i += 1) act(st, { kind: 'play', index: 0 }, 'you');
  assert.equal(view(st).foe.charge, null);
  assert.ok(!st.log.some(t => t.act === 'charge'));
});

test('lifts: a body stands taller for one side — on the board and on the hand\'s face alike', () => {
  const st = opened({ you: { tier: 'qi', step: 0, root: 'fire', deck: deck('bolt'), lifts: { deer: { atk: 1, hp: 2 } } } }, ['deer', 'cub']);
  st.you.mana = 9;
  assert.deepEqual(bodyOf(st.you, CARDS.deer), { atk: 4, hp: 6 });
  assert.deepEqual(bodyOf(st.you, CARDS.cub), { atk: 1, hp: 1 }, 'only the card it names');
  act(st, { kind: 'play', index: 0 }, 'you');
  assert.deepEqual([st.you.board[0].atk, st.you.board[0].hp, st.you.board[0].hpMax], [4, 6, 6]);
  assert.deepEqual(view(st).you.lifts, { deer: { atk: 1, hp: 2 } });
  assert.deepEqual(bodyOf(st.foe, CARDS.deer), { atk: 3, hp: 4 }, 'the other side untouched');
});
