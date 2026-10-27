// 阶段任务 handed in, and no story rise (Hanli, 2026-10-16). His save at 古八 · 药园 · 又三年, 练气九层,
// showed 「阶段 阶段任务 · 练气七层圆满 — 已圆满 · 往下走」 with no 交差 and no pay: 「七层圆满的任务大成了应该可以交任务
// 拿奖励. 现在已经9层了, 8层的任务应该也完成了.」 Then 「入秋 · 九层圆满」 jumped him to 圆满: 「要让玩家去刷经验/修为等.
// 不要直接跳层」. So: a stage quest met is 可交 and pays 灵石 (balance.json pay.stage) once; one behind him never
// handed in is settled once on the next load; the open row is the next gate where he stands, never a layer
// he has passed; and no story choice raises 修为 or 层 — every rise the book had is a gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lint, loadContent } from '../scripts/content.mjs';
import { newState, stepOfLayer, threshold } from '../scripts/state.mjs';
import { look, quest, resolve } from '../scripts/rules.mjs';
import { gateKey, gatesOf, settleStages, stageNow } from '../scripts/rules/gates.mjs';
import { huiOrder } from '../scripts/rules/hui.mjs';
import { WORDS, bookPopHtml } from '../scripts/cards.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date('2026-10-16T12:00:00');
const ctx = { now: NOW, quests: [] };
const PAY = content.rewards.tables.stage.wealth;
const scenesOf = id => Object.keys(content.chapters[id].scenes);

/* His save's shape (10-16): 古八's 09-dabi, 腊八 taken (y-dabi), 练气九层 with nothing in it; the 古七 scenes
   passed on the older graph (09-yishui, 09-futian never in done_scenes). No stage quest ever paid. */
const his = (extra = {}) => ({ ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: '09-dabi', place: 'yaoyuan', ended: ['00-prologue', '00-waimen'],
  done_scenes: [...scenesOf('00-prologue'), ...scenesOf('00-waimen'), '09-snow', '09-furnace', '09-year'], marks: ['y-futian', 'y-dabi'],
  tier: 'qi', step: 9, progress: 0, wealth: 112, traits: ['metal', 'wood', 'water', 'fire', 'earth'], stamina: 100, stamina_at: NOW.toISOString(),
  // 守炉 · 丹房看炉 played (2026-10-21: 入秋 waits on 09-dabi's board; a save standing here is offered it on load).
  tasks: { 'danfang-kanlu': { status: 'done' } }, ...extra });
const words = { ...WORDS.zh, xw: '修为', ls: '灵石', qi: '体力' };

test('the pay is declared: balance.json pay.stage, 灵石 only (at 圆满 修为 cannot rise)', () => {
  assert.equal(content.rewards.tables.stage.progress, 0);
  assert.ok(PAY > 0);
});

test('his save at 九层 in 古八: the gates behind him are paid once on load, with a note; the open row is 九层圆满, never 七层', () => {
  const owed = gatesOf(content).filter(g => huiOrder(content, g.hui) < huiOrder(content, 'h09') || gateKey(g) === '09-dabi/dabi');
  const healed = settleStages(content, his(), NOW);
  assert.equal(healed.wealth, 112 + owed.length * PAY, 'each gate behind him, once');
  assert.deepEqual([...healed.stages].sort(), owed.map(gateKey).sort());
  assert.equal(healed.stage_back.n, owed.length);
  assert.ok(healed.stage_back.steps.includes('练气八层圆满'), '腊八\'s 八层 too: he is past it');
  // Never twice.
  assert.equal(settleStages(content, healed, new Date(NOW.getTime() + 3_600_000)), healed, 'nothing more owed: the same save back');
  const row = stageNow(content, healed);
  assert.equal(row.step, '练气九层圆满');
  assert.equal(row.met, false);
  const l = look(healed, content, ctx);
  assert.equal(l.stage_quest.step, '练气九层圆满');
  assert.ok(l.stage_quest.work?.place?.id, 'and it points to where 修为 is earned');
  assert.deepEqual(l.stages_paid, ['练气八层圆满'], '已交 in this 回');
  assert.equal(l.stage_back.wealth, owed.length * PAY);
  const html = bookPopHtml({ look: l, lang: 'zh', words });
  assert.doesNotMatch(html, /七层圆满/, 'no stale row');
  assert.match(html, /补发 · 先前过的\d+件阶段任务/);
  assert.match(html, /阶段任务 · 练气九层圆满/);
});

test('入秋 waits on 九层圆满 — the choice is the beat\'s name, refused with the 阶段任务 line until he earns it; it raises nothing', () => {
  const exit = content.chapters['00-zhuji'].scenes['09-dabi'].exits.find(e => e.id === 'ruqiu');
  assert.deepEqual(exit.label, { zh: '入秋', en: 'Autumn' });
  const short = resolve(his({ progress: 100 }), content, ctx, { exit: 'ruqiu' });
  assert.equal(short.result.refused, 'stage');
  assert.match(short.result.say, /阶段任务：先修炼到练气九层圆满/);
  const full = his({ progress: threshold(content, his()) });
  const on = resolve(full, content, ctx, { exit: 'ruqiu' });
  assert.equal(on.result.ok, true, JSON.stringify(on.result).slice(0, 300));
  assert.deepEqual([on.state.tier, on.state.step, on.state.progress], [full.tier, full.step, full.progress], 'the story moved nothing');
});

