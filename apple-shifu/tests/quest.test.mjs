// Shifu's quest facts: the menu, each chore's own done time, merged per id and
// written whole under a scratch HOME — and never what a scan found.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'quest.sh');
const scratch = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shifu-quest-')));
const run = (home, args, env = {}) => spawnSync('bash', [SH, ...args], {
  encoding: 'utf8', env: { ...process.env, HOME: home, SHIFU_DATA: '', SHIFU_QUESTS: '', ...env },
});
const fileOf = (home) => path.join(home, '.linggen', 'quests', 'apple-shifu.json');
const read = (home) => JSON.parse(fs.readFileSync(fileOf(home), 'utf8'));
const byId = (doc) => Object.fromEntries(doc.quests.map((q) => [q.id, q]));

test('the menu: every entry in the protocol shape, each in the pool', () => {
  const home = scratch();
  const res = run(home, []);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '', 'prints nothing');
  const doc = read(home);
  assert.equal(doc.app, 'apple-shifu');
  const ids = doc.quests.map((q) => q.id);
  assert.deepEqual(ids, ['shifu-scan', 'shifu-security', 'shifu-clear', 'shifu-backup']);
  for (const q of doc.quests) {
    assert.ok(['day', 'week'].includes(q.period), q.id);
    assert.ok(['mac', 'phone', 'both'].includes(q.device), q.id);
    assert.equal(q.pool, true, q.id);
    assert.equal(q.due, true, q.id);
    assert.ok(q.reward >= 20 && q.reward <= 30 && q.stamina >= 10 && q.stamina <= 20, q.id);
    assert.ok(q.title.zh && q.title.en && q.open.startsWith('/apps/apple-shifu/'), q.id);
  }
  assert.match(byId(doc)['shifu-scan'].done_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/, 'no id is the old caller: a scan');
  assert.equal(byId(doc)['shifu-clear'].done_at, null);
  assert.ok(fs.readFileSync(fileOf(home), 'utf8').includes('扫尘'), 'written as UTF-8');
  fs.rmSync(home, { recursive: true, force: true });
});

test('a stamp sets its own done_at and keeps every other id, known or not', () => {
  const home = scratch();
  fs.mkdirSync(path.dirname(fileOf(home)), { recursive: true });
  fs.writeFileSync(fileOf(home), JSON.stringify({
    app: 'apple-shifu',
    quests: [{ id: 'shifu-scan', done_at: '2026-09-20T09:00:00Z' }, { id: 'elsewhere', x: 1 }],
  }));
  run(home, ['shifu-clear']);
  const q = byId(read(home));
  assert.equal(q['shifu-scan'].done_at, '2026-09-20T09:00:00Z');
  assert.ok(q['shifu-clear'].done_at);
  assert.equal(q['shifu-backup'].done_at, null);
  assert.deepEqual(q.elsewhere, { id: 'elsewhere', x: 1 });
  assert.deepEqual(fs.readdirSync(path.dirname(fileOf(home))), ['apple-shifu.json'], 'no temp file left behind');
  fs.rmSync(home, { recursive: true, force: true });
});

test('an unknown id or a torn file never breaks the file; a failure is silent', () => {
  const home = scratch();
  run(home, ['shifu-security']);
  const before = fs.readFileSync(fileOf(home), 'utf8');
  const res = run(home, ['shifu-nope']);
  assert.equal(res.status, 0);
  assert.equal(fs.readFileSync(fileOf(home), 'utf8'), before, 'an unknown id writes nothing');
  fs.writeFileSync(fileOf(home), '{"app":"apple-shifu","que');
  run(home, ['shifu-backup']);
  assert.ok(byId(read(home))['shifu-backup'].done_at, 'a torn file starts again');
  const blocked = run(home, ['shifu-scan'], { SHIFU_QUESTS: '/dev/null/nope' });
  assert.equal(blocked.status, 0);
  assert.equal(blocked.stdout + blocked.stderr, '');
  fs.rmSync(home, { recursive: true, force: true });
});

