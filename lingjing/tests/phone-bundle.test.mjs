// tests/phone-bundle.test.mjs — the phone's rules (tools/phone-bundle.mjs) answer exactly what rules.mjs answers.
//
// The bundle is built, loaded into a BARE JS context (node:vm with no globals: no require, no process, no fs — what
// JavaScriptCore in the phone app is), and a scripted walk through 第一回 is played on it and, call for call, on the
// real command line (`node scripts/rules.mjs`, the page's own door). Every answer and the save they leave must match.
// esbuild is a dev dependency of tools/phone (never committed): installed on demand, the test skips if it cannot be.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { bookFiles, buildPhoneBundle, esbuildOf, placesOf, worldFiles } from '../tools/phone-bundle.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-10-23T08:00:00Z';

async function builder() {
  if (!(await esbuildOf())) {
    try { execFileSync('npm', ['ci', '--silent', '--prefix', path.join(SKILL, 'tools/phone')], { stdio: 'pipe', timeout: 180_000 }); } catch { /* offline */ }
  }
  return (await esbuildOf()) ? buildPhoneBundle : null;
}

/* Not carried by the bundle, on purpose: guide/*.md (what Ling is handed — the phone has no Ling reader, so no `--for=ling`
   walk), sibling skills' SKILL.md (rules/chores.mjs) and the verbs that shell out (`changes`, `revert`). If the phone's
   Yinyue ever asks the rules `--for=yinyue`, that path needs its own parity check.
   The walk: fresh → 00-shiao (the passage, 接雨 won) → 00-baicai (the passage, 守白菜 won) → the evening. */
const WALK = [
  ['init', {}],
  ['look', {}],
  ['tell', {}],
  ['win', { id: 'rain-basins' }],
  ['task', { action: 'done', id: 'rain-basins' }],
  ['tell', {}],
  ['resolve', { exit: 'begin' }],
  ['look', {}],
  ['tell', {}],
  ['win', { id: 'baicai-hens', stars: 3 }],
  ['task', { action: 'done', id: 'baicai-hens' }],
  ['look', {}],
  ['resolve', { exit: 'evening' }],
  ['tell', {}],
  ['look', {}],
  ['progress', {}],
  ['story', {}],
  ['undo', {}],
  ['look', {}],
  ['resolve', { exit: 'nowhere' }], // a refusal says the same
];

/* The run id is a fresh random on every play (rules/files.mjs newRun): everything else must be equal. */
const same = (text) => text.replace(/"run":"[0-9a-f]{12}"/g, '"run":"RUN"');

function oracle(dir) {
  const env = { ...process.env, LINGJING_DATA: path.join(dir, 'data'), LINGJING_QUESTS: path.join(dir, 'quests'), LINGJING_NOW: NOW, LINGJING_SAVE: '' };
  fs.mkdirSync(env.LINGJING_QUESTS, { recursive: true });
  return (verb, args = {}, { reader, save } = {}) => {
    const argv = Object.entries(args).map(([k, v]) => `--${k}=${v}`);
    if (reader) argv.push(`--for=${reader}`);
    if (save) argv.push(`--save=${save}`);
    return execFileSync('node', [path.join(SKILL, 'scripts/rules.mjs'), verb, ...argv], { env, encoding: 'utf8' }).trim();
  };
}

