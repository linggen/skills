// 回春 family on a save (batch 2, Hanli 2026-11-10: 「回春族按你说的改」): a 回春丹 heals in a fight, a share of his 气血 at
// the pill's level, and pays no 修为 — save the 九转回春丹's declared small 修为 (master.pills.exceptions). A save holds
// item ids and counts, never a grant; its only prices are 砍价's (a day's open haggle, a price paid elsewhere), so nothing
// needs converting but those: a 三转回春丹 held from before (it paid 修为 eaten) loads as it is, rides into the 丹囊 as a
// heal, and eaten outside a fight is refused and kept; a haggle opened at a list price the shelf no longer asks is let go.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { migrate, newState } from '../scripts/state.mjs';
import { look, trade, VERBS } from '../scripts/rules.mjs';
import { pouchFor } from '../scripts/rules/cards.mjs';
import { rateOfLevel } from '../scripts/rules/playpay.mjs';

const content = loadContent();
const NOW = new Date('2026-11-10T12:00:00');
const item = id => content.items.items.find(i => i.id === id);
const held = (bag, extra = {}) => ({
  ...newState(content, 'zh', NOW), traits: ['metal', 'wood', 'water', 'fire', 'earth'], tier: 'qi', step: 5, progress: 0,
  chapter: '00-zhuji', scene: null, place: 'houshan', ended: ['00-prologue', '00-waimen'], bag, stamina: 100, stamina_at: NOW.toISOString(), ...extra,
});

test('a held 三转回春丹 loads as it is: eaten outside a fight it is refused and kept; in the 丹囊 it heals', () => {
  const s = migrate(held({ 'mend-pill-3': 2 }), content);
  assert.equal(s.bag['mend-pill-3'], 2, 'the save keeps what it held');
  const r = trade(s, content, { now: NOW, quests: [] }, { action: 'use', id: 'mend-pill-3' });
  assert.equal(r.result.refused, 'not-usable', JSON.stringify(r.result));
  assert.equal(r.state?.bag?.['mend-pill-3'] ?? s.bag['mend-pill-3'], 2, 'kept');
  const pouch = pouchFor(content, { ...s, pill_pick: ['mend-pill-3'] });
  assert.deepEqual(pouch.map(p => [p.id, p.heal]), [['mend-pill-3', item('mend-pill-3').effect.fight.heal]]);
  assert.ok(item('mend-pill-3').effect.fight.heal > item('mend-pill').effect.fight.heal, 'more than the shop\'s 一转');
});

test('a held 九转回春丹 eaten outside a fight pays its declared 修为, at its own level, and is gone; in a fight it heals him whole', () => {
  const s = held({ 'mend-pill-9': 1 });
  const e = item('mend-pill-9').effect;
  const r = trade(s, content, { now: NOW, quests: [] }, { action: 'use', id: 'mend-pill-9' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.equal(r.state.progress, Math.round(e.units * rateOfLevel(content, e.level)));
  assert.equal(r.state.bag['mend-pill-9'] ?? 0, 0);
  assert.ok(e.fight.heal >= 20, 'its heal: his whole 气血 at its level');
});

test('a save stores no grant: the fixtures carry ids and counts, and load to the same 灵石', () => {
  for (const f of fs.readdirSync(new URL('./fixtures/saves/', import.meta.url)).filter(x => x.endsWith('.json'))) {
    const raw = JSON.parse(fs.readFileSync(new URL(`./fixtures/saves/${f}`, import.meta.url), 'utf8')), s = raw.state ?? raw;
    const text = JSON.stringify(s);
    assert.ok(!/"(buy|sell|price)":/.test(text), `${f}: no price`);
    assert.equal(migrate(structuredClone(s), content).wealth ?? 0, s.wealth ?? 0, `${f}: its 灵石 as saved`);
  }
});

test('砍价 across the re-pricing: a haggle opened at the old list price is let go (not walked), and opens again at today\'s', () => {
  const NOW2 = new Date('2026-10-27T03:00:00Z'), c = { now: NOW2, quests: [] };
  const base = { ...held({}), place: 'zhishi', chapter: '00-waimen', scene: null, ended: ['00-prologue'], done_scenes: ['wm-zhoutian'], wealth: 500 };
  const price = item('caoren-zha').buy;
  const opened = VERBS.haggle(base, content, c, { action: 'open', id: 'caoren-zha' });
  assert.equal(opened.result.ok ?? opened.result.opened, true, JSON.stringify(opened.result));
  // The same haggle as a save before batch 2 held it: its list the old 60.
  const old = structuredClone(opened.state);
  old.haggle.open = { ...old.haggle.open, list: 60, ask: 60, floor: 50 };
  assert.equal(look(old, content, c).haggle.open, undefined, 'let go on load');
  const again = VERBS.haggle(old, content, c, { action: 'open', id: 'caoren-zha' });
  assert.equal(again.result.haggle?.open?.ask ?? again.result.haggle?.open?.list, price, JSON.stringify(again.result).slice(0, 200));
});
