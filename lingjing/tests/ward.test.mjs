// 御 — the `ward` verb (battle.js § EFFECTS; Hanli 11-07, option a: 蛫's 「可以御火」 made true). After the 杀招 that lays
// it, blows of its element at the beast land halved (round down, at least 1) until the end of the player's next turn.
// Declared on the beast's signature; the engine names no beast. Fixture cards, then 蛫 as creatures.json has it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, begin, foeTurn, landed, offers, view } from '../scripts/battle.js';
import { WORDS, battleHtml, chargeHtml, sayEffect } from '../scripts/battle-card.js';
import { loadContent } from '../scripts/content.mjs';

const CARDS = {
  cub: { id: 'cub', kind: 'minion', name: '小妖', cost: 9, element: 'wood', atk: 1, hp: 2 },
  bolt: { id: 'bolt', kind: 'spell', name: '火弹术', cost: 1, element: 'fire', effect: { damage: 7 } },
  edge: { id: 'edge', kind: 'spell', name: '碎金', cost: 1, element: 'metal', effect: { damage: 5 } },
};
const WARD = { element: 'fire', half: true, turns: 1 };
const SIG = { id: 'yuhuo', name: { zh: '可以御火', en: 'Proof Against Fire' }, effect: { damage: 2, ward: WARD } };
const setup = () => ({
  mode: 'pve', seed: 'ward',
  you: { tier: 'qi', step: 0, root: 'water', deck: Array(10).fill('bolt') },
  foe: { tier: 'qi', root: 'earth', deck: Array(12).fill('cub'), signature: SIG },
});
/* A fight where the beast lets its 杀招 go at the start of its next turn. */
function warded() {
  const st = begin(setup(), CARDS);
  st.foe.charge = { phase: 'ready' };
  act(st, { kind: 'end' });
  foeTurn(st);
  st.you.hand = ['bolt', 'bolt', 'edge'];
  st.you.mana = 10;
  return st;
}

test('the 杀招 lays the ward: fire at it lands half, rounded down, at least 1; other elements whole', () => {
  const plain = begin(setup(), CARDS);
  const whole = landed(plain, 'you', 7, 'fire');
  const st = warded();
  assert.ok(st.log.some(t => t.act === 'ward' && t.who === 'foe' && t.element === 'fire'));
  assert.deepEqual(view(st).foe.wards, [{ element: 'fire', half: true, left: 1 }]);
  assert.equal(landed(st, 'you', 7, 'fire'), Math.max(1, Math.floor(whole / 2)), 'the page prints the halved number');
  assert.equal(landed(st, 'you', 1, 'fire'), 1, 'never under 1');
  assert.equal(landed(st, 'you', 5, 'metal'), landed(plain, 'you', 5, 'metal'), 'metal is not warded');
  const hp = st.foe.hp;
  act(st, { kind: 'play', index: 0 });
  assert.equal(hp - st.foe.hp, Math.max(1, Math.floor(whole / 2)), 'and the rules land it');
});

test('it lasts to the end of the player\'s next turn, then it is gone', () => {
  const st = warded();
  act(st, { kind: 'end' });
  assert.equal(view(st).foe.wards, undefined, 'his turn ended: the ward is off');
  assert.ok(st.log.some(t => t.act === 'ward-off' && t.element === 'fire'));
  assert.equal(landed(st, 'you', 7, 'fire'), landed(begin(setup(), CARDS), 'you', 7, 'fire'));
});

test('a fire card shows the halved number while it lasts; the tag stands beside the beast\'s name; the words say it, zh and en', async () => {
  const st = warded();
  for (const lang of ['zh', 'en']) {
    const said = sayEffect({ effect: { ward: WARD } }, { lang });
    assert.match(said, lang === 'zh' ? /御火：火伤减半/ : /Ward fire: fire lands half/);
  }
  assert.match(sayEffect({ effect: SIG.effect }, { lang: 'zh' }), /打 2 点，御火/);
  // The 杀招's line before it lands names the ward too.
  const g = begin(setup(), CARDS);
  g.foe.charge = { phase: 'gathering' };
  assert.match(chargeHtml(view(g), { lang: 'zh', words: WORDS.zh }), /御火/);
  const html = battleHtml(view(st), offers(st), { lang: 'zh', words: WORDS.zh, catalog: CARDS, board: 5, foeName: '蛫', youName: '清玄' });
  assert.match(html, /class="bwardtag el-fire"[^>]*>御火</);
  const half = String(landed(st, 'you', 7, 'fire'));
  assert.ok(html.includes(`对它 ${half} · 御火 减半`), 'the fire card\'s 克 preview is the halved number');
  assert.doesNotMatch(battleHtml(view(begin(setup(), CARDS)), offers(begin(setup(), CARDS)), { lang: 'zh', words: WORDS.zh, catalog: CARDS, board: 5, foeName: '蛫' }), /bwardtag/, 'no ward, no tag');
});

test('窃脂 (creatures.json): 赤身白首 strikes for 6, draws and wards fire', () => {
  const qiezhi = loadContent().creatures.creatures.find(c => c.id === 'qiezhi');
  assert.deepEqual(qiezhi.signature.effect, { damage: 6, draw: 1, ward: WARD });
});

test('蛫 (creatures.json): 「可以御火」 keeps its damage and rally, and lays the fire ward', () => {
  const gui = loadContent().creatures.creatures.find(c => c.id === 'gui');
  assert.equal(gui.signature.name.zh, '可以御火');
  assert.deepEqual(gui.signature.effect, { damage: 6, rally: { atk: 1, hp: 2 }, ward: { element: 'fire', half: true, turns: 1 } });
});
