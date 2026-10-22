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
import { WORDS, offerSeals, shortOf, tiersOf } from '../scripts/games/jieyin/helper.js';
import { poseOf } from '../scripts/games/jieyin/pose.js';

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
  const D = seals.doufa, known = [...Object.keys(D.xiao), ...D.fa, ...Object.keys(D.da)];
  for (const m of J.moves) {
    assert.ok(m.name.zh && m.name.en && ['one', 'spear', 'row', 'ring'].includes(m.shape), m.id);
    assert.ok(known.includes(m.id), `${m.id}: a move 手势斗法 casts`);
    assert.ok(m.from === null || m.from.marks?.length, `${m.id}: a gate or none`);
  }
  assert.deepEqual(J.moves.filter((m) => !m.from).map((m) => m.id), Object.keys(D.xiao), 'before 古六 the 小招, all of them');
  assert.deepEqual(known.filter((id) => !J.moves.some((m) => m.id === id)), [], 'every move has its effect here');
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

test('gates: before 古六 (no 讲堂 mark in the save) only the 小招; after it every move; the 游戏厅 (no marks given) every move', () => {
  const ids = (marks) => J.moves.filter((m) => gateOpen(m, marks)).map((m) => m.id);
  assert.deepEqual(ids([]), ['feijian', 'dianxue', 'zhangfeng', 'quanjin']);
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

// Hanli 10-21: 「用户结印失败, 或者不愿意使用摄像头, 塔防游戏也能正常完成, 不会影响剧情推进.」 Every level — the story's and
// 兽潮's above all — is won by a first-timer with no 结印 at all; nothing in the hp assumes a cast.
test('no 结印 at all: a first-timer still wins every level, story and 兽潮 rows first, in the normal band', () => {
  const NIGHTS = Array.from({ length: 10 }, (_, i) => `nc${i}`);
  for (const lvl of kit.levels) {
    const won = NIGHTS.filter((seed) => sim(kit, lvl, BOTS.human, { seed, limit: 1500 }).won).length;
    assert.ok(won >= 6, `${lvl.id}${lvl.story ? ` (story ${lvl.story})` : ''}: ${won}/10 without a camera`);
  }
  const hp = json('worlds/jiuding/levels/shouqiang.json').beasts.heyu.hp;
  assert.equal(kit.beasts.heyu.hp, hp, 'the 大妖\'s hp is the table\'s, never raised for spells');
});

test('the camera refused mid-level: the corner just goes, nothing else changes', async () => withFetch(async () => {
  const { host, frame } = page();
  const eyeOf = () => ({ start: async () => { throw Object.assign(new Error('denied'), { reason: 'denied' }); }, pause() {}, close() {}, setFps() {} });
  let casts = 0;
  const h = await offerSeals({ host, moves: ['feijian'], available: async () => true, eyeOf, state: () => ({ on: true, ready: true, cool: 0, coolOf: 10 }), cast: () => { casts += 1; return true; } });
  const [btn, dock] = host.appended;
  btn.fire('click');
  await frame(3);
  assert.ok(btn.removed && dock.removed, 'button and frame gone');
  assert.equal(h.camera, 'asking', 'never on');
  assert.equal(casts, 0, 'no cast, no cost');
}));

test('no camera (none, refused API, no WebGL), or no move this device can make: no button, no frame', async () => withFetch(async () => {
  const { host } = page();
  assert.equal(await offerSeals({ host, moves: ['feijian'], available: async () => false }), null);
  assert.equal(host.appended.length, 0, 'nothing drawn: no button, no stand-in to tap');
  assert.equal(await offerSeals({ host, moves: [], available: async () => true }), null, 'no move offered');
  assert.equal(await offerSeals({ host, moves: ['nothing-here'], available: async () => true }), null, 'a move 手势斗法 does not know');
  const { host: h2 } = page();
  assert.equal(await offerJieyin(kit, h2, { lang: 'zh', game: {}, load: async () => ({ offerSeals: (o) => offerSeals({ ...o, available: async () => false }) }) }), null);
  assert.equal(await offerJieyin({ ...kit, jieyin: undefined }, h2, { lang: 'zh', game: {} }), null, 'a kit without the block offers nothing');
}));

test('tiers and 灵力: the offered ids by tier; the rest while 灵力 is short of the cheapest', () => {
  const t = tiersOf(seals, ['feijian', 'huodan', 'huodan4', 'nope']);
  assert.deepEqual(t, { xiao: ['feijian'], fa: ['huodan'], da: ['huodan4'] });
  const cost = seals.doufa.lingli.cost;
  assert.equal(shortOf({ now: cost.xiao }, cost, t), 0);
  assert.equal(shortOf({ now: 0 }, cost, t), 1);
  assert.equal(shortOf({ now: cost.xiao / 2 }, cost, { xiao: ['feijian'], fa: [], da: [] }), 0.5);
});

test('the button (a camera the browser has not answered for, no lead line read): dark while no 大妖; it calls when one steps out; the camera only after the tap; rests, comes back, goes dark when the 大妖 falls; then opens by itself', async () => withFetch(async () => {
  const { doc, host, frame } = page();
  const eye = fakeEye(), said = [];
  let st = { on: false, ready: false, cool: 0, coolOf: 10 }, paused = false;
  const h = await offerSeals({ host, moves: J.moves.map((m) => m.id), available: async () => true, eyeOf: eye.make, state: () => st, paused: () => paused, say: (t) => said.push(t), call: () => '大妖来了', first: J.first, fastFps: J.armedFps });
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
  assert.ok(eye.log.includes(`fps ${J.armedFps}`), 'a 小招 armed: the quick rate');
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
  assert.equal(h.camera, 'on', 'the next 大妖: it opens by itself — he switched it on (Hanli 10-22: 「默认开摄像头开始结印」)');
  h.close();
  assert.ok(eye.log.includes('close') && btn.removed && dock.removed);
  assert.equal(doc.listeners.visibilitychange.length, 0);
}));

test('idle: ready with no seal tried for `idle` s → the camera closes itself; a card pick puts the corner aside', async () => withFetch(async () => {
  const { host, frame } = page();
  let picking = false;
  const h = await offerSeals({ host, moves: ['feijian'], available: async () => true, eyeOf: fakeEye().make, idle: 1, state: () => ({ on: true, ready: true, cool: 0, coolOf: 10 }), aside: () => picking });
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

// The hand in the picture as 手势斗法's own tests draw it (tests/game-doufa.test.mjs): wrist at (x, y), `len` a hand-length.
const placed = (h, x, y, len) => h.map((p) => ({ x: x + (p.x / 9.52) * len * 0.75, y: y + (p.y / 9.52) * len, z: p.z }));
test('the casts are 手势斗法\'s: 剑诀 + a jab → 飞剑 to the host; a move not offered here is dropped', async () => withFetch(async () => {
  const run = async (moves) => {
    const { host, frame, win } = page();
    const casts = [];
    const h = await offerSeals({ host, moves, feed: true, available: async () => true, state: () => ({ on: true, ready: true, cool: 0, coolOf: 10 }), cast: (e) => { casts.push(`${e.tier}:${e.move}`); return true; } });
    host.appended[0].fire('click');
    await frame(2);
    const show = async (len) => { const w = poseOf(seals.seals.jian); win.jieyinFeed([w], [placed(w, 0.5, 0.8, len)], ['Right']); await frame(1); };
    for (let i = 0; i < 40; i += 1) await show(0.2);
    for (let i = 0; i < 12; i += 1) await show(0.2 + 0.07 * ((i + 1) / 12));
    for (let i = 0; i < 20; i += 1) await show(0.27);
    h.close();
    return casts;
  };
  assert.deepEqual(await run(['feijian', 'huodan']), ['xiao:feijian']);
  assert.deepEqual(await run(['huodan']), [], 'not offered (before 古六 the 小招 only; here the reverse): dropped');
}));

test('the hand\'s progress to the host (Hanli 10-22: 「结印的过程中, 可否让小满手指发光」): a hand up a little, 剑诀 held 1/2, the jab flies 2/2 (cast), then nothing; the gesture frame\'s ring fills with it', async () => withFetch(async () => {
  const { host, frame, win } = page();
  const seen = [];
  const h = await offerSeals({ host, moves: ['feijian'], feed: true, available: async () => true, state: () => ({ on: true, ready: true, cool: 0, coolOf: 10 }), cast: () => true, onProgress: (p) => seen.push(p && { ...p }) });
  host.appended[0].fire('click');
  await frame(2);
  const show = async (len) => { const w = poseOf(seals.seals.jian); win.jieyinFeed([w], [placed(w, 0.5, 0.8, len)], ['Right']); await frame(1); };
  for (let i = 0; i < 40; i += 1) await show(0.2);
  const held = seen.filter(Boolean);
  assert.ok(held.length, 'progress told');
  assert.ok(held.every((p) => p.move === 'feijian' && p.of === 2), '飞剑: two steps (the shape, the thrust)');
  assert.ok(held.some((p) => p.step === 0) && held.some((p) => p.step === 1), 'the hand up, then 剑诀 held');
  for (let i = 1; i < held.length; i += 1) assert.ok(held[i].k >= held[i - 1].k, 'it only grows while the shape is held');
  for (let i = 0; i < 12; i += 1) await show(0.2 + 0.07 * ((i + 1) / 12));
  const cast = seen.find((p) => p?.cast);
  assert.deepEqual(cast && [cast.step, cast.of, cast.k], [2, 2, 1], 'the jab: the seal flies');
  h.close();
  assert.equal(seen.at(-1), null, 'closed: no hand works');
}));

test('where the dock stands is the host\'s data (offerSeals `dock`): 守山门 top-left, narrow; 守墙关 · 守炉 the bottom corner, narrow', async () => withFetch(async () => {
  const sad = JSON.parse(readFileSync(at('worlds/jiuding/levels/sadoushou.json'), 'utf8'));
  const { jieyinOf } = await import('../scripts/games/sadoushou/core.js');
  for (const l of sad.levels) assert.deepEqual(jieyinOf(sad, l).dock, sad.jieyinDock, `${l.id}: the kit's placement`);
  assert.equal(sad.jieyinDock.at, 'top');
  assert.ok(sad.jieyinDock.w > 0 && sad.jieyinDock.w <= 0.45, 'the frame stays off the middle column');
  const top = page(), low = page();
  const a = await offerSeals({ host: top.host, moves: ['feijian'], feed: true, available: async () => true, dock: sad.jieyinDock });
  const b = await offerSeals({ host: low.host, moves: ['feijian'], feed: true, available: async () => true });
  assert.deepEqual(top.host.appended.map((x) => x.dataset.at), ['top', 'top']);
  assert.equal(top.host.appended[1].style['--jyh-w'], '42%');
  assert.deepEqual(low.host.appended.map((x) => x.dataset.at), ['bottom', 'bottom'], 'no placement: the bottom corner');
  assert.equal(low.host.appended[1].dataset.narrow, undefined, 'no placement: the frame as it was');
  assert.equal(top.host.appended[1].dataset.narrow, '', 'a width: the narrow frame');
  // 守墙关 · 守炉: the bottom corner, their frames narrow — off 小满 (the wide one reached him, checked 10-22)
  const sq = JSON.parse(readFileSync(at('worlds/jiuding/levels/shouqiang.json'), 'utf8'));
  for (const d of [sq.jieyin.dock, seals.hosts.shoulu.dock]) assert.ok(d.at === 'bottom' && d.w <= 0.4, JSON.stringify(d));
  a.close(); b.close();
  const css = readFileSync(at('scripts/games/jieyin/helper.css'), 'utf8');
  assert.match(css, /\.jyh-dock\[data-at="top"\][^{]*\{[^}]*top:/, 'the top placement in the dock\'s css');
}));

test('the play: the spells\' art, the bundle carries the calls, the camera off the moment the level ends', () => {
  assert.ok(existsSync(at('scripts/games/jieyin/art/huodan.webp')));
  const bundle = readFileSync(at('scripts/games/shouqiang/shouqiang.min.mjs'), 'utf8');
  assert.match(bundle, /jieyin\/art\//);
  assert.match(bundle, /jieyinState/);
  const sq = readFileSync(at('scripts/games/shouqiang.js'), 'utf8');
  assert.match(sq, /f\.t === 'end'[^\n]*close\(\)/);
  assert.match(sq, /marks: data\?\.marks/, 'the story\'s marks reach the gate');
  const helper = readFileSync(at('scripts/games/jieyin/helper.js'), 'utf8');
  assert.doesNotMatch(helper, /drawImage|getUserMedia|https?:\/\//, 'no picture, no camera of its own (eye.js), nothing from the network');
  assert.match(helper, /from '\.\/duel\.js'/, 'the hands are read by 手势斗法, not here');
  assert.doesNotMatch(helper, /poke\.js|judge3d|sequence\.js/, 'no recognizer of its own');
});
