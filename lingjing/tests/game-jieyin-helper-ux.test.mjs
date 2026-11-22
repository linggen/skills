// The helper's UX (Hanli 10-21: 「有结印要告诉玩家啊」, 「结印要有个框提示手势的」): the lead card's line where a camera is,
// the button wearing the next move's gesture, a bubble pointing at it the first time per level, the gesture frame drawn
// as the right hand. games/jieyin/helper.js (shared: 守墙关 · 守炉 · 守山门).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leadLine, offerSeals } from '../scripts/games/jieyin/helper.js';
import { leadWith } from '../scripts/games/jieyin/lead.js';
import { iconSvg, posesOf } from '../scripts/games/jieyin/pose.js';

const kit = JSON.parse(readFileSync(new URL('../worlds/jiuding/levels/jieyin.json', import.meta.url), 'utf8'));

function el(tag = 'div', ownerDocument = null) {
  const kids = new Map();
  const o = {
    tag, ownerDocument, hidden: false, dataset: {}, style: { setProperty() {} }, textContent: '', innerHTML: '', listeners: {},
    classList: { set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    setAttribute() {}, remove() { o.removed = true; }, kids: [], append(...xs) { o.kids.push(...xs); },
    addEventListener(t, f) { (o.listeners[t] ??= []).push(f); }, fire(t) { for (const f of o.listeners[t] ?? []) f({ stopPropagation() {} }); },
    querySelector(s) { if (!kids.has(s)) kids.set(s, el('div', o.ownerDocument)); return kids.get(s); }, querySelectorAll: () => [],
  };
  return o;
}
function page() {
  const frames = [];
  const doc = { hidden: false, head: { append() {} }, querySelector: () => null, createElement: (t) => el(t, doc), addEventListener() {}, removeEventListener() {} };
  let now = 0;
  const win = { performance: { now: () => now }, requestAnimationFrame: (f) => frames.push(f), cancelAnimationFrame() { frames.length = 0; } };
  doc.defaultView = win;
  const host = el('div', doc);
  host.appended = [];
  host.append = (...xs) => host.appended.push(...xs);
  const frame = async (n = 1) => { for (let i = 0; i < n; i += 1) { now += 16; frames.splice(0).forEach((x) => x()); await Promise.resolve(); } };
  return { host, frame };
}
const withFetch = async (fn) => {
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(String(u)), 'utf8')) });
  try { return await fn(); } finally { globalThis.fetch = real; }
};
const eyeOf = () => ({ start: async () => {}, pause() {}, close() {}, setFps() {} });
const memStore = (v = null) => { const s = { v, get: () => s.v, set: (x) => { s.v = x; } }; return s; };
function camLog() {
  const log = [];
  return { log, make: () => ({ start: async () => { log.push('start'); }, pause: () => log.push('pause'), close: () => log.push('close'), setFps: (n) => log.push(`fps ${n}`) }) };
}

test('the lead card\'s line: rest — a 大妖 out; intense — any time; both languages', () => {
  assert.match(leadLine(kit, 'rest', 'zh'), /大妖出场时.*结印/);
  assert.match(leadLine(kit, 'intense', 'zh'), /随时.*结印/);
  assert.match(leadLine(kit, 'rest', 'en'), /camera/);
  assert.equal(leadLine(kit, 'nonsense', 'zh'), leadLine(kit, 'rest', 'zh'));
  assert.equal(leadLine(kit, 'boss', 'zh'), leadLine(kit, 'rest', 'zh'), '守墙关 · 守山门 `when` read as a pace');
  assert.equal(leadLine(kit, 'always', 'zh'), leadLine(kit, 'intense', 'zh'));
});

test('every host joins it the same way (jieyin/lead.js): after the story\'s lines; none without a handle; never waits long', async () => {
  const h = { lead: (p) => leadLine(kit, p, 'zh') };
  assert.equal(await leadWith('故事。', Promise.resolve(h), 'boss', 'zh'), `故事。\n\n${leadLine(kit, 'rest', 'zh')}`);
  assert.equal(await leadWith('Story.', Promise.resolve({ lead: (p) => leadLine(kit, p, 'en') }), 'waves', 'en'), `Story.\n\n${leadLine(kit, 'intense', 'en')}`);
  assert.equal(await leadWith('故事。', Promise.resolve(null), 'boss'), '故事。', 'no camera: the story alone');
  assert.equal(await leadWith('故事。', null, 'boss'), '故事。', 'a level with no spell');
  assert.equal(await leadWith('故事。', new Promise(() => {}), 'boss', 'zh', 20), '故事。', 'a slow dock never holds the card');
  assert.equal(await leadWith('故事。', Promise.reject(new Error('x')), 'boss'), '故事。');
});

