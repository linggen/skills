// Each line its own 修为 and ladder (Hanli 2026-10-27, story 宇宙.md § 三条线，各自一套修为与境界; 2026-10-28: 「今线修为可以开始
// 做了」; rules/lines.mjs):
// 1. the 今 has its own ladder — 新生 · 立身 · 成器 · 立业 · 通达 · 担当 · 有容 · 知命 · 从心, 新生 in nine 层 from 一层 — and the
//    save its own place on it (`lines.jin`), from zero; the 古 stays the save's own fields;
// 2. a save from before (v13, 古五 二层 as the builder's own) keeps its 古 exactly and starts the 今 at zero;
// 3. a 今 board pays the 今 by its minutes on the 今 ladder, never the 古 and never 灵石;
// 4. on a 今 scene the strip reads 「沈芒 新生一层 · 修为 x/y」; on the 古 it is as it was; a 今 rise is one plain fact;
// 5. the numbers report has a 今 column, and 卷一's 今 takes a reader from 新生一层 into 二层.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { migrate, newState, STATE_VERSION } from '../scripts/state.mjs';
import { look, resolve } from '../scripts/rules.mjs';
import { boardLine, lineGrant, lineWorld } from '../scripts/rules/lines.mjs';
import { barOf, stands } from '../scripts/stage.mjs';
import { lineColumns } from '../tools/numbers.mjs';
import { throughJin } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-10-28T10:00:00');
const ctx = { now: NOW, quests: [] };
const ROOT = path.resolve(import.meta.dirname, '..');
const gu = s => ({ tier: s.tier, step: s.step, progress: s.progress, stretch: s.stretch });
const lookOf = s => { const r = look(s, content, ctx); return r.result ?? r; };

/* 古二's last scene, 银月 found: the next step is 今 · 一 (as side-line.test.mjs). */
const beforeJin = () => ({ ...newState(content, 'zh', NOW), chapter: '00-prologue', scene: '00-notice', place: 'shiao', done_scenes: ['00-uncle'], companion: { joined: '2026-10-01', awake: true }, tasks: { 'notice-shuitong': { status: 'done' }, 'notice-wupo': { status: 'done' } } });
/* 今 · 三, past 入门, the 古 at 练气五层 with 修为 in hand. */
const inJin3 = () => migrate({ ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: 'j07-ankle', place: 'houshan', ended: ['00-prologue', '00-waimen'], done_scenes: ['wm-heluo'], tier: 'qi', step: 5, progress: 100, stretch: { 'qi:5': 6 }, wealth: 40 }, content);

test('the 今 has its own ladder, named as 宇宙.md names it, and the save its own place on it from zero', () => {
  const jin = content.ladder.lines.jin;
  assert.deepEqual(jin.tiers.map(t => t.name.zh), ['新生', '立身', '成器', '立业', '通达', '担当', '有容', '知命', '从心']);
  assert.deepEqual(jin.tiers[0].steps.zh, ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层'], '新生 has nine 层 from 一层: no 零层');
  for (const t of jin.tiers.slice(1)) assert.deepEqual(t.steps.zh, ['小成', '中成', '大成'], `${t.name.zh}: three steps`);
  assert.ok(jin.tiers.every(t => !t.zero && t.thresholds.length === t.steps.zh.length && t.thresholds.every(x => x > 0)));
  const ids = [...content.ladder.tiers, ...jin.tiers].map(t => t.id);
  assert.equal(new Set(ids).size, ids.length, 'a line\'s tier ids are its own');
  assert.equal(content.people.people.find(p => p.id === jin.hero)?.name.zh, '沈芒');
  const s = newState(content, 'zh', NOW);
  assert.deepEqual(s.lines, { jin: { tier: 'xinsheng', step: 0, progress: 0 } });
  assert.equal(s.tier, 'qi', 'the 古 is the save\'s own fields, as ever');
});

test('a v13 save (古五 二层, the builder\'s) keeps its 古 exactly and starts the 今 at zero', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/saves/waimen.json'), 'utf8'));
  const old = { ...(fixture.state ?? fixture), version: 13, chapter: '00-waimen', scene: 'wm-mijing', place: 'houshan', tier: 'qi', step: 2, progress: 462, stretch: { 'qi:2': 8 } };
  delete old.lines;
  const m = migrate(old, content);
  assert.equal(m.version, STATE_VERSION);
  assert.deepEqual(gu(m), gu(old), 'the 古 exactly as it stood');
  assert.deepEqual(m.lines, { jin: { tier: 'xinsheng', step: 0, progress: 0 } });
  assert.deepEqual(migrate(m, content), m, 'fitted once: the same again');
  // Look's 古 reads as it read: the bar, its need, its name.
  const l = lookOf(m);
  assert.deepEqual([l.tier.name, l.progress, l.next], ['练气二层', 462, content.ladder.tiers[0].thresholds[2] + 8]);
  // A held 今 place is kept; one on a tier the line no longer has starts over.
  assert.deepEqual(migrate({ ...m, lines: { jin: { tier: 'xinsheng', step: 1, progress: 40 } } }, content).lines.jin, { tier: 'xinsheng', step: 1, progress: 40 });
  assert.deepEqual(migrate({ ...m, lines: { jin: { tier: 'gone', step: 4, progress: 9 } } }, content).lines.jin, { tier: 'xinsheng', step: 0, progress: 0 });
});

