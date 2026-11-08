import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('on narrow screens the empty bag hint follows the grid in normal flow', () => {
  const css = read('../scripts/lingjing.css');
  assert.match(css, /\.pdetail\.empty\s*\{\s*position:\s*static;/);
  const pouch = read('../scripts/pouch.js');
  assert.match(pouch, /\$\{grid\}\$\{g\.bag\.length \? detailHtml/);
  assert.match(css, /#tray \.allchip \{ flex: none; order: -1; align-self: center; white-space: nowrap; position: static; \}/);
  assert.doesNotMatch(css, /#tray \.allchip[^{]*\{[^}]*position: sticky/);
});

test('the tray reserves a bottom lane for the sticky all chip at every width', () => {
  const css = read('../scripts/lingjing.css');
});

test('opening and closing the bag during a fight leaves the same fight intact', () => {
  const page = read('../scripts/lingjing.js');
  const start = page.indexOf('function drawPouch()');
  const end = page.indexOf('\n/* 开炉', start);
  assert.ok(start >= 0 && end > start);
  const el = { hidden: true, innerHTML: '' };
  const fight = { id: 'same-fight', hand: [1, 2] };
  const classes = new Set();
  const ctx = { view: { gearOpen: true, gear: null }, bout: fight, $: () => el,
    document: { body: { classList: { add: (name) => classes.add(name) } } },
    ftKailu: { stop() {} }, pouchHtml: () => 'bag', ctx: () => ({}),
    artBase: () => '', cardCatalog: () => [], drawnPouch: null };
  vm.runInNewContext(`${page.slice(start, end)}; drawPouch();`, ctx);
  assert.equal(el.hidden, false);
  assert.equal(el.innerHTML, 'bag');
  assert.ok(classes.has('reading'));
  ctx.view.gearOpen = false;
  vm.runInNewContext('drawPouch()', ctx);
  assert.equal(el.hidden, true);
  assert.equal(ctx.bout, fight);
  assert.deepEqual(fight.hand, [1, 2]);
  assert.match(page, /\['\[data-pouch-close\]', \(\) => show\(\{ gearOpen: false, pouchToss: null \}\)\]/);
  assert.match(read('../scripts/battle.css'), /\.dn-tray/);
});
