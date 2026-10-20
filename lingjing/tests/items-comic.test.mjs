// The comic item set (2026-10-20, Hanli: 「A, 画一套漫画风的道具」; tools/paint-items-comic-flux.py), kept for the small
// games to come after 割藤 was deleted with the 饭桶's old play (10-20): every icon the table names is on disk, and an
// id outside the set has none (the caller draws its own glyph).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { comicArt } from '../scripts/games/items-comic.js';

test('the comic item set: its icons by id exist on disk; an id outside it gets none', () => {
  const src = fs.readFileSync(new URL('../scripts/games/items-comic.js', import.meta.url), 'utf8');
  const ids = JSON.parse(src.match(/new Set\((\[[^\]]*\])\)/)[1]);
  assert.ok(ids.length > 50, `${ids.length} icons`);
  for (const id of ids) assert.ok(fs.existsSync(fileURLToPath(comicArt(id))), `${id}: art/items-comic/${id}.webp`);
  for (const id of ['lingzhi', 'dingtai', 'chaihuo']) assert.match(comicArt(id), new RegExp(`items-comic/${id}\\.webp$`));
  assert.equal(comicArt('no-such'), null);
  assert.equal(comicArt(undefined), null);
});
