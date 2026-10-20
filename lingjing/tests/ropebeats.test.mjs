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
  // 忍字's way (re-laid 10-20: cut, it rests on the slab, the puff): the 桂花糕 strikes the 弹竹 on it — no stone hides it.
  const RG = await import('../scripts/games/rope-gen.js');
  const way = RG.playPlan(g.levels[0], [{ g: 'cut', v: 0 }, { g: 'gust' }]);
  const sp = g.levels[0].springs[0], seg = way.path.slice(way.path.last);
  // the fall turns to a rise right over the bamboo: a bounce, not a pass
  const bounced = seg.some((q, k) => k > 0 && k < seg.length - 1 && seg[k - 1][1] < q[1] && seg[k + 1][1] < q[1] && Math.abs(q[0] - sp.x) < sp.w / 2 + 4 && Math.abs(q[1] - sp.y) < 45);
  assert.ok(bounced, '忍字: the puffed 桂花糕 bounces off the 弹竹');
  for (const st of g.levels[0].stones ?? []) assert.ok(st.x - st.w / 2 > sp.x + sp.w / 2 || st.x + st.w / 2 < sp.x - sp.w / 2, '忍字: no stone lies over the bamboo');
  assert.equal(RG.playPlan(g.levels[0], [{ g: 'cut', v: 0 }]).end, 'rest', '忍字: a plain cut leaves it on the slab (the puff is the answer)');
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

/* 算账 re-laid 2026-10-20 (play-human's casual hand won the 10-16 level in 5–12 s with one low swipe that cut both
   vines): the meat must be swung onto the chute — the other vine first, the crow's before the crow gets down. */
test('算账: one swipe across both vines never wins; the crow\'s vine first never wins; waiting, the crow takes it; the race wins over a wide window', async () => {
  const R = await import('../scripts/games/rope.js');
  const level = content.games.games.find((g) => g.id === 'rentrope').levels[0];
  const reach = 34 + R.BREAD_R * 0.4;
  const run = (moves) => {
    const w = R.buildWorld(level), q = [...moves];
    for (let t = 0; t < 9000; t += R.STEP_MS) {
      while (q.length && q[0].t <= t) { const m = q.shift(); R.cutVine(w, m.v, Math.floor(w.vines[m.v].joints.length / 2)); }
      const ev = R.stepWorld(w, level);
      if (ev.stolen) return 'stolen';
      if (Math.hypot(w.bread.position.x - level.mouth[0], w.bread.position.y - level.mouth[1]) < reach) return 'fed';
      if (R.outOf(w)) return 'out';
    }
    return 'rest';
  };
  assert.ok(!level.gust, 'no puff: a resting thing is a miss');
  assert.notEqual(run([{ t: 0, v: 0 }, { t: 0, v: 1 }]), 'fed', 'both at once: straight to the floor');
  assert.notEqual(run([{ t: 0, v: 1 }, { t: 30, v: 0 }]), 'fed', 'one swipe crossing both, a frame apart');
  for (const d of [600, 1500, 3000]) assert.notEqual(run([{ t: 0, v: 0 }, { t: d, v: 1 }]), 'fed', `the crow's vine first (then ${d} ms): over the floor`);
  assert.equal(run([{ t: 0, v: 1 }]), 'stolen', 'the other vine alone: the crow gets there');
  const wins = [];
  for (let d = 700; d <= 2600; d += 100) wins.push(run([{ t: 0, v: 1 }, { t: d, v: 0 }]) === 'fed');
  assert.ok(wins.filter(Boolean).length >= wins.length - 2, `the race wins almost anywhere from 0.7 s to the crow: ${wins.map(Number).join('')}`);
});

test('忍字: the cake goes back into 马小宝\'s own mouth (the book\'s, both ways on) — no yard dog', async () => {
  const mod = await import('../scripts/games/tauntrope.js');
  const row = content.games.games.find((g) => g.id === 'tauntrope');
  const h = mod.html(mod.newGame('x', 1, { levels: row.levels }), 'zh');
  assert.match(h, /games\/xiaobao\.webp/);
  assert.doesNotMatch(h, /dog\.webp/);
  const t = content.tasks.tasks.find((x) => x.id === 'masan-taunt');
  assert.match(t.done_line.zh, /马小宝/);
  assert.doesNotMatch(t.title.zh + mod.meta.how.zh, /狗嘴|喂狗/);
  for (const ex of content.chapters['00-prologue'].scenes['00-masan'].exits) assert.match(ex.story_full?.zh ?? ex.story.zh, /桂花糕一口塞进嘴里/, `${ex.id}: the book has him eat it`);
});