test('a stage quest met is 可交: 交差 pays 灵石 once and moves it to 已交', () => {
  const s = settleStages(content, his(), NOW);
  const full = { ...s, progress: threshold(content, s) };
  const row = stageNow(content, full);
  assert.equal(row.met, true);
  assert.deepEqual(row.pays, { wealth: PAY });
  const before = bookPopHtml({ look: look(full, content, ctx), lang: 'zh', words });
  assert.match(before, /可交[\s\S]*阶段任务 · 练气九层圆满[\s\S]*已圆满 · 交差领赏[\s\S]*data-do="turn" data-id="stage"/);
  const turned = quest(full, content, ctx, { id: 'stage', action: 'turn' });
  assert.equal(turned.result.ok, true);
  assert.equal(turned.result.paid.wealth, PAY);
  assert.equal(turned.state.wealth, full.wealth + PAY);
  assert.equal(turned.state.progress, full.progress, '修为 untouched');
  const after = look(turned.state, content, ctx);
  assert.equal(after.stage_quest, undefined, '古八 has no gate left');
  assert.deepEqual(after.stages_paid, ['练气八层圆满', '练气九层圆满']);
  assert.match(bookPopHtml({ look: after, lang: 'zh', words }), /已交[\s\S]*阶段任务 · 练气九层圆满/);
  assert.equal(quest(turned.state, content, ctx, { id: 'stage', action: 'turn' }).result.refused, 'no-stage', 'never twice');
  assert.equal(quest(his({ progress: 5 }), content, ctx, { id: 'stage', action: 'turn' }).result.refused, 'not-done');
  // Walked on without 交差: the next load settles it, once.
  const walked = resolve(full, content, ctx, { exit: 'ruqiu' }).state;
  const settled = settleStages(content, walked, NOW);
  assert.ok(settled.stages.includes('09-dabi/ruqiu'));
  assert.equal(settleStages(content, settled, NOW), settled);
});

test('the heal runs on the next load through the rules\' door, and pays exactly once', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-stage-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
  const file = path.join(data, 'state.json'), state = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...his(), version: 10 }));
  const first = cli('look');
  const paid = state().wealth;
  assert.ok(paid > 112, `paid on the load: ${paid}`);
  assert.equal(first.stage_back.wealth, paid - 112);
  assert.equal(state().step, 9, 'his 层 kept');
  cli('look');
  assert.equal(state().wealth, paid, 'a second load pays nothing');
  fs.rmSync(data, { recursive: true, force: true });
});

test('no story choice in 卷一 raises 修为 or 层: no rise but 入门 (零层 → 一层), no 修为 granted, no step filled — linted', () => {
  assert.deepEqual(lint(content), []);
  const first = content.ladder.tiers[0];
  for (const ch of Object.values(content.chapters).filter(c => c.juan === 1)) for (const sc of Object.values(ch.scenes)) {
    if (!sc.hui) continue;
    for (const e of sc.exits) {
      const where = `${sc.id}/${e.id}`;
      if (e.rise != null) assert.ok(first.zero && e.rise === 1, `${where}: only 入门 rises`);
      assert.ok(!e.grant?.progress, `${where}: grants 修为`);
      assert.equal(e.fill, undefined, `${where}: fills a step`);
      const item = e.grant?.item ? content.items.items.find(i => i.id === e.grant.item) : null;
      assert.equal(item?.fill, undefined, `${where}: ${item?.id} fills a step`);
    }
  }
  // The broken lint: a rise put back is refused.
  const bad = structuredClone(content);
  bad.chapters['00-zhuji'].scenes['09-dabi'].exits.find(e => e.id === 'ruqiu').rise = { layer: 9, full: true };
  assert.ok(lint(bad).some(x => /09-dabi exit ruqiu: the story raises a layer/.test(x)));
});

test('every rise the book had is a gate: at that choice, or — inside a locked beat — the next gate on, asking that layer or more', () => {
  const gates = gatesOf(content), first = content.ladder.tiers[0].id;
  let n = 0;
  for (const ch of Object.values(content.chapters).filter(c => c.juan === 1)) for (const sc of Object.values(ch.scenes)) {
    for (const e of sc.exits.filter(x => x.was_rise != null)) {
      n += 1;
      const r = e.was_rise, want = typeof r === 'object' ? r.layer : r - 1; // 「to N」 is N−1 full; 「to N, full」 is N full
      const here = gates.find(g => g.scene === sc.id && g.exits.includes(e.id));
      if (here) { assert.ok(here.layer >= want, `${sc.id}/${e.id}: gate ${here.layer} < ${want}`); continue; }
      const locked = (ch.beats ?? []).some(b => b.scenes.indexOf(sc.id) > 0);
      assert.ok(locked, `${sc.id}/${e.id}: no gate at the choice, and it is not inside a locked beat`);
      const next = gates.filter(g => huiOrder(content, g.hui) > huiOrder(content, sc.hui))
        .sort((a, b) => huiOrder(content, a.hui) - huiOrder(content, b.hui))[0];
      assert.ok(next && next.layer >= want && stepOfLayer(content, first, next.layer) >= 0, `${sc.id}/${e.id}: the next gate (${next?.scene}@${next?.layer}) asks ${want} or more`);
    }
  }
  assert.equal(n, 8, 'the eight rises 卷一 had past 入门');
});