test('a 今 board pays the 今 by its minutes on the 今 ladder — never the 古, never 灵石', () => {
  const s0 = inJin3(), was = gu(s0);
  const s = throughJin(s0, content, NOW);
  assert.equal(s.scene, '09-snow');
  assert.deepEqual(gu(s), was, 'the 古 untouched');
  assert.equal(s.wealth, s0.wealth, 'no 灵石');
  const jin = s.lines.jin, W = lineWorld(content, 'jin');
  assert.ok(jin.step > 0 || jin.progress > 0, `the 今 rose: ${JSON.stringify(jin)}`);
  // The share model: a 3-minute chat at 新生一层 is its minutes over the layer's board minutes.
  const t = content.tasks.tasks.find(x => x.id === 'jin-chat-dark');
  const g = lineGrant(content, { lang: 'zh', plays: null, lines: { jin: { tier: 'xinsheng', step: 0, progress: 0 } } }, 'jin', t.id, t, NOW, null);
  const pp = W.balance.play_pay, perMin = (pp.games.share * W.ladder.tiers[0].thresholds[0]) / (pp.games.time * pp.hours.xinsheng[0] * 60);
  assert.equal(g.progress, Math.round(perMin * g.minutes));
  assert.equal(g.wealth, 0);
  assert.equal(boardLine(content, 'jin-chat-dark'), 'jin');
  assert.equal(boardLine(content, content.tasks.tasks.find(x => x.id === 'notice-shuitong')?.id ?? 'notice-shuitong'), null, 'a 古 board is the 古\'s');
});

test('the 今 counts from its first board, before the 古\'s 入门 too', () => {
  let s = resolve(beforeJin(), content, ctx, { exit: 'go' }).state;
  assert.equal(s.scene, 'j01-track');
  s = throughJin(s, content, NOW);
  assert.equal(s.scene, '00-gate');
  assert.ok(s.lines.jin.progress > 0, 'the 古\'s gate is the 古\'s: 沈芒\'s line counts');
  assert.deepEqual([s.tier, s.step, s.progress, s.wealth], ['qi', 0, 0, 0], 'the 古 still a mortal\'s');
});

test('the strip on a 今 scene: 沈芒 and his realm and bar; on the 古, as it was', () => {
  const s = inJin3(), l = lookOf(s);
  assert.equal(l.scene.line, 'jin');
  assert.ok(stands(l, 'name') && stands(l, 'realm'), 'who and realm stand on a line with its own 修为');
  assert.ok(!stands(l, 'wealth') && !stands(l, 'pool'), '灵石 and 体力 are the 古\'s');
  assert.deepEqual(barOf(l), { line: 'jin', name: '沈芒', tier: l.lines.jin.tier, progress: 0, next: content.ladder.lines.jin.tiers[0].thresholds[0] });
  assert.equal(l.lines.jin.tier.name, '新生一层');
  assert.equal(l.tier.name, '练气五层', 'Look\'s own `tier` stays the 古\'s');
  const g = lookOf(throughJin(s, content, NOW));
  assert.equal(g.scene.line, undefined, 'back on the 古 (09-snow)');
  assert.deepEqual(barOf(g), { line: null, name: g.name, tier: g.tier, progress: 100, next: g.next });
  assert.equal(g.name, '沈小满');
  // The page draws the strip from barOf the header that stands, and a 今 rise is one plain fact — no seal, no 银月.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(src, /bar = barOf\(head\)/);
  assert.match(src, /now\.line !== before\.line\) \{ \/\* another line's bar, not a rise \*\/ \}/);
  assert.match(src, /now\.line\) keep\(\{ doNote: `\$\{before\.rank\} → \$\{now\.rank\}` \}\)/);
});

test('the numbers\' 今 column: 卷一\'s 今 takes a reader from 新生一层 into 二层', () => {
  const { jin } = lineColumns(content);
  assert.deepEqual(jin.huis.map(h => h.hui), ['j01', 'j04', 'j07', 'j09']);
  assert.ok(jin.huis.every(h => h.boards > 0 && h.progress > 0));
  assert.ok(jin.end >= 1.2 && jin.end <= 1.6, `卷一 ends ${jin.end} layers up at the model's ★`);
  assert.match(jin.huis.at(-1).at, /^新生二层 /);
  assert.ok(jin.end_best >= jin.end);
  assert.equal(jin.layers[0].name, '新生一层');
  assert.ok(jin.layers[0].hours >= content.balance.master.lines.jin.hours.fit.floor);
});
