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

// Seen at 840 px (2026-11-12): the away 闭关's note 「你下线这段时间自行闭关 180 分钟，体力 +90」 is a `.donote` put in the
// tray's row; `.donote` had no width and the row is a nowrap flex, so it shrank to 57 px — one character a line, 248 px tall.
// Every direct child of the row keeps a readable width and the row scrolls sideways, as for the cards.
test('the tray row never squeezes a child: the note keeps a width like a card, at every window width', () => {
  const css = read('../scripts/lingjing.css');
  const rule = (sel) => css.match(new RegExp(`^\\s*${sel.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
  assert.match(rule('#tray'), /flex-wrap: nowrap;[^}]*overflow-x: auto/, 'a row that scrolls sideways');
  for (const sel of ['#tray .card', '#tray .donote', '#tray .allchip', '.awaychip']) assert.match(rule(sel), /flex: (0 0 auto|none)/, `${sel} does not shrink`);
  assert.match(rule('#tray .donote'), /width: 220px/, 'as wide as a card');
  assert.match(css, /#tray \.card \{ width: 190px; \}\s*#tray \.donote \{ width: 190px; \}/, 'and as narrow as one on a phone');
  // The note is drawn into the row beside the cards (lingjing.js render), so the rule above is the one that holds it.
  assert.match(read('../scripts/lingjing.js'), /\$\('tray'\)\.innerHTML = [^\n]*<div class="donote">\$\{esc\(view\.doNote\)\}<\/div>/);
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
    artBase: () => '', cardCatalog: () => [], cardPins: () => ({}), drawnPouch: null };
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
