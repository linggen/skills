// 拼图 (games/pintu.js) — the jigsaw in 七巧's place (Hanli 2026-10-27: 「七巧板的游戏删了吧, 换成别的. 感觉想给3岁小孩玩的」):
// every deal can be made whole, the first meeting is two trades, the ladder climbs, and 七巧 is gone from play with no
// save left holding a board it cannot win.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { meta, newGame, act, html, sounds, least, LEVELS, PICS, levelOf, ensureCss } from '../scripts/games/pintu.js';
import { loadContent } from '../scripts/content.mjs';
import { everyJuan } from './prologue.mjs';
import { fitWorld, newState } from '../scripts/state.mjs';
import { look, tale } from '../scripts/rules.mjs';
import { allPlaces } from '../scripts/rules/world.mjs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const out = (s) => s.tiles.filter((t, i) => t.id !== i).length;
const turned = (s) => s.tiles.filter((t) => t.r).length;

/* Play a board out the way 问询 points (a lit piece to its square, else a lit turn): the hint never strands him. */
function playOut(s0) {
  let s = s0, steps = 0;
  while (!s.won && steps < 200) {
    s = act(act(s, { g: 'hint' }).state, { g: 'hint' }).state; // the first ? is the rule; then a lit piece, picked
    const h = s.hint;
    assert.ok(h, 'a lit next piece');
    s = h.turn != null ? act(s, { g: 'turn' }).state : act(s, { g: 'tile', i: h.to }).state;
    steps += 1;
  }
  return { s, steps };
}

test('the module: its name, what it sounds, the shell\'s ? and ↺', () => {
  assert.equal(meta.id, 'pintu');
  assert.ok(meta.how.zh && meta.how.en);
  assert.deepEqual(meta.sounds, ['pick', 'move', 'turn', 'nope']);
  const s = newGame('m', 1);
  assert.equal(meta.ask(s), 'hint');
  assert.equal(meta.restart(s), false, 'a fresh deal has nothing to undo');
});

test('the first meeting is easy for anyone: 3×3, four pieces out in two traded pairs, none turned — two moves whole', () => {
  for (let k = 0; k < 40; k++) {
    const s = newGame(`first-${k}`, 1, { lv: 0 });
    assert.equal(s.level, 0);
    assert.equal(s.n, 3);
    assert.equal(out(s), 4, 'two pairs traded');
    assert.equal(turned(s), 0);
    assert.equal(s.turns, false, 'no turning at a first meeting');
    assert.equal(least(s), 2);
  }
});

test('the ladder climbs: bigger grids, every piece out, then turned pieces; each deal is the same for the same seed', () => {
  const avg = (lv) => {
    let sum = 0;
    for (let k = 0; k < 30; k++) sum += least(newGame(`lad-${k}`, 1, { lv }));
    return sum / 30;
  };
  const means = [0, 1, 2, 3, 4].map(avg);
  for (let i = 1; i < means.length; i++) assert.ok(means[i] > means[i - 1], `level ${i} asks more than ${i - 1}: ${means}`);
  for (const lv of [1, 2, 3, 4]) {
    const s = newGame(`all-${lv}`, 1, { lv });
    assert.equal(s.n, LEVELS[lv].n);
    assert.equal(out(s), s.n * s.n, `level ${lv}: no piece starts home`);
    assert.equal(s.turns, LEVELS[lv].turned > 0);
    if (s.turns) assert.ok(turned(s) > 0);
  }
  assert.deepEqual(newGame('same', 1, { lv: 3 }).tiles, newGame('same', 1, { lv: 3 }).tiles);
  assert.notDeepEqual(newGame('a', 1, { lv: 3 }).tiles, newGame('b', 1, { lv: 3 }).tiles);
  assert.equal(levelOf(2, {}), 2, 'no lv: the level as ever (a 传闻 step)');
  assert.equal(levelOf(1, { lv: 9 }), 1, 'a level off the ladder falls back');
});

test('every deal of every level can be made whole, by the hint alone, in the fewest moves', () => {
  for (const lv of Object.keys(LEVELS).map(Number))
    for (let k = 0; k < 12; k++) {
      const s0 = newGame(`solve-${lv}-${k}`, 1, { lv });
      const { s, steps } = playOut(s0);
      assert.ok(s.won, `level ${lv} seed ${k} whole`);
      // each lit step is one move: a trade or a quarter turn, never more than the least the board needs
      assert.ok(steps <= least(s0), `level ${lv}: ${steps} lit steps for ${least(s0)}`);
      assert.equal(s.moves, steps);
    }
});

