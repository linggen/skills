// 格斗 v7: KOF '97 brought in (2026-11-01, Hanli on the Mac: 「好多了. 都改一下吧, 尽量接近拳皇97」). The run, the lows
// and the sweep, high and low guards both ways, her jump-in, throws and their break, the guard's meter and its crush,
// the guard cancel, the counter, 爆气 (MAX), 绝境, her knockdown and wake-up, the bout's call — and her mind using all
// of it (not only walking in), and the two tight cliff bouts (撑过她的剑, 后山崖顶) made fair for a slower hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../scripts/games/fighter.js';
import { ME, QI, INTRO_MS, WAKE_MS, withIntro, superReady } from '../scripts/games/fighter/core.js';
import { bot } from '../scripts/games/bots/fighter.js';
import { playOnce } from '../tools/board-bots.mjs';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const LEVELS = content.games.games.filter((g) => g.mechanic === '格斗' && !g.replaced).flatMap((g) => g.levels ?? []);
const level = (id) => LEVELS.find((l) => l.id === id);

/* He at 400, she `d` off, her mind asleep. */
function apart(d, id = 'qinyan', seed = 'kof') {
  const s = F.newGame(seed, 1, { levels: [level(id)] });
  s.me.x = 400; s.foe.x = 400 + d; s.foe.think = 1e9; s.foe.cd.ice = 1e9;
  return s;
}
const run = (s, ms) => { for (let t = 0; t < ms; t += 10) s = F.tick(s, 10); return s; };
const press = (s, d) => F.act(s, d).state;
const guardOf = (s, low) => { s.foe.act = { k: 'block', at: s.t, m: { startup: 0, active: 0, recover: 3000 }, hit: false, low }; return s; };

test('the run: a double tap toward her runs while it is held, faster than a walk, and stops when let go', () => {
  let s = apart(600);
  s = press(s, { g: 'walk', dir: 1 }); s = run(s, 30); s = press(s, { g: 'walk', dir: 0 }); s = run(s, 30); s = press(s, { g: 'walk', dir: 1 });
  const x0 = s.me.x;
  s = run(s, 300);
  assert.ok(s.me.running, 'running');
  assert.ok(s.me.x - x0 > ME.speed * 0.3 * 1.6, `ran ${Math.round(s.me.x - x0)}`);
  s = press(s, { g: 'walk', dir: 0 });
  s = run(s, 80);
  assert.equal(s.me.running, false, 'let go: stopped');
  const x1 = s.me.x; s = run(s, 200);
  assert.ok(Math.abs(s.me.x - x1) < 4, 'standing');
  // a blow out of the run: it slides in (a 上步's step too)
  let r = apart(600); r = press(r, { g: 'run' }); r = run(r, 200); r = run(press(r, { g: 'light' }), 10);
  assert.ok(r.me.vx > 0 && r.me.act?.k === 'light');
});

test('lows: a blow with ↓ held is low — her standing guard does not stop it, her low guard does; the 扫堂腿 knocks her down', () => {
  let s = guardOf(apart(130), false);
  s = press(s, { g: 'lkick', crouch: true });
  s = run(s, 160);
  assert.equal(s.me.act?.k, 'clkick');
  assert.ok(s.foe.bal < 100 && s.foe.stun > s.t, 'standing guard: hit');
  let l = guardOf(apart(130), true);
  l = run(press(l, { g: 'lkick', crouch: true }), 160);
  assert.equal(l.foe.stun <= l.t, true, 'low guard: stood off');
  // the sweep: down, untouchable while down and the beat she rises in
  let w = apart(150);
  w = run(press(w, { g: 'heavy', crouch: true }), ME.cheavy.startup + 30);
  assert.ok(w.foe.down > w.t, 'swept down');
  const bal = w.foe.bal;
  w = run(w, ME.cheavy.active + ME.cheavy.recover);
  w = run(press(w, { g: 'light', crouch: false }), 120);
  assert.equal(w.foe.bal, bal, 'nothing lands on her while she is down');
  w = run(w, 2000);
  assert.equal(w.foe.down, 0, 'up again');
  assert.ok(w.foe.wake > 0 && WAKE_MS > 0);
});

test('high: his jump-in blow beats her low guard, her standing guard stops it', () => {
  const jumpIn = (low) => {
    let s = guardOf(apart(170), low);
    s = press(s, { g: 'walk', dir: 1 }); s = press(s, { g: 'jump' }); s = run(s, 260); s = press(s, { g: 'heavy' });
    for (let i = 0; i < 60 && s.foe.bal === 100 && s.foe.stun <= s.t; i += 1) s = run(s, 10);
    return s;
  };
  const lo = jumpIn(true), hi = jumpIn(false);
  assert.ok(lo.foe.stun > lo.t && lo.foe.bal < 100, 'low guard: hit from above');
  assert.ok(hi.foe.stun <= hi.t, 'standing guard: stood off');
});

