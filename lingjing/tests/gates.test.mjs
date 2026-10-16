// 阶段任务 — the 修为 stage quest (Hanli, 2026-10-15; rules/gates.mjs, ladder.json caps.hui.<回>.gates):
// each 回's next story stage waits on 圆满 of the layer he holds. Refused `stage` in the world's
// words until the bar is full; the 事 book shows it with its progress, 下一步 and Ling point to
// where 修为 is earned; a scene already passed is never gated again. Declared, never named in code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState, threshold } from '../scripts/state.mjs';
import { look, move, resolve } from '../scripts/rules.mjs';
import { gatesOf, stageGate, stageNow } from '../scripts/rules/gates.mjs';
import { rerunHere } from '../scripts/rules/rerun.mjs';
import { WORDS, bookPopHtml } from '../scripts/cards.js';

const content = loadContent();
const NOW = new Date('2026-10-16T12:00:00');
const ctx = { now: NOW, quests: [] };
const ROOTS = ['wood', 'water', 'fire', 'earth', 'metal'];
const th = content.ladder.tiers[0].thresholds;
/* 古四's 柴房 night: the beat that ends in 第一路's rise to 二层 waits on 一层圆满 (its entry: he can walk away to earn it). */
const atChaifang = (progress, extra = {}) => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: 'wm-chaifang', place: 'chaifang', ended: ['00-prologue'],
  done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian', 'wm-qingshi', 'wm-yaoyuan'], tier: 'qi', step: 1, progress, traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString(), ...extra });

test('every 回 past 古三 holds one (古九 aside: the 九转 lands it full); 古七\'s four as the book\'s layers come — the data, linted', () => {
  const by = {};
  for (const g of gatesOf(content)) (by[g.hui] ??= []).push(`${g.scene}@${g.layer}`);
  assert.deepEqual(by, {
    h05: ['wm-chaifang@1'], h07: ['wm-mijing@2'], h08: ['wm-qianye@4'],
    h11: ['09-furnace@4', '09-year@4', '09-yishui@5', '09-futian@6'], h09: ['09-dabi@7'],
  });
  assert.equal(content.ladder.caps.hui.h11.layer, 6, '古七 grinds to 六层 (its rises come behind its gates)');
  // Nothing in the rules names a 回 or a scene of them.
  const code = fs.readFileSync(new URL('../scripts/rules/gates.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /wm-|09-|'h\d\d'/);
});

test('the 柴房 night waits on 一层圆满: refused in the world\'s words with where he stands, then open once the bar is full', () => {
  const short = resolve(atChaifang(th[1] - 30), content, ctx, { exit: 'count' });
  assert.equal(short.result.refused, 'stage');
  assert.match(short.result.say, /阶段任务.*练气一层圆满/);
  assert.deepEqual(short.result.stage.now, { step: '练气一层', progress: th[1] - 30, of: th[1] });
  assert.equal(short.result.stage.met, false);
  const full = resolve(atChaifang(th[1]), content, ctx, { exit: 'count' });
  assert.equal(full.result.ok, true, JSON.stringify(full.result));
  assert.equal(full.state.scene, 'wm-danlu');
  assert.match(resolve({ ...atChaifang(0), lang: 'en' }, content, ctx, { exit: 'count' }).result.say, /Stage quest.*Layer 1, Consummation/);
});

test('a scene already passed is never gated again (a save above a new gate keeps its place); one past the layer walks through', () => {
  const passed = atChaifang(0, { done_scenes: [...atChaifang(0).done_scenes, 'wm-chaifang'] });
  assert.equal(stageGate(content, passed, 'wm-chaifang', 'count'), null);
  assert.equal(stageGate(content, atChaifang(0, { step: 2 }), 'wm-chaifang', 'count'), null, 'already 二层');
  assert.ok(stageGate(content, atChaifang(0), 'wm-chaifang', 'count'));
});

test('the 事 book holds it: 阶段任务 · 练气一层圆满, where he stands, and the walk to where 修为 is earned; full, it reads 已圆满', () => {
  const left = move(atChaifang(40), content, ctx, { place: 'houshan' });
  assert.equal(left.result.ok, true, JSON.stringify(left.result).slice(0, 200));
  const away = left.state, l = look(away, content, ctx);
  assert.deepEqual([l.stage_quest.step, l.stage_quest.met, l.stage_quest.now.progress], ['练气一层圆满', false, 40]);
  // Away from the scene, the goal line is the stage quest's (下一步), and the work it points at raises 修为.
  assert.equal(l.waypoint.gate.kind, 'stage');
  const html = bookPopHtml({ look: l, lang: 'zh', words: { ...WORDS.zh, xw: '修为', ls: '灵石', qi: '体力' } });
  assert.match(html, /阶段任务 · 坐到练气一层圆满/);
  assert.match(html, /t-stage[^>]*>阶段<[\s\S]*阶段任务 · 练气一层圆满[\s\S]*如今 练气一层 · 40\//);
  const full = look({ ...away, progress: th[1] }, content, ctx);
  assert.equal(full.stage_quest.met, true);
  assert.equal(full.waypoint.gate, undefined, 'full: the road to the story again');
  assert.match(bookPopHtml({ look: full, lang: 'zh', words: { ...WORDS.zh, xw: '修为', ls: '灵石', qi: '体力' } }), /已圆满 · 往下走/);
  // Past its scene, the 回 has no stage quest left.
  assert.equal(stageNow(content, { ...away, done_scenes: [...away.done_scenes, 'wm-chaifang'] }), null);
});

test('古七 on the stage quests: the furnace\'s 定风 waits on 四层圆满, the 沂水 night on 五层圆满, the autumn on 六层圆满', () => {
  const at = (scene, step, progress, done = []) => ({ ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene, place: 'houshan', ended: ['00-prologue', '00-waimen'],
    done_scenes: ['09-snow', '09-jiuge', ...done], tier: 'qi', step, progress, traits: ROOTS });
  assert.equal(stageGate(content, at('09-furnace', 4, 10), '09-furnace', 'fire').layer, 4);
  assert.equal(stageGate(content, at('09-furnace', 4, th[4]), '09-furnace', 'fire'), null);
  assert.equal(stageGate(content, at('09-yishui', 5, 0), '09-yishui', 'night').layer, 5);
  const s = at('09-futian', 6, 10);
  assert.equal(stageGate(content, s, '09-futian', 'spar').layer, 6);
  assert.equal(threshold(content, s), th[6]);
});

test('the 秘境 rerun stays a slot of the routine through 古七 and 古八 (the same 观): open in 00-zhuji too, never in 冀', () => {
  const s = (chapter, ended) => ({ ...newState(content, 'zh', NOW), chapter, scene: null, ended, done_scenes: [] });
  assert.ok(rerunHere(content, s('00-zhuji', ['00-prologue', '00-waimen'])));
  assert.equal(rerunHere(content, s('01-ji', ['00-prologue', '00-waimen', '00-zhuji'])), null);
});
