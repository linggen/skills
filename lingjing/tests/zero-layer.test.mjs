// 零层 (Hanli, 2026-10-15; story DESIGN: 主角零层入门, 九月十七 一夜小周天 → 一层):
// the gate admits him at 练气零层 — no 修为, no bar in the header — and 古四's
// one night of 小周天 (wm-zhoutian) lifts him to 练气一层, where the bar first
// stands. A save from before 零层 (v7) heals on load: before the 小周天 it reads
// 零层; past it, 一层; past a story rise to 二层 or more, the 层 it was named.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { cultivating, migrate, newState, realmName, threshold } from '../scripts/state.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { TO_OPEN, walk } from './prologue.mjs';

const content = loadContent();
const DAY1 = new Date('2026-09-29T09:00:00');
const ctx = { now: DAY1, quests: [] };
const fresh = s => ({ ...s, stamina: 100, stamina_at: DAY1.toISOString() });
const opened = (lang = 'zh') => fresh(walk(newState(content, lang, DAY1), TO_OPEN, content, DAY1));
function must(fn, s, args) {
  const out = fn(s, content, ctx, args);
  assert.equal(out.result.ok, true, `${fn.name} ${JSON.stringify(args)}: ${JSON.stringify(out.result).slice(0, 300)}`);
  return out;
}
/* Into 古四 and up to the woodpile: 欠条, 讲堂, then the 三关 board won. */
function toZhoutian(lang) {
  let s = opened(lang);
  for (const exit of ['owe', 'can']) s = must(resolve, s, { exit }).state;
  assert.equal(s.scene, 'wm-zhoutian');
  s = must(win, s, { id: 'zhoutian-sanguan' }).state;
  return must(task, s, { action: 'done', id: 'zhoutian-sanguan' }).state;
}
/* A save as v7 wrote it: the old ladder's step, no 零层. */
const v7 = (extra) => ({ ...newState(content, 'zh', DAY1), version: 7, chapter: '00-waimen', ended: ['00-prologue'], ...extra });

test('the gate admits him at 练气零层: the name in both languages, no 修为 bar, nothing grinds it', () => {
  const s = opened();
  assert.deepEqual([s.tier, s.step, s.progress], ['qi', 0, 0]);
  const l = look(s, content, ctx);
  assert.equal(l.tier.name, '练气零层');
  assert.equal(l.tier.bar, false, 'the header shows the realm, no bar');
  assert.equal(l.next, null);
  assert.equal(look(opened('en'), content, ctx).tier.name, 'Qi Condensation · Layer 0');
  assert.equal(cultivating(content, s), false);
});

test('古四\'s 小周天 lifts him to 练气一层 — the layer-gained moment, then the 40 fills it and the bar stands', () => {
  const s = toZhoutian('zh');
  assert.equal(s.step, 0, 'the 三关 board alone lifts nothing: 修为 waits for the night');
  const out = must(resolve, s, { exit: 'breathe' });
  assert.deepEqual([out.state.step, out.state.progress], [1, 40]);
  assert.deepEqual(out.result.rose, { from: '练气零层', to: '练气一层' });
  assert.equal(out.result.node?.rose?.to, '练气一层', 'the stage\'s moment carries the new layer');
  const l = look(out.state, content, ctx);
  assert.equal(l.tier.name, '练气一层');
  assert.equal(l.tier.bar, true);
  assert.deepEqual([l.progress, l.next], [40, content.ladder.tiers[0].thresholds[1]]);
  const en = must(resolve, toZhoutian('en'), { exit: 'breathe' });
  assert.deepEqual(en.result.rose, { from: 'Qi Condensation · Layer 0', to: 'Qi Condensation · Layer 1' });
});

test('an old save heals on load: before the 小周天 零层, past it 一层, past a story rise its own 层', () => {
  const heal = s => migrate(s, content);
  const name = s => realmName(content, s, 'zh');
  // Before the 小周天, at the gate's step 0: 零层, the 修为 it held kept unseen for the rise.
  const before = heal(v7({ scene: 'wm-zhoutian', done_scenes: ['wm-ahe', 'wm-jiangtang'], step: 0, progress: 20 }));
  assert.deepEqual([name(before), before.progress, 'ladder_zero' in before], ['练气零层', 20, false]);
  // Past it at the old 二层 (the off-by-one the 小周天's 40 made): 一层, its bar as full as it was
  // (v9 paceLayer, 2026-10-15: 10 of the old 50 is 40 of 200).
  const past = heal(v7({ scene: 'wm-qingshi', done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian'], step: 1, progress: 10 }));
  assert.deepEqual([name(past), past.step, past.progress], ['练气一层', 1, 40]);
  assert.equal(look(past, content, ctx).tier.bar, true);
  // Past it but still at the old 一层 (it filled less than 50): 一层, never 零层.
  const low = heal(v7({ scene: 'wm-qingshi', done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian'], step: 0, progress: 45 }));
  assert.deepEqual([name(low), low.progress], ['练气一层', 180]);
  // Past 古四's close (wm-diyilu's rise to 二层): the 层 the story named, the bar as full (30 of 60 is 175 of 350).
  const diyilu = heal(v7({ scene: 'wm-yaoyuan', done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian', 'wm-qingshi', 'wm-chaifang', 'wm-danlu', 'wm-diyilu'], step: 1, progress: 30 }));
  assert.deepEqual([name(diyilu), diyilu.progress], ['练气二层', 175]);
  // 古八's 腊八: 练气九层圆满 stays 九层圆满, ready for the cliff.
  const dabi = heal(v7({ chapter: '00-zhuji', scene: '09-cliff', ended: ['00-prologue', '00-waimen'], done_scenes: ['wm-xirang', '09-year', '09-dabi'], step: 8, progress: 130 }));
  assert.deepEqual([name(dabi), dabi.step, dabi.progress], ['练气九层圆满', 9, threshold(content, dabi)]);
  // A realm past 练气 is not touched.
  const zhuji = heal(v7({ chapter: '01-ji', tier: 'foundation', step: 0, progress: 100, done_scenes: ['09-dabi'] }));
  assert.deepEqual([zhuji.tier, zhuji.step, zhuji.progress], ['foundation', 0, 100]);
});

test('a healed save before the 小周天 plays on: the night lifts it to 一层 like a new one', () => {
  let s = toZhoutian('zh');
  s = migrate({ ...s, version: 7, step: 0, progress: 20 }, content);
  const out = must(resolve, s, { exit: 'breathe' });
  // 20 carried, 40 more: 60 toward 一层's 200 (2026-10-15: each 层 asks a 回's play).
  assert.deepEqual([realmName(content, out.state, 'zh'), out.state.step, out.state.progress], ['练气一层', 1, 60]);
});

test('Look\'s tier.step is the 层 the book names: 零层 0, 练气一层 1; above 练气, 筑基小成 1', () => {
  const at = (tier, step) => look({ ...opened(), tier, step, progress: 0 }, content, ctx).tier;
  assert.deepEqual([at('qi', 0).step, at('qi', 0).name], [0, '练气零层']);
  assert.deepEqual([at('qi', 1).step, at('qi', 1).name], [1, '练气一层']);
  assert.equal(at('foundation', 0).step, 1);
});
