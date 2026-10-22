// 砸寨 (games/zhazhai.js) — the re-skin of Angry Aliens, the one throw kit. Phaser cannot run in node, so this checks
// what can be: the module's contract and words, its row in the 游戏厅, the vendored bundle and its licence, every asset
// the bundle asks for, the forts and the story's throws (games/zhazhai/levels.json, written by the build), the story
// beats that point at them, and that the bundle was rebuilt after the last change to its source (tools/zhazhai/hash.mjs).
// With playwright installed (cd tools && npm install), the levels are played in headless Chromium by the bot's hands
// (tools/zhazhai/bot.mjs): each story throw won by a sensible hand and not by a lazy one, each later one tighter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { meta, levelAsked, gradeOf, mount } from '../scripts/games/zhazhai.js';
import { sourceHash } from '../tools/zhazhai/hash.mjs';
import { fieldOf, playLevel, playwrightOrNull, serve, windowOf } from '../tools/zhazhai/bot.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'scripts/games/zhazhai');
const forts = JSON.parse(readFileSync(join(out, 'levels.json'), 'utf8'));

test('meta: a name and a how-line in both languages', () => {
  assert.equal(meta.id, 'zhazhai');
  for (const k of ['name', 'how']) assert.ok(meta[k].zh && meta[k].en, k);
  assert.equal(typeof mount, 'function');
});

test('the level asked for: data.lv first, then the page’s ?lv=; a fort by number, a throw by key; else the title screen', () => {
  assert.equal(levelAsked({ lv: 3 }, '?lv=5'), 3);
  assert.equal(levelAsked({}, '?dev=1&game=zhazhai&lv=5'), 5);
  assert.equal(levelAsked({ lv: 'deer-wind' }, '?lv=2'), 'deer-wind');
  assert.equal(levelAsked({}, '?dev=1&game=zhazhai&lv=yishui-reed'), 'yishui-reed');
  assert.equal(levelAsked({}, '?dev=1'), 0);
  assert.equal(levelAsked({}, '?lv=Temple%20door!'), 0);
  assert.equal(levelAsked(undefined, ''), 0);
});

test('a won level’s grade for the story: the task’s `grades` maps stars to it', () => {
  const grades = { 3: 'still', 2: 'still', 1: 'hasty' };
  assert.equal(gradeOf(grades, 3), 'still');
  assert.equal(gradeOf(grades, 1), 'hasty');
  assert.equal(gradeOf(undefined, 3), undefined);
});

test('registered in the 游戏厅 as a throw (plays wide); the story’s throw beats play its levels by key', () => {
  const reg = JSON.parse(readFileSync(join(root, 'worlds/jiuding/games.json'), 'utf8'));
  const row = reg.games.find((g) => g.id === 'zhazhai');
  assert.ok(row, 'games.json row');
  assert.equal(row.mechanic, '投掷');
  assert.ok(reg.groups.some((g) => g.id === row.group), 'its group exists');
  for (const gone of ['deerarc', 'luwing', 'throwkit', 'caveecho', 'deerhunt', 'deer']) assert.ok(!reg.games.some((g) => g.id === gone && g.replaced !== 'cut'), `${gone}: retired, 砸寨 plays it`);
  assert.equal(reg.projectiles, undefined, 'the old board’s projectile table went with it');
  const tasks = ['world', 'h08', 'h11'].flatMap((f) => JSON.parse(readFileSync(join(root, `worlds/jiuding/tasks/${f}.json`), 'utf8')).tasks);
  const keys = new Set(forts.levels.filter((l) => l.key).map((l) => l.key));
  const beats = Object.fromEntries(tasks.filter((t) => t.game === 'zhazhai').map((t) => [t.id, t.deal?.lv]));
  // + the 调息 cut (2026-10-20): 讲堂试法 on 第六回's 讲堂 board, 投一个给我看看 on 今一's.
  assert.deepEqual(beats, { 'deer-wind': 'deer-wind', 'anhe-dark': 'anhe-dark', 'qianye-qiajue': 'jiangtang', 'yishui-reed': 'yishui-reed', 'jin-toulan': 'toulan', 'jin-whiteline': 'faqiu' });
  for (const lv of Object.values(beats)) assert.ok(keys.has(lv), `${lv}: a level of the build`);
  // The marks a beat reads come from its grades.
  const reed = tasks.find((t) => t.id === 'yishui-reed');
  for (const g of Object.values(reed.deal.grades)) assert.ok(Object.hasOwn(reed.marks, g), `grade ${g} is one of its marks`);
});

