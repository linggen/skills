// 斗法 on a phone: the hand a turning wheel (Hanli 2026-11-05 on a real iPhone: 「牌分两排的时候完全看不清内容了」, then
// 「可以做成旋转木马样式的吗? 用户可以转着看」). In the phone's room (battle.css @container scene ≤ 640px) one card stands at
// the centre at ~45% of the room's width, two each side step back (.8, .65), tilted and dimmer; a swipe turns it with
// momentum and it settles; it loops from four cards; a side card's tap turns it, the centre's plays; a dot a card under it.
// The 丹囊 sits in the action row (folds to 「丹 ×N」), the party's chips are slim. Checked headless (touch, DPR 3) at
// 430×932 and 375×812 with hands of 1 · 3 · 4 · 6 · 8 · 10, 0–3 pills, 1–2 companions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../scripts/battle.css');
const phone = css.slice(css.indexOf('@container scene (max-width: 640px) {'), css.indexOf('/* Motion is decoration'));
const wheel = read('../scripts/battle-wheel.js');
const card = read('../scripts/battle-card.js');
const kapai = read('../scripts/games/kapai.js');

// battle-wheel.js in a fake page: a hand of n cards, the wheel laid out (no browser).
async function wheelOf(n, { can = [] } = {}) {
  const { wireWheel } = await import('../scripts/battle-wheel.js');
  const listeners = {};
  const mk = (cls = '') => {
    const kids = [], attrs = {}, props = {}, classes = new Set(cls.split(' ').filter(Boolean));
    const el = {
      kids, dataset: {}, style: { setProperty: (k, v) => { props[k] = v; } }, props,
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), [Symbol.iterator]: () => classes[Symbol.iterator]() },
      setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; }, hasAttribute: (k) => k in attrs,
      append: (x) => kids.push(x), remove() {}, querySelector: () => null, querySelectorAll: () => [],
    };
    return el;
  };
  const cards = Array.from({ length: n }, (_, i) => { const c = mk(`bcard el-wood${can.includes(i) ? ' can' : ''}`); c.dataset = { id: `c${i}`, index: String(i) }; return c; });
  const hand = mk('bhand');
  hand.querySelectorAll = (s) => (s.includes('.bcard') ? cards : s.includes('[data-wheel]') ? [] : []);
  const host = { querySelector: (s) => (s.includes('.bhand') ? hand : null), addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener() {}, contains: () => true };
  globalThis.getComputedStyle = () => ({ getPropertyValue: (k) => (k === '--wheel' ? '1' : ''), display: 'block' });
  globalThis.document = { createElement: () => ({ set innerHTML(v) { this.html = v; } }) };
  globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
  const w = wireWheel(host, { reduced: () => false });
  w.apply();
  return { w, cards, hand };
}

