// Three small layout points of the fight page and the top strip (the 2.6.0 review, 2026-11-21):
//  · a spent hand leaves a line of words in the dock, never a bare band (the owner: 「写几个字」);
//  · the 「没别的可做了」 pill keeps the board's own gap (--bgap) from 上一手 — no pulled-up margin;
//  · a gain (+N) stands beside the number it adds to, in its own room — never absolute over it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { act, begin, offers, view } from '../scripts/battle.js';
import { WORDS, battleHtml } from '../scripts/battle-card.js';

const css = (name) => fs.readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');
const CARDS = { cub: { id: 'cub', kind: 'minion', name: '小妖', cost: 1, element: null, atk: 1, hp: 2 } };

function room(lang, hand = []) {
  const st = begin({ mode: 'pve', seed: 's', you: { tier: 'core', root: null, deck: Array(10).fill('cub') }, foe: { tier: 'core', root: null, deck: Array(12).fill('cub') } }, CARDS);
  st.you.hand = [...hand];
  return battleHtml(view(st), offers(st), { lang, words: WORDS[lang], catalog: CARDS, board: 4 });
}

test('a spent hand says so in the dock, and what comes next on your turn; a hand with cards has no such line', () => {
  const zh = room('zh');
  assert.match(zh, /<div class="bhand"><div class="bhandnone"><b>手牌已出完<\/b><small>结束回合，下回合再抽 1 张<\/small><\/div><\/div>/);
  assert.match(room('en'), /<b>Hand spent<\/b><small>End the turn; you draw 1 next turn<\/small>/);
  assert.doesNotMatch(room('zh', ['cub']), /bhandnone/);
});

test('the pill under 上一手 keeps the board\'s gap, set in one place (--bgap), at every size', () => {
  const battle = css('battle.css');
  assert.match(battle, /\.bseam \{ flex-wrap: wrap; align-items: center; gap: var\(--bgap\) 10px; \}/);
  assert.match(battle, /\.bhint\.bstuck \{ margin: 0 0 6px; \}/, 'no negative margin pulls it up under the strip');
  assert.match(battle, /var\(--fit\) var\(--dock-track\); gap: var\(--bgap\);/, 'the grid\'s own gap is the same token');
  assert.equal((battle.match(/--bgap: \d+px/g) ?? []).length, 3, 'defined once for the desk, the phone and the short desk — nowhere else');
  assert.doesNotMatch(battle, /\.battle \{[^}]*[; ]gap: \d+px/, 'no size sets the board\'s gap by a number');
});

test('a gain stands in the figure\'s own line after it, never absolute over it', () => {
  const rule = css('lingjing.css').match(/^\.gain \{[^}]*\}/m)[0];
  assert.match(rule, /display: inline-block/);
  assert.doesNotMatch(rule, /position: absolute/);
  const js = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(js, /el\.parentElement\.append\(gain\)/, 'at the end of 「486/750」, not between its digits');
});
