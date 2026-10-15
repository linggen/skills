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
