// A board or a fight started from a row of 事 · 全部 takes the stage, and the list goes with it. The list is a popover over
// the stage: a 切磋 opened from its row came up UNDER it (the play bot, 2026-11-16, `layout` · covered: the board's title and its
// 开始 behind the list), where a walk (goTo) or a kept board's 玩 (keptTap) had always put the list away first. The two ways
// a row starts something that takes the screen — a board (`data-play` → openFromTray) and a fight (`data-duel-start` →
// onDuelStart) — each put the list away where the stage is taken, whatever the row.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo } from '../scripts/rules.mjs';
import { WORDS, bookPopHtml } from '../scripts/cards.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const PAGE = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
const content = loadContent();
const START = new Date(2026, 9, 20, 9, 0);
const NOW = new Date(2026, 9, 20, 15, 0);
const page = (l) => ({ look: l, lang: 'zh', words: WORDS.zh, qi: { st: 'full' } });
const played = (scene) => { const s = playTo(content, newState(content, 'zh', START), scene, { now: START }).state; return { ...s, stamina: 100, stamina_at: NOW.toISOString() }; };

/* The body of a top-level function of the page, from its head to the next function at column 0. */
function bodyOf(name) {
  const at = PAGE.search(new RegExp(`^(async )?function ${name}\\(`, 'm'));
  assert.ok(at >= 0, `${name} is in the page`);
  const from = PAGE.indexOf('\n', at) + 1, rest = PAGE.slice(from), end = rest.search(/^\S/m);
  return PAGE.slice(at, from + (end < 0 ? rest.length : end));
}

test('a board started from a row of the list puts the list away as it takes the stage', () => {
  assert.match(bodyOf('openTrayBoard'), /show\(\{ bookOpen: false, opened: /);
  assert.match(PAGE, /\['\[data-play\]', \(el\) => !el\.matches\(':disabled'\) && openFromTray\(el\.dataset\.play\)\]/);
});

test('a fight started from a row of the list puts the list away as it takes the stage', () => {
  const body = bodyOf('onDuelStart');
  assert.match(body, /starting = true;\n  spoilsAway\(\);\n  show\(\{ bookOpen: false \}\);[\s\S]*?const r = await write\('duel'/);
  assert.match(PAGE, /\['\[data-duel-start\]', \(el\) => run\(`duel:\$\{el\.dataset\.duelStart\}`/);
});

test('every row of the list that takes the stage starts it through one of those two (or a walk / a kept 玩, which shut it)', () => {
  const OPENERS = ['data-play', 'data-duel-start', 'data-kept-play', 'data-go', 'data-seclude-open', 'data-gear-open', 'data-shop-open', 'data-duizi-open', 'data-divine', 'data-mijing', 'data-tame'];
  const found = new Set();
  for (const scene of ['wm-ahe', 'wm-yaoyuan', 'wm-chaifang', 'wm-kaikai']) {
    const pop = bookPopHtml(page(look(played(scene), content, { now: NOW, quests: [] })));
    for (const m of pop.matchAll(/ (data-[a-z-]+)(?==|[ >])/g)) if (OPENERS.includes(m[1])) found.add(m[1]);
  }
  assert.ok(found.has('data-play') || found.has('data-go'), 'the list has starts to look at');
  const SHUTS = {
    'data-play': /openTrayBoard/, 'data-duel-start': /onDuelStart/, 'data-kept-play': /keptTap/, 'data-go': /goTo/, 'data-seclude-open': /openSeclude/, 'data-divine': /qianOpen: true, shelfOpen: false, bookOpen: false/,
  };
  for (const attr of found) assert.ok(SHUTS[attr], `a list row carries ${attr}: say how its start puts the list away (add it to SHUTS here and to the page)`);
  assert.match(bodyOf('keptTap'), /show\(\{ bookOpen: false \}\)/);
  assert.match(bodyOf('goTo'), /show\(\{ bookOpen: false \}\)/);
  assert.match(bodyOf('openSeclude'), /bookOpen: false/);
  assert.match(PAGE, /\['\[data-divine\]', \(\) => show\(\{ qianOpen: true, shelfOpen: false, bookOpen: false \}\)\]/);
});
