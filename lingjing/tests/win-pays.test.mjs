// 古五 (2026-10-15): a board won moved only the header. Every win shows what it paid: a fight's 所得
// (settleBout), and a board's — 修为 · 灵石, the thing granted, the task's own line (payWin).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORDS, spoilsHtml } from '../scripts/battle-card.js';

const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
const body = (name) => page.slice(page.indexOf(`function ${name}(`), page.indexOf('\n}\n', page.indexOf(`function ${name}(`)));

test('a board won stands its 所得: the pay, the item, the line', () => {
  assert.match(body('payWin'), /else if \(r\.ok && boardPaid\(r\)\) keep\(\{ spoils: \{[^}]*paid: r\.paid[^}]*line: r\.line \?\? null \} \}\)/);
  assert.match(page, /const boardPaid = \(r\) => Boolean\(r\.paid\?\.progress \|\| r\.paid\?\.wealth/);
  const html = spoilsHtml({ cards: [], items: [{ name: '灵芝', n: 1 }], paid: { progress: 12, wealth: 3 }, spent: [], line: '洛书成了。' }, { words: WORDS.zh, catalog: {}, lang: 'zh' });
  assert.match(html, /修为 \+12 · 灵石 \+3/);
  assert.match(html, /灵芝/);
  assert.match(html, /洛书成了。/);
});

test('a fight won stands its 所得 when it paid', () => {
  assert.match(body('settleBout'), /r\.paid\?\.progress \|\| r\.paid\?\.wealth/);
  assert.match(body('settleBout'), /keep\(\{ spoils: \{/);
});
