// v18 (2026-11-10, Hanli: 「所有和数值相关的都应该有公式推到, 不能手动定」): every 层's threshold comes off the curve (tools/master.mjs
// curveOf), so a save made before it is read by the percent of its 层 — once, on load (state.mjs curveCarry): the 层 kept, the
// bar as full as it stood (a full bar full, one past the mark at a cap as far past), the stretch and the 丹田's bank by the same
// measure, each line's bar too; an older carry runs first on the ladder it was written for (ladderOf17). Never a real save:
// the fixtures here are tests/fixtures/saves/waimen.json stamped at v17 and set where each case stands.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { STATE_VERSION, migrate } from '../scripts/state.mjs';

const content = loadContent();
const base = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/waimen.json', import.meta.url), 'utf8'));
const tier = id => content.ladder.tiers.find(t => t.id === id);
const jinTier = id => content.ladder.lines.jin.tiers.find(t => t.id === id);
const was = (id, step) => tier(id).thresholds_were['18'][step];
const now = (id, step) => tier(id).thresholds[step];
const v17 = (extra = {}) => ({ ...structuredClone(base), version: 17, ...extra });
const pos = s => [s.tier, s.step, s.progress];

test('the ladder before the curve is kept (ladder.json thresholds_were["18"]) for every tier and every 今 tier, and the save version moved', () => {
  assert.ok(STATE_VERSION >= 18, 'v18 carried the curve (v19 since 2026-11-12: 耗材)');
  for (const t of content.ladder.tiers) assert.equal(t.thresholds_were?.['18']?.length, t.thresholds.length, t.id);
  for (const t of content.ladder.lines.jin.tiers) assert.equal(t.thresholds_were?.['18']?.length, t.thresholds.length, t.id);
  assert.deepEqual(tier('qi').thresholds_were['18'], [0, 470, 520, 570, 630, 690, 760, 830, 920, 1010], '练气 as it stood on 2026-11-10');
});

test('a v17 save keeps its 层 and its bar\'s percent: half of 三层 is half of 三层', () => {
  const s = migrate(v17({ tier: 'qi', step: 3, progress: Math.round(was('qi', 3) / 2) }), content);
  assert.deepEqual(pos(s), ['qi', 3, Math.round((Math.round(was('qi', 3) / 2) * now('qi', 3)) / was('qi', 3))]);
  assert.equal(s.version, STATE_VERSION);
  assert.equal('ladder_curve' in s, false, 'the mark goes once carried');
});

test('a full bar stays full, one past the mark at a cap as far past by the same measure, 零层 as it was', () => {
  const full = migrate(v17({ tier: 'qi', step: 6, progress: was('qi', 6) }), content);
  assert.deepEqual(pos(full), ['qi', 6, now('qi', 6)], '六层圆满 is 六层圆满');
  const past = migrate(v17({ tier: 'qi', step: 6, progress: was('qi', 6) + 76 }), content);
  assert.ok(past.progress > now('qi', 6), 'still past the mark');
  assert.equal(past.progress, Math.round(((was('qi', 6) + 76) * now('qi', 6)) / was('qi', 6)));
  const zero = migrate(v17({ tier: 'qi', step: 0, progress: 20 }), content);
  assert.deepEqual(pos(zero), ['qi', 0, 20], '零层 holds what it held, unseen (no threshold to read it by)');
  const peak = migrate(v17({ tier: 'qi', step: 9, progress: was('qi', 9) }), content);
  assert.deepEqual(pos(peak), ['qi', 9, now('qi', 9)], '练气圆满 at the cliff can still throw');
  const fd = migrate(v17({ tier: 'foundation', step: 4, progress: 100 }), content);
  assert.deepEqual(pos(fd), ['foundation', 4, Math.round((100 * now('foundation', 4)) / was('foundation', 4))], 'a realm in 段 too');
});

test('the stretch over each step\'s mark, the 丹田\'s bank and the 今 line\'s bar by the same measure', () => {
  const s = migrate(v17({ tier: 'qi', step: 5, progress: 300, banked: 69, stretch: { 'qi:5': 69, 'qi:4': 63 }, lines: { jin: { tier: 'xinsheng', step: 2, progress: 30, stretch: { 'xinsheng:2': 6 } } } }), content);
  const k = now('qi', 5) / was('qi', 5);
  assert.equal(s.progress, Math.round(300 * k));
  assert.equal(s.banked, Math.round(69 * k));
  assert.deepEqual(s.stretch, { 'qi:5': Math.round(69 * k), 'qi:4': Math.round((63 * now('qi', 4)) / was('qi', 4)) });
  const J = jinTier('xinsheng'), kj = J.thresholds[2] / J.thresholds_were['18'][2];
  assert.deepEqual(s.lines.jin, { tier: 'xinsheng', step: 2, progress: Math.round(30 * kj), stretch: { 'xinsheng:2': Math.round(6 * kj) } });
});

test('once: a carried save loaded again is the same; never a 层 lost', () => {
  const s = migrate(v17({ tier: 'qi', step: 7, progress: 500 }), content);
  assert.deepEqual(migrate(s, content), s);
  for (let step = 1; step <= 9; step++) {
    const m = migrate(v17({ tier: 'qi', step, progress: was('qi', step) - 1 }), content);
    assert.equal(m.step, step, `练气${step}层 stays`);
    assert.ok(m.progress <= now('qi', step), 'and is not pushed past its new mark');
  }
});

test('an older save is carried by its own carry on the ladder of v17 first, then onto the curve — one percent, not two', () => {
  // A v13 save (ladder_pace 13): its bar read against v13's 练气 (thresholds_were["13"]), as full as it stood there.
  const old = { ...v17({ tier: 'qi', step: 4, progress: 265 }), version: 12 };
  const s = migrate(old, content);
  const w13 = tier('qi').thresholds_were['13'][4];
  assert.equal(s.step, 4);
  assert.equal(s.progress, Math.round(Math.round((265 * was('qi', 4)) / w13) * now('qi', 4) / was('qi', 4)), 'half of v13\'s 四层 is half of the curve\'s');
  assert.ok(Math.abs(s.progress / now('qi', 4) - 265 / w13) < 0.01);
});
