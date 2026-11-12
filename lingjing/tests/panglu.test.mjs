// 旁炉 · 炸炉 (design.md § 丹药 【已建】; story DESIGN § 六·五 「凡人丹炉十炉炸七」; 09-laba 「料你自己碾，火你自己看。
// 炼糊了，碾了做药引。」): the 丹房's side furnace, his from 09-laba, where a place `has.furnace` (the 药园, where the 丹房's
// scenes stand). One herb a batch; the rules roll 炸 · 糊 · 一转 · 二转 from the band his count has reached — 二转 only
// after 闵丹师's 「首尾武，中间文」 (`lesson`); a 炸 costs the herb and a little 体力, nothing more; never the 饭桶.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSave } from '../scripts/rules/worlds.mjs';
import { loadContent, lint } from '../scripts/content.mjs';
import { newState, staminaCost } from '../scripts/state.mjs';
import { look, VERBS } from '../scripts/rules.mjs';
import { bandOf, OUTCOMES, pangluOpen, rollBatch } from '../scripts/rules/panglu.mjs';
import { notePage } from '../scripts/rules/did.mjs';

const offContent = loadContent();
const content = { ...offContent, panglu: { ...offContent.panglu, on: true } };
const T = content.panglu;
const T0 = new Date('2026-10-31T10:00:00');
const day = n => new Date(T0.getTime() + n * 86_400_000);
const ctx = (now = T0) => ({ now, quests: [] });
const save = (extra = {}) => ({
  ...newState(content, 'zh', T0), name: '清玄', traits: ['metal', 'wood', 'water', 'fire', 'earth'], tier: 'qi', step: 8, progress: 0,
  chapter: '01-ji', scene: null, place: 'yaoyuan', ended: ['00-prologue', '00-waimen', '00-zhuji'], done_scenes: ['09-laba'],
  bag: { danlu: 1, huangjing: 20, fuling: 3 }, stamina: 100, stamina_at: T0.toISOString(), ...extra,
});
const fire = (s, id = 'huangjing', now = T0) => VERBS.panglu(s, content, ctx(now), { action: 'fire', id });

