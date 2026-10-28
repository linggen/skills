// 太鼓 (games/taiko.js): Taiko on osu!taiko's rules. The windows, the gauge and the balloon's count are osu!'s; a chart
// reads from its strip; every level — the 游戏厅's and the story's — is cleared 3★ by a steady hand, cleared under 3★ by a
// loose one, and failed by one that never plays and by one that mashes; every stroke sounds.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { act, balloonHits, chartOf, gaugeOf, gradeOf, ladderOf, meta, newGame, sideAt, tick, windowsOf, CLEAR, DRUM } from '../scripts/games/taiko.js';
import { bot } from '../scripts/games/bots/taiko.js';
import { playModule } from '../tools/board-bots.mjs';
import { resolve } from '../scripts/games/kit/sound.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const REG = read('../worlds/jiuding/games.json');
const SOUNDS = read('../scripts/games/kit/audio/sounds.json');
const LADDER = ladderOf(REG);
const STORY = REG.games.filter((g) => g.id === 'taiko' && g.task).flatMap((g) => g.levels.map((l) => ({ ...l, task: g.task })));
const ALL = [...LADDER, ...STORY];

/* A player: strokes in time order, the run stepped 8 ms a frame between them. */
function play(level, strokes) {
  const s = newGame('', 1, { levels: [level] });
  const queue = [...strokes].sort((a, b) => a.at - b.at);
  let q = 0;
  while (s.phase === 'play') {
    tick(s, 8);
    while (q < queue.length && queue[q].at <= s.clock && s.phase === 'play') act(s, { g: 'hit', ...queue[q++] });
    if (s.clock > s.endAt + 5000) break;
  }
  return s;
}
const rand = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
/* A steady hand: each mark within ±`spread` ms, both keys on a big one, a roll drummed on each tick, a balloon struck
   咚 咔 in turn as fast as two hands go (every 60 ms). */
function hand(level, spread, seed = 7) {
  const r = rand(seed), out = [];
  for (const n of chartOf(level)) {
    if (n.kind === 'hit') {
      const at = n.t + (r() * 2 - 1) * spread;
      out.push({ side: n.side, hand: 0, at });
      if (n.big) out.push({ side: n.side, hand: 1, at: at + 8 });
    } else if (n.kind === 'roll') for (const k of n.ticks) out.push({ side: 'don', hand: 0, at: k.t + 5 });
    else for (let at = n.t + 10, k = 0; at < n.end; at += 60, k += 1) out.push({ side: k % 2 ? 'ka' : 'don', hand: k % 2, at });
  }
  return out;
}

test('the windows are osu!taiko\'s (TaikoHitWindows): OD 0 · 5 · 10, floored − 0.5', () => {
  assert.deepEqual(windowsOf({ od: 0 }), { great: 49.5, ok: 119.5, miss: 134.5 });
  assert.deepEqual(windowsOf({ od: 5 }), { great: 34.5, ok: 79.5, miss: 94.5 });
  assert.deepEqual(windowsOf({ od: 10 }), { great: 19.5, ok: 49.5, miss: 69.5 });
  const w = windowsOf({ od: 5 });
  assert.equal(gradeOf(w, 30), 'great');
  assert.equal(gradeOf(w, -60), 'ok');
  assert.equal(gradeOf(w, 90), 'miss');
  assert.equal(gradeOf(w, -200), null, 'a stroke long before a mark is not for it');
});

test('the gauge (TaikoHealthProcessor) and the balloon (Swell) are osu!\'s numbers', () => {
  const g = gaugeOf({ drain: 5 }, 40);
  assert.ok(Math.abs(g.hit - 1 / (3 * 40 * 0.75)) < 1e-12);
  assert.ok(Math.abs(g.miss - 0.0075) < 1e-12);
  assert.equal(CLEAR, 0.5);
  assert.equal(balloonHits(2000, 5), Math.floor(2 * 5 * 1.65));
  assert.equal(balloonHits(100, 0), 1);
});

test('a chart reads from its strip: 咚 咔, big marks, a roll\'s ticks a quarter beat apart, a balloon\'s count', () => {
  const c = chartOf({ chart: 'dkDK|r===|b===', bpm: 60, div: 1, scroll: 1000, od: 5 });
  assert.deepEqual(c.map((n) => [n.kind, n.side, n.big]), [['hit', 'don', false], ['hit', 'ka', false], ['hit', 'don', true], ['hit', 'ka', true], ['roll', 'don', false], ['balloon', 'don', false]]);
  assert.deepEqual(c.map((n) => n.t), [2000, 3000, 4000, 5000, 6000, 10000]);
  assert.equal(c[4].end, 9000);
  assert.equal(c[4].ticks.length, 13, 'four ticks a beat over three beats, and the end');
  assert.equal(c[5].need, balloonHits(3000, 5));
  assert.deepEqual(c.bars, [2000, 6000, 10000]);
  assert.throws(() => chartOf({ chart: 'x' }), /cannot read/);
  assert.throws(() => chartOf({ chart: '=' }), /no roll/);
});

