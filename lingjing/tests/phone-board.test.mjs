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

// 卷一: every chapter whose `juan` is 1 (蒙山 · 外门 · 筑基 · 冀州), 古 and 今 alike (doc/lingjing-phone.md step 2).
const CHAPTERS = path.join(WORLD, 'chapters');
const juan1 = fs.readdirSync(CHAPTERS).filter((c) => JSON.parse(fs.readFileSync(path.join(CHAPTERS, c, 'chapter.json'), 'utf8')).juan === 1);
const scenes1 = juan1.flatMap((c) => fs.readdirSync(path.join(CHAPTERS, c, 'scenes')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(CHAPTERS, c, 'scenes', f), 'utf8'))));
const TASKS = fs.readdirSync(path.join(WORLD, 'tasks')).flatMap((f) => JSON.parse(fs.readFileSync(path.join(WORLD, 'tasks', f), 'utf8')).tasks ?? []);
const taskOf = (id) => TASKS.find((t) => t.id === id);

test('every board 卷一 stands is in the kit (a board missing here is a 「在 Mac 上玩」 on the phone: add it to tools/phone/board-kit.json)', () => {
  const boards = scenes1.flatMap((s) => (s.show ?? []).filter((c) => c.card === 'board').map((c) => [s.id, c.id, taskOf(c.id)?.game]));
  assert.ok(boards.length >= 60, "卷一's boards");
  for (const [scene, id, g] of boards) assert.ok(g && kitGames().includes(g), `${scene} · ${id}: ${g} is in the kit`);
  assert.ok(scenes1.some((s) => (s.exits ?? []).some((e) => e.game?.kind === 'duel')) && kitGames().includes('kapai'), 'the fight room');
});

test("the day's boards (兽潮 · 本王考考你 …), the 秘境's and the 奇遇's are in the kit (the camera 结印 is the Mac's)", () => {
  const live = new Set(JSON.parse(fs.readFileSync(path.join(WORLD, 'games.json'), 'utf8')).games.filter((g) => g.group !== 'old').map((g) => g.id));
  const day = TASKS.filter((t) => t.kind === 'board' && t.period && live.has(t.game) && !['lianliankan', 'jieyin'].includes(t.game));
  assert.ok(day.some((t) => t.id === 'shouchao') && day.some((t) => t.id === 'benwang-kao'), 'the tide and the 考');
  for (const t of day) assert.ok(kitGames().includes(t.game), `${t.id}: ${t.game} is in the kit`);
  for (const g of ['shoulu', 'sadou', 'huarong', 'wuziqi', 'luoshu', 'pintu', 'kailu']) assert.ok(kitGames().includes(g), `${g} is in the kit`);
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

test('every 大场面 卷一 lays under a beat ({景=id}) is in the kit as piece-<id>, played by the host page', () => {
  const pieces = new Set([...scenes1, ...TASKS].flatMap((s) => [...JSON.stringify(s).matchAll(/\{景=([a-z]+)\}/g)].map((m) => m[1])));
  assert.ok(pieces.size >= 8, "卷一's pieces");
  for (const id of pieces) {
    assert.equal(KIT.games[`piece-${id}`]?.piece, id, `${id} is in the kit`);
    assert.equal(boardsTable().games[`piece-${id}`].piece, id, `${id} is in the host's table`);
    const def = fs.readFileSync(path.join(SKILL, `scripts/setpieces/${id}.js`), 'utf8');
    const art = [...def.matchAll(/'(art\/[^']+\.webp)'/g)].map((m) => `worlds/jiuding/${m[1]}`);
    const have = new Set(boardFiles(`piece-${id}`));
    for (const f of [...art, 'scripts/setpiece.js', `scripts/setpieces/${id}.js`]) assert.ok(have.has(f), `${id} ships ${f}`);
  }
});

test("卷一's fights: every card a foe deals, and the foe, have their art in the kapai pack; so has every card", () => {
  const cards = JSON.parse(fs.readFileSync(path.join(WORLD, 'cards.json'), 'utf8')).cards;
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const creatures = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(WORLD, 'creatures.json'), 'utf8')).creatures.map((c) => [c.id, c]));
  const kapai = new Set(boardFiles('kapai'));
  const fights = scenes1.flatMap((s) => (s.exits ?? []).filter((e) => e.game?.kind === 'duel').map((e) => e.game));
  assert.ok(fights.length >= 10, "卷一's fights");
  for (const f of fights) {
    for (const id of [...(f.foe?.deck ?? []), ...(f.foe?.extra ?? [])]) if (byId[id]?.art) assert.ok(kapai.has(`worlds/jiuding/${byId[id].art}`), `${f.id}: ${id}'s art`);
    const c = creatures[f.creature];
    if (c?.art) assert.ok(kapai.has(`worlds/jiuding/${c.art}`), `${f.id}: the foe's art`);
  }
  // The 丹囊's pills are named from the fight table (games/kapai.js ctxOf `pillNames`), never their ids.
  assert.ok(kapai.has('worlds/jiuding/levels/kapai.json'), "the fight table (the pills' names)");
  // A hand grows across the story (the 书 · 游戏 cards of doc/cards.md): every card with art ships.
  for (const c of cards) if (c.art && fs.existsSync(path.join(WORLD, c.art))) assert.ok(kapai.has(`worlds/jiuding/${c.art}`) || boardFiles('kapai').length === 0, `${c.id}'s art`);
});

