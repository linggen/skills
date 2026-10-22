// The 游戏厅's story groups mirror the story (Hanli 10-22, of 第二回's row: 「古2三个调息连起来了, 玩家会厌倦」 — 吹鹅毛 and
// 洗髓 stood under 第二回 though neither is played there): a row under a 回 names a board its scene really shows, and
// every board a scene shows has a row. A level the story doesn't play sits under its kit's group or 旧版.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';

const reg = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
const content = loadContent();
const scenes = Object.fromEntries(Object.values(content.chapters).flatMap((ch) => Object.values(ch.scenes)).map((sc) => [sc.id, sc]));
const boardsOf = (sc) => (sc?.show ?? []).filter((c) => c.card === 'board').map((c) => c.id);
const storyGroups = new Set(reg.groups.map((g) => g.id).filter((id) => /^h\d|^jin$/.test(id)));
const storyRows = reg.games.filter((g) => storyGroups.has(g.group) && !g.replaced);

test('a row under a 回 is a board its scene shows', () => {
  for (const g of storyRows) {
    assert.ok(boardsOf(scenes[g.scene]).includes(g.task), `${g.group} ${g.name?.zh ?? g.id}: ${g.scene} shows [${boardsOf(scenes[g.scene])}], not ${g.task}`);
  }
});

test('every board a scene shows has its row under a 回', () => {
  const tasks = new Set(storyRows.map((g) => g.task));
  for (const sc of Object.values(scenes)) for (const id of boardsOf(sc)) assert.ok(tasks.has(id), `${sc.id}: ${id}`);
});