test('a test mirror (SHIFU_DATA) writes beside itself, never the real file', () => {
  const home = scratch();
  const data = path.join(home, 'mirror');
  run(home, ['shifu-scan'], { SHIFU_DATA: data });
  assert.ok(fs.existsSync(path.join(data, 'quests', 'apple-shifu.json')));
  assert.ok(!fs.existsSync(fileOf(home)));
  fs.rmSync(home, { recursive: true, force: true });
});

test('a record read later carries its own time, and never moves a done time back', () => {
  const home = scratch();
  run(home, ['shifu-backup', '2026-09-20T09:00:00Z']);
  assert.equal(byId(read(home))['shifu-backup'].done_at, '2026-09-20T09:00:00Z');
  run(home, ['shifu-backup', '2026-09-19T09:00:00Z']);
  assert.equal(byId(read(home))['shifu-backup'].done_at, '2026-09-20T09:00:00Z', 'an older record changes nothing');
  run(home, ['shifu-backup', 'yesterday; rm -rf /']);
  assert.equal(byId(read(home))['shifu-backup'].done_at, '2026-09-20T09:00:00Z', 'a malformed time writes nothing');
  run(home, ['shifu-backup']);
  assert.ok(byId(read(home))['shifu-backup'].done_at > '2026-09-20T09:00:00Z', 'a stamp now moves it on');
  fs.rmSync(home, { recursive: true, force: true });
});

test('the photo pipeline: a finished backup stamps; the phone\'s archive is read on the next scan', () => {
  const home = scratch();
  const media = path.join(home, '.linggen', 'skills', 'apple-shifu', 'data', 'media');
  fs.mkdirSync(media, { recursive: true });
  // Local time with no zone — how the engine and the pipeline both write `at`.
  fs.writeFileSync(path.join(media, 'archive.jsonl'),
    `${JSON.stringify({ sha256: 'a', at: '2026-09-20T09:00:00' })}\n${JSON.stringify({ sha256: 'b', at: '2999-01-01T00:00:00' })}\n{"torn`);
  const py = (code) => spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(path.join(path.dirname(SH), 'media'))}); import media_pipeline as m; ${code}`], {
    encoding: 'utf8', env: { ...process.env, HOME: home, SHIFU_DATA: '', SHIFU_QUESTS: '' },
  });
  let res = py('m.witness_archive()');
  assert.equal(res.status, 0, res.stderr);
  const at = byId(read(home))['shifu-backup'].done_at;
  assert.equal(new Date(at).getTime(), new Date('2026-09-20T09:00:00').getTime(), 'local time, written as UTC; the future row ignored');
  res = py("m.stamp_quest('failed', 3); m.stamp_quest('done', 0)");
  assert.equal(byId(read(home))['shifu-backup'].done_at, at, 'a failed or empty run is not a backup');
  res = py("m.stamp_quest('done', 3)");
  assert.ok(byId(read(home))['shifu-backup'].done_at > at);
  assert.equal(byId(read(home))['shifu-scan'].done_at, null);
  fs.rmSync(home, { recursive: true, force: true });
});

test('the engine door: stamp <id> <when> exits 0 once held, 1 when it could not', () => {
  const home = scratch();
  assert.equal(run(home, ['stamp', 'shifu-clear', '2026-09-24T14:03:11Z']).status, 0);
  assert.equal(byId(read(home))['shifu-clear'].done_at, '2026-09-24T14:03:11Z');
  assert.equal(run(home, ['stamp', 'shifu-clear', '2026-09-20T14:03:11Z']).status, 0, 'a later time stands');
  assert.equal(byId(read(home))['shifu-clear'].done_at, '2026-09-24T14:03:11Z', 'never moved back');
  for (const args of [['stamp', 'shifu-nope', '2026-09-24T14:03:11Z'], ['stamp', 'shifu-clear', '2026-09-24'],
    ['stamp', 'shifu-clear'], ['stamp']]) {
    assert.equal(run(home, args).status, 1, args.join(' '));
  }
  assert.equal(run(home, ['stamp', 'shifu-clear', '2026-09-25T00:00:00Z'], { SHIFU_QUESTS: '/dev/null/nope' }).status, 1);
  fs.rmSync(home, { recursive: true, force: true });
});
