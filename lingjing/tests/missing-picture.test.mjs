// A picture that is not there shows Yinyue small, with a short line (missing-picture.js): which of her two states, the
// size rule, her words, the picture arriving later, a stand-in that fails itself, and the play bot still seeing the hole.
import test from 'node:test';
import assert from 'node:assert/strict';
import { askLedger, guardImgHtml, pictureKey, watchPictures } from '../scripts/picture-asks.js';
import { BIG_SIDE, BLANK, FALLBACK, engineFailsAll, lineOf, missingPictures, picState, showsCaption, standInAttrs } from '../scripts/missing-picture.js';
import { WORDS } from '../scripts/cards.js';

const BASE = 'http://h/apps/lingjing/scripts/index.html';
const REAL = '../worlds/jiuding/art/cards/x.webp';
const KEY = pictureKey(REAL, BASE);
const urlOf = (f) => `../worlds/jiuding/${f}`;

/* A page's pieces, just enough of them: elements with attributes, a size, a sibling to land beside; timers by hand. */
class El {
  constructor(tag = 'img') { this.tagName = tag.toUpperCase(); this.attrs = new Map(); this.isConnected = true; this.style = {}; this.children = []; this.className = ''; this.rect = { width: 0, height: 0 }; }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  hasAttribute(n) { return this.attrs.has(n); }
  getBoundingClientRect() { return this.rect; }
  get offsetLeft() { return 5; } get offsetTop() { return 7; } get offsetWidth() { return this.rect.width; } get offsetHeight() { return this.rect.height; }
  after(n) { this.beside = n; }
  remove() { this.removed = true; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); }
  appendChild(c) { c.parentNode = this; this.children.push(c); }
  querySelector(sel) { return this.children.find((c) => `.${c.className}` === sel) ?? null; }
}
const img = (src, w, h) => { const e = new El(); e.setAttribute('src', src); e.rect = { width: w, height: h }; return e; };

function rig({ probeAnswers = [], report = null } = {}) {
  let t = 0;
  const ledger = askLedger({ now: () => t });
  const timers = []; const asked = [];
  const env = {
    ledger, doc: { createElement: (tag) => new El(tag) }, base: () => BASE, urlOf, words: () => WORDS.zh,
    // like whenPicture: the answer goes into the ledger
    probe: async (src) => { asked.push(src); const there = probeAnswers.length ? probeAnswers.shift() : false; if (there) ledger.loaded(pictureKey(src, BASE)); else ledger.failed(pictureKey(src, BASE)); return there; },
    report: report ? async () => report : undefined, now: () => t,
    timers: { set: (fn, ms) => { const h = { fn, ms }; timers.push(h); return h; }, clear: (h) => { if (h) h.dead = true; } },
  };
  const m = missingPictures(env);
  return { ledger, m, timers, asked, clock: (v) => { t = v; },
    async tick() { const h = timers.filter((x) => !x.dead).pop(); h.dead = true; await h.fn(); } };
}

test('the two states: on its way while the back-off runs, not found once its last step is reached', () => {
  assert.equal(picState(askLedger(), KEY), 'wait');
  let t = 0; const c = askLedger({ now: () => t }); const seen = [];
  for (let i = 0; i < 5; i += 1) { c.failed(KEY); seen.push(picState(c, KEY)); t += c.retryIn(KEY); }
  assert.deepEqual(seen, ['wait', 'wait', 'wait', 'lost', 'lost']); // 15 s, 30, 60, then the 120 s cap
  assert.equal(picState(askLedger(), KEY, true), 'lost'); // the engine says it is failing
});

test('the last step comes from the ledger\'s own steps, not a count of four', () => {
  let t = 0; const l = askLedger({ now: () => t, firstMs: 1000, capMs: 2000 });
  l.failed('k'); assert.equal(l.atCap('k'), false); t += 1000; l.failed('k'); assert.equal(l.atCap('k'), true);
  assert.equal(l.atCap('never'), false);
});

test('the engine: only when everything still to come is failing', () => {
  const pack = (files, held, failing) => ({ pack: 'p', files, held_files: held, failing });
  assert.equal(engineFailsAll({ packs: [pack(10, 4, 6)] }), true);
  assert.equal(engineFailsAll({ packs: [pack(10, 4, 5)] }), false); // one of them is only waiting its turn
  assert.equal(engineFailsAll({ packs: [pack(10, 10, 0), pack(5, 0, 5)] }), true);
  assert.equal(engineFailsAll({ packs: [pack(10, 10, 0)] }), false); // nothing left to come
  assert.equal(engineFailsAll(null), false);
  assert.equal(engineFailsAll({}), false);
});

test('the size rule: picture and line from 96 px on the short side, the picture alone below', () => {
  assert.equal(BIG_SIDE, 96);
  assert.equal(showsCaption(96, 400), true);
  assert.equal(showsCaption(400, 96), true);
  assert.equal(showsCaption(95, 400), false);
  assert.equal(showsCaption(400, 60), false);
  assert.equal(showsCaption(0, 0), false);
  assert.equal(showsCaption(undefined, 200), false);
});

