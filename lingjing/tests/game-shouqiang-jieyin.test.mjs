// 守墙关 × 结印 (doc/games.md § 手势斗法; Hanli 10-21: 「让用户结印发火弹帮忙打怪」「别让用户太累」「加一个手势的冷却, 让用户
// 大部分时间在休息」「不然打小怪, 结手印太频繁很累」「手印攻击高, 可以引导玩家用于打boss」「古6是系统学习, 前面可以出现简单的,
// 比如剑诀」, 隔空指点 「很不错, 加进去」): spells only while a 大妖 is out, a rest between casts, hard on the 大妖 and harder
// on the element they overcome; the target is the tapped beast, else the 大妖, else the one nearest the wall; moves gated
// by the save's marks; with no camera nothing is offered and the game is the game it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BOTS, castJieyin, jieyinCool, jieyinOn, jieyinState, jieyinTarget, newGame, pick, reachY, setFocus, sim, spellMul, step, withRoots } from '../scripts/games/shouqiang/core.js';
import { callLine, gateOpen, offerJieyin } from '../scripts/games/shouqiang.js';
import { WORDS, movesFor, offerSeals, stepAll } from '../scripts/games/jieyin/helper.js';
import { start } from '../scripts/games/jieyin/sequence.js';
import { posesOf } from '../scripts/games/jieyin/pose.js';
import { bot } from '../scripts/games/zhidian/fake.js';

const at = (p) => new URL(`../${p}`, import.meta.url);
const json = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const kit = withRoots(json('worlds/jiuding/levels/shouqiang.json'), json('worlds/jiuding/creatures.json').creatures);
const seals = json('worlds/jiuding/levels/jieyin.json');
const J = kit.jieyin;
const level = kit.levels[0];
const always = { ...level, jieyinWhen: 'always' };
const advance = (g, secs) => { for (let t = 0; t < secs; t += 0.1) step(g, 0.1); };
const toWave1 = (g) => { advance(g, level.leadSec + 0.2); pick(g, 'open-jian'); advance(g, level.countIn + 0.2); return g; };
/** Wave 1 with at least two beasts below the range line, the heroes holding their fire. */
function crowded(seed, lvl = always) {
  const g = toWave1(newGame(kit, lvl, { seed }));
  for (let i = 0; i < 300 && g.beasts.filter((b) => b.y >= reachY(g) && b.hp > 0).length < 2; i += 1) step(g, 0.1);
  g.cool.sword = g.cool.fox = 999;
  g.shots.length = 0;
  return g;
}
/** A 大妖 stepped onto the field below the range line (a beast made one, as spawn() would). */
const withBoss = (g) => { const b = g.beasts[0]; Object.assign(b, { kind: 'heyu', boss: true, hp: 4000, max: 4000, y: reachY(g) + 120, wailIn: 99 }); return b; };
const fly = (g, secs = 1) => { const hits = []; for (let t = 0; t < secs; t += 1 / 60) { step(g, 1 / 60); hits.push(...g.events.filter((e) => e.t === 'hit' && e.kind === 'spell')); g.events.length = 0; } return hits; };

test('the numbers are data: when, aim, cool, bossMul, 相克, words, and every move a shape, a gate, its seals', () => {
  assert.equal(J.when, 'boss');
  assert.equal(J.aim, 'boss');
  for (const k of ['cool', 'bossMul', 'counter', 'idle', 'fly']) assert.ok(Number.isFinite(J[k]) && J[k] > 0, k);
  assert.ok(J.say.zh && J.say.en && J.first.zh && J.first.en && J.counterSay.zh && J.counterSay.en);
  assert.deepEqual(Object.keys(J.beats).sort(), ['earth', 'fire', 'metal', 'water', 'wood']);
  for (const m of J.moves) {
    assert.ok(m.name.zh && m.name.en && ['one', 'spear', 'row', 'ring'].includes(m.shape), m.id);
    assert.ok(m.seals || m.jieyin, `${m.id}: its seals`);
    assert.ok(m.from === null || m.from.marks?.length, `${m.id}: a gate or none`);
  }
  assert.equal(J.moves.filter((m) => !m.from).map((m) => m.id).join(), 'feijian', 'before 古六 only 剑诀\'s 飞剑');
  assert.equal(J.moves.find((m) => m.id === 'feijian').motion, 'jab', '隔空指点: shape + jab');
  for (const w of Object.values(WORDS)) assert.ok(w.btn && w.label && w.off && w.asking && w.rest && w.ready);
  for (const b of ['yezhu', 'zheng', 'qiuyu', 'qique', 'heyu']) assert.ok(kit.beasts[b].root, `${b}: its element from creatures.json`);
});

