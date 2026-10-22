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

test('the button wears the next move\'s gesture; the first time per level a bubble points at it, gone on the tap; a new level shows it again', async () => withFetch(async () => {
  const { host, frame } = page();
  let lv = 'a';
  await offerSeals({ host, moves: ['feijian'], available: async () => true, eyeOf, level: () => lv, state: () => ({ on: true, ready: true, cool: 0, coolOf: 6 }) });
  const [btn] = host.appended, [callout] = btn.kids;
  assert.equal(callout.className, 'jyh-callout', 'the bubble rides on the button (every host, any width)');
  assert.match(btn.innerHTML, /jyh-icon.*<svg class="jy-hand"/s, 'a hand drawn on the button');
  await frame(2);
  assert.equal(callout.hidden, false, 'the bubble points at the button');
  assert.match(callout.innerHTML, /小满.*点这里结印/);
  btn.fire('click');
  assert.equal(callout.hidden, true, 'tapped: gone');
  btn.fire('click'); // off again: the button shows again for this level — no second bubble
  await frame(2);
  assert.equal(callout.hidden, true);
  lv = 'b';
  await frame(2);
  assert.equal(callout.hidden, false, 'the next level: once more');
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
  const h = await offerSeals({ host, moves: sad.levels[0].jieyin.moves, available: async () => true, eyeOf });
  assert.ok(h, 'a handle');
  assert.equal(host.appended[0].className, 'jyh-btn');
  h.close();
  const { offerJieyin } = await import('../scripts/games/sadoushou.js');
  const calls = [];
  let got = null;
  const game = { jieyinState: () => ({ on: true, ready: true }), jieyin: (id, lane) => { calls.push([id, lane]); return true; }, fizzle() {}, paused: () => false, picking: () => false, say() {} };
  await offerJieyin(sad.levels[0], { ownerDocument: { defaultView: globalThis } }, { lang: 'zh', game, load: async () => ({ offerSeals: async (o) => { got = o; return null; } }) });
  got.cast({ type: 'cast', move: 'huodan', lane: 'left' });
  assert.deepEqual(calls, [['huodan', 'left']]);
}));

test('while the host is paused (its lead card, the shell\'s bar) nothing shows and the 大妖\'s call waits; then the button, the call and the bubble', async () => withFetch(async () => {
  const { host, frame } = page();
  let still = true;
  const said = [];
  await offerSeals({ host, moves: ['feijian'], available: async () => true, eyeOf, paused: () => still, call: () => '大妖来了', say: (x) => said.push(x), state: () => ({ on: true, ready: true, cool: 0, coolOf: 6 }) });
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
