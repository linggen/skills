import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actionOf, begin, legal, offers, tokenOf, view, foeStep } from '../scripts/battle.js';
import { plain } from '../scripts/fightline.js';

const cards = {
  body: { id: 'body', name: 'body', kind: 'minion', cost: 0, atk: 2, hp: 8 },
  trap: { id: 'trap', name: 'trap', kind: 'spell', cost: 0, lay: { when: 'casts', effect: { damage: 2 } } },
  blow: { id: 'blow', kind: 'spell', cost: 0, effect: { damage: 2 } },
};
const skill = effect => ({ id: 'root', name: 'root skill', effect });
const opened = (effect, extra = {}) => begin({ mode: 'pvp', seed: 'skill', you: { tier: 'qi', deck: [], fatigue: false, ...(effect ? { skill: skill(effect) } : {}), ...extra }, foe: { tier: 'qi', deck: [], fatigue: false } }, cards);
const play = (st, who, id, target) => { st[who].hand = [id]; assert.equal(act(st, { kind: 'play', index: 0, target }, who).ok, true); };
const end = (st, who) => assert.equal(act(st, { kind: 'end' }, who).ok, true);
const use = (st, target) => act(st, { kind: 'skill', target });
const mine = index => ({ kind: 'minion', index, side: 'mine' });
const enemy = index => ({ kind: 'minion', index });

test('without a skill no skill is exposed; skill and power share the turn', () => {
  const old = opened(); assert.equal(offers(old).some(o => o.action.kind === 'skill'), false); assert.equal('skill' in view(old).you, false);
  const a = opened({ armor: 2 }); a.you.mana = 6; assert.equal(act(a, { kind: 'power' }).ok, true); assert.equal(use(a).why, 'power-used');
  const b = opened({ armor: 2 }); b.you.mana = 6; assert.equal(use(b).ok, true); assert.equal(act(b, { kind: 'power' }).why, 'power-used');
  assert.deepEqual(actionOf(tokenOf({ kind: 'skill', target: mine(0) })), { kind: 'skill', target: mine(0) });
});

test('sweep damages both bodies and gear power does not alter it', () => {
  const st = opened({ sweep: 1 }, { power: 9 }); end(st, 'you'); play(st, 'foe', 'body'); play(st, 'foe', 'body'); end(st, 'foe');
  assert.equal(view(st).you.skill.ready, true); assert.equal(use(st).ok, true);
  assert.deepEqual(st.foe.board.map(m => m.hp), [7, 7]); assert.equal(view(st).you.skill.ready, false);
  assert.deepEqual(st.log.find(x => x.act === 'skill'), { act: 'skill', who: 'you', id: 'root', effect: { sweep: 1 } });
});

test('heal reaches lead or a body and cleanses poison', () => {
  const a = opened({ heal: 2 }); a.you.hp -= 3; assert.equal(use(a).ok, true); assert.equal(a.you.hp, a.you.hpMax - 1);
  const b = opened({ heal: 2 }); play(b, 'you', 'body'); b.you.board[0].hp = 4; b.you.board[0].poison = 2;
  assert.equal(use(b, mine(0)).ok, true); assert.equal(b.you.board[0].hp, 6); assert.equal(b.you.board[0].poison, 0); assert.ok(b.log.some(x => x.act === 'cleanse'));
});

test('armor absorbs a later blow', () => {
  const st = opened({ armor: 2 }); assert.equal(use(st).ok, true); assert.equal(st.you.armor, 2); const hp = st.you.hp;
  end(st, 'you'); play(st, 'foe', 'blow'); assert.equal(st.you.hp, hp); assert.equal(st.you.armor, 0);
});

test('buff and hold require a body; buff persists and hold lasts a turn', () => {
  const a = opened({ buff: { atk: 1, hp: 0 } }); assert.equal(offers(a).find(o => o.action.kind === 'skill').why, 'no-friendly');
  play(a, 'you', 'body'); assert.equal(use(a, mine(0)).ok, true); end(a, 'you'); end(a, 'foe'); assert.equal(a.you.board[0].atk, 3);
  const b = opened({ hold: 1 }); assert.equal(offers(b).find(o => o.action.kind === 'skill').ok, false);
  end(b, 'you'); play(b, 'foe', 'body'); end(b, 'foe'); assert.equal(use(b, enemy(0)).ok, true); end(b, 'you');
  assert.equal(legal(b, { kind: 'attack', index: 0 }, 'foe'), 'chained'); end(b, 'foe'); end(b, 'you'); assert.equal(legal(b, { kind: 'attack', index: 0 }, 'foe'), null);
});

test('a skill does not trigger a casts trap; bots can use skills', () => {
  const st = opened({ armor: 2 }); end(st, 'you'); play(st, 'foe', 'trap'); end(st, 'foe'); const hp = st.you.hp;
  assert.equal(use(st).ok, true); assert.equal(st.foe.laid.length, 1); assert.equal(st.you.hp, hp);
  const foe = opened(); end(foe, 'you'); foe.foe.skill = skill({ armor: 2 }); foe.foe.intent = { cards: [], power: false, skill: true }; assert.equal(foeStep(foe).kind, 'skill');
  const bot = opened({ armor: 2 }); bot.you.powerUsed = true; assert.equal(plain(bot), undefined);
});
