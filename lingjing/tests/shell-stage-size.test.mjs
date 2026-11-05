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
