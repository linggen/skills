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

test('a draft 回 never ships: cut from the packed index, its text never packed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-book-'));
  const dir = path.join(root, 'b');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({ volumes: [{ id: 'v1', hui: [
    { id: 'h01', line: 'gu', file: '01.md' }, { id: 'h02', line: 'gu', file: '02.md', draft: true }, { id: 'h03', line: 'gu', file: '03.md' }] }] }));
  for (const f of ['01.md', '02.md', '03.md']) fs.writeFileSync(path.join(dir, f), `# ${f}`);
  const { book, files } = bookFiles({ book: 'b', root });
  assert.deepEqual(book.volumes[0].hui.map((h) => h.id), ['h01', 'h03']);
  assert.deepEqual(Object.keys(files).sort(), ['01.md', '03.md']);
});

test("银月's word at a page moment travels in the bundle: 灵石 short on the shelf, her mode, the facts and the Mac's own pool", async (t) => {
  const build = await builder();
  if (!build) return t.skip('esbuild is not installed (npm ci in lingjing/tools/phone)');
  const { poolOf } = await import('../scripts/hersay.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-her-'));
  const out = await build({ out: path.join(tmp, 'bundle') });
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(out.rules, 'utf8'), ctx);
  const her = (kind, look, opts) => JSON.parse(ctx.Lingjing.her(kind, JSON.stringify(look), opts));
  const shelf = [{ id: 'huichun', name: '回春丹', buy: 60 }, { id: 'tie', name: '铁蒺藜', buy: 40 }];
  const look = { wealth: 30, companion: { joined: true }, place: { shelf }, haggle: { marks: { huichun: { short: 30, reach: 'can' }, tie: { short: 10, reach: 'far' } } } };
  const awake = her('short', look, { lang: 'zh' });
  assert.equal(awake.mode, 'awake');
  assert.equal(awake.id, 'huichun', 'one 砍价 could close comes first');
  assert.ok(awake.facts.startsWith('他想买回春丹（60灵石），手上只有30，差30。砍价能砍下来'), awake.facts);
  assert.deepEqual(awake.pool, poolOf('short', { mode: 'awake', lang: 'zh' }));
  const far = her('short', { ...look, haggle: { marks: { tie: { short: 10, reach: 'far' } } } }, { lang: 'zh' });
  assert.deepEqual(far.pool, poolOf('short', { mode: 'awake', lang: 'zh', variant: 'far' }));
  const asleep = her('short', { ...look, companion: { joined: true, asleep: true } }, { lang: 'en' });
  assert.deepEqual(asleep.pool, poolOf('short', { mode: 'asleep', lang: 'en' }));
  assert.equal(her('short', { ...look, companion: null }), null, 'not met: silent');
  assert.equal(her('short', { ...look, haggle: { marks: {} } }), null, 'nothing short: silent');
  // 秘境探险: the facts from the rules' own answer (hersay.js mijingWhat), the Mac's pool; an answer with none, silent.
  const way = her('mijing', look, { lang: 'zh', result: { ok: true, line: '袋子到手。', hp: 3 } });
  assert.ok(way.facts.startsWith('袋子到手。，气血+3'), way.facts);
  assert.deepEqual(way.pool, poolOf('mijing', { mode: 'awake', lang: 'zh' }));
  assert.ok(her('mijing', look, { lang: 'zh', result: { ended: 'left', last: { name: '一重 · 凶崖', how: 'left', reached: 1 } } }).facts.startsWith('一重 · 凶崖，退了出来'));
  assert.equal(her('mijing', look, { lang: 'zh', result: { ok: true, room: '1a' } }), null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('开府 on the phone: the host hands in the quests, the list is the phone\'s own six, a paired Mac adds its four', async (t) => {
  const build = await builder();
  if (!build) return t.skip('esbuild is not installed (npm ci in lingjing/tools/phone)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-kaifu-'));
  const out = await build({ out: path.join(tmp, 'bundle') });
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(out.rules, 'utf8'), ctx);
  const L = ctx.Lingjing;
  L.load(fs.readFileSync(out.world, 'utf8'));
  L.env('LINGJING_NOW', NOW);
  const S = { save: 'kf' };
  assert.equal(JSON.parse(L.call('seed', { from: 'fresh', at: '00-waimen' }, S)).ok, true);
  const row = (id, device, done = null) => ({ id, period: 'once', due: true, reward: 50, stamina: 20, device, open: '/', title: { zh: id, en: id }, done_at: done });
  const phone = ['linggen-chat:both', 'linggen-ask-news:both', 'cfo-open:both', 'dj-play:both', 'health-open:phone', 'linggen-notify:phone', 'linggen-pair:pair'].map(x => row(...x.split(':')));
  assert.deepEqual(JSON.parse(L.quests({ phone: { app: 'linggen', quests: phone } })), ['phone.json']);
  const list = () => { const r = JSON.parse(L.call('quest', { action: 'kaifu' }, S)); assert.ok(r.kaifu, JSON.stringify(r)); return r.kaifu; };
  const ids = list().map(k => k.id);
  assert.deepEqual(ids, ['linggen-chat', 'linggen-ask-news', 'cfo-open', 'dj-play', 'health-open', 'linggen-notify']);
  const mac = ['linggen-voice:mac', 'shifu-scan-first:mac', 'linggen-image:mac', 'linggen-pair:pair'].map(x => row(...x.split(':')));
  mac[3].done_at = '2026-10-20T08:00:00Z';
  L.quests({ linggen: { app: 'linggen', quests: mac } });
  assert.equal(list().length, 10, 'paired: 结缘 and the Mac\'s rows');
  L.quests({ linggen: null });
  assert.equal(list().length, 6);
});
