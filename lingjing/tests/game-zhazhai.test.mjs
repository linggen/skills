// 砸寨 (games/zhazhai.js) — the re-skin of Angry Aliens. Phaser cannot run in node, so this checks what can be:
// the module's contract and words, its row in the 游戏厅, the vendored bundle and its licence, every asset the
// bundle asks for, the forts (games/zhazhai/levels.json, written by the build), and that the bundle was rebuilt
// after the last change to its source (tools/zhazhai/hash.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { meta, levelAsked, mount } from '../scripts/games/zhazhai.js';
import { sourceHash } from '../tools/zhazhai/hash.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'scripts/games/zhazhai');
const forts = JSON.parse(readFileSync(join(out, 'levels.json'), 'utf8'));

test('meta: a name and a how-line in both languages', () => {
  assert.equal(meta.id, 'zhazhai');
  for (const k of ['name', 'how']) assert.ok(meta[k].zh && meta[k].en, k);
  assert.equal(typeof mount, 'function');
});

test('the fort asked for: data.lv first, then the page’s ?lv=, else the title screen', () => {
  assert.equal(levelAsked({ lv: 3 }, '?lv=5'), 3);
  assert.equal(levelAsked({}, '?dev=1&game=zhazhai&lv=5'), 5);
  assert.equal(levelAsked({}, '?dev=1'), 0);
  assert.equal(levelAsked({}, '?lv=temple'), 0);
  assert.equal(levelAsked(undefined, ''), 0);
});

test('registered in the 游戏厅 as a throw (plays wide)', () => {
  const reg = JSON.parse(readFileSync(join(root, 'worlds/jiuding/games.json'), 'utf8'));
  const row = reg.games.find((g) => g.id === 'zhazhai');
  assert.ok(row, 'games.json row');
  assert.equal(row.mechanic, '投掷');
  assert.ok(reg.groups.some((g) => g.id === row.group), 'its group exists');
  assert.ok(!row.scene && !row.task, 'not placed in the story yet (after Hanli plays it)');
});

test('three to five forts, each winnable in kind: weasels to knock out, shots to do it with, words in both languages', () => {
  const { levels } = forts;
  assert.ok(levels.length >= 3 && levels.length <= 5, `${levels.length} forts`);
  levels.forEach((l, i) => {
    assert.equal(l.id, i + 1, 'ids run 1…n');
    assert.equal(l.theme, 'forest', 'one world, the re-skinned one');
    assert.ok(l.weasels.length >= 1 && l.shots.length >= 1 && l.blocks >= 1);
    for (const s of l.shots) assert.ok(['red', 'yellow', 'blue', 'black'].includes(s), `shot ${s} has a 砸寨 skin`);
    for (const lang of ['zh', 'en']) for (const k of ['name', 'description', 'teachingFocus']) assert.ok(l.words[lang][k], `${l.id} ${lang} ${k}`);
    assert.ok(l.stars.oneStar < l.stars.twoStars && l.stars.twoStars < l.stars.threeStars);
  });
  assert.ok(levels.some((l) => l.weasels.includes('LARGE')), 'the chief sits in one fort');
});

test('the bundle is vendored whole: MIT licence, versions named, parses as a module', () => {
  const bundle = readFileSync(join(out, 'zhazhai.min.mjs'), 'utf8');
  assert.match(bundle.slice(0, 400), /Angry Aliens \(MIT/);
  assert.match(bundle.slice(0, 400), /Phaser 3\.90\.0/);
  assert.match(readFileSync(join(out, 'LICENSE.txt'), 'utf8'), /MIT License/);
  assert.match(readFileSync(join(root, 'tools/zhazhai/LICENSE'), 'utf8'), /MIT License/);
  const pkg = JSON.parse(readFileSync(join(root, 'tools/zhazhai/package.json'), 'utf8'));
  for (const [name, v] of Object.entries(pkg.devDependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, `${name} pinned exactly`);
  for (const f of ['zhazhai.min.mjs', 'fragment-worker.min.mjs']) execFileSync(process.execPath, ['--check', join(out, f)]);
  assert.match(bundle, /fragment-worker\.min\.mjs/, 'the worker is loaded beside the bundle');
});

test('every asset the bundle loads is shipped beside it', () => {
  const bundle = readFileSync(join(out, 'zhazhai.min.mjs'), 'utf8');
  const paths = new Set([...bundle.matchAll(/"((?:atlases|audio|shaders|UI|art)\/[\w./-]+\.(?:png|json|frag|woff2?|ogg|webp))"/g)].map((m) => m[1]));
  assert.ok(paths.size >= 8, `found ${paths.size} asset paths`);
  for (const p of paths) assert.ok(existsSync(join(out, p)), p);
  for (const k of ['weasel-s', 'weasel-m', 'weasel-l', 'proj-stone', 'slingshot']) assert.ok(existsSync(join(out, 'art', `${k}.webp`)), k);
  const audio = JSON.parse(readFileSync(join(out, 'audio/sprites/sfx-master.json'), 'utf8'));
  for (const r of audio.resources) assert.ok(existsSync(join(out, 'audio/sprites', r.replace(/^.*\//, ''))), r);
});

test('the bundle was rebuilt after its source last changed (cd tools/zhazhai && npm run build)', () => {
  assert.equal(forts.source, sourceHash(join(root, 'tools/zhazhai')));
});
