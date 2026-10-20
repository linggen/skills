// The story's 割绳子 beats (2026-10-16, games.md § 割绳子 slots): 忍字 · 认路 · 算账 replaced by
// 割绳子 levels on ropekit.js — each its scene's task, its level from games.json reaching the page
// through Look, proved by its bot (the plain way) and its star way (all three 灵光), its book line
// above the board, no skip of its own (the page's stuck gate lays it), the grade from the stars.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { playOnce } from '../tools/board-bots.mjs';

const content = loadContent();
const BEATS = { tauntrope: ['masan-taunt', 'spring', ['word', 'fist']], wayrope: ['yinyue-way', 'bubble', ['straight', 'wandered']], rentrope: ['rent-scale', 'crow', ['exact', 'over']] };

for (const [id, [task, tool, grades]] of Object.entries(BEATS)) {
  test(`${id}: the task ${task} plays it; its level is the registry's, with its tool (${tool}), proved both ways`, async () => {
    const mod = await import(`../scripts/games/${id}.js`);
    const { bot, starPlans } = await import(`../scripts/games/bots/${id}.js`);
    const t = content.tasks.tasks.find((x) => x.id === task);
    assert.equal(t.game, id);
    assert.equal(t.stars, 3);
    assert.deepEqual(Object.keys(t.marks).sort(), [...grades].sort());
    const row = content.games.games.find((g) => g.id === id);
    assert.equal(row.task, task);
    const level = row.levels[0];
    assert.ok({ spring: level.springs, bubble: level.bubbles, crow: level.crows }[tool]?.length, 'its tool is in the level');
    const r = playOnce(mod, bot, { seed: 'b1', deal: { levels: row.levels }, limit: 60000 });
    assert.ok(r.won, 'the plain way wins');
    assert.ok(grades.includes(r.grade), r.grade);
    // The star way: all three 灵光 — played by the human-timed hand (board-bots' playOnce: the press
    // lands ~200 ms after it decides), which is what the levels are proved for.
    const { planBot } = await import('../scripts/games/bots/rope-plan.js');
    let s = null;
    const keep = { ...mod, tick: (st, ms) => (s = mod.tick(st, ms)), act: (st, d) => { const r = mod.act(st, d); s = r.state ?? st; return r; } };
    playOnce(keep, planBot({ one: starPlans.one }), { seed: 'star', deal: { levels: row.levels }, limit: 60000 });
    assert.ok(s.won, 'the star way wins');
    assert.equal(s.stars, 3, 'three 灵光');
    assert.equal(s.grade, grades[0]);
  });

  test(`${id}: the book line above the board, both languages; no skip of its own; stuck after four misses`, async () => {
    const mod = await import(`../scripts/games/${id}.js`);
    const row = content.games.games.find((g) => g.id === id);
    let s = mod.newGame('x', 1, { levels: row.levels });
    for (const lang of ['zh', 'en']) {
      const h = mod.html(s, lang);
      assert.match(h, /g-rope-quote/);
      assert.match(h, /data-g="cut"/);
      assert.doesNotMatch(h, /data-g="skip"/);
    }
    assert.equal(mod.stuck({ ...s, misses: 4 }), true);
    assert.doesNotMatch(mod.html({ ...s, misses: 4 }, 'zh'), /data-g="skip"/, 'the page lays 「算了，往下走」, not the beat');
  });
}

/* 喂息珠 (wm-luobo, 2026-10-20; the reading cap): the 秘境's 息珠 fed to the 饭桶 — its level frozen from rope-gen (灵气泡 and the
   woodpile's 荆棘: the other order swings it into the brambles), harder than 喂饼's last (洞口风: one vine), proved both ways. */
