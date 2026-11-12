import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { paintBeta } from '../scripts/beta.js';

const read = (file) => fs.readFileSync(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
const lines = {
  zh: ['测试版', '灵境还在测试。内容会调整，进度可能不保留。'],
  en: ['Beta', 'Lingjing is in beta. The game is still changing, and progress may not carry over.'],
};
for (const [lang, [tag, sentence]] of Object.entries(lines)) {
  test(`top bar paints the ${lang} beta tag and notice`, () => {
    const nodes = { betaTag: {}, betaNote: {} };
    paintBeta({ getElementById: (id) => nodes[id] }, lang);
    assert.equal(nodes.betaTag.textContent, tag);
    assert.equal(nodes.betaTag.title, sentence);
    assert.equal(nodes.betaNote.textContent, sentence);
  });
}
test('settings places the localized line immediately under its heading', () => {
  const html = read('settings.html');
  assert.match(html, /<h1[^>]*>[^<]*<\/h1>\s*<p class="beta-note" id="betaNote">/);
  assert.match(html, /betaWords\(en \? 'en' : 'zh'\)\.sentence/);
  assert.ok(html.includes(lines.zh[1]));
});
test('tag remains in the header and visible on newer saves and in story lock', () => {
  assert.match(read('index.html'), /<header class="topbar">[\s\S]*?id="betaTag"[\s\S]*?<\/header>/);
  assert.match(read('lingjing.css'), /body\[data-newer\] \.beta-tag\s*\{\s*visibility:\s*visible/);
  assert.doesNotMatch(read('story.css'), /body\.storylock[^\{]*\.beta-tag/);
});
