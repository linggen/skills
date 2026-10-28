import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meta, newGame, html, act, layouts, parseLayout, canMove, MIJING, pickLevel, levelFrom, ladderOf } from '../scripts/games/huarong.js';

const SIZE = { k: [2, 2], v: [1, 2], h: [2, 1], s: [1, 1] };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Optimal single-step solutions (one block, one cell = one move).
// 0 is the first meeting (the daily board's climb; Hanli 10-27: 「第一次玩华容道, 能不能简单一点」).
const OPTIMAL = { 0: [10, 10], 1: [12, 15, 19], 2: [29, 32, 40], 3: [63, 88, 115] };
const RANGE = { 0: [8, 12], 1: [8, 20], 2: [20, 40], 3: [41, 200] };

// Shape-only key: identical pieces are interchangeable.
function key(blocks) {
  const g = Array(20).fill('.');
  for (const b of blocks) {
    const [w, h] = SIZE[b.t];
    for (let y = b.y; y < b.y + h; y++) for (let x = b.x; x < b.x + w; x++) g[y * 4 + x] = b.t;
  }
  return g.join('');
}

function solve(start) {
  const prev = new Map([[key(start), null]]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      if (s.some((b) => b.t === 'k' && b.x === 1 && b.y === 3)) {
        const path = [];
        for (let k = key(s); prev.get(k); k = prev.get(k).from) path.unshift(prev.get(k).step);
        return path;
      }
      for (const b of s)
        for (const dir of Object.keys(DIRS)) {
          if (!canMove(s, b.id, dir)) continue;
          const n = s.map((o) => (o.id === b.id ? { ...o, x: o.x + DIRS[dir][0], y: o.y + DIRS[dir][1] } : o));
          const k = key(n);
          if (prev.has(k)) continue;
          prev.set(k, { from: key(s), step: { id: b.id, dir } });
          next.push(n);
        }
    }
    frontier = next;
  }
  return null;
}

function deepFreeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

test('meta shape', () => {
  assert.equal(meta.id, 'huarong');
  assert.equal(meta.name.zh, '华容道');
  assert.ok(meta.how.zh && meta.how.en);
});

test('deal is deterministic and JSON-serializable', () => {
  for (const lv of [0, 1, 2, 3]) {
    const a = newGame('seed-x', lv), b = newGame('seed-x', lv);
    assert.deepEqual(a, b);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
    assert.equal(a.level, lv);
    assert.equal(a.moves, 0);
    assert.equal(a.won, false);
  }
  const picks = new Set(Array.from({ length: 30 }, (_, i) => newGame(`s${i}`, 1).layout));
  assert.ok(picks.size > 1, 'different seeds reach different layouts');
  assert.equal(newGame('x', 9).level, 1, 'unknown level falls back to 1');
});

test('every layout is well-formed: one 2x2, two empty cells, 20 cells covered', () => {
  for (const list of Object.values(layouts))
    for (const grid of list) {
      assert.equal(grid.length, 20);
      assert.equal([...grid].filter((c) => c === '.').length, 2);
      const blocks = parseLayout(grid);
      assert.equal(blocks.filter((b) => b.t === 'k').length, 1);
      assert.equal(blocks.reduce((n, b) => n + SIZE[b.t][0] * SIZE[b.t][1], 0), 18);
      assert.equal(key(blocks).replace(/[khvs]/g, '#'), grid.replace(/[^.]/g, '#'));
    }
});

test('every layout is solvable by BFS within its level range', () => {
  for (const [lv, list] of Object.entries(layouts)) {
    list.forEach((grid, i) => {
      const path = solve(parseLayout(grid));
      assert.ok(path, `level ${lv} #${i} solvable`);
      assert.equal(path.length, OPTIMAL[lv][i], `level ${lv} #${i} optimal`);
      const [lo, hi] = RANGE[lv];
      assert.ok(path.length >= lo && path.length <= hi, `level ${lv} #${i} = ${path.length} in [${lo},${hi}]`);
    });
  }
});

