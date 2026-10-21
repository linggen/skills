// 守墙关 × 结印 (Hanli 10-21: 「让用户结印发火弹帮忙打怪」「放进去」): the 火蛋 strikes the tapped beast, else the one
// nearest the wall; it cools; it helps a player but never carries one (sims); with no camera nothing is offered and the
// game is the game it was; the camera is on only after the button and off on pause, hidden, the level's end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BOTS, castJieyin, jieyinCool, jieyinTarget, newGame, pick, reachY, setFocus, sim, step } from '../scripts/games/shouqiang/core.js';
import { offerJieyin } from '../scripts/games/shouqiang.js';
import { WORDS, offerSeals, sealsOf } from '../scripts/games/jieyin/helper.js';
import { posesOf } from '../scripts/games/jieyin/pose.js';

const at = (p) => new URL(`../${p}`, import.meta.url);
const kit = JSON.parse(readFileSync(at('worlds/jiuding/levels/shouqiang.json'), 'utf8'));
const seals = JSON.parse(readFileSync(at('worlds/jiuding/levels/jieyin.json'), 'utf8'));
const level = kit.levels[0];
const advance = (g, secs) => { for (let t = 0; t < secs; t += 0.1) step(g, 0.1); };
const toWave1 = (g) => { advance(g, level.leadSec + 0.2); pick(g, 'open-jian'); advance(g, level.countIn + 0.2); return g; };
/** Wave 1 with at least two beasts below the range line. */
function crowded(seed) {
  const g = toWave1(newGame(kit, level, { seed }));
  for (let i = 0; i < 300 && g.beasts.filter((b) => b.y >= reachY(g) && b.hp > 0).length < 2; i += 1) step(g, 0.1);
  g.cool.sword = g.cool.fox = 99; // the heroes hold their fire: only the egg hurts here
  g.shots.length = 0;
  return g;
}

test('the numbers are data: a jieyin block in the kit, both languages for its words', () => {
  const j = kit.jieyin;
  for (const k of ['dmg', 'radius', 'splash', 'cool', 'fly']) assert.ok(Number.isFinite(j[k]) && j[k] >= 0, k);
  assert.ok(j.cool >= 4 && j.dmg <= 150, 'a helper, not a card: it cools and it does not one-shot a wave');
  for (const w of Object.values(WORDS)) assert.ok(w.btn && w.label && w.off && w.asking && w.cool(3) && w.ready);
  const phone = { matchMedia: () => ({ matches: true }), location: { search: '' } }, desk = { matchMedia: () => ({ matches: false }), location: { search: '' } };
  assert.deepEqual(sealsOf(seals, 'huodan', phone).sequence, seals.moves.huodan.phone, 'the 火蛋 is jieyin.json\'s move, not a copy: one hand on a phone');
  assert.deepEqual(sealsOf(seals, 'huodan', desk).sequence, seals.moves.huodan.desk, 'both hands on a Mac');
  assert.ok(sealsOf(seals, 'huodan', phone).sequence.every((id) => sealsOf(seals, 'huodan', phone).seals[id]), 'every phone seal judged on a phone');
});

test('target: the tapped beast (the focus); with none, the beast nearest the wall', () => {
  const g = crowded('egg-t');
  const inReach = g.beasts.filter((b) => b.y >= reachY(g));
  const nearest = inReach.reduce((m, b) => (b.y > m.y ? b : m));
  const other = inReach.find((b) => b !== nearest);
  assert.equal(jieyinTarget(g), nearest, 'no focus → nearest the wall');
  setFocus(g, other.id);
  assert.equal(jieyinTarget(g), other, 'the focus wins');
  assert.equal(castJieyin(g), true);
  const egg = g.shots.find((s) => s.kind === 'huodan');
  assert.equal(egg.home, other.id);
  const hp = other.hp;
  const hits = [];
  for (let t = 0; t < kit.jieyin.fly + 0.3; t += 1 / 60) { step(g, 1 / 60); hits.push(...g.events.filter((e) => e.t === 'hit' && e.kind === 'fire')); g.events.length = 0; }
  const mine = hits.find((e) => e.id === other.id);
  const armor = g.beastKit[other.kind].armor?.fire ?? 1;
  assert.ok(mine && mine.dmg === Math.round(kit.jieyin.dmg * armor), `the egg strikes its beast for its dmg (${mine?.dmg}; hp was ${hp})`);
});

test('target: a focus still above the range line is not reachable — the egg takes the nearest in reach; none in reach → no egg', () => {
  const g = crowded('egg-r');
  const far = g.beasts.find((b) => b.y < reachY(g));
  if (far) { g.focus = far.id; assert.notEqual(jieyinTarget(g), far); }
  const empty = toWave1(newGame(kit, level, { seed: 'egg-e' }));
  empty.beasts.length = 0;
  assert.equal(jieyinTarget(empty), null);
  assert.equal(castJieyin(empty), false, 'nothing in reach: the seals are not spent');
  assert.equal(jieyinCool(empty), 0);
});

