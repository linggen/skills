// 撒豆成兵 in the 秘境 sends only the beasts the book has shown him (Hanli 2026-10-21, 「按你的建议来」: the beasts of
// the 回 he has reached; 鬿雀 only from 古八, h09) — rules/reveal.mjs, dealt through rules/climb.mjs as `deal.over`
// and laid on the row by games/sadou.js. A beast not yet met stands aside for the latest one met, worth the same, so
// the level plays as tuned; the 游戏厅's ladder (no `over`) plays as made.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { dealtOf } from '../scripts/rules/climb.mjs';
import { beastOpen, revealedOver } from '../scripts/rules/reveal.mjs';
import { levelAsked, levelDealt } from '../scripts/games/sadou.js';
import { BOTS, sim } from '../scripts/games/sadou/core.js';

const content = loadContent();
const kit = JSON.parse(readFileSync(new URL('../worlds/jiuding/levels/sadou.json', import.meta.url), 'utf8'));
const NOW = new Date(2026, 9, 21, 9, 0);
/* A save standing in a scene (its 回 the one reached). */
const at = (chapter, scene) => ({ ...newState(content, 'zh', NOW), chapter, scene, done_scenes: [] });
const gu3 = at('00-prologue', '00-longzhi'); // h04: 野猪 and 蠪侄
const gu5 = at('00-waimen', 'wm-mijing'); // h07: the 秘境 — 犰狳 and 合窳, not 鬿雀
const gu8 = at('00-zhuji', '09-qulao'); // h09: 鬿雀
const task = (id) => content.tasks.tasks.find((t) => t.id === id);
const kinds = (level) => new Set([...level.track.filter((t) => t.type === 'horde').flatMap((t) => t.beasts.map(([b]) => b)), level.boss.beast]);
const worth = (beasts) => beasts.reduce((s, [b, n]) => s + n * kit.beasts[b].power, 0);
const dealt = (s, lv) => levelDealt(kit, { lv, over: revealedOver(content, s, 'sadou', lv) ?? undefined }, '');

test('every beast 撒豆成兵 plays has a 回 (creatures.json `hui`), so none is sent before the book shows it', () => {
  for (const k of Object.keys(kit.beasts).filter((k) => !k.startsWith('_'))) {
    assert.ok(content.creatures.creatures.find((c) => c.id === k)?.hui, k);
  }
  assert.deepEqual(['yezhu', 'zheng', 'qiuyu', 'heyu', 'qique', 'longzhi'].map((k) => beastOpen(content, gu5, k)), [true, true, true, true, false, true]);
  assert.ok(beastOpen(content, gu8, 'qique'));
});

test('古五\'s 秘境 (h07): no 鬿雀 on any level; each horde worth what it was; the bosses kept', () => {
  kit.levels.forEach((raw, i) => {
    const level = dealt(gu5, i + 1);
    assert.ok(!kinds(level).has('qique'), `${raw.id}: ${[...kinds(level)]}`);
    assert.equal(level.boss.beast, raw.boss.beast, raw.id);
    level.track.forEach((it, j) => {
      if (it.type === 'horde') assert.equal(worth(it.beasts), worth(raw.track[j].beasts), `${raw.id} horde at ${it.at}`);
      else assert.deepEqual(it, raw.track[j]);
    });
    // the swap keeps the level winnable as tuned
    assert.ok(sim(kit, level, BOTS.good).won, raw.id);
  });
});

test('古八 (h09) on: 鬿雀 may come — no `over`, the level as made', () => {
  kit.levels.forEach((raw, i) => {
    assert.equal(revealedOver(content, gu8, 'sadou', i + 1), null, raw.id);
    assert.equal(dealt(gu8, i + 1), raw);
  });
  assert.ok(kit.levels.some((l) => kinds(l).has('qique')));
});

test('earlier still (古三, h04): only 野猪, and 蠪侄 the one boss he has met', () => {
  const level = dealt(gu3, 1);
  assert.deepEqual([...kinds(level)].sort(), ['longzhi', 'yezhu']);
});

test('the 秘境\'s boards deal it: 拾遗 and 奇遇\'s 撒豆成兵, by the climb', () => {
  for (const id of ['mijing-gather', 'qiyu-sadou']) {
    const early = dealtOf(content, { ...gu5, climb: { sadou: 2 } }, task(id));
    assert.equal(early.lv, 3);
    assert.ok(!kinds(levelDealt(kit, early, '')).has('qique'), id);
    const late = dealtOf(content, { ...gu8, climb: { sadou: 2 } }, task(id));
    assert.deepEqual(late, { ...(task(id).deal ?? {}), lv: 3 }, id);
  }
});

test('the 游戏厅 (no `over`) plays the ladder as made', () => {
  kit.levels.forEach((l, i) => assert.equal(levelDealt(kit, {}, `?lv=${i + 1}`), levelAsked(kit, {}, `?lv=${i + 1}`)));
});
