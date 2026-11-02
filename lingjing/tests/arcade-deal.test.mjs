// The 游戏厅 deals a story row what the story deals it (arcade-board.js arcadeDeal ↔ rules/look.mjs dealOf): its own
// levels. 宗门大比's 格斗 rows carry no `data`, so the 游戏厅 dealt them nothing and every bout fought the registry's
// first level, 秦雁 (Hanli on the phone 10-31: 喷嚏符 should be 何七). linggen-mobile's arcadeGames mirrors arcadeDeal.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { arcadeDeal } from '../scripts/arcade-board.js';
import { levelFor, pickLevel } from '../scripts/games/fighter.js';

const reg = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
const fightRows = reg.games.filter((g) => g.id === 'fighter' && g.task && g.levels?.length && !g.replaced);

test('every 格斗 story row in the 游戏厅 fights its own level, as the story deals it', async () => {
  assert.ok(fightRows.length >= 8);
  for (const row of fightRows) {
    const level = await levelFor(arcadeDeal(row), '');
    assert.equal(level.id, row.levels[0].id, `${row.task}: ${level.foe?.name?.zh}`);
  }
});

test('喷嚏符 · 让一拳 is 何七, 看他的脸 is 马小宝 — never the first level (秦雁)', async () => {
  const foe = async (task) => (await levelFor(arcadeDeal(fightRows.find((r) => r.task === task)), '')).foe?.name?.zh;
  assert.equal(await foe('dabi-sneeze'), '何七');
  assert.equal(await foe('dabi-ma'), '马小宝');
  assert.equal(pickLevel(reg, {}, '').foe?.name?.zh, '秦雁', 'what an empty deal fought');
});

test("arcadeDeal: a row's data kept; a kit row (no task) its data alone; story/realm levels only where marked", () => {
  assert.deepEqual(arcadeDeal({ id: 'x', data: { lv: 2 } }), { lv: 2 });
  assert.deepEqual(arcadeDeal({ id: 'x', levels: [{ id: 'a' }] }), {}, 'the ladder row: its chips pick');
  assert.deepEqual(arcadeDeal({ id: 'x', task: 't', data: { level: 'b' }, levels: [{ id: 'a' }, { id: 'b', story: true }] }), { level: 'b', levels: [{ id: 'b', story: true }] });
  assert.deepEqual(arcadeDeal({ id: 'x', task: 't' }, { deal: { lv: 3 } }), { lv: 3 }, "the phone: no data, its task's deal");
});

// The tray names a 试玩 by its 游戏厅 row (11-02: 周衡's 灯谜, a story row of 聊天 · 今线, read 「聊天 · 今线」).
test('a 试玩 is titled by its row\'s own name, then the module\'s, then its id', async () => {
  const { arcadeRow: rowOf, arcadeTitle } = await import('../scripts/arcade-board.js');
  const reg = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
  const meta = { name: { zh: '聊天', en: 'Chat' } };
  assert.equal(arcadeTitle(rowOf(reg, 'jinchat', 'zhishi-shen'), meta, 'jinchat'), '周衡 · 一个灯谜');
  assert.equal(arcadeTitle(rowOf(reg, 'jinchat', 'zhishi-shen'), meta, 'jinchat', 'en'), 'Zhou Heng · A riddle');
  assert.equal(arcadeTitle(null, meta, 'jinchat'), '聊天 · Chat');
  assert.equal(arcadeTitle(null, null, 'jinchat'), 'jinchat');
});