test('the button wears the next move\'s gesture; where the tap is still wanted (prompt, no lead line) a bubble points at it, gone on the tap; the next level the dock opens by itself, its own bubble says so', async () => withFetch(async () => {
  const { host, frame } = page();
  let lv = 'a';
  const h = await offerSeals({ host, moves: ['feijian'], available: async () => true, eyeOf, permission: async () => 'prompt', store: memStore(), level: () => lv, state: () => ({ on: true, ready: true, cool: 0, coolOf: 6 }) });
  const [btn, dock] = host.appended, [callout] = btn.kids, live = dock.kids.find((k) => k.className === 'jyh-callout');
  assert.equal(callout.className, 'jyh-callout', 'the bubble rides on the button (every host, any width)');
  assert.match(btn.innerHTML, /jyh-icon.*<svg class="jy-hand"/s, 'a hand drawn on the button');
  await frame(2);
  assert.equal(callout.hidden, false, 'the bubble points at the button');
  assert.match(callout.innerHTML, /小满.*点这里结印/);
  assert.equal(h.camera, 'off', 'no camera before he knows');
  btn.fire('click');
  await frame(3);
  assert.equal(callout.hidden, true, 'tapped: gone');
  assert.equal(h.camera, 'on');
  assert.equal(live.hidden, false, 'the dock\'s bubble: sealing is live');
  assert.match(live.innerHTML, /小满.*摄像头开着.*剑诀.*×/);
  lv = 'b';
  await frame(2);
  assert.equal(callout.hidden, true, 'the next level: no tap asked');
  assert.equal(h.camera, 'on');
}));

test('the gesture frame draws a one-hand seal as the right hand (the mirror shows a raised right hand so), a two-hand seal as both', () => {
  const xs = (svg) => [...svg.matchAll(/x1="([-\d.]+)"/g)].map((m) => +m[1]);
  const right = iconSvg(kit.seals.jian, 40, { hand: 'right' }), left = iconSvg(kit.seals.jian, 40, { hand: 'left' });
  assert.equal(iconSvg(kit.seals.jian, 40), right, 'a one-hand seal\'s own hand (jieyin.json `hand`) is the right');
  assert.notDeepEqual(xs(right), xs(left), 'mirror images');
  // an open palm: the thumb (its tip the first dot) of the right hand on the drawing's left, the left hand's on its right
  const thumbX = (svg) => +[...svg.matchAll(/<circle cx="([-\d.]+)"/g)][0][1];
  assert.ok(thumbX(iconSvg(kit.seals.zhang, 40, { hand: 'right' })) < thumbX(iconSvg(kit.seals.zhang, 40, { hand: 'left' })));
  assert.equal(iconSvg(kit.seals.lihuo, 40, { hand: 'right' }), iconSvg(kit.seals.lihuo, 40), 'two hands: left on the left, right on the right, as before');
  assert.ok(posesOf(kit.seals.jian).image.length === 1);
});

test('a host may hand its rows (守山门 · 守炉): the dock reads each as its 手势斗法 id and draws the button; 守山门 hears the cast event (live 10-22: rows went in whole, no button)', async () => withFetch(async () => {
  const sad = JSON.parse(readFileSync(new URL('../worlds/jiuding/levels/sadoushou.json', import.meta.url), 'utf8'));
  const { host } = page();
  const { movesOf, jieyinOf } = await import('../scripts/games/sadoushou/core.js'); // the level's moves from the kit's named set (10-22)
  const h = await offerSeals({ host, moves: movesOf(sad, sad.levels[0]), available: async () => true, eyeOf });
  assert.ok(h, 'a handle');
  assert.equal(host.appended[0].className, 'jyh-btn');
  h.close();
  const { offerJieyin } = await import('../scripts/games/sadoushou.js');
  const calls = [];
  let got = null;
  const game = { jieyinState: () => ({ on: true, ready: true }), jieyin: (id, lane) => { calls.push([id, lane]); return true; }, fizzle() {}, paused: () => false, picking: () => false, say() {} };
  await offerJieyin({ ...sad.levels[0], jieyin: jieyinOf(sad, sad.levels[0]) }, { ownerDocument: { defaultView: globalThis } }, { lang: 'zh', game, load: async () => ({ offerSeals: async (o) => { got = o; return null; } }) });
  got.cast({ type: 'cast', move: 'huodan', lane: 'left' });
  assert.deepEqual(calls, [['huodan', 'left']]);
}));

