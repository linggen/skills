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
  assert.equal(await leadWith('故事。', Promise.resolve(h), 'boss', 'zh'), `故事。　${leadLine(kit, 'rest', 'zh')}`);
  assert.equal(await leadWith('Story.', Promise.resolve({ lead: (p) => leadLine(kit, p, 'en') }), 'waves', 'en'), `Story. ${leadLine(kit, 'intense', 'en')}`);
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