test('off: no Look or gear offer, no pane, no action or cost; old save survives loading', async () => {
  assert.equal(offContent.panglu.on, false);
  const old = { n: 12, day: '2026-10-31', today: 1, made: { hu: 4, yi: 8 } };
  const s = save({ panglu: old }), before = structuredClone(s);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panglu-save-'));
  try {
    const file = path.join(dir, 'old.json');
    fs.writeFileSync(file, JSON.stringify({ id: 'old', kind: 'named', state: s }));
    const loaded = readSave(file).state;
    assert.deepEqual(loaded.panglu, old);
    const l = look(loaded, offContent, ctx());
    assert.equal(l.panglu, undefined);
    const gear = VERBS.gear(loaded, offContent, ctx()).result.gear;
    assert.equal(gear.panglu, undefined);
    const { pouchHtml } = await import('../scripts/pouch.js');
    const { WORDS } = await import('../scripts/cards.js');
    assert.doesNotMatch(pouchHtml({ lang: 'zh', words: WORDS.zh, look: l, gear }, { pane: 'panglu' }), /data-pouch-pane="panglu"/);
    for (const action of ['look', 'fire', 'invalid']) {
      const r = VERBS.panglu(loaded, offContent, ctx(), { action, id: 'huangjing' });
      assert.equal(r.result.refused, 'off');
      assert.equal(r.state, null);
      assert.equal(notePage('panglu', { action }, r.result, loaded, offContent, T0), null);
    }
    assert.deepEqual(loaded.panglu, old);
    assert.deepEqual(s, before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the table: herbs the world has, no shelf sells; bands climb, 二转 only from the lesson; outs are items; the lint holds', () => {
  assert.ok(T, 'worlds/jiuding/panglu.json loads');
  assert.deepEqual(lint(content), []);
  const items = new Map(content.items.items.map(i => [i.id, i]));
  for (const id of T.herbs) {
    assert.ok(items.get(id), id);
    assert.deepEqual(items.get(id).sold ?? [], [], `${id}: no shelf sells it`);
    assert.ok(content.fantong.kinds.herb.items.includes(id), `${id} is a herb`);
  }
  for (const o of Object.values(T.outs)) assert.ok(items.get(o.item), o.item);
  assert.equal(items.get('yaoyin').kind, 'material');
  assert.equal(items.get('qi-pill-2').zhuan, 2);
  for (const b of T.bands) {
    assert.ok(Object.keys(b.odds).every(k => OUTCOMES.includes(k)));
    assert.equal(b.odds.er > 0, b.from >= T.lesson, `band from ${b.from}: 二转 only after the lesson`);
  }
  assert.ok(content.places['徐'].places.find(p => p.id === 'yaoyuan').has.furnace);
  assert.ok(staminaCost(content, 'panglu') > 0);
});

test('closed before 09-laba, and anywhere but the furnace; the 物品 panel and Look show it only there', () => {
  const early = save({ done_scenes: [] });
  assert.equal(VERBS.panglu(early, content, ctx(), { action: 'look' }).result.refused, 'not-yet');
  assert.ok(!pangluOpen(content, early));
  const away = save({ place: 'houshan' });
  const r = VERBS.panglu(away, content, ctx(), { action: 'fire', id: 'huangjing' });
  assert.equal(r.result.refused, 'not-here');
  assert.match(r.result.say, /丹房/);
  assert.ok(!VERBS.gear(away, content, ctx()).result.gear.panglu);
  assert.ok(VERBS.gear(save(), content, ctx()).result.gear.panglu);
  assert.equal(look(away, content, ctx()).panglu, undefined);
  const l = look(save(), content, ctx()).panglu;
  assert.ok(l, 'Look at the 药园');
  assert.deepEqual(l.herbs.map(h => h.id).sort(), ['fuling', 'huangjing']);
  assert.equal(l.left, T.per_day);
  assert.match(l.line, /料你自己碾/);
});

test('a batch: one herb spent, the outcome rolled from the band, what it comes to into the bag; the count grows', () => {
  const s = save(), r = fire(s);
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.ok(OUTCOMES.includes(r.result.outcome));
  assert.equal(r.state.bag.huangjing, 19);
  assert.equal(r.state.panglu.n, 1);
  const out = T.outs[r.result.outcome];
  if (out) assert.equal(r.state.bag[out.item], (s.bag[out.item] ?? 0) + 1);
  assert.ok(r.result.say);
  // Same day, same count, same herb: the same batch — firing again never re-rolls.
  assert.equal(fire(s).result.outcome, r.result.outcome);
  assert.equal(rollBatch(T, { seed: 'a|b', fired: 0 }), rollBatch(T, { seed: 'a|b', fired: 0 }));
  // Refused: a thing not a herb of the table, a herb he does not hold.
  assert.equal(fire(s, 'lingzhi').result.refused, 'not-herb');
  assert.equal(fire(s, 'chaihu').result.refused, 'no-herb');
});

test('per_day batches a day, then 「明天再来」; the next day opens again', () => {
  let s = save();
  for (let i = 0; i < T.per_day; i++) { const r = fire(s); assert.equal(r.result.ok, true); s = r.state; }
  const full = fire(s);
  assert.equal(full.result.refused, 'full');
  assert.match(full.result.say, /明天/);
  assert.equal(fire(s, 'huangjing', day(1)).result.ok, true);
});

test('each outcome: 炸 costs the herb and 体力 only; 糊 gives 药引; 一转 聚气丹; 二转 only after the lesson', () => {
  const seen = {};
  for (let n = 0; n < 400; n++) {
    const fired = n % 24, s = save({ name: `p${n}`, panglu: { n: fired } }), r = fire(s);
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    const o = r.result.outcome;
    seen[o] = (seen[o] ?? 0) + 1;
    if (o === 'er') assert.ok(fired >= T.lesson, `二转 at ${fired}`);
    if (o === 'zha') {
      assert.equal(r.state.stamina, 100 - staminaCost(content, 'panglu'), '炸: 体力');
      assert.equal(r.result.out, undefined, '炸: nothing');
      assert.deepEqual(Object.keys(r.state.bag).sort(), Object.keys(s.bag).sort(), '炸: nothing else in or out');
      assert.equal(r.state.progress, s.progress);
    } else assert.equal(r.state.stamina, 100, 'only a 炸 costs 体力');
    if (o === 'hu') assert.equal(r.result.out.id, 'yaoyin');
    if (o === 'yi') assert.equal(r.result.out.id, 'qi-pill');
    if (o === 'er') assert.equal(r.result.out.id, 'qi-pill-2');
    assert.equal(r.state.progress, s.progress, 'a batch pays no 修为 — only a pill eaten does');
    assert.deepEqual(r.state.fantong, s.fantong, 'the 饭桶 untouched');
  }
  for (const o of OUTCOMES) assert.ok(seen[o] > 0, `${o} came up`);
});

test('the odds move with his count: 炸 falls, pills rise; 闵丹师\'s 「首尾武，中间文」 said on the batch that reaches the lesson', () => {
  const zha = n => bandOf(T, n).odds.zha / Object.values(bandOf(T, n).odds).reduce((a, b) => a + b, 0);
  assert.ok(zha(0) > zha(T.lesson) && zha(T.lesson) > zha(100));
  assert.equal(bandOf(T, T.lesson - 1).odds.er ?? 0, 0);
  assert.ok(bandOf(T, T.lesson).odds.er > 0);
  const r = fire(save({ panglu: { n: T.lesson - 1 } }));
  assert.match(r.result.lesson, /首尾武，中间文/);
  assert.match(r.result.say, /首尾武/);
  assert.equal(r.result.panglu.taught, true);
  assert.equal(fire(save({ panglu: { n: T.lesson } })).result.lesson, undefined, 'once');
});

test('at an empty pool a 炸 is refused whole — nothing spent, the same batch waits', () => {
  // find a save whose first batch is a 炸
  let s = null;
  for (let n = 0; n < 200 && !s; n++) { const t = save({ name: `z${n}` }); if (fire(t).result.outcome === 'zha') s = t; }
  assert.ok(s);
  const tired = { ...s, stamina: 0, resting: true };
  const r = VERBS.panglu(tired, content, ctx(), { action: 'fire', id: 'huangjing' });
  assert.equal(r.result.refused, 'no-stamina');
  assert.equal(r.state ?? null, null, "nothing written");
});

test('Ling reads the page\'s batch as a fact', () => {
  const s = save(), r = fire(s);
  const next = notePage('panglu', { action: 'fire', id: 'huangjing' }, r.result, r.state, content, T0);
  assert.match(next.page_did.at(-1).what, /旁炉/);
});

test('the Mac pane: the 储物袋 has a 旁炉 tab only at the furnace; a button per herb, none on a full day; the last batch said', async () => {
  const { pouchHtml } = await import('../scripts/pouch.js');
  const { pangluHtml } = await import('../scripts/panglu.js');
  const { WORDS } = await import('../scripts/cards.js');
  const s = save(), l = look(s, content, ctx()), g = VERBS.gear(s, content, ctx()).result.gear;
  const html = pouchHtml({ lang: 'zh', words: WORDS.zh, look: l, gear: g, pangluLast: { outcome: 'zha', say: '「嘭」' } }, { pane: 'panglu' });
  assert.match(html, /data-pouch-pane="panglu"/);
  assert.match(html, /data-panglu-fire="huangjing"/);
  assert.match(html, /炸炉/);
  const away = save({ place: 'houshan' });
  assert.doesNotMatch(pouchHtml({ lang: 'zh', words: WORDS.zh, look: look(away, content, ctx()), gear: VERBS.gear(away, content, ctx()).result.gear }, {}), /panglu/);
  const full = pangluHtml({ ...l.panglu, ready: false, left: 0, wait: '明天再来' }, null, 'zh');
  assert.match(full, /disabled/);
  assert.match(full, /明天再来/);
});
