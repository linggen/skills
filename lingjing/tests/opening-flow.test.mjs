// The opening's flow after its games (Hanli, 2026-10-14: 「可以，四个都按你说的改」):
// 1. the rest of a passage a game stands inside is the scene's, told right after the game;
// 2. the choices are proper buttons wherever they stand; 3. a scene's game is not at hand before
// its passage reaches it; 4. the header changes only when the story gets there.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { newState } from '../scripts/state.mjs';
import { cardHtml, trayHtml, WORDS } from '../scripts/cards.js';

const content = loadContent();
const NOW = new Date('2026-10-14T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const ROOT = path.resolve(import.meta.dirname, '..');
const scenes = content.chapters['00-prologue'].scenes;
const page = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');

// The book's paragraphs of a 回, normalized as scene-book-sync reads them.
const norm = (t) => t.replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1').replace(/\{[^}\n]*\}/g, '').replace(/\*\*|⟪|⟫/g, '').replace(/^#.*$/gm, '').replace(/^>\s?/gm, '').replace(/---/g, '').replace(/\s+/g, '');
const BOOK = JSON.parse(fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/book.json'), 'utf8'));
const paras = {};
for (const h of BOOK.volumes.flatMap((v) => v.hui)) paras[h.id] = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu', h.file), 'utf8').split(/\n\s*\n/).map(norm).filter(Boolean);
const lastPara = (pair) => norm(pair.zh.split('\n\n').at(-1));
const firstPara = (pair) => norm(pair.zh.split('\n\n')[0]);

test('a game inside its scene\'s passage: the rest is the scene\'s own (`story_after`), never its way on\'s', () => {
  for (const id of ['00-shiao', '00-halfyear']) {
    const sc = scenes[id];
    assert.ok(sc.story_after?.zh && sc.story_after?.en, `${id}: the rest of the passage stays on the scene`);
    for (const e of sc.exits.filter((x) => !x.stay)) assert.equal(e.story, undefined, `${id}/${e.id}: no scene text on the way on`);
  }
  // No exit begins mid-way through its scene's own run: where the scene's told text ends in the book
  // (its `story_after`), no way on of it starts; and the rest begins exactly where the lead stops.
  for (const sc of Object.values(scenes)) {
    if (!sc.story_after) continue;
    const book = paras[sc.hui].join('');
    const end = (t) => { const at = book.indexOf(t); return at < 0 ? -1 : at + t.length; };
    assert.ok(end(lastPara(sc.story_after)) > 0, `${sc.id}: its passage is the book's`);
    // A scene with a second board after the rest (00-cave's 喂饼, batch two) has its ways on start there by right:
    // the board stands between the scene's run and the branch the board chooses.
    const second = (sc.show ?? []).filter((c) => c.card === 'board').length > 1;
    if (!second) for (const e of sc.exits) if (e.story) assert.notEqual(book.indexOf(firstPara(e.story)), end(lastPara(sc.story_after)), `${sc.id}/${e.id} starts mid-way through the scene's run`);
    assert.equal(book.indexOf(firstPara(sc.story_after)), end(lastPara(sc.story)), `${sc.id}: the rest follows the lead`);
  }
});

test('the rest is told right after the game is counted, before the choices — and the page never taps a way on over it', () => {
  let s = newState(content, 'zh', NOW);
  s = tellOf(content, s).keep;
  s = win(s, content, ctx(), { id: 'rain-basins', grade: 'dry' }).state;
  s = task(s, content, ctx(), { action: 'done', id: 'rain-basins' }).state;
  assert.equal(s.scene, '00-shiao', 'still the morning');
  const { tell } = tellOf(content, s);
  assert.deepEqual(tell.map((t) => [t.of, t.id]), [['after', '00-shiao/after']]);
  assert.match(tell[0].text, /他娘已经在挨个儿倒盆了/);
  // the village map after the morning (batch two): played, then 那天傍晚
  const told = tellOf(content, s).keep;
  const walked = task(win(told, content, ctx(), { id: 'village-day', grade: 'light' }).state, content, ctx(), { action: 'done', id: 'village-day' }).state;
  const on = resolve(walked, content, ctx(), { exit: 'begin' });
  assert.equal(on.state.scene, '00-masan');
  assert.match(page, /if \(on && !look\?\.tell_owed\) await panelTap\(on\.id/);
});

test('the choices are proper buttons with the box put away — never the bare 「那天傍晚 ›」 link', () => {
  let s = newState(content, 'zh', NOW);
  s = task(win(s, content, ctx(), { id: 'rain-basins', grade: 'wet' }).state, content, ctx(), { action: 'done', id: 'rain-basins' }).state;
  s = task(win(s, content, ctx(), { id: 'village-day', grade: 'light' }).state, content, ctx(), { action: 'done', id: 'village-day' }).state;
  const html = cardHtml({ card: 'panel' }, { look: look(s, content, ctx()), words: WORDS.zh, lang: 'zh' });
  assert.match(html, /class="act paneltap"[^>]*data-panel-exit="begin"[^>]*>那天傍晚 ›</);
  assert.doesNotMatch(html, /quietnext/);
});

test('a scene\'s game is not at hand before its passage reaches it — not on the stage, not in the tray', () => {
  const l = look(newState(content, 'zh', NOW), content, ctx());
  assert.ok(l.tasks.some((t) => t.id === 'rain-basins'), 'offered (the save holds it)');
  const tray = (onStage) => trayHtml({ look: l, words: WORDS.zh, lang: 'zh', onStage });
  assert.match(tray([]), /接雨/, 'at its beat, the tray may hold it as a fallback');
  assert.doesNotMatch(tray(['rain-basins']), /接雨/, 'held back while its passage is still to come');
  assert.match(page, /const gamesAhead = storyAhead\(\) \? \(look\.scene\?\.show \?\? \[\]\)\.filter\(\(c\) => c\.card === 'board'\)\.map\(\(c\) => c\.id\) : \[\];/);
  assert.match(page, /onStage: \[\.\.\.\(slots\?\.main \?\? \[\]\)\.map\(\(c\) => c\.id\)\.filter\(Boolean\), \.\.\.gamesAhead\]/);
});

test('the header changes only when the story gets there: the last scene\'s holds through its choice\'s passage', () => {
  // The page keeps the scene it left, and stands the header on it while the box tells that choice.
  assert.match(page, /if \(look\?\.scene && seen\?\.scene\?\.id !== look\.scene\.id\) leftLook\(look\);/);
  assert.match(page, /const held = leadsIn\(readingHere\(\), look\?\.scene\?\.id, prev\?\.scene\?\.id\) \|\| /, 'held through all that leads in (dialogue.js leadsIn, tests/stage-hold.test.mjs)');
  // …and under the old 回's 「完」 at its turn (proto f, 2026-10-14): it turns with 合上.
  assert.match(page, /\|\| Boolean\(prev\?\.scene && prev\.scene\.id !== look\?\.scene\?\.id && closeUp\(\) && atHuiTurn\(\)\);\n {2}return held \? \{ \.\.\.look, scene: prev\.scene,/);
  assert.match(page, /look = headLook\(\);\s*try \{\s*paintAtmos\(\);\s*paintBackdrop\(\);/, 'the sky switches with the header');
  assert.match(page, /\$\('placeCap'\)\.textContent = [^\n]*\n\s*\} finally \{ look = realLook; \}/);
  assert.match(page, /paintIf\('headCards', headHtml\(slots && look !== realLook \? \{ \.\.\.slots, header: headOf\(look\) \} : slots\)\)/, 'the cast strip too');
  // The reading a move begins: the choice's passage first (of: 'choice', the old scene's id), then the new scene's.
  let s = newState(content, 'zh', NOW);
  s = task(win(s, content, ctx(), { id: 'rain-basins', grade: 'dry' }).state, content, ctx(), { action: 'done', id: 'rain-basins' }).state;
  s = task(win(s, content, ctx(), { id: 'village-day', grade: 'light' }).state, content, ctx(), { action: 'done', id: 'village-day' }).state;
  s = resolve(tellOf(content, s).keep, content, ctx(), { exit: 'begin' }).state;
  s = tellOf(content, s).keep;
  s = task(win(s, content, ctx(), { id: 'masan-taunt', grade: 'word' }).state, content, ctx(), { action: 'done', id: 'masan-taunt' }).state;
  const out = resolve(s, content, ctx(), { exit: 'endure' });
  const { tell } = tellOf(content, out.state);
  assert.equal(tell[0].of, 'choice');
  assert.equal(tell[0].id.split('/')[0], '00-masan', 'the passage is the scene just left — its header holds');
  assert.equal(tell.at(-1).id, out.state.scene, 'then the new scene\'s, under its own header');
});
