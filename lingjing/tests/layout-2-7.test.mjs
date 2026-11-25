// Three layout rulings the 2.7.0 gate's play bot raised again (Hanli 11-22: 「好歹加个背景图片, 或者写几个字」 under a played-out
// hand; 「每个卡片空白很大」 in the phone bag; the tray's 去沉鼎观 button cut at 375). The page's geometry is shot by the play bot
// (tools/playbot — the empty seat, the bag, the tray at 375); these hold the markup and the rules that make it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { battleHtml, WORDS } from '../scripts/battle-card.js';
import { begin, offers, view } from '../scripts/battle.js';
import { loadWorld } from '../scripts/content.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const battleCss = read('../scripts/battle.css');
const css = read('../scripts/lingjing.css');

const room = (hand, deck, lang = 'zh') => {
  const content = loadWorld('jiuding');
  const catalog = Object.fromEntries(content.cards.cards.map((c) => [c.id, { ...c, name: c.name.zh }]));
  const st = begin({ mode: 'pve', seed: 'empty-hand', you: { tier: 'core', root: 'wood', deck: ['jixiao', 'huoya', 'houtu', 'luying', 'leiming'] }, foe: { tier: 'core', root: 'wood', deck: content.creatures.creatures.find((c) => c.id === 'leishen').deck } }, catalog);
  const ctx = { lang, words: WORDS[lang], catalog, board: st.mode.board, foeName: '雷神', youName: '修士' };
  const v = view(st);
  v.you.hand = hand ?? v.you.hand;
  v.you.deck = deck;
  return battleHtml(v, offers(st), ctx);
};

test('a hand played out is an empty seat with words and the deck count, never a blank band', () => {
  const spent = room([], 5);
  assert.match(spent, /<div class="bhand"><div class="bhandempty"[^>]*><i[^>]*>牌<\/i><b>手牌已出完<\/b><small>牌库 5 张<\/small><small>结束回合，下回合再抽 1 张<\/small><\/div><\/div>/);
  assert.match(room([], 0), /<small>牌库已空<\/small>/);
  assert.match(room([], 3, 'en'), /<b>Hand played out<\/b><small>Deck: 3 left<\/small>/);
  // It is no card: the wheel and the lint count .bcard, so a seat is not a hand of one.
  assert.doesNotMatch(spent, /class="bcard/);
  assert.doesNotMatch(room(null, 5), /bhandempty/);
});

test('the empty seat is a card of the hand in the desk fan and in the phone wheel', () => {
  assert.match(battleCss, /\.bhandempty \{[^}]*width: var\(--cw\); height: var\(--ch\)[^}]*border: 1\.5px dashed/);
  assert.match(battleCss, /\.battle \.bhand > \.bhandempty \{ position: absolute; left: 50%; top: var\(--wtop\); width: var\(--wcw\); height: calc\(var\(--wcw\) \/ \.71\)/);
});

test('a bag slot is as tall as what it says: empty = one line, worn = name with 卸下 beside it', () => {
  const pouch = read('../scripts/pouch.js');
  assert.match(pouch, /class="pworn\$\{empty \? ' empty' : ''\}"/);
  assert.match(css, /\.pworn\.empty, \.pworn\.ppouch \{ display: flex; align-items: baseline;/);
  assert.match(css, /\.pworn \.act \{ grid-column: 2; grid-row: 2;/);
  assert.match(css, /\.pwornrow \{[^}]*align-items: start;/, 'not stretched to the row');
  assert.match(css, /\.pwornrow > \.ppouch \{ grid-column: 1 \/ -1; \}/);
});
