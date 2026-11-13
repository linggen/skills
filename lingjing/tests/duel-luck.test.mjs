import test from 'node:test';
import assert from 'node:assert/strict';
import { encounters } from '../tools/duel-fit-report.mjs';
import { withRules, FIT } from '../tools/duel-lines.mjs';
import { playerDeck, beastDeck, mulligan } from '../tools/duel-luck.mjs';

test('extended decks preserve the player ten and full beast list deterministically', () => withRules(true, () => {
  for (const e of encounters()) for (const n of [10,15,20]) {
    const a=playerDeck(e,n), b=beastDeck(e,n);
    assert.equal(a.length,n); assert.equal(b.length,n);
    assert.deepEqual(a.slice(0,10),e.setup.you.deck);
    assert.deepEqual(a,playerDeck(e,n)); assert.deepEqual(b,beastDeck(e,n));
    if(n===10) assert.deepEqual(b,e.setup.foe.deck);
  }
},FIT));

test('mulligan keeps opening extras and hand size while returning two cards', () => {
  const st={seed:'x',mode:{hand:3},you:{hand:['extra','niangbing','yijian','tuna'],deck:['niangbing','yijian','tuna']}};
  mulligan(st,1); assert.equal(st.you.hand[0],'extra'); assert.equal(st.you.hand.length,4); assert.equal(st.you.deck.length,3);
});
