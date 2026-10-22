// The story's 割绳子 beats (2026-10-16, games.md § 割绳子 slots): 忍字 · 认路 · 算账 replaced by
// 割绳子 levels on ropekit.js — each its scene's task, its level from games.json reaching the page
// through Look, proved by its bot (the plain way) and its star way (all three 灵光), its book line
// above the board, no skip of its own (the page's stuck gate lays it), the grade from the stars.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { playOnce } from '../tools/board-bots.mjs';

const content = loadContent();
// 忍字 and 认路 left their scenes 2026-10-21 (第一回's lineup, Hanli: 「按你的建议来」 — 忍字 a 气走经脉 level, 认路 cut): their
// rope levels stay in the 游戏厅, no task (`null`); 算账 is still 00-rent's.
const BEATS = { tauntrope: [null, 'spring', ['word', 'fist']], wayrope: [null, 'bubble', ['straight', 'wandered']], rentrope: ['rent-scale', 'crow', ['exact', 'over']] };

for (const [id, [task, tool, grades]] of Object.entries(BEATS)) {
  test(`${id}: the task ${task} plays it; its level is the registry's, with its tool (${tool}), proved both ways`, async () => {
    const mod = await import(`../scripts/games/${id}.js`);
    const { bot, starPlans } = await import(`../scripts/games/bots/${id}.js`);
    const row = content.games.games.find((g) => g.id === id);
    if (task) {
      const t = content.tasks.tasks.find((x) => x.id === task);
      assert.equal(t.game, id);
      assert.equal(t.stars, 3);
      assert.deepEqual(Object.keys(t.marks).sort(), [...grades].sort());
      assert.equal(row.task, task);
    } else assert.ok(row.replaced === 'cut' && !row.scene && row.why?.zh, `${id}: the 游戏厅's only, under 旧版`);
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
  for (const id of Object.keys(BEATS)) {
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

test('忍字 (in the 游戏厅 since 2026-10-21): the cake goes back into 马小宝\'s own mouth (the book\'s, both ways on) — no yard dog', async () => {
  const mod = await import('../scripts/games/tauntrope.js');
  const row = content.games.games.find((g) => g.id === 'tauntrope');
  const h = mod.html(mod.newGame('x', 1, { levels: row.levels }), 'zh');
  assert.match(h, /games\/xiaobao\.webp/);
  assert.doesNotMatch(h, /dog\.webp/);
  assert.doesNotMatch(mod.meta.how.zh, /狗嘴|喂狗/);
  for (const ex of content.chapters['00-prologue'].scenes['00-zaotai'].exits) assert.match(ex.story_full?.zh ?? ex.story.zh, /桂花糕一口塞进嘴里/, `${ex.id}: the book has him eat it`);
});

/* 喂饭桶 · 一根牛骨头 (wm-diyilu, 2026-10-21, Hanli: 「agree」 — 古四's 9,360 字 after 药园巡夜 had no play): the 饭桶's first
   feed, in the woodshed. Three strings, the 柴墩 (a ledge) and the door's draught: the last string cut over the block lays the
   bone there, the puff blows it into the 饭桶; any other order drops it on the floor, and without the puff it only rests. */
test('niugurope: the task diyilu-niugu plays it in wm-diyilu; the 柴墩 and the draught; the wrong orders miss; plain and star ways win', async () => {
  const mod = await import('../scripts/games/niugurope.js');
  const { bot, plans, starPlans } = await import('../scripts/games/bots/niugurope.js');
  const RG = await import('../scripts/games/rope-gen.js');
  const t = content.tasks.tasks.find((x) => x.id === 'diyilu-niugu');
  assert.equal(t.game, 'niugurope');
  assert.equal(t.stars, 3);
  const row = content.games.games.find((g) => g.id === 'niugurope');
  assert.deepEqual([row.task, row.scene, row.mechanic], ['diyilu-niugu', 'wm-diyilu', '割绳子']);
  const level = row.levels[0];
  assert.ok(level.gust && level.stones?.length === 1 && level.vines.length === 3, 'three strings, the block, the draught');
  assert.ok(!level.thorns && !level.crows && !level.bubbles, 'forgiving: nothing breaks it, nothing takes it');
  assert.equal(level.must, 'gust', 'the draught taught with a ring');
  const fed = (run) => !run.broke && run.path.some(([x, y], k) => k >= (run.path.first ?? 0) && Math.hypot(x - level.mouth[0], y - level.mouth[1]) < RG.MOUTH_R + 19 * 0.4);
  assert.ok(fed(RG.playPlan(level, plans.one)), 'the answer feeds it');
  for (const hand of RG.HANDS) assert.ok(fed(RG.playPlan(level, plans.one, { hand })), `at a ${hand} ms reaction`);
  assert.ok(fed(RG.playPlan(level, plans.one, { late: 1500, hand: 200 })), 'thought over slowly');
  const cuts = plans.one.filter((m) => m.g === 'cut');
  assert.equal(RG.playPlan(level, cuts).end, 'rest', 'without the draught it rests on the block');
  assert.ok(!fed(RG.playPlan(level, cuts)), '…unfed');
  assert.ok(fed(RG.playPlan(level, [1, 0, 2].map((v) => ({ g: 'cut', v })).concat({ g: 'gust' }))), 'the two side strings in either order');
  for (const o of [[0, 1, 2], [1, 0, 2], [0, 2, 1], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) assert.ok(!fed(RG.playPlan(level, o.map((v) => ({ g: 'cut', v })))), `cut ${o.join('')} alone: not fed`);
  const orders = [[0, 2, 1], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const o of orders) assert.ok(!fed(RG.playPlan(level, [...o.map((v) => ({ g: 'cut', v })), { g: 'gust' }])), `cut ${o.join('')} then the puff: not fed`);
  const r = playOnce(mod, bot, { seed: 'b1', deal: { levels: row.levels }, limit: 60000 });
  assert.ok(r.won, 'the plain way wins');
  assert.ok(['whole', 'fed'].includes(r.grade), r.grade);
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
    assert.match(h, /items-comic\/niu-gutou\.webp/, 'the bone, the small games\' comic icon');
    assert.match(h, /fantong-pot\.webp/, 'into the 饭桶');
    assert.match(h, /boards\/chaifang\.webp/, 'in the woodshed');
    assert.equal((h.match(/class="g-rope-anchor"/g) ?? []).length, 3, 'each string tied to a peg in the beam');
    assert.doesNotMatch(h, /data-g="skip"/);
  }
  assert.equal(mod.stuck({ ...mod.newGame('x', 1, { levels: row.levels }), misses: 4 }), true);
});

test('喂饭桶 · 一根牛骨头 sits where the book feeds the 饭桶: wm-diyilu\'s passage to 「把饭桶抠了出来」, the board, then 「头一样」 on; 留给爹 waits on it', async () => {
  const { stretchesOf, RHYTHM_CAP } = await import('../scripts/rhythm.mjs');
  const sc = content.chapters['00-waimen'].scenes['wm-diyilu'];
  assert.deepEqual(sc.show, [{ card: 'board', id: 'diyilu-niugu' }]);
  assert.deepEqual(sc.offers.tasks, ['diyilu-niugu']);
  for (const k of ['story', 'story_full']) assert.match(sc[k].zh, /把饭桶抠了出来。$/, k);
  assert.match(sc.story_after.zh, /^头一样，扔了根柴火棍。/);
  assert.match(sc.story_after_full.zh, /^喂它，它吐东西——银月就留下这么一句。[\s\S]*一根伙房熬汤剩下的牛骨头/);
  const save = sc.exits.find((e) => e.id === 'save');
  assert.equal(save.needs.task, 'diyilu-niugu');
  assert.ok(save.refuse.zh && save.refuse.en);
  // the reading cap: 9,360 字 from 药园巡夜 to 今二's 罚球 is broken at the bone
  const parts = stretchesOf(content.chapters['00-waimen']);
  const at = parts.findIndex((p) => p.to === 'wm-diyilu');
  assert.ok(at > 0, 'the feed is a beat');
  assert.equal(parts[at].from, 'wm-yaoyuan');
  assert.equal(parts[at + 1].from, 'wm-diyilu');
  assert.ok(parts[at].chars + parts[at + 1].chars <= 9360 && parts[at].chars < 3000, `${parts[at].chars} · ${parts[at + 1].chars}`);
  assert.ok(RHYTHM_CAP > 0);
});