test('her words, in both languages, are the ones in the game\'s string table', () => {
  assert.equal(lineOf('wait', WORDS.zh), '这张画还在路上，等一等。');
  assert.equal(lineOf('lost', WORDS.zh), '这张画我没找到。');
  assert.equal(lineOf('wait', WORDS.en), 'This picture is still on its way.');
  assert.equal(lineOf('lost', WORDS.en), 'I could not find this picture.');
  assert.equal(lineOf('wait', {}), '');
});

test('the two stand-ins are named as page art (art-packs.mjs puts them in the package)', () => {
  assert.deepEqual(Object.values(FALLBACK), ['art/fallback/yinyue-on-its-way.webp', 'art/fallback/yinyue-not-found.webp']);
});

test('a failed <img> in a big slot: the stand-in takes its place, the line lies over it, the real src is kept for the bot', () => {
  const r = rig(); const e = img(REAL, 200, 300);
  r.ledger.failed(KEY); r.m.onMiss(e);
  assert.equal(e.getAttribute('src'), urlOf(FALLBACK.wait));
  assert.equal(e.getAttribute('data-pic-fb'), 'wait');
  assert.equal(e.getAttribute('data-pic-missing'), REAL); // what the play bot reads: the hole is still there
  assert.equal(e.getAttribute('title'), '这张画还在路上，等一等。');
  assert.equal(e.getAttribute('aria-label'), '这张画还在路上，等一等。');
  assert.equal(e.beside.textContent, '这张画还在路上，等一等。');
  assert.deepEqual([e.beside.style.left, e.beside.style.width, e.beside.style.height], ['5px', '200px', '300px']);
});

test('a failed <img> in a small slot: the small picture only, the line as its title', () => {
  const r = rig(); const e = img(REAL, 60, 80);
  r.ledger.failed(KEY); r.m.onMiss(e);
  assert.equal(e.getAttribute('src'), urlOf(FALLBACK.wait));
  assert.equal(e.getAttribute('title'), '这张画还在路上，等一等。');
  assert.equal(e.beside, undefined);
});

test('a picture that keeps failing turns to the standing Yinyue and her other line', async () => {
  const r = rig(); const e = img(REAL, 200, 300);
  r.ledger.failed(KEY); r.m.onMiss(e);
  let t = 0;
  for (let i = 0; i < 3; i += 1) { t += r.ledger.retryIn(KEY); r.clock(t); await r.tick(); assert.equal(e.getAttribute('data-pic-fb'), i < 2 ? 'wait' : 'lost'); }
  assert.equal(e.getAttribute('src'), urlOf(FALLBACK.lost));
  assert.equal(e.getAttribute('title'), '这张画我没找到。');
  assert.equal(e.beside.textContent, '这张画我没找到。');
  assert.equal(e.getAttribute('data-pic-missing'), REAL);
});

test('the engine\'s word counts: a failing pack makes it "not found" at once', async () => {
  const r = rig({ report: { packs: [{ files: 3, held_files: 0, failing: 3 }] } });
  const first = img(REAL, 200, 200);
  r.ledger.failed(KEY); r.m.onMiss(first); // asks the engine (answer comes after)
  await Promise.resolve(); await Promise.resolve();
  const second = img(REAL, 200, 200);
  r.m.onMiss(second);
  assert.equal(second.getAttribute('data-pic-fb'), 'lost');
});

test('the picture that arrives later replaces the stand-in, without a reload', async () => {
  const r = rig({ probeAnswers: [false, true] }); const e = img(REAL, 200, 300);
  r.ledger.failed(KEY); r.m.onMiss(e);
  assert.equal(r.timers.at(-1).ms, 15000 + 250); // asks again when the ledger's pause is over
  r.clock(15000); await r.tick(); // still not there: a second wait, the ledger's next step
  assert.equal(e.getAttribute('src'), urlOf(FALLBACK.wait));
  assert.equal(e.getAttribute('data-pic-missing'), REAL);
  r.clock(15000 + 30000); await r.tick(); // there now
  assert.deepEqual(r.asked, [REAL, REAL]);
  assert.equal(e.getAttribute('src'), REAL);
  for (const a of ['data-pic-missing', 'data-pic-fb', 'title', 'aria-label', 'data-pic-panel']) assert.equal(e.hasAttribute(a), false, a);
  assert.equal(e.beside.removed, true);
});

test('an element that left the page is let go, not asked for', async () => {
  const r = rig(); const e = img(REAL, 200, 300);
  r.ledger.failed(KEY); r.m.onMiss(e);
  e.isConnected = false;
  await r.tick();
  assert.deepEqual(r.asked, []);
});

