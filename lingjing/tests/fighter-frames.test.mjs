// 格斗's frames (Hanli 11-05: 「格斗可以卡bug, 我刚刚打出84连了」, then 「连击数量设置上限是不对的…能提高一下战斗对手的策略吗?
// 而不是限制连击数量」): no cap on a chain — the blows themselves keep it short. A light's hitstun ends before the next
// light lands, a light cuts short only into a heavy or a special, a cornered foe's pushback goes to him, and her mind
// reads blows taken unanswered and one button pressed and pressed. Measured here, never capped. And in a bout to stand
// through, her 血 emptied anyway ends it early as won, paid as standing through it, never an empty bar that does nothing
// — every bout to stand through (Hanli 11-05: 「格斗把对方血打空了都应该胜利」).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../scripts/games/fighter.js';
import { sheathe } from '../scripts/games/fighter.js';
import { ME, FOE, BUF_MS, STEP_MS, HITSTOP, CANCEL_LIGHT } from '../scripts/games/fighter/core.js';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const LEVELS = content.games.games.filter((g) => g.mechanic === '格斗' && !g.replaced).flatMap((g) => g.levels ?? []);
const level = (id) => LEVELS.find((l) => l.id === id);
const run = (s, ms) => { for (let t = 0; t < ms; t += 10) s = F.tick(s, 10); return s; };
const press = (s, d) => F.act(s, d).state;

/* The bout under way, then him close on her, in the corner (her back to the stage's right end, where no blow pushes her
   clear: where the 84 ran). `asleep`: her mind off, so only the frames answer. */
function close(id, seed = 'cap', [mx, fx] = [820, 900], asleep = true) {
  let s = F.newGame(seed, 1, { levels: [level(id)] });
  s = run(s, 1600);
  s.me.x = mx; s.foe.x = fx;
  if (asleep) { s.foe.think = 1e9; s.foe.cd.ice = 1e9; s.R = { ...s.R, foe: { ...s.R.foe, ai: { ...s.R.foe.ai, backGuard: 0, react: 1e9 } } }; } // never on guard, never roused by one
  return s;
}
/* Mash one press every `gap` ms for `ms`; answers his longest chain and the longest run of blows landed on her with no
   answer between (no guard of hers, no blow on him, none a beat apart). */
function mash(s, d, gap, ms, walk = false) {
  let runN = 0, best = 0, lastHit = -1e9, prev = { bal: s.foe.bal, hp: s.me.hp, block: s.snd.block ?? 0 };
  for (let t = 0; t < ms && !s.won && !s.lost; t += 10) {
    if (walk && t % 50 === 0 && !s.end) { const sd = Math.sign(s.foe.x - s.me.x) || 1, want = Math.abs(s.foe.x - s.me.x) > 140 ? sd : 0; if (want !== s.in.dir) s = press(s, { g: 'walk', dir: want }); }
    if (t % gap === 0 && !s.end) s = press(s, d);
    s = F.tick(s, 10);
    const blocked = (s.snd.block ?? 0) > prev.block, hurt = s.me.hp < prev.hp, hit = s.foe.bal < prev.bal && !blocked;
    if (blocked || hurt || s.t - lastHit > 800) runN = 0;
    if (hit) { runN += 1; lastHit = s.t; best = Math.max(best, runN); }
    prev = { bal: s.foe.bal, hp: s.me.hp, block: s.snd.block ?? 0 };
  }
  return { s, inRow: best, chain: s.best ?? 0 };
}

test('the frame table: every blow has startup, active, recovery, hitstun and guard-stun; a light into a light is never a chain', () => {
  for (const k of ['light', 'lkick', 'hpunch', 'heavy', 'blow', 'air', 'rise', 'clight', 'clkick', 'chpunch', 'cheavy']) {
    for (const f of ['startup', 'active', 'recover', 'stun', 'bstun', 'reach', 'dmg', 'push']) assert.ok(Number.isFinite(ME[k][f]), `his ${k}: ${f}`);
  }
  for (const k of ['poke', 'thrust', 'sweep', 'aa', 'throw']) for (const f of ['startup', 'active', 'recover', 'reach', 'dmg', 'push']) assert.ok(Number.isFinite(FOE.moves[k][f]), `her ${k}: ${f}`);
  for (const k of ['light', 'lkick', 'clight', 'clkick']) {
    const m = ME[k];
    assert.ok(!m.cancel, `${k}: no free cancel`);
    assert.ok(m.stun < m.recover + m.startup, `${k}: her stagger ends before the next ${k} lands, wherever in its active frames this one did (${m.stun})`);
    assert.ok(m.cancelTo.every((x) => !['light', 'lkick', 'clight', 'clkick'].includes(x)), `${k} cuts short only into a heavy or a special`);
    assert.ok(m.blocked > 0, `${k} stood off leaves him open a moment`);
  }
  assert.deepEqual(CANCEL_LIGHT.filter((x) => ME[x] == null), [], 'every cancel names a move');
  assert.ok(BUF_MS >= 100 && BUF_MS <= 140, `the buffer: about eight frames (${BUF_MS})`);
  assert.ok(HITSTOP.light < HITSTOP.heavy && HITSTOP.heavy < HITSTOP.big, 'a light taps, a heavy thuds');
});