test('while the host is paused (its lead card, the shell\'s bar) nothing shows and the 大妖\'s call waits; then the button, the call and the bubble', async () => withFetch(async () => {
  const { host, frame } = page();
  let still = true;
  const said = [];
  await offerSeals({ host, moves: ['feijian'], available: async () => true, eyeOf, permission: async () => 'prompt', store: memStore(), paused: () => still, call: () => '大妖来了', say: (x) => said.push(x), state: () => ({ on: true, ready: true, cool: 0, coolOf: 6 }) });
  const [btn] = host.appended, [callout] = btn.kids;
  await frame(3);
  assert.equal(btn.hidden, true, 'paused: no button');
  assert.equal(callout.hidden, true, 'no bubble spent under the card');
  assert.deepEqual(said, [], 'no call yet');
  still = false;
  await frame(2);
  assert.equal(btn.hidden, false);
  assert.equal(callout.hidden, false);
  assert.deepEqual(said, ['大妖来了']);
}));

// Hanli 10-22 (第一回): 「小游戏里结印那里, 可以省掉用户点击动作. 默认开摄像头开始结印」 — the dock opens by itself at the
// offer where the camera may be used; the browser's own ask only after the lead line said so; a refusal or his off stays.
const BOSS = { on: true, ready: true, cool: 0, coolOf: 6 }, NONE = { on: false, ready: false, cool: 0, coolOf: 6 };
const auto = async ({ permission, store = memStore(), paused = () => false, st = () => BOSS, lead = false } = {}) => {
  const { host, frame } = page(), eye = camLog();
  const h = await offerSeals({ host, moves: ['feijian'], available: async () => true, eyeOf: eye.make, permission, store, paused, state: st });
  if (h && lead) h.lead('boss'); // the host's lead card took the line
  return { h, host, frame, eye, store, btn: host.appended[0], dock: host.appended[1] };
};

test('granted: the dock opens by itself at the offer, the camera on, no tap; its light on', async () => withFetch(async () => {
  let st = NONE;
  const { h, frame, eye, btn, dock } = await auto({ permission: async () => 'granted', st: () => st });
  await frame(3);
  assert.equal(h.camera, 'off', 'nothing offered: off');
  st = BOSS;
  await frame(3);
  assert.equal(h.camera, 'on');
  assert.deepEqual(eye.log.filter((x) => x === 'start'), ['start']);
  assert.ok(!dock.hidden && btn.hidden, 'the frame up, no button to press');
  assert.ok(dock.classList.contains('is-cam'), 'the camera light');
  assert.ok(!btn.classList.contains('is-call'));
  h.close();
}));

test('prompt: only once the lead line said 结印 is on (the browser then asks, no surprise); without it the tap', async () => withFetch(async () => {
  const told = await auto({ permission: async () => 'prompt', lead: true });
  await told.frame(3);
  assert.equal(told.h.camera, 'on', 'the lead card said it: opened by itself');
  told.h.close();
  const cold = await auto({ permission: async () => 'prompt' });
  await cold.frame(3);
  assert.equal(cold.h.camera, 'off', 'no lead line: never by itself');
  assert.ok(!cold.btn.hidden && cold.btn.kids[0].hidden === false, 'the button and its bubble');
  cold.h.close();
  const chose = await auto({ permission: async () => 'prompt', store: memStore('on') });
  await chose.frame(3);
  assert.equal(chose.h.camera, 'on', 'he switched it on before: his choice stands');
  chose.h.close();
}));

