// A save from newer rules is never written and never migrated (rules/newer.mjs, 2026-11-11). Reproduced that day: v17
// rules given a v18 save went on playing it — 闭关 paid 24 修为 where v18 pays 10, the 丹田 banked 27 where v18 banks 11,
// a 层 stepped at v17's mark — and wrote it back still saying 18, so no later reader could tell. The law locked here:
// every verb on a save newer than these rules answers `newer-save` and the file is left byte for byte; the page shows
// one calm screen; the phone's sync is handed the newest version these rules play. Scratch dirs only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_VERSION, migrate, NewerSave } from '../scripts/state.mjs';
import { NEWER_SAY, newerVersion } from '../scripts/rules/newer.mjs';
import { WORDS } from '../scripts/cards.js';
import { newest, resolved } from '../tools/further.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULES = path.join(ROOT, 'scripts', 'rules.mjs');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'saves', 'waimen.json'), 'utf8'));
const save = (v) => ({ ...(base.state ?? base), version: v });

function scratch(state, name = 'newer') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lingjing-${name}-`));
  if (state) fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state));
  return dir;
}
function verb(dir, args, env = {}) {
  const out = execFileSync(process.execPath, [RULES, ...args], {
    env: { ...process.env, LINGJING_DATA: dir, LINGJING_QUESTS: path.join(dir, 'quests'), LINGJING_SAVE: '', LINGJING_CLOUD: '0', ...env },
    encoding: 'utf8', timeout: 30000, maxBuffer: 64 << 20,
  });
  return JSON.parse(out.trim().split('\n').pop());
}
const files = (dir) => Object.fromEntries(fs.readdirSync(dir, { recursive: true }).sort().map((f) => [f, fs.statSync(path.join(dir, f)).isFile() ? fs.readFileSync(path.join(dir, f), 'utf8') : 'dir']));

/* Every verb the door knows, with arguments a real call would carry: the page's, Ling's and 银月's. */
const CALLS = [
  ['look', '--said=看看'], ['look', '--at=x'], ['progress', '--for=yinyue'], ['story', '--short=true', '--for=ling'],
  ['resolve', '--exit=pay'], ['judge'], ['task', '--action=list'], ['task', '--action=done', '--id=x'], ['win', '--id=mijing-laonian'],
  ['duel', '--id=x'], ['tame'], ['refine'], ['tale'], ['move', '--to=x'], ['trade'], ['make'], ['enter'], ['leave'], ['build'],
  ['worlds'], ['travel', '--world=jiuding'], ['amend'], ['art'], ['go'], ['saves'], ['save'], ['load', '--id=x'], ['forget'],
  ['seclude', '--action=enter', '--focus=progress'], ['seclude', '--action=leave'], ['undo'], ['init'], ['tell'], ['reading'],
  ['hergame'], ['wordboard'], ['gear'], ['quest', '--action=info'], ['divine'], ['track', '--action=status'], ['stats'],
  ['look', '--said=x', '--for=ling'], ['init', '--for=ling'], ['undo', '--for=ling'],
];

test('newerVersion: only a save past STATE_VERSION is newer', () => {
  assert.equal(newerVersion(save(STATE_VERSION + 1)), STATE_VERSION + 1);
  assert.equal(newerVersion(save(STATE_VERSION)), null);
  assert.equal(newerVersion(save(STATE_VERSION - 1)), null);
  assert.equal(newerVersion(null), null);
  assert.equal(newerVersion({}), null);
});

test('migrate never carries a newer save back: it throws, and an older one still carries forward', () => {
  assert.throws(() => migrate(save(STATE_VERSION + 1)), NewerSave);
  assert.equal(migrate(save(STATE_VERSION - 1)).version, STATE_VERSION);
});

test('every verb on a newer save is refused `newer-save` and every file is left byte for byte', () => {
  const dir = scratch(save(STATE_VERSION + 1));
  const before = files(dir);
  for (const args of CALLS) {
    const r = verb(dir, args);
    assert.equal(r.ok, false, args.join(' '));
    assert.equal(r.refused, 'newer-save', `${args.join(' ')}: ${JSON.stringify(r).slice(0, 200)}`);
    assert.deepEqual(files(dir), before, `${args.join(' ')} touched the save`);
  }
});

test('the refusal says why, in the game\'s language, and carries both versions', () => {
  const dir = scratch(save(STATE_VERSION + 3));
  const zh = verb(dir, ['look', '--said=看看']);
  assert.deepEqual(zh, { ok: false, refused: 'newer-save', save_version: STATE_VERSION + 3, rules_version: STATE_VERSION, say: NEWER_SAY.zh });
  assert.equal(verb(dir, ['look', '--said=look'], { LINGGEN_LANGUAGE: 'en' }).say, NEWER_SAY.en);
});

test('a scratch seed from the player\'s own newer save is refused, and neither save is touched', () => {
  const dir = scratch(save(STATE_VERSION + 1));
  const before = files(dir);
  const r = verb(dir, ['seed', '--save=t1', '--from=real']);
  assert.equal(r.refused, 'newer-save');
  assert.deepEqual(files(dir), before);
});

test('a scratch save that is newer is refused like the main one; a main save that is current still plays', () => {
  const dir = scratch(save(STATE_VERSION));
  fs.mkdirSync(path.join(dir, 'saves', 't2'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'saves', 't2', 'state.json'), JSON.stringify(save(STATE_VERSION + 1)));
  assert.equal(verb(dir, ['look', '--said=x', '--save=t2']).refused, 'newer-save');
  assert.equal(verb(dir, ['look', '--said=x']).ok, true);
});

test('a parked save from newer rules never stops the game in play, is never listed, never loaded, never touched', () => {
  const dir = scratch(save(STATE_VERSION));
  fs.mkdirSync(path.join(dir, 'saves'), { recursive: true });
  const parked = { kind: 'slot', id: 'p1', title: 'p', at: '2026-11-11T00:00:00.000Z', state: save(STATE_VERSION + 1) };
  fs.writeFileSync(path.join(dir, 'saves', 'p1.json'), JSON.stringify(parked));
  const shelf = fs.readFileSync(path.join(dir, 'saves', 'p1.json'), 'utf8');
  // Across a day change too (a new day's first move keeps yesterday's save and prunes the shelf).
  for (const now of ['2026-11-11T10:00:00Z', '2026-11-13T10:00:00Z']) {
    assert.equal(verb(dir, ['look', '--said=x'], { LINGJING_NOW: now }).ok, true, `look ${now}`);
    const listed = verb(dir, ['saves'], { LINGJING_NOW: now });
    assert.equal(listed.ok, true);
    assert.ok(!listed.saves.some((x) => x.id === 'p1'), 'not listed');
  }
  const before = fs.readFileSync(path.join(dir, 'state.json'), 'utf8');
  assert.equal(verb(dir, ['load', '--id=p1']).refused, 'newer-save');
  assert.equal(fs.readFileSync(path.join(dir, 'saves', 'p1.json'), 'utf8'), shelf, 'the parked save byte for byte');
  // The game in play is the player's own, current save: a refused load leaves it where it stood (the clock's own
  // `last_seen` stamp aside, which any verb of his writes).
  const { last_seen: _a, ...was } = JSON.parse(before);
  const { last_seen: _b, ...now } = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  assert.deepEqual(now, was, 'the save in play stays as it was');
  assert.ok(fs.existsSync(path.join(dir, 'saves', 'p1.json')), 'the parked save stays');
});

test('the page says the rules\' own words, in both languages, short and plain', () => {
  assert.equal(WORDS.zh.newerSave, NEWER_SAY.zh);
  assert.equal(WORDS.en.newerSave, NEWER_SAY.en);
  assert.ok([...NEWER_SAY.zh].length <= 22, NEWER_SAY.zh); // ≈20: the product name counts seven
  assert.ok(NEWER_SAY.en.split(' ').length <= 12, NEWER_SAY.en);
  const js = fs.readFileSync(path.join(ROOT, 'scripts', 'lingjing.js'), 'utf8');
  assert.match(js, /const newer = newerSave\(e\);\s*if \(newer\) showNewerSave\(\);/, 'a newer-save Look shows the screen');
  assert.match(js, /if \(!authored && !newer\) \$\('focus'\)/, 'and no runtime word is drawn over it');
});

test('the sync rule decides by the version first, and the phone is handed the newest version these rules play', () => {
  const rule = resolved();
  assert.deepEqual(rule.by[0], { number: 'version' });
  assert.deepEqual(newest(rule), { file: 'data/state.json', number: 'version', max: STATE_VERSION });
  assert.equal(newest({ file: 'x', by: [{ count: 'done_scenes' }] }), null);
});
