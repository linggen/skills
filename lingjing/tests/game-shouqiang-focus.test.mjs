// 兽潮 集火 (Hanli 11-05: 「兽潮里点一只怪集火似乎没用」): a tapped beast is everyone's — the heroes' swords and 银月's fox
// the moment it comes into reach, a bed's 剑符 in its lane past the beasts in front of it — and a second tap lets it go.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { focusFar, newGame, pick, place, reachY, setFocus, step } from '../scripts/games/shouqiang/core.js';

const kit = JSON.parse(readFileSync(new URL('../worlds/jiuding/levels/shouqiang.json', import.meta.url), 'utf8'));
const advance = (g, secs) => { for (let t = 0; t < secs; t += 0.05) step(g, 0.05); };

test('a far beast tapped: marked and waiting; in reach, every shot is sent at it; tapped again, let go', () => {
  const level = kit.levels[0];
  const g = newGame(kit, level, { seed: 'focus-far' });
  advance(g, level.leadSec + 0.2); pick(g, 'open-jian'); advance(g, level.countIn + 0.2);
  const R = reachY(g);
  let far = null;
  for (let t = 0; t < 30 && !far; t += 0.05) { step(g, 0.05); far = g.beasts.find((b) => b.hp > 0 && b.y < R - 40); }
  assert.ok(far, 'a beast still up the road');
  assert.equal(setFocus(g, far.id), far.id, 'marked the moment it is tapped');
  assert.ok(focusFar(g), 'out of reach: the page says 还没进射程 and keeps the mark');
  for (let t = 0; t < 30 && far.hp > 0 && far.y < R + 5; t += 0.05) step(g, 0.05);
  assert.ok(far.hp > 0, 'it lived to come into reach');
  assert.equal(g.focus, far.id, 'the mark waited for it');
  // Every sword and fox loosed while it lives (once it falls the focus goes, and the next beast is fair game).
  const seen = new Set(g.shots.map((s) => s.id)), fired = [];
  for (let t = 0; t < 2.5 && far.hp > 0; t += 0.05) {
    step(g, 0.05);
    for (const s of g.shots) if (!seen.has(s.id)) { seen.add(s.id); if (far.hp > 0 || s.home === far.id) fired.push(s); }
  }
  fired.splice(0, fired.length, ...fired.filter((s) => s.kind === 'sword' || s.kind === 'fox' || s.kind === 'foxfire'));
  {
    assert.ok(fired.length, `the heroes fired (it ${far.hp > 0 ? 'lives' : 'fell'})`);
    assert.ok(fired.every((s) => s.home === far.id || s.kind === 'foxfire'), `every sword and fox at it: ${fired.map((s) => `${s.kind}→${s.home}`)}`);
    assert.ok(fired.some((s) => s.home === far.id));
    if (far.hp > 0) { assert.equal(setFocus(g, far.id), null, 'tapped again: let go'); assert.equal(g.focus, null); }
  }
});

test('in the 药园: a bed\'s 剑符 sends its bolts past the beast in front to the tapped one up its lane', () => {
  const level = kit.levels.find((l) => l.grid);
  const g = newGame(kit, level, { seed: 'focus-lane' });
  advance(g, (level.leadSec ?? 0) + (level.countIn ?? 0) + 0.5);
  g.ling = 99999;
  for (let col = 0; col < level.grid.cols; col += 1) { g.seedCool = {}; assert.ok(place(g, 'jian', col, 0), `a 剑符 in bed ${col}`); }
  const R = reachY(g);
  let pair = null;
  for (let t = 0; t < 120 && !pair; t += 0.05) {
    step(g, 0.05);
    g.ling = 99999;
    const live = g.beasts.filter((b) => b.hp > 0 && b.y >= R + 10 && b.col != null);
    for (const a of live) for (const b of live) if (a !== b && a.col === b.col && b.y < a.y - 30) pair = { near: a, far: b };
  }
  assert.ok(pair, 'two beasts up one lane');
  setFocus(g, pair.far.id);
  const seen = new Set(g.shots.map((s) => s.id)), bolts = [];
  for (let t = 0; t < 1.5 && pair.far.hp > 0; t += 0.05) {
    step(g, 0.05);
    for (const s of g.shots) if (!seen.has(s.id)) { seen.add(s.id); if (s.lane === pair.far.col && pair.far.hp > 0) bolts.push(s); }
  }
  assert.ok(bolts.length, 'the bed fired');
  assert.ok(bolts.every((s) => s.aim === pair.far.id), `every bolt of that bed aimed at it: ${bolts.map((s) => s.aim)}`);
});

test('the focused beast tapped again lets it go; out of reach it is still marked, and said so', () => {
  const level = kit.levels[0];
  const g = newGame(kit, level, { seed: 'focus-toggle' });
  advance(g, level.leadSec + 0.2); pick(g, 'open-jian'); advance(g, level.countIn + 0.2);
  let b = null;
  for (let t = 0; t < 30 && !b; t += 0.05) { step(g, 0.05); b = g.beasts.find((x) => x.hp > 0 && x.y < reachY(g) - 40); }
  assert.equal(setFocus(g, b.id), b.id);
  assert.ok(focusFar(g), '还没进射程');
  assert.equal(setFocus(g, b.id), null, 'a second tap clears it');
  assert.equal(focusFar(g), false);
});
