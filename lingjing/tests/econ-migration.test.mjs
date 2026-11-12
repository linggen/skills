// v19 (2026-11-12, design.md § 耗材): a save from before the 耗材 numbers follows them — its 秘境令 and the key counter gone, the
// 聚灵阵 at its first level with today's draw unused, everything else kept; it then plays a 闭关 with 灵石 and a 秘境 run on 体力.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { migrate, newState, STATE_VERSION, threshold } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules.mjs';
import { VERBS } from '../scripts/rules/verbs.mjs';
import { settleCap } from '../scripts/rules/cap.mjs';
import { arrayHolds, julinBrief } from '../scripts/rules/seclusion.mjs';

const content = loadContent();
const M = content.mijing, J = content.balance.julin;
const NOW = new Date(2026, 10, 12, 9, 0);
const at = h => new Date(NOW.getTime() + h * 3600_000);
const ctx = (now = NOW) => ({ now, quests: [] });
const call = (verb, s, args, now = NOW) => VERBS[verb](s, content, ctx(now), args);

let cached = null;
/* A v18 save past 古五's 秘境 passage, standing at the stone door: 秘境令 in the bag, the day's key count, no 阵. */
function oldSave() {
  if (!cached) {
    process.env.LINGJING_STAMINA_LIMIT = '0';
    try { cached = playTo(content, newState(content, 'zh', NOW), 'wm-yaban', { now: NOW }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  }
  const s = structuredClone(cached);
  delete s.julin;
  return { ...s, version: 18, place: 'shimen', bag: { ...s.bag, [M.key]: 11 }, mijing: { ...s.mijing, drops: { day: '2026-11-11', n: 2 } }, wealth: 300, stamina: 100, stamina_at: NOW.toISOString() };
}

test('the rules are v19, and a v18 save is carried: its 秘境令 and key counter gone, the 阵 at its first level, the rest kept', () => {
  assert.equal(STATE_VERSION, 19);
  const old = oldSave(), m = migrate(old, content);
  assert.equal(m.version, 19);
  assert.equal(m.bag[M.key], undefined, 'the 秘境令 is simply gone');
  assert.equal(m.mijing?.drops, undefined, 'and the day\'s count of keys');
  assert.deepEqual(m.julin, { level: 1 }, 'the 阵 at its first level, nothing drawn today');
  assert.equal(m.econ_carry, undefined, 'the mark is let go');
  for (const k of ['tier', 'step', 'progress', 'wealth', 'chapter', 'scene', 'place', 'cards', 'done_scenes', 'stamina']) assert.deepEqual(m[k], old[k], k);
  const { [M.key]: _, ...bag } = old.bag;
  assert.deepEqual(m.bag, bag, 'every other thing in the bag kept');
  assert.equal(julinBrief(content, m, NOW).left_today, arrayHolds(content, m), 'today\'s cap unused');
  // A save already on v19 is not carried again.
  assert.deepEqual(migrate(m, content).julin, { level: 1 });
});

test('修为 past the new bar is the cap rule\'s on load, never the migration\'s: the bar full, the rest as 灵石', () => {
  const old = oldSave(), need = threshold(content, old);
  const m = migrate({ ...old, progress: need + 50 }, content);
  assert.equal(m.progress, need + 50, 'the migration leaves the bar as it stood');
  const settled = settleCap(content, m);
  assert.ok(settled.progress <= threshold(content, settled) || settled.step > m.step, 'the cap rule settles it');
  assert.ok(settled.wealth >= m.wealth);
});

test('the carried save plays: a 秘境 run paid at the door in 体力 (no 令 asked), then a 闭关 laying 灵石', () => {
  let s = migrate(oldSave(), content);
  const inn = call('mijing', s, { action: 'enter', tier: 1 });
  assert.ok(inn.result.ok, JSON.stringify(inn.result));
  assert.equal(inn.state.stamina, 100 - content.balance.mijing.door, 'the door\'s 体力, once');
  assert.equal(inn.state.mijing.run.door, content.balance.mijing.door);
  s = call('mijing', inn.state, { action: 'leave' }).state;
  s = call('mijing', s, { action: 'close' }).state ?? s;
  const holds = arrayHolds(content, s), wealth = s.wealth;
  assert.ok(holds > 0);
  const sat = call('seclude', s, { action: 'enter', focus: 'progress', stones: holds });
  assert.ok(sat.result.ok, JSON.stringify(sat.result));
  const out = call('seclude', sat.state, { action: 'leave' }, at(J.hours));
  const j = out.result.emerged.progress.julin;
  assert.equal(j.laid, holds);
  assert.equal(j.drawn + j.back, holds);
  assert.equal(j.stones, j.drawn * J.per_stone);
  assert.ok(out.state.wealth <= wealth - j.drawn + (out.result.emerged.progress.converted?.wealth ?? 0) + 1e-9);
});

test('a thing the world holds once (items.json `one`: the 九转筑基丹) held twice is brought down to one; one held stays', () => {
  const one = content.items.items.filter(i => i.one).map(i => i.id);
  assert.ok(one.includes('foundation-pill-9'), 'the 九转筑基丹 is a story thing, one of a kind');
  const old = oldSave();
  const two = migrate({ ...old, bag: { ...old.bag, 'foundation-pill-9': 2, 'qi-pill': 4 } }, content);
  assert.equal(two.bag['foundation-pill-9'], 1);
  assert.equal(two.bag['qi-pill'], 4, 'any other thing as it was');
  assert.equal(two.bag[M.key], undefined);
  assert.equal(migrate({ ...old, bag: { ...old.bag, 'foundation-pill-9': 1 } }, content).bag['foundation-pill-9'], 1);
});
