// tests/phone-board.test.mjs — the board kit the phone app ships (tools/phone-board.mjs, tools/phone/board-kit.json):
// exactly what each of 第一回's boards needs to play in a local webview, closed over its imports, nothing of the rest of
// the skill; split into packs (one common, one per board) with every file in exactly one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARDS_JSON, boardFiles, boardsTable, importsOf, kitGames, kitPacks, packOf } from '../tools/phone-board.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = JSON.parse(fs.readFileSync(path.join(SKILL, 'tools/phone/board-kit.json'), 'utf8'));
const files = boardFiles('shouqiang');
const set = new Set(files);
const jsOf = (fs_) => fs_.filter((f) => /\.m?js$/.test(f) && !f.endsWith('phaser.min.mjs') && !f.includes('/vendor/'));
const js = jsOf(files);
const WORLD = path.join(SKILL, 'worlds/jiuding');
const scene = (id) => JSON.parse(fs.readFileSync(path.join(WORLD, 'chapters/00-prologue/scenes', `${id}.json`), 'utf8'));

test('the kit holds the host page, the game, its level and the shared sound kit', () => {
  for (const f of ['scripts/games/phone/index.html', 'scripts/games/phone/host.js', 'scripts/games/shouqiang.js', 'scripts/games/shouqiang/shouqiang.min.mjs',
    'scripts/games/shouqiang/core.js', 'scripts/games/shouqiang/art/baicai-bg.webp', 'scripts/vendor/phaser.min.mjs', 'worlds/jiuding/levels/shouqiang.json',
    'scripts/games/kit/sound.js', 'scripts/games/kit/audio/sounds.json', 'scripts/games/kit/audio/sfx.m4a']) assert.ok(set.has(f), `${f} is in the kit`);
});

test('every board of 第一回 the story stands is in the kit (00-fox: the fight room, kapai)', () => {
  const games = JSON.parse(fs.readFileSync(path.join(WORLD, 'tasks/world.json'), 'utf8')).tasks;
  const h01 = fs.readdirSync(path.join(WORLD, 'chapters/00-prologue/scenes')).map((f) => scene(f.replace('.json', ''))).filter((s) => s.hui === 'h01');
  const boards = h01.flatMap((s) => (s.show ?? []).filter((c) => c.card === 'board').map((c) => games.find((t) => t.id === c.id)?.game));
  assert.ok(boards.length >= 7, "the 回's boards");
  for (const g of boards) assert.ok(kitGames().includes(g), `${g} is in the kit`);
  assert.ok(h01.some((s) => s.exits.some((e) => e.game?.kind === 'duel')) && kitGames().includes('kapai'), 'the fight room');
});

for (const game of kitGames()) {
  const mine = boardFiles(game), have = new Set(mine), dynamic = new Set(KIT.games[game].dynamic ?? []);
  test(`${game}: every static import of every shipped script is shipped (the closure holds)`, () => {
    for (const f of jsOf(mine)) for (const dep of importsOf(path.join(SKILL, f))) assert.ok(have.has(path.relative(SKILL, dep).split(path.sep).join('/')), `${f} imports ${path.relative(SKILL, dep)}`);
  });
  test(`${game}: every file a shipped script names by URL is shipped, except what the kit lists as loaded on demand`, () => {
    for (const f of jsOf(mine)) {
      const text = fs.readFileSync(path.join(SKILL, f), 'utf8');
      for (const [, rel] of text.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) {
        if (rel.endsWith('/') || rel.startsWith('./boards.json')) continue; // a folder: its files are named by the data inside; the table is written
        const target = path.relative(SKILL, path.resolve(path.dirname(path.join(SKILL, f)), rel)).split(path.sep).join('/');
        // A module the shipped scripts name but this board never loads (the rest of a shared file's reach) is let be
        // only when it is another board of the kit; anything else must be here.
        if (/^scripts\/games\/[a-z]+\.js$/.test(target) && kitGames().includes(path.basename(target, '.js'))) continue;
        assert.ok(have.has(target) || dynamic.has(target), `${f} names ${target}`);
      }
    }
  });
}

