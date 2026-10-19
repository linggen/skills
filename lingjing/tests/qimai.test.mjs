// 气走经脉 (games/qimai.js, Hanli 10-19): the breath kit — hold to rise, let go to sink, a 气 bead
// along a meridian channel. Its levels are games.json's `qimai` rows; each is proved here by its bot
// at a 10 ms and a 50 ms clock, by a human-like hand (tools/board-bots.mjs's 200 ms reaction), and
// never by doing nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as qm from '../scripts/games/qimai.js';
import { bot, simulate, HANDS } from '../scripts/games/bots/qimai.js';
import { playModule } from '../tools/board-bots.mjs';

const reg = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
const rows = reg.games.filter((g) => g.id === 'qimai');
const ladder = qm.ladderOf(reg);
const BREATH = ['feather', 'xisui', 'zhoutian', 'mirrortongpu', 'qianmi', 'faqiu', 'dark', 'lastshot'];

/** Played to the end by `policy(state)` (true = hold), on a `step` ms clock. */
function play(level, policy, { step = 10, limit = 120000, seed = 't' } = {}) {
  let s = qm.newGame(seed, 1, { levels: [level] }), t = 0;
  while (t < limit && !s.won) {
    const want = policy(s, t);
    if (want != null && want !== s.holding && (s.phase === 'play' || (s.phase === 'ready' && want))) s = qm.act(s, { g: want ? 'hold' : 'release' }).state;
    s = qm.tick(s, step);
    t += step;
  }
  return s;
}
const perfect = (s) => { const a = bot(s, { lead: 0 }); return a?.hold ? true : a?.release ? false : null; };

test('the rows: one level each, 调息, placed beside the breath games, every level in the ladder once', () => {
  assert.ok(rows.length >= 10, `${rows.length} rows`);
  const ids = new Set();
  for (const r of rows) {
    assert.equal(r.mechanic, '调息');
    assert.equal(r.levels?.length, 1, `${r.data?.level}: one level a row`);
    assert.equal(r.data?.level, r.levels[0].id);
    assert.ok(r.name?.zh && r.name?.en, `${r.data.level}: a tile name`);
    assert.ok(!r.task, 'not a story board yet — story wiring waits for Hanli\'s play');
    assert.ok(!ids.has(r.data.level)); ids.add(r.data.level);
    const L = r.levels[0];
    assert.ok(L.len >= 1500 && L.path?.length >= 2 && L.say?.zh && L.book?.zh && L.say?.en && L.book?.en, L.id);
    const secs = L.len / (L.speed ?? 90);
    assert.ok(secs >= 18 && secs <= 45, `${L.id}: ${secs.toFixed(0)} s a run`);
  }
  // each story level sits right after its old breath game (or after the kit rows already there)
  for (const old of BREATH) {
    const i = reg.games.findIndex((g) => g.id === old && g.task);
    let k = i + 1;
    while (reg.games[k]?.id === 'qimai' && reg.games[k].group === reg.games[i].group) k++;
    assert.ok(k > i + 1, `${old}: a 气走经脉 level follows it`);
  }
  assert.ok(reg.groups.some((g) => g.id === 'qimai'), 'the arcade-only levels have their group');
  assert.equal(ladder.length, rows.length);
});

test('every element a level declares is taught in it, once, with a ring and a line', () => {
  for (const L of ladder) {
    const s = qm.newGame('t', 1, { levels: [L] });
    const kinds = s.lessons.map((l) => l.kind);
    for (const [k, list] of [['gate', L.gates], ['current', L.currents], ['wave', L.waves], ['heart', L.heart], ['gold', L.gold], ['dark', L.dark]]) {
      if (list?.length) assert.ok(kinds.includes(k), `${L.id}: ${k} taught`);
    }
    assert.equal(new Set(kinds).size, kinds.length);
    for (const k of kinds) assert.ok(qm.ELEMENTS[k].teach.zh && qm.ELEMENTS[k].teach.en);
    const end = play(L, perfect);
    assert.deepEqual([...end.taught].sort(), [...kinds].sort(), `${L.id}: each lesson shown on the way`);
  }
});

for (const L of ladder) {
  test(`${L.id}: the bot clears it at a 10 ms and a 50 ms clock alike`, () => {
    for (const step of [10, 50]) {
      const s = play(L, perfect, { step });
      assert.ok(s.won, `${L.id} at ${step} ms: x ${Math.round(s.x)} of ${L.len}, ${s.chas} 岔气`);
      assert.equal(s.chas, 0, `${L.id} at ${step} ms: no 岔气`);
      assert.ok(s.stars >= 2, `${L.id} at ${step} ms: ★${s.stars}`);
    }
  });
}

test('a human-like hand (200 ms reaction, tools/board-bots.mjs) clears every level within five tries (the late ones take it a few)', () => {
  const mod = { newGame: qm.newGame, act: qm.act, tick: qm.tick };
  for (const L of ladder) {
    const r = playModule(mod, bot, { tries: 5, deal: { levels: [L] }, limit: 150000 });
    assert.ok(r.won, `${L.id}: ${JSON.stringify(r.runs.map((x) => x.ms))}`);
  }
});

test('idle never wins: the bead sinks, three walls, 岔气, again — at 10 ms and 50 ms', () => {
  for (const L of ladder) for (const step of [10, 50]) {
    const s = play(L, () => null, { step, limit: 60000 });
    assert.equal(s.won, false, L.id);
    assert.ok(s.chas >= 5, `${L.id}: ${s.chas} 岔气`);
    assert.ok(s.x < L.len * 0.5, `${L.id}: got to ${Math.round(s.x)}`);
  }
});

