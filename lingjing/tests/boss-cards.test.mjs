// The ten chapter bosses' cards (2026-09-25): each carries its legend as a
// verb — 锁 (无支祁), 吞 (巴蛇), 灵力 −1 (夔's drum), 大旱 (肥遗) are new to
// the fight; the rest use the verbs that were there. The rules, the beast's
// aim, the player's aim, and the words on the card, zh and en.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, begin, foeTurn, legal, offers, view } from '../scripts/battle.js';
import { WORDS, battleHtml, pickOf, sayEffect, wantsTarget } from '../scripts/battle-card.js';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const WORLD = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));

const CARDS = {
  cub: { id: 'cub', kind: 'minion', name: '小妖', cost: 1, element: null, atk: 1, hp: 2 },
  brute: { id: 'brute', kind: 'minion', name: '蛮', cost: 4, element: null, atk: 5, hp: 5 },
  chain: { id: 'chain', kind: 'minion', name: '无支祁', cost: 1, element: null, atk: 2, hp: 2, keywords: ['battlecry'], effect: { chain: 1 } },
  swallow: { id: 'swallow', kind: 'minion', name: '巴蛇', cost: 1, element: null, atk: 2, hp: 2, keywords: ['battlecry'], effect: { swallow: 3 } },
  drum: { id: 'drum', kind: 'minion', name: '夔', cost: 1, element: null, atk: 2, hp: 2, keywords: ['taunt', 'battlecry'], effect: { drain: 1 } },
  drought: { id: 'drought', kind: 'minion', name: '肥遗', cost: 1, element: null, atk: 1, hp: 3, effect: { drought: 1 } },
};
const filler = Array(12).fill('cub');

/* A fight at even realms with nothing in the way: hands and ranks set by hand. */
function opened(hand = [], foeBoard = []) {
  const st = begin({ mode: 'pve', seed: 's', you: { tier: 'core', root: null, deck: filler.slice(0, 10) }, foe: { tier: 'core', root: null, deck: filler } }, CARDS);
  st.you.hand = [...hand];
  st.you.mana = st.you.manaMax = 10;
  st.foe.board = foeBoard.map(id => ({ id, name: CARDS[id].name, element: null, atk: CARDS[id].atk, hp: CARDS[id].hp, hpMax: CARDS[id].hp, taunt: false, sick: false, struck: false }));
  return st;
}
const endBoth = st => { act(st, { kind: 'end' }); foeTurn(st); };

test('锁: the chained body sits out its next turn — exactly that one — and strikes the turn after', () => {
  const st = opened(['chain'], ['brute']);
  assert.ok(act(st, { kind: 'play', index: 0, target: { kind: 'minion', index: 0 } }).ok);
  assert.ok(st.log.some(t => t.act === 'chained' && t.who === 'foe'));
  assert.equal(view(st).foe.board[0].chained, true, 'the page can show it');
  const before = st.you.hp;
  act(st, { kind: 'end' });
  assert.equal(legal(st, { kind: 'attack', index: 0 }, 'foe'), 'chained', 'refused by name while held');
  foeTurn(st);
  assert.equal(st.you.hp, before, 'the chained brute struck nothing on its turn');
  endBoth(st);
  assert.ok(st.you.hp < before, 'the turn after, it strikes again');
  assert.equal(view(st).foe.board[0]?.chained ?? false, false);
});

test('吞: only a body with 攻 ≤ its number; a bigger one is refused by name, and while one fits the card must be aimed', () => {
  const st = opened(['swallow'], ['brute', 'cub']);
  assert.equal(legal(st, { kind: 'play', index: 0, target: { kind: 'minion', index: 0 } }), 'too-big', 'the 5-攻 brute is too big');
  assert.equal(legal(st, { kind: 'play', index: 0 }), 'aim-one', 'a small one stands: aim it');
  assert.ok(act(st, { kind: 'play', index: 0, target: { kind: 'minion', index: 1 } }).ok);
  assert.deepEqual(st.foe.board.map(m => m.id), ['brute'], 'the cub is gone, whole');
  assert.ok(st.log.some(t => t.act === 'swallowed' && t.id === 'cub'));
  // Nothing small enough: it lands as a body and swallows nothing.
  const big = opened(['swallow'], ['brute']);
  assert.equal(legal(big, { kind: 'play', index: 0 }), null);
  act(big, { kind: 'play', index: 0 });
  assert.equal(big.foe.board.length, 1);
  // The offers glow only on what fits.
  const o = offers(opened(['swallow'], ['brute', 'cub'])).filter(x => x.ok && x.action.kind === 'play').map(x => x.action.target?.index);
  assert.deepEqual(o, [1]);
});

