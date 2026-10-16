// 装睡 — a beast that plays dead (battle.js § asleep; Hanli 2026-10-16: 犰狳's
// 见人则眠 is 假睡, an ambush, never a heal). Declared on the beast's setup as
// `feint`; the engine names no beast. Fixture cards only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, asleep, begin, foeTurn, landed, sigEffect, view } from '../scripts/battle.js';
import { feintHtml } from '../scripts/battle-card.js';

const CARDS = {
  cub: { id: 'cub', kind: 'minion', name: '小妖', cost: 1, element: 'wood', atk: 1, hp: 2 },
  bolt: { id: 'bolt', kind: 'spell', name: '火弹术', cost: 2, element: 'fire', effect: { damage: 3 } },
  edge: { id: 'edge', kind: 'spell', name: '碎金', cost: 2, element: 'metal', effect: { damage: 5 } },
};
const FEINT = { name: { zh: '见人则眠', en: 'It Sleeps at the Sight of Men' }, turns: 2, lands: 1, pierce: ['metal'], per_glance: 3 };
const SIG = { id: 'eye', name: { zh: '鸱目一睁', en: "The Owl's Eye Opens" }, effect: { damage: 5 } };
const setup = (foe = {}) => ({
  mode: 'pve', seed: 'feint',
  you: { tier: 'qi', step: 0, root: 'fire', deck: ['bolt', 'bolt', 'edge', 'cub', 'bolt', 'edge', 'cub', 'bolt', 'cub', 'bolt'] },
  foe: { tier: 'qi', root: 'wood', deck: Array(12).fill('cub'), signature: SIG, feint: FEINT, ...foe },
});
const opened = (hand, foe) => { const st = begin(setup(foe), CARDS); st.you.hand = [...hand]; st.you.mana = 10; return st; };

test('a sleeper: a plain blow glances (lands its `lands`, counted), metal goes in whole', () => {
  const st = opened(['bolt', 'edge']);
  assert.ok(asleep(st.foe));
  assert.equal(landed(st, 'you', 3, 'fire'), 1, 'the page prints the glance');
  const hp = st.foe.hp;
  act(st, { kind: 'play', index: 0 });
  assert.equal(st.foe.hp, hp - 1);
  assert.equal(st.foe.feint.glanced, 1);
  assert.ok(st.log.some(t => t.act === 'glanced'));
  act(st, { kind: 'play', index: 0 });
  assert.equal(st.foe.hp, hp - 1 - landed({ ...st, foe: { ...st.foe, feint: null } }, 'you', 5, 'metal'), 'metal is not cut');
  assert.equal(st.foe.feint.glanced, 1, 'metal is not counted');
});

test('asleep it plays nothing and strikes with nothing; it wakes after its turns with its 杀招, harder per glance', () => {
  const st = opened(['bolt', 'bolt']);
  act(st, { kind: 'play', index: 0 });
  act(st, { kind: 'play', index: 0 });
  const youHp = st.you.hp;
  act(st, { kind: 'end' });
  foeTurn(st);
  assert.equal(st.foe.board.length, 0, 'it played nothing');
  assert.equal(st.you.hp, youHp, 'it struck nothing');
  assert.equal(st.foe.feint.left, 1);
  assert.equal(sigEffect(st.foe).damage, 5 + 3 * 2);
  act(st, { kind: 'end' });
  const woke = st.log.findIndex(t => t.act === 'woke');
  assert.ok(woke >= 0, 'it woke');
  assert.equal(st.log.filter(t => t.act === 'unleash').length, 1);
  assert.equal(st.log.find((t, i) => i > woke && t.act === 'hurt' && t.who === 'you').amount, 5 + 6 - 0, 'the 杀招 at 5 + 3 × 2 glances');
  assert.ok(!asleep(st.foe));
});

test('driven below half while asleep, it does not gather: one 杀招, at the waking', () => {
  const st = opened(['edge', 'edge', 'edge'], { hp: 1.2 });
  for (let i = 0; i < 3 && st.outcome === 'open' && st.foe.hp > st.foe.hpMax * 0.5; i += 1) act(st, { kind: 'play', index: 0 });
  assert.equal(st.outcome, 'open');
  assert.ok(st.foe.hp <= st.foe.hpMax * 0.5, 'below half, still asleep');
  assert.equal(st.foe.charge, null, 'no gathering while it plays dead');
  act(st, { kind: 'end' });
  foeTurn(st);
  act(st, { kind: 'end' });
  foeTurn(st);
  assert.equal(st.log.filter(t => t.act === 'unleash').length, 1);
  assert.equal(st.log.filter(t => t.act === 'charge').length, 0);
});

test('the page reads the trap: 装睡, the glance, what goes in, and how hard it wakes', () => {
  const st = opened(['bolt']);
  act(st, { kind: 'play', index: 0 });
  const html = feintHtml(view(st), { lang: 'zh', words: {} });
  assert.match(html, /见人则眠/);
  assert.match(html, /擦过/);
  assert.match(html, /金/);
  assert.match(html, /鸱目一睁/);
  assert.match(html, /8/, 'its 杀招 at 5 + 3 for the one glance');
  assert.equal(feintHtml(view(begin(setup({ feint: undefined }), CARDS)), { lang: 'zh', words: {} }), '');
});

test('pierce_binds: a bind played at the beast holds it — that turn every blow goes in, its own first; not at a body, not the next turn', () => {
  const cards = { ...CARDS, vine: { id: 'vine', kind: 'spell', name: '青藤缚', cost: 1, element: 'wood', binds: true, effect: { damage: 2 } } };
  const open = (feint) => { const st = begin(setup({ feint: { ...FEINT, ...feint } }), cards); st.you.hand = ['vine', 'bolt', 'bolt']; st.you.mana = 10; return st; };
  const st = open({ pierce_binds: true });
  const hp = st.foe.hp;
  act(st, { kind: 'play', index: 0 });
  assert.ok(st.log.some(t => t.act === 'bound'));
  act(st, { kind: 'play', index: 0 });
  assert.equal(st.foe.feint.glanced, 0, 'nothing glanced while bound');
  assert.ok(hp - st.foe.hp > 2, 'both went in');
  act(st, { kind: 'end' });
  foeTurn(st);
  assert.equal(st.foe.feint.bound, false, 'the bind held one turn');
  const plain = open({});
  act(plain, { kind: 'play', index: 0 });
  assert.equal(plain.foe.feint.glanced, 1, 'a beast that does not declare it: the bind glances too');
});