test('the phone\'s hand is a wheel: the room\'s CSS turns it on, the desk keeps its fan', () => {
  assert.match(phone, /\.battle \.bdock > \.bhand \{\s*(\/\*[^*]*\*\/\s*)?--wheel: 1; container-type: size;[^}]*touch-action: pan-y;/, 'a swipe up and down is the page\'s');
  assert.match(phone, /--wheel: 1; container-type: size; position: relative; display: block; flex: 1 1 0; min-height: 96px;/, 'never taller than the dock leaves: its dots stay inside');
  assert.match(phone, /--wcw: min\(47cqw, calc\(\(100cqh - 48px\) \* \.71\)\);/, 'the centre card ~45% of the room, or what the height allows');
  assert.match(phone, /transform: translateX\(calc\(var\(--wx, 0\) \* var\(--wcw\)\)\) rotateY\(var\(--wt, 0deg\)\) scale\(var\(--ws, 1\)\);/);
  assert.match(phone, /\.battle \.bhand > \.bcard\.far \{ opacity: 0; pointer-events: none; \}/);
  assert.match(phone, /\.battle \.bhand > \.bcard \.btext \{ font-size: clamp\(12\.5px,/, 'the centre card\'s words at a phone\'s reading size (≥ 10 px on a side card at .8)');
  assert.match(phone, /\.battle \.bhand > \.bcard\.r \.bcost \{ left: auto; right: 4px; \}/, 'a card right of the centre shows its cost on its outer corner');
  assert.doesNotMatch(css.slice(0, css.indexOf('@container scene (max-width: 640px) {')), /--wheel/, 'never on the desk');
  assert.match(kapai, /const wheel = wireWheel\(host\);/);
  assert.match(kapai, /keepPictures\(host, battleHtml\([^;]*\)\); wheel\.apply\(\);/, 'laid out again after every draw');
  assert.match(kapai, /wheel\.off\(\);/);
});

test('the wheel: two each side step back smaller, tilted, dimmer; it loops from four cards, a smaller hand lies in a line', async () => {
  const { cards } = await wheelOf(6, { can: [2] });
  const mid = cards.findIndex((c) => c.classList.contains('mid'));
  assert.equal(mid, 2, 'a fresh hand opens on its first card he can play');
  const at = (i) => cards[i].props;
  assert.equal(at(2)['--ws'], '1');
  assert.equal(at(3)['--ws'], '0.8'); assert.equal(at(1)['--ws'], '0.8');
  assert.equal(at(4)['--ws'], '0.65'); assert.equal(at(0)['--ws'], '0.65');
  assert.equal(at(3)['--wt'], '-10deg'); assert.equal(at(1)['--wt'], '10deg');
  assert.ok(Number(at(3)['--wl']) < 1 && Number(at(4)['--wl']) < Number(at(3)['--wl']), 'dimmer the further back');
  assert.ok(cards[5].classList.contains('far'), 'the sixth waits behind, unseen');
  assert.ok(cards[3].hasAttribute('data-peek') && !cards[2].hasAttribute('data-peek'));
  assert.ok(cards[3].classList.contains('r') && !cards[1].classList.contains('r'));
  // four and more go round: the last card sits left of the first
  const four = await wheelOf(4, { can: [0] });
  assert.equal(Number(four.cards[3].props['--wx']) < 0, true, 'from four, the last is the first one\'s left neighbour');
  const three = await wheelOf(3);
  assert.ok(three.cards[1].classList.contains('mid'), 'three lie in a line, the middle one at the centre');
  assert.ok(Number(three.cards[0].props['--wx']) < 0 && Number(three.cards[2].props['--wx']) > 0);
  three.w.turnTo(5);
  assert.ok(three.cards[2].classList.contains('mid'), 'a line never wraps: it stops at its end');
});

test('reduced motion: a plain snap, no tilt', async () => {
  assert.match(wheel, /st\.setProperty\('--wt', `\$\{still \? 0 : /);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.battle \*, \.battle \*::before, \.battle \*::after \{ animation-duration: \.01ms !important;[^}]*transition-duration: \.01ms !important; \}/);
});

test('taps: a side card or a dot turns it (the room never sees the tap); the centre card is the room\'s; a swipe turns, touch only', () => {
  assert.match(wheel, /host\.addEventListener\('click', onClick, true\);/, 'before the room\'s own click');
  assert.match(wheel, /if \(card && card\.parentElement === hand && !card\.classList\.contains\('mid'\)\) \{ stop\(e\); turnTo/);
  assert.match(wheel, /if \(dot && host\.contains\(dot\)\) \{ stop\(e\); return turnTo\(Number\(dot\.dataset\.wheel\)\); \}/);
  assert.match(wheel, /if \(e\.pointerType === 'mouse' \|\| !isOn\(hand\)/, 'a mouse drags a card to its target, as on the desk');
  assert.match(wheel, /if \(Math\.abs\(dx\) < 8 \|\| Math\.abs\(dx\) < Math\.abs\(dy\)\) return;/, 'up and down is the page\'s scroll');
  assert.match(wheel, /const flung = d\.shift \+ \(-v \* 220\) \/ stepPx\(hand\);/, 'momentum, then it settles on a card');
});

test('the 丹囊 in the action row, folding to 「丹 ×N」; the party\'s chips slim; his row in order', () => {
  assert.match(card, /<div class="bacts">\s*\$\{pouchRowHtml\(st, ctx, picked\)\}/, 'left of 主灵根一击 and 结束回合');
  assert.match(card, /<div class="bpouch"><button type="button" class="dn-fold"[^`]*×\$\{\(st\.you\.pouch \?\? \[\]\)\.length\}/);
  assert.match(phone, /\.battle \.bdock > \.dn-tray \{ display: none; \}/, 'one tray on a phone');
  assert.match(phone, /\.bacts\.fold > \.bpouch > \.dn-tray \{ display: none; \}/);
  assert.match(phone, /\.bacts\.fold > \.bpouch\.open > \.dn-tray \{ display: flex; position: absolute;/, 'the chip opens the whole tray');
  assert.match(wheel, /if \(acts\.scrollWidth > acts\.clientWidth \+ 1 \|\| \(tray && tray\.scrollWidth > pouch\.clientWidth \+ 1\)\) acts\.classList\.add\('fold'\);/, 'folds only when the row cannot hold it');
  assert.match(phone, /\.battle \.bally \{ grid-template-columns: 20px auto auto; grid-template-rows: auto;/, 'one line: face, name and 嘲讽, the 气血 bar');
  assert.match(phone, /\.bside\.you > \.bparty \{ order: 2;[^}]*\}\s*\.bside\.you > \.bacts \{ order: 3;/);
});

// The playbot at 375×812 on the Mac page (11-05): the footer's 物品 chip stood over the hand's dots and cards (199 taps
// met it), and a hand held small by the bars put 22 neighbours' costs under a nearer leaf.
test('a narrow fight hides the footer; the wheel opens out where the hand is wider than it needs', () => {
  const phoneCss = read('../scripts/phone.css');
  assert.match(phoneCss, /body\.fighting \.slotfoot:not\(:has\(\.askbar:not\(\[hidden\]\)\)\) \{ display: none; \}/);
  assert.match(wheel, /return Math\.max\(1, Math\.min\(1\.6, \(hand\.clientWidth \/ 2 - 0\.36 \* cw\) \/ \(STEP\[2\] \* cw\)\)\);/);
  assert.match(wheel, /st\.setProperty\('--wx', String\(s \* lerp\(STEP, a\) \* k\)\);/);
});

test('two back, a card\'s cost is its dot\'s: no badge half under the card in front', () => {
  assert.match(wheel, /card\.classList\.toggle\('deep', Math\.abs\(o\) > 1\.5\);/);
  assert.match(phone, /\.battle \.bhand > \.bcard\.deep \.bcost \{ visibility: hidden; \}/);
});