// The two seams the URL test cannot read (10-28: 成语接龙's dictionary, 对对子's tones, the 古七/古八 拼图's places and
// 华容道's 扣子/瓦砾 sets were all missing from the phone): a module's fetch of a world file by a folder URL
// (`fetch(new URL('chengyu.json', WORLD))`), and the art a board is DEALT (a task's `deal`, a games.json row's data).
const shipped = (id) => { const { common, games } = kitPacks(); return new Set([...common, ...(games[id] ?? [])]); };
test('every world file a kit module fetches by a folder URL is in its packs', () => {
  for (const id of kitGames()) {
    const have = shipped(id), mod = KIT.games[id].module;
    for (const f of [mod, ...(KIT.games[id].modules ?? [])]) {
      const text = fs.readFileSync(path.join(SKILL, f), 'utf8');
      const world = /const WORLD = new URL\('([^']+)', import\.meta\.url\)/.exec(text)?.[1];
      if (!world) continue;
      const dir = path.posix.normalize(path.posix.join(path.posix.dirname(f), world));
      for (const m of text.matchAll(/fetch\(new URL\('([^']+)', WORLD\)\)/g)) assert.ok(have.has(`${dir}/${m[1]}`.replace(/\/+/g, '/')), `${id}: ${dir}/${m[1]}`);
    }
  }
});

test("the art every kit board is dealt (its tasks' deals, its games.json rows) is in its packs", () => {
  const rows = [...TASKS.filter((t) => t.game && !t.cut).map((t) => [t.game, t.deal]),
    ...JSON.parse(fs.readFileSync(path.join(WORLD, 'games.json'), 'utf8')).games.filter((g) => !g.replaced).map((g) => [g.id, { d: g.data, l: g.levels, a: g.art }])];
  for (const [id, deal] of rows) {
    if (!KIT.games[id]) continue;
    const have = shipped(id), text = JSON.stringify(deal ?? {});
    const named = [...text.matchAll(/"(worlds\/[^"]+\.(?:webp|png|jpg))"/g)].map((m) => m[1]).concat([...text.matchAll(/"(art\/[^"]+\.webp)"/g)].map((m) => `worlds/jiuding/${m[1]}`));
    for (const f of named) if (fs.existsSync(path.join(SKILL, f))) assert.ok(have.has(f), `${id}: ${f}`);
  }
});

test("a board's own name (its meta.name) travels in the table, for the phone's 游戏厅", () => {
  const t = boardsTable().games;
  assert.deepEqual(t.fuqin.name, { zh: '抚琴', en: 'The qin' });
  assert.equal(t.sadou.name.zh, '撒豆成兵');
  assert.equal(t.zhazhai.name.zh, '砸寨');
  assert.ok(Object.entries(t).every(([id, g]) => !id.startsWith('piece-') || !g.name), 'a 大场面 is no tile');
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
  // 卷一's boards (24 games), the fight with every card and creature, and eight 大场面 (10-26 step 2: ~44 MB; step 1's
  // 第一回 alone was ~17.8 MB). The phone keeps them bundled until ~100 MB (doc/lingjing-phone.md, decided 10-26).
  // 10-27: + the camera 结印's pack (the hand model, ~19 MB).
  assert.ok(bytes < 76 * 1024 * 1024, `all packs ${bytes} B`);
});

test('nothing outside the kit: no other game, no art of another board, within a budget', () => {
  assert.ok(files.every((f) => !f.startsWith('scripts/games/zhazhai/') && !f.startsWith('scripts/games/sadou') && !f.startsWith('worlds/jiuding/chapters/')));
  // The camera 结印 (10-27): its own pack, loaded on demand — never in a board's pack or the common one.
  for (const id of kitGames().filter((g) => g !== 'jieyin')) assert.ok(!boardFiles(id).includes('scripts/games/jieyin/helper.js'), `${id} carries the 结印 helper`);
  assert.ok(!set.has('scripts/games/jieyin/helper.js'), 'the 守墙关 kit carries the 结印 helper');
  const { common, games } = kitPacks();
  assert.ok(games.jieyin.includes('scripts/games/jieyin/helper.js') && games.jieyin.includes('scripts/vendor/mediapipe/hand_landmarker.task'), 'the 结印 pack holds the helper and the hand model');
  assert.ok(!common.some((f) => f.startsWith('scripts/vendor/mediapipe/')), 'the hand model stays out of the common pack');
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(SKILL, f)).size, 0);
  // 守墙关 with the shared kit: since step 2 every bed of the sound kit is shared (4.2 MB of it).
  assert.ok(bytes < 10 * 1024 * 1024, `kit is ${bytes} B`);
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
