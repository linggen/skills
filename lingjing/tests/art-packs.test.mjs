// tools/art-packs.mjs: which pack each file of worlds/jiuding/art/ belongs to (the package keeps 00-prologue,
// 00-waimen and what the whole game shares; the rest is fetched after install). Every file gets exactly one pack,
// every file the data names exists, the answer is the same on every run, the first chapter's places are core, and
// the packs rise with the story. It does NOT assert that nothing is `unplaced`: the list is the work a play test
// settles later, and `--check` rightly exits 1 until then.
//
//   node --test tests/art-packs.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildArtPacks, UNPLACED_ORDER } from '../tools/art-packs.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(SKILL, 'worlds/jiuding/art');
const TMP = [];
after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });

const listArt = (d = ART) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listArt(path.join(d, e.name)) : [path.relative(SKILL, path.join(d, e.name)).split(path.sep).join('/')]));
const res = buildArtPacks(SKILL);
const byPath = new Map(res.files.map((f) => [f.path, f]));

test('every art file on disk gets exactly one pack, an order and a reason', () => {
  const disk = listArt().sort();
  assert.deepEqual(res.files.map((f) => f.path).sort(), disk);
  assert.equal(byPath.size, disk.length, 'no path twice');
  for (const f of res.files) {
    assert.match(f.pack, /^(core|unplaced|ch-\d\d-[a-z]+)$/, f.path);
    assert.ok(Number.isInteger(f.order) && f.bytes > 0 && f.why, f.path);
    assert.equal(f.bytes, fs.statSync(path.join(SKILL, f.path)).size);
  }
});

test('every file the data and the set pieces name exists on disk', () => {
  assert.deepEqual(res.missing, []);
});

test('the output is identical on two runs, as data and as the CLI prints it', () => {
  assert.deepEqual(buildArtPacks(SKILL).files, res.files);
  const run = () => spawnSync(process.execPath, [path.join(SKILL, 'tools/art-packs.mjs'), '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const a = run(), b = run();
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stdout, b.stdout);
  assert.deepEqual(JSON.parse(a.stdout).files, res.files);
});

test('core holds the art of the first chapter\'s places (read from the data: scene 00-baicai stands at shiao, 00-dusk in 你家, 00-fox at yingu)', () => {
  for (const f of ['places/shiao.webp', 'places/shiao-home.webp', 'places/yingu.webp']) {
    assert.equal(byPath.get(`worlds/jiuding/art/${f}`)?.pack, 'core', f);
  }
  const scenes = (id) => JSON.parse(fs.readFileSync(path.join(SKILL, `worlds/jiuding/chapters/00-prologue/scenes/${id}.json`), 'utf8'));
  assert.equal(scenes('00-baicai').at, 'shiao');
  assert.match(scenes('00-dusk').place.zh, /家中|你家/);
  assert.equal(scenes('00-fox').at, 'yingu');
});

test('what the whole game shares is core: weather, 节气, festivals, cards, the map', () => {
  for (const prefix of ['backdrop/clear-day', 'jieqi/lichun', 'festival/chuxi', 'cards/xiaoyao', 'map/jiuzhou-ink']) {
    const hit = res.files.find((f) => f.path.startsWith(`worlds/jiuding/art/${prefix}`));
    assert.equal(hit?.pack, 'core', prefix);
  }
});

test('packs rise with the story: a later chapter has a bigger order; core is 0, unplaced is last', () => {
  const order = new Map();
  for (const f of res.files) { if (order.has(f.pack)) assert.equal(order.get(f.pack), f.order, f.pack); order.set(f.pack, f.order); }
  assert.equal(order.get('core'), 0);
  if (order.has('unplaced')) assert.equal(order.get('unplaced'), UNPLACED_ORDER);
  const chapters = [...order].filter(([p]) => p.startsWith('ch-')).sort(([a], [b]) => (a < b ? -1 : 1));
  chapters.forEach(([, o], i) => { assert.ok(o > 0 && (i === 0 || o > chapters[i - 1][1])); });
  assert.equal(order.get('ch-00-zhuji'), 10);
  assert.ok(order.get('ch-01-ji') > order.get('ch-00-zhuji'));
});

test('a place of a later chapter is not core: 漳水南岸 (zhangnan, scene 01-arrive, 01-ji\'s first) is ch-01-ji', () => {
  assert.equal(byPath.get('worlds/jiuding/art/places/zhangnan.webp')?.pack, 'ch-01-ji');
});

test('--check exits 1 exactly when something is unplaced or missing, and says what', () => {
  const r = spawnSync(process.execPath, [path.join(SKILL, 'tools/art-packs.mjs'), '--check'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const unplaced = res.files.filter((f) => f.pack === 'unplaced').length;
  assert.equal(r.status, unplaced || res.missing.length ? 1 : 0);
  assert.match(r.stderr, new RegExp(`${unplaced} unplaced, ${res.missing.length} missing`));
});

test('a picture the data names but the disk lacks is reported missing (on a copy with one file gone)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'art-packs-'));
  TMP.push(dir);
  const copy = path.join(dir, 'lingjing');
  for (const rel of ['scripts', 'tools', 'worlds/jiuding']) { // links to everything but the art, whose files are links too
    fs.mkdirSync(path.join(copy, path.dirname(rel)), { recursive: true });
    if (rel !== 'worlds/jiuding') { fs.symlinkSync(path.join(SKILL, rel), path.join(copy, rel)); continue; }
    fs.mkdirSync(path.join(copy, rel));
    for (const e of fs.readdirSync(path.join(SKILL, rel))) if (e !== 'art') fs.symlinkSync(path.join(SKILL, rel, e), path.join(copy, rel, e));
  }
  for (const rel of listArt()) {
    const to = path.join(copy, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (rel !== 'worlds/jiuding/art/places/shiao.webp') fs.symlinkSync(path.join(SKILL, rel), to);
  }
  const bad = buildArtPacks(copy);
  // exactly that one: the linked copy reads the same as the real tree, so nothing else is reported
  assert.deepEqual(bad.missing.map((m) => m.path), ['art/places/shiao.webp']);
  assert.equal(bad.files.length, res.files.length - 1);
  assert.deepEqual(bad.files.map((f) => [f.path, f.pack]), res.files.filter((f) => f.path !== 'worlds/jiuding/art/places/shiao.webp').map((f) => [f.path, f.pack]));
});
