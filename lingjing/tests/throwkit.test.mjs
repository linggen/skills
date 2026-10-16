// 投掷 · the kit (Hanli 2026-10-16: 「投掷类都可以换. 可以多设计一些工具, 特效, 让它更好玩」): the things
// 小满 throws are data (games.json `projectiles`), each made his by a card he holds (the card law);
// each flies its own way — a stone skips and knocks reeds over, an arrow pierces them, the short
// sword dashes on with a tap, the thunder talisman bursts with one; every kit level is won by the
// bot at a 10 ms and a 50 ms clock; the tray shows only his own things.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as da from '../scripts/games/deerarc.js';
import * as kit from '../scripts/games/throwkit.js';
import { bot } from '../scripts/games/bots/throwkit.js';
import { solve } from '../scripts/games/bots/deerarc.js';
import { projectileOf, trayOf } from '../scripts/games/throws.js';
import { playOnce } from '../tools/board-bots.mjs';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const PROJ = content.games.projectiles;
const ROW = content.games.games.find((g) => g.id === 'throwkit');
const LEVELS = ROW.levels;
const level = (id) => LEVELS.find((l) => l.id === id);
const deal = (levels, extra = {}) => ({ levels, projectiles: PROJ, ...extra });

test('the kit is data: four things, each his by a card the book names (or always his), a level for each and one with all', () => {
  assert.deepEqual(Object.keys(PROJ), ['arrow', 'stone', 'sword', 'talisman']);
  const cards = new Set(content.cards.cards.map((c) => c.id));
  for (const [id, p] of Object.entries(PROJ)) {
    assert.ok(p.name?.zh && p.name?.en, id);
    if (p.from) assert.ok(cards.has(p.from), `${id}: ${p.from} is a card`);
    if (p.ability) assert.ok(p.tip?.zh && p.tip?.en, `${id}: says its tap`);
  }
  assert.equal(ROW.group, 'kit');
  assert.deepEqual(LEVELS.map((l) => l.ammo.join('+')), ['stone', 'arrow', 'sword', 'talisman', 'arrow+stone+sword+talisman']);
  assert.equal(typeof kit.mount, 'function');
  assert.equal(kit.meta.id, 'throwkit');
});

test('the card law: the tray holds the scene\'s own tool and what his cards make his; the 游戏厅 holds all', () => {
  const all = level('all');
  assert.deepEqual(trayOf(all, PROJ, []), ['arrow'], 'no cards: the bow only');
  assert.deepEqual(trayOf(all, PROJ, ['feijian']), ['arrow', 'sword']);
  assert.deepEqual(trayOf(all, PROJ, null), ['arrow', 'stone', 'sword', 'talisman']);
  assert.deepEqual(trayOf({ ammo: ['stone'] }, PROJ, []), ['stone'], 'a level\'s first is always his');
  let s = kit.newGame('t', 1, deal([all], { owned: ['feijian'] }));
  assert.deepEqual(s.ammo, ['arrow', 'sword']);
  const h = kit.html(s, 'zh');
  assert.match(h, /data-g="pick" data-p="sword"/);
  assert.doesNotMatch(h, /data-p="talisman"/, 'not his: not in the tray');
  s = kit.act(s, { g: 'pick', p: 'sword' }).state;
  assert.equal(s.pick, 'sword');
  assert.equal(kit.act(s, { g: 'pick', p: 'talisman' }).state, s, 'what is not his cannot be picked');
  assert.doesNotMatch(kit.html(kit.newGame('t', 1, deal([level('stone')])), 'zh'), /g-tk-tray/, 'one thing: no tray');
});

/** One throw: draw, loose, tap at `tapAt` (steps) if any, on a `step` ms clock. */
function throwOnce(lv, aim, { step = 10, tapAt = null, pick } = {}) {
  let s = kit.newGame('t', 1, deal([lv]));
  if (pick) s = kit.act(s, { g: 'pick', p: pick }).state;
  s = kit.act(kit.act(s, { g: 'draw', ...aim }).state, { g: 'loose' }).state;
  for (let i = 0; i < 2000 && s.phase === 'fly'; i++) {
    if (tapAt != null && s.world.arrow && !s.world.arrow.tapped && s.world.arrow.steps >= tapAt) s = kit.act(s, { g: 'tap' }).state;
    if (s.phase === 'fly') s = kit.tick(s, step);
  }
  return s;
}

