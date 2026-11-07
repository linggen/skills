import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { battleHtml, WORDS } from '../scripts/battle-card.js';
import { begin, offers, view } from '../scripts/battle.js';
import { loadWorld } from '../scripts/content.mjs';

const css = fs.readFileSync(new URL('../scripts/battle.css', import.meta.url), 'utf8');

test('the action slots and phone deck survive an emptied pouch', () => {
  const content = loadWorld('jiuding');
  const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, { ...c, name: c.name.zh }]));
  const st = begin({ mode: 'pve', seed: 'slots', you: { tier: 'core', root: 'wood', deck: ['jixiao', 'huoya', 'houtu', 'luying', 'leiming'] }, foe: { tier: 'core', root: 'wood', deck: content.creatures.creatures.find(c => c.id === 'leishen').deck } }, catalog);
  const ctx = { lang: 'zh', words: WORDS.zh, catalog, board: st.mode.board, foeName: '雷神', youName: '修士' };
  const render = (pouch, deck) => { const v = view(st); v.you.pouch = pouch; v.you.deck = deck; return battleHtml(v, offers(st), ctx); };
  const full = render([{ id: 'heal' }, { id: 'heal' }, { id: 'heal' }], 7);
  const empty = render([], 0);
  for (const html of [full, empty]) {
    assert.match(html, /<div class="bacts">\s*<div class="bpouch( is-empty)?"/);
    assert.match(html, /data-spot="power"/);
    assert.match(html, /data-spot="end"/);
  }
  assert.match(full, /class="bdeck mine"[^]*?<b>7<\/b><small>牌库<\/small>/);
  assert.match(empty, /class="bdeck mine dry"[^]*?<b>0<\/b><small>牌库<\/small>/);
  assert.match(css, /\.bacts > \.bpower \{ flex: 0 0 96px; min-width: 0; \}/);
  assert.match(css, /\.bacts > \.end \{ flex: 0 0 110px; width: 110px; min-width: 0; \}/);
  assert.match(css, /\.bacts > \.bpouch \{ display: flex; align-items: center; flex: 1 1 0; min-width: 0;/);
  assert.match(css, /\.bacts > \.bpower \{ flex-basis: 76px; \}/);
  assert.match(css, /\.bacts > \.end \{ flex-basis: 80px; width: 80px; \}/);
  assert.match(css, /\.bside\.you \.bdeck \{ margin-left: 0; width: auto; height: auto; display: inline-flex;/);
  assert.match(css, /\.bside\.you \.bdeck\.dry \{ border-color: var\(--cinnabar\);/);
  assert.match(css, /--handfloor: 180px/);
});
