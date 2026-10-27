// Nothing won, the whole of 卷一 (Hanli 2026-10-27: 「确保都能跳过去, 不会卡住游戏进程」): from a fresh save to the end of
// 卷一's built 回 with every story board left (「算了，往下走」), every story fight lost until it may be left
// (rules/skips.mjs fightStuck — every story fight since 2026-10-27, not only inside a lock), every guard lost to until it
// lets him by (world.mjs guardOf), every riddle missed until it may be left — no dead end. The 阶段任务 (stage gates)
// ask a layer full, never a board: the routine fills it (修炼 · 人间功课 · 闭关; rules/progress.mjs `earned`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { resolve, task } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-10-01T09:00:00');

test('卷一 walks to its end with nothing won: every board left, every fight and guard lost until it lets him by', () => {
  let out;
  try { out = playTo(content, newState(content, 'zh', NOW), '01-end', { now: NOW, policy: 'none', limit: 600 }); }
  catch (e) { assert.fail(`dead end at ${e.scene}: ${e.why}`); }
  const s = out.state;
  assert.equal(s.scene, '01-end');
  // A teaching fight that no line can lose is won by any play (never a gate): the walk names them.
  assert.deepEqual(Object.keys(s.wins ?? {}).filter((id) => !out.unlosable.includes(id)), [], 'no fight won on the way but the unlosable');
  const won = Object.entries(s.tasks ?? {}).filter(([, t]) => t.status === 'done' && !t.skipped && t.kind !== 'errand');
  const boards = new Set(content.tasks.tasks.filter((t) => t.kind === 'board').map((t) => t.id));
  assert.deepEqual(won.map(([id]) => id).filter((id) => boards.has(id)), [], 'no story board won on the way');
  // the last way on: its board left, then 卷一 ends
  const ctx = { now: out.now };
  let t = s;
  for (const c of content.chapters['01-ji'].scenes['01-end'].show ?? []) if (c.card === 'board' && t.tasks?.[c.id]?.status !== 'done') t = task(t, content, ctx, { action: 'skip', id: c.id }).state;
  const end = resolve(t, content, ctx, { exit: 'rest' });
  assert.equal(end.result.ok, true, JSON.stringify(end.result).slice(0, 300));
  assert.ok(end.state.ended.includes('01-ji'), '卷一 ended');
});
