// 抚琴 (games/fuqin.js): Piano Tiles on osu!mania's rules. The windows are osu!'s, a tune reads from 简谱, every level is
// won clean by a steady hand and lost by one that never plays or mashes every lane, and every note it plays sounds.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { act, chartOf, gradeOf, ladderOf, meta, newGame, readTune, tick, windowsOf, LANES } from '../scripts/games/fuqin.js';
import { resolve } from '../scripts/games/kit/sound.js';
import { bot } from '../scripts/games/bots/fuqin.js';
import { playModule } from '../tools/board-bots.mjs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const REG = read('../worlds/jiuding/games.json');
const SOUNDS = read('../scripts/games/kit/audio/sounds.json');
const LEVELS = ladderOf(REG);
// the story's own levels (a row with a `task`): off the ladder, held to the same hands
const STORY = REG.games.filter((g) => g.id === 'fuqin' && g.task).flatMap((g) => g.levels);

/* A player: presses (and releases) in time order, the run stepped 8 ms a frame between them, as a page's frames go. */
function play(level, inputs) {
  const s = newGame('', 1, { levels: [level] });
  const queue = [...inputs].sort((a, b) => a.at - b.at);
  let q = 0;
  while (s.phase === 'play') {
    tick(s, 8);
    while (q < queue.length && queue[q].at <= s.clock && s.phase === 'play') act(s, queue[q++]);
    if (s.clock > s.endAt + 5000) break;
  }
  return s;
}
const rand = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
/* A steady hand: each key within ±`spread` ms of its note; a long tile held to its end. */
function hand(level, spread, seed = 7) {
  const r = rand(seed), out = [];
  for (const n of chartOf(level)) {
    const at = n.t + (r() * 2 - 1) * spread;
    out.push({ g: 'press', lane: n.lane, at });
    out.push({ g: 'release', lane: n.lane, at: n.hold ? n.end + 20 : at + 60 });
  }
  return out;
}

test('the windows are osu!mania\'s (ManiaHitWindows): OD 0 · 5 · 10, floored + 0.5; ease widens them', () => {
  assert.deepEqual(windowsOf({ od: 0 }), { good: 64.5, ok: 151.5, miss: 188.5 });
  assert.deepEqual(windowsOf({ od: 5 }), { good: 49.5, ok: 136.5, miss: 173.5 });
  assert.deepEqual(windowsOf({ od: 10 }), { good: 34.5, ok: 121.5, miss: 158.5 });
  assert.ok(windowsOf({ od: 0, ease: 1.3 }).good > 80, 'the first level is wide');
  const w = windowsOf({ od: 5 });
  assert.equal(gradeOf(w, 40), 'good');
  assert.equal(gradeOf(w, -100), 'ok');
  assert.equal(gradeOf(w, 160), 'miss');
  assert.equal(gradeOf(w, -300), null, 'a press long before a note is not for it');
});

test('a tune reads from 简谱: octaves, beams, dots, holds and rests', () => {
  const n = readTune("1 2_3_ 5' 6,. 7_ - 0 1", 60);
  assert.deepEqual(n.map((x) => x.midi), [60, 62, 64, 79, 57, 71, 60]);
  assert.deepEqual(n.map((x) => x.len), [1, 0.5, 0.5, 1, 1.5, 1.5, 1]);
  assert.deepEqual(n.map((x) => x.beat), [0, 1, 1.5, 2, 3, 4.5, 7]);
  assert.throws(() => readTune('8'), /cannot read/);
});

test('the ladder: level 1 is slow, taps only and wide; holds and tempo climb after', () => {
  assert.ok(LEVELS.length >= 3);
  const [one, ...rest] = LEVELS;
  assert.equal(one.holds, false);
  assert.ok(one.bpm <= 64 && one.fall >= 2400);
  assert.ok(rest.some((l) => l.holds), 'long tiles come later');
  for (let k = 1; k < LEVELS.length; k += 1) assert.ok(LEVELS[k].fall <= LEVELS[k - 1].fall, `${LEVELS[k].id} falls no slower than the one before`);
  for (const l of LEVELS) {
    const c = chartOf(l);
    assert.ok(c.length >= 20, l.id);
    // a long tile's lane is not struck again while it is held
    for (const h of c.filter((n) => n.hold)) assert.ok(!c.some((n) => n !== h && n.lane === h.lane && n.t > h.t - 1 && n.t < h.end + 100), `${l.id}: lane ${h.lane} is free while held`);
    assert.ok(new Set(c.map((n) => n.lane)).size === LANES, `${l.id}: all four lanes play`);
  }
});

for (const level of [...LEVELS, ...STORY]) {
  test(`${level.id}: a steady hand wins it clean (3★); a loose one still wins; one that never plays or mashes loses`, () => {
    const clean = play(level, hand(level, 25));
    assert.equal(clean.phase, 'won', `${level.id}: clean ${JSON.stringify(clean.counts)}`);
    assert.equal(clean.stars, 3, JSON.stringify(clean.counts));
    assert.equal(clean.counts.miss + clean.counts.wrong, 0);
    const loose = play(level, hand(level, 110, 3));
    assert.equal(loose.phase, 'won', `${level.id}: loose ${JSON.stringify(loose.counts)} hp ${loose.hp}`);
    assert.ok(loose.stars < 3);
    assert.equal(play(level, []).phase, 'failed', 'never pressing loses');
    const mash = [];
    for (let at = 0; at < chartOf(level).at(-1).end; at += 70) for (let lane = 0; lane < LANES; lane += 1) mash.push({ g: 'press', lane, at }, { g: 'release', lane, at: at + 30 });
    assert.equal(play(level, mash).phase, 'failed', 'mashing every lane loses (a wrong note costs)');
  });
}

