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