test('the taps: pick, put back, trade; a turn needs a picked piece; ↺ lays the same deal again', () => {
  let s = newGame('taps', 1, { lv: 3 });
  const first = s.tiles;
  s = act(s, { g: 'tile', i: 0 }).state;
  assert.equal(s.sel, 0);
  s = act(s, { g: 'tile', i: 0 }).state;
  assert.equal(s.sel, null, 'the same piece again puts it back');
  const r = act(s, { g: 'turn' });
  assert.equal(r.state.refused, true, 'nothing picked: nothing turns');
  assert.deepEqual(sounds(s, r.state), ['nope']);
  s = act(r.state, { g: 'tile', i: 0 }).state;
  const t = act(s, { g: 'tile', i: 1 }).state;
  assert.deepEqual([t.tiles[0], t.tiles[1]], [first[1], first[0]], 'the two traded');
  assert.equal(t.moves, 1);
  assert.deepEqual(sounds(s, t), ['move']);
  const p = act(t, { g: 'tile', i: 2 }).state, q = act(p, { g: 'turn' }).state;
  assert.equal(q.tiles[2].r, (p.tiles[2].r + 1) % 4);
  assert.deepEqual(sounds(p, q), ['turn']);
  assert.equal(meta.restart(q), true);
  const again = act(q, { g: 'restart' }).state;
  assert.deepEqual(again.tiles, first);
  assert.equal(again.moves, 0);
  // the keys: a cursor and a take
  let k = act(newGame('keys', 1, { lv: 1 }), { g: 'cur', dir: 'right' }).state;
  k = act(k, { g: 'cur', dir: 'down' }).state;
  assert.equal(k.cur, 4);
  assert.equal(act(k, { g: 'take' }).state.sel, 4);
});

test('the board draws: a picture cut into its squares, the picture beside it, the turn button only where pieces lie turned', () => {
  const s = newGame('draw', 1, { lv: 0 });
  const h = html(s, 'zh');
  assert.match(h, /class="g-pintu"/);
  assert.equal((h.match(/data-g="tile"/g) ?? []).length, 9);
  assert.match(h, /g-pintu-look/);
  assert.doesNotMatch(h, /data-g="turn"/);
  assert.match(html(newGame('draw', 1, { lv: 4 }), 'en'), /data-g="turn"/);
  assert.doesNotMatch(h + html(s, 'en'), /undefined|\{\w+\}/);
  const help = html(act(s, { g: 'hint' }).state, 'zh');
  assert.match(help, /点一块，再点另一块/);
  // a picture is the deal's when it gives one, picked by the seed, else the built-in list; never a path out of worlds/
  assert.equal(newGame('p', 1, { pics: [{ src: 'worlds/jiuding/art/zheng.webp', a: 1 }] }).pic.src, 'worlds/jiuding/art/zheng.webp');
  assert.ok(PICS.some((p) => p.src === newGame('p', 1, { pics: ['../../etc/x.webp'] }).pic.src));
  for (let k = 0; k < 30; k++) for (const lv of [0, 1]) assert.ok(!newGame(`easy-${k}`, 1, { lv }).pic.src.includes('jiuzhou-ink'), 'the pale ink map never at a first meeting');
  for (const p of PICS) assert.ok(fs.existsSync(new URL(`../${p.src}`, import.meta.url)), p.src);
});

test('the board fetches its own stylesheet, once: a page open from before the install still draws it (Hanli 10-27: 「图看不到了」)', () => {
  const fake = (linked) => {
    const kids = [], byId = {};
    return { kids, head: { appendChild: (l) => { kids.push(l); byId[l.id] = l; } }, createElement: () => ({}),
      getElementById: (id) => byId[id] ?? null, querySelector: () => (linked ? {} : null) };
  };
  const bare = fake(false);
  ensureCss(bare); ensureCss(bare);
  assert.equal(bare.kids.length, 1);
  assert.match(bare.kids[0].href, /games\/pintu\.css$/);
  const linked = fake(true);
  ensureCss(linked);
  assert.equal(linked.kids.length, 0, 'a page that links it is left alone');
});

/* ── 七巧 gone from play ── */
const content = loadContent();
const TASKS = read('../worlds/jiuding/tasks/world.json').tasks;

