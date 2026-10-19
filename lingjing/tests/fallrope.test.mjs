// 拽 · 拽爹上崖 (00-fall's fall-storm) as a 割绳子 level on the kit (2026-10-19, Hanli: 「拽爹的也不好玩」):
// 爹 over the drop on two ropes, his pack (坠) dragging under him. The pack snags the swing on the rock
// spur; the strap first, then the rope out over the drop, then the last rope cut as he swings to the end
// of his arc toward the ledge — a timed cut, or the storm's gust swinging him higher first (the third 灵光).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import * as mod from '../scripts/games/fallrope.js';
import { simulate, HANDS, bot } from '../scripts/games/bots/fallrope.js';
import { playOnce } from '../tools/board-bots.mjs';

const content = loadContent();
const row = content.games.games.find((g) => g.id === 'fallrope');
const level = row.levels[0];

/* A plan with its waits: 'calm' (the thing hangs still 400 ms) or ms after the move before. */
function run(plan, limit = 12000) {
  let s = mod.newGame('t', 1, { levels: row.levels }), t = 0, i = 0, since = 0, calm = 0;
  while (t < limit && !s.won && s.phase !== 'miss') {
    if (s.phase === 'play' && i < plan.length) {
      const [g, v, wait = 'calm'] = plan[i];
      if (wait === 'calm' ? calm >= 400 : since >= wait) {
        s = mod.act(s, g === 'cut' ? { g, v: String(v), k: v === 'pack' ? '0' : String(Math.floor(s.swing.vines[v].joints.length / 2)) } : { g }).state;
        i++; since = 0; calm = 0;
      }
    }
    s = mod.tick(s, 10); t += 10; since += 10;
    calm = s.phase === 'play' && s.swing.bread.speed < 0.12 ? calm + 10 : 0;
  }
  return { won: Boolean(s.won), stars: s.stars, grade: s.grade };
}
const windowOf = (head, tail, to = 3000, step = 50) => {
  const won = [];
  for (let w = 0; w <= to; w += step) if (run([...head, ...tail(w)]).won) won.push(w);
  return won;
};

test('fall-storm plays fallrope: the task keeps its id, title and line; grades clean · steady · rough; the old board kept in the 游戏厅', () => {
  const t = content.tasks.tasks.find((x) => x.id === 'fall-storm');
  assert.equal(t.game, 'fallrope');
  assert.equal(t.stars, 3);
  assert.equal(t.done_line.zh, '爹扒住了崖壁。');
  assert.equal(row.task, 'fall-storm');
  assert.equal(row.scene, '00-fall');
  assert.equal(row.mechanic, '割绳子');
  const old = content.games.games.find((g) => g.id === 'storm');
  assert.ok(old && !old.task && !old.scene, 'storm stays, off the story');
  assert.ok(level.pack && level.air && level.gust && level.reach, 'pack, a swing level, the storm\'s gust, a ledge');
});

test('拽: the pack on, no order wins — it snags the swing on the spur', () => {
  for (const tail of [(w) => [['cut', 1, w]], (w) => [['cut', 1, w], ['gust', null, 600]], (w) => [['gust', null, w], ['cut', 1, 600]]]) {
    assert.deepEqual(windowOf([['cut', 0]], tail), [], 'rope 0 first, the pack still on');
  }
  assert.deepEqual(windowOf([['cut', 1]], (w) => [['cut', 0, w]]), [], 'rope 1 first: he swings out over the drop');
});

test('拽: the strap, rope 0, then rope 1 timed at the end of the swing — a window a person can hit, early and late both miss', () => {
  const won = windowOf([['cut', 'pack'], ['cut', 0]], (w) => [['cut', 1, w]]);
  assert.ok(won.length * 50 >= 300 && won.length * 50 <= 900, `a ${won.length * 50} ms window`);
  assert.ok(won[0] > 300, 'cut at once: he drops into the drop');
  assert.ok(won.at(-1) < 2500, 'too late: he swings back out');
  assert.equal(run([['cut', 'pack'], ['cut', 0], ['cut', 1, won[Math.floor(won.length / 2)]]]).stars, 2, 'the plain way: two 灵光');
});

test('拽: the storm\'s gust into the swing, then the cut — a wider window, and the third 灵光 (clean)', () => {
  const won = windowOf([['cut', 'pack'], ['cut', 0], ['gust', null, 500]], (w) => [['cut', 1, w]]);
  assert.ok(won.length * 50 >= 600, `a ${won.length * 50} ms window with the wind`);
  const best = won.map((w) => run([['cut', 'pack'], ['cut', 0], ['gust', null, 500], ['cut', 1, w]])).filter((r) => r.stars === 3);
  assert.ok(best.length, 'three 灵光 up the higher swing');
  assert.equal(best[0].grade, 'clean');
});

test('拽: hands — casual mostly wins inside 90 s after a miss or so, sloppy often, idle never; the board-bots player wins', () => {
  const N = 12, casual = [], sloppy = [];
  for (let i = 0; i < N; i++) casual.push(simulate(level, HANDS.casual, { seed: `c${i}`, limit: 90000 }));
  for (let i = 0; i < N; i++) sloppy.push(simulate(level, HANDS.sloppy, { seed: `s${i}`, limit: 90000 }));
  const cw = casual.filter((r) => r.won), median = cw.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(cw.length / 2)];
  assert.ok(cw.length >= N * 0.75, `casual won ${cw.length}/${N}`);
  assert.ok(median >= 15000 && median <= 60000, `casual median ${median} ms`);
  assert.ok(cw.filter((r) => r.misses >= 1).length >= cw.length / 2, 'most casual wins came after a miss');
  assert.ok(sloppy.filter((r) => r.won).length >= N * 0.4, 'sloppy wins often');
  assert.ok(!simulate(level, HANDS.idle, { seed: 'i', limit: 90000 }).won, 'idle never');
  assert.ok(playOnce(mod, bot, { seed: 'b1', deal: { levels: row.levels }, limit: 120000 }).won, 'board-bots');
});

test('拽: the book line above the board; the strap is a cut line; no skip of its own; stuck after four misses', () => {
  const s = mod.newGame('x', 1, { levels: row.levels });
  for (const lang of ['zh', 'en']) {
    const h = mod.html(s, lang);
    assert.match(h, /g-rope-quote/);
    assert.match(h, /data-v="pack"/);
    assert.match(h, /data-see="goal"/);
    assert.doesNotMatch(h, /data-g="skip"/);
  }
  assert.equal(mod.stuck({ ...s, misses: 4 }), true);
});