test('denied by the browser: no 结印 at all, nothing drawn; refused at the ask: gone, and remembered as off', async () => withFetch(async () => {
  const { h, host } = await auto({ permission: async () => 'denied' });
  assert.equal(h, null);
  assert.equal(host.appended.length, 0, 'the game as without a camera');
  const { host: h2, frame } = page(), store = memStore();
  await offerSeals({ host: h2, moves: ['feijian'], available: async () => true, permission: async () => 'granted', store, state: () => BOSS,
    eyeOf: () => ({ start: async () => { throw Object.assign(new Error('denied'), { reason: 'denied' }); }, pause() {}, close() {}, setFps() {} }) });
  await frame(3);
  assert.ok(h2.appended[0].removed && h2.appended[1].removed, 'the corner goes');
  assert.equal(store.v, 'off', 'never asked by itself again');
  const { host: h3, frame: f3 } = page(), s3 = memStore();
  await offerSeals({ host: h3, moves: ['feijian'], available: async () => true, permission: async () => 'granted', store: s3, state: () => BOSS,
    eyeOf: () => ({ start: async () => { throw Object.assign(new Error('model'), { reason: 'model' }); }, pause() {}, close() {}, setFps() {} }) });
  await f3(3);
  assert.equal(s3.v, null, 'a failed model is not his choice');
}));

test('switched off (the ×, kept): never by itself, the button the way back on — which is kept too; the lead card says it is off', async () => withFetch(async () => {
  const store = memStore();
  const a = await auto({ permission: async () => 'granted', store });
  await a.frame(3);
  assert.equal(a.h.camera, 'on');
  a.dock.querySelector('.jyh-off').fire('click');
  await a.frame(2);
  assert.equal(a.h.camera, 'off');
  assert.equal(store.v, 'off');
  assert.ok(!a.btn.hidden && a.btn.classList.contains('is-off'), 'the button stands, dim: the switch back on');
  a.h.close();
  const b = await auto({ permission: async () => 'granted', store });
  await b.frame(3);
  assert.equal(b.h.camera, 'off', 'the next level: still off');
  assert.equal(b.h.lead('boss'), leadLine(kit, 'off', 'zh'), 'the lead card: off, and how to switch it on');
  assert.match(b.h.lead('boss'), /结印按钮/);
  b.btn.fire('click');
  await b.frame(2);
  assert.equal(b.h.camera, 'on');
  assert.equal(store.v, 'on', 'back on, kept');
  assert.ok(b.h.auto);
  b.h.close();
}));

test('never under the host\'s pause (its lead card): the dock waits, then opens; off on pause, a hidden page and close; resting reads slow', async () => withFetch(async () => {
  let still = true, st = BOSS;
  const { h, frame, eye, btn, dock, host } = await auto({ permission: async () => 'granted', paused: () => still, st: () => st });
  const doc = host.ownerDocument;
  await frame(4);
  assert.equal(h.camera, 'off', 'under the card: no camera');
  assert.ok(btn.hidden && dock.hidden);
  still = false;
  await frame(2);
  assert.equal(h.camera, 'on', 'the card gone: open');
  st = { on: true, ready: false, cool: 4, coolOf: 6 };
  await frame(1);
  assert.equal(eye.log.at(-1), `fps ${kit.eye.restFps}`, 'resting: the model at a crawl');
  assert.ok(btn.classList.contains('is-cam') && !btn.hidden, 'the light on the button while the frame rests');
  st = BOSS;
  await frame(1);
  still = true;
  await frame(1);
  assert.ok(eye.log.slice(-2).includes('pause') && h.camera === 'off', 'paused: the camera off');
  still = false;
  await frame(2);
  assert.equal(h.camera, 'on', 'back');
  doc.hidden = true;
  await frame(1);
  assert.equal(h.camera, 'off', 'a hidden page: off');
  doc.hidden = false;
  await frame(2);
  assert.equal(h.camera, 'on', 'seen again: on');
  h.close();
  assert.equal(eye.log.at(-1), 'close', 'the level over: the camera closed');
}));

test('the switch on this device: localStorage, a store that throws changes nothing', async () => {
  const { choiceStore, permissionOf } = await import('../scripts/games/jieyin/helper.js');
  const mem = {};
  const ok = choiceStore({ localStorage: { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } } });
  assert.equal(ok.get(), null);
  ok.set('off');
  assert.equal(ok.get(), 'off');
  const bad = choiceStore({ get localStorage() { throw new Error('blocked'); } });
  assert.equal(bad.get(), null);
  assert.doesNotThrow(() => bad.set('on'));
  assert.equal(await permissionOf({ navigator: {} }), 'prompt', 'no Permissions API');
  assert.equal(await permissionOf({ navigator: { permissions: { query: async () => { throw new TypeError('camera'); } } } }), 'prompt', 'WebKit cannot query the camera');
  assert.equal(await permissionOf({ navigator: { permissions: { query: async () => ({ state: 'granted' }) } } }), 'granted');
  assert.equal(await permissionOf({ navigator: { permissions: { query: async () => ({ state: 'denied' }) } } }), 'denied');
});

