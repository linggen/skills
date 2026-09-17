// Page words that are the page's only reading of Ling's reply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { yinyueLine } from '../scripts/cards.js';

test('Yinyue\'s line is read from the reply as she said it — the last one, plain — or not at all', () => {
  const reply = '你答“明”。\n\n**银月：**它让路了。走，山脚。\n\n潮水退至海底。\n\n**银月：** 做得好，清玄。\n\n修为 +40 · 灵石 +10';
  assert.equal(yinyueLine(reply), '做得好，清玄。');
  assert.equal(yinyueLine('**Yinyue:** Well *done*, Qingxuan.'), 'Well done, Qingxuan.');
  assert.equal(yinyueLine('银月察觉鼎在海底吸潮。'), null);
  assert.equal(yinyueLine(''), null);
});

test('the day\'s cast card: the coins wait with a word to Ling, then six lines as they fell with the grade and what it does', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = { ...loadWorld('jiuding'), hexagrams: loadWorld('jiuding').hexagrams.hexagrams };
  const ctx = (divination) => ({ look: { divination }, lang: 'zh', words: WORDS.zh, content });
  const waiting = cardHtml({ card: 'hexagram' }, ctx(null));
  assert.match(waiting, /今日未卜/);
  assert.match(waiting, /data-say="请银月起一卦">起一卦</);
  const cast = cardHtml({ card: 'hexagram' }, ctx({
    ask: { id: 'bout', name: '问斗法' }, throws: [[3, 3, 3], [2, 3, 3], [2, 2, 3], [2, 3, 3], [3, 3, 2], [2, 2, 2]],
    values: [9, 8, 7, 8, 8, 6], moving: [0, 5],
    hexagram: { id: 3, name: '屯', lines: [1, 0, 1, 0, 0, 0], judgment: '元亨，利贞。', image: '云雷，屯；君子以经纶。' },
    changed: { id: 8, name: '比' }, grade: { id: 'ill', name: '凶' }, effect: { wins_draw: 1, root: { id: 'wood', name: '木' } },
  }));
  assert.equal((cast.match(/class="yao /g) ?? []).length, 6);
  assert.equal((cast.match(/<em>[○×]<\/em>/g) ?? []).length, 2);
  assert.match(cast, /今日卦象 · 屯 · <span class="grade">凶<\/span>/);
  assert.match(cast, /之卦 · 比/);
  assert.match(cast, /问斗法<\/span> 木：胜局化平 ×1/);
  assert.equal((cast.match(/<b class="face">/g) ?? []).length, 3 + 2 + 1 + 2 + 2);
});

test('the 灵根 card takes the birthday for 命格 on the page, or shows the sign once set', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const w = loadWorld('jiuding');
  const content = { ...w, traits: w.traits };
  const ctx = (fate, extra = {}) => ({ look: { traits: { ids: ['wood', 'water', 'fire', 'earth'], name: '四灵根' }, fate }, lang: 'zh', words: WORDS.zh, content, ...extra });
  const form = cardHtml({ card: 'traits' }, ctx(null));
  assert.match(form, /<input type="date" id="fate-birth"/);
  assert.match(form, /data-fate="birth">定命格</); assert.match(form, /data-fate="random">随机</); assert.match(form, /data-fate="decline">不必了</);
  assert.match(form, /不入存档，不入对话/);
  assert.match(cardHtml({ card: 'traits' }, ctx({ declined: true })), /data-fate-open>定命格</);
  const set = cardHtml({ card: 'traits' }, ctx({ zodiac: { id: 'snake', name: '蛇' }, stem: { id: 'yi', name: '乙' }, element: { id: 'wood', name: '木' }, source: 'birth' }));
  assert.match(set, /属蛇 · 日主乙木 · 天生亲近木/);
  assert.doesNotMatch(set, /fate-birth/);
});

test('借势 armed: each root button says what it will count as', async () => {
  const { WORDS } = await import('../scripts/cards.js');
  const { duelHtml } = await import('../scripts/duel-card.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = loadWorld('jiuding');
  const exit = { game: { id: 'subdue-kui' }, duel: {
    creature: { name: '夔', root: 'water', root_name: '水' }, sword: null, charm: null,
    arts: [{ id: 'jieshi', name: '借势', effect: 'generate', ready: true }],
    kit: { roots: ['wood', 'water', 'fire', 'earth'], arts: { jieshi: { effect: 'generate', ready: true } } },
  } };
  const ctx = { lang: 'zh', words: WORDS.zh, content };
  const moves = ['water', 'water', 'water', 'water', 'water'];
  const plain = duelHtml(exit, { status: 'open', picks: [], moves, rounds: [] }, ctx);
  assert.doesNotMatch(plain, /→/);
  const armed = duelHtml(exit, { status: 'open', picks: ['art:jieshi'], moves, rounds: [] }, ctx);
  assert.match(armed, /借势已起/);
  assert.match(armed, /data-duel-pick="wood"[^>]*>木→火<small>火<\/small>/);
  assert.match(armed, /data-duel-pick="earth"[^>]*>土→金<small>金<\/small>/);
});

test('the page knows the cast\'s own question by the rules\' words, so the coins stay in the air through it', async () => {
  const { WORDS } = await import('../scripts/cards.js');
  const { askOf } = await import('../scripts/rules.mjs');
  const { loadContent } = await import('../scripts/content.mjs');
  const { newState } = await import('../scripts/state.mjs');
  const content = loadContent();
  for (const lang of ['zh', 'en']) {
    const s = newState(content, lang, new Date('2026-09-17T12:00:00Z'));
    assert.equal(askOf(content, s, { now: new Date('2026-09-17T12:00:00Z'), quests: [] }, { refused: 'needs-ask' }).question, WORDS[lang].castAsk);
  }
});
