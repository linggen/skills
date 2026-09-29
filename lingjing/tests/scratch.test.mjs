// 测试存档 — the scratch save for live checks (rules/files.mjs, rules.js
// SCRATCH, the page's ?save=test). A check plays data/saves/<name>/ and
// never touches the player's own state.json or log.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { flagsOf } from '../scripts/rules.js';

const ROOT = path.resolve(import.meta.dirname, '..');

function sandbox() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-scratch-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'q'), LINGJING_NOW: '2026-09-29T10:00:00Z' };
  delete env.LINGJING_SAVE;
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout.trim().split('\n').pop());
  return { data, cli, done: () => fs.rmSync(data, { recursive: true, force: true }) };
}
const stamp = (file) => (fs.existsSync(file) ? { text: fs.readFileSync(file, 'utf8'), mtime: fs.statSync(file).mtimeMs } : null);

test('a scratch write never touches data/state.json or data/log.jsonl', () => {
  const { data, cli, done } = sandbox();
  try {
    cli('look'); // the player's own save, begun
    cli('lang', '--lang=zh');
    const real = stamp(path.join(data, 'state.json')), log = stamp(path.join(data, 'log.jsonl'));
    assert.ok(real, 'the real save exists');
    const r = cli('look', '--save=test');
    assert.notEqual(r.ok, false);
    assert.equal(cli('lang', '--lang=en', '--save=test').ok, true);
    const scratch = JSON.parse(fs.readFileSync(path.join(data, 'saves', 'test', 'state.json'), 'utf8'));
    assert.equal(scratch.lang, 'en');
    assert.ok(fs.existsSync(path.join(data, 'saves', 'test', 'log.jsonl')), 'its own log');
    assert.deepEqual(stamp(path.join(data, 'state.json')), real, 'state.json untouched');
    assert.deepEqual(stamp(path.join(data, 'log.jsonl')), log, 'log.jsonl untouched');
    assert.equal(cli('undo', '--save=test').ok, true);
    assert.deepEqual(stamp(path.join(data, 'state.json')), real, 'undo in scratch stays in scratch');
  } finally {
    done();
  }
});

test('seed: fresh, a copy of the real save (read-only), or a fixture — only in a scratch save', () => {
  const { data, cli, done } = sandbox();
  try {
    cli('look');
    cli('lang', '--lang=en');
    const real = stamp(path.join(data, 'state.json'));
    assert.equal(cli('seed', '--from=real').refused, 'not-scratch', 'never over the real save');
    const seeded = cli('seed', '--from=real', '--save=t2');
    assert.equal(seeded.ok, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'saves', 't2', 'state.json'), 'utf8')).lang, 'en');
    cli('lang', '--lang=zh', '--save=t2');
    assert.deepEqual(stamp(path.join(data, 'state.json')), real, 'the copy is read, never written back');
    assert.equal(cli('seed', '--from=fresh', '--save=t2').ok, true);
    assert.equal(fs.existsSync(path.join(data, 'saves', 't2', 'state.json')), false, 'fresh: begins from the start');
    assert.equal(cli('seed', '--from=../../x', '--save=t2').refused, 'no-seed');
    assert.equal(cli('seed', '--from=nope', '--save=t2').refused, 'no-seed');
  } finally {
    done();
  }
});

test('a save name is one plain word: a path is refused before anything is read', () => {
  const { data, cli, done } = sandbox();
  try {
    assert.equal(cli('look', '--save=../x').refused, 'bad-save');
    assert.equal(cli('look', '--save=a/b').refused, 'bad-save');
    assert.equal(fs.existsSync(path.join(data, 'state.json')), false);
  } finally {
    done();
  }
});

test('the page: every verb carries --save, and scratch mode never opens the chat or tells 银月', () => {
  assert.deepEqual(flagsOf({ id: 'x' }, 'test'), ['--id=x', '--save=test']);
  assert.deepEqual(flagsOf({ id: 'x' }, null), ['--id=x']);
  const page = fs.readFileSync(path.join(ROOT, 'scripts', 'lingjing.js'), 'utf8');
  const body = (name) => page.slice(page.indexOf(`function ${name}(`), page.indexOf('\n}\n', page.indexOf(`function ${name}(`)));
  assert.match(body('mountChat'), /if \(SCRATCH\)[^\n]*return false;/, 'no chat mounted: no opening, no recap');
  assert.match(page, /post: \(id, fact, flags, opts\) => \(SCRATCH \? Promise\.resolve\(false\)/, 'no 银月 events');
  assert.match(body('deliver'), /if \(SCRATCH\)/, 'no message to Ling');
  assert.match(body('readCloud'), /if \(SCRATCH\) return/, 'no cloud sync');
  assert.match(page, /测试存档/, 'the badge');
});
