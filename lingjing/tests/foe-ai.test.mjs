// The beast's side (battle.js foeStep): it never spends a turn on nothing, and
// what stands on its rank strikes. Live 2026-10-15 (后山崖顶 野猪): it played
// 厚土 onto an empty rank, healed at full 气血, and never struck — 「也不攻击」.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, begin, foeTurn, worthPlaying } from '../scripts/battle.js';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const setupOf = (foeDeck, youDeck = ['tuou', 'tuou', 'tuou', 'tuou']) => ({
  mode: 'pve', seed: 'ai', you: { tier: 'qi', root: 'wood', deck: youDeck, extra: [] },
  foe: { tier: 'qi', root: 'earth', deck: foeDeck },
});

test('a card that would land on nothing is held, never played', () => {
  const st = begin(setupOf(['houtu', 'zhuguang', 'jinzhen', 'houtu', 'zhuguang', 'jinzhen']), catalog);
  assert.equal(worthPlaying(st, st.foe, catalog.houtu), false, '厚土 with no rank of its own');
  assert.equal(worthPlaying(st, st.foe, catalog.zhuguang), false, '珠光 at full 气血');
  assert.equal(worthPlaying(st, st.foe, catalog.jinzhen), false, '金针雨 at an empty rank');
  act(st, { kind: 'end' }, 'you');
  foeTurn(st);
  const played = st.log.filter(l => l.act === 'played' && l.who === 'foe');
  assert.deepEqual(played, [], `it played ${played.map(p => p.id)}`);
});

test('a useful card is still played: a heal when hurt, a rally over its rank', () => {
  const st = begin(setupOf(['xiaoyao', 'houtu', 'zhuguang', 'xiaoyao', 'houtu', 'zhuguang']), catalog);
  st.foe.hp -= 6;
  assert.equal(worthPlaying(st, st.foe, catalog.zhuguang), true);
  st.foe.board.push({ id: 'xiaoyao', element: 'wood', atk: 1, hp: 2, hpMax: 2, taunt: false, sick: false, struck: false });
  assert.equal(worthPlaying(st, st.foe, catalog.houtu), true);
});

test('what stands on its rank strikes, every turn it may', () => {
  const st = begin(setupOf(['jinsuo', 'jinsuo', 'jinsuo', 'jinsuo', 'jinsuo', 'jinsuo']), catalog);
  act(st, { kind: 'end' }, 'you');
  foeTurn(st); // plays its bodies
  act(st, { kind: 'end' }, 'you');
  const before = st.you.hp + (st.you.armor ?? 0);
  foeTurn(st);
  const struck = st.log.filter(l => l.act === 'hurt' && l.who === 'you' && l.from === 'attack');
  assert.ok(struck.length >= 1, 'its bodies struck');
  assert.ok(st.you.hp + (st.you.armor ?? 0) < before);
});

test('a blow goes at a body it drives off, else at the hero — never a graze', () => {
  const st = begin(setupOf(['huodan', 'huodan', 'huodan', 'huodan', 'huodan', 'huodan']), catalog);
  st.you.board.push({ id: 'shanjing', element: 'earth', atk: 1, hp: 4, hpMax: 4, taunt: true, sick: false, struck: false });
  act(st, { kind: 'end' }, 'you');
  const youHp = st.you.hp;
  foeTurn(st);
  assert.equal(st.you.board[0]?.hp, 4, 'the 山精 it cannot drive off is left whole');
  assert.ok(st.you.hp < youHp, 'the 火弹术 went at the hero');
});

test('a planned card whose mark is gone by its turn is let go, not played on nothing', () => {
  const st = begin(setupOf(['houtu', 'houtu', 'houtu', 'houtu', 'houtu', 'houtu']), catalog);
  st.foe.board.push({ id: 'xiaoyao', element: 'wood', atk: 1, hp: 2, hpMax: 2, taunt: false, sick: false, struck: false });
  st.foe.mana = 2; st.foe.manaMax = 2;
  st.foe.intent = { cards: ['houtu'], power: false, gathering: false };
  st.foe.board = []; // its rank driven off on his turn
  st.whose = 'foe';
  foeTurn(st);
  assert.deepEqual(st.log.filter(l => l.act === 'played' && l.who === 'foe').map(l => l.id), []);
});