test('a stroke: the wrong side is a miss, a press too early does nothing, a big mark\'s second key within 30 ms is a bonus', () => {
  const level = { chart: 'dkD.', bpm: 60, div: 1, scroll: 1000, od: 5 };
  const s = newGame('', 1, { levels: [level] });
  const [d, k, big] = s.notes;
  act(s, { g: 'hit', side: 'don', at: d.t - 300 });
  assert.equal(s.judged, 0, 'too early: nothing');
  act(s, { g: 'hit', side: 'ka', at: d.t });
  assert.equal(s.res[d.i].grade, 'miss', '咔 on a 咚');
  act(s, { g: 'hit', side: 'ka', at: k.t + 10 });
  assert.equal(s.res[k.i].grade, 'great');
  act(s, { g: 'hit', side: 'don', hand: 0, at: big.t });
  act(s, { g: 'hit', side: 'don', hand: 1, at: big.t + 20 });
  assert.equal(s.res[big.i].strong, true);
  assert.equal(s.counts.strong, 1);
});

test('the ladder: level 1 is slow, 咚 only, the widest windows; 咔, big marks, rolls and a balloon climb after', () => {
  assert.ok(LADDER.length >= 4);
  const kinds = (l) => new Set(chartOf(l).map((n) => (n.kind === 'hit' ? `${n.side}${n.big ? '!' : ''}` : n.kind)));
  assert.deepEqual([...kinds(LADDER[0])], ['don']);
  assert.equal(LADDER[0].od, 0);
  assert.ok(LADDER[0].bpm / LADDER[0].div <= 80);
  for (let k = 1; k < LADDER.length; k += 1) {
    assert.ok(LADDER[k].od >= LADDER[k - 1].od, `${LADDER[k].id}: windows no wider than the one before`);
    assert.ok(LADDER[k].bpm * LADDER[k].div >= LADDER[k - 1].bpm * LADDER[k - 1].div, `${LADDER[k].id}: strokes no sparser`);
  }
  const all = new Set(LADDER.flatMap((l) => [...kinds(l)]));
  for (const k of ['don', 'ka', 'don!', 'ka!', 'roll', 'balloon']) assert.ok(all.has(k), k);
  for (const l of ALL) assert.ok(chartOf(l).filter((n) => n.kind === 'hit').length >= 20, l.id);
});

for (const level of ALL) {
  test(`${level.id}: a steady hand clears it 3★; a loose one still clears it; one that never plays or mashes fails`, () => {
    const clean = play(level, hand(level, 20));
    assert.equal(clean.phase, 'won', `${level.id}: clean ${JSON.stringify(clean.counts)} hp ${clean.hp}`);
    assert.equal(clean.stars, 3, JSON.stringify(clean.counts));
    assert.equal(clean.counts.miss, 0);
    const loose = play(level, hand(level, 75, 3));
    assert.equal(loose.phase, 'won', `${level.id}: loose ${JSON.stringify(loose.counts)} hp ${loose.hp}`);
    assert.ok(loose.stars < 3);
    assert.equal(play(level, []).phase, 'failed', 'never striking fails');
    const mash = [];
    const end = Math.max(...chartOf(level).map((n) => n.end));
    for (let at = 0, k = 0; at < end; at += 70, k += 1) mash.push({ side: k % 2 ? 'ka' : 'don', hand: k % 2, at });
    assert.equal(play(level, mash).phase, 'failed', 'drumming blind, 咚 咔 in turn, fails');
  });
}

test('the human-like bot (tools/board-bots.mjs: 200 ms ± 40 hands) clears every story level within three tries', () => {
  for (const level of STORY) {
    const r = playModule({ newGame, act, tick }, bot, { tries: 3, deal: { levels: [level] } });
    assert.ok(r.won, `${level.id}: ${JSON.stringify(r.runs)}`);
  }
});

test('the drum: its head is 咚, its rim and the rest of the board 咔; F J are 咚, D K 咔, a hand each', () => {
  assert.equal(sideAt(DRUM.x, DRUM.y), 'don');
  assert.equal(sideAt(DRUM.x + DRUM.head + 10, DRUM.y), 'ka');
  assert.equal(sideAt(20, 20), 'ka');
  assert.deepEqual(meta.keys, { d: ['ka', 0], f: ['don', 0], j: ['don', 1], k: ['ka', 1] });
});

test('every stroke and cue sounds: 咚 咔, a big mark\'s 钹, the small gong, a balloon\'s burst, a miss', () => {
  assert.equal(meta.id, 'taiko');
  for (const e of meta.sounds) assert.ok(resolve(SOUNDS, 'taiko', e)?.sounds?.length, e);
  assert.equal(resolve(SOUNDS, 'taiko', 'don').min, 0, 'a stroke is never dropped for coming close after another');
  assert.equal(resolve(SOUNDS, 'taiko', 'ka').min, 0);
});
