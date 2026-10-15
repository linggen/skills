// The story view's choices are live (2026-10-15, live at 外门 and 外门 · 告示栏):
// at a passage's last beat the scene's choices stand inside the box — 交 / 不交,
// 今日到此 ›, and the errands to take here, 「接下差事：修屋顶」 「接下差事：药园巡夜」.
// The box itself is one big tap target (`data-dlg-next`, the next sentence), and
// the page's tap list took it before the errands' `data-do="take"`: tapped, they
// did nothing. A button among the box's choices is that choice's own tap.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORDS, panelActsHtml } from '../scripts/cards.js';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, quest } from '../scripts/rules.mjs';
import { showAll, storyHtml, withTold } from '../scripts/dialogue.js';
import { TO_WAIMEN, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const page = (l, extra = {}) => ({ look: l, lang: l.lang, words: WORDS[l.lang], content: {}, ...extra });
const PAGE = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');

/* The page's tap list in order (lingjing.js CLICKS): selector → its handler's source. */
const clicks = () => {
  const body = PAGE.slice(PAGE.indexOf('const CLICKS = ['), PAGE.indexOf('\n];', PAGE.indexOf('const CLICKS = [')));
  return [...body.matchAll(/^\s+\['([^']+)',\s*(.*)$/gm)].map(([, sel, rest]) => ({ sel, rest }));
};

/* What a tap on an element inside the box lands on: the first entry whose selector the
   element sits under (matched on the attributes it and the box carry), unless its handler
   yields (answers false) for a button among the box's ways — then the next. */
function landsOn(attrs, { inWays = true } = {}) {
  for (const { sel, rest } of clicks()) {
    const hit = sel.split(',').some(s => attrs.some(a => s.trim() === `[${a}]`));
    if (!hit) continue;
    if (inWays && sel === '[data-dlg-next]' && /closest\?\.\('\.ways button'\) \? false/.test(rest)) continue;
    return sel;
  }
  return null;
}

const SCENES = {
  '00-waimen (交 / 不交)': TO_WAIMEN,
  '00-mijing (告示栏, 今日到此)': [...TO_WAIMEN, ['resolve', { exit: 'pay' }]],
};

for (const [name, steps] of Object.entries(SCENES)) {
  test(`${name}: the errands inside the box at its last beat are taken by their own tap`, () => {
    const s = walk(newState(content, 'zh', NOW), steps, content, NOW);
    const l = look(s, content, ctx());
    assert.equal(l.offers?.length, 2, 'two errands to take here');
    const acts = panelActsHtml(page(l), { inBox: true });
    const r = showAll(withTold(null, [{ of: 'scene', id: l.scene.id, beats: [{ text: '……' }] }], l.scene.id), 'zh');
    const box = storyHtml(r, { lang: 'zh', acts });
    // The errands and the scene's own ways stand in the box's ways…
    const ways = box.slice(box.indexOf('class="ways"'));
    for (const o of l.offers) assert.match(ways, new RegExp(`data-do="take" data-id="${o.id}"`), o.title);
    for (const t of l.scene.panel.taps) assert.match(ways, new RegExp(`data-panel-exit="${t.id}"`), t.label);
    // …inside the box's own tap target (`data-dlg-next`)…
    assert.match(box, /class="story[^"]*"[^>]*data-dlg-next/);
    // …and a tap on one lands on its own handler, not on the next sentence.
    assert.equal(landsOn(['data-do', 'data-dlg-next']), '[data-do]', 'an errand: 接下');
    assert.equal(landsOn(['data-panel-exit', 'data-dlg-next']), '[data-panel-exit]', 'a way on');
    assert.equal(landsOn(['data-dlg-next'], { inWays: false }), '[data-dlg-next]', 'the box itself: the next sentence');
    // The take goes through, and the errand leaves the choices (its 已接下 seal is the page's, tookOffer).
    const took = quest(s, content, ctx(), { action: 'take', id: l.offers[0].id });
    assert.equal(took.result.ok, true, JSON.stringify(took.result));
    const after = look(took.state, content, ctx());
    assert.ok(!after.offers?.some(o => o.id === l.offers[0].id), 'taken: no longer offered');
  });
}

/* The footer chips' popovers (事 · 天气 · 恩仇簿) live in a row that scrolls sideways under the
   story view (story.css .footchips overflow-x): anchored inside it they were clipped to nothing
   (2026-10-15, live: 「事 3 · 可交 10」 tapped, the book opened unseen). Anchored to the footer. */
test('the footer chips\' popovers are anchored to the footer, not clipped by the chips\' scrolling row', () => {
  const css = fs.readFileSync(new URL('../scripts/story.css', import.meta.url), 'utf8');
  assert.match(css, /\.slotfoot \.footchips \{[^}]*overflow-x: auto/, 'the row scrolls (why the anchor moved)');
  assert.match(css, /\.slotfoot \.footchips \.bookwrap \{ position: static; \}/);
  assert.match(css, /\.slotfoot \.bookpop \{[^}]*bottom: calc\(100% \+ 10px\)/);
});