test('xizhurope: the task luobo-xizhu plays it in wm-luobo; 灵气泡 and 荆棘, the wrong order breaks it; plain and star ways win', async () => {
  const mod = await import('../scripts/games/xizhurope.js');
  const { bot, starPlans, plans } = await import('../scripts/games/bots/xizhurope.js');
  const t = content.tasks.tasks.find((x) => x.id === 'luobo-xizhu');
  assert.equal(t.game, 'xizhurope');
  assert.equal(t.stars, 3);
  const row = content.games.games.find((g) => g.id === 'xizhurope');
  assert.equal(row.task, 'luobo-xizhu');
  assert.equal(row.scene, 'wm-luobo');
  const level = row.levels[0];
  assert.ok(level.bubbles?.length && level.thorns?.length, 'its tools are in the level');
  assert.equal(level.must, 'thorns', 'the brambles taught with a ring and a line');
  const bread = content.games.games.find((g) => g.id === 'bread').levels.at(-1);
  assert.ok(level.vines.length > bread.vines.length, 'more to read than 喂饼\'s last');
  const r = playOnce(mod, bot, { seed: 'b1', deal: { levels: row.levels }, limit: 60000 });
  assert.ok(r.won, 'the plain way wins');
  // the other order: vine 1 first sends it into the thorns
  const { playPlan } = await import('../scripts/games/rope-gen.js');
  const wrong = playPlan(level, [{ g: 'cut', v: 1 }, { g: 'cut', v: 0 }, { g: 'pop', i: 0 }]);
  assert.ok(wrong.broke || wrong.end !== 'fed', 'the other order does not feed it');
  assert.ok(playPlan(level, plans.one).done, 'the answer plays through');
  const { planBot } = await import('../scripts/games/bots/rope-plan.js');
  let s = null;
  const keep = { ...mod, tick: (st, ms) => (s = mod.tick(st, ms)), act: (st, d) => { const x = mod.act(st, d); s = x.state ?? st; return x; } };
  playOnce(keep, planBot({ one: starPlans.one }), { seed: 'star', deal: { levels: row.levels }, limit: 60000 });
  assert.ok(s.won, 'the star way wins');
  assert.equal(s.stars, 3, 'three 灵光');
  assert.equal(s.grade, 'whole');
  for (const lang of ['zh', 'en']) {
    const h = mod.html(mod.newGame('x', 1, { levels: row.levels }), lang);
    assert.match(h, /g-rope-quote/);
    assert.match(h, /items\/xizhu\.webp/, 'the 息珠 itself');
    assert.match(h, /fantong-pot\.webp/, 'into the 饭桶');
    assert.doesNotMatch(h, /data-g="skip"/);
  }
});

/* 10-19 (Hanli: 「这里的弹竹完全不弹」): matter.js zeroes a static body's restitution as it is made static,
   so the 弹竹 never bounced; it must come back higher than it fell, and 忍字 must use it. */
test('弹竹 bounces: a thing dropped on it rebounds above where it struck, and 忍字\'s level lands on it', async () => {
  const R = await import('../scripts/games/rope.js');
  const level = { bread: [200, 60], vines: [{ at: [200, 30] }], springs: [{ x: 200, y: 300, w: 140, a: 0 }], mouth: [40, 330], stars: [] };
  const w = R.buildWorld(level);
  assert.equal(w.engine.world.bodies.find((b) => b.label === 'spring').restitution > 1, true, 'the spring keeps its restitution');
  R.cutVine(w, 0, 0);
  let hit = null, peak = Infinity;
  for (let i = 0; i < 240; i++) {
    R.stepWorld(w, level);
    const y = w.bread.position.y;
    if (hit == null && w.bread.velocity.y < 0) hit = y;
    if (hit != null) peak = Math.min(peak, y);
  }
  assert.ok(hit != null, 'it bounced at all');
  assert.ok(hit - peak > 60, `it came back up a long way (${(hit - peak).toFixed(0)} px)`);
  const fs = await import('node:fs');
  const g = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8')).games.find((x) => x.id === 'tauntrope');
  assert.ok(!(g.levels[0].stones ?? []).length, '忍字: no stone lies over the bamboo');
});

/* ── what the ropes hang from (2026-10-19, Hanli on 拽: 「把爹的图片拴在绳子上有点奇怪」) ── */

test('no rope hangs from the sky: every kit level draws what each vine is tied to; 爹 hangs by his hands', async () => {
  for (const id of [...Object.keys(BEATS), 'fantongcut']) {
    const mod = await import(`../scripts/games/${id}.js`);
    const row = content.games.games.find((g) => g.id === id);
    const s = mod.newGame('a', 1, row?.levels ? { levels: row.levels } : {});
    const h = mod.html(s, 'zh');
    assert.equal((h.match(/class="g-rope-anchor"/g) ?? []).length, s.level.vines.length, `${id}: an anchor picture per vine`);
  }
  // 拽: the ropes are tied round the old pine's limb (the backdrop's), laid on the level's two anchors.
  const fall = await import('../scripts/games/fallrope.js');
  const row = content.games.games.find((g) => g.id === 'fallrope');
  let s = fall.newGame('a', 1, { levels: row.levels });
  assert.match(fall.html(s, 'zh'), /fall\/pine\.webp/);
  assert.doesNotMatch(fall.html(s, 'zh'), /g-rope-anchor/);
  // …and he turns along the rope he holds: with only the inner rope left he leans toward its anchor.
  s = fall.act(s, { g: 'cut', v: 'pack', k: '0' }).state;
  s = fall.act(s, { g: 'cut', v: '0', k: '3' }).state;
  for (let i = 0; i < 6; i++) s = fall.tick(s, 50);
  const [ax] = row.levels[0].vines[1].at, { x } = s.swing.bread.position;
  assert.ok(Math.sign(s.swing.hangA) === Math.sign(ax - x) && Math.abs(s.swing.hangA) > 0.2, `turned ${s.swing.hangA}`);
});