test('offered only while a 大妖 is on the field: ordinary waves are the cards\' job', () => {
  const g = crowded('on', level);
  assert.equal(jieyinOn(g), false);
  assert.equal(castJieyin(g, 'feijian'), false);
  assert.equal(jieyinState(g).on, false);
  withBoss(g);
  assert.equal(jieyinOn(g), true);
  assert.equal(jieyinState(g).boss, 'earth', 'the 大妖\'s element, for the cue');
  assert.equal(castJieyin(g, 'feijian'), true);
  const lead = newGame(kit, always, { seed: 'l' });
  assert.equal(castJieyin(lead, 'feijian'), false, 'never in the lead-in');
  const p = crowded('p');
  p.phase = 'pick';
  assert.equal(castJieyin(p, 'feijian'), false, 'never in a card pick');
});

test('target: the tapped beast; else the 大妖 in reach; else the beast nearest the wall', () => {
  const g = crowded('t');
  const live = g.beasts.filter((b) => b.y >= reachY(g));
  const nearest = live.reduce((m, b) => (b.y > m.y ? b : m));
  assert.equal(jieyinTarget(g), nearest, 'none tapped, no 大妖 → nearest the wall');
  const other = live.find((b) => b !== nearest);
  setFocus(g, other.id);
  assert.equal(jieyinTarget(g), other, 'the tapped one wins');
  const boss = withBoss(g);
  assert.equal(jieyinTarget(g), other === boss ? boss : other, 'still the tapped one');
  setFocus(g, null);
  assert.equal(jieyinTarget(g), boss, 'the 大妖 next (aim: boss)');
  const far = g.beasts.find((b) => b.y < reachY(g));
  if (far) { g.focus = far.id; assert.notEqual(jieyinTarget(g), far, 'a tapped beast above the range line is out of reach'); }
});

test('rest: one spell, then none till it cools (game time); the seals are not spent when nothing can be hit', () => {
  const g = crowded('c');
  assert.equal(castJieyin(g, 'feijian'), true);
  assert.equal(castJieyin(g, 'feijian'), false, 'resting');
  assert.ok(Math.abs(jieyinCool(g) - J.cool) < 1e-9);
  assert.equal(jieyinState(g).ready, false);
  advance(g, J.cool + 0.2);
  if (g.phase === 'wave' && jieyinTarget(g)) assert.equal(castJieyin(g, 'feijian'), true, 'rested');
  const empty = crowded('e');
  empty.beasts.length = 0;
  assert.equal(castJieyin(empty, 'feijian'), false);
  assert.equal(jieyinCool(empty), 0);
});

test('hard on the 大妖 (bossMul), harder on what its element overcomes (五行相克: beats, the beast\'s root)', () => {
  const g = crowded('m');
  const boss = withBoss(g);
  const move = (id) => J.moves.find((m) => m.id === id);
  assert.equal(spellMul(g, move('feijian'), boss), J.bossMul);
  assert.equal(spellMul(g, move('muteng'), boss), J.bossMul * J.counter, '木得金… 土得木而达: wood overcomes earth (合窳)');
  const zheng = { kind: 'zheng', boss: false };
  assert.equal(spellMul(g, move('bingzhui'), zheng), J.counter, '火得水而灭: water overcomes fire (狰)');
  assert.equal(spellMul(g, move('huodan'), zheng), 1);
  setFocus(g, boss.id);
  castJieyin(g, 'feijian');
  const hits = fly(g);
  assert.equal(hits.find((h) => h.id === boss.id)?.dmg, J.moves[0].dmg * J.bossMul, 'the 飞剑 on the 大妖');
});