test('his guard has a height too: her sweep only crouching (↙), her jump-in only standing', () => {
  const sweep = (crouch) => {
    let s = apart(160); s.foe.think = 1e9;
    s = press(s, { g: 'block', on: true, crouch });
    s.foe.act = { k: 'sweep', at: s.t, m: { startup: 50, active: 120, recover: 300 }, hit: false };
    s = run(s, 80);
    return s;
  };
  const st = sweep(false), cr = sweep(true);
  assert.ok(st.me.down > st.t, 'standing guard: swept down');
  assert.ok(cr.me.down <= cr.t && cr.me.hp > 95, 'low guard: stood off');
  const air = (crouch) => {
    let s = apart(140); s.foe.think = 1e9;
    s = press(s, { g: 'block', on: true, crouch });
    s.foe.act = { k: 'jump', at: s.t, m: { startup: 1e9, active: 0, recover: 0 }, hit: false, swung: s.t };
    s.foe.air = true; s.foe.y = 60; s.foe.vy = -200;
    return run(s, 20);
  };
  const a1 = air(true), a2 = air(false);
  assert.ok(a1.me.hp < 100, 'crouching: the jump-in lands');
  assert.ok(a2.me.hp >= 99, 'standing: stood off');
});

test('throws: ← or → with 重 close — no guard stops it, she is down; past its reach the 上步 heavy instead; never on a reeling foe', () => {
  let s = guardOf(apart(80), false); s.R.foe.ai.tech = 0;
  s = run(press(s, { g: 'heavy', dir: 1 }), 80);
  assert.ok(s.snd.throw >= 1, 'thrown through her guard');
  assert.ok(s.foe.down > s.t && s.foe.bal < 100);
  let f = apart(ME.throw.reach + 40);
  f = press(f, { g: 'heavy', dir: 1 });
  assert.ok(f.me.act?.k === 'heavy' || f.buf.some((b) => b.k === 'heavy'));
  f = run(f, 20);
  assert.equal(f.me.act?.k, 'heavy', 'out of reach: the 上步侧踹');
  let r = apart(80); r.foe.stun = r.t + 500;
  r = run(press(r, { g: 'heavy', dir: 1 }), 40);
  assert.notEqual(r.me.act?.k, 'throw', 'a reeling foe is never thrown');
});

test('her throw: her hands on him hold him a moment — 重拳 or 重腿 then breaks it (拆); held out, he is thrown down', () => {
  const grab = (hand) => {
    let s = apart(80); s.foe.think = 1e9;
    s.foe.act = { k: 'throw', at: s.t, m: { startup: 0, active: 40, recover: 400 }, hit: false };
    s = run(s, 20);
    assert.ok(s.grab, 'held');
    if (hand) s = press(s, { g: 'hpunch' });
    return run(s, 400);
  };
  const broke = grab(true), thrown = grab(false);
  assert.ok(broke.snd.tech >= 1 && broke.me.hp === 100, 'broken: nothing taken');
  assert.ok(thrown.snd.throw >= 1 && thrown.me.hp < 100 && thrown.me.down > 0, 'thrown down');
});

test('the guard\'s meter: blows stood off fill it and it breaks (破防); left alone it fills back; her lights hardly touch hers', () => {
  let s = apart(120); s.foe.think = 1e9;
  s = press(s, { g: 'block', on: true });
  let crushed = false;
  for (let i = 0; i < 12 && !crushed; i += 1) {
    s.foe.act = { k: 'thrust', at: s.t, m: { startup: 10, active: 120, recover: 10 }, hit: false, lunged: true };
    s = run(s, 160);
    crushed = (s.snd.crush ?? 0) > 0;
  }
  assert.ok(crushed, 'his guard broke');
  assert.ok(s.me.broken > s.t - 900, 'open a beat');
  let g = apart(120); g.me.gp = 60; g.me.gpAt = g.t;
  g = run(g, ME.guard.rest + 1000);
  assert.ok(g.me.gp < 30, `filled back to ${g.me.gp}`);
  // a masher's lights: thirty stood off never break her guard
  let m = guardOf(apart(120), false);
  for (let i = 0; i < 30; i += 1) { m = press(m, { g: 'light' }); m = run(m, 70); m.foe.act = { k: 'block', at: m.t, m: { startup: 0, active: 0, recover: 3000 }, hit: false }; }
  assert.equal(m.snd.crush ?? 0, 0);
});

test('guard cancel: in a guard\'s stagger, A+B with a stock rolls at once (the stock spent); with none, nothing', () => {
  const gc = (qi) => {
    let s = apart(120); s.foe.think = 1e9; s.me.qi = qi;
    s = press(s, { g: 'block', on: true });
    s.foe.act = { k: 'poke', at: s.t, m: { startup: 10, active: 120, recover: 600 }, hit: false };
    s = run(s, 30);
    assert.ok(s.me.gstun > s.t, 'in the guard\'s stagger');
    s = press(s, { g: 'block', on: false });
    s = press(s, { g: 'ying' });
    return run(s, 80);
  };
  const yes = gc(QI + 10), no = gc(40);
  assert.equal(yes.me.act?.k, 'roll');
  assert.ok(yes.me.qi < QI, 'a stock spent');
  assert.notEqual(no.me.act?.k, 'roll');
});