for (const lv of LEVELS) {
  test(`kit level ${lv.id}: its own thing finds a clean throw, and it lands at a 10 ms and a 50 ms clock`, () => {
    const proj = projectileOf(PROJ, lv.ammo.at(-1));
    const aim = solve(lv, 0, proj);
    assert.ok(aim, `${lv.id}: ${proj.id} has a clean throw`);
    for (const step of [10, 50]) {
      const s = throwOnce(lv, aim, { step, tapAt: aim.tapAt, pick: proj.id });
      assert.equal(s.phase, 'hit', `${lv.id} at ${step} ms with ${proj.id}: ${s.phase} (${s.said})`);
    }
  });
}

test('each throws its own way: the burst level is the talisman\'s alone; the reed wall stops arrow, stone and sword', () => {
  const burst = level('burst');
  for (const id of ['arrow', 'stone', 'sword']) assert.equal(solve(burst, 0, projectileOf(PROJ, id)), null, `${id} cannot`);
  assert.ok(solve(burst, 0, projectileOf(PROJ, 'talisman')));
});

test('a stone skips once off the ground and knocks a reed over; an arrow pierces a reed the stone cannot', () => {
  const open = { ...level('stone'), deer: { x: -999 }, things: [] };
  const w = da.shoot(da.build(open), { a: 10, p: 0.5 }, projectileOf(PROJ, 'stone'));
  const evs = [];
  for (let i = 0; i < 400 && !w.arrow.done; i++) evs.push(da.stepWorld(w, open, i * da.STEP_MS));
  assert.equal(evs.filter((e) => e === 'bounce').length, 1, 'one skip');
  assert.ok(w.arrow.fx.some((f) => f.kind === 'bounce'), 'dust where it struck');
  const wall = { ...level('pierce'), deer: { x: -999 } };
  const flat = { a: 14, p: 0.6 };
  assert.ok(da.flight(wall, flat, 0, 600, { proj: projectileOf(PROJ, 'arrow') }).snapped > 0, 'the arrow through');
  assert.equal(da.flight(wall, flat, 0, 600, { proj: projectileOf(PROJ, 'stone') }).snapped, 0, 'the stone turned');
});

test('the sword\'s tap: straight on along the line it was loosed on, faster — once; a press in flight is the tap', () => {
  const open = { ...level('dash'), deer: { x: -999 }, things: [], wind: 0 };
  let s = kit.newGame('t', 1, deal([open]));
  s = kit.act(kit.act(s, { g: 'draw', a: 30, p: 0.6 }).state, { g: 'loose' }).state;
  for (let i = 0; i < 20; i++) s = kit.tick(s, 10);
  const ar = s.world.arrow, before = Math.hypot(ar.body.velocity.x, ar.body.velocity.y);
  s = kit.act(s, { g: 'hold', x: 100, y: 100 }).state; // the press
  const v = s.world.arrow.body.velocity, after = Math.hypot(v.x, v.y);
  assert.ok(after > before * 1.5, `faster: ${before.toFixed(2)} → ${after.toFixed(2)}`);
  const [dx, dy] = s.world.arrow.dir;
  assert.ok(Math.abs(v.x / after - dx) < 1e-6 && Math.abs(v.y / after - dy) < 1e-6, 'along the line it was loosed on');
  assert.equal(kit.act(s, { g: 'tap' }).state, s, 'once');
  assert.match(kit.html(kit.tick(s, 50), 'zh'), /g-tk-dash/, 'its streak');
});

test('the talisman\'s tap: lightning where it is — reeds in reach snap, the deer in reach is hit, the throw is spent', () => {
  const burst = level('burst'), aim = solve(burst, 0, projectileOf(PROJ, 'talisman'));
  const s = throwOnce(burst, aim, { tapAt: aim.tapAt });
  assert.equal(s.phase, 'hit');
  assert.ok(s.world.arrow.done);
  assert.match(kit.html(s, 'zh'), /g-tk-burst/, 'the lightning drawn');
  // A burst in the empty air hits nothing and is a miss.
  const far = throwOnce({ ...burst, deer: { x: -999 }, things: [] }, { a: 40, p: 0.4 }, { tapAt: 10 });
  assert.equal(far.phase, 'aim', 'spent; the next throw at once');
});

test('the whole kit by the bot: won, at the 游戏厅\'s deal (everything his)', () => {
  const r = playOnce(kit, bot, { seed: 'kit-1', deal: deal(LEVELS) });
  assert.equal(r.won, true);
  assert.ok(r.ms < 150000, `${r.ms} ms`);
});