test('the 84 loop is gone, measured: 30 s of light into her in the corner, her mind awake — at most 4 or 5 in a row', () => {
  for (const id of ['qinyan', 'futian', 'liuyun', 'heqi', 'lun2-qinyan', 'qiecuo-qinyan']) {
    for (const [d, gap] of [[{ g: 'light' }, 70], [{ g: 'lkick' }, 90], [{ g: 'light', crouch: true }, 70]]) {
      for (const seed of ['a', 'b']) {
        const r = mash(close(id, `jab-${seed}`, undefined, false), d, gap, 30000);
        assert.ok(r.inRow <= 5, `${id} ${JSON.stringify(d)}: ${r.inRow} in a row`);
        assert.ok(r.chain <= 5, `${id} ${JSON.stringify(d)}: a chain of ${r.chain}`);
      }
    }
  }
});

test('her mind asleep, only the frames: light into light in the corner chains no more than one; no input sequence chains past five', () => {
  for (const [pat, gap] of [[['light'], 70], [['lkick'], 90], [['light', 'lkick'], 80]]) {
    let s = close('qinyan');
    for (let i = 0; i < 200 && !s.end; i += 1) { s = press(s, { g: pat[i % pat.length] }); s = run(s, gap); }
    assert.ok(s.best <= 1, `${pat}: ${s.best}`);
  }
  const MOVES = [
    { g: 'light' }, { g: 'lkick' }, { g: 'heavy' }, { g: 'hpunch' }, { g: 'light', crouch: true }, { g: 'lkick', crouch: true },
    { g: 'heavy', crouch: true }, { g: 'walk', dir: 1 }, { g: 'walk', dir: -1 }, { g: 'walk', dir: 0 }, { g: 'jump' }, { g: 'skill' },
  ];
  let rnd = 7;
  const r = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  let best = 0;
  for (let trial = 0; trial < 60; trial += 1) {
    let s = close('qinyan', `rand-${trial}`, trial % 2 ? [820, 900] : [400, 520]);
    for (let i = 0; i < 160 && !s.end; i += 1) { s = press(s, MOVES[Math.floor(r() * MOVES.length)]); s = run(s, 20 + Math.floor(r() * 120)); }
    best = Math.max(best, s.best ?? 0);
  }
  assert.ok(best <= 5, `the longest chain found: ${best}`);
});

test('a light at her back to the boards\' end pushes him off instead: a string of them drifts out of reach', () => {
  let s = close('qinyan');
  const d0 = Math.abs(s.foe.x - s.me.x);
  for (let i = 0; i < 6; i += 1) { s = press(s, { g: 'light' }); s = run(s, 320); }
  assert.ok(Math.abs(s.foe.x - s.me.x) > d0 + 40, `apart: ${d0} → ${Math.round(Math.abs(s.foe.x - s.me.x))}`);
  assert.ok(s.foe.x >= s.R.stage.right - 14, 'she stays at the boards\' end');
});

test('one button pressed and pressed rarely wins a bout to win: every level, a standing and a walking hand, four buttons', () => {
  // A bout to stand through (`outlast`) is won by standing: a hand that stands its moves out, pressing, has done what it
  // asks (马小宝's six beams at 结境 are ducked by a crouching 拳 as well) — those are left out, by design.
  const BTN = [{ g: 'light' }, { g: 'lkick' }, { g: 'heavy' }, { g: 'light', crouch: true }];
  let n = 0, won = 0;
  const wins = [];
  for (const lv of LEVELS.filter((l) => !l.outlast?.moves)) {
    for (const b of BTN) for (const walk of [false, true]) for (const seed of ['m0', 'm1']) {
      const r = mash(F.newGame(seed, 1, { levels: [lv] }), b, 80, 60000, walk);
      n += 1;
      if (r.s.won) { won += 1; wins.push(`${lv.id} ${JSON.stringify(b)}${walk ? ' walking' : ''}`); }
    }
  }
  assert.ok(n >= 100, `bouts tried: ${n}`);
  assert.ok(won / n <= 0.04, `${won}/${n} won by mashing: ${wins.join('; ')}`);
});

