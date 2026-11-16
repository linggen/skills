// A board's picture that is not there, on the phone's board page (scripts/games/phone/pictures.js): the page installs the
// Mac page's guard and stand-in (imported), the kit ships the modules and Yinyue's two pictures, and a failed picture gets
// the stand-in and keeps data-pic-missing (what the play bot reads).
import test from 'node:test';
import assert from 'node:assert/strict';
import { kitPacks } from '../tools/phone-board.mjs';
import { installPictures } from '../scripts/games/phone/pictures.js';

class Img {
  constructor(src, w, h) { this.tagName = 'IMG'; this.attrs = new Map([['src', src]]); this.currentSrc = new URL(src, 'http://127.0.0.1:9/scripts/games/phone/index.html').href; this.isConnected = true; this.rect = { width: w, height: h }; }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  hasAttribute(n) { return this.attrs.has(n); }
  getBoundingClientRect() { return this.rect; }
  after(n) { this.beside = n; }
  get offsetLeft() { return 0; } get offsetTop() { return 0; } get offsetWidth() { return this.rect.width; } get offsetHeight() { return this.rect.height; }
}
const page = (lang) => {
  const heard = {};
  const doc = { baseURI: 'http://127.0.0.1:9/scripts/games/phone/index.html', addEventListener: (n, f) => { heard[n] = f; }, createElement: () => ({ style: {}, setAttribute() {}, remove() {} }) };
  installPictures({ doc, root: new URL('http://127.0.0.1:9/'), lang: () => lang, probe: async () => false, timers: { set: () => ({}), clear() {} } });
  return { doc, heard };
};

test('a board picture that fails gets the stand-in, in the board\'s language, and keeps data-pic-missing', () => {
  const { heard } = page('en');
  const img = new Img('../../../worlds/jiuding/art/cards/board-x.webp', 200, 120);
  heard.error({ target: img });
  assert.equal(img.getAttribute('src'), 'http://127.0.0.1:9/worlds/jiuding/art/fallback/yinyue-on-its-way.webp');
  assert.equal(img.getAttribute('data-pic-fb'), 'wait');
  assert.equal(img.getAttribute('data-pic-missing'), '../../../worlds/jiuding/art/cards/board-x.webp');
  assert.equal(img.getAttribute('title'), 'This picture is still on its way.');
  assert.ok(img.beside, 'a 200 x 120 slot gets her line laid over it');
});

test('a small board picture keeps the small picture only; zh is the default language', () => {
  const { heard } = page('zh');
  const img = new Img('../../../worlds/jiuding/art/cards/board-y.webp', 40, 40);
  heard.error({ target: img });
  assert.equal(img.getAttribute('title'), '这张画还在路上，等一等。');
  assert.equal(img.beside, undefined);
});

test('the kit ships the modules the board page imports and Yinyue\'s two pictures, in the common pack', () => {
  const files = new Set(kitPacks().common);
  for (const f of ['scripts/games/phone/pictures.js', 'scripts/picture-asks.js', 'scripts/missing-picture.js',
    'worlds/jiuding/art/fallback/yinyue-on-its-way.webp', 'worlds/jiuding/art/fallback/yinyue-not-found.webp']) assert.ok(files.has(f), `${f} is in the kit`);
});
