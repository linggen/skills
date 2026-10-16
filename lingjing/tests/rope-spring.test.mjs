// 弹竹 really bounces (Hanli 2026-10-16: 「弹竹没有作用」). The root cause: matter.js's setStatic,
// run while a static body is made, overwrote the bamboo's restitution with 0 and its friction with 1
// — the options never held, so the thing hit a dead, sticky stick (in 8.5, out 2.5 px a step). And
// 忍字's level hid the bamboo under a stone, which the generator's proof (a near pass, not a hit)
// let through. Here the thing is dropped onto the bamboo through the page's own clock — ropekit's
// tick at real frame times, its settle fast-forward included — and must leave faster than it came.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matter } from '../scripts/games/physics.js';
import { buildWorld } from '../scripts/games/rope.js';
import { generate, playPlan } from '../scripts/games/rope-gen.js';
import * as taunt from '../scripts/games/tauntrope.js';
import * as fantong from '../scripts/games/fantongcut.js';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const row = content.games.games.find((g) => g.id === 'tauntrope');

/* A level with the bamboo right under the thing, the mouth far off (nothing eats it). */
const DROP = (a) => ({ id: 'drop', bread: [180, 110], vines: [{ at: [180, 40] }], springs: [{ x: 180, y: 300, w: 120, a }], mouth: [330, 330], stars: [[40, 60], [60, 60], [80, 60]] });

/** Cut, then run the page's clock at `frame` ms a frame; the bamboo's first hit, and the speed after. */
function dropAt(mod, level, frame) {
  let s = mod.newGame('drop', 1, { levels: [level] });
  s = mod.act(s, { g: 'cut', v: '0', k: String(Math.floor(s.swing.vines[0].joints.length / 2)) }).state;
  for (let wall = 0; wall < 4000 && s.live && s.phase === 'play'; wall += frame) {
    const was = s.swing.sprung;
    s = mod.tick(s, frame);
    const hit = s.swing.sprung;
    if (hit && hit !== was) return { vin: hit.vin, vout: s.swing.bread.speed, vy: s.swing.bread.velocity.y };
  }
  return null;
}

test('the bamboo\'s material holds: restitution over 1, no friction (a stone stays dead and grippy, as every level was proved on)', () => {
  const w = buildWorld({ ...DROP(0), stones: [{ x: 60, y: 200, w: 60, h: 14 }] });
  const bodies = Matter.Composite.allBodies(w.engine.world);
  const sp = bodies.find((b) => b.label === 'spring'), st = bodies.find((b) => b.label === 'stone');
  assert.ok(sp.restitution > 1, `spring restitution ${sp.restitution}`);
  assert.equal(sp.friction, 0);
  assert.equal(st.restitution, 0);
  assert.equal(st.friction, 1);
});

for (const frame of [1000 / 120, 1000 / 60, 1000 / 30, 50]) {
  for (const a of [0, 20, -25]) {
    test(`dropped onto the bamboo (tilted ${a}°) at ${Math.round(frame)} ms a frame, it leaves faster than it came`, () => {
      const r = dropAt(taunt, DROP(a), frame);
      assert.ok(r, 'it met the bamboo');
      assert.ok(r.vin > 3, `came in at ${r.vin.toFixed(2)}`);
      assert.ok(r.vout > r.vin, `in ${r.vin.toFixed(2)}, out ${r.vout.toFixed(2)}`);
      assert.ok(r.vy < 0, 'thrown back up');
    });
  }
}

test('忍字\'s frozen level: the plan strikes the bamboo, nothing over it, and the thing comes off faster', () => {
  const level = row.levels[0];
  for (const st of level.stones ?? []) assert.ok(Math.hypot(st.x - level.springs[0].x, st.y - level.springs[0].y) > 80, 'no stone over the bamboo');
  const plain = playPlan(level, [{ g: 'cut', v: 0 }]);
  assert.ok(plain.path.sprungAt != null, 'the plan hits the bamboo');
  for (const frame of [1000 / 60, 1000 / 30]) {
    let s = taunt.newGame('t', 1, { levels: row.levels });
    s = taunt.act(s, { g: 'cut', v: '0', k: String(Math.floor(s.swing.vines[0].joints.length / 2)) }).state;
    let hit = null;
    for (let wall = 0; wall < 8000 && s.live && !s.won; wall += frame) {
      const was = s.swing.sprung;
      s = taunt.tick(s, frame);
      if (!hit && s.swing.sprung && s.swing.sprung !== was) hit = { vin: s.swing.sprung.vin, vout: s.swing.bread.speed };
    }
    assert.ok(hit && hit.vout > hit.vin, `${Math.round(frame)} ms: ${JSON.stringify(hit)}`);
    assert.ok(s.won || s.phase === 'eat' || s.phase === 'end', `${Math.round(frame)} ms: into the dog's mouth`);
  }
});

test('the 饭桶\'s 弹竹 day: its plan strikes the bamboo, and at real frames the thing comes off faster', () => {
  const ALL = ['gust', 'bubble', 'thorns', 'regrow', 'spring'];
  for (let k = 0; k < 3; k++) {
    const m = generate(`springday${k}`, { tier: 2, els: ALL, must: 'spring' });
    assert.ok(!m.fallback, `day ${k}`);
    assert.ok(playPlan(m.level, m.plan).path.sprungAt != null, `day ${k}: the plan strikes it`);
    const level = { ...m.level, id: 'day' };
    let s = fantong.newGame('d', 1, { level, plan: m.plan }), calm = 0, i = 0, hit = null;
    for (let wall = 0; wall < 30000 && s.live && !s.won; wall += 1000 / 60) {
      if (s.phase === 'play' && i < m.plan.length && calm >= 400) {
        const mv = m.plan[i++];
        s = fantong.act(s, mv.g === 'cut' ? { g: 'cut', v: String(mv.v), k: String(Math.floor(s.swing.vines[mv.v].joints.length / 2)) } : mv.g === 'pop' ? { g: 'pop', i: '0' } : { g: mv.g }).state;
        calm = 0;
      }
      const was = s.swing?.sprung;
      s = fantong.tick(s, 1000 / 60);
      if (!hit && s.swing?.sprung && s.swing.sprung !== was && s.swing.sprung.vin >= 3) hit = { vin: s.swing.sprung.vin, vout: s.swing.bread.speed };
      calm = s.phase === 'play' && s.swing.bread.speed < 0.12 ? calm + 1000 / 60 : 0;
    }
    assert.ok(hit, `day ${k}: met the bamboo hard`);
    assert.ok(hit.vout > hit.vin, `day ${k}: in ${hit.vin.toFixed(2)}, out ${hit.vout.toFixed(2)}`);
  }
});