test('the five temperaments: 矛 down its line, 镰 a row (and a slow), 绳 holds without a scratch, 墙 pushes back', () => {
  const run = (id, seed) => { const g = crowded(seed); const t = jieyinTarget(g); const before = new Map(g.beasts.map((b) => [b.id, { hp: b.hp, y: b.y }])); assert.equal(castJieyin(g, id), true, id); const hits = fly(g); return { g, t, before, hits }; };
  const spear = run('huodan', 's1');
  assert.ok(spear.hits.some((h) => h.id === spear.t.id), '火 hits its beast');
  const row = run('jinren', 's2');
  for (const h of row.hits) assert.ok(Math.abs(row.before.get(h.id).y - row.t.y) < 120, '金 only the row');
  assert.ok(row.g.beasts.filter((b) => row.hits.some((h) => h.id === b.id)).every((b) => b.slowT > 0), '金 slows the ankles it cuts');
  const rope = run('muteng', 's3');
  assert.equal(rope.hits.length, 0, '木 does not hurt');
  assert.ok(rope.g.beasts.some((b) => b.stunT > 1), '木 holds');
  const wall = run('tuqiang', 's4');
  const t = wall.g.beasts.find((b) => b.id === wall.t.id);
  if (t) assert.ok(t.y < wall.before.get(t.id).y, '土 pushes it back up the road');
});

test('gates: before 古六 (no 讲堂 mark in the save) only 飞剑; after it every move; the 游戏厅 (no marks given) every move', () => {
  const ids = (marks) => J.moves.filter((m) => gateOpen(m, marks)).map((m) => m.id);
  assert.deepEqual(ids([]), ['feijian']);
  assert.deepEqual(ids(['qiajue-loose']), J.moves.map((m) => m.id));
  assert.deepEqual(ids(['qiajue-tight', 'x']), J.moves.map((m) => m.id));
  assert.deepEqual(ids(undefined), J.moves.map((m) => m.id));
});

test('the 大妖\'s cue: the kit\'s line, and the counter move when one is offered', () => {
  const all = J.moves, pre = J.moves.filter((m) => !m.from);
  assert.equal(callLine(J, 'earth', pre, 'zh'), J.say.zh, 'only 飞剑: no element talk');
  const line = callLine(J, 'earth', all, 'zh');
  assert.ok(line.startsWith(J.say.zh) && line.includes('木藤') && line.includes('土'), line);
  assert.match(callLine(J, 'earth', all, 'en'), /Wood vine/);
});

test('no spell cast → the game is the game it was: the jieyin block changes nothing for a player without a camera', () => {
  const bare = { ...kit, jieyin: undefined };
  for (const lvl of [kit.levels[0], kit.levels[4]]) for (const b of ['human', 'greedy']) {
    const x = sim(kit, lvl, BOTS[b], { seed: `same-${b}`, limit: 1500 }), y = sim(bare, lvl, BOTS[b], { seed: `same-${b}`, limit: 1500 });
    assert.deepEqual({ ...x, skills: null }, { ...y, skills: null }, `${lvl.id} ${b}`);
    assert.equal(x.eggs, 0);
  }
  assert.equal(castJieyin(crowded('bare', { ...always }), 'nope'), false, 'an unknown move');
});

// The sims (doc/games.md § 结印): `seals` = s a player takes to make a move once one may fly; `spell` the move.
test('balance: spells shorten the 大妖\'s fight; without them the levels are still won; the hand rests ≥ 95% of a level', () => {
  const NIGHTS = Array.from({ length: 16 }, (_, i) => `q${i}`);
  const avg = (rs, f) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
  for (const lvl of kit.levels.filter((l) => l.waves.some((w) => w.some(([k]) => kit.beasts[k].boss)))) {
    const plain = NIGHTS.map((seed) => sim(kit, lvl, BOTS.human, { seed, limit: 1500 }));
    const helped = NIGHTS.map((seed) => sim(kit, lvl, BOTS.human, { seed, limit: 1500, seals: 4, spell: 'feijian' }));
    assert.ok(plain.filter((r) => r.won).length >= NIGHTS.length * 0.6, `${lvl.id}: winnable without spells`);
    assert.ok(avg(helped, (r) => r.bossT) < avg(plain, (r) => r.bossT) * 0.8, `${lvl.id}: the 大妖 falls sooner (${avg(helped, (r) => r.bossT).toFixed(0)} vs ${avg(plain, (r) => r.bossT).toFixed(0)} s)`);
    const casts = avg(helped, (r) => r.eggs);
    assert.ok(casts >= 1 && casts <= 4, `${lvl.id}: a few casts a 大妖 (${casts.toFixed(1)})`);
    assert.ok(avg(helped, (r) => 1 - (r.eggs * 4) / r.t) >= 0.95, `${lvl.id}: resting`);
  }
  for (const lvl of kit.levels) {
    const lazy = ['z0', 'z1'].map((seed) => sim(kit, { ...lvl, jieyinWhen: 'always' }, BOTS.lazy, { seed, limit: 1500, seals: 1, spell: 'huodan' }));
    assert.ok(lazy.every((r) => !r.won), `${lvl.id}: spells on every wave and no cards still lose`);
  }
});