test('the world steps at a fixed 1/60 s: the same breaths at a 10 ms and a 50 ms clock land the bead in the same place', () => {
  const L = ladder[0];
  const breaths = (s, t) => Math.floor(t / 600) % 2 === 0; // in 0.6 s, out 0.6 s
  const a = play(L, breaths, { step: 10, limit: 6000 }), b = play(L, breaths, { step: 50, limit: 6000 });
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, `${a.x},${a.y} vs ${b.x},${b.y}`);
});

test('a wall costs one 气; the third is 岔气 — back to the last 关 passed, 气 full, the touches remembered', () => {
  const L = ladder.find((l) => l.gates?.length);
  const s = play(L, perfect, { limit: 1 });
  // carry the bead past the first 关 by hand, then let it fall
  let st = qm.newGame('w', 1, { levels: [L] });
  const gate = [...L.gates].sort((a, b) => a.x - b.x)[0];
  let t = 0;
  while (st.x < gate.x + qm.GATE_HALF + 20 && t < 120000) { const w = perfect(st); if (w != null && w !== st.holding && (st.phase === 'play' || w)) st = qm.act(st, { g: w ? 'hold' : 'release' }).state; st = qm.tick(st, 10); t += 10; }
  assert.ok(st.cps[st.cp].gate, 'the 关 is the checkpoint now');
  const cpX = st.cps[st.cp].x;
  if (st.holding) st = qm.act(st, { g: 'release' }).state;
  const seen = [];
  for (let k = 0; k < 600 && st.phase !== 'cha'; k++) { st = qm.tick(st, 10); if (!seen.includes(st.qi)) seen.push(st.qi); }
  assert.equal(st.phase, 'cha');
  assert.deepEqual(seen, [3, 2, 1, 0]);
  assert.equal(qm.act(st, { g: 'hold' }).refused, true, 'a press while the breath is broken is refused (the page rings it)');
  for (let k = 0; k < 100 && st.phase === 'cha'; k++) st = qm.tick(st, 10);
  assert.equal(st.phase, 'ready');
  assert.equal(st.x, cpX);
  assert.equal(st.qi, qm.QI);
  assert.equal(st.touches, 3);
  assert.equal(qm.cpName(st), gate.name.zh);
  assert.ok(s);
});

test('stars: through · no wall · the gold thread kept; a clean, even run is ★3; 从头 resets and is refused at the start', () => {
  const L = ladder[0];
  const s = play(L, perfect);
  assert.equal(s.won, true);
  assert.equal(s.touches, 0);
  assert.ok(qm.goldKept(s), `gold ${qm.goldShare(s)}`);
  assert.equal(s.stars, 3);
  assert.equal(s.grade, 'even');
  const fresh = qm.newGame('r', 1, { levels: [L] });
  assert.equal(qm.act(fresh, { g: 'restart' }).refused, true);
  let m = qm.act(fresh, { g: 'hold' }).state;
  m = qm.tick(m, 2000);
  assert.ok(m.x > 0);
  m = qm.act(m, { g: 'restart' }).state;
  assert.equal(m.x, 0);
  assert.equal(m.phase, 'ready');
});

test('the climb: a casual hand clears the first level, mostly at ★1–2; a practised one clears them all; the late ones cost a casual hand more', () => {
  const runs = (L, hand, n) => Array.from({ length: n }, (_, i) => simulate(L, HANDS[hand], { seed: `c${i}`, limit: 90000 }));
  const first = runs(ladder[0], 'casual', 12);
  assert.ok(first.filter((r) => r.won).length >= 10, 'casual wins 吹鹅毛');
  assert.ok(first.filter((r) => r.stars === 1 || r.stars === 2).length >= 6, `mostly ★1–2: ${first.map((r) => r.stars)}`);
  for (const L of ladder) assert.ok(runs(L, 'practised', 4).every((r) => r.won), `${L.id}: practised`);
  const cost = (L) => runs(L, 'casual', 8).reduce((a, r) => a + r.chas + (r.won ? 0 : 5), 0);
  const early = cost(ladder[0]) + cost(ladder[1]), late = ladder.slice(-4).reduce((a, L) => a + cost(L), 0) / 2;
  assert.ok(late > early + 4, `late ${late} vs early ${early}`);
});

test('the page: mount() on the contract, its own css, Space and a pointer both breathe', () => {
  const src = fs.readFileSync(new URL('../scripts/games/qimai.js', import.meta.url), 'utf8');
  assert.equal(typeof qm.mount, 'function');
  assert.match(src, /e\.code !== 'Space'/);
  assert.match(src, /'pointerdown'/);
  assert.match(src, /g-tapink is-no/, 'a refused press rings the shared refusal');
  assert.ok(fs.existsSync(new URL('../scripts/games/qimai.css', import.meta.url)));
  const html = qm.html(qm.newGame('h', 1, { levels: [ladder[4]] }), 'zh', 'qmx');
  assert.match(html, /data-g-hold/);
  assert.match(html, /class="g-qm-wall" data-side="top"/);
  assert.match(html, /data-g="restart"/);
  assert.doesNotMatch(html, /data-g="again"/, 'the idle hand of play-human taps "again"');
});