test('replaying the BFS solution through act() wins', () => {
  for (const [lv, list] of Object.entries(layouts)) {
    list.forEach((grid, i) => {
      let state = { ...newGame('x', Number(lv)), layout: i, blocks: parseLayout(grid) };
      const path = solve(state.blocks);
      let won = false;
      path.forEach((step, n) => {
        assert.equal(won, false, 'not won before the last step');
        ({ state } = act(state, { g: 'block', b: String(step.id) }));
        if (state.sel !== step.id) ({ state } = act(state, { g: 'block', b: String(step.id) }));
        assert.equal(state.sel, step.id);
        ({ state, won } = act(state, { g: 'move', dir: step.dir }));
        assert.equal(state.moves, n + 1);
      });
      assert.equal(won, true, `level ${lv} #${i} won`);
      assert.equal(state.won, true);
      const after = act(state, { g: 'block', b: '1' });
      assert.equal(after.state, state, 'acts after winning are no-ops');
      assert.equal(after.won, false);
      // The board stands in many rooms (the 秘境's 岔口 is its way in, not out): the win line names no place.
      assert.match(html(state, 'zh'), new RegExp(`挤出来了 · ${state.moves} 步`));
      assert.doesNotMatch(html(state, 'zh'), /秘境/);
      assert.match(html(state, 'en'), new RegExp(`Squeezed out · ${state.moves} moves`));
    });
  }
});

test('cell tap slides the selected block into an adjacent empty cell', () => {
  // 'GDHIBDEEB.YYACYYACF.': empties at (1,2) and (3,4); D is the v-block at (1,0).
  const s0 = { ...newGame('x', 1), layout: 0, blocks: parseLayout(layouts[1][0]) };
  const e = s0.blocks.find((b) => b.t === 'v' && b.x === 1 && b.y === 0);
  const s1 = act(s0, { g: 'block', b: String(e.id) }).state;
  assert.equal(act(s1, { g: 'cell', x: '3', y: '4' }).state, s1, 'non-adjacent empty cell is ignored');
  const r = act(s1, { g: 'cell', x: '1', y: '2' });
  assert.equal(r.state.moves, 1);
  assert.deepEqual(r.state.blocks.find((b) => b.id === e.id), { ...e, y: 1 });
  // With nothing selected, a cell only one block can reach slides that block.
  const f = s0.blocks.find((b) => b.x === 2 && b.y === 4);
  const r2 = act(s0, { g: 'cell', x: '3', y: '4' });
  assert.deepEqual(r2.state.blocks.find((b) => b.id === f.id), { ...f, x: 3 });
});

test('illegal actions return the same state', () => {
  const s0 = newGame('illegal', 1);
  const cases = [
    { g: 'move', dir: 'up' }, // nothing selected
    { g: 'block', b: '99' },
    { g: 'cell', x: '9', y: '0' },
    { g: 'nope' },
    {},
  ];
  for (const d of cases) {
    const r = act(s0, d);
    assert.equal(r.state, s0, JSON.stringify(d));
    assert.equal(r.won, false);
  }
  // Select the 2x2 and push it off the top of the board.
  const you = s0.blocks.find((b) => b.t === 'k');
  const sel = act(s0, { g: 'block', b: String(you.id) }).state;
  const blocked = Object.keys(DIRS).filter((d) => !canMove(sel.blocks, you.id, d));
  assert.ok(blocked.length > 0);
  for (const dir of blocked) {
    const r = act(sel, { g: 'move', dir });
    assert.equal(r.state, sel);
    assert.equal(r.state.moves, 0);
  }
  // Tapping an occupied cell is ignored.
  const r = act(sel, { g: 'cell', x: String(you.x), y: String(you.y) });
  assert.equal(r.state, sel);
});

test('act never mutates its input', () => {
  const s0 = deepFreeze(newGame('frozen', 2));
  const snap = JSON.stringify(s0);
  const path = solve(s0.blocks);
  let state = s0;
  for (const step of path.slice(0, 5)) {
    state = deepFreeze(act(state, { g: 'block', b: String(step.id) }).state);
    if (state.sel !== step.id) state = deepFreeze(act(state, { g: 'block', b: String(step.id) }).state);
    state = deepFreeze(act(state, { g: 'move', dir: step.dir }).state);
  }
  assert.equal(JSON.stringify(s0), snap);
  assert.equal(state.moves, 5);
});

