// Three layout items from the deployer's playthrough and playbot (2026-11-05, skills dfd51d50):
// 1. the Mac fight bar wears 留 · ✕ as every board (the 11-03 rule; the phone's bar has had 留着以后玩): 留 leaves the fight
//    open in the save, nothing written, its 回到这一战 card on the stage — and opening the page never pulls him back in;
// 2. the top bar in a fight at 375 · 430 never runs past the screen (「En」 and 灵石 did): the labels give way, a second row;
// 3. a duel hand's every card whole and its cost on top: on a desk the 丹囊 tray beside the hand (it lay over the first
//    card), the fan inside the room (at 1280 a ten-card hand ran off both sides).
// Headless at 375 · 430 · 1280 · 1466 (the playbot's lint, tools/playbot/lint.mjs: no cost covered, nothing off the side).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('the Mac fight bar: ? · 🔊 · Ⅱ · 留 · ✕ — 留 takes the room down, the fight left open, its card on the stage', () => {
  const page = read('../scripts/lingjing.js');
  assert.match(page, /out: toolHtml\('keep', words\(\)\.boardKeep, 'data-fight-tap="keep"'\) \+ toolHtml\('close', bw\.quit, 'data-fight-tap="quit"'\)/);
  assert.match(page, /if \(kind === 'keep'\) return keepBout\(bout\);/);
  const keep = page.slice(page.indexOf('function keepBout('), page.indexOf('/* The rules settle it, and the scene reports it'));
  assert.match(keep, /b\.stop\?\.abort\(\);/);
  assert.match(keep, /keep\(\{ walkedOut: b\.id \}\);/, 'waits on its card');
  assert.doesNotMatch(keep, /write\(/, 'nothing written: the save holds it open, as the phone leaves it');
  assert.match(page, /\.then\(\(out\) => \(b\.kept \? keptBout\(b\) : settleBout\(b, out\)\)\)/);
});

test('opening the page never pulls him into a fight left open — but the engine\'s own reload goes back in', () => {
  const page = read('../scripts/lingjing.js');
  assert.match(page, /if \(look\.fight\?\.open && !bout && !view\.lookedOnce && !intoFight\(\)\) keep\(\{ walkedOut: look\.fight\.game \}\);/);
  assert.match(page, /sessionStorage\.setItem\(INTO_FIGHT, '1'\)/);
});

test('the fight\'s top bar on a phone: labels give way, a second row — nothing past the screen', () => {
  const css = read('../scripts/phone.css');
  assert.match(css, /body\.fighting \.topbar \{ flex-wrap: wrap; gap: 2px 10px; \}/);
  assert.match(css, /body\.fighting \.topbar :is\(\.xw, \.qi, \.ls\) > \.lbl \{ display: none; \}/);
  assert.doesNotMatch(css, /body\.fighting \.topbar \{ flex-wrap: nowrap; \}/);
});

test('a desk\'s hand: the 丹囊 tray beside it, the fan inside the room, the last leaf from its slot\'s right edge', () => {
  const css = read('../scripts/battle.css');
  const base = css.slice(0, css.indexOf('@container scene (max-width: 640px)'));
  assert.match(base, /\.bdock \{ display: flex; align-items: flex-end; gap: 10px; \}/);
  assert.match(base, /\.bdock > \.dn-tray \{ position: static; flex: none;/);
  assert.match(base, /\.bdock > \.bhand \{ flex: 1 1 0; min-width: 0; padding: 0 calc\(var\(--cw\) \* \.3\); \}/);
  assert.match(base, /\.bleaf \.bcost \{ position: absolute; top: -7px; left: -7px; z-index: 2;/, 'the cost over its picture');
  // the phone's own hand keeps its padding over the desk's
  assert.match(css, /\.battle \.bdock > \.bhand \{ flex: 1 1 0; min-height: 0; height: auto; padding: 10px 4px 0; \}/);
});
