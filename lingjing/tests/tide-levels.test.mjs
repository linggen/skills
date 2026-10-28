// 兽潮's twenty levels a kit (worlds/jiuding/levels/tide.json, written by tools/tide-levels.mjs; Hanli 2026-10-28:
// 「塔防类的可以适当加到20个关卡, 每一种, 撒豆成兵, 守城墙, 守炉」): every 主力 塔防 kit has twenty, rising, each a new layout,
// a 大妖 every third where the kit has 结印 and a 大妖 is met, and each won again here by its human-like hand without 结印.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { kitOf } from '../scripts/rules/reveal.mjs';
import { TIDES } from '../scripts/games/tide.js';

const content = loadContent();
const T = content.tasks.tasks.find((t) => t.shouchao);
const LV = JSON.parse(readFileSync(new URL('../worlds/jiuding/levels/tide.json', import.meta.url), 'utf8'));
const tableOf = (g) => kitOf(content, g) ?? (content.games?.games ?? []).find((x) => x.id === g && Array.isArray(x.levels));
const creatures = content.creatures?.creatures ?? [];

test('every turning kit: twenty levels, rising, all new, each proven when written; a 大妖 every third where it can come', () => {
  for (const { game } of T.shouchao.rotation) {
    const lv = LV[game]?.levels ?? [];
    assert.equal(lv.length, 20, game);
    assert.equal(new Set(lv.map((l) => l.sig)).size, 20, `${game}: twenty layouts`);
    for (let i = 1; i < 20; i += 1) assert.ok(lv[i].tier > lv[i - 1].tier, `${game}: rising`);
    for (const l of lv) {
      const [won, of] = l.won.split('/').map(Number);
      assert.ok(won >= LV[game].need && of === LV[game].seeds, `${game} ${l.i}: proven ${l.won}`);
      assert.ok(l.deal?.tide, `${game} ${l.i}: a whole deal`);
    }
    if (TIDES[game].boss) assert.ok(lv.filter((l) => l.boss).length >= 4, `${game}: 大妖 levels`);
  }
});

test('re-proven here: the human-like hand wins every level on a fresh play or two, and most of all of them', () => {
  for (const { game } of T.shouchao.rotation) {
    const table = tableOf(game);
    let won = 0;
    for (const l of LV[game].levels) {
      const w = ['again-0', 'again-1'].filter((s) => TIDES[game].prove(table, l.deal, s, creatures)).length;
      assert.ok(w >= 1, `${game} ${l.i}: lost both fresh plays`);
      won += w;
    }
    assert.ok(won >= 32, `${game}: ${won}/40`);
  }
});
