import test from 'node:test';
import assert from 'node:assert/strict';
import { act, begin, legal, offers, playerOffers, view, foeStep } from '../scripts/battle.js';
import { plain } from '../scripts/fightline.js';

const cards = {
  body: { id: 'body', kind: 'minion', cost: 0, atk: 1, hp: 10 },
  glow: { id: 'glow', kind: 'minion', cost: 0, atk: 1, hp: 10, keywords: ['shield'] },
  venom: { id: 'venom', kind: 'spell', cost: 0, effect: { poison: 3 } },
  weak: { id: 'weak', kind: 'spell', cost: 0, effect: { poison: 1 } },
  cry: { id: 'cry', kind: 'minion', cost: 0, atk: 1, hp: 2, keywords: ['battlecry'], effect: { poison: 3 } },
  heal: { id: 'heal', kind: 'spell', cost: 0, effect: { heal: 2 } },
};
const setup = { mode: 'pvp', seed: 'poison', you: { tier: 'qi', deck: [], fatigue: false }, foe: { tier: 'qi', deck: [], fatigue: false } };
const target = { kind: 'minion', index: 0 };
function opened() { return begin(setup, cards); }
function play(st, who, id, aim) {
  st[who].hand = [id];
  assert.equal(act(st, { kind: 'play', index: 0, target: aim }, who).ok, true);
}
function end(st, who) { assert.equal(act(st, { kind: 'end' }, who).ok, true); }

test('poison applies without damage, retains the larger value, and ticks each owner turn', () => {
  const st = opened();
  play(st, 'you', 'body');
  end(st, 'you');
  play(st, 'foe', 'venom', target);
  play(st, 'foe', 'weak', target);
  const m = st.you.board[0];
  assert.equal(m.hp, 10);
  assert.equal(view(st).you.board[0].poison, 3);
  end(st, 'foe');
  assert.equal(m.hp, 7);
  assert.deepEqual(st.log.find(e => e.act === 'poison'), { act: 'poison', who: 'you', id: 'body', uid: m.uid, n: 3 });
  end(st, 'you'); end(st, 'foe');
  assert.equal(m.hp, 4);
  assert.equal(st.log.filter(e => e.act === 'poison').length, 2);
});

test('a targeted heal cleanses even at full health; untargeted healing remains unchanged', () => {
  const st = opened();
  play(st, 'you', 'body'); end(st, 'you');
  play(st, 'foe', 'venom', target); end(st, 'foe');
  const m = st.you.board[0];
  st.you.hand = ['heal'];
  const aim = { ...target, side: 'mine' };
  assert.ok(playerOffers(st).some(o => o.ok && o.action.target?.side === 'mine'));
  play(st, 'you', 'heal', aim);
  assert.equal(m.hp, 9); assert.equal(m.poison, 0);
  assert.deepEqual(st.log.find(e => e.act === 'cleanse'), { act: 'cleanse', who: 'you', id: 'body', uid: m.uid });
  st.you.hp -= 4;
  play(st, 'you', 'heal');
  assert.equal(st.you.hp, st.you.hpMax - 2);
  m.poison = 1; m.hp = m.hpMax;
  play(st, 'you', 'heal', aim);
  assert.equal(m.poison, 0); assert.equal(m.hp, m.hpMax);
});

test('shield stops a tick and a later lethal tick withdraws the body', () => {
  const st = opened(); play(st, 'you', 'glow'); end(st, 'you');
  play(st, 'foe', 'cry', target); end(st, 'foe');
  const m = st.you.board[0];
  assert.equal(m.hp, 10); assert.equal(m.shield, false);
  assert.ok(st.log.some(e => e.act === 'shield-off' && e.uid === m.uid));
  m.hp = 3; end(st, 'you'); end(st, 'foe');
  assert.equal(st.you.board.length, 0);
  assert.ok(st.log.some(e => e.act === 'withdrew' && e.uid === m.uid));
});

test('poison needs an opposing body and both automated lines can play it', () => {
  const st = opened(); st.you.hand = ['venom'];
  assert.equal(legal(st, { kind: 'play', index: 0 }), 'no-target');
  assert.ok(offers(st).filter(o => o.id === 'venom').every(o => !o.ok));
  st.foe.board.push({ id: 'body', uid: 8, hp: 10, hpMax: 10, atk: 1 });
  assert.equal(legal(st, { kind: 'play', index: 0 }), 'no-target');
  assert.equal(plain(st).action.target.index, 0);
  play(st, 'you', 'body'); end(st, 'you');
  st.foe.intent = null; st.foe.hand = ['venom'];
  assert.equal(foeStep(st).kind, 'play');
  assert.equal(st.you.board[0].poison, 3);
});