// Hanli 10-28: 「结手印的框调整一下位置, 不要挡住游戏画面」 — the parts stand in the shell's side (games/shell.js
// `data-shell-side`), never the field; a frame laid again (the story's Look) brings a new side and they move into it.
test('the box stands in the shell\'s side, off the field; a re-laid frame takes it along', async () => withFetch(async () => {
  const { host, frame } = page();
  const slot = (n) => { const s = el('div', host.ownerDocument); s.name = n; s.appended = []; s.append = (...xs) => s.appended.push(...xs); return s; };
  let side = slot('a');
  host.closest = (sel) => (sel === '.gshell' ? { querySelector: (q) => (q.includes('data-shell-side') ? side : null) } : null);
  const h = await offerSeals({ host, moves: ['feijian'], feed: true, available: async () => true, state: () => ({ on: true, ready: true, cool: 0, coolOf: 6 }) });
  await frame(2);
  assert.equal(host.appended.length, 0, 'nothing on the field');
  assert.equal(side.appended.length, 4, 'button, its bubble, the box, the ready card — in the side');
  const first = side;
  side = slot('b');
  await frame(1);
  assert.equal(side.appended.length, 4, 'the new frame\'s side holds them');
  assert.equal(first.appended.length, 4);
  h.close();
}));

test('a cast flown: the box holds in the move\'s light with 「成」, then steps away for the rest', async () => withFetch(async () => {
  const { host, frame } = page();
  let cool = 0;
  const h = await offerSeals({ host, moves: ['feijian'], feed: true, available: async () => true, cast: () => { cool = 10; return true; },
    state: () => ({ on: true, ready: cool <= 0, cool, coolOf: 10 }) });
  await frame(2);
  const dock = host.appended[1];
  assert.equal(dock.hidden, false, 'open at the offer');
  const win = host.ownerDocument.defaultView;
  assert.equal(win.jieyinFeed.cast('feijian'), true, 'the console\'s cast flies');
  await frame(1);
  assert.ok(dock.classList.contains('is-cast'), 'in its light');
  await frame(60); // ~1 s: still held though the rest has begun
  assert.equal(dock.hidden, false, 'held, not gone at once');
  await frame(30); // past the hold (1.3 s)
  assert.equal(dock.hidden, true, 'then away for the rest');
  assert.ok(!dock.classList.contains('is-cast'));
  assert.equal(win.jieyinFeed.cast('feijian'), false, 'resting: nothing flies');
  h.close();
}));

test('the ready card (Hanli 10-28: 「结手印前给一个提示, 让用户准备好」): up between the waves before the 大妖, the camera warm; gone as the wave starts', async () => withFetch(async () => {
  const { host, frame } = page();
  const cam = camLog();
  let st = { on: false, soon: true, ready: false, cool: 0, coolOf: 6 };
  const h = await offerSeals({ host, moves: ['feijian'], available: async () => true, eyeOf: cam.make, permission: async () => 'granted', store: memStore(), state: () => st });
  await frame(2);
  const card = host.appended[2];
  assert.equal(card.hidden, false, 'the card is up');
  assert.match(card.innerHTML, /大妖要来了 · 准备结剑诀/);
  assert.match(card.innerHTML, /剑诀，往摄像头一戳/, 'the move\'s how');
  assert.ok([...'大妖要来了 · 准备结剑诀'.replace(/ /g, '')].length <= 20);
  assert.ok(cam.log.includes('start'), 'a camera that opens by itself opens now: warm for the 大妖');
  assert.equal(card.querySelector('.jyh-soon-on').hidden, true, 'no switch to show: it is on');
  st = { on: true, soon: false, ready: true, cool: 0, coolOf: 6 };
  await frame(2);
  assert.equal(card.hidden, true, 'the 大妖 wave: the card goes, the box opens');
  assert.equal(host.appended[1].hidden, false);
  h.close();
}));