test('every 大场面 第一回 lays under a beat ({景=id}) is in the kit as piece-<id>, played by the host page', () => {
  const h01 = fs.readdirSync(path.join(WORLD, 'chapters/00-prologue/scenes')).map((f) => scene(f.replace('.json', ''))).filter((s) => s.hui === 'h01');
  const pieces = new Set(h01.flatMap((s) => [...JSON.stringify(s).matchAll(/\{景=([a-z]+)\}/g)].map((m) => m[1])));
  assert.ok(pieces.size >= 3, "the 回's pieces");
  for (const id of pieces) {
    assert.equal(KIT.games[`piece-${id}`]?.piece, id, `${id} is in the kit`);
    assert.equal(boardsTable().games[`piece-${id}`].piece, id, `${id} is in the host's table`);
    const def = fs.readFileSync(path.join(SKILL, `scripts/setpieces/${id}.js`), 'utf8');
    const art = [...def.matchAll(/'(art\/[^']+\.webp)'/g)].map((m) => `worlds/jiuding/${m[1]}`);
    const have = new Set(boardFiles(`piece-${id}`));
    for (const f of [...art, 'scripts/setpiece.js', `scripts/setpieces/${id}.js`]) assert.ok(have.has(f), `${id} ships ${f}`);
  }
});

test("the fox's fight: every card it deals and its foe have their art in the kapai pack", () => {
  const fox = scene('00-fox').exits.find((e) => e.game?.kind === 'duel').game;
  const cards = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(WORLD, 'cards.json'), 'utf8')).cards.map((c) => [c.id, c]));
  const creature = JSON.parse(fs.readFileSync(path.join(WORLD, 'creatures.json'), 'utf8')).creatures.find((c) => c.id === fox.creature);
  const kapai = new Set(boardFiles('kapai'));
  // The starter hand (娘烙的饼) is the rules' (cards.mjs fightSetup, rootless before 入门): checked by name here.
  for (const id of ['niangbing', ...fox.foe.deck, ...fox.foe.extra]) assert.ok(kapai.has(`worlds/jiuding/${cards[id].art}`), `${id}'s art`);
  assert.ok(kapai.has(`worlds/jiuding/${creature.art}`), "the foe's art");
});

test('packs: every file in exactly one, the host page and the table in the common one, within a budget', () => {
  const { common, games } = kitPacks();
  const seen = new Map();
  for (const [name, list] of [['common', common], ...Object.entries(games)]) for (const f of list) {
    assert.ok(!seen.has(f), `${f} in ${seen.get(f)} and ${name}`);
    seen.set(f, name);
  }
  for (const id of kitGames()) for (const f of boardFiles(id)) assert.ok(seen.get(f) === 'common' || seen.get(f) === id, `${id} needs ${f}`);
  assert.ok(common.includes('scripts/games/phone/host.js') && common.includes('scripts/games/kit/sound.js'));
  assert.deepEqual(Object.keys(boardsTable().games).sort(), kitGames().sort());
  assert.equal(BOARDS_JSON, 'scripts/games/phone/boards.json');
  const bytes = [...seen.keys()].reduce((n, f) => n + fs.statSync(path.join(SKILL, f)).size, 0);
  // 第一回's eight boards, the fight and its three 大场面 (10-26: ~17.8 MB; the pieces' paintings and Pixi are ~3.5 MB of it).
  assert.ok(bytes < 20 * 1024 * 1024, `all packs ${bytes} B`);
});

test('nothing outside the kit: no other game, no art of another board, within a budget', () => {
  assert.ok(files.every((f) => !f.startsWith('scripts/games/zhazhai/') && !f.startsWith('scripts/games/sadou') && !f.startsWith('worlds/jiuding/chapters/')));
  for (const id of kitGames()) assert.ok(!boardFiles(id).includes('scripts/games/jieyin/helper.js'), `${id}: the camera 结印 is not on the phone yet`);
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
