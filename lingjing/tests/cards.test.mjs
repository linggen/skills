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