test('cooldown: one egg, then none until it cools; never between waves or before the first', () => {
  const g = crowded('egg-c');
  assert.equal(castJieyin(g), true);
  assert.equal(castJieyin(g), false, 'cooling');
  assert.ok(Math.abs(jieyinCool(g) - kit.jieyin.cool) < 1e-9);
  g.cool.sword = g.cool.fox = 99;
  advance(g, kit.jieyin.cool / 2);
  assert.equal(castJieyin(g), false);
  advance(g, kit.jieyin.cool / 2 + 0.2);
  if (g.phase === 'wave' && jieyinTarget(g)) assert.equal(castJieyin(g), true, 'cooled');
  const lead = newGame(kit, level, { seed: 'egg-l' });
  assert.equal(castJieyin(lead), false, 'the lead-in');
  const p = newGame(kit, level, { seed: 'egg-p' });
  p.phase = 'pick';
  assert.equal(castJieyin(p), false, 'a card pick');
});

test('no seals cast → the game is the game it was: the jieyin block changes nothing for a player without a camera', () => {
  const bare = { ...kit, jieyin: undefined };
  for (const lvl of [kit.levels[0], kit.levels[1]]) for (const bot of ['human', 'greedy']) {
    const a = sim(kit, lvl, BOTS[bot], { seed: `same-${bot}`, limit: 1500 }), b = sim(bare, lvl, BOTS[bot], { seed: `same-${bot}`, limit: 1500 });
    assert.deepEqual({ ...a, skills: null }, { ...b, skills: null }, `${lvl.id} ${bot}`);
    assert.equal(a.eggs, 0);
  }
  assert.equal(castJieyin(toWave1(newGame(bare, level, { seed: 'x' }))), false, 'no block, no egg');
});

// The sims (stated in doc/games.md § 结印): `seals` = seconds a player takes for the four seals after the egg cools.
test('balance: the egg helps a player, never replaces the cards — no cards + every egg still loses every level', () => {
  const SEEDS = ['jy0', 'jy1', 'jy2'];
  for (const lvl of kit.levels) {
    const lazy = SEEDS.map((seed) => sim(kit, lvl, BOTS.lazy, { seed, limit: 1500, seals: 2 }));
    assert.ok(lazy.every((r) => !r.won && r.wave < lvl.waves.length), `${lvl.id}: a lightning-fast 结印 alone won ${lazy.filter((r) => r.won).length}/3`);
  }
  // A first-timer (BOTS.human) taking 4 s for the four seals after each cooldown, on the 山门 (40 nights: the card
  // picks swing single nights more than the egg does, so the measure is the whole set).
  const NIGHTS = Array.from({ length: 40 }, (_, i) => `q${i}`);
  const plain = NIGHTS.map((seed) => sim(kit, level, BOTS.human, { seed, limit: 1500 }));
  const helped = NIGHTS.map((seed) => sim(kit, level, BOTS.human, { seed, limit: 1500, seals: 4 }));
  const wall = (rs) => rs.reduce((s, r) => s + r.wallLeft, 0) / rs.length;
  assert.ok(helped.filter((r) => r.won).length >= plain.filter((r) => r.won).length, 'it helps');
  assert.ok(wall(helped) > wall(plain) + 0.04, `more wall left with it (${wall(helped).toFixed(2)} vs ${wall(plain).toFixed(2)})`);
  assert.ok(helped.every((r) => r.eggs > 5), 'eggs were cast');
});

/* ── the page side: a fake DOM just deep enough for helper.js ── */

function el(tag = 'div', ownerDocument = null) {
  const kids = new Map();
  const o = {
    tag, ownerDocument, hidden: false, dataset: {}, style: {}, textContent: '', innerHTML: '', offsetWidth: 0, listeners: {},
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
  return { doc, win, host, frame };
}
function fakeEye() {
  const log = [];
  return { log, make: () => ({ start: async () => { log.push('start'); }, pause: () => log.push('pause'), close: () => log.push('close') }) };
}
const withFetch = async (fn) => {
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(String(u)), 'utf8')) });
  try { return await fn(); } finally { globalThis.fetch = real; }
};

test('no camera (none, refused API, no WebGL): no button, no frame — the host is left exactly as it was', async () => {
  const { host } = page();
  const h = await offerSeals({ host, available: async () => false, cast: () => { throw new Error('never'); } });
  assert.equal(h, null);
  assert.equal(host.appended.length, 0, 'nothing drawn: no button, no stand-in to tap');
  const { host: h2 } = page();
  const none = await offerJieyin(kit, h2, { lang: 'zh', game: {}, load: async () => ({ offerSeals: (o) => offerSeals({ ...o, available: async () => false }) }) });
  assert.equal(none, null);
  assert.equal(await offerJieyin({ ...kit, jieyin: undefined }, h2, { lang: 'zh', game: {} }), null, 'a kit without the block offers nothing');
});

