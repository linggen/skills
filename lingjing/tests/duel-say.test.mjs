import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duelFacts, duelFallback } from '../scripts/hersay.js';
const summary = { foe_hp_left: 2, foe_hp_max: 20, near: true, pills_left: 3, gaps: [{ lesson: 'trade', turn: 3, did: { kind: 'attack', target: 'face' }, better: { kind: 'play', name: '狐火', target: 'body' } }] };
const base = { outcome: 'lost', beast: '大妖', lost: 0, summary, lend: { names: ['狐火'] }, zh: true };
test('first loss facts include lesson, remaining life and lend', () => { const s = duelFacts(base); assert.match(s, /第1次/); assert.match(s, /2\/20/); assert.match(s, /该先换掉/); assert.match(s, /狐火/); assert.doesNotMatch(s, /第3回合/); });
test('second and third losses include detail and pills', () => { assert.match(duelFacts({ ...base, lost: 1 }), /第3回合.*狐火/); assert.match(duelFacts({ ...base, lost: 2 }), /还剩3颗丹/); });
test('English facts and win after losses', () => { assert.match(duelFacts({ ...base, zh: false }), /2\/20 Life/); assert.match(duelFacts({ ...base, outcome: 'won', lost: 2 }), /归还/); });
test('fallback follows lesson, near, far, lending and win', () => { assert.match(duelFallback(base), /^只顾打它的脸，它的爪牙谁来收？/); assert.match(duelFallback(base), /罢了，借你一张狐火。别丢本座的脸。/); const s = { ...summary, gaps: [] }; assert.match(duelFallback({ ...base, summary: s }), /^只差2点。哼，再来。/); assert.match(duelFallback({ ...base, summary: { ...s, near: false } }), /^差得远。/); assert.equal(duelFallback({ ...base, outcome: 'won', lost: 1 }), '这回像样了。……牌还来。'); });

test('two lent cards are one sentence of hers, never the line said twice', () => {
  const said = duelFallback({ outcome: 'lost', lost: 2, summary: { gaps: [{ lesson: 'unspent' }], foe_hp_left: 13 }, lend: { names: ['啸月', '月影扑'] } });
  assert.equal((said.match(/罢了/g) ?? []).length, 1);
  assert.match(said, /借你啸月、月影扑。别丢本座的脸。$/);
});
