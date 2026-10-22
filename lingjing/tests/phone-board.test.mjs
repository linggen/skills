// tests/phone-board.test.mjs — the board kit the phone app ships (tools/phone-board.mjs, tools/phone/board-kit.json):
// exactly what 守白菜 needs to play in a local webview, closed over its imports, nothing of the rest of the skill.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardFiles, importsOf, packOf } from '../tools/phone-board.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = JSON.parse(fs.readFileSync(path.join(SKILL, 'tools/phone/board-kit.json'), 'utf8'));
const files = boardFiles('shouqiang');
const set = new Set(files);
const js = files.filter((f) => /\.m?js$/.test(f) && !f.endsWith('phaser.min.mjs'));

test('the kit holds the host page, the game, its level and the shared sound kit', () => {
  for (const f of ['scripts/games/phone/index.html', 'scripts/games/phone/host.js', 'scripts/games/shouqiang.js', 'scripts/games/shouqiang/shouqiang.min.mjs',
    'scripts/games/shouqiang/core.js', 'scripts/games/shouqiang/art/baicai-bg.webp', 'scripts/vendor/phaser.min.mjs', 'worlds/jiuding/levels/shouqiang.json',
    'scripts/games/kit/sound.js', 'scripts/games/kit/audio/sounds.json', 'scripts/games/kit/audio/sfx.m4a']) assert.ok(set.has(f), `${f} is in the kit`);
});

test('every static import of every shipped script is shipped (the closure holds)', () => {
  for (const f of js) for (const dep of importsOf(path.join(SKILL, f))) assert.ok(set.has(path.relative(SKILL, dep).split(path.sep).join('/')), `${f} imports ${path.relative(SKILL, dep)}`);
});

test('every file a shipped script names by URL is shipped, except what the kit lists as loaded on demand', () => {
  const dynamic = new Set(KIT.games.shouqiang.dynamic);
  for (const f of js) {
    const text = fs.readFileSync(path.join(SKILL, f), 'utf8');
    for (const [, rel] of text.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) {
      if (rel.endsWith('/')) continue; // a folder: its files are named by the data inside
      const target = path.relative(SKILL, path.resolve(path.dirname(path.join(SKILL, f)), rel)).split(path.sep).join('/');
      assert.ok(set.has(target) || dynamic.has(target), `${f} names ${target}`);
    }
  }
});

test('nothing outside the kit: no other game, no art of another board, within a budget', () => {
  assert.ok(files.every((f) => !f.startsWith('scripts/games/zhazhai/') && !f.startsWith('scripts/games/sadou') && !f.startsWith('worlds/jiuding/chapters/')));
  assert.ok(!set.has('scripts/games/jieyin/helper.js'), 'the camera 结印 is not on the phone yet');
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(SKILL, f)).size, 0);
  assert.ok(bytes < 6 * 1024 * 1024, `kit is ${bytes} B`);
});

test('the pack holds every file byte for byte', () => {
  const { pack, manifest } = packOf(files);
  const head = pack.readUInt32BE(0);
  assert.deepEqual(JSON.parse(pack.subarray(4, 4 + head).toString('utf8')), manifest);
  for (const f of files) {
    const [at, len] = manifest[`/${f}`];
    assert.ok(pack.subarray(4 + head + at, 4 + head + at + len).equals(fs.readFileSync(path.join(SKILL, f))), f);
  }
});