test('灵力 −1: the other side has one less on its next turn only', () => {
  const st = opened(['drum']);
  act(st, { kind: 'play', index: 0 });
  assert.equal(view(st).foe.drain, 1, 'the page can say it is coming');
  act(st, { kind: 'end' });
  assert.equal(st.foe.mana, st.foe.manaMax - 1, 'its turn opens one short');
  foeTurn(st);
  act(st, { kind: 'end' });
  assert.equal(st.foe.mana, st.foe.manaMax, 'the turn after, whole again');
});

test('大旱: at the end of its side\'s every turn, never when played, each of the other rank takes its number', () => {
  const st = opened(['drought'], ['cub', 'brute']);
  act(st, { kind: 'play', index: 0 });
  assert.deepEqual(st.foe.board.map(m => m.hp), [2, 5], 'nothing on arrival');
  act(st, { kind: 'end' });
  assert.deepEqual(st.foe.board.map(m => m.hp), [1, 4], 'the end of your turn: −1 each');
  assert.ok(st.log.some(t => t.act === 'drought'));
  const [cub, brute] = st.foe.board;
  st.foe.hand = []; st.foe.deck = ['cub']; // it plays nothing, strikes nothing we did not set
  cub.atk = brute.atk = 0;
  foeTurn(st);
  assert.deepEqual([cub.hp, brute.hp], [1, 4], 'the beast\'s own turn is not parched');
  act(st, { kind: 'end' });
  assert.equal(st.foe.board.includes(cub), false, 'the next end of yours drives the cub off');
  assert.equal(brute.hp, 3);
});

test('the beast plays them too: it chains your hardest hitter, swallows what fits, and lets a too-big rank be', () => {
  const foeUses = (card, mine) => {
    const st = begin({ mode: 'pve', seed: 'f', you: { tier: 'core', root: null, deck: filler.slice(0, 10) }, foe: { tier: 'core', root: null, deck: filler } }, CARDS);
    st.you.board = mine.map(id => ({ id, name: id, element: null, atk: CARDS[id].atk, hp: CARDS[id].hp, hpMax: CARDS[id].hp, taunt: false, sick: false, struck: false }));
    act(st, { kind: 'end' });
    st.foe.hand = [card];
    st.foe.intent = null;
    st.foe.mana = 10;
    foeTurn(st);
    return st;
  };
  const chained = foeUses('chain', ['cub', 'brute']);
  assert.equal(chained.you.board.find(m => m.id === 'brute').held, true, 'the brute sits out your turn');
  assert.equal(legal(chained, { kind: 'attack', index: chained.you.board.findIndex(m => m.id === 'brute') }), 'chained');
  const swallowed = foeUses('swallow', ['cub', 'brute']);
  assert.deepEqual(swallowed.you.board.map(m => m.id), ['brute'], 'it swallowed the one that fits');
  const spared = foeUses('swallow', ['brute']);
  assert.deepEqual(spared.you.board.map(m => m.id), ['brute'], 'too big: played as a body');
  assert.ok(spared.foe.board.some(m => m.id === 'swallow'));
});

test('the ten boss cards: each its own verb, none the old placeholder', () => {
  const ids = ['fuzhu', 'paoxiao', 'leishen', 'kui', 'wuzhiqi', 'fangfeng', 'bashe', 'kuiniu', 'feiyi', 'taifeng'];
  const shape = id => JSON.stringify([WORLD[id].cost, WORLD[id].atk, WORLD[id].hp, WORLD[id].keywords ?? [], WORLD[id].effect ?? null]);
  assert.equal(new Set(ids.map(shape)).size, ids.length, 'no two alike');
  assert.equal(WORLD.wuzhiqi.effect.chain, 1);
  assert.equal(WORLD.bashe.effect.swallow, 3);
  assert.equal(WORLD.kui.effect.drain, 1);
  assert.equal(WORLD.feiyi.effect.drought, 1);
  assert.equal(WORLD.leishen.effect.sweep, 2);
  assert.ok(WORLD.fangfeng.keywords.includes('taunt') && WORLD.fangfeng.hp >= 8 && WORLD.fangfeng.atk <= 3);
  for (const id of ids) if (WORLD[id].effect && !WORLD[id].effect.drought) assert.ok(WORLD[id].keywords.includes('battlecry'), `${id} acts on arrival`);
});