test('the ready card with the camera switched off: its button switches it on now', async () => withFetch(async () => {
  const { host, frame } = page();
  const cam = camLog();
  const h = await offerSeals({ host, moves: ['feijian'], available: async () => true, eyeOf: cam.make, permission: async () => 'granted', store: memStore('off'),
    state: () => ({ on: false, soon: true, ready: false, cool: 0, coolOf: 6 }) });
  await frame(2);
  const card = host.appended[2], on = card.querySelector('.jyh-soon-on');
  assert.equal(card.hidden, false);
  assert.equal(on.hidden, false, 'the switch shows');
  assert.ok(!cam.log.includes('start'), 'off: never by itself');
  on.fire('click');
  await frame(2);
  assert.ok(cam.log.includes('start'), 'tapped: on now');
  assert.equal(on.hidden, true);
  h.close();
}));

// 2026-11-21, Hanli playing on his iPhone: 「目前我玩到的塔防里的结印都是剑印, 我们当时定的是, 剧情里没学结印前用简单的剑印.
// 老师教过其他手印后, 就换着用, 每个手印都在游戏里用到」 — the seal the dock asks for takes turns among what he has learned and the
// board offers (helper.js `askRing`, ONE place); each cast moves it on; before a second seal is his, the sword seal as ever.
const sealIcon = (id) => iconSvg(kit.seals[id], 30, { lang: 'zh' });
const READY = { on: true, ready: true, cool: 0, coolOf: 0 };
/** A dock on the dev feed: `cast(id)` is the console's cast; `asked()` reads what the dock asks for now. */
async function asking({ moves, learned, state = () => READY, onCast = () => true }) {
  const { host, frame } = page(), casts = [];
  const h = await offerSeals({ host, moves, learned, feed: true, available: async () => true, state, cast: (e) => { casts.push(e.move); return onCast(e); } });
  const win = host.ownerDocument.defaultView, [btn, dock, soon] = host.appended;
  const fire = async (id) => { const ok = win.jieyinFeed.cast(id); await frame(1); return ok; };
  return { h, host, frame, btn, dock, soon, casts, win, fire, asked: () => h.asked.move, seal: () => h.asked.seal, icon: () => btn.querySelector('.jyh-icon').innerHTML };
}

test('before a second seal is his (the sword seal alone, nothing learned, no save) the dock asks for the sword seal, as ever', async () => withFetch(async () => {
  for (const learned of [undefined, [], ['feijian'], ['bingzhui']]) { // 'bingzhui': learned but not offered here
    const d = await asking({ moves: ['feijian', 'huodan'], learned });
    assert.deepEqual([d.asked(), d.seal()], ['feijian', 'jian'], `learned ${JSON.stringify(learned)}`);
    assert.equal(d.icon(), sealIcon('jian'));
    await d.fire('feijian');
    assert.equal(d.asked(), 'feijian', 'a cast changes nothing: the set has one');
    d.h.close();
  }
}));

test('飞剑, 火弹, 冰锥 learned and offered: three casts ask three different seals in the kit\'s order, the fourth the first again — on the button, the bubble, the ready card', async () => withFetch(async () => {
  const d = await asking({ moves: ['feijian', 'huodan', 'bingzhui'], learned: ['feijian', 'huodan', 'bingzhui'] });
  const want = [['feijian', 'jian'], ['huodan', 'wu'], ['bingzhui', 'zi']];
  const live = d.dock.kids.find((k) => k.className === 'jyh-callout');
  const asked = [];
  for (let n = 0; n < 4; n += 1) {
    const [move, seal] = want[n % 3];
    assert.deepEqual([d.asked(), d.seal()], [move, seal], `cast ${n}`);
    assert.equal(d.icon(), sealIcon(seal), 'the button wears it');
    assert.match(live.innerHTML, new RegExp(kit.seals[seal].name.zh), 'the live bubble names it');
    assert.equal(d.soon.querySelector('.jyh-soon-name').textContent, kit.seals[seal].name.zh, 'the ready card names it');
    assert.equal(d.soon.querySelector('.jyh-soon-icon').innerHTML, iconSvg(kit.seals[seal], 44, { lang: 'zh' }), 'and draws it');
    asked.push(d.asked());
    await d.fire(d.asked());
  }
  assert.deepEqual(asked, ['feijian', 'huodan', 'bingzhui', 'feijian']);
  assert.deepEqual(d.casts, ['feijian', 'huodan', 'bingzhui', 'feijian']);
  d.h.close();
}));