test('七巧 is gone from play: no task, place, errand or new 奇遇 / 传闻 deals it; 拼图 stands where it stood', () => {
  assert.ok(!fs.existsSync(new URL('../scripts/games/qiqiao.js', import.meta.url)), 'the module is deleted');
  assert.ok(!TASKS.some((t) => t.game === 'qiqiao' || t.id === 'qiqiao'));
  const cut = content.games.games.find((g) => g.id === 'qiqiao');
  assert.equal(cut.replaced, 'cut', 'the 游戏厅 lists it under 旧版, opening nothing');
  const places = allPlaces(content);
  // Fixed or in a place's daily pool (rules/rotation.mjs): the nine places 七巧 stood, and 藏经阁's pool.
  const hosts = (p) => [...(p.has?.games ?? []), ...(p.has?.games_pool?.from ?? [])];
  assert.equal(places.filter((p) => hosts(p).includes('pintu')).length, 9, 'the places 七巧 stood, 藏经阁, 柴房 and 饭堂 (the east wall\'s torn scroll, door god and stove god) — 外门 · 讲堂 · 药园 took 华容道 for it, 2026-10-28 (Hanli: 「拼图也少一点」)');
  for (const p of places) assert.ok(!(p.has?.games ?? []).includes('qiqiao'), p.id);
  for (const q of content.quests) for (const n of q.need ?? []) assert.notEqual(n.task, 'qiqiao', q.id);
  for (const id of ['xu-waimen-roof', 'xu-sun-charm', 'guan-fantang-zhengti']) {
    const q = content.quests.find((x) => x.id === id);
    assert.ok(q, id);
    assert.equal(q.need[0].task, 'pintu', id);
  }
  const pool = read('../worlds/jiuding/qiyu.json');
  const entries = JSON.stringify(pool);
  assert.match(entries, /"task":\s*"qiyu-pintu"/);
  assert.equal(content.tale.games.qiqiao.retired, true);
  assert.equal(content.tale.games.qiqiao.page, 'pintu', 'a tale made before the cut deals 拼图 at its 七巧 step');
  for (const id of ['pintu', 'qiyu-pintu', 'qiyu-qiqiao']) {
    const t = TASKS.find((x) => x.id === id);
    assert.equal(t.game, 'pintu');
    assert.deepEqual(t.climb.slice(0, 1), [0], `${id} starts at the first meeting`);
    for (const lv of t.climb) assert.ok(LEVELS[lv], `${id}: level ${lv}`);
    for (const p of t.deal?.pics ?? []) assert.ok(fs.existsSync(new URL(`../${p.src}`, import.meta.url)), p.src);
  }
  assert.deepEqual(TASKS.find((x) => x.id === 'pintu').grant, { table: 'game', progress: 5, wealth: 10 }, '七巧\'s pay, kept');
  assert.equal(content.games.games.find((g) => g.id === 'pintu' && !g.replaced).mechanic, '解谜', 'the same kind, so the same share of the layer');
});

test('an old save: a 七巧 offered is let go, a 七巧 done stays on the record', () => {
  const s = newState(content, 'zh', new Date('2026-10-27T12:00:00'));
  const fitted = fitWorld({ ...s, tasks: { ...(s.tasks ?? {}), qiqiao: { status: 'offered' }, 'qiyu-qiqiao': { status: 'offered' } } }, content);
  assert.equal(fitted.tasks.qiqiao, undefined);
  const kept = fitWorld({ ...s, tasks: { ...(s.tasks ?? {}), qiqiao: { status: 'done' } } }, content);
  assert.equal(kept.tasks.qiqiao.status, 'done');
});

test('an old 传闻 holding a 七巧 step deals 拼图 there', () => {
  const all = everyJuan(loadContent()), NOW = new Date('2026-09-11T12:00:00');
  const s0 = { ...newState(all, 'zh', NOW), name: '青玄', step: 1, traits: ['water', 'wood'], scene: null, ended: ['00-prologue'], place: 'sishui', cast: [] };
  const made = tale(s0, all, { now: NOW, quests: [] }, { action: 'make', tale: JSON.stringify(structuredClone(all.tale.example.zh)) }).state;
  const at = made.tale.chain[0].at;
  const old = { ...made, place: at, tale: { ...made.tale, chain: made.tale.chain.map((c, i) => (i === 0 ? { ...c, game: 'qiqiao' } : c)) } };
  const board = look(old, all, { now: NOW, quests: [] }).tale?.step?.board;
  assert.equal(board?.page, 'pintu', JSON.stringify(board));
});
