// Live 2026-10-15 (古五): a 看 chip tapped in the box threw the passage view back to its top, and the
// finding's label ran into its text. A repaint of the same beat keeps its scroll; the label has its gap.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');

test('a repaint of the same beat keeps the box scrolled where it stood', () => {
  const page = read('lingjing.js');
  const paint = page.slice(page.indexOf('function paintIf('), page.indexOf('\n}\n', page.indexOf('function paintIf(')));
  assert.match(paint, /const kept = keptScroll\(\$\(id\)\);\n\s+\$\(id\)\.innerHTML = html;\n\s+kept\(\);/);
  assert.match(page, /const KEEP_SCROLL = \['\.story \.wayacts', '\.story \.wholecol'\]/);
  assert.match(page, /dataset\.story !== beat\) return;/, 'a new beat starts at the top');
});

test('a finding in the box: its label stands apart from its text', () => {
  assert.match(read('story.css'), /\.story \.wayacts \.lookfound li b \{[^}]*margin-right: \.6em/);
});

// 古五 (2026-10-15): inside the 秘境 the 事 goal ended 「→ 断崖下 · 徐州」 — the province he stands in.
test('the 事 goal names a province only when it is not the one he stands in', async () => {
  const { bookPopHtml, WORDS } = await import('../scripts/cards.js');
  const look = (here) => ({ waypoint: { text: '去断崖下', place: { id: 'x', name: '断崖下' }, province: '徐州' }, place: { id: 'y', province: { id: 'xu', name: here } }, book: [], tasks: [] });
  const html = (here) => bookPopHtml({ look: look(here), words: WORDS.zh, lang: 'zh' });
  assert.doesNotMatch(html('徐州'), /断崖下 · 徐州/);
  assert.match(html('徐州'), /→ 断崖下/);
  assert.match(html('冀州'), /断崖下 · 徐州/);
});

// 息珠 and 龙须草 are found inside 'swallow''s passage: their cards never stand on walking into the 石室.
test('息珠 and 龙须草 are met after wm-xirang, not on entering it', () => {
  const codex = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/codex.json', import.meta.url), 'utf8'));
  for (const id of ['xizhu', 'longxu-cao']) assert.equal(codex.entries[id].first.scene, 'wm-kaikai', id);
});

// The 秘境's rise: 二层圆满 in the night, 四层 by noon — one seal, the realm he stands in.
test('two rises before the seal is up are one seal, with the latest realm', () => {
  const page = read('lingjing.js');
  const body = page.slice(page.indexOf('function feat('), page.indexOf('\nfunction featNow('));
  assert.match(body, /if \(kind === 'rise' && risePending\) \{/);
  assert.match(body, /const latest = risePending \?\? args; risePending = null; featNow\(\.\.\.latest\)/);
});