test('a stand-in that fails itself does not recurse: the line alone on a tinted panel', () => {
  const r = rig(); const e = img(REAL, 200, 300);
  r.ledger.failed(KEY); r.m.onMiss(e); // stand-in on
  r.m.onMiss(e); // ... and the stand-in did not load either
  assert.equal(e.getAttribute('src'), BLANK);
  assert.equal(e.hasAttribute('data-pic-panel'), true);
  assert.equal(e.getAttribute('data-pic-fb'), 'wait'); // still marked as a stand-in: the guard never takes it for a picture of the game
  assert.equal(e.beside.textContent, '这张画还在路上，等一等。');
  assert.equal(e.getAttribute('data-pic-missing'), REAL);
});

test('watchPictures: a stand-in\'s own error never enters the ledger; a game picture\'s does, and is handed on', () => {
  const heard = {}; const doc = { baseURI: BASE, addEventListener: (n, f) => { heard[n] = f; } };
  const seen = [];
  watchPictures(doc, { onMiss: (i) => seen.push(i) });
  const fb = img(urlOf(FALLBACK.wait), 100, 100); fb.setAttribute('data-pic-fb', 'wait'); fb.currentSrc = fb.getAttribute('src');
  heard.error({ target: fb });
  const real = img(REAL, 100, 100); real.currentSrc = new URL(REAL, BASE).href;
  heard.error({ target: real });
  assert.equal(seen.length, 2);
  // (the page's own ledger is the module's; here only that the fallback went nowhere near a failure of the game's: )
  assert.equal(doc.__picturesWatched, true);
});

test('a template written while the picture is in its pause carries the stand-in, and the guard leaves a stand-in alone', () => {
  const r = rig();
  r.ledger.failed(KEY);
  const html = `<button><img class="c" title="old" src="${REAL}" alt="x"></button>`;
  const out = guardImgHtml(html, r.ledger, BASE, r.m.standIn);
  assert.ok(out.includes(`data-pic-missing="${REAL}"`));
  assert.ok(out.includes(`src="${urlOf(FALLBACK.wait)}"`) && out.includes('data-pic-fb="wait"'));
  assert.ok(out.includes('title="这张画还在路上，等一等。"') && !out.includes('title="old"'));
  assert.ok(!out.includes(`src="${REAL}"`));
  assert.equal(guardImgHtml(out, r.ledger, BASE, r.m.standIn), out); // written again: unchanged, no stand-in of a stand-in
  r.ledger.failed(pictureKey(urlOf(FALLBACK.wait), BASE)); // even if the stand-in's own url were in the ledger
  assert.equal(guardImgHtml(out, r.ledger, BASE, r.m.standIn), out);
  assert.equal(standInAttrs('lost', 'a"b', 'u.webp'), ' src="u.webp" data-pic-fb="lost" title="a&quot;b" aria-label="a&quot;b"');
});

test('after such a write the stand-ins in the element get their caption by size', () => {
  const r = rig(); const root = new El('div'); const big = img(urlOf(FALLBACK.wait), 150, 150); const small = img(urlOf(FALLBACK.wait), 40, 40);
  big.setAttribute('data-pic-fb', 'wait'); big.setAttribute('data-pic-missing', REAL);
  small.setAttribute('data-pic-fb', 'wait'); small.setAttribute('data-pic-missing', REAL);
  root.querySelectorAll = () => [big, small];
  r.m.onWrite(root);
  assert.equal(big.beside?.textContent, '这张画还在路上，等一等。');
  assert.equal(small.beside, undefined);
});

test('a missing stage painting says it once, small, in a corner, and takes it back when the picture is there', () => {
  const r = rig(); const view = new El('div'); const bd = new El('div'); view.appendChild(bd);
  r.ledger.failed(KEY);
  r.m.note(bd, REAL); r.m.note(bd, REAL);
  assert.equal(view.children.filter((c) => c.className === 'pic-corner').length, 1);
  assert.equal(view.children[1].textContent, '这张画还在路上，等一等。');
  let t = 0; for (let i = 0; i < 3; i += 1) { t += r.ledger.retryIn(KEY); r.clock(t); r.ledger.failed(KEY); }
  r.m.note(bd, REAL);
  assert.equal(view.children[1].textContent, '这张画我没找到。');
  r.m.note(bd, null);
  assert.equal(view.children.some((c) => c.className === 'pic-corner'), false);
});

test('an engine with no report for the skill (404, down) is asked once, not again', async () => {
  let asked = 0, t = 0;
  const ledger = askLedger({ now: () => t });
  const m = missingPictures({ ledger, doc: { createElement: (tag) => new El(tag) }, base: () => BASE, urlOf, words: () => WORDS.zh, probe: async () => false,
    report: async () => { asked += 1; return null; }, now: () => t, timers: { set: () => ({}), clear: () => {} } });
  ledger.failed(KEY); m.onMiss(img(REAL, 50, 50));
  await Promise.resolve(); await Promise.resolve();
  t = 60000; m.onMiss(img(REAL, 50, 50)); t = 120000; m.onMiss(img(REAL, 50, 50));
  assert.equal(asked, 1);
});
