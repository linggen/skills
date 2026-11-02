// 护体 on the page (Hanli 2026-11-02: 「可以, 加上吧」): a blow the robe takes floats its own number over the
// portrait and lights the chip, then what reached 气血 floats as a hurt. This locks the entry shape the replay
// reads (battle.js logs it, battle-anim.js hurtFloats draws it) and that the chip sits on the side the replay seeks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { POWER_COST, act, begin, offers, view } from '../scripts/battle.js';
import { hurtFloats } from '../scripts/battle-anim.js';
import { WORDS, battleHtml } from '../scripts/battle-card.js';

const CARDS = { cub: { id: 'cub', kind: 'minion', name: '小妖', cost: 1, element: 'wood', atk: 1, hp: 1 } };
const deck = Array(10).fill('cub');
const open = (armor) => begin({ mode: 'pve', seed: 'armor', you: { tier: 'qi', root: 'fire', deck, armor }, foe: { tier: 'foundation', root: 'wood', deck } }, CARDS);

function foeHit(st) {
  st.whose = 'foe'; st.foe.mana = POWER_COST; st.foe.powerUsed = false;
  assert.equal(act(st, { kind: 'power' }, 'foe').ok, true);
  return st.log.filter((e) => e.act === 'hurt' && e.who === 'you').at(-1);
}

const words = { armor: '护体' };

test('a blow the robe takes whole: only 护体\'s number floats, no hurt number', () => {
  const st = open(99), hp = st.you.hp;
  const t = foeHit(st);
  assert.equal(st.you.hp, hp);
  assert.ok(t.absorbed > 0);
  assert.equal(t.amount, 0);
  assert.equal(t.armor, 99 - t.absorbed);
  assert.deepEqual(hurtFloats(t, words), [{ kind: 'armor', text: `护体 −${t.absorbed}` }, null]);
});

test('a blow through the robe: 护体\'s share, then the 气血 lost', () => {
  const st = open(1);
  const t = foeHit(st);
  assert.equal(t.absorbed, 1);
  assert.ok(t.amount > 0);
  assert.equal(t.armor, 0);
  assert.deepEqual(hurtFloats(t, { armor: 'Shield' }), [{ kind: 'armor', text: 'Shield −1' }, { kind: 'hurt', text: `−${t.amount}` }]);
});

test('no robe: the hurt number as ever, nothing for 护体', () => {
  const t = foeHit(open(0));
  assert.equal(t.absorbed, undefined);
  assert.deepEqual(hurtFloats(t, words), [null, { kind: 'hurt', text: `−${t.amount}` }]);
});

test('the 护体 chip sits on the struck side (.bside.you / .bside.foe), where the replay seeks it — not inside the name', () => {
  const st = open(4);
  foeHit(st);
  const html = battleHtml(view(st), offers(st), { lang: 'zh', words: WORDS.zh, catalog: CARDS, board: 5 });
  const you = html.slice(html.indexOf('<div class="bside you">'));
  assert.match(you, /class="barmor[^"]*"/, 'the chip in his side');
  const name = you.slice(0, you.indexOf('<div class="bnums">'));
  assert.doesNotMatch(name, /barmor/, 'not in .bwho: the replay asks the side, not the name');
  assert.equal(WORDS.zh.armor, '护体');
  assert.equal(WORDS.en.armor, 'Shield');
});