/* ── the page side: a fake DOM just deep enough for helper.js ── */

function el(tag = 'div', ownerDocument = null) {
  const kids = new Map();
  const o = {
    tag, ownerDocument, hidden: false, dataset: {}, style: { setProperty(k, v) { this[k] = v; } }, textContent: '', innerHTML: '', offsetWidth: 0, listeners: {},
    classList: { set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    setAttribute() {}, remove() { o.removed = true; }, append(...xs) { (o.kids ??= []).push(...xs); },
    addEventListener(t, f) { (o.listeners[t] ??= []).push(f); },
    fire(t) { for (const f of o.listeners[t] ?? []) f({ stopPropagation() {} }); },
    querySelector(s) { if (!kids.has(s)) kids.set(s, el('div', o.ownerDocument)); return kids.get(s); },
    querySelectorAll: () => [],
  };
  return o;
}
function page({ hidden = false } = {}) {
  const frames = [];
  const doc = { hidden, head: { append() {} }, querySelector: () => null, createElement: (t) => el(t, doc), listeners: {},
    addEventListener(t, f) { (doc.listeners[t] ??= []).push(f); }, removeEventListener(t, f) { doc.listeners[t] = (doc.listeners[t] ?? []).filter((x) => x !== f); } };
  let now = 0;
  const win = { performance: { now: () => now }, requestAnimationFrame: (f) => frames.push(f), cancelAnimationFrame() { frames.length = 0; } };
  doc.defaultView = win;
  const host = el('div', doc);
  host.appended = [];
  host.append = (...xs) => host.appended.push(...xs);
  const frame = async (n = 1) => { for (let i = 0; i < n; i += 1) { now += 16; const f = frames.splice(0); f.forEach((x) => x()); await Promise.resolve(); await Promise.resolve(); } };
  return { doc, win, host, frame, now: () => now };
}
function fakeEye() {
  const log = [];
  return { log, make: (o) => { log.opts = o; return { start: async () => { log.push('start'); }, pause: () => log.push('pause'), close: () => log.push('close'), setFps: (n) => log.push(`fps ${n}`) }; } };
}
const withFetch = async (fn) => {
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(String(u)), 'utf8')) });
  try { return await fn(); } finally { globalThis.fetch = real; }
};

test('no camera (none, refused API, no WebGL), or no move this device can make: no button, no frame', async () => withFetch(async () => {
  const { host } = page();
  assert.equal(await offerSeals({ host, moves: J.moves, available: async () => false }), null);
  assert.equal(host.appended.length, 0, 'nothing drawn: no button, no stand-in to tap');
  assert.equal(await offerSeals({ host, moves: [], available: async () => true }), null, 'no move offered');
  assert.equal(await offerSeals({ host, moves: [{ id: 'x', jieyin: 'nothing-here' }], available: async () => true }), null, 'no seals for it here');
  const { host: h2 } = page();
  assert.equal(await offerJieyin(kit, h2, { lang: 'zh', game: {}, load: async () => ({ offerSeals: (o) => offerSeals({ ...o, available: async () => false }) }) }), null);
  assert.equal(await offerJieyin({ ...kit, jieyin: undefined }, h2, { lang: 'zh', game: {} }), null, 'a kit without the block offers nothing');
}));

