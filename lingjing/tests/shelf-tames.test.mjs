// 坊市: a thing a beast likes says so on the shelf and in the bag (his,
// 2026-09-24: 坊市里如果某个物品是收服妖用到的, 显示一下) — the rules name the
// beasts it wins over (itemBrief `tames`), only those not yet won over; the
// page draws the names and derives nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, cardHtml } from '../scripts/cards.js';
import { pouchHtml } from '../scripts/pouch.js';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, VERBS } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00');
const at = (extra = {}) => ({ ...newState(content, 'zh', NOW), name: '清玄', traits: ['wood', 'water', 'fire', 'earth'], place: 'pengcheng', chapter: '02-yan', scene: null,
  ended: ['00-prologue', '01-ji'], tier: 'core', ...extra });
const shelfOf = s => look(s, content, { now: NOW, quests: [] }).place.shelf;

test('the shelf names the beasts a thing wins over — not one already won over', () => {
  const liking = content.creatures.creatures.filter(c => c.likes === 'lingzhi').map(c => c.id);
  assert.ok(liking.includes('fuzhu') && liking.length > 1, 'more than one beast likes 灵芝');
  const fresh = shelfOf(at()).find(i => i.id === 'lingzhi');
  assert.deepEqual(fresh.tames.map(t => t.id), liking);
  const tamed = shelfOf(at({ cast: ['fuzhu'] })).find(i => i.id === 'lingzhi');
  assert.deepEqual(tamed.tames.map(t => t.id), liking.filter(id => id !== 'fuzhu'));
  // A thing no beast likes carries nothing; all won over, nothing either.
  assert.equal(shelfOf(at()).find(i => i.id === 'qi-pill').tames, undefined);
  assert.equal(shelfOf(at({ cast: liking })).find(i => i.id === 'lingzhi').tames, undefined);
});

test('the page draws it on the shelf and in the bag, zh and en', () => {
  for (const lang of ['zh', 'en']) {
    const s = at({ lang, bag: { lingzhi: 1 } });
    const l = look(s, content, { now: NOW, quests: [] });
    const html = cardHtml({ card: 'item', ids: l.place.shelf.map(i => i.id) }, { look: l, lang, words: WORDS[lang], content: { dir: 'worlds/jiuding' } });
    const names = l.place.shelf.find(i => i.id === 'lingzhi').tames.map(t => t.name).join(lang === 'en' ? ', ' : '、');
    assert.ok(html.includes(WORDS[lang].tamesFor.replace('{names}', names)), lang);
    const gear = VERBS.gear(s, content).result.gear;
    assert.ok(pouchHtml({ gear, look: l, lang, words: WORDS[lang] }, { sel: 'lingzhi' }).includes(names), `${lang}: in the pouch, on the thing tapped`);
  }
});
