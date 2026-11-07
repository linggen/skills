// The phone's 斗法 room, as Hanli saw it on an iPhone 15 Pro (11-07, a 降妖 against 当康 at 后山): the 杀招's ink under the
// 丹 row, 收起 dark brown on dark brown in a dark phone, a near-black page before the room drew, and the hand's art
// blanked on every redraw. What each fix holds, read off the sheets and the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../scripts/battle.css'), danang = read('../scripts/danang.css'), kapai = read('../scripts/games/kapai.js');
const page = read('../scripts/games/phone/index.html');
const zOf = (sheet, sel) => Number(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*z-index:\\s*(\\d+)`).exec(sheet)?.[1]);

test('the 杀招\'s ink covers the whole room: over the 丹囊 (its tray, the open bag) and a held card', () => {
  const ink = zOf(css, '.bsplash {'.slice(0, -2));
  assert.ok(ink > 0);
  for (const [sheet, sel] of [[danang, '.dn-tray'], [css, '.bpouch.open'], [css, '.bcard.held'], [css, '.bdock']]) {
    const z = zOf(sheet, sel);
    assert.ok(Number.isFinite(z), sel);
    assert.ok(ink > z, `${sel} (${z}) over the ink (${ink})`);
  }
});

/* WCAG relative luminance of #rrggbb. */
const lum = (hex) => { const c = [0, 2, 4].map((i) => parseInt(hex.slice(i + 1, i + 3), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const varOf = (name) => new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)[1];

test('收起 and the loss\'s way are the room\'s paper and ink in any phone scheme, at least WCAG AA', () => {
  const rule = (sel) => [...css.matchAll(new RegExp(`(?:^|\\n)\\.battle \\.bclose \\.${sel} \\{([^}]*)\\}`, 'g'))].at(-1)?.[1] ?? '';
  const shut = rule('closeshut'), way = rule('closeway');
  assert.match(shut, /background: var\(--paper-2\)/);
  assert.match(shut, /color: var\(--ink\)/);
  assert.match(way, /background: var\(--paper\)/);
  assert.match(way, /color: var\(--cinnabar\)/);
  assert.ok(ratio(varOf('ink'), varOf('paper-2')) >= 4.5, 'closeshut');
  assert.ok(ratio(varOf('cinnabar'), varOf('paper')) >= 4.5, 'closeway');
});

test('the phone\'s page lays 斗法\'s paper before any script or sheet: the board from the app\'s ?board=, never the host\'s black', () => {
  const head = page.slice(0, page.indexOf('</head>'));
  const early = head.indexOf("get('board')"), sheet = head.indexOf('<style>');
  assert.ok(early > 0 && early < sheet, 'the board is known before the sheet');
  assert.match(head, /html\[data-board=kapai\], html\[data-board=kapai\] body \{ background: #F3EEE2; \}/);
  // …after the dark-scheme ground, which it overrides
  assert.ok(head.indexOf('html[data-board=kapai], html[data-board=kapai] body') > head.indexOf('html.is-dom, html.is-dom body { background: var(--ground); }'));
});

test('a redraw keeps the pictures the room already shows (the hand\'s art never blanks)', () => {
  assert.match(kapai, /export function keepPictures\(host, html\)/);
  assert.match(kapai, /const draw = \(\) => \{ if \(done\) return; keepPictures\(host, battleHtml\(/);
  assert.match(kapai, /img\.replaceWith\(old\)/);
});