test('a long tile: let go early and it breaks; held to its end it finishes', () => {
  const level = LEVELS.find((l) => l.holds);
  const c = chartOf(level), h = c.find((n) => n.hold);
  const s = newGame('', 1, { levels: [level] });
  const early = c.filter((n) => n.t < h.t);
  for (const n of early) { while (s.clock < n.t) tick(s, 4); act(s, { g: 'press', lane: n.lane, at: n.t }); act(s, { g: 'release', lane: n.lane, at: n.t + 40 }); }
  while (s.clock < h.t) tick(s, 4);
  act(s, { g: 'press', lane: h.lane, at: h.t });
  tick(s, 100);
  act(s, { g: 'release', lane: h.lane, at: s.clock });
  assert.equal(s.res[h.i].head, 'good');
  assert.equal(s.res[h.i].tail, 'miss', 'let go long before its end');
});

test('every note any level plays sounds its own pitch, and the drone too', () => {
  assert.equal(meta.id, 'fuqin');
  for (const l of LEVELS) {
    for (const n of chartOf(l)) {
      const r = resolve(SOUNDS, 'fuqin', 'note', String(n.midi));
      assert.equal(r?.sounds[0], `qin.${n.midi}`, `${l.id}: note ${n.midi}`);
      assert.equal(r.min, 0, 'a note is never dropped for coming close after another');
    }
    if (l.drone != null) assert.equal(resolve(SOUNDS, 'fuqin', 'drone', String(l.drone))?.sounds[0], `qin.${l.drone}`);
  }
});

test('a story level (none yet): off the 游戏厅\'s ladder, taps only, and the human-like bot (board-bots.mjs) wins each within three tries', () => {
  for (const l of STORY) {
    assert.ok(!LEVELS.some((x) => x.id === l.id), `${l.id} is not on the ladder`);
    assert.equal(l.holds, false);
    const r = playModule({ newGame, act, tick }, bot, { tries: 3, deal: { levels: [l] } });
    assert.ok(r.won, `${l.id}: ${JSON.stringify(r.runs)}`);
  }
});

/* 2026-11-03 (Hanli: 「这个弹琴游戏好像有bug, 后面弹就对不上了, 无法成功」): a key was drawn up from its note, 124 px tall, so it lay
   on the bridge ~540 ms while only ~200 of them counted — struck as it lay there (Piano Tiles' way), a run broke at ~20%.
   Now what lies on the bridge is what may be struck: hands aimed at the key as drawn win, wherever on it they aim. */
import { tileSpan, LINE_Y } from '../scripts/games/fuqin.js';

const ALL = REG.games.filter((g) => g.id === 'fuqin').flatMap((g) => g.levels);
const gapIn = (chart, n) => { const a = chart.find((m) => m.lane === n.lane && m.t > n.t); return a ? a.t - n.t : 1e9; };

test('a perfect hand gets every note 良 on every level, the ladder\'s and the story\'s, to the end of the tune', () => {
  for (const lv of ALL) {
    const s = play(lv, hand(lv, 0));
    assert.equal(s.phase, 'won', lv.id);
    assert.equal(s.counts.good, s.judged, `${lv.id}: ${JSON.stringify(s.counts)}`);
  }
});

test('a tap key lies on the bridge only while it may be struck: from the near edge of 良 to the far edge of 可', () => {
  for (const lv of ALL) {
    const w = windowsOf(lv), v = LINE_Y / (lv.fall || 2000), chart = chartOf(lv);
    for (const n of chart.filter((x) => !x.hold)) {
      const sp = tileSpan(w, n, gapIn(chart, n), v);
      assert.ok(sp.below <= w.good + 1e-9 && sp.above <= w.ok + 1e-9, `${lv.id} #${n.i}: ${JSON.stringify(sp)}`);
      assert.ok((sp.below + sp.above) * v >= 45, `${lv.id} #${n.i}: still a key to see`);
    }
  }
});

test('hands aimed at the key as drawn win: at its first touch of the bridge, at its middle, or anywhere on it (±60 ms)', () => {
  for (const lv of ALL.filter((l) => !l.holds)) {
    const w = windowsOf(lv), v = LINE_Y / (lv.fall || 2000), chart = chartOf(lv), r = rand(11);
    const aims = { first: (sp) => -sp.below, middle: (sp) => (sp.above - sp.below) / 2, anywhere: (sp) => -sp.below + r() * (sp.below + sp.above) };
    for (const [name, aim] of Object.entries(aims)) {
      const inputs = chart.flatMap((n) => {
        const at = n.t + aim(tileSpan(w, n, gapIn(chart, n), v)) + (r() * 2 - 1) * 60;
        return [{ g: 'press', lane: n.lane, at }, { g: 'release', lane: n.lane, at: at + 60 }];
      });
      const s = play(lv, inputs);
      assert.equal(s.phase, 'won', `${lv.id}, aimed at the key's ${name}: ${JSON.stringify(s.counts)}`);
    }
  }
});
