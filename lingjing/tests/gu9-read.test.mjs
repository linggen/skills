// 古九 (h10, 01-ji) read on the live page, 2026-10-15 play-test: what the 节本 cut left the
// player unable to follow, and the plans that replayed when tapped again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../worlds/jiuding/chapters/01-ji/scenes');
const scene = (id) => JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8'));

test('邺城: the innkeeper names this year\'s bride before 「河伯要的是人，不是豆腐」, and the night\'s hammering is heard', () => {
  const ye = scene('01-ye').story;
  const q = ye.zh.indexOf('今年的媳妇，是谁'), a = ye.zh.indexOf('老胡家的闺女'), tofu = ye.zh.indexOf('不是豆腐');
  assert.ok(q >= 0 && q < a && a < tofu, 'the answer sits between the question and 「不是豆腐」');
  assert.ok(ye.zh.includes('刷漆、钉板'), '01-altar\'s 「头一夜河伯庙前敲了半夜的」 has its night');
  assert.ok(ye.en.includes("Old Hu's place") && ye.en.includes('nailing a boat'));
});

test('邺城: the two plans that fail are taken once each — never offered again to replay', () => {
  const ex = scene('01-ye').exits;
  for (const id of ['bribe', 'ghost']) {
    const e = ex.find((x) => x.id === id);
    assert.ok(e.stay && e.once && e.mark, id);
  }
  assert.ok(!ex.find((x) => x.id === 'shrine').once, 'the way on stays');
});

test('the four eyes are lanterns before 「灯笼沉下去」', () => {
  const take = scene('01-cauldron').exits.find((x) => x.id === 'take').story;
  for (const [t, intro, sink] of [[take.zh, '像四盏青色的灯笼', '灯笼沉下去'], [take.en, 'like four green lanterns', 'Once the lanterns had sunk']]) {
    assert.ok(t.indexOf(intro) >= 0 && t.indexOf(intro) < t.indexOf(sink), sink);
  }
});

test('城楼: 「凡人的嘴」 after 小满\'s line is said by the River Lord, by name', () => {
  const t = scene('01-tower').story;
  assert.ok(t.zh.includes('河伯低头看着他，又看了看阿禾。他道：「……凡人的嘴。」'));
  assert.ok(!t.zh.includes('」河伯道：「二十五年'), 'two lines of his are not glued together');
});