test('the card text: 锁 · 吞 · 灵力 −1 · 大旱 in zh and en', () => {
  const zh = id => sayEffect(WORLD[id], { lang: 'zh' }), en = id => sayEffect(WORLD[id], { lang: 'en' });
  assert.equal(zh('wuzhiqi'), '入阵：锁它阵前一个，下回合不能出手');
  assert.equal(en('wuzhiqi'), 'On arrival: Chain one of its rank: it cannot strike next turn');
  assert.equal(zh('bashe'), '入阵：吞它阵前一个攻 ≤3 的');
  assert.equal(en('bashe'), 'On arrival: Swallow one of its rank with attack ≤ 3');
  assert.equal(zh('kui'), '护主 · 入阵：它下回合灵力 −1');
  assert.equal(en('kui'), 'Guard · On arrival: its Force −1 next turn');
  assert.equal(zh('feiyi'), '大旱：你每回合末，它阵前每个 1 点');
  assert.equal(en('feiyi'), 'Drought: at the end of your turn, 1 to each of its rank');
  assert.equal(zh('leishen'), '入阵：它阵前每个 2 点');
  for (const w of [WORDS.zh, WORDS.en]) for (const k of ['too-big', 'aim-one', 'chained']) assert.ok(w.why[k], k);
});

test('the player aims 锁 and 吞 at its rank; a 吞 at a too-big body is refused with its reason on the card', () => {
  const catalog = { ...CARDS };
  const st = opened(['swallow', 'chain'], ['brute', 'cub']);
  const v = view(st);
  assert.equal(wantsTarget(catalog.swallow, v), true);
  assert.equal(wantsTarget(catalog.chain, v), true);
  assert.deepEqual(pickOf(null, { kind: 'hand', index: 0 }, v, catalog), { pick: { from: 'hand', index: 0 } });
  assert.deepEqual(pickOf({ from: 'hand', index: 0 }, { kind: 'mine', index: 0 }, v, catalog), { clear: true }, 'not at your own rank');
  const aim = pickOf({ from: 'hand', index: 0 }, { kind: 'theirs', index: 0 }, v, catalog).action;
  const out = act(st, aim);
  assert.deepEqual(out, { ok: false, why: 'too-big' });
  const html = battleHtml(view(st), offers(st), { lang: 'zh', words: WORDS.zh, catalog, board: 4 }, null, false, out.why);
  assert.match(html, /吞不下 —— 它攻太高/);
  const en = battleHtml(view(st), offers(st), { lang: 'en', words: WORDS.en, catalog, board: 4 }, null, false, out.why);
  assert.match(en, /too big to swallow/);
  // Held, the one it may take glows with the verb, the brute does not.
  const held = battleHtml(view(st), offers(st), { lang: 'zh', words: WORDS.zh, catalog, board: 4 }, { from: 'hand', index: 0 });
  assert.match(held, /data-index="1" data-id="cub">[\s\S]*?<span class="bdmg up">吞<\/span>/);
  const brutePiece = held.split('<button class="bminion').find(x => x.includes('data-id="brute"'));
  assert.doesNotMatch(brutePiece, /bdmg/, 'the brute does not glow');
  assert.match(held, /点它阵前的一个/, 'the hint says where 吞 may go — not the beast');
  // A chained body wears 锁.
  act(st, { kind: 'play', index: 1, target: { kind: 'minion', index: 0 } });
  assert.match(battleHtml(view(st), offers(st), { lang: 'zh', words: WORDS.zh, catalog, board: 4 }), /data-id="brute">[\s\S]*?<small>锁<\/small>/);
});
