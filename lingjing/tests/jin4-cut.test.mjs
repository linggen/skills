// 今 · 四 read whole (the 节本 cut retired 2026-10-26; these were its playtest 2026-10-15): a cut that drops the
// clause a sentence answers leaves it dangling on the stage — 「耳朵还没烧完」 with the line in her
// notebook that burned his ears cut away; 「收到最末那一只」 with no cups being cleared; 「她合上本子」
// two paragraphs from the last 阿禾. Each cut (`story`) either keeps the antecedent or loses the
// dangling words, in both languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const scene = (id) => Object.values(content.chapters).map((c) => c.scenes?.[id]).find(Boolean);

test('j09-final: no burning ears without the notebook line that burned them', () => {
  const { zh, en } = scene('j09-final').story;
  assert.ok(!zh.includes('耳朵还没烧完') || zh.includes('信一半'));
  assert.ok(!en.includes('ears had finished burning') || /half/i.test(en));
  assert.ok(zh.includes('今天第一百天') && en.includes('day one hundred'));
});

test('j09-dongzhi: the last cup comes while she clears the bench', () => {
  const { zh, en } = scene('j09-dongzhi').story;
  assert.match(zh, /收拾替补席，一只一只把纸杯收进垃圾袋，收到最末那一只/);
  assert.match(en, /cleared the bench, putting the paper cups one by one into a rubbish bag, and when she got to the last one/);
});

test('j09-noise: the notebook that closes on 「替补席上，你最准」 is named as hers', () => {
  const { zh, en } = scene('j09-noise').story;
  assert.match(zh, /阿禾的本子上只有一行：「沈芒　罚球 十投七。」\n\n她合上本子：「替补席上，你最准。」/);
  assert.match(en, /In Ahe's notebook there was only one line: [^\n]*\n\nShe shut the notebook/);
});