test('the phone bundle plays 第一回 exactly as rules.mjs does, in a bare JS context', async (t) => {
  const build = await builder();
  if (!build) return t.skip('esbuild is not installed (npm ci in lingjing/tools/phone)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-bundle-'));
  const out = await build({ out: path.join(tmp, 'bundle') });

  const ctx = vm.createContext({});
  assert.deepEqual(Object.keys(ctx), [], 'a bare context');
  vm.runInContext(fs.readFileSync(out.rules, 'utf8'), ctx);
  const phone = ctx.Lingjing;
  phone.load(fs.readFileSync(out.world, 'utf8'));
  phone.env('LINGJING_NOW', NOW);
  const cli = oracle(tmp);

  for (const [verb, args, opts] of WALK) {
    const a = same(phone.call(verb, args, opts)), b = same(cli(verb, args, opts));
    assert.equal(a, b, `${verb} ${JSON.stringify(args)} ${opts?.reader ?? ''}`);
  }
  // The walk ends where the story is: the save the phone holds is the file the command line left.
  const files = JSON.parse(phone.dump());
  assert.equal(same(files['/data/state.json']), same(fs.readFileSync(path.join(tmp, 'data/state.json'), 'utf8')), 'the same save');
  assert.equal(same(files['/data/log.jsonl'] ?? ''), same(fs.readFileSync(path.join(tmp, 'data/log.jsonl'), 'utf8')), 'the same log');
  const look = JSON.parse(phone.look());
  assert.equal(look.scene.id, '00-baicai', 'undo took back the evening');

  // A scratch save seeded to the board (`seed --at`) plays the same too.
  for (const [verb, args, opts] of [['seed', { from: 'fresh', at: '00-baicai' }, { save: 't1' }], ['look', {}, { save: 't1' }], ['win', { id: 'baicai-hens', stars: 2 }, { save: 't1' }], ['look', {}, { save: 't1' }]]) {
    const a = same(phone.call(verb, args, opts)), b = same(cli(verb, args, opts));
    assert.equal(a, b, `${verb} ${JSON.stringify(args)} (seeded)`);
  }
  // The rest of 第一回 as the phone plays it (step 1): a board's grade and stars, a choice with its passage, a thing
  // looked at that opens the way (00-heisong), the teaching 斗法's door and the moves the rules replay (00-fox), two
  // boards in one scene and a way chosen by a grade (00-cave), a board left (讨饼债, 「算了，往下走」) and the way on.
  const REST = [
    ['seed', { from: 'fresh', at: '00-masan' }], ['look', {}], ['tell', {}], ['look', { at: 'bowls' }],
    ['win', { id: 'masan-taunt', stars: 3 }], ['task', { action: 'done', id: 'masan-taunt' }], ['resolve', { exit: 'endure' }], ['tell', {}], ['look', {}],
    ['win', { id: 'masan-zaotai', stars: 2 }], ['task', { action: 'done', id: 'masan-zaotai' }], ['resolve', { exit: 'endure' }], ['tell', {}],
    ['seed', { from: 'fresh', at: '00-heisong' }], ['tell', {}], ['resolve', { exit: 'carve' }], ['look', { at: 'stone' }], ['resolve', { exit: 'carve' }], ['tell', {}],
    ['seed', { from: 'fresh', at: '00-fox' }], ['tell', {}], ['duel', { id: 'fox-bite' }], ['resolve', { exit: 'save' }], ['duel', { id: 'fox-bite', picks: 'end,end,end' }],
    ['resolve', { exit: 'save' }], ['tell', {}], ['look', {}],
    ['win', { id: 'bread-share', grade: 'most', stars: 2 }], ['win', { id: 'cave-fire', stars: 3 }], ['task', { action: 'done', id: 'cave-fire' }],
    ['win', { id: 'bread-share', grade: 'most', stars: 2 }], ['task', { action: 'done', id: 'bread-share' }], ['resolve', { exit: 'keep' }], ['resolve', { exit: 'share' }], ['tell', {}],
    ['look', {}], ['task', { action: 'skip', id: 'yinyue-what' }], ['resolve', { exit: 'follow' }], ['tell', {}], ['look', {}],
  ];
  for (const [verb, args] of REST) {
    const a = same(phone.call(verb, args, { save: 't2' })), b = same(cli(verb, args, { save: 't2' }));
    assert.equal(a, b, `${verb} ${JSON.stringify(args)} (the rest of 第一回)`);
  }
  const end = JSON.parse(phone.call('look', {}, { save: 't2' }));
  assert.equal(end.scene.id, '00-cliff', '第一回 played through to 第二回');
  // Saves survive a restart of the engine: dump → a new context → restore → the same Look.
  const again = vm.createContext({});
  vm.runInContext(fs.readFileSync(out.rules, 'utf8'), again);
  again.Lingjing.load(fs.readFileSync(out.world, 'utf8'));
  again.Lingjing.env('LINGJING_NOW', NOW);
  again.Lingjing.restore(phone.dump());
  assert.equal(same(again.Lingjing.look()), same(phone.look()), 'a restored save looks the same');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('the world file carries the world as JSON text, no art', () => {
  const files = worldFiles();
  const names = Object.keys(files);
  assert.ok(names.length > 100 && names.every((n) => (n.endsWith('.json') || n === '/lj/scripts/battle.js') && !n.includes('/art/')), 'json only (and the fight engine for its stamp), no art');
  assert.ok(names.includes('/lj/worlds/jiuding/levels/shouqiang.json') && names.includes('/lj/worlds/jiuding/games.json'));
  for (const [n, text] of Object.entries(files)) if (n.endsWith('.json')) JSON.parse(text);
});

test("银月's place in the game, as SKILL.md gives it, travels for the phone's own Yinyue (讨饼债)", () => {
  const { yinyue } = placesOf();
  assert.ok(yinyue && yinyue.includes('Lingjing') && yinyue.includes('本王') && !yinyue.includes('\n'), yinyue);
});

test("the novel travels for the phone's 读原著: every 回 book.json names, its text whole", () => {
  const { book, files } = bookFiles();
  const hui = book.volumes.flatMap((v) => v.hui);
  assert.ok(hui.length >= 10);
  for (const h of hui) assert.ok(files[h.file]?.length > 1000, `${h.id}: ${h.file}`);
  assert.ok(Object.keys(files).every((f) => !f.includes('..') && f.endsWith('.md')));
});
