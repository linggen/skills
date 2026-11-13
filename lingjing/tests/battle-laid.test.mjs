import test from 'node:test';
import assert from 'node:assert/strict';
import { act, begin, legal, offers, view, foeStep } from '../scripts/battle.js';
import { plain } from '../scripts/fightline.js';

const cards = {
  guard: { id: 'guard', name: '护身符', kind: 'spell', cost: 1, lay: { when: 'struck', effect: {} } },
  guard2: { id: 'guard2', name: '护符', kind: 'spell', cost: 0, lay: { when: 'struck', effect: {} } },
  hold: { id: 'hold', name: '定身符', kind: 'spell', cost: 0, lay: { when: 'enters', effect: {} } },
  thunder: { id: 'thunder', name: '惊雷符', kind: 'spell', cost: 0, lay: { when: 'casts', effect: { damage: 2 } } },
  body: { id: 'body', name: 'body', kind: 'minion', cost: 0, atk: 2, hp: 8 },
  blow: { id: 'blow', kind: 'spell', cost: 0, effect: { damage: 3 } },
  sweep: { id: 'sweep', kind: 'spell', cost: 0, effect: { sweep: 1 } },
  summon: { id: 'summon', kind: 'spell', cost: 0, effect: { summon: { id: 'body', n: 2 } } },
};
const setup = { mode: 'pvp', seed: 'laid', you: { tier: 'qi', deck: [], fatigue: false }, foe: { tier: 'qi', deck: [], fatigue: false } };
const opened = () => begin(setup, cards);
function play(st, who, id, target) { st[who].hand = [id]; assert.equal(act(st, { kind: 'play', index: 0, target }, who).ok, true); }
function end(st, who) { assert.equal(act(st, { kind: 'end' }, who).ok, true); }

test('lay costs mana, hides identity, and enforces the two limits', () => {
  const st = opened(); const mana = st.you.mana;
  play(st, 'you', 'guard'); assert.equal(st.you.mana, mana - 1);
  assert.equal(st.you.laid.length, 1);
  assert.deepEqual(view(st).you.laid.map(x => x.name), ['护身符']);
  assert.deepEqual(st.log.filter(x => x.act === 'laid'), [{ act: 'laid', who: 'you' }]);
  st.you.hand = ['guard'];
  st.you.mana = 5; assert.equal(offers(st).find(x => x.id === 'guard').why, 'laid-same');
  play(st, 'you', 'hold'); st.you.hand = ['thunder'];
  assert.equal(offers(st).find(x => x.id === 'thunder').why, 'laid-full');
  end(st, 'you'); play(st, 'foe', 'guard2');
  assert.equal(view(st).foe.laid, 1);
  assert.equal(JSON.stringify(view(st).log).includes('guard2'), false);
});

test('struck stops a strike or lead spell once, not a sweep', () => {
  const st = opened(); play(st, 'you', 'body'); play(st, 'you', 'guard'); end(st, 'you');
  play(st, 'foe', 'sweep'); assert.equal(st.you.laid.length, 1);
  const hp = st.you.hp; play(st, 'foe', 'blow'); assert.equal(st.you.hp, hp);
  assert.equal(st.you.laid.length, 0); play(st, 'foe', 'blow'); assert.ok(st.you.hp < hp);
  assert.deepEqual(st.log.find(x => x.act === 'laid-off'), { act: 'laid-off', who: 'you', id: 'guard', uid: 2, when: 'struck' });
  end(st, 'foe'); play(st, 'you', 'guard2'); end(st, 'you');
  play(st, 'foe', 'body'); end(st, 'foe'); end(st, 'you');
  const before = st.you.hp; assert.equal(act(st, { kind: 'attack', index: 0 }, 'foe').ok, true); assert.equal(st.you.hp, before);
});

test('enters holds the first summoned body for its next turn', () => {
  const st = opened(); play(st, 'you', 'hold'); end(st, 'you'); play(st, 'foe', 'summon');
  assert.equal(st.foe.board[0].chain, 1); assert.equal(st.foe.board[1].chain, undefined);
  end(st, 'foe'); end(st, 'you');
  assert.equal(legal(st, { kind: 'attack', index: 0 }, 'foe'), 'chained');
  assert.equal(legal(st, { kind: 'attack', index: 1 }, 'foe'), null);
  end(st, 'foe'); end(st, 'you'); assert.equal(legal(st, { kind: 'attack', index: 0 }, 'foe'), null);
});

test('casts resolves after the spell and the first matching laid card alone fires', () => {
  const st = opened(); play(st, 'you', 'thunder'); play(st, 'you', 'guard2'); end(st, 'you');
  const hp = st.foe.hp, youHp = st.you.hp; play(st, 'foe', 'blow');
  assert.ok(st.you.hp < youHp); assert.equal(st.foe.hp, hp - 2); assert.equal(st.you.laid.length, 1);
  const off = st.log.findIndex(x => x.act === 'laid-off');
  assert.ok(st.log.findIndex(x => x.act === 'hurt' && x.who === 'you') < off);
});

test('result distinguishes spent and unspent and automated lines can lay', () => {
  const st = opened(); st.you.hand = ['guard']; assert.equal(plain(st).action.kind, 'play');
  play(st, 'you', 'guard'); play(st, 'you', 'hold'); end(st, 'you');
  st.foe.intent = null; st.foe.hand = ['thunder']; assert.equal(foeStep(st).kind, 'play');
  play(st, 'foe', 'blow'); st.outcome = 'won';
  const result = view(st).laidResult;
  assert.equal(result.you.spent[0].id, 'guard'); assert.equal(result.you.unspent[0].id, 'hold');
  assert.equal(result.foe.unspent[0].id, 'thunder');
});
