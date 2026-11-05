// A small game on the Mac stage as big as its shape allows (Hanli 2026-11-05, 药园巡夜 · 开春 in a 1466-wide stage:
// 「这个游戏画面能调大一些吗」 — an 830×935 card, its field 790×730, the scene showing on both sides). On a Mac the stage
// (#focus) is a size container: every board's `100dvh − --game-reserve` is the stage's 96% less only the card's chrome; a
// hidden helper (结印's button) reserves nothing; the bar is one line over a landscape field; the how line one line.
// Headless at 1466×1150 · 1280×800 · 1920×1080 (TD, 象棋, 斗法, 格斗): the TD's card 853×903 → 995×1005 at 1466.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../scripts/games/shell.css', import.meta.url), 'utf8');
const mac = css.slice(css.indexOf('@media (min-width: 900px) {'), css.indexOf('/* A Mac window: a tall board'));

test('on a Mac the stage is the measure: a size container, the reserve read off it', () => {
  assert.match(mac, /\.focus \{ container: stage \/ size; \}/);
  assert.match(mac, /--game-reserve: calc\(100dvh - 96cqh \+ var\(--game-chrome, 68px\)\);/);
  assert.doesNotMatch(mac, /--game-reserve: \d+px/, 'no fixed page reserve left');
  assert.match(mac, /\[data-landscape="true"\]\) \{ --game-chrome: 96px; max-width: min\(96%, calc\(\(96cqh - var\(--game-chrome\)\) \* 1040 \/ 960 \+ 34px\)\); \}/);
});

test('a helper still hidden reserves nothing; the bar one line over a landscape field; the how line one line', () => {
  assert.match(css, /@media \(min-width: 900px\) \{ \.gshell:has\(> \.gshell-side:not\(:empty\)\):not\(:has\(> \.gshell-side > :not\(\[hidden\]\)\)\) \{ --jy-strip: 0px; \} \}/);
  assert.match(mac, /\.gshell-side > :not\(\[hidden\]\)\) \{ --jy-strip: 164px; \}/);
  assert.match(mac, /\.gshell\.is-tall:has\(\[data-landscape="true"\]\) \.gshell-tools \{ order: 0; flex-basis: auto; \}/);
  assert.match(mac, /\.focus \.card\.gamecard \.gshell-how \{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis;/);
  const js = fs.readFileSync(new URL('../scripts/games/shell.js', import.meta.url), 'utf8');
  assert.match(js, /<p class="gshell-how" title="\$\{plain\(how\)\}">/, 'its whole text on hover');
});

test('the phone is untouched: none of it outside the Mac\'s window rule', () => {
  const before = css.slice(0, css.indexOf('@media (min-width: 900px) {'));
  assert.doesNotMatch(before, /container: stage|--game-chrome/);
});

// A portrait board on the Mac stage (Hanli 11-05, 夜里的药园 · 东角那三棵禾 at 2000×1316: 「小游戏画面扩大一些, 上下都还有空间」):
// the bar a 112 px strip, the field by 98% of the stage's height less the card's edge. Headless (2000×1316 · 1466×1150 ·
// 1280×800): the field 596×1060 → 638×1134, 507×901 → 546×972, 318×565 → 354×629; taps land on the canvas where aimed.
test('a portrait board on the Mac: a narrow strip beside it, the field the stage\'s height', () => {
  const tail = css.slice(css.indexOf('/* A portrait board on the Mac stage'));
  assert.match(tail, /@container scene \(min-width: 621px\)/, 'not on a narrow stage');
  assert.match(tail, /\.focus \.card\.gamecard:has\(> \.gshell\.is-tall\):not\(:has\(\[data-landscape="true"\]\)\):not\(:has\(> \.gshell > \.gshell-side > :not\(\[hidden\]\)\)\) \{\s*--game-reserve: calc\(100dvh - 98cqh \+ 32px\);/, 'no nested :has — the card rule must match');
  assert.match(tail, /max-width: min\(98%, calc\(112px \+ 12px \+ 34px \+ \(98cqh - 32px\) \* var\(--ar, \.5625\) \+ var\(--beside, 0px\)\)\);/);
  assert.match(tail, /grid-template-columns: 112px minmax\(0, 1fr\); column-gap: 12px;/);
  assert.match(tail, /\.gshell-how \{\s*width: auto; white-space: normal;/, 'the how line wraps small in the strip');
});