test('the camera: off until the button; off while paused or hidden, back only if the player had it on; gone at the end', async () => withFetch(async () => {
  const { doc, host, frame } = page();
  const eye = fakeEye();
  let paused = false;
  let picking = false;
  const h = await offerSeals({ host, available: async () => true, eyeOf: eye.make, paused: () => paused, aside: () => picking });
  const [btn, dock] = host.appended;
  assert.equal(dock.hidden, true);
  await frame(5);
  assert.deepEqual(eye.log, [], 'no camera before the button');
  btn.fire('click');
  await frame(2);
  assert.deepEqual(eye.log, ['start']);
  assert.equal(h.camera, 'on');
  picking = true;
  await frame(1);
  assert.ok(btn.classList.contains('is-aside') && dock.classList.contains('is-aside'), 'a card pick: the corner steps aside');
  picking = false;
  await frame(1);
  assert.ok(!dock.classList.contains('is-aside'));
  paused = true;
  await frame(2);
  assert.deepEqual(eye.log.slice(-1), ['pause'], 'the shell\'s pause stops it');
  await frame(2);
  assert.equal(eye.log.filter((x) => x === 'start').length, 1, 'stays off while paused');
  paused = false;
  await frame(2);
  assert.equal(h.camera, 'on', 'back on: the player had it on');
  doc.hidden = true;
  for (const f of doc.listeners.visibilitychange) f();
  assert.deepEqual(eye.log.slice(-1), ['pause'], 'a hidden page: off at once');
  doc.hidden = false;
  await frame(2);
  assert.equal(h.camera, 'on');
  dock.querySelector('.jyh-off').fire('click');
  await frame(2);
  assert.equal(h.camera, 'off');
  doc.hidden = true; doc.hidden = false;
  await frame(3);
  assert.equal(h.camera, 'off', 'turned off by the player: it stays off');
  h.close();
  assert.ok(eye.log.includes('close') && btn.removed && dock.removed, 'the level over: closed, nothing left');
  assert.equal(doc.listeners.visibilitychange.length, 0);
}));

test('the seals in order cast through the host; a wrong one held is a 走火; nothing counts while the egg cools', async () => withFetch(async () => {
  const { host, frame } = page();
  let casts = 0, fizzles = 0, cool = 0;
  const h = await offerSeals({ host, available: async () => true, eyeOf: fakeEye().make, feed: true,
    cast: () => { casts += 1; cool = 5; return true; }, fizzle: () => { fizzles += 1; }, cool: () => cool });
  const feedWin = host.ownerDocument.defaultView;
  const feedHook = (p) => (p ? feedWin.jieyinFeed(p.world, p.image) : feedWin.jieyinFeed([])); // feed mode: the page's window takes the hands
  host.appended[0].fire('click');
  const hold = async (id, ms) => { feedHook(posesOf(seals.seals[id])); await frame(Math.ceil(ms / 16)); };
  for (const id of sealsOf(seals, 'huodan', {}).sequence) { await hold(id, 400); feedHook(); await frame(15); }
  assert.equal(casts, 1, 'the four seals → one 火蛋');
  await hold('zhang', 900);
  assert.equal(fizzles, 0, 'cooling: the seals are not counted');
  cool = 0;
  feedHook(); await frame(15);
  await hold('shen', 900);
  assert.equal(fizzles, 1, 'a wrong seal held: 走火');
  h.close();
  assert.equal(feedWin.jieyinFeed, undefined);
}));

test('no camera picture: the shared hand hint (hint.js) in the dock, the video only for the model', async () => withFetch(async () => {
  const { host } = page();
  const h = await offerSeals({ host, available: async () => true, eyeOf: fakeEye().make });
  const dock = host.appended[1];
  const hint = dock.querySelector('.jyh-hint').kids?.[0];
  assert.match(hint?.className ?? '', /jy-hint-panel is-compact/, 'handHint, compact, in the corner');
  h.close();
  const src = readFileSync(at('scripts/games/jieyin/helper.js'), 'utf8'), css = readFileSync(at('scripts/games/jieyin/helper.css'), 'utf8');
  assert.match(css, /\.jyh-video \{[^}]*opacity: 0/, 'the video is only for the model');
  assert.doesNotMatch(src, /drawImage|getUserMedia|https?:\/\//, 'no picture, no camera of its own (eye.js), nothing from the network');
}));

test('the play: the egg and the 走火 are the prototype\'s art, and the bundle carries the calls', () => {
  for (const k of ['huodan', 'fizzle']) assert.ok(existsSync(at(`scripts/games/jieyin/art/${k}.webp`)), k);
  const bundle = readFileSync(at('scripts/games/shouqiang/shouqiang.min.mjs'), 'utf8');
  assert.match(bundle, /jieyin\/art\//);
  assert.match(bundle, /jieyinCool/);
  const sq = readFileSync(at('scripts/games/shouqiang.js'), 'utf8');
  assert.match(sq, /f\.t === 'end'[^\n]*close\(\)/, 'the camera off the moment the level ends');
});
