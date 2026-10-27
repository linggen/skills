// The 回's stage quest holds the way INTO a beat that gives nothing to do first (Hanli 10-27, live at 沉鼎观 · 柴房后面:
// 「读了一段剧情, 两个按钮都不能点… 是否就不应该能接到这个任务… 感觉卡住了」): the way there waits where he stands, with
// the gate and his 修为 toward it; a save already standing in the gated scene sees its ways drawn shut under the gate's
// card and one way to earn it — never live-looking buttons that refuse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { look, move, resolve, task } from '../scripts/rules.mjs';
import { WORDS, cardHtml } from '../scripts/cards.js';
import { entryGate } from '../scripts/rules/gates.mjs';

const content = loadContent();
const NOW = new Date('2026-10-27T07:00:00-03:00');
const ctx = { now: NOW };

test('the way into 柴房后面 waits at 药园 under 古四\'s gate: refused `stage` with the brief, the scene not entered nor told', () => {
  let s = playTo(content, newState(content, 'zh', NOW), 'wm-yaoyuan', { now: NOW, policy: 'skip' }).state;
  s = { ...s, progress: 146 };
  for (const c of content.chapters['00-waimen'].scenes['wm-yaoyuan'].show ?? []) if (c.card === 'board' && s.tasks?.[c.id]?.status !== 'done') s = task(s, content, ctx, { action: 'skip', id: c.id }).state;
  const tame = content.chapters['00-waimen'].scenes['wm-yaoyuan'].exits.find((e) => e.id === 'tame');
  assert.ok(entryGate(content, s, tame), 'the gate holds the door');
  const r = resolve(s, content, ctx, { exit: 'tame' });
  assert.equal(r.result.refused, 'stage');
  assert.equal(r.result.stage.scene, 'wm-chaifang');
  assert.deepEqual([r.result.stage.now.progress, r.result.stage.now.of], [146, 470]);
  assert.notEqual(r.state?.scene, 'wm-chaifang', 'not entered');
  const l = look(s, content, ctx);
  assert.ok(l.scene.exits.find((e) => e.id === 'tame').stage, 'Look says the way is held, with the gate');
  // Met, the door opens.
  const full = { ...s, progress: 470 };
  assert.equal(entryGate(content, full, tame), null);
});

test('a save already standing in the gated scene: its ways drawn shut under the gate\'s card, one way to earn it', () => {
  let s = playTo(content, newState(content, 'zh', NOW), 'wm-chaifang', { now: NOW, policy: 'skip' }).state;
  // Walked in by the road (the task card's), 146 of 470 — as Hanli's save stood.
  s = move(s, content, ctx, { place: content.chapters['00-waimen'].scenes['wm-chaifang'].at }).state ?? s;
  s = { ...s, progress: 146 };
  const l = look(s, content, ctx);
  const ways = l.scene.exits.filter((e) => ['count', 'fist'].includes(e.id));
  assert.equal(ways.length, 2);
  for (const e of ways) assert.equal(e.stage?.met, false, `${e.id} held`);
  for (const id of ['count', 'fist']) assert.equal(resolve(s, content, ctx, { exit: id }).result.refused, 'stage', id);
  const html = cardHtml({ card: 'panel' }, { look: l, lang: 'zh', words: WORDS.zh, content: {}, panelBusy: null });
  assert.match(html, /阶段任务 · 修炼到练气一层圆满/);
  assert.match(html, /146\/470 · 还差 324 修为/);
  assert.match(html, /去修炼/);
  const buttons = [...html.matchAll(/<button[^>]*data-panel-exit="(count|fist)"[^>]*>/g)].map((m) => m[0]);
  assert.equal(buttons.length, 2);
  for (const b of buttons) assert.match(b, /disabled/, 'drawn shut');
});
