// 照着走 (games/simon.js) retired from play (Hanli 11-05: 「这个小游戏删了吧, 太难了」, at 随风那一式's round 10): no board deals
// it; its three boards are Dashes now, under the same ids, pay and lines — so a save holding one (offered, kept, done)
// takes it up as the run on its next Look, never a board that cannot be drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { look } from '../scripts/rules.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { newState } from '../scripts/state.mjs';

const content = loadContent();
const BOARDS = ['jiuge-yubu', 'futian-suifeng', 'dingfeng-songzhi'];

test('no board deals 照着走; each of its boards is a live Dash row with the same pay', () => {
  assert.deepEqual(content.tasks.tasks.filter((t) => t.game === 'simon').map((t) => t.id), []);
  for (const id of BOARDS) {
    const t = content.tasks.tasks.find((x) => x.id === id);
    assert.equal(t.game, 'dash', id);
    // 照着走 paid play_pay's 记忆 5 灵石 a play; 几何冲刺 pays 调息's 0, so the board's 5 灵石 rides in its grant.
    assert.deepEqual(t.grant, { table: 'task', units: 2.5, ls: 1.5 }, `${id}: the same pay (its 5 灵石 a size since batch 2)`);
    const live = content.games.games.filter((g) => g.task === id && !g.cut && !g.replaced);
    assert.deepEqual(live.map((g) => g.id), ['dash'], `${id}: one live row, the Dash`);
    assert.ok(live[0].levels[0].things.length >= 5);
  }
  for (const g of content.games.games.filter((x) => x.id === 'simon')) assert.ok(g.cut && g.replaced, `${g.task}: cut`);
  const kit = JSON.parse(fs.readFileSync(new URL('../tools/phone/board-kit.json', import.meta.url), 'utf8'));
  assert.ok(!JSON.stringify(kit).includes('"simon"'), 'not packed for the phone');
  assert.ok(fs.existsSync(new URL('../scripts/games/simon.js', import.meta.url)), 'the kit kept, to come back later');
});

test('a save holding 随风那一式 — offered, or kept on 收着 — takes it up as the Dash on its next Look', () => {
  const now = new Date('2026-11-05T10:00:00');
  const at = playTo(content, newState(content, 'zh', now), '09-futian', { now }).state;
  const s = { ...at, stamina: 100, stamina_at: now.toISOString(), tasks: { ...at.tasks, 'futian-suifeng': { status: 'offered' } }, kept: [{ task: 'futian-suifeng', story: true, scene: '09-futian', place: at.place, at: now.toISOString() }] };
  const l = look(s, content, { now, quests: [] });
  const t = (l.tasks ?? []).find((x) => x.id === 'futian-suifeng');
  if (t) assert.equal(t.game, 'dash', 'the board as it is drawn now');
  assert.ok((l.kept ?? []).every((k) => k.id !== 'futian-suifeng' || content.tasks.tasks.find((x) => x.id === k.id).game === 'dash'), 'its 收着 row opens the Dash');
});