test('hit-stop never drifts the bout: the same hands in 10, 16 and 33 ms ticks, and saved and resumed mid-freeze, end alike', () => {
  // the hands: walk in, then a blow (light, 重拳, 重腿, a crouching light), again and again
  const plan = [];
  const BLOWS = [{ g: 'light' }, { g: 'hpunch' }, { g: 'heavy' }, { g: 'light', crouch: true }];
  for (let t = 1800, i = 0; t < 20000; t += 520, i += 1) plan.push([t, { g: 'walk', dir: 1 }], [t + 260, { g: 'walk', dir: 0 }], [t + 270, BLOWS[i % BLOWS.length]]);
  const END = 22000;
  const play = (chunk, resumeAfter = null) => {
    let s = F.newGame('drift', 1, { levels: [level('qinyan')] }), i = 0, clock = 0, froze = 0;
    while (clock < END) {
      const next = Math.min(clock + chunk, END);
      while (i < plan.length && plan[i][0] < next) { // a press lands on its own ms, whatever the slices
        const at = plan[i][0];
        if (at > clock) { s = F.tick(s, at - clock); clock = at; }
        s = F.act(s, plan[i][1]).state; i += 1;
      }
      s = F.tick(s, next - clock); clock = next;
      if (resumeAfter != null && !froze && clock >= resumeAfter && s.freeze > 0) { s = JSON.parse(JSON.stringify(s)); froze = clock; }
    }
    return { s, froze };
  };
  const strip = (s) => JSON.stringify({ me: s.me, foe: s.foe, t: s.t, best: s.best, end: s.end, n: s.n, snd: s.snd, freeze: s.freeze });
  const a = play(STEP_MS).s;
  assert.ok(['hit', 'heavy', 'hurt', 'block'].reduce((n, k) => n + (a.snd[k] ?? 0), 0) >= 5, `blows landed, so hit-stop ran: ${JSON.stringify(a.snd)}`);
  for (const chunk of [16, 33]) assert.equal(strip(play(chunk).s), strip(a), `${chunk} ms slices`);
  const b = play(STEP_MS, 4000);
  assert.ok(b.froze > 0, 'saved mid-freeze');
  assert.equal(strip(b.s), strip(a), 'saved and resumed mid-freeze');
});

test('撑过她的剑: her 血 emptied before her 二十四招 ends the bout early — won, her sword sheathed with the level\'s line', () => {
  const lv = level('futian');
  assert.ok(lv?.outlast?.moves, 'the survival bout');
  assert.ok(lv.lines?.sheathe?.zh, 'its sheathe line');
  let s = close('futian', 'sheathe');
  s.foe.bal = 1;
  for (let i = 0; i < 40 && !s.end; i += 1) { s = press(s, { g: 'light' }); s = run(s, 120); }
  assert.ok(s.end, 'the bout ended');
  assert.equal(s.end.kind, 'outlast');
  assert.ok(s.end.early && s.end.won);
  s = run(s, 2500);
  assert.equal(s.won, true, 'won, as standing through it');
  assert.ok(s.stars >= 1);
});

test('every bout to stand through ends won on an empty bar, paid as standing through it, in her words or general ones', () => {
  const OUT = LEVELS.filter((l) => l.outlast?.moves);
  assert.ok(OUT.length >= 5, `the bouts to stand through (${OUT.length})`);
  for (const lv of OUT) {
    let s = F.newGame(`out-${lv.id}`, 1, { levels: [lv] });
    s = run(s, 1600);
    const moves = s.foe.moves;
    s.foe.bal = 0; s.foe.think = 1e9;
    s = run(s, 200);
    assert.equal(s.end?.kind, 'outlast', `${lv.id}: down at once`);
    assert.ok(s.end.won && s.end.early, `${lv.id}: won early`);
    assert.ok(moves < lv.outlast.moves, `${lv.id}: before her last move (${moves})`);
    s = run(s, 4000);
    assert.equal(s.won, true, `${lv.id}: won`);
    const left = s.me.hp / s.R.me.hp;
    assert.equal(s.stars, left >= 0.6 ? 3 : left >= 0.3 ? 2 : 1, `${lv.id}: paid as standing through it`);
    const w = sheathe(lv);
    assert.ok(w.zh && w.en, `${lv.id}: her words`);
    if (!lv.lines?.sheathe) assert.match(w.zh, new RegExp(`^${lv.foe.name.zh}收势`), `${lv.id}: the general line names her`);
  }
});
