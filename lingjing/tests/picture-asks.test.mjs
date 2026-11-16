// A picture that is not there is asked for once, then after a pause that grows (picture-asks.js): the ledger, the
// HTML guard that takes the src off an <img> inside its pause, and the hook that puts the guard in front of innerHTML.
import test from 'node:test';
import assert from 'node:assert/strict';
import { askLedger, guardImgHtml, hookHtml, pictureKey } from '../scripts/picture-asks.js';

const BASE = 'http://h/apps/lingjing/index.html';
const clock = (t = 0) => ({ now: () => t, set: (v) => { t = v; } });

test('a failed picture waits 15 s, then 30, 60, 120, and stays at 120', () => {
  const c = clock(), l = askLedger({ now: c.now });
  const k = pictureKey('worlds/a.webp', BASE);
  assert.equal(l.state(k), 'unknown');
  const waits = [];
  for (let i = 0; i < 6; i += 1) { l.failed(k); waits.push(l.retryIn(k)); c.set(c.now() + l.retryIn(k)); assert.equal(l.state(k), 'unknown'); }
  assert.deepEqual(waits, [15000, 30000, 60000, 120000, 120000, 120000]);
});

test('inside the pause it is "failed" (do not ask); after it, "unknown" (ask again)', () => {
  const c = clock(), l = askLedger({ now: c.now });
  l.failed('k');
  c.set(14999); assert.equal(l.state('k'), 'failed');
  c.set(15000); assert.equal(l.state('k'), 'unknown');
});

test('a miss inside the pause does not lengthen it (two <img> of one picture in one draw)', () => {
  const c = clock(), l = askLedger({ now: c.now });
  l.failed('k'); l.failed('k'); l.failed('k');
  assert.equal(l.misses('k'), 1); assert.equal(l.retryIn('k'), 15000);
  c.set(15000); l.failed('k');
  assert.equal(l.misses('k'), 2); assert.equal(l.retryIn('k'), 30000);
});

test('a picture that loads is "ok" and forgets its failures; one that fails again is no longer ok', () => {
  const c = clock(), l = askLedger({ now: c.now });
  l.failed('k'); l.failed('k');
  l.loaded('k');
  assert.equal(l.state('k'), 'ok'); assert.equal(l.misses('k'), 0); assert.equal(l.any, false);
  l.failed('k');
  assert.equal(l.state('k'), 'failed'); assert.equal(l.retryIn('k'), 15000);
});

test('the key is the absolute url without its hash', () => {
  assert.equal(pictureKey('../worlds/a.webp#x', BASE), 'http://h/apps/worlds/a.webp');
  assert.equal(pictureKey('/x/y.webp', BASE), 'http://h/x/y.webp');
});

test('guardImgHtml takes the src off an <img> whose picture is in its pause, and only that one', () => {
  const l = askLedger({ now: () => 0 });
  const html = '<div><img class="a" src="art/cards/x.webp" alt=""><img src="art/cards/y.webp" alt="y"></div>';
  assert.equal(guardImgHtml(html, l, BASE), html); // nothing failed: the same string
  l.failed(pictureKey('art/cards/x.webp', BASE));
  const out = guardImgHtml(html, l, BASE);
  assert.equal(out, '<div><img class="a" data-pic-missing="art/cards/x.webp" alt=""><img src="art/cards/y.webp" alt="y"></div>');
});

test('guardImgHtml reads escaped and single-quoted srcs, leaves data: urls, and asks again after the pause', () => {
  let t = 0;
  const l = askLedger({ now: () => t });
  l.failed(pictureKey('a.webp?x=1&y=2', BASE));
  assert.match(guardImgHtml('<img src="a.webp?x=1&amp;y=2">', l, BASE), /^<img data-pic-missing=/);
  assert.match(guardImgHtml("<img alt='' src='a.webp?x=1&y=2'>", l, BASE), /data-pic-missing/);
  const d = '<img src="data:image/gif;base64,AAAA">';
  assert.equal(guardImgHtml(d, l, BASE), d);
  t = 15000;
  assert.equal(guardImgHtml('<img src="a.webp?x=1&amp;y=2">', l, BASE), '<img src="a.webp?x=1&amp;y=2">');
});

test('hookHtml puts the guard in front of innerHTML and insertAdjacentHTML, once', () => {
  class El {
    #h = '';
    get innerHTML() { return this.#h; }
    set innerHTML(v) { this.#h = v; }
    insertAdjacentHTML(where, v) { this.#h += v; }
  }
  const l = askLedger({ now: () => 0 });
  l.failed(pictureKey('m.webp', BASE));
  assert.equal(hookHtml(El.prototype, l, () => BASE), true);
  assert.equal(hookHtml(El.prototype, l, () => BASE), false);
  const e = new El();
  e.innerHTML = '<img src="m.webp"><img src="n.webp">';
  assert.equal(e.innerHTML, '<img data-pic-missing="m.webp"><img src="n.webp">');
  e.insertAdjacentHTML('beforeend', '<img src="m.webp">');
  assert.equal(e.innerHTML, '<img data-pic-missing="m.webp"><img src="n.webp"><img data-pic-missing="m.webp">');
});

test('hookHtml hands a write the guard changed to onWrite (and only that), with the stand-in in the HTML', () => {
  class El {
    #h = '';
    get innerHTML() { return this.#h; }
    set innerHTML(v) { this.#h = v; }
    insertAdjacentHTML(where, v) { this.#h += v; }
  }
  const l = askLedger({ now: () => 0 });
  l.failed(pictureKey('m.webp', BASE));
  const written = [];
  hookHtml(El.prototype, l, () => BASE, { standIn: () => ' src="fox.webp"', onWrite: (el) => written.push(el.innerHTML) });
  const e = new El();
  e.innerHTML = '<img src="n.webp">';
  assert.deepEqual(written, []);
  e.innerHTML = '<img src="m.webp">';
  assert.deepEqual(written, ['<img data-pic-missing="m.webp" src="fox.webp">']);
});

test('the ledger says when the last step of the pause is reached', () => {
  let t = 0; const l = askLedger({ now: () => t });
  const steps = [];
  for (let i = 0; i < 5; i += 1) { l.failed('k'); steps.push(l.atCap('k')); t += l.retryIn('k'); }
  assert.deepEqual(steps, [false, false, false, true, true]);
});