test('a counter: a blow into the last beat of her wind-up lands heavier than the same blow on her standing', () => {
  const into = (winding) => {
    let s = apart(130);
    if (winding) s.foe.act = { k: 'thrust', at: s.t, m: { startup: 150, active: 120, recover: 400 }, hit: false }; // his 拳 lands in her wind-up's last beat
    s = run(press(s, { g: 'light' }), 120);
    return 100 - s.foe.bal;
  };
  assert.ok(into(true) > into(false), `${into(true)} vs ${into(false)}`);
});

test('a special stood off still chips her (KOF\'s); a 拳 stood off barely', () => {
  let a = guardOf(apart(300), false);
  a = run(press(a, { g: 'skill' }), 900);
  let b = guardOf(apart(130), false);
  b = run(press(b, { g: 'light' }), 200);
  assert.ok(100 - a.foe.bal > (100 - b.foe.bal) * 3, `${100 - a.foe.bal} vs ${100 - b.foe.bal}`);
});

test('爆气 (◀ + 技, a stock): his blows heavier a while; the 绝 in it costs nothing more and ends it; 绝境 once with his 血 low', () => {
  let s = apart(130); s.me.qi = QI + 20;
  s = press(s, { g: 'walk', dir: -1 }); s = press(s, { g: 'skill' }); s = run(s, 700);
  assert.ok(s.me.max > s.t, 'MAX on');
  assert.equal(s.me.qi, 20, 'a stock spent');
  assert.ok(superReady(s), 'its 绝 is ready');
  const hit = (max) => { let h = apart(130); if (max) h.me.max = 1e9; h = run(press(h, { g: 'light' }), 150); return 100 - h.foe.bal; };
  assert.ok(hit(true) > hit(false) * 1.15);
  s = press(s, { g: 'walk', dir: 0 }); s = press(s, { g: 'skill' }); s = run(s, 50);
  assert.equal(s.cutin?.how, 'max', 'the 绝 in it');
  assert.equal(s.me.max, 0, 'and it ends'); assert.equal(s.me.qi, 20, 'no stock more');
  // no stock: ◀ + 技 is the 掌心火
  let p = apart(300); p = run(press(press(p, { g: 'walk', dir: -1 }), { g: 'skill' }), 400);
  assert.equal(p.snd.palmfire, 1);
  // 绝境: no stock, his 血 low — one 绝, once
  let l = apart(300); l.me.hp = 20;
  assert.ok(superReady(l));
  l = run(press(l, { g: 'skill' }), 50);
  assert.equal(l.cutin?.how, 'last');
  assert.equal(superReady(run(l, 3000)), false, 'once a bout');
});

test('the bout\'s call: under `intro` his presses wait and she stands; then both go', () => {
  let s = withIntro(F.newGame('intro', 1, { levels: [level('qinyan')] }));
  const fx0 = s.foe.x;
  s = press(s, { g: 'light' });
  s = run(s, INTRO_MS - 100);
  assert.equal(s.me.act, null); assert.equal(s.foe.x, fx0);
  s = run(s, 200); s.foe.think = 1e9;
  s = press(s, { g: 'light' }); s = run(s, 20);
  assert.equal(s.me.act?.k, 'light');
});

test('her mind uses KOF\'s options by her book — jumps in, runs in, sweeps, throws, meets his jump, rolls — not only walking in', () => {
  const sum = {};
  for (const L of LEVELS) {
    const t = {};
    for (let i = 1; i <= 3; i += 1) {
      let last = null;
      const spy = { ...F, tick: (s, ms) => (last = F.tick(s, ms)) };
      playOnce(spy, bot, { seed: `ai-${i}`, deal: { levels: [L] }, limit: 90000 });
      for (const [k, n] of Object.entries(last?.tally ?? {})) t[k] = (t[k] ?? 0) + n;
    }
    const ai = { ...F.newGame('x', 1, { levels: [L] }).R.foe.ai };
    const kinds = ['jump', 'run', 'sweep', 'throw', 'aa', 'roll'].filter((k) => ai[k] >= 0.1);
    const used = kinds.filter((k) => t[k] > 0);
    assert.ok(used.length >= Math.ceil(kinds.length / 2), `${L.id}: used ${used.join(',')} of ${kinds.join(',')} (${JSON.stringify(t)})`);
    for (const [k, n] of Object.entries(t)) sum[k] = (sum[k] ?? 0) + n;
  }
  for (const k of ['jump', 'run', 'sweep', 'throw', 'aa', 'roll']) assert.ok(sum[k] > 0, `${k} never chosen: ${JSON.stringify(sum)}`);
});

test('撑过她的剑 (futian) and 后山崖顶 (shenshi) are fair: the 320 ms hand wins at least half of eight fresh bouts', () => {
  for (const id of ['futian', 'shenshi-qinyan-ge']) {
    let won = 0;
    for (let i = 1; i <= 8; i += 1) if (playOnce(F, bot, { seed: `bot-${i}`, deal: { levels: [level(id)] }, reaction: 320, limit: 180000 }).won) won += 1;
    assert.ok(won >= 4, `${id}: ${won}/8`);
  }
});