test('the story’s throws: the book’s place, target and the one thing 小满 has there (the card law)', () => {
  const byKey = Object.fromEntries(forts.levels.filter((l) => l.key).map((l) => [l.key, l]));
  // 第二回: grandfather's bow, before 三试 (no 石子 card yet), no flying sword (bought in 古七).
  assert.deepEqual(byKey['deer-wind'].shots, ['arrow', 'arrow', 'arrow']);
  assert.equal(byKey['deer-wind'].target, 'deer');
  assert.equal(byKey['deer-wind'].place, 'creek');
  // 第五回 暗河: the pebble off the floor, then the bow he carried in — a stone to draw the light, an arrow at it, twice.
  assert.deepEqual(byKey['anhe-dark'].shots, ['red', 'arrow', 'red', 'arrow']);
  assert.equal(byKey['anhe-dark'].target, 'gourd');
  assert.equal(byKey['anhe-dark'].place, 'anhe');
  // 古七: the short flying sword he bought from 钱掌柜 that winter.
  assert.deepEqual(byKey['yishui-reed'].shots, ['yellow', 'yellow', 'yellow']);
  assert.equal(byKey['yishui-reed'].target, 'lu');
  assert.equal(byKey['yishui-reed'].place, 'shoal');
  // 第六回 讲堂试法 (the 调息 cut): the spells 褚先生 taught, four throws for his 四层 — 「扔一回，丹田便空一截」.
  assert.deepEqual(byKey.jiangtang.shots, ['fire', 'ice', 'metal', 'fire']);
  assert.equal(byKey.jiangtang.target, 'still');
  assert.equal(byKey.jiangtang.place, 'jiangtang');
  // 今一 「你投一个给我看看」: 沈芒's, the ball, over the board onto 马小宝's 摇杯.
  assert.deepEqual(byKey.toulan.shots, ['ball', 'ball', 'ball']);
  assert.equal(byKey.toulan.target, 'still');
  assert.equal(byKey.toulan.place, 'campus');
  for (const a of ['dummy', 'proj-fire', 'proj-ice', 'proj-metal', 'prop-bench', 'shaker', 'proj-ball', 'prop-hoop', 'prop-table']) assert.ok([...byKey.jiangtang.art, ...byKey.toulan.art].includes(a), a);
  for (const l of Object.values(byKey)) {
    // Wood and stone by a stream or on a shoal — no tiles, iron or powder kegs (Hanli 10-19: no temple doors in a forest).
    for (const m of l.materials) assert.ok(['wood', 'stone'].includes(m), `${l.key}: ${m}`);
    for (const lang of ['zh', 'en']) for (const k of ['name', 'description', 'teachingFocus']) assert.ok(l.words[lang][k], `${l.key} ${lang} ${k}`);
    for (const a of l.art) assert.ok(existsSync(join(out, 'art', `${a}.webp`)), `${l.key}: art/${a}.webp`);
  }
});

test('five forts, each winnable in kind: weasels to knock out, shots to do it with, words in both languages', () => {
  const levels = forts.levels.filter((l) => !l.key);
  assert.equal(levels.length, 5, `${levels.length} forts`);
  levels.forEach((l, i) => {
    assert.equal(l.id, i + 1, 'ids run 1…n');
    assert.equal(l.theme, 'forest', 'one world, the re-skinned one');
    assert.ok(l.weasels.length >= 1 && l.shots.length >= 1 && l.blocks >= 1);
    for (const s of l.shots) assert.ok(['red', 'yellow', 'blue', 'black', 'arrow'].includes(s), `shot ${s} has a 砸寨 skin`);
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
  for (const k of ['weasel-s', 'weasel-m', 'weasel-l', 'proj-stone', 'slingshot', 'proj-arrow', 'deer-graze', 'lu-shut', 'place-creek', 'place-shoal']) assert.ok(existsSync(join(out, 'art', `${k}.webp`)), k);
  // Its sounds are the shell's shared bank (games/kit/audio, Hanli 10-22): no sprite of its own, no Phaser audio.
  assert.equal(existsSync(join(out, 'audio')), false, 'no audio copy of its own');
  assert.doesNotMatch(bundle, /audio\/sprites\/sfx-master/);
  assert.match(bundle, /noAudio:\s*!0/);
});

test('the bundle was rebuilt after its source last changed (cd tools/zhazhai && npm run build)', () => {
  assert.equal(forts.source, sourceHash(join(root, 'tools/zhazhai')));
});

// The levels played: headless Chromium on the built bundle, under a fake clock (tools/zhazhai/bot.mjs). Skipped without
// playwright (CI installs none); run it before a push that touches tools/zhazhai.
const pw = playwrightOrNull();
const STORY = ['deer-wind', 'toulan', 'faqiu', 'anhe-dark', 'jiangtang', 'yishui-reed']; // story order: 第二回, 今一, 今二 (Hanli 10-22: 「改成玩」), 第五回, 第六回, 古七
test('each story throw is won by a sensible hand and not by a lazy one, and each is tighter than the one before', { skip: !pw && 'playwright not installed (cd tools && npm install)', timeout: 900000 }, async () => {
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    let room = Infinity;
    for (const lv of STORY) {
      const field = await fieldOf(browser, srv.url, lv);
      assert.ok(field, `${lv}: the level starts`);
      const w = windowOf(field);
      assert.ok(w > 0 && w < room, `${lv}: room for a first throw ${(w * 100).toFixed(2)}% (the one before: ${(room * 100).toFixed(2)}%)`);
      room = w;
      const sensible = [], lazy = [];
      for (const seed of [1, 2, 3]) sensible.push(await playLevel(browser, srv.url, lv, 'sensible', seed));
      for (const seed of [1, 2]) lazy.push(await playLevel(browser, srv.url, lv, 'lazy', seed));
      assert.ok(sensible.filter((r) => r.won).length >= 2, `${lv}: sensible ${JSON.stringify(sensible)}`);
      assert.equal(lazy.filter((r) => r.won).length, 0, `${lv}: lazy ${JSON.stringify(lazy)}`);
      for (const r of [...sensible, ...lazy]) assert.ok(!r.errors?.length && !r.failed, `${lv}: no page error ${JSON.stringify(r)}`);
    }
  } finally {
    await browser.close();
    srv.close();
  }
});

// Live 2026-10-21: `Texture "zz-proj-fire" has no frame` — Bird.ts asked a thing's own painting (texOf: no frame)
// for a frame by its skin key. What is its own picture is measured whole, as skin.ts sizeOf does.
test('a thing that is its own painting is never asked for a frame by its skin key', () => {
  const bird = readFileSync(join(root, 'tools/zhazhai/src/objects/Bird.ts'), 'utf8');
  assert.doesNotMatch(bird, /texture\.get\(assetKey\)/);
  assert.match(bird, /texFrame \? texture\.get\(texFrame\) : null/);
});