test('html renders data-g buttons, grid placement, and the gold 2x2', () => {
  const s = newGame('html', 1);
  const out = html(s, 'zh');
  assert.match(out, /<button[^>]*data-g="block"[^>]*data-b="0"/);
  assert.match(out, /<button[^>]*data-g="move"[^>]*data-dir="up"/);
  assert.match(out, /<button[^>]*data-g="cell"[^>]*data-x="\d" data-y="\d"/);
  assert.equal((out.match(/data-g="cell"/g) || []).length, 2);
  assert.equal((out.match(/data-g="block"/g) || []).length, s.blocks.length);
  assert.match(out, /g-huarong-k[^"]*"[^>]*grid-column:\d \/ span 2;grid-row:\d \/ span 2/);
  assert.match(out, /g-huarong-exit/);
  assert.match(out, /步数 0/);
  assert.match(html(s, 'en'), /Moves 0/);
  assert.doesNotMatch(out, /\son[a-z]+=/i, 'no inline listeners');
  const sel = act(s, { g: 'block', b: '0' }).state;
  assert.match(html(sel), /is-sel/);
});

test('keys: WASD and arrows name moves; with nothing picked a move slides 你', () => {
  for (const [k, dir] of [['w', 'up'], ['a', 'left'], ['s', 'down'], ['d', 'right'], ['ArrowUp', 'up'], ['ArrowLeft', 'left'], ['ArrowDown', 'down'], ['ArrowRight', 'right']])
    assert.deepEqual(meta.keys[k], { g: 'move', dir });
  // A board with room around 你 (every dealt layout starts it boxed in).
  const s = { ...newGame('keys', 1), sel: null, moves: 0, won: false, blocks: [{ id: 0, t: 'k', x: 1, y: 0 }] };
  const r = act(s, { g: 'move', dir: 'down' }).state;
  assert.deepEqual([r.blocks[0].x, r.blocks[0].y], [1, 1]);
  assert.equal(act(s, { g: 'move', dir: 'up' }).state.moves, 0, 'a blocked key does nothing');
  assert.equal(r.moves, 1);
});

// A second level from data: a crowd to slip through — other texts, labels, art; its own easy layouts.
const CROWD = {
  id: 'crowd',
  name: { zh: '挤出人群', en: 'Through the crowd' },
  how: { zh: { desk: '挪开人，钻到人群后头。', touch: '挪开人，钻到人群后头。' }, en: { desk: 'Shift people; slip to the back.', touch: 'Shift people; slip to the back.' } },
  layouts: { 1: ['ABCDEYYFGYYHIJKL.MN.', 'ABBCDYYEDYYEF..GHIJK'] },
  start: { zh: '人太多了，先让一让。', en: 'Too many people — make some room.' },
  win: { zh: '钻出人群 · {n} 步', en: 'Out of the crowd · {n} moves' },
  you: { zh: '阿禾', en: 'Alex' },
  labels: { s: [{ zh: '货郎', en: 'Peddler' }, { zh: '挑夫', en: 'Porter' }], v: { zh: '高个', en: 'Tall one' }, h: { zh: '轿子', en: 'Sedan' } },
  exit: { zh: '人群后头', en: 'The back of the crowd' },
  art: { k: 'k.webp', s: 'worlds/jiuding/art/games/xiaobao.webp', v: 'worlds/jiuding/art/games/crow.webp', h: '../../etc/passwd', floor: 'worlds/jiuding/art/games/moss.webp' },
};
const CROWD_OPTIMAL = { 1: [16, 13] };

test('a data level: well-formed easy layouts with asserted optimal counts', () => {
  for (const [lv, list] of Object.entries(CROWD.layouts))
    list.forEach((grid, i) => {
      assert.equal([...grid].filter((c) => c === '.').length, 2);
      const blocks = parseLayout(grid);
      assert.equal(blocks.filter((b) => b.t === 'k').length, 1);
      assert.equal(blocks.reduce((n, b) => n + SIZE[b.t][0] * SIZE[b.t][1], 0), 18);
      const path = solve(blocks);
      assert.equal(path?.length, CROWD_OPTIMAL[lv][i], `crowd ${lv} #${i} optimal`);
      const [lo, hi] = RANGE[lv];
      assert.ok(path.length >= lo && path.length <= hi);
    });
});

test('a data level plays through to a win with its own texts, labels and art', () => {
  const deal = { levels: [CROWD] };
  for (const seed of ['a', 'b', 'c', 'd']) {
    let state = newGame(seed, 2, deal); // no difficulty 2 on this level: its lowest
    assert.equal(state.level, 1);
    assert.deepEqual(state.blocks, parseLayout(CROWD.layouts[1][state.layout]));
    assert.equal(state.lv.id, 'crowd');
    assert.equal(state.lv.layouts, undefined, 'the state carries no layouts');
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
    const zh0 = html(state, 'zh'), en0 = html(state, 'en');
    assert.match(zh0, /人太多了，先让一让。/);
    assert.match(en0, /Too many people — make some room\./);
    assert.match(zh0, /aria-label="阿禾"/);
    assert.match(en0, /aria-label="Alex"/);
    assert.match(zh0, /aria-label="货郎"/);
    assert.match(zh0, /aria-label="挑夫"/);
    assert.match(zh0, /人群后头/);
    assert.match(en0, /The back of the crowd/);
    assert.match(zh0, /g-huarong-board" style="background-image:[^"]*worlds\/jiuding\/art\/games\/moss\.webp/);
    assert.match(zh0, /g-huarong-k[^"]*"[^>]*background-image:url\(&quot;[^&]*\/games\/huarong\/k\.webp&quot;\)/);
    assert.match(zh0, /g-huarong-s[^"]*"[^>]*worlds\/jiuding\/art\/games\/xiaobao\.webp/);
    assert.doesNotMatch(zh0, /passwd/, 'a path out of the art dirs is dropped');
    assert.doesNotMatch(zh0, /岩|藤|"石"|出口/);
    const path = solve(state.blocks);
    let won = false;
    for (const step of path) {
      ({ state } = act(state, { g: 'block', b: String(step.id) }));
      if (state.sel !== step.id) ({ state } = act(state, { g: 'block', b: String(step.id) }));
      ({ state, won } = act(state, { g: 'move', dir: step.dir }));
    }
    assert.equal(won, true);
    assert.equal(state.moves, CROWD_OPTIMAL[1][state.layout]);
    assert.match(html(state, 'zh'), new RegExp(`钻出人群 · ${state.moves} 步`));
    assert.match(html(state, 'en'), new RegExp(`Out of the crowd · ${state.moves} moves`));
    assert.doesNotMatch(html(state, 'zh'), /挤出来了|人太多了/);
  }
});

test('where a level comes from: data.levels, the registry by data.level, else mijing', () => {
  const registry = { games: [{ id: 'huarong', group: 'daily' }, { id: 'huarong', name: CROWD.name, levels: [CROWD] }, { id: 'qimai', levels: [{ id: 'crowd' }] }] };
  assert.deepEqual(ladderOf(registry).map((l) => l.id), ['crowd']);
  assert.equal(levelFrom({ level: 'crowd' }, registry).win, CROWD.win);
  assert.equal(levelFrom({ level: 'nowhere' }, registry), MIJING);
  assert.equal(levelFrom({}, registry), MIJING);
  assert.equal(levelFrom({ levels: [CROWD], level: 'nowhere' }), CROWD);
  assert.equal(pickLevel({ levels: [{ id: 'x' }, CROWD], level: 'crowd' }), CROWD);
  assert.equal(pickLevel({}), MIJING);
  // The built-in plays as ever: the same state whether dealt or not, and no level rides in it.
  assert.deepEqual(newGame('m', 2, { levels: [MIJING] }), newGame('m', 2));
  assert.equal(newGame('m', 2).lv, undefined);
  assert.equal(MIJING.layouts, layouts);
  assert.equal(meta.name, MIJING.name);
  // A level whose grids are all ill-formed plays mijing's layouts.
  const bad = newGame('m', 1, { levels: [{ id: 'bad', layouts: { 1: ['nope'] } }] });
  assert.deepEqual(bad.blocks, parseLayout(layouts[1][bad.layout]));
});

// The bot (games/bots/huarong.js) board-bots.mjs plays: the shortest way out of whatever board it is handed.
test('the bot wins every mijing layout and a data level in the optimal count', async () => {
  const { bot } = await import('../scripts/games/bots/huarong.js');
  const { playOnce } = await import('../tools/board-bots.mjs');
  const drive = (state) => {
    for (let n = 0; n < 1000 && !state.won; n++) {
      const a = bot(state);
      assert.ok(a, 'the bot always has a next press');
      state = act(state, a).state;
    }
    return state;
  };
  for (const [lv, list] of Object.entries(layouts))
    list.forEach((grid, i) => {
      const end = drive({ ...newGame('bot', Number(lv)), layout: i, blocks: parseLayout(grid) });
      assert.equal(end.won, true, `mijing ${lv} #${i}`);
      assert.equal(end.moves, OPTIMAL[lv][i], `mijing ${lv} #${i} in its optimal count`);
    });
  CROWD.layouts[1].forEach((grid, i) => {
    const s = newGame('bot', 1, { levels: [CROWD] });
    const end = drive({ ...s, layout: i, blocks: parseLayout(grid) });
    assert.equal(end.won, true);
    assert.equal(end.moves, CROWD_OPTIMAL[1][i]);
  });
  // …and through the human-like harness, the level dealt from data.
  const mod = await import('../scripts/games/huarong.js');
  const r = playOnce(mod, bot, { seed: 'bot-crowd', deal: { levels: [CROWD] } });
  assert.equal(r.won, true);
});

test('keyboard-only: Q/E cycle the picked block in reading order, Esc puts it back (a `pass` key: nothing picked, it changes nothing)', async () => {
  const m = await import('../scripts/games/huarong.js');
  const s0 = m.newGame('kb', 1);
  const order = [...s0.blocks].sort((a, b) => a.y - b.y || a.x - b.x).map((b) => b.id);
  const e = m.act(s0, m.meta.keys.e).state;
  assert.equal(e.sel, order[0]);
  assert.equal(m.act(e, m.meta.keys.e).state.sel, order[1]);
  assert.equal(m.act(s0, m.meta.keys.q).state.sel, order[order.length - 1]);
  assert.equal(m.act(e, m.meta.keys.q).state.sel, order[order.length - 1]);
  assert.equal(m.act(e, m.meta.keys.Escape).state.sel, null);
  assert.equal(m.meta.keys.Escape.pass, true);
  assert.equal(m.act(s0, m.meta.keys.Escape).state, s0);
  assert.match(m.html(e, 'zh'), /is-sel/);
  assert.match(m.html(s0, 'zh'), /Q\/E/);
});

// The story's four levels (worlds/jiuding/games.json; 井台 at wm-dianmao since 2026-10-27): every one a first encounter, none over 20 moves.
test('the story levels in games.json: each layout solvable, none over 20 moves', async () => {
  const { readFileSync } = await import('node:fs');
  const reg = JSON.parse(readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url)));
  const STORY = { crowd: [16, 13], jingtai: [14, 17, 17], kouzi: [12, 15, 19], wali: [12, 15, 19] };
  const seen = ladderOf(reg);
  assert.deepEqual(seen.map((l) => l.id).sort(), Object.keys(STORY).sort());
  for (const l of seen) assert.deepEqual(l.layouts[1].map((g) => solve(parseLayout(g))?.length), STORY[l.id], l.id);
});

test('a climbing deal: `deal.lv` is the difficulty (0 the first time), over the realm\'s level', () => {
  const s = newGame('climb', 1, { lv: 0 });
  assert.equal(s.level, 0);
  assert.ok(layouts[0].includes(s.grid));
  assert.equal(solve(s.blocks).length, 10);
  assert.equal(newGame('climb', 1, { lv: 2 }).level, 2);
  assert.equal(newGame('climb', 2, {}).level, 2, 'no lv: the level as ever');
  // A data level with no tier 0 plays its own (the story's levels never climb).
  assert.equal(newGame('climb', 1, { lv: 0, levels: [CROWD] }).level, 1);
});

test('the daily board and the 秘境\'s two climb from the first meeting (worlds/jiuding/tasks/world.json)', async () => {
  const { readFileSync } = await import('node:fs');
  const tasks = JSON.parse(readFileSync(new URL('../worlds/jiuding/tasks/world.json', import.meta.url))).tasks;
  for (const id of ['huarong', 'mijing-huarong', 'qiyu-huarong']) {
    const t = tasks.find((x) => x.id === id);
    assert.equal(t.climb[0], 0, `${id} starts at the first meeting`);
    for (const lv of t.climb) assert.ok(layouts[lv], `${id}: level ${lv} has layouts`);
  }
  for (const t of tasks.filter((x) => x.game === 'huarong' && x.deal?.level)) assert.equal(t.climb, undefined, `${t.id}: a story level never climbs`);
});

test('重来: the same deal at 0 moves; nothing to undo, it stands', () => {
  const s0 = newGame('again', 1);
  assert.equal(meta.restart(s0), false, 'a fresh deal has nothing to undo');
  assert.equal(act(s0, { g: 'restart' }).state, s0);
  const path = solve(s0.blocks);
  let s = s0;
  for (const step of path.slice(0, 3)) {
    s = act(s, { g: 'block', b: String(step.id) }).state;
    if (s.sel !== step.id) s = act(s, { g: 'block', b: String(step.id) }).state;
    s = act(s, { g: 'move', dir: step.dir }).state;
  }
  assert.equal(s.moves, 3);
  assert.equal(meta.restart(s), true);
  const r = act(s, { g: 'restart' }).state;
  assert.deepEqual(r.blocks, s0.blocks);
  assert.equal(r.moves, 0);
  assert.equal(r.sel, null);
  assert.equal(r.grid, s0.grid);
  assert.match(html(r, 'zh'), /步数 0/);
  // A data level's own layout comes back too.
  const c0 = newGame('again', 1, { levels: [CROWD] }), first = solve(c0.blocks)[0];
  const cs = act(act(c0, { g: 'block', b: String(first.id) }).state, { g: 'move', dir: first.dir }).state;
  assert.equal(cs.moves, 1);
  assert.deepEqual(act(cs, { g: 'restart' }).state.blocks, c0.blocks);
});

test('问询 is the board\'s own: the goal and the rule first, then a lit next move that wins if followed', () => {
  assert.equal(meta.ask(newGame('ask', 1)), 'hint');
  let s = newGame('ask', 0, { lv: 0 });
  s = act(s, { g: 'hint' }).state;
  assert.equal(s.help, 1);
  assert.equal(s.hint, null);
  const zh = html(s, 'zh');
  assert.match(zh, /g-huarong-help/);
  assert.match(zh, /小满从下方缺口出去就成；每块只能滑进空格。/);
  assert.match(zh, /再点 \? 亮出下一步。/);
  assert.match(html(s, 'en'), /Get Xiaoman out through the gap at the bottom/);
  // Each 问询 after lights a move; following the lit moves wins in the optimal count.
  const need = solve(s.blocks).length;
  for (let n = 0; n < 40 && !s.won; n++) {
    s = act(s, { g: 'hint' }).state;
    assert.ok(s.hint, 'a move is lit');
    assert.equal(s.sel, s.hint.id, 'its block is picked');
    const lit = html(s, 'zh');
    assert.match(lit, new RegExp(`is-hint" data-g="block" data-b="${s.hint.id}"`));
    assert.match(lit, new RegExp(`g-huarong-${s.hint.dir} is-hint"`));
    s = act(s, { g: 'move', dir: s.hint.dir }).state;
    assert.equal(s.hint, null, 'a move spends the hint');
  }
  assert.equal(s.won, true);
  assert.equal(s.moves, need);
  assert.equal(meta.ask(s), null, 'won: nothing to ask');
});

test('the how-line says the goal and the one rule first, in two short sentences', () => {
  for (const lang of ['zh', 'en'])
    for (const k of ['desk', 'touch']) {
      const how = meta.how[lang][k];
      assert.ok(how.length <= (lang === 'zh' ? 40 : 120), `${lang} ${k}: ${how.length}`);
      assert.match(how, lang === 'zh' ? /^把小满.*出口。每块只能滑进空格/ : /^Get Xiaoman .*exit\. A block slides only into empty squares/);
    }
});
