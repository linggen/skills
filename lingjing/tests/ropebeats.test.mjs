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
    // The star way: all three 灵光.
    let s = mod.newGame('s', 1, { levels: row.levels, plan: starPlans.one }), wall = 0, calm = 0, i = 0;
    const plan = starPlans.one;
    while (!s.won && wall < 60000) {
      if (s.phase === 'play' && i < plan.length && calm >= 400) {
        const m = plan[i++];
        s = mod.act(s, m.g === 'cut' ? { g: 'cut', v: String(m.v), k: String(Math.floor(s.swing.vines[m.v].joints.length / 2)) } : m.g === 'pop' ? { g: 'pop', i: '0' } : { g: m.g }).state;
        calm = 0;
      }
      s = mod.tick(s, 20); wall += 20;
      calm = s.phase === 'play' && s.swing.bread.speed < 0.12 ? calm + 20 : 0;
    }
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