test('movesFor: 飞剑 a jab of its seal; 火弹 this device\'s sequence and, on a Mac, the one-hand one too', () => {
  const desk = { matchMedia: () => ({ matches: false }), location: { search: '' } }, phone = { matchMedia: () => ({ matches: true }), location: { search: '' } };
  const d = movesFor(seals, J.moves, desk).moves, p = movesFor(seals, J.moves, phone).moves;
  const fj = d.find((m) => m.id === 'feijian');
  assert.deepEqual([fj.kind, fj.seal, Object.keys(fj.only)], ['jab', 'jian', ['jian']], 'a jab, reading its one shape');
  assert.deepEqual(d.find((m) => m.id === 'huodan').sequences, [seals.moves.huodan.desk, seals.moves.huodan.phone]);
  assert.deepEqual(p.find((m) => m.id === 'huodan').sequences, [seals.moves.huodan.phone]);
});

test('big moves in step: the one that completes casts and all start over; a 走火 only when the broken one was the only one under way', () => {
  const K = seals.judge, cand = (id, seq) => ({ id, seq, s: start({ mode: 'sequence', sequence: seq }) });
  let st = [cand('a', ['zhang', 'jian']), cand('b', ['si', 'wu'])];
  const hold = (seal, ms = 400) => { let r; for (let t = 0; t < ms; t += 50) { r = stepAll(st, seal, 50, K); st = r.states; if (r.cast || r.fizzle) return r; } return r; };
  hold('zhang'); hold(null, 300);
  const r = hold('jian');
  assert.equal(r.cast, 'a');
  assert.ok(st.every((c) => c.s.at === 0), 'all start over');
  hold('zhang'); hold(null, 300);
  assert.equal(hold('wu', 900).fizzle, true, 'a wrong seal mid-way, nothing else under way: 走火');
  st = [cand('a', ['zhang', 'jian']), cand('b', ['si', 'wu'])];
  assert.equal(hold('wu', 900).fizzle, false, 'nothing under way: no 走火');
});

test('the button: dark while no 大妖; it calls when one steps out; the camera only after the tap; rests, comes back, goes dark when the 大妖 falls', async () => withFetch(async () => {
  const { doc, host, frame } = page();
  const eye = fakeEye(), said = [];
  let st = { on: false, ready: false, cool: 0, coolOf: 10 }, paused = false;
  const h = await offerSeals({ host, moves: J.moves, available: async () => true, eyeOf: eye.make, state: () => st, paused: () => paused, say: (t) => said.push(t), call: () => '大妖来了', first: J.first });
  const [btn, dock] = host.appended;
  await frame(3);
  assert.ok(btn.hidden && dock.hidden, 'no 大妖: nothing shows');
  st = { on: true, ready: true, cool: 0, coolOf: 10 };
  await frame(1);
  assert.ok(!btn.hidden && btn.classList.contains('is-call') && btn.classList.contains('is-ready'), 'the 大妖 is out: the button calls');
  assert.deepEqual(said, ['大妖来了'], 'one cue line');
  assert.deepEqual(eye.log.filter((x) => x === 'start'), [], 'no camera before the tap');
  btn.fire('click');
  await frame(2);
  assert.equal(h.camera, 'on');
  assert.ok(!dock.hidden && btn.hidden, 'ready: the hint asks for the hand');
  assert.ok(eye.log.includes(`fps ${json('worlds/jiuding/levels/zhidian.json').poke.fps}`), 'the jab armed: the quick rate');
  assert.ok(said.includes(J.first.zh) || said.length === 1, 'the first-time line (once a device)');
  st = { on: true, ready: false, cool: 8, coolOf: 10 };
  await frame(1);
  assert.ok(dock.hidden && !btn.hidden && btn.classList.contains('is-rest') && btn.style['--k'] === '0.8', 'resting: the frame steps away, the rest burns down on the button');
  assert.equal(h.camera, 'on', 'the camera idles');
  assert.ok(eye.log.at(-1).startsWith('fps'), 'at the slow rate');
  st = { on: true, ready: true, cool: 0, coolOf: 10 };
  await frame(1);
  assert.ok(!dock.hidden && said.includes(WORDS.zh.ready), 'ready again: back, one short cue');
  paused = true;
  await frame(1);
  assert.ok(eye.log.slice(-2).includes('pause'), 'paused: off');
  paused = false;
  await frame(2);
  assert.equal(h.camera, 'on', 'back on: the player had it on');
  doc.hidden = true;
  for (const f of doc.listeners.visibilitychange) f();
  assert.equal(eye.log.at(-1), 'pause', 'a hidden page: off at once');
  doc.hidden = false;
  await frame(2);
  st = { on: false, ready: false, cool: 0, coolOf: 10 };
  await frame(2);
  assert.ok(btn.hidden && dock.hidden && h.camera === 'off' && !h.wanted, 'the 大妖 fell: dark, camera off');
  st = { on: true, ready: true, cool: 0, coolOf: 10 };
  await frame(2);
  assert.equal(h.camera, 'off', 'the next 大妖 asks for a tap again');
  h.close();
  assert.ok(eye.log.includes('close') && btn.removed && dock.removed);
  assert.equal(doc.listeners.visibilitychange.length, 0);
}));

