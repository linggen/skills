// 斗法 on a phone (Hanli 2026-11-05, 狼 at 上山路 on a 430 pt iPhone: an empty band under the foe's row and over his own;
// six cards fanned so deep that 40% of each showed, the cost gems on each other). In the phone's room (battle.css
// @container scene ≤ 640px) the field is as tall as its ranks and the dock takes the rest; the hand is a grid — one row to
// five cards, two rows from six (3 · 4 · 5 · 6 a row) — never an overlap. Checked headless at 430×932 and 375×812 with
// 6 · 8 · 10 cards (every leaf whole, inside the room, above the band; a tap still raises).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../scripts/battle.css', import.meta.url), 'utf8');
const phone = css.slice(css.indexOf('@container scene (max-width: 640px) {'), css.indexOf('/* Motion is decoration'));

test('the phone\'s room gives its slack to the hand: the field as tall as its ranks, the dock the rest', () => {
  assert.match(phone, /\.battle \{ grid-template-rows: auto auto auto auto auto minmax\(0, 1fr\);/);
  assert.match(phone, /\.bfield \{ grid-template-rows: auto auto auto;/);
  assert.match(phone, /\.brank:not\(:has\(> \.bminion:not\(\.empty\)\)\) \{ height: calc\(var\(--mh\) \* \.62\); \}/, 'an empty rank is lower');
  assert.match(phone, /\.bdock \{ min-height: 0; display: flex; flex-direction: column; justify-content: flex-end;/);
});

test('the hand is a grid, never an overlap: one row to five, two rows from six', () => {
  assert.match(phone, /\.bhand \{ --k: 1;[^}]*display: grid; grid-template-columns: repeat\(var\(--k\), minmax\(0, var\(--cwm\)\)\);/);
  const k = (n) => (phone.match(new RegExp(`\\.bhand:has\\(> \\.bcard:nth-child\\(${n}\\)\\) \\{ --k: (\\d)`)) ?? [])[1];
  // A row's count for a hand of n cards, as the :has rules set it.
  const rowOf = (n) => { let r = 1; for (let i = 2; i <= n; i += 1) r = Number(k(i) ?? r); return r; };
  assert.deepEqual([1, 2, 3, 4, 5].map(rowOf), [1, 2, 3, 4, 5]);
  assert.deepEqual([6, 7, 8, 9, 10, 11, 12].map(rowOf), [3, 4, 4, 5, 5, 6, 6]);
  for (const n of [6, 7, 8, 9, 10, 11, 12]) assert.ok(Math.ceil(n / rowOf(n)) <= 2, `${n} cards in two rows`);
  assert.match(phone, /\.bhand > \.bcard \{ flex: none; width: auto; height: auto; aspect-ratio: 71 \/ 100; transform: none;/, 'no fan, no overlap');
  assert.match(phone, /\.bhand > \.bcard\.held \{ transform: translateY\(-14%\) scale\(1\.1\);/, 'a tap still raises it');
});
