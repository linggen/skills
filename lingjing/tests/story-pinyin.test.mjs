import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storyHtml, logHtml, storyPinyin, withTold, wholeOf } from '../scripts/dialogue.js';
import { paraKey } from '../scripts/pingshu.js';
import { plainOf } from '../scripts/book-diff.js';

const creatures = JSON.parse(readFileSync(new URL('../worlds/jiuding/creatures.json', import.meta.url))).creatures;
const annotate = storyPinyin([...creatures, { name: { zh: '异兽' }, pinyin: 'yì' }]);
const ruby = '<ruby class="py">犰<rt>qiú</rt></ruby><ruby class="py">狳<rt>yú</rt></ruby>';
const text = '犰狳，见人则眠。异兽。';
const beat = { text, name: '说书人', recap: true };
const reading = withTold(null, [{ of: 'scene', id: 'a', beats: { zh: [beat, { text: '后来。' }], en: [{ text: '犰狳 rests.' }] } }], 'a');

test('Chinese stage, full passage, last line and log annotate story prose only', () => {
  assert.ok(storyHtml(reading, { pinyin: annotate }).includes(ruby));
  assert.ok(storyHtml(wholeOf(reading), { pinyin: annotate }).includes(ruby));
  assert.ok(logHtml(reading, { pinyin: annotate }).includes(ruby));
  assert.ok(storyHtml({ ...reading, j: 1, items: [{ ...reading.items[0], beats: { zh: [beat], en: [] } }] }, { pinyin: annotate, acts: '<button>犰狳</button>' }).includes('<button>犰狳</button>'));
  assert.ok(storyHtml(reading, { pinyin: annotate }).includes('异兽'));
});

test('English is unchanged and existing ruby is not nested', () => {
  assert.equal(storyHtml(reading, { lang: 'en', pinyin: annotate }), storyHtml(reading, { lang: 'en' }));
  assert.equal(logHtml(reading, { lang: 'en', pinyin: annotate }), logHtml(reading, { lang: 'en' }));
  assert.equal(annotate(ruby), ruby);
});

test('plain passage and speech keys stay unchanged', () => {
  assert.equal(beat.text, text);
  assert.equal(plainOf('[犰狳]{注=qiuyu}，见人则眠。'), '犰狳，见人则眠。');
  assert.equal(paraKey('[犰狳]{注=qiuyu}，见人则眠。'), paraKey('犰狳，见人则眠。'));
  assert.ok(!beat.text.includes('<ruby'));
});