test('every learned seal is asked for once over as many casts as the set has members (a set of three, and of two)', async () => withFetch(async () => {
  for (const set of [['feijian', 'huodan', 'bingzhui'], ['huodan', 'bingzhui']]) {
    const d = await asking({ moves: ['feijian', 'huodan', 'bingzhui', 'jinren'], learned: set });
    const seen = [];
    for (let n = 0; n < set.length; n += 1) { seen.push(d.asked()); await d.fire(d.asked()); }
    assert.deepEqual(seen, set, 'each member once, in the kit\'s order');
    assert.equal(d.asked(), set[0], 'round and round');
    d.h.close();
  }
}));

test('a learned seal the board does not offer is never asked for; an offered one not learned is never asked for, yet it casts if made', async () => withFetch(async () => {
  const d = await asking({ moves: ['feijian', 'huodan', 'bingzhui'], learned: ['feijian', 'bingzhui', 'jinren', 'tuqiang'] }); // 金刃, 土墙: learned, not offered here
  const seen = [];
  for (let n = 0; n < 4; n += 1) { seen.push(d.asked()); await d.fire(d.asked()); }
  assert.deepEqual(seen, ['feijian', 'bingzhui', 'feijian', 'bingzhui'], '火弹 is offered, not learned: skipped');
  const before = d.casts.length;
  assert.equal(await d.fire('huodan'), true, 'made, offered: it flies');
  assert.equal(d.casts.length, before + 1);
  assert.equal(await d.fire('jinren'), false, 'not offered: dropped');
  assert.ok(!['jinren', 'tuqiang', 'huodan'].includes(d.asked()));
  d.h.close();
}));

test('the order is the host\'s (the kit\'s own), not the order he learned them; the 大招 is never one of the turns', async () => withFetch(async () => {
  const d = await asking({ moves: ['feijian', 'bingzhui', 'huodan', 'huodan4'], learned: ['huodan', 'huodan4', 'bingzhui', 'feijian'] });
  const seen = [];
  for (let n = 0; n < 3; n += 1) { seen.push(d.asked()); await d.fire(d.asked()); }
  assert.deepEqual(seen, ['feijian', 'bingzhui', 'huodan']);
  d.h.close();
}));

test('the stall tracker and the hint follow the asked seal: a hand held 4 s on a hand-sized frame is reported against it', async () => withFetch(async () => {
  const lines = [], real = console.info;
  console.info = (tag, line) => { if (tag === '[seal-stall]') lines.push(JSON.parse(line)); };
  try {
    const d = await asking({ moves: ['feijian', 'huodan'], learned: ['feijian', 'huodan'] });
    const hand = Array.from({ length: 21 }, (_, i) => ({ x: 0.4 + (i % 5) * 0.02, y: 0.4 + Math.floor(i / 5) * 0.03, z: 0 }));
    const hold = async () => { for (let t = 0; t < 280; t += 1) { d.win.jieyinFeed([hand]); await d.frame(1); } };
    await hold();
    assert.equal(lines.at(-1)?.want, 'jian', 'the first turn: the sword seal');
    await d.fire('feijian');
    await d.frame(100); // past the hold
    await hold();
    assert.equal(lines.at(-1)?.want, 'wu', 'the next turn: 午文, the 火弹\'s');
    d.h.close();
  } finally { console.info = real; }
}));

test('the dock has ONE place that says which seal is asked for: only askRing, askBase (and progressOf, which reads the hands) touch a move\'s shape or 文', () => {
  const src = readFileSync(new URL('../scripts/games/jieyin/helper.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const owner = (at) => [...src.slice(0, at).matchAll(/\nexport (?:async )?(?:function|const) (\w+)/g)].at(-1)?.[1];
  const readers = new Set([...src.matchAll(/\.shape\b|\.wen\b/g)].map((m) => owner(m.index)));
  assert.deepEqual([...readers].sort(), ['askBase', 'askRing', 'progressOf'], 'a second derivation of the asked seal crept in');
  assert.ok(!/\bshape\b/.test(src.slice(src.indexOf('export async function offerSeals'))), 'offerSeals asks `asked()`, never a shape of its own');
});

test('a host may hand its rows whole (守山门): the book\'s ids are matched against the rows, then read as 手势斗法 ids', async () => withFetch(async () => {
  const rows = [{ id: 'feijian' }, { id: 'huodan', jieyin: 'huodan' }, { id: 'bingzhui' }];
  const d = await asking({ moves: rows, learned: ['bingzhui', 'huodan'] });
  assert.equal(d.asked(), 'huodan');
  await d.fire('huodan');
  assert.equal(d.asked(), 'bingzhui');
  d.h.close();
}));
