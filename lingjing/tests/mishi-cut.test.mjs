// 密室 cut 2026-10-27 (Hanli: 「这个游戏, 3关都玩不明白, 去掉吧」): its tasks stay `cut` for the record, its board,
// rules and room data are gone. A save that had it open, offered, or holding 银月 out for it loads clean.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { fitWorld, newState } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '0';
const content = loadContent();
const NOW = new Date('2026-10-27T10:00:00Z');
const task = (id) => content.tasks.tasks.find((t) => t.id === id);

test('密室 is cut: both tasks marked, no row in the 游戏厅, no module, no verb', async () => {
  for (const id of ['mishi', 'mishi-mijing']) assert.equal(task(id)?.cut, '2026-10-27', id);
  const reg = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
  assert.ok(!reg.games.some((g) => g.id === 'mishi'));
  assert.ok(!fs.existsSync(new URL('../scripts/games/mishi.js', import.meta.url)));
  const { VERBS } = await import('../scripts/rules.mjs');
  assert.equal(VERBS.mishi, undefined);
});

test('an old save with the room open, offered, a rerun 暗室 and 银月 held out for it: let go on load', () => {
  const base = newState(content, 'zh', NOW);
  const old = {
    ...base,
    tasks: { ...(base.tasks ?? {}), mishi: { status: 'offered' }, 'mishi-mijing': { status: 'offered' } },
    mishi: { task: 'mishi', room: 'r1', day: '2026-10-27', place: base.place, step: 1, wrong: 2, hints: [] },
    mishi_offer: { task: 'mishi-mijing', place: 'shimen', day: '2026-10-27' },
    mishi_log: { day: '2026-10-27', n: 1, paid: {} },
    her_game: { task: 'mishi', since: NOW.toISOString() },
  };
  const s = fitWorld(old, content);
  for (const key of ['mishi', 'mishi_offer', 'mishi_log', 'her_game']) assert.ok(!(key in s), key);
  assert.equal(s.tasks.mishi, undefined);
  assert.equal(s.tasks['mishi-mijing'], undefined);
  const lk = look(s, content, { now: NOW });
  assert.equal(lk.mishi, undefined);
  assert.ok(!(lk.tasks ?? []).some((t) => t.id.startsWith('mishi')));
});

test('a done 密室 stays on the record; a hold for a live board is kept', () => {
  const base = newState(content, 'zh', NOW);
  const s = fitWorld({ ...base, tasks: { ...(base.tasks ?? {}), mishi: { status: 'done' } }, her_game: { task: 'qiyu-drawguess', since: NOW.toISOString() } }, content);
  assert.equal(s.tasks.mishi.status, 'done');
  assert.equal(s.her_game.task, 'qiyu-drawguess');
});
