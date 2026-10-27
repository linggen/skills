// 所得 shown big (Hanli 2026-10-27, the 饭桶's first meeting: 「收了不只木草泥马吧, 只显示了获得这张牌的动画, 应该还有其他
// 的, 都没显示」): every thing a story step puts in his hands, and its 灵石, is kept on the save as the step's `gained`
// (counted, so the page shows each step's once, whoever took it) and named in Look; the page plays each big, one after
// another, before the step's cards (lingjing.js gainedThings → revealQueue → card-reveal.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { VERBS } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-10-27T10:00:00');
const ctx = { now: NOW, quests: [] };
const base = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/waimen.json', import.meta.url), 'utf8'));
const atDiyilu = () => ({ ...base, scene: 'wm-diyilu', place: 'chaifang', tasks: { ...(base.tasks ?? {}), 'diyilu-niugu': { status: 'done', period: 'once' } }, stamina: 100, stamina_at: NOW.toISOString() });

test('the 饭桶\'s first meeting: the 九转回春丹 it put in his hands is kept as the step\'s 所得, beside the card', () => {
  const r = VERBS.resolve(atDiyilu(), content, ctx, { exit: 'save' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.deepEqual(r.state.gained, { n: 1, scene: 'wm-diyilu', items: [{ id: 'mend-pill-9', n: 1 }] });
  assert.ok(r.result.cards.some((c) => c.id === 'mucao'), 'the card goes its own way (cards_new)');
  const look = VERBS.look(r.state, content, ctx, {}).result;
  assert.equal(look.gained.n, 1);
  assert.deepEqual(look.gained.items.map((i) => [i.id, i.n, i.name, i.kind]), [['mend-pill-9', 1, '九转回春丹', 'pill']]);
  assert.ok(look.gained.items[0].art && look.gained.items[0].hint);
  assert.ok(look.cards_new.includes('mucao'));
});

test('a step that pays its thing, the rest (`more`) and 灵石 keeps them all; the count moves on with each step', () => {
  const exit = Object.values(content.chapters).flatMap((ch) => Object.values(ch.scenes ?? {})).flatMap((sc) => sc.exits ?? []).find((e) => e.grant?.more && e.grant?.wealth);
  assert.ok(exit, 'a scene exit with `more` and 灵石');
  const s = { ...atDiyilu(), gained: { n: 4, scene: 'x', items: [] } };
  const r = VERBS.resolve(s, content, ctx, { exit: 'save' });
  assert.equal(r.state.gained.n, 5, 'counted on');
  // gainsOf through the same door: an exit with all three, on a copy of the world where diyilu's way pays them.
  const world = structuredClone(content);
  const sc = world.chapters['00-waimen'].scenes['wm-diyilu'];
  sc.exits.find((e) => e.id === 'save').grant = { table: 'scene', item: 'mend-pill-9', wealth: 3, more: { 'tama-defu': 1, guoba: 2 } };
  const r2 = VERBS.resolve(atDiyilu(), world, ctx, { exit: 'save' });
  assert.deepEqual(r2.state.gained.items, [{ id: 'mend-pill-9', n: 1 }, { id: 'tama-defu', n: 1 }, { id: 'guoba', n: 2 }]);
  assert.ok(r2.state.gained.wealth > 0, '灵石 too');
});

test('the page plays every thing gained big, before the step\'s cards, from the same queue', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(src, /gainedThings\(look, seen\);\n\s*gainedCards\(look, seen\);/, 'things first, then cards, on every read');
  assert.match(src, /function gainedThings\(was, now\)[\s\S]*?g\.n === was\.gained\?\.n/, 'once per step: its count');
  assert.match(src, /x\?\.thing \? thingCard\(x\.thing\)/, 'a thing is drawn as a card is');
});
