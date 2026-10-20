// 喂饭桶 · 开炉 (games/kailu.js): the Phaser bundle is built from its source, the module keeps the small-game contract
// and loads in node (Phaser only inside mount), and the 游戏厅's sample rolls the same pure table the rules do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { sourceHash } from '../tools/kailu/hash.mjs';
import * as kailu from '../scripts/games/kailu.js';
import { roll } from '../scripts/rules/fantong-roll.mjs';
import { rollFeed } from '../scripts/rules/fantong.mjs';
import { loadContent } from '../scripts/content.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url);

test('the bundle is built from the source as it stands, with its art and font beside it', () => {
  const src = JSON.parse(readFileSync(at('scripts/games/kailu/source.json'), 'utf8'));
  assert.equal(src.source, sourceHash(at('tools/kailu/').pathname), 'rebuild: cd tools/kailu && npm run build');
  for (const f of ['kailu.min.mjs', 'art/pot-open.webp', 'art/pot-shut.webp', 'art/woodpile.webp', 'font/zcool-kuaile.woff2', 'font/OFL.txt']) assert.ok(existsSync(at(`scripts/games/kailu/${f}`)), f);
  const bundle = readFileSync(at('scripts/games/kailu/kailu.min.mjs'), 'utf8');
  assert.match(bundle, /vendor\/phaser\.min\.mjs/, 'the one shared Phaser, not a copy');
  // Every item name the bucket can show is in the font subset.
  const chars = new Set(readFileSync(at('scripts/games/kailu/font/chars.txt'), 'utf8'));
  const content = loadContent();
  for (const i of content.items.items) for (const ch of i.name.zh) assert.ok(chars.has(ch), `${i.id}: ${ch}`);
});

test('the module: a mount() and its words; no Phaser until mounted', () => {
  assert.equal(typeof kailu.mount, 'function');
  assert.equal(kailu.meta.id, 'kailu');
  assert.ok(kailu.meta.name.zh && kailu.meta.how.zh && kailu.meta.how.en);
  assert.equal(typeof kailu.iconOf('qi-pill'), 'string', 'a comic icon for a pill');
});

test('the 游戏厅\'s bare roll is the rules\' own roll', () => {
  const t = loadContent().fantong;
  for (let i = 0; i < 50; i++) {
    const o = { seed: `same|${i}`, ids: ['yaodan-1', 'huangjing'], lingshi: 1, realm: 1 };
    assert.deepEqual(roll(t, o), rollFeed(t, o));
  }
});