test('idle: ready with no seal tried for `idle` s → the camera closes itself; a card pick puts the corner aside', async () => withFetch(async () => {
  const { host, frame } = page();
  let picking = false;
  const h = await offerSeals({ host, moves: J.moves, available: async () => true, eyeOf: fakeEye().make, idle: 1, state: () => ({ on: true, ready: true, cool: 0, coolOf: 10 }), aside: () => picking });
  const [btn, dock] = host.appended;
  btn.fire('click');
  await frame(2);
  assert.equal(h.camera, 'on');
  picking = true;
  await frame(1);
  assert.ok(btn.classList.contains('is-aside') && dock.classList.contains('is-aside'));
  picking = false;
  await frame(70);
  assert.equal(h.camera, 'off', 'a minute (here 1 s) with no seal: closed');
  assert.ok(!btn.hidden, 'the button is there to open it again');
  h.close();
}));

test('the 小招: 剑诀 at the lens and a jab → 飞剑 (隔空指点\'s judge and jab); the 大招: the seals in order → 火弹; a wrong one → 走火', async () => withFetch(async () => {
  const { host, frame, win, now } = page();
  const casts = [];
  let fizzles = 0;
  const h = await offerSeals({ host, moves: J.moves, feed: true, available: async () => true, state: () => ({ on: true, ready: true, cool: 0, coolOf: 10 }), cast: (id) => { casts.push(id); return true; }, fizzle: () => { fizzles += 1; } });
  host.appended[0].fire('click');
  await frame(2);
  let b = null;
  for (let i = 0; i < 40 && !casts.length; i += 1) { const r = bot(b, now(), seals.seals.jian); b = r.bot; win.jieyinFeed(r.hands.world, r.hands.image, now()); await frame(2); }
  assert.deepEqual(casts, ['feijian'], 'a jab with 剑诀 held: 飞剑');
  const hold = async (id, ms) => { const p = posesOf(seals.seals[id]); win.jieyinFeed(p.world, p.image); await frame(Math.ceil(ms / 16)); };
  for (const id of seals.moves.huodan.phone) { await hold(id, 420); win.jieyinFeed([]); await frame(15); }
  assert.equal(casts.at(-1), 'huodan', 'the four seals: 火弹');
  await hold('zhang', 420); win.jieyinFeed([]); await frame(15);
  await hold('wu', 900);
  assert.equal(fizzles, 1, '走火');
  h.close();
  assert.equal(win.jieyinFeed, undefined);
}));

test('the play: the spells\' art, the bundle carries the calls, the camera off the moment the level ends', () => {
  for (const k of ['huodan', 'fizzle']) assert.ok(existsSync(at(`scripts/games/jieyin/art/${k}.webp`)), k);
  const bundle = readFileSync(at('scripts/games/shouqiang/shouqiang.min.mjs'), 'utf8');
  assert.match(bundle, /jieyin\/art\//);
  assert.match(bundle, /jieyinState/);
  const sq = readFileSync(at('scripts/games/shouqiang.js'), 'utf8');
  assert.match(sq, /f\.t === 'end'[^\n]*close\(\)/);
  assert.match(sq, /marks: data\?\.marks/, 'the story\'s marks reach the gate');
  const helper = readFileSync(at('scripts/games/jieyin/helper.js'), 'utf8');
  assert.doesNotMatch(helper, /drawImage|getUserMedia|https?:\/\//, 'no picture, no camera of its own (eye.js), nothing from the network');
});
